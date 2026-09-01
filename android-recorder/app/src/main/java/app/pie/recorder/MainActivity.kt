package app.pie.recorder

import android.Manifest
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.Response
import java.io.File
import java.io.IOException

class MainActivity : Activity() {
    private val projectionRequest = 7001
    private val audioPermissionRequest = 7002
    private val accessibilitySettingsRequest = 7003
    private val client = OkHttpClient()
    private val handler = Handler(Looper.getMainLooper())

    private var savedPath: String? = null
    private var returnUrl: String? = null
    private var pendingSourceUrl: String? = null
    private var autoProcessAfterSave = false
    private var returnedToPieAfterStop = false
    private var wantsStems = true
    private var wantsFullSheet = true
    private var wantsPartSheets = true
    private var wantsChords = true
    private var connectionChecks = 0

    private val savedReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            savedPath = intent?.getStringExtra(PlaybackCaptureService.EXTRA_PATH)
            if (savedPath != null && autoProcessAfterSave) {
                processRecording(returnOnCompletion = false)
                returnedToPieAfterStop = true
                returnToPie("processing")
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(android.R.style.Theme_Translucent_NoTitleBar)
        super.onCreate(savedInstanceState)
        makePopupOnlyWindow()

        val filter = IntentFilter(PlaybackCaptureService.ACTION_SAVED)
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(savedReceiver, filter, RECEIVER_NOT_EXPORTED)
        else @Suppress("DEPRECATION") registerReceiver(savedReceiver, filter)

        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun makePopupOnlyWindow() {
        window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        window.decorView.setBackgroundColor(Color.TRANSPARENT)
        window.setDimAmount(0f)
        setContentView(View(this).apply { setBackgroundColor(Color.TRANSPARENT) })
    }

    private fun handleIntent(intent: Intent?) {
        val data = intent?.data
        if (data?.scheme != "pie-recorder" || data.host != "capture") {
            finish()
            return
        }

        val requestedReturn = data.getQueryParameter("return")
        val action = data.pathSegments.firstOrNull()?.lowercase()

        if (action == "stop") {
            if (!CaptureSession.isActive(this)) {
                finish()
                return
            }
            returnUrl = CaptureSession.returnUrl(this)
            autoProcessAfterSave = true
            returnedToPieAfterStop = false
            startService(Intent(this, PlaybackCaptureService::class.java).setAction(PlaybackCaptureService.ACTION_STOP))
            return
        }

        if (!CaptureSession.isValidPieUrl(requestedReturn)) {
            finish()
            return
        }

        returnUrl = requestedReturn
        CaptureSession.begin(this, requestedReturn!!)
        pendingSourceUrl = data.getQueryParameter("url")
        wantsStems = data.getQueryParameter("stems")?.toBooleanStrictOrNull() ?: true
        wantsFullSheet = data.getQueryParameter("fullSheet")?.toBooleanStrictOrNull() ?: true
        wantsPartSheets = data.getQueryParameter("partSheets")?.toBooleanStrictOrNull() ?: true
        wantsChords = data.getQueryParameter("chords")?.toBooleanStrictOrNull() ?: true
        autoProcessAfterSave = false
        beginCapture()
    }

    private fun beginCapture() {
        if (!CaptureSession.isActive(this)) {
            finish()
            return
        }

        if (!isReturnAccessibilityEnabled()) {
            openAccessibilitySettings()
            return
        }

        if (!YouTubeAdAccessibilityService.isConnected) {
            if (connectionChecks++ < 8) {
                handler.postDelayed({ beginCapture() }, 250L)
            } else {
                connectionChecks = 0
                openAccessibilitySettings()
            }
            return
        }
        connectionChecks = 0

        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), audioPermissionRequest)
            return
        }

        val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(manager.createScreenCaptureIntent(), projectionRequest)
    }

    private fun openAccessibilitySettings() {
        try {
            startActivityForResult(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS), accessibilitySettingsRequest)
        } catch (_: Exception) {
            CaptureSession.end(this)
            finish()
        }
    }

    private fun isReturnAccessibilityEnabled(): Boolean {
        val expected = ComponentName(this, YouTubeAdAccessibilityService::class.java)
        val enabled = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES).orEmpty()
        for (entry in enabled.split(':')) {
            val component = ComponentName.unflattenFromString(entry) ?: continue
            if (component == expected) return true
        }
        return false
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != audioPermissionRequest) return
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) beginCapture()
        else {
            CaptureSession.end(this)
            returnToPie("audioPermissionDenied")
        }
    }

    @Deprecated("Deprecated in Android SDK but retained for MediaProjection/settings compatibility")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode == accessibilitySettingsRequest) {
            connectionChecks = 0
            if (isReturnAccessibilityEnabled()) beginCapture()
            else {
                CaptureSession.end(this)
                finish()
            }
            return
        }

        if (requestCode != projectionRequest) return
        if (resultCode != RESULT_OK || data == null) {
            CaptureSession.end(this)
            returnToPie("captureCanceled")
            return
        }
        if (!CaptureSession.isActive(this) || !YouTubeAdAccessibilityService.isConnected) {
            CaptureSession.end(this)
            openAccessibilitySettings()
            return
        }

        val service = Intent(this, PlaybackCaptureService::class.java)
            .setAction(PlaybackCaptureService.ACTION_START)
            .putExtra(PlaybackCaptureService.EXTRA_RESULT_CODE, resultCode)
            .putExtra(PlaybackCaptureService.EXTRA_RESULT_DATA, data)
            .putExtra(PlaybackCaptureService.EXTRA_RETURN_URL, returnUrl)
            .putExtra(PlaybackCaptureService.EXTRA_SOURCE_URL, pendingSourceUrl)
            .putExtra(PlaybackCaptureService.EXTRA_STEMS, wantsStems)
            .putExtra(PlaybackCaptureService.EXTRA_FULL_SHEET, wantsFullSheet)
            .putExtra(PlaybackCaptureService.EXTRA_PART_SHEETS, wantsPartSheets)
            .putExtra(PlaybackCaptureService.EXTRA_CHORDS, wantsChords)
        startForegroundService(service)

        val raw = pendingSourceUrl?.trim().orEmpty()
        if (raw.isNotEmpty()) {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(raw)))
                finish()
            } catch (_: Exception) {
                CaptureSession.end(this)
                returnToPie("sourceOpenFailed")
            }
        } else {
            returnToPie("recordingStarted")
        }
    }

    private fun processRecording(returnOnCompletion: Boolean = true) {
        val path = savedPath ?: return
        val file = File(path)
        if (!file.exists()) {
            if (returnOnCompletion && !returnedToPieAfterStop) returnToPie("recordingMissing")
            return
        }

        val body = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("file", file.name, file.asRequestBody("audio/wav".toMediaType()))
            .addFormDataPart("title", "Android playback recording")
            .addFormDataPart("stems", wantsStems.toString())
            .addFormDataPart("fullSheet", wantsFullSheet.toString())
            .addFormDataPart("partSheets", wantsPartSheets.toString())
            .addFormDataPart("chords", wantsChords.toString())
            .build()

        val request = Request.Builder()
            .url("https://ai-songs-git-main-drobinhood1.vercel.app/api/sheets/mobile-process")
            .post(body)
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (returnOnCompletion && !returnedToPieAfterStop) runOnUiThread { returnToPie("uploadFailed") }
            }

            override fun onResponse(call: Call, response: Response) {
                val success = response.isSuccessful
                response.body?.close()
                if (returnOnCompletion && !returnedToPieAfterStop) {
                    runOnUiThread { returnToPie(if (success) "accepted" else "processingFailed") }
                }
            }
        })
    }

    private fun returnToPie(result: String) {
        val base = returnUrl?.takeIf(CaptureSession::isValidPieUrl) ?: "https://ai-songs-git-main-drobinhood1.vercel.app"
        val uri = Uri.parse(base).buildUpon().appendQueryParameter("pieCapture", result).build()
        openPie(uri.toString())
    }

    private fun openPie(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: Exception) {
        } finally {
            finish()
        }
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        try { unregisterReceiver(savedReceiver) } catch (_: Exception) {}
        super.onDestroy()
    }
}
