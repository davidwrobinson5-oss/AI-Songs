package app.pie.recorder

import android.app.*
import android.content.Context
import android.content.Intent
import android.media.*
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
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
import java.io.RandomAccessFile
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs

class PlaybackCaptureService : Service() {
    companion object {
        const val ACTION_START = "app.pie.recorder.START"
        const val ACTION_STOP = "app.pie.recorder.STOP"
        const val ACTION_SAVED = "app.pie.recorder.SAVED"
        const val EXTRA_RESULT_CODE = "resultCode"
        const val EXTRA_RESULT_DATA = "resultData"
        const val EXTRA_PATH = "path"
        const val EXTRA_RETURN_URL = "returnUrl"
        const val EXTRA_SOURCE_URL = "sourceUrl"
        const val EXTRA_STEMS = "stems"
        const val EXTRA_FULL_SHEET = "fullSheet"
        const val EXTRA_PART_SHEETS = "partSheets"
        const val EXTRA_CHORDS = "chords"
        const val CHANNEL_ID = "pie_capture"

        private const val SILENCE_THRESHOLD = 16
        private const val END_SILENCE_MS = 4000L
        private const val MIN_ACTIVE_CAPTURE_MS = 5000L
        private const val PIE_URL = "https://ai-songs-git-main-drobinhood1.vercel.app"
    }

    private var audioRecord: AudioRecord? = null
    private var worker: Thread? = null
    private val recording = AtomicBoolean(false)
    private var outputFile: File? = null
    private val client = OkHttpClient()

    private var returnUrl: String? = null
    private var sourceUrl: String? = null
    private var wantsStems = true
    private var wantsFullSheet = true
    private var wantsPartSheets = true
    private var wantsChords = true

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Pie audio capture", NotificationManager.IMPORTANCE_LOW)
            )
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startCapture(intent)
            ACTION_STOP -> stopCapture()
        }
        return START_NOT_STICKY
    }

    private fun startCapture(intent: Intent) {
        if (recording.get()) return

        returnUrl = intent.getStringExtra(EXTRA_RETURN_URL)
        sourceUrl = intent.getStringExtra(EXTRA_SOURCE_URL)
        wantsStems = intent.getBooleanExtra(EXTRA_STEMS, true)
        wantsFullSheet = intent.getBooleanExtra(EXTRA_FULL_SHEET, true)
        wantsPartSheets = intent.getBooleanExtra(EXTRA_PART_SHEETS, true)
        wantsChords = intent.getBooleanExtra(EXTRA_CHORDS, true)

        val stopUri = Uri.parse("pie-recorder://capture/stop").buildUpon()
            .appendQueryParameter("return", returnUrl ?: PIE_URL)
            .build()
        val stopIntent = Intent(Intent.ACTION_VIEW, stopUri, this, MainActivity::class.java)
        val stopPendingIntent = PendingIntent.getActivity(
            this,
            45,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Pie is recording playback audio")
            .setContentText("When finished, Pie will return for processing")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_media_pause, "Stop & return to Pie", stopPendingIntent)
            .build()
        startForeground(44, notification)

        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED)
        val resultData = if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
        } else {
            @Suppress("DEPRECATION") intent.getParcelableExtra(EXTRA_RESULT_DATA)
        } ?: run {
            stopSelf(); return
        }

        val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val projection = projectionManager.getMediaProjection(resultCode, resultData)
        val captureConfig = AudioPlaybackCaptureConfiguration.Builder(projection)
            .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
            .addMatchingUsage(AudioAttributes.USAGE_GAME)
            .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
            .build()

        val sampleRate = 32000
        val format = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(sampleRate)
            .setChannelMask(AudioFormat.CHANNEL_IN_STEREO)
            .build()
        val min = AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_STEREO, AudioFormat.ENCODING_PCM_16BIT)
        val bufferBytes = maxOf(min * 2, 64 * 1024)

        audioRecord = AudioRecord.Builder()
            .setAudioFormat(format)
            .setBufferSizeInBytes(bufferBytes)
            .setAudioPlaybackCaptureConfig(captureConfig)
            .build()

        val dir = File(getExternalFilesDir(null), "recordings").apply { mkdirs() }
        outputFile = File(dir, "pie_${System.currentTimeMillis()}.wav")
        val file = outputFile ?: return
        recording.set(true)

        val autoEndEnabled = isYouTubeSource(sourceUrl)

        worker = Thread {
            var autoFinished = false
            RandomAccessFile(file, "rw").use { wav ->
                writeHeader(wav, 0, sampleRate, 2)
                audioRecord?.startRecording()
                val buffer = ByteArray(bufferBytes)
                var pcmBytes = 0L
                val startedAt = SystemClock.elapsedRealtime()
                var heardAudio = false
                var lastSignalAt = startedAt

                while (recording.get()) {
                    val read = audioRecord?.read(buffer, 0, buffer.size) ?: 0
                    if (read > 0) {
                        wav.write(buffer, 0, read)
                        pcmBytes += read

                        val now = SystemClock.elapsedRealtime()
                        if (hasPlaybackSignal(buffer, read)) {
                            heardAudio = true
                            lastSignalAt = now
                        } else if (
                            autoEndEnabled &&
                            heardAudio &&
                            now - startedAt >= MIN_ACTIVE_CAPTURE_MS &&
                            now - lastSignalAt >= END_SILENCE_MS
                        ) {
                            autoFinished = true
                            recording.set(false)
                        }
                    }
                }

                try { audioRecord?.stop() } catch (_: Exception) {}
                writeHeader(wav, pcmBytes, sampleRate, 2)
            }

            projection.stop()
            sendBroadcast(Intent(ACTION_SAVED).setPackage(packageName).putExtra(EXTRA_PATH, file.absolutePath))

            if (autoFinished) {
                // Put the user back in Pie as soon as the YouTube playback ends, while
                // this foreground service continues the upload in the background.
                openPie("processing")
                uploadRecording(file)
            } else {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }.also { it.start() }
    }

    private fun hasPlaybackSignal(buffer: ByteArray, length: Int): Boolean {
        var i = 0
        while (i + 1 < length) {
            val sample = (buffer[i].toInt() and 0xff) or (buffer[i + 1].toInt() shl 8)
            if (abs(sample.toShort().toInt()) > SILENCE_THRESHOLD) return true
            i += 2
        }
        return false
    }

    private fun isYouTubeSource(raw: String?): Boolean {
        return try {
            val host = Uri.parse(raw).host?.lowercase().orEmpty()
            host == "youtu.be" || host.endsWith("youtube.com")
        } catch (_: Exception) {
            false
        }
    }

    private fun uploadRecording(file: File) {
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
            .url("$PIE_URL/api/sheets/mobile-process")
            .post(body)
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                finishAutoUpload("uploadFailed")
            }

            override fun onResponse(call: Call, response: Response) {
                val success = response.isSuccessful
                response.body?.close()
                finishAutoUpload(if (success) "accepted" else "processingFailed")
            }
        })
    }

    private fun finishAutoUpload(result: String) {
        val openPieIntent = Intent(Intent.ACTION_VIEW, pieResultUri(result))
        val pending = PendingIntent.getActivity(
            this,
            46,
            openPieIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle(if (result == "accepted") "Recording sent to Pie" else "Pie recording needs attention")
            .setContentText(if (result == "accepted") "Processing has started" else "Tap to return to Pie")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()
        getSystemService(NotificationManager::class.java).notify(47, notification)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun openPie(result: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, pieResultUri(result)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            startActivity(intent)
        } catch (_: Exception) {
            // Android may restrict background app switching. The completion notification
            // remains available as a user-initiated fallback.
        }
    }

    private fun pieResultUri(result: String): Uri {
        val base = returnUrl?.takeIf { it.startsWith("https://") } ?: PIE_URL
        return Uri.parse(base).buildUpon()
            .appendQueryParameter("pieCapture", result)
            .build()
    }

    private fun stopCapture() {
        recording.set(false)
    }

    private fun writeHeader(file: RandomAccessFile, pcmBytes: Long, sampleRate: Int, channels: Int) {
        val byteRate = sampleRate * channels * 2
        val dataSize = pcmBytes.toInt()
        file.seek(0)
        fun ascii(v: String) = file.write(v.toByteArray(Charsets.US_ASCII))
        fun le16(v: Int) { file.write(v and 0xff); file.write((v shr 8) and 0xff) }
        fun le32(v: Int) { file.write(v and 0xff); file.write((v shr 8) and 0xff); file.write((v shr 16) and 0xff); file.write((v shr 24) and 0xff) }
        ascii("RIFF"); le32(36 + dataSize); ascii("WAVE")
        ascii("fmt "); le32(16); le16(1); le16(channels); le32(sampleRate); le32(byteRate); le16(channels * 2); le16(16)
        ascii("data"); le32(dataSize)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        recording.set(false)
        try { audioRecord?.release() } catch (_: Exception) {}
        super.onDestroy()
    }
}
