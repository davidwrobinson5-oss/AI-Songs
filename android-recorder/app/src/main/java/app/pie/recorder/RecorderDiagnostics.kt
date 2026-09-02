package app.pie.recorder

import android.content.Context
import android.os.SystemClock

object RecorderDiagnostics {
    private const val PREFS = "pie_recorder_diagnostics"
    private const val KEY = "events"
    private const val MAX_EVENTS = 80

    @Synchronized
    fun reset(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, "")
            .apply()
        record(context, "diagnostics_reset")
    }

    @Synchronized
    fun record(context: Context, event: String) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val existing = prefs.getString(KEY, "").orEmpty()
        val timestamp = SystemClock.elapsedRealtime()
        val sanitized = event.replace('\n', ' ').take(220)
        val lines = (existing.lines().filter { it.isNotBlank() } + "$timestamp $sanitized")
            .takeLast(MAX_EVENTS)
        prefs.edit().putString(KEY, lines.joinToString("\n")).apply()
    }

    fun snapshot(context: Context): String {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY, "")
            .orEmpty()
        return if (raw.isBlank()) "No recorder diagnostics have been captured yet." else raw
    }
}
