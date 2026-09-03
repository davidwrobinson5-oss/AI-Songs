from pathlib import Path

path = Path('android-recorder/app/src/main/java/app/pie/recorder/MainActivity.kt')
text = path.read_text()

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

        val normalized = if (host == "m.youtube.com" || host == "youtube.com") {
            parsed.buildUpon().scheme("https").authority("www.youtube.com").build()
        } else {
            parsed
        }

        if (isYouTube) {
            try {
                val direct = Intent(Intent.ACTION_VIEW, normalized).apply {
                    setPackage("com.google.android.youtube")
                    addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                }
                RecorderDiagnostics.record(
                    this,
                    "source_open_youtube_direct host=${normalized.host.orEmpty()} video=${normalized.getQueryParameter("v").orEmpty().take(16)}"
                )
                startActivity(direct)
                return
            } catch (e: Exception) {
                RecorderDiagnostics.record(this, "source_open_youtube_direct_fallback=${e.javaClass.simpleName}")
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
print('Patched MainActivity to normalize YouTube URLs and open the exact video directly in the YouTube app')
