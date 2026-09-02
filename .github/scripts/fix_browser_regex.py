from pathlib import Path

path = Path('android-recorder/app/src/main/java/app/pie/recorder/YouTubeAdAccessibilityService.kt')
text = path.read_text()

# Fix the generated Kotlin regex from the Brave restore patch.
old_regex = r'Regex("^\d+\s+tabs?$")'
new_regex = r'Regex("""^\d+\s+tabs?$""")'
if old_regex not in text:
    raise SystemExit('Could not locate generated invalid Kotlin regex')
text = text.replace(old_regex, new_regex, 1)

# Brave tab search must use the actual page title, not the deployment slug.
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

# Remember the actual app that hosted Pie before capture. This may be Brave or ChatGPT.
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

# A deliberate user pause/stop should finalize and return immediately, not wait for the stability timer.
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

# Do not keep restarting the 900 ms stability timer from repeated STOPPED accessibility scans.
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

# Prefer the actual host app captured before YouTube. Brave remains the fallback.
old_expected = '''        val expectedBrowser = lastBrowserPackage ?: rememberedBrowserPackage() ?: preferredInstalledBrowser()
'''
new_expected = '''        val expectedBrowser = captureReturnPackage ?: lastReturnHostPackage ?: lastBrowserPackage ?: rememberedBrowserPackage() ?: preferredInstalledBrowser()
'''
if old_expected not in text:
    raise SystemExit('Could not locate expected return package')
text = text.replace(old_expected, new_expected, 1)

# Recents can now select ChatGPT when Pie was opened from a ChatGPT link/custom tab.
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

# Add a small helper rather than treating every transient Android package as a return target.
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

path.write_text(text)
print('Applied immediate stop plus return to the actual Pie host app (Brave or ChatGPT)')
