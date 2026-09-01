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
import kotlin.math.min

class PlaybackCaptureService : Service() {
    companion object {
        const val ACTION_START = "app.pie.recorder.START"
        const val ACTION_STOP = "app.pie.recorder.STOP"
        const val ACTION_AUTO_STOP = "app.pie.recorder.AUTO_STOP"
        const val ACTION_AUTO_FINISHED = "app.pie.recorder.AUTO_FINISHED"
        const val ACTION_PAUSE = "app.pie.recorder.PAUSE"
        const val ACTION_RESUME = "app.pie.recorder.RESUME"
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
        private const val YOUTUBE_END_SILENCE_MS = 1800L
        private const val OTHER_END_SILENCE_MS = 3200L
        private const val MIN_ACTIVE_CAPTURE_MS = 2500L
        private const val SPLICE_FADE_MS = 18
        private const val PIE_URL = "https://ai-songs-git-main-drobinhood1.vercel.app"
    }

    private var audioRecord: AudioRecord? = null
    private var worker: Thread? = null
    private val recording = AtomicBoolean(false)
    private val paused = AtomicBoolean(false)
    private val autoStopRequested = AtomicBoolean(false)
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
            ACTION_AUTO_STOP -> {
                autoStopRequested.set(true)
                paused.set(false)
                stopCapture()
            }
            ACTION_PAUSE -> {
                paused.set(true)
                if (recording.get()) showRecordingNotification(true)
            }
            ACTION_RESUME -> {
                paused.set(false)
                if (recording.get()) showRecordingNotification(false)
            }
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
        paused.set(false)
        autoStopRequested.set(false)

        showRecordingNotification(false)

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
        val channels = 2
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

        val silenceTimeout = if (isYouTubeSource(sourceUrl)) YOUTUBE_END_SILENCE_MS else OTHER_END_SILENCE_MS
        val fadeSamples = sampleRate * channels * SPLICE_FADE_MS / 1000

        worker = Thread {
            var autoFinished = false
            RandomAccessFile(file, "rw").use { wav ->
                writeHeader(wav, 0, sampleRate, channels)
                audioRecord?.startRecording()
                val buffer = ByteArray(bufferBytes)
                var pcmBytes = 0L
                val startedAt = SystemClock.elapsedRealtime()
                var heardAudio = false
                var lastSignalAt = startedAt
                var wasPaused = false
                var fadeInRemaining = 0

                while (recording.get()) {
                    val now = SystemClock.elapsedRealtime()
                    val isPaused = paused.get()

                    // Non-blocking reads are essential here. On several Samsung devices,
                    // a blocking AudioRecord.read() can wait forever after YouTube is paused,
                    // so the old silence timer never got a chance to fire.
                    val read = audioRecord?.read(
                        buffer,
                        0,
                        buffer.size,
                        AudioRecord.READ_NON_BLOCKING
                    ) ?: 0

                    if (isPaused) {
                        if (!wasPaused && read > 0) {
                            applyFadeOutToTail(wav, pcmBytes, sampleRate, channels)
                            wasPaused = true
                        }
                        // Ad filtering intentionally pauses capture. Keep the end watchdog
                        // alive so an ad pause is never mistaken for the user stopping playback.
                        lastSignalAt = now
                        if (read <= 0) try { Thread.sleep(20) } catch (_: InterruptedException) {}
                        continue
                    }

                    if (read <= 0) {
                        if (
                            heardAudio &&
                            now - startedAt >= MIN_ACTIVE_CAPTURE_MS &&
                            now - lastSignalAt >= silenceTimeout
                        ) {
                            autoFinished = true
                            recording.set(false)
                            break
                        }
                        try { Thread.sleep(20) } catch (_: InterruptedException) {}
                        continue
                    }

                    if (wasPaused) {
                        wasPaused = false
                        fadeInRemaining = fadeSamples
                        lastSignalAt = now
                    }

                    if (fadeInRemaining > 0) {
                        fadeInRemaining = applyFadeIn(buffer, read, fadeSamples, fadeInRemaining)
                    }

                    wav.write(buffer, 0, read)
                    pcmBytes += read

                    if (hasPlaybackSignal(buffer, read)) {
                        heardAudio = true
                        lastSignalAt = now
                    } else if (
                        heardAudio &&
                        now - startedAt >= MIN_ACTIVE_CAPTURE_MS &&
                        now - lastSignalAt >= silenceTimeout
                    ) {
                        autoFinished = true
                        recording.set(false)
                        break
                    }
                }

                if (autoStopRequested.get()) autoFinished = true
                try { audioRecord?.stop() } catch (_: Exception) {}
                writeHeader(wav, pcmBytes, sampleRate, channels)
            }

            projection.stop()

            if (autoFinished) {
                // Tell the accessibility bridge before ACTION_SAVED clears the Pie session.
                sendBroadcast(
                    Intent(ACTION_AUTO_FINISHED)
                        .setPackage(packageName)
                        .putExtra(EXTRA_RETURN_URL, returnUrl)
                )
            }

            sendBroadcast(Intent(ACTION_SAVED).setPackage(packageName).putExtra(EXTRA_PATH, file.absolutePath))

            if (autoFinished) {
                openPie("processing")
                uploadRecording(file)
            } else {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }.also { it.start() }
    }

    private fun showRecordingNotification(isPaused: Boolean) {
        val pauseResumeIntent = Intent(this, PlaybackCaptureService::class.java)
            .setAction(if (isPaused) ACTION_RESUME else ACTION_PAUSE)
        val pauseResumePending = PendingIntent.getService(
            this,
            44,
            pauseResumeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

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
            .setContentTitle(if (isPaused) "Pie capture paused for ad" else "Pie is recording playback audio")
            .setContentText(
                if (isPaused) "Pie is excluding the ad"
                else "Pie will finish automatically when playback stops"
            )
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .addAction(
                if (isPaused) android.R.drawable.ic_media_play else android.R.drawable.ic_media_pause,
                if (isPaused) "Resume song" else "Pause capture",
                pauseResumePending
            )
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop & return to Pie", stopPendingIntent)
            .build()

        if (recording.get()) {
            getSystemService(NotificationManager::class.java).notify(44, notification)
        } else {
            startForeground(44, notification)
        }
    }

    private fun applyFadeOutToTail(
        wav: RandomAccessFile,
        pcmBytes: Long,
        sampleRate: Int,
        channels: Int
    ) {
        if (pcmBytes < 4) return
        val requestedSamples = sampleRate * channels * SPLICE_FADE_MS / 1000
        val availableSamples = (pcmBytes / 2L).toInt()
        val sampleCount = min(requestedSamples, availableSamples)
        if (sampleCount <= 1) return

        val byteCount = sampleCount * 2
        val start = 44L + pcmBytes - byteCount
        val tail = ByteArray(byteCount)
        wav.seek(start)
        wav.readFully(tail)

        for (i in 0 until sampleCount) {
            val offset = i * 2
            val sample = decodePcm16(tail, offset)
            val gain = (sampleCount - 1 - i).toFloat() / (sampleCount - 1).toFloat()
            encodePcm16(tail, offset, (sample * gain).toInt())
        }

        wav.seek(start)
        wav.write(tail)
        wav.seek(44L + pcmBytes)
    }

    private fun applyFadeIn(
        buffer: ByteArray,
        length: Int,
        totalFadeSamples: Int,
        remainingSamples: Int
    ): Int {
        if (totalFadeSamples <= 1 || remainingSamples <= 0) return 0
        var remaining = remainingSamples
        var offset = 0
        while (offset + 1 < length && remaining > 0) {
            val processed = totalFadeSamples - remaining
            val gain = processed.toFloat() / (totalFadeSamples - 1).toFloat()
            val sample = decodePcm16(buffer, offset)
            encodePcm16(buffer, offset, (sample * gain).toInt())
            remaining--
            offset += 2
        }
        return remaining
    }

    private fun decodePcm16(data: ByteArray, offset: Int): Int {
        val lo = data[offset].toInt() and 0xff
        val hi = data[offset + 1].toInt()
        return ((hi shl 8) or lo).toShort().toInt()
    }

    private fun encodePcm16(data: ByteArray, offset: Int, value: Int) {
        val sample = value.coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
        data[offset] = (sample and 0xff).toByte()
        data[offset + 1] = ((sample shr 8) and 0xff).toByte()
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
            // Accessibility bridge handles the return if Android blocks this launch.
        }
    }

    private fun pieResultUri(result: String): Uri {
        val base = returnUrl?.takeIf(CaptureSession::isValidPieUrl) ?: PIE_URL
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
        paused.set(false)
        autoStopRequested.set(false)
        try { audioRecord?.release() } catch (_: Exception) {}
        super.onDestroy()
    }
}
