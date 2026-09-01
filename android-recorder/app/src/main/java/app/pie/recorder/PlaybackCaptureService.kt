package app.pie.recorder

import android.app.*
import android.content.Context
import android.content.Intent
import android.media.*
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import java.io.File
import java.io.RandomAccessFile
import java.util.concurrent.atomic.AtomicBoolean

class PlaybackCaptureService : Service() {
    companion object {
        const val ACTION_START = "app.pie.recorder.START"
        const val ACTION_STOP = "app.pie.recorder.STOP"
        const val ACTION_SAVED = "app.pie.recorder.SAVED"
        const val EXTRA_RESULT_CODE = "resultCode"
        const val EXTRA_RESULT_DATA = "resultData"
        const val EXTRA_PATH = "path"
        const val CHANNEL_ID = "pie_capture"
    }

    private var audioRecord: AudioRecord? = null
    private var worker: Thread? = null
    private val recording = AtomicBoolean(false)
    private var outputFile: File? = null

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Pie audio capture", NotificationManager.IMPORTANCE_LOW))
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

        val notification = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Pie is recording playback audio")
            .setContentText("Return to Pie when the song is finished")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
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

        worker = Thread {
            RandomAccessFile(file, "rw").use { wav ->
                writeHeader(wav, 0, sampleRate, 2)
                audioRecord?.startRecording()
                val buffer = ByteArray(bufferBytes)
                var pcmBytes = 0L
                while (recording.get()) {
                    val read = audioRecord?.read(buffer, 0, buffer.size) ?: 0
                    if (read > 0) {
                        wav.write(buffer, 0, read)
                        pcmBytes += read
                    }
                }
                try { audioRecord?.stop() } catch (_: Exception) {}
                writeHeader(wav, pcmBytes, sampleRate, 2)
            }
            projection.stop()
            sendBroadcast(Intent(ACTION_SAVED).setPackage(packageName).putExtra(EXTRA_PATH, file.absolutePath))
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }.also { it.start() }
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
