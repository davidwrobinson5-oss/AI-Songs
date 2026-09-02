package app.pie.recorder

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

class DiagnosticsActivity : Activity() {
    private lateinit var logView: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = "Pie Recorder Diagnostics"

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(18), dp(18), dp(18))
        }

        root.addView(TextView(this).apply {
            text = "Pie Recorder Diagnostics"
            textSize = 22f
            setTypeface(typeface, Typeface.BOLD)
        })

        root.addView(TextView(this).apply {
            text = "After a failed YouTube → Pie return, open this screen and tap Copy diagnostics. The log shows what Android reported and what return action Pie attempted."
            textSize = 15f
            setPadding(0, dp(8), 0, dp(14))
        })

        val buttons = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val copyButton = Button(this).apply {
            text = "Copy diagnostics"
            setOnClickListener { copyDiagnostics() }
        }
        val refreshButton = Button(this).apply {
            text = "Refresh"
            setOnClickListener { refresh() }
        }
        val clearButton = Button(this).apply {
            text = "Clear"
            setOnClickListener {
                RecorderDiagnostics.reset(this@DiagnosticsActivity)
                refresh()
                Toast.makeText(this@DiagnosticsActivity, "Diagnostics cleared", Toast.LENGTH_SHORT).show()
            }
        }

        buttons.addView(copyButton, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        buttons.addView(refreshButton, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        buttons.addView(clearButton, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        root.addView(buttons)

        logView = TextView(this).apply {
            textSize = 13f
            typeface = Typeface.MONOSPACE
            setTextIsSelectable(true)
            setPadding(0, dp(14), 0, dp(18))
        }

        val scroll = ScrollView(this).apply {
            isFillViewport = true
            addView(logView, ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT
            ))
        }
        root.addView(scroll, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1f
        ))

        setContentView(root)
        refresh()
    }

    override fun onResume() {
        super.onResume()
        if (::logView.isInitialized) refresh()
    }

    private fun refresh() {
        logView.text = RecorderDiagnostics.snapshot(this)
    }

    private fun copyDiagnostics() {
        val text = RecorderDiagnostics.snapshot(this)
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("Pie Recorder Diagnostics", text))
        Toast.makeText(this, "Diagnostics copied", Toast.LENGTH_SHORT).show()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
