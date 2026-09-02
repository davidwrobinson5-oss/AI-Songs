from pathlib import Path

path = Path('android-recorder/app/src/main/java/app/pie/recorder/YouTubeAdAccessibilityService.kt')
text = path.read_text()

if 'import android.os.Bundle\n' not in text:
    text = text.replace('import android.os.Build\n', 'import android.os.Build\nimport android.os.Bundle\n')

old_handle = '''    private fun handleBrowserForeground(expectedBrowser: String?, source: String) {
        val active = activePackage()
        if (!isExpectedBrowser(active, expectedBrowser)) {
            RecorderDiagnostics.record(this, "browser_foreground_lost source=$source active=${active ?: "null"}")
            return
        }

        val pieVisible = activeWindowLooksLikePie()
        val tabOverview = browserTabOverviewVisible()
        RecorderDiagnostics.record(
            this,
            "browser_foreground source=$source active=$active pieVisible=$pieVisible tabOverview=$tabOverview noUrlLaunch=true"
        )

        if (pieVisible || !tabOverview) return

        val accepted = try { performGlobalAction(GLOBAL_ACTION_BACK) } catch (_: Exception) { false }
        RecorderDiagnostics.record(this, "browser_tab_overview_back accepted=$accepted")
        if (!accepted) return

        handler.postDelayed({
            RecorderDiagnostics.record(
                this,
                "browser_tab_overview_back_verify active=${activePackage() ?: "null"} pieVisible=${activeWindowLooksLikePie()} tabOverview=${browserTabOverviewVisible()}"
            )
        }, TAB_OVERVIEW_BACK_VERIFY_MS)
    }

'''

new_handle = '''    private fun handleBrowserForeground(expectedBrowser: String?, source: String) {
        val active = activePackage()
        if (!isExpectedBrowser(active, expectedBrowser)) {
            RecorderDiagnostics.record(this, "browser_foreground_lost source=$source active=${active ?: "null"}")
            return
        }

        val tabOverview = browserTabOverviewVisible()
        val pieVisible = if (tabOverview) false else activeWindowLooksLikePie()
        RecorderDiagnostics.record(
            this,
            "browser_foreground source=$source active=$active pieVisible=$pieVisible tabOverview=$tabOverview exactTabRestore=true noUrlLaunch=true"
        )

        if (pieVisible) return
        if (active == BRAVE_PACKAGE) {
            tryRestorePieTabInBrave(source)
        }
    }

    private fun tryRestorePieTabInBrave(source: String) {
        val root = try { rootInActiveWindow } catch (_: Exception) { null } ?: run {
            RecorderDiagnostics.record(this, "brave_restore_no_root source=$source")
            return
        }
        if (root.packageName?.toString() != BRAVE_PACKAGE) return

        if (browserTabOverviewVisible()) {
            selectPieTabFromBraveOverview(source)
            return
        }

        val switcher = findBraveTabSwitcherNode(root, 0)
        val clicked = clickNodeOrParent(switcher)
        RecorderDiagnostics.record(this, "brave_tab_switcher_click source=$source found=${switcher != null} clicked=$clicked")
        if (!clicked) return

        handler.postDelayed({
            RecorderDiagnostics.record(this, "brave_tab_switcher_verify overview=${browserTabOverviewVisible()}")
            selectPieTabFromBraveOverview("${source}_switcher")
        }, BRAVE_TAB_OPEN_DELAY_MS)
    }

    private fun selectPieTabFromBraveOverview(source: String) {
        val root = try { rootInActiveWindow } catch (_: Exception) { null } ?: return
        if (root.packageName?.toString() != BRAVE_PACKAGE) return

        val direct = findDeepestNodeMatchingAnyLabel(root, PIE_TAB_MARKERS, 0)
        if (direct != null) {
            val clicked = clickNodeOrParent(direct)
            RecorderDiagnostics.record(this, "brave_pie_tab_direct source=$source clicked=$clicked")
            if (clicked) {
                verifyPieTabSelection("${source}_direct")
                return
            }
        }

        val search = findBraveTabSearchField(root, 0)
        if (search == null) {
            RecorderDiagnostics.record(this, "brave_pie_tab_not_found source=$source searchField=false")
            return
        }

        val args = Bundle().apply {
            putCharSequence(
                AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                PIE_TAB_SEARCH_QUERY
            )
        }
        try { search.performAction(AccessibilityNodeInfo.ACTION_FOCUS) } catch (_: Exception) {}
        val set = try { search.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args) } catch (_: Exception) { false }
        RecorderDiagnostics.record(this, "brave_tab_search_set source=$source query=$PIE_TAB_SEARCH_QUERY success=$set")
        if (!set) return

        handler.postDelayed({
            val filteredRoot = try { rootInActiveWindow } catch (_: Exception) { null }
            val match = findDeepestNodeMatchingAnyLabel(filteredRoot, PIE_TAB_MARKERS, 0)
            val clicked = match != null && clickNodeOrParent(match)
            RecorderDiagnostics.record(this, "brave_pie_tab_search_result source=$source found=${match != null} clicked=$clicked")
            if (clicked) verifyPieTabSelection("${source}_search")
        }, BRAVE_TAB_SEARCH_DELAY_MS)
    }

    private fun verifyPieTabSelection(source: String) {
        handler.postDelayed({
            RecorderDiagnostics.record(
                this,
                "brave_pie_tab_verify source=$source active=${activePackage() ?: "null"} pieVisible=${activeWindowLooksLikePie()} tabOverview=${browserTabOverviewVisible()}"
            )
        }, BRAVE_TAB_SELECT_VERIFY_DELAY_MS)
    }

    private fun findBraveTabSwitcherNode(node: AccessibilityNodeInfo?, depth: Int): AccessibilityNodeInfo? {
        if (node == null || depth > 20) return null
        for (i in 0 until node.childCount) {
            val found = findBraveTabSwitcherNode(node.getChild(i), depth + 1)
            if (found != null) return found
        }
        val label = buildString {
            node.text?.let { append(it).append(' ') }
            node.contentDescription?.let { append(it).append(' ') }
        }.trim().lowercase()
        val viewId = node.viewIdResourceName.orEmpty().lowercase()
        val looksLikeSwitcher =
            label.contains("switch tabs") ||
            label.contains("tab switcher") ||
            label.contains("open tabs") ||
            Regex("^\\d+\\s+tabs?$").matches(label) ||
            viewId.contains("tab_switcher") ||
            viewId.contains("tab_switcher_button") ||
            viewId.contains("tabswitcher")
        return if (looksLikeSwitcher) node else null
    }

    private fun findBraveTabSearchField(node: AccessibilityNodeInfo?, depth: Int): AccessibilityNodeInfo? {
        if (node == null || depth > 20) return null
        for (i in 0 until node.childCount) {
            val found = findBraveTabSearchField(node.getChild(i), depth + 1)
            if (found != null) return found
        }
        val label = buildString {
            node.text?.let { append(it).append(' ') }
            node.contentDescription?.let { append(it).append(' ') }
        }.trim().lowercase()
        val viewId = node.viewIdResourceName.orEmpty().lowercase()
        return if (node.isEditable && (label.contains("search your tabs") || viewId.contains("search"))) node else null
    }

    private fun findDeepestNodeMatchingAnyLabel(
        node: AccessibilityNodeInfo?,
        labels: List<String>,
        depth: Int
    ): AccessibilityNodeInfo? {
        if (node == null || depth > 24) return null
        for (i in 0 until node.childCount) {
            val found = findDeepestNodeMatchingAnyLabel(node.getChild(i), labels, depth + 1)
            if (found != null) return found
        }
        if (node.isEditable) return null
        val haystack = buildString {
            node.text?.let { append(it).append(' ') }
            node.contentDescription?.let { append(it).append(' ') }
            node.viewIdResourceName?.let { append(it).append(' ') }
        }.lowercase()
        return if (labels.any { haystack.contains(it) }) node else null
    }

'''

if old_handle not in text:
    raise SystemExit('Could not locate old browser foreground handler')
text = text.replace(old_handle, new_handle)

old_recents_fail = '''            if (!accepted) {
                RecorderDiagnostics.record(this, "recents_action_failed_no_url_fallback")
                return
            }
'''
new_recents_fail = '''            if (!accepted) {
                RecorderDiagnostics.record(this, "recents_action_failed_try_task_launch")
                launchExistingBrowserTaskWithoutUrl(expectedBrowser, "recents_action_failed")
                return
            }
'''
if old_recents_fail not in text:
    raise SystemExit('Could not locate Recents failure block')
text = text.replace(old_recents_fail, new_recents_fail, 1)

old_recents_end = '''            } else {
                RecorderDiagnostics.record(this, "recents_browser_not_found_no_url_fallback")
            }
'''
new_recents_end = '''            } else {
                RecorderDiagnostics.record(this, "recents_browser_not_found_try_task_launch")
                launchExistingBrowserTaskWithoutUrl(expectedBrowser, "recents_not_found")
            }
'''
if old_recents_end not in text:
    raise SystemExit('Could not locate Recents exhausted block')
text = text.replace(old_recents_end, new_recents_end, 1)

insert_before = '''    private fun findAndClickBrowserTask(expectedBrowser: String?): Boolean {
'''
launch_helper = '''    private fun launchExistingBrowserTaskWithoutUrl(expectedBrowser: String?, source: String) {
        val target = expectedBrowser ?: BRAVE_PACKAGE
        try {
            val intent = Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .setPackage(target)
                .addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                )
            startActivity(intent)
            RecorderDiagnostics.record(this, "browser_task_launch source=$source package=$target noUrl=true")
            handler.postDelayed({
                val active = activePackage()
                val success = isExpectedBrowser(active, target)
                RecorderDiagnostics.record(this, "browser_task_launch_verify source=$source success=$success active=${active ?: "null"}")
                if (success) handleBrowserForeground(target, "task_launch_$source")
            }, BROWSER_TASK_LAUNCH_VERIFY_DELAY_MS)
        } catch (e: Exception) {
            RecorderDiagnostics.record(this, "browser_task_launch_failed source=$source package=$target error=${e.javaClass.simpleName}")
        }
    }

'''
if insert_before not in text:
    raise SystemExit('Could not locate browser task helper insertion point')
text = text.replace(insert_before, launch_helper + insert_before, 1)

old_constants = '''        private const val TAB_OVERVIEW_BACK_VERIFY_MS = 450L
        private const val RECENTS_OPEN_DELAY_MS = 260L
'''
new_constants = '''        private const val TAB_OVERVIEW_BACK_VERIFY_MS = 450L
        private const val BRAVE_TAB_OPEN_DELAY_MS = 500L
        private const val BRAVE_TAB_SEARCH_DELAY_MS = 550L
        private const val BRAVE_TAB_SELECT_VERIFY_DELAY_MS = 550L
        private const val BROWSER_TASK_LAUNCH_VERIFY_DELAY_MS = 700L
        private const val RECENTS_OPEN_DELAY_MS = 260L
'''
if old_constants not in text:
    raise SystemExit('Could not locate browser timing constants')
text = text.replace(old_constants, new_constants, 1)

old_markers = '''        private val BRAVE_TAB_OVERVIEW_MARKERS = listOf(
            "search your tabs"
        )

'''
new_markers = '''        private val BRAVE_TAB_OVERVIEW_MARKERS = listOf(
            "search your tabs"
        )

        private const val PIE_TAB_SEARCH_QUERY = "ai-songs"
        private val PIE_TAB_MARKERS = listOf(
            "ai-songs-git-main-drobinhood1.vercel.app",
            "pieinears.ai",
            "in the kitchen",
            "analyze music",
            "record playback",
            "record audio"
        )

'''
if old_markers not in text:
    raise SystemExit('Could not locate Brave tab markers')
text = text.replace(old_markers, new_markers, 1)

path.write_text(text)
print('Patched Brave return to select the existing Pie tab without launching a URL')
