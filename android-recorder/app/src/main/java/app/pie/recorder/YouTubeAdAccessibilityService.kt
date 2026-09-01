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
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class YouTubeAdAccessibilityService : AccessibilityService() {
    private val handler = Handler(Looper.getMainLooper())
    private var adActive = false
    private var hasSeenPlaying = false
    private var pendingStop = false
    private var monitorRunning = false
    private var returnTriggered = false
    private var autoFinishedReceiverRegistered = false

    private val autoFinishedReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != PlaybackCaptureService.ACTION_AUTO_FINISHED) return
            if (returnTriggered) return
            returnTriggered = true
            returnFromYouTube(intent.getStringExtra(PlaybackCaptureService.EXTRA_RETURN_URL), AUTO_FINISH_RETURN_DELAY_MS)
        }
    }

    private val resumeRunnable = Runnable {
        if (!CaptureSession.isActive(this) || adActive || pendingStop) return@Runnable
        sendCaptureAction(PlaybackCaptureService.ACTION_RESUME)
    }

    private val stoppedRunnable = Runnable {
        if (!CaptureSession.isActive(this) || !pendingStop || adActive || !hasSeenPlaying) return@Runnable
        pendingStop = false
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
        registerAutoFinishedReceiver()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (!CaptureSession.isActive(this)) {
            resetState()
            return
        }

        ensureMonitor()
        val packageName = event?.packageName?.toString() ?: return

        if (packageName == SYSTEM_UI_PACKAGE) {
            if (event.eventType == AccessibilityEvent.TYPE_VIEW_CLICKED) {
                val clicked = clickedSnapshot(event)
                if (SYSTEM_STOP_CLICK_MARKERS.any { clicked.contains(it) }) {
                    hasSeenPlaying = true
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
            pendingStop = false
            handler.removeCallbacks(stoppedRunnable)
            handler.removeCallbacks(resumeRunnable)
            if (!adActive) {
                adActive = true
                sendCaptureAction(PlaybackCaptureService.ACTION_PAUSE)
            }
            return
        }

        val state = playbackState(root)
        if (state == PlayerState.PLAYING) {
            hasSeenPlaying = true
            pendingStop = false
            handler.removeCallbacks(stoppedRunnable)
        }

        if (userTappedStop) {
            hasSeenPlaying = true
            scheduleStop()
            return
        }

        if (endedByText || state == PlayerState.ENDED) {
            pendingStop = false
            handler.removeCallbacks(stoppedRunnable)
            handler.removeCallbacks(resumeRunnable)
            stopAndReturnToPie()
            return
        }

        if (hasSeenPlaying && state == PlayerState.STOPPED) {
            scheduleStop()
            return
        }

        if (adActive) {
            adActive = false
            handler.removeCallbacks(resumeRunnable)
            handler.postDelayed(resumeRunnable, RESUME_STABILITY_MS)
        } else if (!pendingStop) {
            handler.removeCallbacks(resumeRunnable)
            handler.postDelayed(resumeRunnable, RESUME_STABILITY_MS)
        }
    }

    override fun onInterrupt() {
        resetState()
    }

    override fun onDestroy() {
        isConnected = false
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
        } catch (_: Exception) {
            autoFinishedReceiverRegistered = false
        }
    }

    private fun ensureMonitor() {
        if (monitorRunning) return
        monitorRunning = true
        returnTriggered = false
        handler.post(monitorRunnable)
    }

    private fun inspectCurrentYouTubeWindow() {
        if (adActive || !CaptureSession.isActive(this)) return
        val root = rootInActiveWindow ?: return
        if (root.packageName?.toString() != YOUTUBE_PACKAGE) return

        when (playbackState(root)) {
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
                    stopAndReturnToPie()
                }
            }
            PlayerState.UNKNOWN -> Unit
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
        hasSeenPlaying = false
        pendingStop = false
        returnTriggered = false
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
                if (PAUSE_CONTROL_LABELS.any { label == it || label.startsWith("$it ") }) {
                    hasPause = true
                }
                if (REPLAY_CONTROL_LABELS.any { label == it || label.startsWith("$it ") }) {
                    hasReplay = true
                }
                if (PLAY_CONTROL_LABELS.any { label == it || label.startsWith("$it ") }) {
                    hasPlay = true
                }
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
        try {
            startService(Intent(this, PlaybackCaptureService::class.java).setAction(action))
        } catch (_: Exception) {
            // Recorder may not be active yet; later events will retry.
        }
    }

    private fun stopAndReturnToPie() {
        if (!CaptureSession.isActive(this) || returnTriggered) return
        val returnUrl = CaptureSession.returnUrl(this)
        returnTriggered = true
        sendCaptureAction(PlaybackCaptureService.ACTION_AUTO_STOP)
        returnFromYouTube(returnUrl, RETURN_BACK_DELAY_MS)
    }

    private fun returnFromYouTube(returnUrl: String?, backDelayMs: Long) {
        val expectedBrowser = resolveBrowserPackage(returnUrl)
        handler.postDelayed({
            try { performGlobalAction(GLOBAL_ACTION_BACK) } catch (_: Exception) {}
            verifyReturnedFromYouTube(returnUrl, expectedBrowser, 0)
        }, backDelayMs)
    }

    private fun verifyReturnedFromYouTube(returnUrl: String?, expectedBrowser: String?, attempt: Int) {
        handler.postDelayed({
            val activePackage = try { rootInActiveWindow?.packageName?.toString() } catch (_: Exception) { null }
            if (isExpectedBrowser(activePackage, expectedBrowser)) return@postDelayed

            if (attempt < RETURN_VERIFY_ATTEMPTS - 1) {
                // One Android Back can merely close YouTube's player/chrome instead of
                // leaving the app. Retry Back only while YouTube is still foregrounded.
                if (activePackage == YOUTUBE_PACKAGE || activePackage.isNullOrBlank()) {
                    try { performGlobalAction(GLOBAL_ACTION_BACK) } catch (_: Exception) {}
                }
                verifyReturnedFromYouTube(returnUrl, expectedBrowser, attempt + 1)
            } else {
                bringExistingBrowserToFront(returnUrl, expectedBrowser)
            }
        }, RETURN_VERIFY_INTERVAL_MS)
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

    private fun isExpectedBrowser(activePackage: String?, expectedBrowser: String?): Boolean {
        if (activePackage.isNullOrBlank()) return false
        if (!expectedBrowser.isNullOrBlank() && activePackage == expectedBrowser) return true
        return KNOWN_BROWSER_PACKAGES.contains(activePackage)
    }

    private fun bringExistingBrowserToFront(returnUrl: String?, expectedBrowser: String?) {
        val resolved = expectedBrowser ?: resolveBrowserPackage(returnUrl)
        val candidates = buildList {
            if (!resolved.isNullOrBlank()) add(resolved)
            addAll(KNOWN_BROWSER_PACKAGES)
        }.distinct()

        for (packageName in candidates) {
            try {
                val launch = packageManager.getLaunchIntentForPackage(packageName) ?: continue
                launch.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                )
                startActivity(launch)
                return
            } catch (_: Exception) {
                // Try the next installed browser without opening a URL/new tab.
            }
        }

        try { performGlobalAction(GLOBAL_ACTION_RECENTS) } catch (_: Exception) {}
    }

    private fun collectText(node: AccessibilityNodeInfo?, out: StringBuilder, depth: Int) {
        if (node == null || depth > 18) return
        node.text?.let { out.append(' ').append(it) }
        node.contentDescription?.let { out.append(' ').append(it) }
        for (i in 0 until node.childCount) {
            collectText(node.getChild(i), out, depth + 1)
        }
    }

    private enum class PlayerState { PLAYING, STOPPED, ENDED, UNKNOWN }

    companion object {
        @Volatile
        var isConnected: Boolean = false
            private set

        private const val YOUTUBE_PACKAGE = "com.google.android.youtube"
        private const val SYSTEM_UI_PACKAGE = "com.android.systemui"
        private const val RESUME_STABILITY_MS = 1800L
        private const val STOP_STABILITY_MS = 900L
        private const val MONITOR_INTERVAL_MS = 500L
        private const val RETURN_BACK_DELAY_MS = 180L
        private const val AUTO_FINISH_RETURN_DELAY_MS = 180L
        private const val RETURN_VERIFY_INTERVAL_MS = 450L
        private const val RETURN_VERIFY_ATTEMPTS = 4
        private const val PIE_URL = "https://ai-songs-git-main-drobinhood1.vercel.app"

        private val KNOWN_BROWSER_PACKAGES = listOf(
            "com.brave.browser",
            "com.android.chrome",
            "com.sec.android.app.sbrowser",
            "org.mozilla.firefox"
        )

        private val AD_MARKERS = listOf(
            "skip ad",
            "skip ads",
            "visit advertiser",
            "sponsored",
            "advertisement",
            "ad 1 of",
            "ad 2 of",
            "about this ad"
        )

        private val USER_STOP_CLICK_MARKERS = listOf(
            "pause video",
            "pause",
            "stop video",
            "stop"
        )

        private val SYSTEM_STOP_CLICK_MARKERS = listOf(
            "pause",
            "stop"
        )

        private val PAUSE_CONTROL_LABELS = listOf(
            "pause",
            "pause video"
        )

        private val PLAY_CONTROL_LABELS = listOf(
            "play",
            "play video"
        )

        private val REPLAY_CONTROL_LABELS = listOf(
            "replay",
            "replay video",
            "watch again"
        )

        private val END_MARKERS = listOf(
            "replay video",
            "watch again",
            "replay"
        )
    }
}
