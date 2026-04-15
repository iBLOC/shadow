package com.ibloc.shadow

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.os.Build
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.graphics.Path

class PrefrontalAccessibilityService : AccessibilityService() {

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

    override fun onInterrupt() {}

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.d(TAG, "PrefrontalAccessibilityService connected")
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        Log.d(TAG, "PrefrontalAccessibilityService destroyed")
    }

    fun performTap(x: Float, y: Float): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0, TAP_DURATION_MS)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        return dispatchGesture(gesture, null, null)
    }

    fun performLongPress(x: Float, y: Float): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0, LONG_PRESS_DURATION_MS)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        return dispatchGesture(gesture, null, null)
    }

    fun performSwipe(x1: Float, y1: Float, x2: Float, y2: Float, durationMs: Long): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        val path = Path().apply {
            moveTo(x1, y1)
            lineTo(x2, y2)
        }
        val duration = durationMs.coerceIn(MIN_SWIPE_DURATION_MS, MAX_SWIPE_DURATION_MS)
        val stroke = GestureDescription.StrokeDescription(path, 0, duration)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        return dispatchGesture(gesture, null, null)
    }

    fun performGlobalActionById(actionId: Int): Boolean {
        return performGlobalAction(actionId)
    }

    fun findAndClickByText(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val node = findNodeByText(root, text, mutableSetOf())
        return if (node != null && node.isClickable) {
            node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        } else {
            false
        }
    }

    private fun findNodeByText(
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
        private const val TAP_DURATION_MS = 50L
        private const val LONG_PRESS_DURATION_MS = 500L
        private const val MIN_SWIPE_DURATION_MS = 50L
        private const val MAX_SWIPE_DURATION_MS = 3000L

        @Volatile
        var instance: PrefrontalAccessibilityService? = null
            private set
    }
}
