from pathlib import Path

path = Path('android-recorder/app/src/main/java/app/pie/recorder/YouTubeAdAccessibilityService.kt')
text = path.read_text()

if 'youtube_exact_source_reassert' in text:
    print('Exact YouTube source reassert already present')
    raise SystemExit(0)

field_marker = '    private var lastLoggedPlayerState: PlayerState? = null\n'
fields = '''    private var lastLoggedPlayerState: PlayerState? = null
    private var exactSourceLaunchScheduled = false
    private var exactSourceLaunchDone = false

    private val exactSourceRunnable = Runnable {
        exactSourceLaunchScheduled = false
        if (!CaptureSession.isActive(this) || exactSourceLaunchDone) return@Runnable
        val videoId = youtubeVideoId(CaptureSession.sourceUrl(this))
        if (videoId.isBlank()) return@Runnable

        val watchUrl = Uri.parse("https://www.youtube.com/watch?v=$videoId")
        try {
            // The Android "Share one app" picker can foreground YouTube after the
            // recorder's first deep-link, restoring YouTube Home/current content.
            // After that transition settles, target the watch activity itself.
            val intent = Intent(Intent.ACTION_VIEW, watchUrl).apply {
                setClassName(YOUTUBE_PACKAGE, "com.google.android.youtube.WatchActivity")
                putExtra("VIDEO_ID", videoId)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
            exactSourceLaunchDone = true
            RecorderDiagnostics.record(this, "youtube_exact_source_reassert_watch_activity id=${videoId.take(16)}")
        } catch (first: Exception) {
            RecorderDiagnostics.record(this, "youtube_exact_source_reassert_watch_fallback=${first.javaClass.simpleName}")
            try {
                val fallback = Intent(Intent.ACTION_VIEW, Uri.parse("vnd.youtube:$videoId")).apply {
                    setPackage(YOUTUBE_PACKAGE)
                    putExtra("VIDEO_ID", videoId)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(fallback)
                exactSourceLaunchDone = true
                RecorderDiagnostics.record(this, "youtube_exact_source_reassert_video_id id=${videoId.take(16)}")
            } catch (second: Exception) {
                RecorderDiagnostics.record(this, "youtube_exact_source_reassert_failed=${second.javaClass.simpleName}")
            }
        }
    }
'''
if field_marker not in text:
    raise SystemExit('Could not locate player state field')
text = text.replace(field_marker, fields, 1)

package_marker = '        if (packageName != YOUTUBE_PACKAGE) return\n\n        val root = rootInActiveWindow ?: return\n'
package_replacement = '        if (packageName != YOUTUBE_PACKAGE) return\n\n        scheduleExactSourceReassert()\n        val root = rootInActiveWindow ?: return\n'
if package_marker not in text:
    raise SystemExit('Could not locate YouTube package branch')
text = text.replace(package_marker, package_replacement, 1)

monitor_marker = '        val root = rootInActiveWindow ?: return\n        if (root.packageName?.toString() != YOUTUBE_PACKAGE) return\n\n        val snapshot = buildString { collectText(root, this, 0) }.lowercase()\n'
monitor_replacement = '        val root = rootInActiveWindow ?: return\n        if (root.packageName?.toString() != YOUTUBE_PACKAGE) return\n\n        scheduleExactSourceReassert()\n        val snapshot = buildString { collectText(root, this, 0) }.lowercase()\n'
if monitor_marker not in text:
    raise SystemExit('Could not locate YouTube monitor branch')
text = text.replace(monitor_marker, monitor_replacement, 1)

reset_marker = '''    private fun resetState() {
        handler.removeCallbacks(resumeRunnable)
        handler.removeCallbacks(stoppedRunnable)
        handler.removeCallbacks(monitorRunnable)
'''
reset_replacement = '''    private fun resetState() {
        handler.removeCallbacks(resumeRunnable)
        handler.removeCallbacks(stoppedRunnable)
        handler.removeCallbacks(monitorRunnable)
        handler.removeCallbacks(exactSourceRunnable)
        exactSourceLaunchScheduled = false
        exactSourceLaunchDone = false
'''
if reset_marker not in text:
    raise SystemExit('Could not locate resetState')
text = text.replace(reset_marker, reset_replacement, 1)

helper_marker = '    private fun clearAdStateAndScheduleResume(reason: String) {\n'
helpers = '''    private fun scheduleExactSourceReassert() {
        if (exactSourceLaunchDone || exactSourceLaunchScheduled || !CaptureSession.isActive(this)) return
        val videoId = youtubeVideoId(CaptureSession.sourceUrl(this))
        if (videoId.isBlank()) return
        exactSourceLaunchScheduled = true
        RecorderDiagnostics.record(this, "youtube_exact_source_reassert_scheduled id=${videoId.take(16)}")
        handler.postDelayed(exactSourceRunnable, 700L)
    }

    private fun youtubeVideoId(raw: String?): String {
        if (raw.isNullOrBlank()) return ""
        return try {
            val uri = Uri.parse(raw)
            val host = uri.host?.lowercase().orEmpty()
            if (host != "youtu.be" && host != "youtube.com" && host != "www.youtube.com" && host != "m.youtube.com") return ""
            when {
                host == "youtu.be" -> uri.pathSegments.firstOrNull().orEmpty()
                !uri.getQueryParameter("v").isNullOrBlank() -> uri.getQueryParameter("v").orEmpty()
                uri.pathSegments.firstOrNull() in setOf("shorts", "embed", "live") -> uri.pathSegments.getOrNull(1).orEmpty()
                else -> ""
            }.trim()
        } catch (_: Exception) {
            ""
        }
    }

'''
if helper_marker not in text:
    raise SystemExit('Could not locate helper insertion point')
text = text.replace(helper_marker, helpers + helper_marker, 1)

path.write_text(text)
print('Patched YouTube accessibility service to reassert the exact WatchActivity after app selection settles')
