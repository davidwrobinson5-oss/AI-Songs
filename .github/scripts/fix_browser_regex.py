from pathlib import Path

path = Path('android-recorder/app/src/main/java/app/pie/recorder/YouTubeAdAccessibilityService.kt')
text = path.read_text()
old = r'Regex("^\d+\s+tabs?$")'
new = r'Regex("""^\d+\s+tabs?$""")'
if old not in text:
    raise SystemExit('Could not locate generated invalid Kotlin regex')
path.write_text(text.replace(old, new, 1))
print('Fixed Kotlin regex escaping in YouTubeAdAccessibilityService.kt')
