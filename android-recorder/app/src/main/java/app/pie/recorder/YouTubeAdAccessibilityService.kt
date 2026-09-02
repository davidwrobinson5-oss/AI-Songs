package app.pie.recorder

import android.accessibilityservice.AccessibilityService
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Browser
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class YouTubeAdAccessibilityService : AccessibilityService() {
    private val handler = Handler(Looper.getMainLooper())
    private var adActive = false
    private var adLastSeenAt = 0L
    private var adClearCandidateSince = 0L
    private var hasSeenPlaying = false
    private var pendingStop = false
    private var monitorRunning = false
    private var returnTriggered = false
    private var autoFinishedReceiverRegistered = false
    private var lastBrowserPackage: String? = null
    private var lastLoggedPlayerState: PlayerState? = null

    private val autoFinishedReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != PlaybackCaptureService.ACTION_AUTO_FINISHED) return
            RecorderDiagnostics.record(this@YouTubeAdAccessibilityService, "accessibility_received_auto_finished")
            if (returnTriggered) {
                RecorderDiagnostics.record(this@YouTubeAdAccessibilityService, "auto_finished_return_already_triggered")
                return
            }
            returnTriggered = true
            returnFromYouTube(AUTO_FINISH_RETURN_DELAY_MS)
        }
    }

    private val resumeRunnable = Runnable {
        if (!CaptureSession.isActive(this) || adActive || pendingStop) return@Runnable
        sendCaptureAction(PlaybackCaptureService.ACTION_RESUME)
    }

    private val stoppedRunnable = Runnable {
        if (!CaptureSession.isActive(this) || !pendingStop || adActive || !hasSeenPlaying) return@Runnable
        pendingStop = false
        RecorderDiagnostics.record(this, "youtube_stop_stable_accessibility_auto_stop")
        stopAndReturnToPie()
    }

    private val monitorRunnable = object : Runnable {
        override fun run() {
            if (!CaptureSession.isActive(this@YouTubeAdAccessibilityService)) {
                monitorRunning = false
                return
            }
            inspectCurrentYouTubeWindow()
            handler.postDelayed(this, MONITOR_INTERVAL_MS)
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        isConnected = true
        lastBrowserPackage = rememberedBrowserPackage() ?: preferredInstalledBrowser()
        RecorderDiagnostics.record(this, "accessibility_service_connected browser=${lastBrowserPackage ?: "unknown"}")
        registerAutoFinishedReceiver()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val eventPackage = event?.packageName?.toString()
        if (!eventPackage.isNullOrBlank() && KNOWN_BROWSER_PACKAGES.contains(eventPackage)) {
            if (lastBrowserPackage != eventPackage) {
                rememberBrowserPackage(eventPackage)
                RecorderDiagnostics.record(this, "remember_browser=$eventPackage")
            }
        }

        if (!CaptureSession.isActive(this)) {
            resetState()
            return
        }

        ensureMonitor()
        val packageName = eventPackage ?: return

        if (packageName == SYSTEM_UI_PACKAGE) {
            if (event.eventType == AccessibilityEvent.TYPE_VIEW_CLICKED) {
                val clicked = clickedSnapshot(event)
                if (SYSTEM_STOP_CLICK_MARKERS.any { clicked.contains(it) }) {
                    hasSeenPlaying = true
                    RecorderDiagnostics.record(this, "system_ui_stop_clicked")
                    scheduleStop()
                }
            }
            return
        }

        if (packageName != YOUTUBE_PACKAGE) return

        val root = rootInActiveWindow ?: return
        val snapshot = buildString {
            collectText(root, this, 0)
            event.text.forEach { append(' ').append(it) }
            event.contentDescription?.let { append(' ').append(it) }
        }.lowercase()

        val clicked = clickedSnapshot(event)
        val nowAd = AD_MARKERS.any { snapshot.contains(it) }
        val endedByText = END_MARKERS.any { snapshot.contains(it) } && !nowAd
        val userTappedStop = event.eventType == AccessibilityEvent.TYPE_VIEW_CLICKED &&
            USER_STOP_CLICK_MARKERS.any { clicked.contains(it) } && !nowAd

        if (nowAd) {
            if (pendingStop && hasSeenPlaying) {
                RecorderDiagnostics.record(this, "youtube_ad_marker_ignored_during_pending_stop")
                return
            }

            adLastSeenAt = SystemClock.elapsedRealtime()
            adClearCandidateSince = 0L
            pendingStop = false
            handler.removeCallbacks(stoppedRunnable)
            handler.removeCallbacks(resumeRunnable)
            if (!adActive) {
                adActive = true
                RecorderDiagnostics.record(this, "youtube_ad_detected_capture_pause")
                sendCaptureAction(PlaybackCaptureService.ACTION_PAUSE)
            }
            return
        }

        if (adActive) {
            clearAdStateAndScheduleResume("youtube_ad_ended_capture_resume_pending")
        }

        val state = playbackState(root)
        logPlayerState(state)
        if (state == PlayerState.PLAYING) {
            hasSeenPlaying = true
            pendingStop = false
            handler.removeCallbacks(stoppedRunnable)
        }

        if (userTappedStop) {
            hasSeenPlaying = true
            RecorderDiagnostics.record(this, "youtube_pause_or_stop_clicked")
            scheduleStop()
            return
        }

        if (endedByText || state == PlayerState.ENDED) {
            pendingStop = false
            handler.removeCallbacks(stoppedRunnable)
            handler.removeCallbacks(resumeRunnable)
            RecorderDiagnostics.record(this, "youtube_ended_accessibility_auto_stop")
            stopAndReturnToPie()
            return
        }

        if (hasSeenPlaying && state == PlayerState.STOPPED) {
            scheduleStop()
            return
        }

        if (!pendingStop) {
            handler.removeCallbacks(resumeRunnable)
            handler.postDelayed(resumeRunnable, RESUME_STABILITY_MS)
        }
    }

    override fun onInterrupt() {
        RecorderDiagnostics.record(this, "accessibility_interrupted")
        resetState()
    }

    override fun onDestroy() {
        isConnected = false
        RecorderDiagnostics.record(this, "accessibility_destroyed")
        resetState()
        if (autoFinishedReceiverRegistered) {
            try { unregisterReceiver(autoFinishedReceiver) } catch (_: Exception) {}
            autoFinishedReceiverRegistered = false
        }
        super.onDestroy()
    }

    private fun registerAutoFinishedReceiver() {
        if (autoFinishedReceiverRegistered) return
        val filter = IntentFilter(PlaybackCaptureService.ACTION_AUTO_FINISHED)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(autoFinishedReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("DEPRECATION")
                registerReceiver(autoFinishedReceiver, filter)
            }
            autoFinishedReceiverRegistered = true
            RecorderDiagnostics.record(this, "auto_finished_receiver_registered")
        } catch (e: Exception) {
            autoFinishedReceiverRegistered = false
            RecorderDiagnostics.record(this, "auto_finished_receiver_register_failed=${e.javaClass.simpleName}")
        }
    }

    private fun ensureMonitor() {
        if (monitorRunning) return
        monitorRunning = true
        returnTriggered = false
        lastLoggedPlayerState = null
        RecorderDiagnostics.record(this, "youtube_monitor_started")
        handler.post(monitorRunnable)
    }

    private fun inspectCurrentYouTubeWindow() {
        if (!CaptureSession.isActive(this)) return
        val root = rootInActiveWindow ?: return
        if (root.packageName?.toString() != YOUTUBE_PACKAGE) return

        val snapshot = buildString { collectText(root, this, 0) }.lowercase()
        val nowAd = AD_MARKERS.any { snapshot.contains(it) }
        val now = SystemClock.elapsedRealtime()

        if (nowAd) {
            adLastSeenAt = now
            adClearCandidateSince = 0L
            if (pendingStop && hasSeenPlaying) {
                RecorderDiagnostics.record(this, "youtube_monitor_ad_marker_ignored_pending_stop")
                return
            }
            pendingStop = false
            handler.removeCallbacks(stoppedRunnable)
            handler.removeCallbacks(resumeRunnable)
            if (!adActive) {
                adActive = true
                RecorderDiagnostics.record(this, "youtube_monitor_ad_detected_capture_pause")
                sendCaptureAction(PlaybackCaptureService.ACTION_PAUSE)
            }
            return
        }

        if (adActive) {
            if (adClearCandidateSince == 0L) {
                adClearCandidateSince = now
                return
            }
            if (now - adClearCandidateSince < AD_END_MONITOR_STABILITY_MS) return
            clearAdStateAndScheduleResume("youtube_ad_ended_monitor_resume_pending")
        }

        val state = playbackState(root)
        logPlayerState(state)
        when (state) {
            PlayerState.PLAYING -> {
                hasSeenPlaying = true
                pendingStop = false
                handler.removeCallbacks(stoppedRunnable)
            }
            PlayerState.STOPPED -> {
                if (hasSeenPlaying) scheduleStop()
            }
            PlayerState.ENDED -> {
                if (hasSeenPlaying) {
                    pendingStop = false
                    handler.removeCallbacks(stoppedRunnable)
                    RecorderDiagnostics.record(this, "youtube_monitor_detected_end")
                    stopAndReturnToPie()
                }
            }
            PlayerState.UNKNOWN -> Unit
        }
    }

    private fun clearAdStateAndScheduleResume(reason: String) {
        adActive = false
        adLastSeenAt = 0L
        adClearCandidateSince = 0L
        RecorderDiagnostics.record(this, reason)
        handler.removeCallbacks(resumeRunnable)
        if (!pendingStop) handler.postDelayed(resumeRunnable, RESUME_STABILITY_MS)
    }

    private fun logPlayerState(state: PlayerState) {
        if (state != lastLoggedPlayerState) {
            lastLoggedPlayerState = state
            RecorderDiagnostics.record(this, "youtube_player_state=${state.name}")
        }
    }

    private fun scheduleStop() {
        if (!CaptureSession.isActive(this) || adActive) return
        pendingStop = true
        handler.removeCallbacks(resumeRunnable)
        handler.removeCallbacks(stoppedRunnable)
        handler.postDelayed(stoppedRunnable, STOP_STABILITY_MS)
    }

    private fun resetState() {
        handler.removeCallbacks(resumeRunnable)
        handler.removeCallbacks(stoppedRunnable)
        handler.removeCallbacks(monitorRunnable)
        monitorRunning = false
        adActive = false
        adLastSeenAt = 0L
        adClearCandidateSince = 0L
        hasSeenPlaying = false
        pendingStop = false
        returnTriggered = false
        lastLoggedPlayerState = null
    }

    private fun rememberBrowserPackage(packageName: String) {
        if (!KNOWN_BROWSER_PACKAGES.contains(packageName)) return
        lastBrowserPackage = packageName
        getSharedPreferences(BROWSER_PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_BROWSER_PACKAGE, packageName)
            .apply()
    }

    private fun rememberedBrowserPackage(): String? {
        val stored = getSharedPreferences(BROWSER_PREFS, Context.MODE_PRIVATE)
            .getString(KEY_BROWSER_PACKAGE, null)
        return stored?.takeIf { KNOWN_BROWSER_PACKAGES.contains(it) }
    }

    private fun preferredInstalledBrowser(): String? = BRAVE_PACKAGE

    private fun isPackageInstalled(packageName: String): Boolean = try {
        packageManager.getPackageInfo(packageName, 0)
        true
    } catch (_: Exception) {
        false
    }

    private fun clickedSnapshot(event: AccessibilityEvent): String = buildString {
        event.text.forEach { append(' ').append(it) }
        event.contentDescription?.let { append(' ').append(it) }
        collectLineage(event.source, this, 0)
    }.lowercase()

    private fun collectLineage(node: AccessibilityNodeInfo?, out: StringBuilder, depth: Int) {
        if (node == null || depth > 6) return
        node.text?.let { out.append(' ').append(it) }
        node.contentDescription?.let { out.append(' ').append(it) }
        node.viewIdResourceName?.let { out.append(' ').append(it) }
        collectLineage(node.parent, out, depth + 1)
    }

    private fun playbackState(root: AccessibilityNodeInfo): PlayerState {
        var hasPause = false
        var hasPlay = false
        var hasReplay = false

        fun scan(node: AccessibilityNodeInfo?, depth: Int) {
            if (node == null || depth > 20) return

            val label = buildString {
                node.text?.let { append(it).append(' ') }
                node.contentDescription?.let { append(it) }
            }.trim().lowercase()
            val viewId = node.viewIdResourceName.orEmpty().lowercase()
            val looksLikePlayerControl = node.isClickable ||
                viewId.contains("play_pause") ||
                viewId.contains("player_control") ||
                viewId.contains("playpause")

            if (looksLikePlayerControl) {
                if (PAUSE_CONTROL_LABELS.any { label == it || label.startsWith("$it ") }) hasPause = true
                if (REPLAY_CONTROL_LABELS.any { label == it || label.startsWith("$it ") }) hasReplay = true
                if (PLAY_CONTROL_LABELS.any { label == it || label.startsWith("$it ") }) hasPlay = true
            }

            for (i in 0 until node.childCount) scan(node.getChild(i), depth + 1)
        }

        scan(root, 0)

        return when {
            hasPause -> PlayerState.PLAYING
            hasReplay -> PlayerState.ENDED
            hasPlay -> PlayerState.STOPPED
            else -> PlayerState.UNKNOWN
        }
    }

    private fun sendCaptureAction(action: String) {
        if (!CaptureSession.isActive(this)) return
        RecorderDiagnostics.record(this, "send_capture_action=$action")
        try {
            startService(Intent(this, PlaybackCaptureService::class.java).setAction(action))
        } catch (e: Exception) {
            RecorderDiagnostics.record(this, "send_capture_action_failed=${e.javaClass.simpleName}")
        }
    }

    private fun stopAndReturnToPie() {
        if (!CaptureSession.isActive(this) || returnTriggered) return
        returnTriggered = true
        RecorderDiagnostics.record(this, "stop_and_return_requested browser=${lastBrowserPackage ?: rememberedBrowserPackage() ?: "unknown"}")
        sendCaptureAction(PlaybackCaptureService.ACTION_AUTO_STOP)
        returnFromYouTube(RETURN_DELAY_MS)
    }

    private fun returnFromYouTube(delayMs: Long) {
        val expectedBrowser = lastBrowserPackage ?: rememberedBrowserPackage() ?: preferredInstalledBrowser()
        RecorderDiagnostics.record(this, "return_existing_browser_only expected=${expectedBrowser ?: "unknown"}")

        handler.postDelayed({
            val active = activePackage()
            RecorderDiagnostics.record(this, "return_begin active=${active ?: "null"}")

            if (isExpectedBrowser(active, expectedBrowser)) {
                RecorderDiagnostics.record(this, "existing_browser_already_foreground pieVisible=${activeWindowLooksLikePie()}")
                return@postDelayed
            }

            openRecentsAndSelectBrowser(expectedBrowser, 0)
        }, delayMs)
    }

    private fun openRecentsAndSelectBrowser(expectedBrowser: String?, attempt: Int) {
        if (attempt == 0) {
            val before = activePackage()
            val accepted = try { performGlobalAction(GLOBAL_ACTION_RECENTS) } catch (_: Exception) { false }
            RecorderDiagnostics.record(this, "recents_action accepted=$accepted before=${before ?: "null"}")
            if (!accepted) {
                RecorderDiagnostics.record(this, "recents_action_failed_no_url_fallback")
                return
            }
        }

        handler.postDelayed({
            val active = activePackage()
            RecorderDiagnostics.record(this, "recents_scan attempt=$attempt active=${active ?: "null"}")

            if (isExpectedBrowser(active, expectedBrowser)) {
                RecorderDiagnostics.record(this, "browser_already_foreground_after_recents=${active ?: "unknown"} pieVisible=${activeWindowLooksLikePie()}")
                return@postDelayed
            }

            val clicked = findAndClickBrowserTask(expectedBrowser)
            RecorderDiagnostics.record(this, "recents_browser_click attempt=$attempt clicked=$clicked")
            if (clicked) {
                verifyBrowserReturn(expectedBrowser)
                return@postDelayed
            }

            if (attempt < RECENTS_SCAN_ATTEMPTS - 1) {
                openRecentsAndSelectBrowser(expectedBrowser, attempt + 1)
            } else {
                RecorderDiagnostics.record(this, "recents_browser_not_found_no_url_fallback")
            }
        }, if (attempt == 0) RECENTS_OPEN_DELAY_MS else RECENTS_RESCAN_DELAY_MS)
    }

    private fun findAndClickBrowserTask(expectedBrowser: String?): Boolean {
        val labels = browserLabels(expectedBrowser)
        val windows = try { windows } catch (_: Exception) { emptyList() }

        for (window in windows) {
            val root = try { window.root } catch (_: Exception) { null } ?: continue
            val match = findNodeMatchingAnyLabel(root, labels, 0) ?: continue
            if (clickNodeOrParent(match)) return true
        }

        val root = try { rootInActiveWindow } catch (_: Exception) { null }
        val match = findNodeMatchingAnyLabel(root, labels, 0)
        return clickNodeOrParent(match)
    }

    private fun findNodeMatchingAnyLabel(
        node: AccessibilityNodeInfo?,
        labels: List<String>,
        depth: Int
    ): AccessibilityNodeInfo? {
        if (node == null || depth > 24) return null
        val haystack = buildString {
            node.text?.let { append(it).append(' ') }
            node.contentDescription?.let { append(it).append(' ') }
            node.viewIdResourceName?.let { append(it).append(' ') }
        }.lowercase()

        if (labels.any { haystack.contains(it) }) return node
        for (i in 0 until node.childCount) {
            val found = findNodeMatchingAnyLabel(node.getChild(i), labels, depth + 1)
            if (found != null) return found
        }
        return null
    }

    private fun clickNodeOrParent(node: AccessibilityNodeInfo?): Boolean {
        var current = node
        var depth = 0
        while (current != null && depth < 8) {
            if (current.isClickable) {
                return try { current.performAction(AccessibilityNodeInfo.ACTION_CLICK) } catch (_: Exception) { false }
            }
            current = current.parent
            depth++
        }
        return false
    }

    private fun verifyBrowserReturn(expectedBrowser: String?) {
        handler.postDelayed({
            val active = activePackage()
            val success = isExpectedBrowser(active, expectedBrowser)
            RecorderDiagnostics.record(
                this,
                "browser_return_verify success=$success active=${active ?: "null"} pieVisible=${activeWindowLooksLikePie()} noUrlLaunch=true"
            )
        }, BROWSER_VERIFY_DELAY_MS)
    }

    private fun openPieInBrowser(expectedBrowser: String?, pieUrl: String) {
        val target = pieUrl.takeIf(CaptureSession::isValidPieUrl) ?: PIE_URL
        val candidates = buildList {
            if (!expectedBrowser.isNullOrBlank()) add(expectedBrowser)
            val remembered = rememberedBrowserPackage()
            if (!remembered.isNullOrBlank()) add(remembered)
            if (!lastBrowserPackage.isNullOrBlank()) add(lastBrowserPackage!!)
            addAll(KNOWN_BROWSER_PACKAGES)
        }.distinct()

        for (packageName in candidates) {
            try {
                packageManager.getPackageInfo(packageName, 0)
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(target))
                    .setPackage(packageName)
                    .addCategory(Intent.CATEGORY_BROWSABLE)
                    .putExtra(Browser.EXTRA_APPLICATION_ID, packageName)
                    .putExtra(Browser.EXTRA_CREATE_NEW_TAB, false)
                    .addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK or
                            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                            Intent.FLAG_ACTIVITY_SINGLE_TOP
                    )
                startActivity(intent)
                RecorderDiagnostics.record(this, "pie_url_launch_attempt package=$packageName url=$target")
                handler.postDelayed({
                    RecorderDiagnostics.record(
                        this,
                        "pie_url_launch_result active=${activePackage() ?: "null"} pieVisible=${activeWindowLooksLikePie()}"
                    )
                }, BROWSER_VERIFY_DELAY_MS)
                return
            } catch (e: Exception) {
                RecorderDiagnostics.record(this, "pie_url_launch_failed package=$packageName error=${e.javaClass.simpleName}")
            }
        }
        RecorderDiagnostics.record(this, "pie_url_launch_all_methods_failed")
    }

    private fun activeWindowLooksLikePie(): Boolean {
        val root = try { rootInActiveWindow } catch (_: Exception) { null } ?: return false
        val snapshot = buildString { collectText(root, this, 0) }.lowercase()
        return PIE_WINDOW_MARKERS.any { snapshot.contains(it) }
    }

    private fun resolveBrowserPackage(returnUrl: String?): String? {
        val base = returnUrl?.takeIf(CaptureSession::isValidPieUrl) ?: PIE_URL
        return try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(base)).addCategory(Intent.CATEGORY_BROWSABLE)
            packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName
        } catch (_: Exception) {
            null
        }
    }

    private fun browserLabels(packageName: String?): List<String> = when (packageName) {
        "com.brave.browser" -> listOf("brave")
        "com.android.chrome" -> listOf("chrome")
        "com.sec.android.app.sbrowser" -> listOf("samsung internet", "internet")
        "org.mozilla.firefox" -> listOf("firefox")
        else -> listOf("brave", "chrome", "samsung internet", "firefox")
    }

    private fun activePackage(): String? = try {
        rootInActiveWindow?.packageName?.toString()
    } catch (_: Exception) {
        null
    }

    private fun isExpectedBrowser(activePackage: String?, expectedBrowser: String?): Boolean {
        if (activePackage.isNullOrBlank()) return false
        if (!expectedBrowser.isNullOrBlank() && activePackage == expectedBrowser) return true
        return expectedBrowser.isNullOrBlank() && KNOWN_BROWSER_PACKAGES.contains(activePackage)
    }

    private fun collectText(node: AccessibilityNodeInfo?, out: StringBuilder, depth: Int) {
        if (node == null || depth > 18) return
        node.text?.let { out.append(' ').append(it) }
        node.contentDescription?.let { out.append(' ').append(it) }
        node.viewIdResourceName?.let { out.append(' ').append(it) }
        for (i in 0 until node.childCount) collectText(node.getChild(i), out, depth + 1)
    }

    private enum class PlayerState { PLAYING, STOPPED, ENDED, UNKNOWN }

    companion object {
        @Volatile
        var isConnected: Boolean = false
            private set

        private const val YOUTUBE_PACKAGE = "com.google.android.youtube"
        private const val SYSTEM_UI_PACKAGE = "com.android.systemui"
        private const val BRAVE_PACKAGE = "com.brave.browser"
        private const val BROWSER_PREFS = "pie_browser_return"
        private const val KEY_BROWSER_PACKAGE = "browser_package"
        private const val RESUME_STABILITY_MS = 1800L
        private const val STOP_STABILITY_MS = 900L
        private const val MONITOR_INTERVAL_MS = 500L
        private const val AD_END_MONITOR_STABILITY_MS = 750L
        private const val RETURN_DELAY_MS = 120L
        private const val AUTO_FINISH_RETURN_DELAY_MS = 120L
        private const val RECENTS_OPEN_DELAY_MS = 260L
        private const val RECENTS_RESCAN_DELAY_MS = 220L
        private const val RECENTS_SCAN_ATTEMPTS = 3
        private const val BROWSER_VERIFY_DELAY_MS = 650L
        private const val PIE_URL = "https://ai-songs-git-main-drobinhood1.vercel.app"

        private val KNOWN_BROWSER_PACKAGES = listOf(
            BRAVE_PACKAGE,
            "com.android.chrome",
            "com.sec.android.app.sbrowser",
            "org.mozilla.firefox"
        )

        private val PIE_WINDOW_MARKERS = listOf(
            "ai-songs-git-main-drobinhood1.vercel.app",
            "pieinears.ai",
            "analyze music",
            "record playback",
            "record audio",
            "in the kitchen"
        )

        private val AD_MARKERS = listOf(
            "skip ad", "skip ads", "visit advertiser", "advertisement",
            "ad 1 of", "ad 2 of", "about this ad"
        )

        private val USER_STOP_CLICK_MARKERS = listOf("pause video", "pause", "stop video", "stop")
        private val SYSTEM_STOP_CLICK_MARKERS = listOf("pause", "stop")
        private val PAUSE_CONTROL_LABELS = listOf("pause", "pause video")
        private val PLAY_CONTROL_LABELS = listOf("play", "play video")
        private val REPLAY_CONTROL_LABELS = listOf("replay", "replay video", "watch again")
        private val END_MARKERS = listOf("replay video", "watch again", "replay")
    }
}
