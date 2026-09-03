from pathlib import Path

path = Path('android-recorder/app/src/main/java/app/pie/recorder/MainActivity.kt')
text = path.read_text()

# Preserve the exact source URL in the durable capture session.
text = text.replace(
    '        CaptureSession.begin(this, requestedReturn!!)\n        pendingSourceUrl = data.getQueryParameter("url")\n',
    '        pendingSourceUrl = data.getQueryParameter("url")\n        CaptureSession.begin(this, requestedReturn!!, pendingSourceUrl)\n',
    1,
)

old = '''        val raw = pendingSourceUrl?.trim().orEmpty()
        if (raw.isNotEmpty()) {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(raw)))
                RecorderDiagnostics.record(this, "source_opened_remove_helper_task")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) finishAndRemoveTask() else finish()
            } catch (_: Exception) {
                CaptureSession.end(this)
                returnToPie("sourceOpenFailed")
            }
        } else {
            returnToPie("recordingStarted")
        }
'''

new = '''        val raw = pendingSourceUrl?.trim().orEmpty()
        if (raw.isNotEmpty()) {
            // Android's "Share one app" flow can foreground the selected app *after*
            // MediaProjection returns. Let that system transition settle, then open
            // the exact requested source. The accessibility reassertion is a backup.
            RecorderDiagnostics.record(this, "source_exact_launch_waiting_for_app_share_settle")
            handler.postDelayed({
                if (!CaptureSession.isActive(this)) return@postDelayed
                try {
                    openExactSource(raw)
                    RecorderDiagnostics.record(this, "source_opened_exact_after_share_settle")
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) finishAndRemoveTask() else finish()
                } catch (_: Exception) {
                    CaptureSession.end(this)
                    returnToPie("sourceOpenFailed")
                }
            }, 1100L)
        } else {
            returnToPie("recordingStarted")
        }
'''

if 'private fun openExactSource' not in text:
    if old not in text:
        raise SystemExit('Could not locate source launch block')
    text = text.replace(old, new, 1)
else:
    immediate = '''        val raw = pendingSourceUrl?.trim().orEmpty()
        if (raw.isNotEmpty()) {
            try {
                openExactSource(raw)
                RecorderDiagnostics.record(this, "source_opened_remove_helper_task")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) finishAndRemoveTask() else finish()
            } catch (_: Exception) {
                CaptureSession.end(this)
                returnToPie("sourceOpenFailed")
            }
        } else {
            returnToPie("recordingStarted")
        }
'''
    if immediate in text:
        text = text.replace(immediate, new, 1)

marker = '''    private fun processRecording(returnOnCompletion: Boolean = true) {
'''
helper = '''    private fun openExactSource(raw: String) {
        val parsed = Uri.parse(raw)
        val host = parsed.host?.lowercase().orEmpty()
        val isYouTube = host == "youtu.be" || host == "youtube.com" || host.endsWith(".youtube.com")
        val videoId = youtubeVideoId(raw)

        if (isYouTube && videoId.isNotBlank()) {
            val watchUrl = Uri.parse("https://www.youtube.com/watch?v=$videoId")

            try {
                val directWatch = Intent(Intent.ACTION_VIEW, watchUrl).apply {
                    setClassName("com.google.android.youtube", "com.google.android.youtube.WatchActivity")
                    putExtra("VIDEO_ID", videoId)
                }
                RecorderDiagnostics.record(this, "source_open_youtube_watch_activity id=${videoId.take(16)}")
                startActivity(directWatch)
                return
            } catch (e: Exception) {
                RecorderDiagnostics.record(this, "source_open_youtube_watch_activity_fallback=${e.javaClass.simpleName}")
            }

            try {
                val native = Intent(Intent.ACTION_VIEW, Uri.parse("vnd.youtube:$videoId")).apply {
                    setPackage("com.google.android.youtube")
                    putExtra("VIDEO_ID", videoId)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                RecorderDiagnostics.record(this, "source_open_youtube_video_id id=${videoId.take(16)}")
                startActivity(native)
                return
            } catch (e: Exception) {
                RecorderDiagnostics.record(this, "source_open_youtube_video_id_fallback=${e.javaClass.simpleName}")
            }

            try {
                val directWeb = Intent(Intent.ACTION_VIEW, watchUrl).apply {
                    setPackage("com.google.android.youtube")
                    putExtra("VIDEO_ID", videoId)
                }
                RecorderDiagnostics.record(this, "source_open_youtube_web_fallback id=${videoId.take(16)}")
                startActivity(directWeb)
                return
            } catch (e: Exception) {
                RecorderDiagnostics.record(this, "source_open_youtube_web_fallback_failed=${e.javaClass.simpleName}")
            }
        }

        if (isYouTube) {
            val queryKeys = try { parsed.queryParameterNames.sorted().joinToString(",") } catch (_: Exception) { "unknown" }
            RecorderDiagnostics.record(
                this,
                "source_youtube_video_id_missing host=$host path=${parsed.path.orEmpty()} queryKeys=$queryKeys"
            )
        }

        val normalized = if (host == "m.youtube.com" || host == "youtube.com") {
            parsed.buildUpon().scheme("https").authority("www.youtube.com").build()
        } else {
            parsed
        }
        RecorderDiagnostics.record(this, "source_open_generic host=${normalized.host.orEmpty()}")
        startActivity(Intent(Intent.ACTION_VIEW, normalized))
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
                val candidateHost = uri.host?.lowercase().orEmpty()
                val youtubeHost = candidateHost == "youtu.be" || candidateHost == "youtube.com" || candidateHost.endsWith(".youtube.com")
                if (youtubeHost) {
                    if (candidateHost == "youtu.be") {
                        cleanYouTubeVideoId(uri.pathSegments.firstOrNull())?.let { return it }
                    }

                    cleanYouTubeVideoId(uri.getQueryParameter("v"))?.let { return it }
                    cleanYouTubeVideoId(uri.getQueryParameter("vi"))?.let { return it }

                    val first = uri.pathSegments.firstOrNull()?.lowercase().orEmpty()
                    if (first in setOf("shorts", "embed", "live", "v")) {
                        cleanYouTubeVideoId(uri.pathSegments.getOrNull(1))?.let { return it }
                    }

                    // Shared/redirected YouTube links can wrap the actual watch URL.
                    for (key in listOf("u", "url", "q", "target", "continue")) {
                        addCandidate(uri.getQueryParameter(key))
                    }
                }
            } catch (_: Exception) {}

            // Last-resort extraction also handles partially/double encoded share URLs.
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

if 'private fun openExactSource' in text:
    start = text.index('    private fun openExactSource(raw: String) {')
    end = text.index(marker, start)
    text = text[:start] + helper + text[end:]
else:
    if marker not in text:
        raise SystemExit('Could not locate helper insertion point')
    text = text.replace(marker, helper + marker, 1)

path.write_text(text)
print('Patched MainActivity with robust YouTube share/redirect URL parsing and exact video launch')
