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
    private var hasSeenPlaying = false
    private var pendingStop = false

    private val resumeRunnable = Runnable {
        if (!CaptureSession.isActive(this) || adActive || pendingStop) return@Runnable
        sendCaptureAction(PlaybackCaptureService.ACTION_RESUME)
    }

    private val stoppedRunnable = Runnable {
        if (!CaptureSession.isActive(this) || !pendingStop || adActive || !hasSeenPlaying) return@Runnable
        pendingStop = false
        stopAndReturnToPie()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (!CaptureSession.isActive(this)) {
            resetState()
            return
        }
        if (event?.packageName?.toString() != YOUTUBE_PACKAGE) return

        val root = rootInActiveWindow ?: return
        val snapshot = buildString {
            collectText(root, this, 0)
            event.text.forEach { append(' ').append(it) }
            event.contentDescription?.let { append(' ').append(it) }
        }.lowercase()

        val nowAd = AD_MARKERS.any { snapshot.contains(it) }
        val ended = END_MARKERS.any { snapshot.contains(it) } && !nowAd
        val showsPauseControl = PLAYING_MARKERS.any { snapshot.contains(it) } && !nowAd
        val showsPlayControl = STOPPED_MARKERS.any { snapshot.contains(it) } && !nowAd

        if (nowAd) {
            pendingStop = false
            handler.removeCallbacks(stoppedRunnable)
            handler.removeCallbacks(resumeRunnable)
            if (!adActive) {
                adActive = true
                sendCaptureAction(PlaybackCaptureService.ACTION_PAUSE)
            }
            return
        }

        if (showsPauseControl) {
            hasSeenPlaying = true
            pendingStop = false
            handler.removeCallbacks(stoppedRunnable)
        }

        if (ended) {
            pendingStop = false
            handler.removeCallbacks(stoppedRunnable)
            handler.removeCallbacks(resumeRunnable)
            stopAndReturnToPie()
            return
        }

        if (hasSeenPlaying && showsPlayControl) {
            pendingStop = true
            handler.removeCallbacks(resumeRunnable)
            handler.removeCallbacks(stoppedRunnable)
            handler.postDelayed(stoppedRunnable, STOP_STABILITY_MS)
            return
        }

        if (adActive) {
            adActive = false
            handler.removeCallbacks(resumeRunnable)
            handler.postDelayed(resumeRunnable, RESUME_STABILITY_MS)
        } else if (!pendingStop) {
            handler.removeCallbacks(resumeRunnable)
            handler.postDelayed(resumeRunnable, RESUME_STABILITY_MS)
        }
    }

    override fun onInterrupt() {
        resetState()
    }

    override fun onDestroy() {
        resetState()
        super.onDestroy()
    }

    private fun resetState() {
        handler.removeCallbacks(resumeRunnable)
        handler.removeCallbacks(stoppedRunnable)
        adActive = false
        hasSeenPlaying = false
        pendingStop = false
    }

    private fun sendCaptureAction(action: String) {
        if (!CaptureSession.isActive(this)) return
        try {
            startService(Intent(this, PlaybackCaptureService::class.java).setAction(action))
        } catch (_: Exception) {
            // Recorder may not be active yet; later YouTube events will retry automatically.
        }
    }

    private fun stopAndReturnToPie() {
        val pieReturn = CaptureSession.returnUrl(this) ?: return
        try {
            val uri = Uri.parse("pie-recorder://capture/stop").buildUpon()
                .appendQueryParameter("return", pieReturn)
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
        private const val STOP_STABILITY_MS = 1500L

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

        private val PLAYING_MARKERS = listOf(
            "pause video",
            "pause"
        )

        private val STOPPED_MARKERS = listOf(
            "play video",
            "play"
        )

        private val END_MARKERS = listOf(
            "replay video",
            "watch again",
            "replay"
        )
    }
}
