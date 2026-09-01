package app.pie.recorder

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class YouTubeAdAccessibilityService : AccessibilityService() {
    private val handler = Handler(Looper.getMainLooper())
    private var adActive = false

    private val resumeRunnable = Runnable {
        if (adActive) return@Runnable
        sendCaptureAction(PlaybackCaptureService.ACTION_RESUME)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.packageName?.toString() != YOUTUBE_PACKAGE) return
        val root = rootInActiveWindow ?: return
        val snapshot = buildString {
            collectText(root, this, 0)
            event.text.forEach { append(' ').append(it) }
            event.contentDescription?.let { append(' ').append(it) }
        }.lowercase()

        val nowAd = AD_MARKERS.any { snapshot.contains(it) }
        val ended = END_MARKERS.any { snapshot.contains(it) } && !nowAd

        if (nowAd) {
            handler.removeCallbacks(resumeRunnable)
            if (!adActive) {
                adActive = true
                sendCaptureAction(PlaybackCaptureService.ACTION_PAUSE)
            }
            return
        }

        if (adActive) {
            adActive = false
            handler.removeCallbacks(resumeRunnable)
            handler.postDelayed(resumeRunnable, RESUME_STABILITY_MS)
        } else {
            handler.removeCallbacks(resumeRunnable)
            handler.postDelayed(resumeRunnable, RESUME_STABILITY_MS)
        }

        if (ended) {
            handler.removeCallbacks(resumeRunnable)
            stopAndReturnToPie()
        }
    }

    override fun onInterrupt() {
        handler.removeCallbacks(resumeRunnable)
    }

    override fun onDestroy() {
        handler.removeCallbacks(resumeRunnable)
        super.onDestroy()
    }

    private fun sendCaptureAction(action: String) {
        try {
            startService(Intent(this, PlaybackCaptureService::class.java).setAction(action))
        } catch (_: Exception) {
            // Recorder may not be active yet; later YouTube events will retry automatically.
        }
    }

    private fun stopAndReturnToPie() {
        try {
            val uri = Uri.parse("pie-recorder://capture/stop").buildUpon()
                .appendQueryParameter("return", PIE_URL)
                .build()
            startActivity(Intent(Intent.ACTION_VIEW, uri).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            })
        } catch (_: Exception) {
            sendCaptureAction(PlaybackCaptureService.ACTION_STOP)
        }
    }

    private fun collectText(node: AccessibilityNodeInfo?, out: StringBuilder, depth: Int) {
        if (node == null || depth > 18) return
        node.text?.let { out.append(' ').append(it) }
        node.contentDescription?.let { out.append(' ').append(it) }
        for (i in 0 until node.childCount) {
            collectText(node.getChild(i), out, depth + 1)
        }
    }

    companion object {
        private const val YOUTUBE_PACKAGE = "com.google.android.youtube"
        private const val RESUME_STABILITY_MS = 1800L
        private const val PIE_URL = "https://ai-songs-git-main-drobinhood1.vercel.app"

        private val AD_MARKERS = listOf(
            "skip ad",
            "skip ads",
            "visit advertiser",
            "sponsored",
            "advertisement",
            "ad 1 of",
            "ad 2 of",
            "about this ad"
        )

        private val END_MARKERS = listOf(
            "replay video",
            "watch again",
            "replay"
        )
    }
}
