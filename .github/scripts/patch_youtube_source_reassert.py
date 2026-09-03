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
        if (videoId.isBlank()) {
            RecorderDiagnostics.record(this, "youtube_exact_source_reassert_missing_video_id")
            return@Runnable
        }

        val watchUrl = Uri.parse("https://www.youtube.com/watch?v=$videoId")
        try {
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
        if (videoId.isBlank()) {
            RecorderDiagnostics.record(this, "youtube_exact_source_reassert_not_scheduled_missing_id")
            return
        }
        exactSourceLaunchScheduled = true
        RecorderDiagnostics.record(this, "youtube_exact_source_reassert_scheduled id=${videoId.take(16)}")
        handler.postDelayed(exactSourceRunnable, 700L)
    }

    private fun youtubeVideoId(raw: String?): String {
        if (raw.isNullOrBlank()) return ""

        val candidates = mutableListOf<String>()
        fun addCandidate(value: String?) {
            val clean = value?.trim().orEmpty()
            if (clean.isBlank() || candidates.contains(clean)) return
            candidates.add(clean)
            try {
                val decoded = Uri.decode(clean).trim()
                if (decoded.isNotBlank() && decoded != clean && !candidates.contains(decoded)) candidates.add(decoded)
            } catch (_: Exception) {}
        }
        addCandidate(raw)

        var index = 0
        while (index < candidates.size && index < 16) {
            val candidate = candidates[index++].trim()
            val absolute = when {
                candidate.startsWith("/") -> "https://www.youtube.com$candidate"
                candidate.startsWith("youtube.com/") || candidate.startsWith("www.youtube.com/") ||
                    candidate.startsWith("m.youtube.com/") || candidate.startsWith("music.youtube.com/") ||
                    candidate.startsWith("youtu.be/") -> "https://$candidate"
                else -> candidate
            }

            try {
                val uri = Uri.parse(absolute)
                val host = uri.host?.lowercase().orEmpty()
                val youtubeHost = host == "youtu.be" || host == "youtube.com" || host.endsWith(".youtube.com")
                if (youtubeHost) {
                    if (host == "youtu.be") {
                        cleanYouTubeVideoId(uri.pathSegments.firstOrNull())?.let { return it }
                    }

                    cleanYouTubeVideoId(uri.getQueryParameter("v"))?.let { return it }
                    cleanYouTubeVideoId(uri.getQueryParameter("vi"))?.let { return it }

                    val first = uri.pathSegments.firstOrNull()?.lowercase().orEmpty()
                    if (first in setOf("shorts", "embed", "live", "v")) {
                        cleanYouTubeVideoId(uri.pathSegments.getOrNull(1))?.let { return it }
                    }

                    for (key in listOf("u", "url", "q", "target", "continue")) {
                        addCandidate(uri.getQueryParameter(key))
                    }
                }
            } catch (_: Exception) {}

            val decoded = try { Uri.decode(candidate) } catch (_: Exception) { candidate }
            val patterns = listOf(
                Regex("(?:[?&](?:v|vi)=)([A-Za-z0-9_-]{6,})"),
                Regex("(?:youtu\\.be/|/(?:shorts|embed|live|v)/)([A-Za-z0-9_-]{6,})")
            )
            for (pattern in patterns) {
                pattern.find(decoded)?.groupValues?.getOrNull(1)?.let { found ->
                    cleanYouTubeVideoId(found)?.let { return it }
                }
            }
        }
        return ""
    }

    private fun cleanYouTubeVideoId(value: String?): String? {
        val candidate = value?.trim().orEmpty()
        if (candidate.isBlank()) return null
        return Regex("^[A-Za-z0-9_-]{6,}").find(candidate)?.value
    }

'''
if helper_marker not in text:
    raise SystemExit('Could not locate helper insertion point')
text = text.replace(helper_marker, helpers + helper_marker, 1)

path.write_text(text)
print('Patched YouTube accessibility reassertion with robust share/redirect URL parsing')
