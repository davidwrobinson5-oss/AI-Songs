from pathlib import Path

path = Path('android-recorder/app/src/main/java/app/pie/recorder/MainActivity.kt')
text = path.read_text()

# Idempotent: once the exact launch logic lives in source, this legacy build patch
# becomes a no-op instead of replacing or fighting with it.
if 'vnd.youtube:' in text and 'private fun openExactSource' in text:
    print('Exact YouTube source launch already present in MainActivity; no patch needed')
    raise SystemExit(0)

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

if old not in text:
    raise SystemExit('Could not locate source launch block')
text = text.replace(old, new, 1)

marker = '''    private fun processRecording(returnOnCompletion: Boolean = true) {
'''
helper = '''    private fun openExactSource(raw: String) {
        val parsed = Uri.parse(raw)
        val host = parsed.host?.lowercase().orEmpty()
        val isYouTube = host == "youtu.be" || host == "youtube.com" || host == "www.youtube.com" || host == "m.youtube.com"

        val videoId = when {
            host == "youtu.be" -> parsed.pathSegments.firstOrNull().orEmpty()
            parsed.getQueryParameter("v").orEmpty().isNotBlank() -> parsed.getQueryParameter("v").orEmpty()
            parsed.pathSegments.firstOrNull() in setOf("shorts", "embed", "live") -> parsed.pathSegments.getOrNull(1).orEmpty()
            else -> ""
        }.trim()

        if (isYouTube && videoId.isNotBlank()) {
            try {
                // Use YouTube's native video URI. Do NOT use FLAG_ACTIVITY_CLEAR_TOP:
                // on Samsung/YouTube that can revive the existing YouTube task and
                // ignore the requested watch URL, landing on Home/current content.
                val direct = Intent(Intent.ACTION_VIEW, Uri.parse("vnd.youtube:$videoId")).apply {
                    setPackage("com.google.android.youtube")
                }
                RecorderDiagnostics.record(this, "source_open_youtube_video_id id=${videoId.take(16)}")
                startActivity(direct)
                return
            } catch (e: Exception) {
                RecorderDiagnostics.record(this, "source_open_youtube_video_id_fallback=${e.javaClass.simpleName}")
            }
        }

        val normalized = if (host == "m.youtube.com" || host == "youtube.com") {
            parsed.buildUpon().scheme("https").authority("www.youtube.com").build()
        } else {
            parsed
        }

        if (isYouTube) {
            try {
                val directWeb = Intent(Intent.ACTION_VIEW, normalized).apply {
                    setPackage("com.google.android.youtube")
                }
                RecorderDiagnostics.record(this, "source_open_youtube_web_fallback uri=$normalized")
                startActivity(directWeb)
                return
            } catch (e: Exception) {
                RecorderDiagnostics.record(this, "source_open_youtube_web_fallback_failed=${e.javaClass.simpleName}")
            }
        }

        RecorderDiagnostics.record(this, "source_open_generic host=${normalized.host.orEmpty()}")
        startActivity(Intent(Intent.ACTION_VIEW, normalized))
    }

'''

if marker not in text:
    raise SystemExit('Could not locate helper insertion point')
text = text.replace(marker, helper + marker, 1)

path.write_text(text)
print('Patched MainActivity to force the exact YouTube video by native video ID')
