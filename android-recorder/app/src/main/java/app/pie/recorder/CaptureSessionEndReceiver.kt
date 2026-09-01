package app.pie.recorder

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class CaptureSessionEndReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action == PlaybackCaptureService.ACTION_SAVED) {
            CaptureSession.end(context)
        }
    }
}
