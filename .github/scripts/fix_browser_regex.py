from pathlib import Path

path = Path('android-recorder/app/src/main/java/app/pie/recorder/YouTubeAdAccessibilityService.kt')
text = path.read_text()

# Fix the generated Kotlin regex from the Brave restore patch.
old_regex = r'Regex("^\d+\s+tabs?$")'
new_regex = r'Regex("""^\d+\s+tabs?$""")'
if old_regex not in text:
    raise SystemExit('Could not locate generated invalid Kotlin regex')
text = text.replace(old_regex, new_regex, 1)

# Brave fallback search uses the actual Pie title, but Brave is no longer the primary return path.
old_query = 'private const val PIE_TAB_SEARCH_QUERY = "ai-songs"'
new_query = 'private const val PIE_TAB_SEARCH_QUERY = "Pieinears"'
if old_query not in text:
    raise SystemExit('Could not locate generated Pie tab search query')
text = text.replace(old_query, new_query, 1)

old_marker = '            "pieinears.ai",\n'
new_marker = '            "pieinears.ai",\n            "pieinears",\n'
if old_marker not in text:
    raise SystemExit('Could not locate generated Pie tab marker list')
text = text.replace(old_marker, new_marker, 1)

# Track possible return hosts, but use the Android activity back stack first so ChatGPT custom tabs work.
old_fields = '''    private var lastBrowserPackage: String? = null
    private var lastLoggedPlayerState: PlayerState? = null
'''
new_fields = '''    private var lastBrowserPackage: String? = null
    private var lastReturnHostPackage: String? = null
    private var captureReturnPackage: String? = null
    private var lastLoggedPlayerState: PlayerState? = null
'''
if old_fields not in text:
    raise SystemExit('Could not locate return-host fields')
text = text.replace(old_fields, new_fields, 1)

old_event_start = '''    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val eventPackage = event?.packageName?.toString()
        if (!eventPackage.isNullOrBlank() && KNOWN_BROWSER_PACKAGES.contains(eventPackage)) {
'''
new_event_start = '''    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val eventPackage = event?.packageName?.toString()
        if (!eventPackage.isNullOrBlank() && isReturnHostCandidate(eventPackage)) {
            lastReturnHostPackage = eventPackage
        }
        if (!eventPackage.isNullOrBlank() && KNOWN_BROWSER_PACKAGES.contains(eventPackage)) {
'''
if old_event_start not in text:
    raise SystemExit('Could not locate accessibility event start')
text = text.replace(old_event_start, new_event_start, 1)

old_monitor_start = '''    private fun ensureMonitor() {
        if (monitorRunning) return
        monitorRunning = true
        returnTriggered = false
        lastLoggedPlayerState = null
        RecorderDiagnostics.record(this, "youtube_monitor_started")
        handler.post(monitorRunnable)
    }
'''
new_monitor_start = '''    private fun ensureMonitor() {
        if (monitorRunning) return
        monitorRunning = true
        returnTriggered = false
        lastLoggedPlayerState = null
        captureReturnPackage = lastReturnHostPackage ?: lastBrowserPackage ?: rememberedBrowserPackage() ?: preferredInstalledBrowser()
        RecorderDiagnostics.record(this, "youtube_monitor_started returnHost=${captureReturnPackage ?: "unknown"}")
        handler.post(monitorRunnable)
    }
'''
if old_monitor_start not in text:
    raise SystemExit('Could not locate monitor start')
text = text.replace(old_monitor_start, new_monitor_start, 1)

# A deliberate pause/stop should finalize and start returning immediately.
old_manual_stop = '''        if (userTappedStop) {
            hasSeenPlaying = true
            RecorderDiagnostics.record(this, "youtube_pause_or_stop_clicked")
            scheduleStop()
            return
        }
'''
new_manual_stop = '''        if (userTappedStop) {
            hasSeenPlaying = true
            pendingStop = false
            handler.removeCallbacks(stoppedRunnable)
            handler.removeCallbacks(resumeRunnable)
            RecorderDiagnostics.record(this, "youtube_pause_or_stop_clicked_immediate_return")
            stopAndReturnToPie()
            return
        }
'''
if old_manual_stop not in text:
    raise SystemExit('Could not locate manual YouTube stop block')
text = text.replace(old_manual_stop, new_manual_stop, 1)

# Do not keep restarting the stop stability timer on repeated STOPPED scans.
old_schedule = '''    private fun scheduleStop() {
        if (!CaptureSession.isActive(this) || adActive) return
        pendingStop = true
        handler.removeCallbacks(resumeRunnable)
        handler.removeCallbacks(stoppedRunnable)
        handler.postDelayed(stoppedRunnable, STOP_STABILITY_MS)
    }
'''
new_schedule = '''    private fun scheduleStop() {
        if (!CaptureSession.isActive(this) || adActive || pendingStop) return
        pendingStop = true
        handler.removeCallbacks(resumeRunnable)
        handler.removeCallbacks(stoppedRunnable)
        RecorderDiagnostics.record(this, "youtube_stop_stability_started")
        handler.postDelayed(stoppedRunnable, STOP_STABILITY_MS)
    }
'''
if old_schedule not in text:
    raise SystemExit('Could not locate stop stability scheduler')
text = text.replace(old_schedule, new_schedule, 1)

old_expected = '''        val expectedBrowser = lastBrowserPackage ?: rememberedBrowserPackage() ?: preferredInstalledBrowser()
'''
new_expected = '''        val expectedBrowser = captureReturnPackage ?: lastReturnHostPackage ?: lastBrowserPackage ?: rememberedBrowserPackage() ?: preferredInstalledBrowser()
'''
if old_expected not in text:
    raise SystemExit('Could not locate expected return package')
text = text.replace(old_expected, new_expected, 1)

# Replace the old one-Back-then-Recents logic. YouTube commonly consumes the first Back
# by collapsing its player, so keep backing out until Android restores the exact previous
# activity/custom tab. This works even when Pie lives in ChatGPT's in-app browser and has
# no persistent Brave tab at all.
old_return = '''    private fun returnFromYouTube(delayMs: Long) {
        val expectedBrowser = captureReturnPackage ?: lastReturnHostPackage ?: lastBrowserPackage ?: rememberedBrowserPackage() ?: preferredInstalledBrowser()
        RecorderDiagnostics.record(this, "return_existing_browser_only expected=${expectedBrowser ?: "unknown"}")

        handler.postDelayed({
            val before = activePackage()
            RecorderDiagnostics.record(this, "return_begin active=${before ?: "null"}")

            val backAccepted = try { performGlobalAction(GLOBAL_ACTION_BACK) } catch (_: Exception) { false }
            RecorderDiagnostics.record(this, "return_back_action accepted=$backAccepted before=${before ?: "null"}")

            handler.postDelayed({
                val active = activePackage()
                RecorderDiagnostics.record(this, "return_back_verify active=${active ?: "null"}")
                if (isExpectedBrowser(active, expectedBrowser)) {
                    handleBrowserForeground(expectedBrowser, "youtube_back")
                } else {
                    openRecentsAndSelectBrowser(expectedBrowser, 0)
                }
            }, BACK_RETURN_VERIFY_DELAY_MS)
        }, delayMs)
    }

'''
new_return = '''    private fun returnFromYouTube(delayMs: Long) {
        val expectedBrowser = captureReturnPackage ?: lastReturnHostPackage ?: lastBrowserPackage ?: rememberedBrowserPackage() ?: preferredInstalledBrowser()
        RecorderDiagnostics.record(this, "return_back_stack_first expected=${expectedBrowser ?: "unknown"}")
        handler.postDelayed({ backOutOfYouTube(expectedBrowser, 0) }, delayMs)
    }

    private fun backOutOfYouTube(expectedBrowser: String?, attempt: Int) {
        val before = activePackage()
        if (before != YOUTUBE_PACKAGE) {
            settleBackStackLanding(expectedBrowser, before, "precheck_$attempt")
            return
        }

        val accepted = try { performGlobalAction(GLOBAL_ACTION_BACK) } catch (_: Exception) { false }
        RecorderDiagnostics.record(this, "return_back_stack_action attempt=$attempt accepted=$accepted before=${before ?: "null"}")
        if (!accepted) {
            RecorderDiagnostics.record(this, "return_back_stack_action_failed")
            openRecentsAndSelectBrowser(expectedBrowser, 0)
            return
        }

        handler.postDelayed({
            val active = activePackage()
            RecorderDiagnostics.record(this, "return_back_stack_verify attempt=$attempt active=${active ?: "null"}")
            if (active == YOUTUBE_PACKAGE && attempt + 1 < YOUTUBE_BACK_ATTEMPTS) {
                backOutOfYouTube(expectedBrowser, attempt + 1)
            } else if (active == YOUTUBE_PACKAGE) {
                RecorderDiagnostics.record(this, "return_back_stack_exhausted")
                openRecentsAndSelectBrowser(expectedBrowser, 0)
            } else {
                settleBackStackLanding(expectedBrowser, active, "attempt_$attempt")
            }
        }, YOUTUBE_BACK_STEP_MS)
    }

    private fun settleBackStackLanding(expectedBrowser: String?, active: String?, source: String) {
        RecorderDiagnostics.record(this, "return_back_stack_landed source=$source active=${active ?: "null"}")
        handler.postDelayed({
            val settled = activePackage()
            val pieVisible = activeWindowLooksLikePie()
            RecorderDiagnostics.record(this, "return_back_stack_settled active=${settled ?: "null"} pieVisible=$pieVisible")

            if (pieVisible) {
                RecorderDiagnostics.record(this, "return_back_stack_success active=${settled ?: "null"}")
                return@postDelayed
            }

            if (settled == CHATGPT_PACKAGE) {
                // ChatGPT in-app browser/custom-tab flows may expose ChatGPT as the host package
                // even when the web content itself is not fully represented in accessibility text.
                RecorderDiagnostics.record(this, "return_back_stack_success host=chatgpt")
                return@postDelayed
            }

            if (settled == BRAVE_PACKAGE) {
                // Only use Brave tab restore as a fallback when Android actually landed in Brave.
                handleBrowserForeground(BRAVE_PACKAGE, "back_stack_fallback")
                return@postDelayed
            }

            if (!settled.isNullOrBlank() && settled != YOUTUBE_PACKAGE) {
                // We left YouTube and restored a non-browser/custom-tab host. Do not force Brave.
                RecorderDiagnostics.record(this, "return_back_stack_success host=$settled unverifiedPie=true")
                return@postDelayed
            }

            openRecentsAndSelectBrowser(expectedBrowser, 0)
        }, BACK_STACK_SETTLE_MS)
    }

'''
if old_return not in text:
    raise SystemExit('Could not locate returnFromYouTube block')
text = text.replace(old_return, new_return, 1)

# Recents can select ChatGPT if a fallback is ever needed.
old_labels = '''    private fun browserLabels(packageName: String?): List<String> = when (packageName) {
        "com.brave.browser" -> listOf("brave")
        "com.android.chrome" -> listOf("chrome")
'''
new_labels = '''    private fun browserLabels(packageName: String?): List<String> = when (packageName) {
        CHATGPT_PACKAGE -> listOf("chatgpt")
        "com.brave.browser" -> listOf("brave")
        "com.android.chrome" -> listOf("chrome")
'''
if old_labels not in text:
    raise SystemExit('Could not locate return package labels')
text = text.replace(old_labels, new_labels, 1)

insert_before = '''    private fun rememberedBrowserPackage(): String? {
'''
helper = '''    private fun isReturnHostCandidate(candidate: String): Boolean =
        candidate == CHATGPT_PACKAGE || KNOWN_BROWSER_PACKAGES.contains(candidate)

'''
if insert_before not in text:
    raise SystemExit('Could not locate return-host helper insertion point')
text = text.replace(insert_before, helper + insert_before, 1)

old_constant = '''        private const val BRAVE_PACKAGE = "com.brave.browser"
'''
new_constant = '''        private const val BRAVE_PACKAGE = "com.brave.browser"
        private const val CHATGPT_PACKAGE = "com.openai.chatgpt"
'''
if old_constant not in text:
    raise SystemExit('Could not locate Brave package constant')
text = text.replace(old_constant, new_constant, 1)

old_timing = '''        private const val BACK_RETURN_VERIFY_DELAY_MS = 450L
'''
new_timing = '''        private const val BACK_RETURN_VERIFY_DELAY_MS = 450L
        private const val YOUTUBE_BACK_STEP_MS = 320L
        private const val YOUTUBE_BACK_ATTEMPTS = 3
        private const val BACK_STACK_SETTLE_MS = 550L
'''
if old_timing not in text:
    raise SystemExit('Could not locate return timing constants')
text = text.replace(old_timing, new_timing, 1)

path.write_text(text)
print('Applied immediate stop and Android back-stack return for ChatGPT custom-tab Pie sessions')
