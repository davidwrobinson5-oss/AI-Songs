from pathlib import Path

path = Path('android-recorder/app/src/main/java/app/pie/recorder/PlaybackCaptureService.kt')
text = path.read_text()

old_normalize = '''    private fun normalizeProcessingResult(raw: String): String? {
        return try {
            val parsed = org.json.JSONObject(raw)
            val jobs = parsed.optJSONObject("jobs") ?: return null
            if (jobs.length() == 0) return null
            org.json.JSONObject()
                .put("version", 1)
                .put("jobs", jobs)
                .put("outputs", parsed.optJSONObject("outputs") ?: org.json.JSONObject())
                .put("title", parsed.optString("title", "Android playback recording"))
                .toString()
        } catch (_: Exception) {
            null
        }
    }
'''

new_normalize = '''    private fun normalizeProcessingResult(raw: String): String? {
        return try {
            val parsed = org.json.JSONObject(raw)
            if (parsed.optBoolean("awaitingSelection", false)) {
                val stagedPath = parsed.optString("stagedPath", "").trim()
                if (stagedPath.isBlank()) return null
                return org.json.JSONObject()
                    .put("version", 2)
                    .put("awaitingSelection", true)
                    .put("stagedPath", stagedPath)
                    .put("title", parsed.optString("title", "Android playback recording"))
                    .toString()
            }

            val jobs = parsed.optJSONObject("jobs") ?: return null
            if (jobs.length() == 0) return null
            org.json.JSONObject()
                .put("version", 1)
                .put("jobs", jobs)
                .put("outputs", parsed.optJSONObject("outputs") ?: org.json.JSONObject())
                .put("title", parsed.optString("title", "Android playback recording"))
                .toString()
        } catch (_: Exception) {
            null
        }
    }
'''

if old_normalize not in text:
    if 'optBoolean("awaitingSelection"' not in text:
        raise SystemExit('Could not locate normalizeProcessingResult')
else:
    text = text.replace(old_normalize, new_normalize, 1)

old_response = '''                val result = if (success) "accepted" else "processingFailed"
                reportCaptureStatus(id, secret, result, if (success) richResult else result)
                finishAutoUpload(result)
'''
new_response = '''                val awaitingSelection = if (success && richResult != null) {
                    try { org.json.JSONObject(richResult).optBoolean("awaitingSelection", false) } catch (_: Exception) { false }
                } else false
                val result = when {
                    !success -> "processingFailed"
                    awaitingSelection -> "accepted"
                    else -> "accepted"
                }
                reportCaptureStatus(id, secret, result, if (success) richResult else result)
                finishAutoUpload(if (awaitingSelection) "selectionReady" else result)
'''

if old_response not in text:
    if 'finishAutoUpload(if (awaitingSelection)' not in text:
        raise SystemExit('Could not locate upload response result block')
else:
    text = text.replace(old_response, new_response, 1)

old_notification = '''        val notification = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle(if (result == "accepted") "Recording sent to Pie" else "Pie recording needs attention")
            .setContentText(if (result == "accepted") "Processing has started" else "Tap to return to Pie")
'''
new_notification = '''        val notification = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle(
                when (result) {
                    "selectionReady" -> "Recording ready in Pie"
                    "accepted" -> "Recording sent to Pie"
                    else -> "Pie recording needs attention"
                }
            )
            .setContentText(
                when (result) {
                    "selectionReady" -> "Choose Sheets, Chords, or Stems in Pie"
                    "accepted" -> "Processing has started"
                    else -> "Tap to return to Pie"
                }
            )
'''

if old_notification in text:
    text = text.replace(old_notification, new_notification, 1)

path.write_text(text)
print('Patched Android upload flow to stage recordings and wait for Pie output selection')
