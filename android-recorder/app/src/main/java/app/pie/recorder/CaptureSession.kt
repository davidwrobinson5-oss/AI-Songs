package app.pie.recorder

import android.content.Context
import android.net.Uri

object CaptureSession {
    private const val PREFS = "pie_capture_session"
    private const val KEY_ACTIVE = "active"
    private const val KEY_RETURN_URL = "return_url"
    private const val KEY_SOURCE_URL = "source_url"
    private const val KEY_STARTED_AT = "started_at"
    private const val MAX_SESSION_MS = 60 * 60 * 1000L

    private const val STABLE_PIE_HOST = "ai-songs-git-main-drobinhood1.vercel.app"

    fun isValidPieUrl(raw: String?): Boolean {
        if (raw.isNullOrBlank()) return false
        return try {
            val uri = Uri.parse(raw)
            val host = uri.host?.lowercase().orEmpty()
            uri.scheme == "https" && (
                host == STABLE_PIE_HOST ||
                    (host.startsWith("ai-songs-") && host.endsWith("-drobinhood1.vercel.app"))
                )
        } catch (_: Exception) {
            false
        }
    }

    fun begin(context: Context, returnUrl: String, sourceUrl: String? = null) {
        if (!isValidPieUrl(returnUrl)) return
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_ACTIVE, true)
            .putString(KEY_RETURN_URL, returnUrl)
            .putString(KEY_SOURCE_URL, sourceUrl?.trim().orEmpty())
            .putLong(KEY_STARTED_AT, System.currentTimeMillis())
            .apply()
    }

    fun isActive(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_ACTIVE, false)) return false
        val startedAt = prefs.getLong(KEY_STARTED_AT, 0L)
        val valid = startedAt > 0L && System.currentTimeMillis() - startedAt <= MAX_SESSION_MS
        if (!valid) end(context)
        return valid
    }

    fun returnUrl(context: Context): String? {
        if (!isActive(context)) return null
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_RETURN_URL, null)
            ?.takeIf(::isValidPieUrl)
    }

    fun sourceUrl(context: Context): String? {
        if (!isActive(context)) return null
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_SOURCE_URL, null)
            ?.trim()
            ?.takeIf { it.isNotBlank() }
    }

    fun end(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .clear()
            .apply()
    }
}
