package com.ibloc.shadow

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.os.Build
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.graphics.Path
import android.graphics.Rect

class PrefrontalAccessibilityService : AccessibilityService() {

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

    override fun onInterrupt() {}

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        AppLog.d(TAG, "PrefrontalAccessibilityService connected")
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        AppLog.d(TAG, "PrefrontalAccessibilityService destroyed")
    }

    /// **屏幕尺寸**（物理像素）—— 用来判「这个坐标在不在屏内」。
    ///
    /// ⚠️⚠️ **为什么需要它**（2026-11-10 真机实测）：
    /// 手势派发 API 对**越界坐标**照样回 `dispatched=true`
    /// ⇒ ⇒ 实测滑动起点 `y=3084` 而屏幕只有 2400 高
    /// ⇒ ⇒ 派发「成功」⇒ ⇒ **界面一动不动**
    /// ⇒ ⇒ ⇒ 症状：**失败长得像成功**（模型以为滑过了 ⇒ ⇒ 接着照着旧树判断）
    /// ⇒ ⇒ ⇒ 所以派发**之前**先判坐标在不在屏内 ⇒ ⇒ 越界就**明确失败并说清原因**。
    ///
    /// ⚠️ **多屏**：这里取的是**默认屏**（display 0）⇒ ⇒ 与手势派发去的那块屏一致
    /// ⇒ ⇒ 口径对得上 ⇒ ⇒ 不会误杀。
    fun screenSize(): Pair<Int, Int> {
        val dm = resources.displayMetrics
        return Pair(dm.widthPixels, dm.heightPixels)
    }

    /// **这个点在不在屏内** —— 越界 ⇒ ⇒ 不许派发。
    ///
    /// ⚠️ 边界**含**等号（点正好在屏幕右/下边缘上算**在**屏内）
    /// ⇒ ⇒ 因为 Android 自己就是这么判的 ⇒ ⇒ 别自己造一个更严的口径。
    fun isPointOnScreen(x: Float, y: Float): Boolean {
        val (w, h) = screenSize()
        if (w <= 0 || h <= 0) return true   // ⚠️ 量不到尺寸 ⇒ ⇒ **不许**拦（宁可放过，不误杀）
        return x >= 0f && y >= 0f && x <= w.toFloat() && y <= h.toFloat()
    }

    fun performTap(x: Float, y: Float): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        if (!isPointOnScreen(x, y)) {
            // ⚠️⚠️ **越界 ⇒ ⇒ 明确失败** —— 而不是派发出去再让调用方以为成功了
            val (w, h) = screenSize()
            AppLog.d(TAG, "performTap: ($x,$y) REJECTED off-screen (screen=${w}x$h)")
            return false
        }
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0, TAP_DURATION_MS)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        val dispatched = dispatchGesture(gesture, null, null)
        // ⚠️ **日志是取证用的** —— 「派发成功」不等于「点到了东西」
        // ⇒ ⇒ 真机上判断「有没有点中」只能看**界面变了没有」
        // ⇒ ⇒ 但如果界面没变，得先知道**手势到底派发出去没有**
        // ⇒ ⇒ 这一行就是那个证据。
        AppLog.d(TAG, "performTap: ($x,$y) dispatched=$dispatched")
        return dispatched
    }

    fun performLongPress(x: Float, y: Float): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        if (!isPointOnScreen(x, y)) {
            val (w, h) = screenSize()
            AppLog.d(TAG, "performLongPress: ($x,$y) REJECTED off-screen (screen=${w}x$h)")
            return false
        }
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0, LONG_PRESS_DURATION_MS)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        val dispatched = dispatchGesture(gesture, null, null)
        AppLog.d(TAG, "performLongPress: ($x,$y) dispatched=$dispatched")
        return dispatched
    }

    fun performSwipe(x1: Float, y1: Float, x2: Float, y2: Float, durationMs: Long): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        // ⚠️⚠️ **两端都要在屏内** —— 起点越界 ⇒ ⇒ 派发「成功」但界面不动
        // ⚠️⚠️ （2026-11-10 真机实测：起点 y=3084 而屏高 2400 ⇒ ⇒ 什么都没发生）
        if (!isPointOnScreen(x1, y1) || !isPointOnScreen(x2, y2)) {
            val (w, h) = screenSize()
            AppLog.d(TAG, "performSwipe: ($x1,$y1)->($x2,$y2) REJECTED off-screen (screen=${w}x$h)")
            return false
        }
        val path = Path().apply {
            moveTo(x1, y1)
            lineTo(x2, y2)
        }
        val duration = durationMs.coerceIn(MIN_SWIPE_DURATION_MS, MAX_SWIPE_DURATION_MS)
        val stroke = GestureDescription.StrokeDescription(path, 0, duration)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        val dispatched = dispatchGesture(gesture, null, null)
        AppLog.d(TAG, "performSwipe: ($x1,$y1)->($x2,$y2) dispatched=$dispatched")
        return dispatched
    }

    fun performGlobalActionById(actionId: Int): Boolean {
        return performGlobalAction(actionId)
    }

    /// 读当前前台窗口的**可访问性树**（只读，不碰任何输入）。
    ///
    /// ⚠️ **为什么放在服务这一层，而不是 MobileActionAgent 里**：
    /// 那份树遍历原本写死在 agent 里 ⇒ ⇒ 而「读屏」现在同时要供
    /// **模型工具**（通道）与 **A2A HTTP 动作**（agent）两边用
    /// ⇒ ⇒ 两份拷贝必然漂移 ⇒ ⇒ 真相源放在**服务**这一层，两边都调它。
    ///
    /// @return null = 取不到前台窗口（服务没连上，或当前没有可读窗口）
    fun readScreenContent(): String? {
        val root = rootInActiveWindow ?: return null
        val sb = StringBuilder()
        val budget = ScreenBudget()
        // ⚠️⚠️ **头必须与「一次采样」那条路**逐字同形** ⇒ ⇒
        // ⇒ ⇒ 两条路的**形状**必须一样 ⇒ ⇒ 否则模型得学会两套读法
        // ⇒ ⇒ ⇒ 而「同一个工具、两个形状」⇒ ⇒ 模型会挑错那套 ⇒ ⇒ ⇒
        // ⇒ ⇒ ⇒ **通用形态：同一个结果的两种写法 ⇒ ⇒ 模型得自己猜哪套对**。
        val pkg = root.packageName?.toString()
        sb.appendLine("# source=android-a11y (package=" + (pkg ?: "unknown") + ")")
        appendNodesToString(root, sb, 0, budget)
        root.recycle()
        if (budget.truncated) {
            // ⚠️ **显式标记**：静悄悄截断 ⇒ ⇒ 模型以为它看全了屏幕
            // ⇒ ⇒ 然后对着缺失的信息做判断 ⇒ ⇒ 那是「失败长得像成功」。
            sb.appendLine(TRUNCATION_MARKER)
            AppLog.d(TAG, "read screen truncated: budget exhausted")
        }
        val text = sb.toString()
        // ⚠️⚠️ **空树 ≠「屏幕上什么都没有」** —— 更常见的原因是「窗口还没挂好」
        // （真机实测：app 刚起来的那一瞬间，前台窗口里一个节点都没有）。
        // ⇒ ⇒ 空 ⇒ ⇒ 明确回 **null**（＝读不到）⇒ ⇒ Dart 侧会报**明确失败**
        // ⇒ ⇒ 而不是把一段空文本当「这一屏是空的」交给模型
        // ⇒ ⇒ 那正是「失败长得像成功」的一族（模型会据此以为屏幕真的空）。
        if (text.isBlank()) {
            AppLog.d(TAG, "read screen: empty tree (window not ready?)")
            return null
        }
        return text
    }

    /// **一次采样** —— 树与「这是谁的屏」**同一个窗口**。
    ///
    /// ⚠️⚠️ **为什么必须一次取**（2026-11-11 真机实测）：
    /// ⇒ ⇒ `readScreenContent()` 与 `foregroundPackage()` **各自**取一次
    ///    `rootInActiveWindow` ⇒ ⇒ **两次采样之间前台可能换人**
    /// ⇒ ⇒ ⇒ **实测已经发生过**：逐字
    ///    `pkg=com.android.settings rawPkg=com.miui.home`
    /// ⇒ ⇒ ⇒ 同一时刻，工具层说「设置」、原生说「桌面」
    /// ⇒ ⇒ ⇒ ⇒ ⇒ **张冠李戴** ⇒ ⇒ 模型会被告知**错的归属**
    /// ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 「失败长得像成功」的一族。
    ///
    /// ⇒ ⇒ **通用形态：一个回答里的多个事实必须来自**同一次采样**
    /// ⇒ ⇒ 否则它们之间可以互相矛盾 ⇒ ⇒ 而矛盾长得像正常。
    ///
    /// @return null = 取不到前台窗口（服务没连上，或当前没有可读窗口）
    fun readScreenSnapshot(): Map<String, String?>? {
        val root = rootInActiveWindow ?: return null
        // ⚠️ **包名必须与树同源** ⇒ ⇒ 在**遍历之前**取。
        val pkg = root.packageName?.toString()
        val sb = StringBuilder()
        val budget = ScreenBudget()
        // ⚠️⚠️ **树的头必须写明属主** ⇒ ⇒ 「这棵树是谁家的」在树里**看不出来**
        // ⇒ ⇒ 而模型要靠**它自己**判断能不能信这棵树。
        // ⇒ ⇒ ⇒ 与 Flutter 那一棵**同形**（那边头里也写着 source 与口径）。
        // ⚠️ **属主写的是同一个 root 的包名** ⇒ ⇒ 头与 `package` 那一格**必然一致**
        // ⇒ ⇒ ⇒ 而它们与树**同源** ⇒ ⇒ ⇒ 不可能张冠李戴。
        sb.appendLine("# source=android-a11y (package=" + (pkg ?: "unknown") + ")")
        appendNodesToString(root, sb, 0, budget)
        root.recycle()
        if (budget.truncated) {
            sb.appendLine(TRUNCATION_MARKER)
            AppLog.d(TAG, "read screen truncated: budget exhausted")
        }
        val text = sb.toString()
        // ⚠️ **空树 ≠ 「屏幕上什么都没有」** ⇒ ⇒ 明确回 null。
        if (text.isBlank()) {
            AppLog.d(TAG, "read screen: empty tree (window not ready?)")
            return null
        }
        return mapOf("screen" to text, "package" to pkg)
    }

    /// **前台是谁** —— 当前可读窗口的包名。
    ///
    /// ⚠️⚠️ **为什么需要它**（2026-11-11 真机实测）：
    /// ⇒ ⇒ 读屏给模型的**只有一棵树** ⇒ ⇒ 而「这棵树是哪个 app 的」
    /// ⇒ ⇒ 模型**看不出来** ⇒ ⇒ 它看到「日历」二字，可能以为那是自家界面。
    /// ⇒ ⇒ ⇒ 而**判据**也缺这一项：长按桌面图标与点按桌面图标，
    /// ⇒ ⇒ ⇒ **两条路的分界正是「前台有没有换人」**
    /// ⇒ ⇒ ⇒ ⇒（实测：长按 ⇒ 前台仍是 `com.miui.home`；
    /// ⇒ ⇒ ⇒ ⇒　　点按 ⇒ 前台变成 `com.android.calendar`）
    /// ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **通用形态：读屏要带「这是谁的屏」**，
    /// ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 否则「屏变了」这件事**分不清是谁变了**。
    ///
    /// @return null = 取不到前台窗口（服务没连上，或当前没有可读窗口）
    fun foregroundPackage(): String? {
        val root = rootInActiveWindow ?: return null
        val name = root.packageName?.toString()
        root.recycle()
        return name
    }

    /// 把可访问性树拍成**缩进文本** —— 模型看得懂，token 也省。
    private fun appendNodesToString(node: AccessibilityNodeInfo, sb: StringBuilder, depth: Int, budget: ScreenBudget) {
        if (!budget.visit(depth)) return
        val indent = "  ".repeat(depth)
        val text = node.text?.toString()
        val contentDesc = node.contentDescription?.toString()
        val className = node.className?.toString()

        if (!text.isNullOrEmpty() || !contentDesc.isNullOrEmpty()) {
            val bounds = boundsOf(node)
            val chunk = buildString {
                appendLine("$indent[$className]")
                if (!text.isNullOrEmpty()) appendLine("$indent  text: $text")
                if (!contentDesc.isNullOrEmpty()) appendLine("$indent  desc: $contentDesc")
                if (bounds.isNotEmpty()) appendLine("$indent  bounds: $bounds")
            }
            if (!budget.canWrite(sb.length, chunk.length)) {
                // ⚠️ 塞不下 ⇒ ⇒ **写进能塞下的那部分** ⇒ ⇒ 然后收手
                // ⇒ ⇒ （整段丢掉 ⇒ ⇒ 用户看到的是「屏幕突然没了」）。
                val room = budget.maxChars - sb.length
                if (room > 0) sb.append(chunk, 0, room)
                return
            }
            sb.append(chunk)
        }

        for (i in 0 until node.childCount) {
            if (budget.truncated) return
            node.getChild(i)?.let { child ->
                appendNodesToString(child, sb, depth + 1, budget)
                child.recycle()
            }
        }
    }

    /// 节点在**屏幕上的框**（`left,top,right,bottom`）—— 取不到就回空串。
    ///
    /// ⚠️⚠️ **坐标是必须的**：没有它，模型看得见「WLAN」却**不知道它在哪**
    /// ⇒ ⇒ 只能瞎点 ⇒ ⇒ 「点按」那条能力对模型等于没有。
    /// ⚠️ 为什么**必须是屏幕坐标**：`dispatchGesture` 用的就是屏幕坐标
    /// ⇒ ⇒ 模型从树里读到的坐标**直接就能拿去点** ⇒ ⇒ 不用再换算。
    /// ⚠️ 为什么**只给带文字/描述的节点**加：树里本来就只有这些节点
    /// ⇒ ⇒ 每个布局框都加 ⇒ ⇒ token 翻倍、预算撑爆。
    private fun boundsOf(node: AccessibilityNodeInfo): String {
        val rect = Rect()
        node.getBoundsInScreen(rect)
        if (rect.isEmpty) return ""
        return "${rect.left},${rect.top},${rect.right},${rect.bottom}"
    }

    fun findAndClickByText(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val node = findNodeByText(root, text, mutableSetOf()) ?: return false
        // ⚠️⚠️ **必须往上找可点的祖先** —— 真实 UI 上「那个字」几乎总是躺在
        // 一个**自己不可点**的子节点里（TextView），真正可点的是它**上面**
        // 那一行（LinearLayout / 列表 item）。
        // ⇒ ⇒ 以前只点「找到的那个节点」⇒ ⇒ 它多半 `isClickable == false`
        // ⇒ ⇒ 于是**一律返回 false** ⇒ ⇒ 调用方收到「没找到那个文字」
        // ⇒ ⇒ **明明看得见那个字，却点不到** —— 那比报错更糟（它会改去乱点）。
        val target = clickableAncestorOf(node) ?: return false
        AppLog.d(TAG, "findAndClickByText: clicked an ancestor of the text node")
        return target.performAction(AccessibilityNodeInfo.ACTION_CLICK)
    }

    /// 从 [node] 往上找**第一个自己可点**的祖先；一个都没有就返回 null。
    ///
    /// ⚠️ 为什么要**有上界**（[MAX_ANCESTOR_HOPS]）：无障碍树可能很深
    /// ⇒ ⇒ 不设上界就可能一路爬到根节点 ⇒ ⇒ 爬到根等于「点整个窗口」
    /// ⇒ ⇒ 那是**乱按**，不是「点那个字」。
    private fun clickableAncestorOf(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        var current: AccessibilityNodeInfo? = node
        var hops = 0
        while (current != null && hops <= MAX_ANCESTOR_HOPS) {
            if (current.isClickable) return current
            current = current.parent
            hops++
        }
        return null
    }

    fun findNodeByText(
        node: AccessibilityNodeInfo,
        text: String,
        visited: MutableSet<AccessibilityNodeInfo>
    ): AccessibilityNodeInfo? {
        if (!visited.add(node)) return null
        val nodeText = node.text?.toString() ?: ""
        val contentDesc = node.contentDescription?.toString() ?: ""
        if (text in nodeText || text in contentDesc) return node
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { child ->
                findNodeByText(child, text, visited)?.let { return it }
            }
        }
        return null
    }

    companion object {
        private const val TAG = "PrefrontalA11y"

        /// 往上找可点祖先时的**上界** —— 见 [clickableAncestorOf]。
        private const val MAX_ANCESTOR_HOPS = 5

        /**
         * 读屏被**截断**时的显式标记 —— Dart 侧逐字对齐（见
         * `scripts/check-mobile-a11y-contract.mjs`，那道闸钉着这个字面量）。
         *
         * ⚠️ 为什么必须有它：静悄悄截断 ⇒ ⇒ 模型以为它看全了屏幕
         * ⇒ ⇒ 然后对着缺失的信息做判断 ⇒ ⇒ 那是「失败长得像成功」的一族。
         */
        const val TRUNCATION_MARKER = "[truncated]"
        private const val TAP_DURATION_MS = 50L
        /**
         * 长按**按住多久**（毫秒）。
         *
         * ⚠️⚠️ **为什么不能正好 500ms** —— Flutter 的长按阈值是 500ms，
         * Android 原生的长按超时**也是 500ms** ⇒ ⇒ 按住正好 500ms
         * ⇒ ⇒ 就是在跟平台阈值**赛跑** ⇒ ⇒ 输了的那一次，app 收到的是
         * 「点按」（onTap 触发、onLongPress 不触发）⇒ ⇒ **长按变成了点按**
         * ⇒ ⇒ 而点按可能触发**点击动作**（比「没长按」更糟）。
         * ⇒ ⇒ ⇒ 真机实测（2026-11-10）：按住 500ms 那一次，实测
         * **onLongPress 没触发、反倒 onTap 触发了** ⇒ ⇒ app 眼里是「点按」
         * ⇒ ⇒ ⇒ 所以按 800ms（留 300ms 余量，越过平台阈值）。
         */
        private const val LONG_PRESS_DURATION_MS = 800L
        private const val MIN_SWIPE_DURATION_MS = 50L
        private const val MAX_SWIPE_DURATION_MS = 3000L

        @Volatile
        var instance: PrefrontalAccessibilityService? = null
            private set
    }
}
