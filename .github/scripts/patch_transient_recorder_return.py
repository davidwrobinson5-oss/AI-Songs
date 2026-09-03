from pathlib import Path

path = Path('android-recorder/app/src/main/java/app/pie/recorder/YouTubeAdAccessibilityService.kt')
text = path.read_text()

old_precheck = '''        val before = activePackage()
        if (before != YOUTUBE_PACKAGE) {
            settleBackStackLanding(expectedBrowser, before, "precheck_$attempt")
            return
        }
'''
new_precheck = '''        val before = activePackage()
        val transient = before == YOUTUBE_PACKAGE || before == packageName
        if (!transient) {
            settleBackStackLanding(expectedBrowser, before, "precheck_$attempt")
            return
        }
'''
if old_precheck not in text:
    raise SystemExit('Could not locate back-stack precheck')
text = text.replace(old_precheck, new_precheck, 1)

old_verify = '''            if (active == YOUTUBE_PACKAGE && attempt + 1 < YOUTUBE_BACK_ATTEMPTS) {
                backOutOfYouTube(expectedBrowser, attempt + 1)
            } else if (active == YOUTUBE_PACKAGE) {
                RecorderDiagnostics.record(this, "return_back_stack_exhausted")
                openRecentsAndSelectBrowser(expectedBrowser, 0)
            } else {
                settleBackStackLanding(expectedBrowser, active, "attempt_$attempt")
            }
'''
new_verify = '''            val transient = active == YOUTUBE_PACKAGE || active == packageName
            if (transient && attempt + 1 < YOUTUBE_BACK_ATTEMPTS) {
                RecorderDiagnostics.record(this, "return_back_stack_skip_transient attempt=$attempt active=${active ?: "null"}")
                backOutOfYouTube(expectedBrowser, attempt + 1)
            } else if (transient) {
                RecorderDiagnostics.record(this, "return_back_stack_exhausted active=${active ?: "null"}")
                openRecentsAndSelectBrowser(expectedBrowser, 0)
            } else {
                settleBackStackLanding(expectedBrowser, active, "attempt_$attempt")
            }
'''
if old_verify not in text:
    raise SystemExit('Could not locate back-stack verify block')
text = text.replace(old_verify, new_verify, 1)

old_attempts = '        private const val YOUTUBE_BACK_ATTEMPTS = 3\n'
new_attempts = '        private const val YOUTUBE_BACK_ATTEMPTS = 5\n'
if old_attempts not in text:
    raise SystemExit('Could not locate back-stack attempt count')
text = text.replace(old_attempts, new_attempts, 1)

path.write_text(text)
print('Patched return flow to skip Pie Recorder transient activity and continue to the original Pie host')
