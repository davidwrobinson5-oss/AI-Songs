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
            // MediaProjection returns, which can overwrite an immediate YouTube deep-link
            // and leave the user on YouTube Home. Let that system transition settle first,
            // then open the exact requested source. The accessibility reassertion remains
            // as a second line of defense if YouTube changes activities again.
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
    # If a previously patched source block is present, make only the launch timing sticky.
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
        val isYouTube = host == "youtu.be" || host == "youtube.com" || host == "www.youtube.com" || host == "m.youtube.com"

        val videoId = when {
            host == "youtu.be" -> parsed.pathSegments.firstOrNull().orEmpty()
            parsed.getQueryParameter("v").orEmpty().isNotBlank() -> parsed.getQueryParameter("v").orEmpty()
            parsed.pathSegments.firstOrNull() in setOf("shorts", "embed", "live") -> parsed.pathSegments.getOrNull(1).orEmpty()
            else -> ""
        }.trim()

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

        val normalized = if (host == "m.youtube.com" || host == "youtube.com") {
            parsed.buildUpon().scheme("https").authority("www.youtube.com").build()
        } else {
            parsed
        }
        RecorderDiagnostics.record(this, "source_open_generic host=${normalized.host.orEmpty()}")
        startActivity(Intent(Intent.ACTION_VIEW, normalized))
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
print('Patched MainActivity to preserve the exact source and open YouTube after app-share selection settles')