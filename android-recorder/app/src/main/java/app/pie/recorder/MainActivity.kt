package app.pie.recorder

import android.Manifest
import android.app.Activity
import android.content.*
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.widget.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.io.IOException

class MainActivity : Activity() {
    private val projectionRequest = 7001
    private val audioPermissionRequest = 7002
    private lateinit var url: EditText
    private lateinit var status: TextView
    private lateinit var stems: CheckBox
    private lateinit var fullSheet: CheckBox
    private lateinit var partSheets: CheckBox
    private lateinit var chords: CheckBox
    private lateinit var process: Button
    private var savedPath: String? = null
    private var launchedFromPie = false
    private var returnUrl: String? = null
    private val client = OkHttpClient()

    private val savedReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            savedPath = intent?.getStringExtra(PlaybackCaptureService.EXTRA_PATH)
            runOnUiThread {
                if (savedPath != null && launchedFromPie) processRecording(true)
                else {
                    status.text = if (savedPath != null) "Recording saved. Ready to process." else "Recording stopped."
                    process.isEnabled = savedPath != null
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        val filter = IntentFilter(PlaybackCaptureService.ACTION_SAVED)
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(savedReceiver, filter, RECEIVER_NOT_EXPORTED)
        else @Suppress("DEPRECATION") registerReceiver(savedReceiver, filter)
        handlePieIntent(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handlePieIntent(intent)
    }

    private fun handlePieIntent(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "pie-recorder" || data.host != "capture") return
        launchedFromPie = true
        returnUrl = data.getQueryParameter("return")
        data.getQueryParameter("url")?.let { url.setText(it) }
        status.text = "Pie is starting playback capture…"
        beginCapture()
    }

    private fun buildUi() {
        val density = resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()
        val scroll = ScrollView(this)
        val root = LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setPadding(dp(20),dp(28),dp(20),dp(36));setBackgroundColor(Color.rgb(12,10,20)) }
        scroll.addView(root)
        root.addView(TextView(this).apply{text="Pie Playback Recorder";textSize=26f;setTextColor(Color.WHITE);setPadding(0,0,0,dp(8))})
        root.addView(TextView(this).apply{text="Pie uses this small Android helper for the system playback permission that websites cannot request directly.";textSize=16f;setTextColor(Color.LTGRAY);setPadding(0,0,0,dp(18))})
        url=EditText(this).apply{hint="https://m.youtube.com/watch?v=...";setTextColor(Color.WHITE);setHintTextColor(Color.GRAY);setSingleLine(true)};root.addView(url,LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(TextView(this).apply{text="What do you want to create?";textSize=19f;setTextColor(Color.WHITE);setPadding(0,dp(22),0,dp(8))})
        stems=choice("Stems",true,root);fullSheet=choice("Full Sheet Music",true,root);partSheets=choice("Individual Part Sheets",true,root);chords=choice("Chords",true,root)
        root.addView(Button(this).apply{text="● Record & Open Source";setOnClickListener{beginCapture()}},buttonParams(dp(12)))
        root.addView(Button(this).apply{text="■ Stop & Send to Pie";setOnClickListener{startService(Intent(this@MainActivity,PlaybackCaptureService::class.java).setAction(PlaybackCaptureService.ACTION_STOP));status.text="Stopping and saving WAV…"}},buttonParams(dp(8)))
        process=Button(this).apply{text="Process Recording in Pie";isEnabled=false;setOnClickListener{processRecording(false)}};root.addView(process,buttonParams(dp(8)))
        status=TextView(this).apply{text="Ready. Android will ask for screen/audio capture permission when you start.";textSize=16f;setTextColor(Color.rgb(210,205,235));setPadding(0,dp(18),0,0)};root.addView(status);setContentView(scroll)
    }

    private fun choice(label:String,checked:Boolean,parent:LinearLayout)=CheckBox(this).apply{text=label;isChecked=checked;textSize=17f;setTextColor(Color.WHITE);setPadding(0,6,0,6);parent.addView(this)}
    private fun buttonParams(top:Int)=LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT).apply{setMargins(0,top,0,0)}

    private fun beginCapture() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO),audioPermissionRequest);return }
        val manager=getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(manager.createScreenCaptureIntent(),projectionRequest)
    }

    override fun onRequestPermissionsResult(requestCode:Int,permissions:Array<out String>,grantResults:IntArray){super.onRequestPermissionsResult(requestCode,permissions,grantResults);if(requestCode==audioPermissionRequest&&grantResults.firstOrNull()==PackageManager.PERMISSION_GRANTED)beginCapture() else if(requestCode==audioPermissionRequest)status.text="Audio recording permission is required."}

    @Deprecated("Deprecated in Android SDK but retained for MediaProjection compatibility")
    override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?){
        super.onActivityResult(requestCode,resultCode,data)
        if(requestCode!=projectionRequest||resultCode!=RESULT_OK||data==null){if(requestCode==projectionRequest)status.text="Capture permission was not granted.";return}
        val service=Intent(this,PlaybackCaptureService::class.java).setAction(PlaybackCaptureService.ACTION_START).putExtra(PlaybackCaptureService.EXTRA_RESULT_CODE,resultCode).putExtra(PlaybackCaptureService.EXTRA_RESULT_DATA,data)
        startForegroundService(service);status.text="Recording system playback… return to Pie Recorder and tap Stop & Send when finished."
        val raw=url.text.toString().trim();if(raw.isNotEmpty())try{startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(raw)))}catch(_:Exception){status.text="Recording started. Could not open that URL automatically."}
    }

    private fun processRecording(autoReturn:Boolean=false){
        val path=savedPath?:return;val file=File(path);if(!file.exists()){status.text="The saved WAV could not be found.";return}
        if(!stems.isChecked&&!fullSheet.isChecked&&!partSheets.isChecked&&!chords.isChecked){status.text="Choose at least one output first.";return}
        process.isEnabled=false;status.text="Uploading WAV to Pie and starting processing…"
        val body=MultipartBody.Builder().setType(MultipartBody.FORM).addFormDataPart("file",file.name,file.asRequestBody("audio/wav".toMediaType())).addFormDataPart("title","Android playback recording").addFormDataPart("stems",stems.isChecked.toString()).addFormDataPart("fullSheet",fullSheet.isChecked.toString()).addFormDataPart("partSheets",partSheets.isChecked.toString()).addFormDataPart("chords",chords.isChecked.toString()).build()
        val request=Request.Builder().url("https://ai-songs-drobinhood-1.vercel.app/api/sheets/mobile-process").post(body).build()
        client.newCall(request).enqueue(object:Callback{
            override fun onFailure(call:Call,e:IOException)=runOnUiThread{status.text="Upload failed: ${e.message}";process.isEnabled=true}
            override fun onResponse(call:Call,response:Response){response.body?.close();runOnUiThread{if(response.isSuccessful){status.text="Recording sent to Pie. Processing has started.";if(autoReturn)returnToPie()}else status.text="Pie could not process the recording (${response.code}).";process.isEnabled=true}}
        })
    }

    private fun returnToPie(){
        val target=returnUrl?.takeIf{it.startsWith("https://")}?:"https://ai-songs-drobinhood-1.vercel.app"
        try{startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(target)));finish()}catch(_:Exception){status.text="Recording was sent to Pie. Return to the Pie browser tab."}
    }

    override fun onDestroy(){try{unregisterReceiver(savedReceiver)}catch(_:Exception){};super.onDestroy()}
}
