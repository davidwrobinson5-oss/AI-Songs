from pathlib import Path

path = Path('android-recorder/app/src/main/java/app/pie/recorder/YouTubeAdAccessibilityService.kt')
text = path.read_text()

old_regex = r'Regex("^\d+\s+tabs?$")'
new_regex = r'Regex("""^\d+\s+tabs?$""")'
if old_regex not in text:
    raise SystemExit('Could not locate generated invalid Kotlin regex')
text = text.replace(old_regex, new_regex, 1)

old_query = 'private const val PIE_TAB_SEARCH_QUERY = "ai-songs"'
new_query = 'private const val PIE_TAB_SEARCH_QUERY = "Pieinears"'
if old_query not in text:
    raise SystemExit('Could not locate generated Pie tab search query')
text = text.replace(old_query, new_query, 1)

old_marker = '            "pieinears.ai",\n'
new_marker = '            "pieinears.ai",\n            "pieinears",\n'
if old_marker not in text:
    raise SystemExit('Could not locate generated Pie tab marker list')
text = text.replace(old_marker, new_marker, 1)

path.write_text(text)
print('Fixed Kotlin regex and switched Brave tab restore to the actual Pieinears page title')
