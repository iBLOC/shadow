package com.ibloc.shadow.http

import android.util.Log
import fi.iki.elonen.NanoHTTPD
import com.ibloc.shadow.PrefrontalAccessibilityService
import org.json.JSONObject
import java.net.URLDecoder

class MobileActionServer(
    private val port: Int = 8080
) : NanoHTTPD(port) {

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri
        val method = session.method

        Log.d(TAG, "$method $uri")

        return when {
            uri == "/api/mobile/action" && method == Method.POST -> handleMobileAction(session)
            uri == "/api/health" && method == Method.GET -> newFixedLengthResponse("OK")
            else -> newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not Found")
        }
    }

    private fun handleMobileAction(session: IHTTPSession): Response {
        try {
            val files = mutableMapOf<String, String>()
            session.parseBody(files)

            val requestBody = files["postData"] ?: files["postData-1"] ?: "{}"
            Log.d(TAG, "Request body: $requestBody")

            val json = JSONObject(requestBody)
            val action = json.optString("action", "")
            val params = json.optJSONObject("params") ?: JSONObject()

            val accessibilityService = PrefrontalAccessibilityService.instance

            if (accessibilityService == null) {
                return jsonResponse(false, "", "Accessibility service not available")
            }

            val result = when (action) {
                "tap" -> {
                    val x = params.optDouble("x", 0.0).toFloat()
                    val y = params.optDouble("y", 0.0).toFloat()
                    val success = accessibilityService.performTap(x, y)
                    jsonResponse(success, "Tapped at ($x, $y)")
                }
                "long_press" -> {
                    val x = params.optDouble("x", 0.0).toFloat()
                    val y = params.optDouble("y", 0.0).toFloat()
                    val success = accessibilityService.performLongPress(x, y)
                    jsonResponse(success, "Long pressed at ($x, $y)")
                }
                "swipe" -> {
                    val x1 = params.optDouble("x1", 0.0).toFloat()
                    val y1 = params.optDouble("y1", 0.0).toFloat()
                    val x2 = params.optDouble("x2", 0.0).toFloat()
                    val y2 = params.optDouble("y2", 0.0).toFloat()
                    val duration = params.optInt("duration_ms", 300).toLong()
                    val success = accessibilityService.performSwipe(x1, y1, x2, y2, duration)
                    jsonResponse(success, "Swiped from ($x1, $y1) to ($x2, $y2)")
                }
                "find_and_click" -> {
                    val text = params.optString("text", "")
                    val success = accessibilityService.findAndClickByText(text)
                    if (success) {
                        jsonResponse(true, "Clicked on element with text: $text")
                    } else {
                        jsonResponse(false, "", "Element not found: $text")
                    }
                }
                "find_and_long_press" -> {
                    val text = params.optString("text", "")
                    val node = accessibilityService.findNodeByText(
                        accessibilityService.rootInActiveWindow!!,
                        text,
                        mutableSetOf()
                    )
                    if (node != null && node.isLongClickable) {
                        val result = node.performAction(
                            android.view.accessibility.AccessibilityNodeInfo.ACTION_LONG_CLICK
                        )
                        node.recycle()
                        if (result) {
                            jsonResponse(true, "Long pressed on element with text: $text")
                        } else {
                            jsonResponse(false, "", "Long click failed")
                        }
                    } else {
                        jsonResponse(false, "", "Element not found or not long-clickable: $text")
                    }
                }
                "read_screen" -> {
                    val text = readScreenContent(accessibilityService)
                    jsonResponse(true, text)
                }
                "get_current_app" -> {
                    val packageName = accessibilityService.rootInActiveWindow?.packageName?.toString() ?: "unknown"
                    jsonResponse(true, packageName)
                }
                "scroll" -> {
                    val direction = params.optString("direction", "up")
                    val node = accessibilityService.rootInActiveWindow
                    if (node != null) {
                        val actionType = when (direction) {
                            "up" -> android.view.accessibility.AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
                            "down" -> android.view.accessibility.AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
                            else -> {
                                node.recycle()
                                return jsonResponse(false, "", "Invalid direction: $direction")
                            }
                        }
                        val success = node.performAction(actionType)
                        node.recycle()
                        jsonResponse(success, "Scrolled $direction")
                    } else {
                        jsonResponse(false, "", "Cannot get root window")
                    }
                }
                else -> jsonResponse(false, "", "Unknown action: $action")
            }

            return result
        } catch (e: Exception) {
            Log.e(TAG, "Error handling mobile action", e)
            return jsonResponse(false, "", e.message ?: "Unknown error")
        }
    }

    private fun readScreenContent(service: PrefrontalAccessibilityService): String {
        val root = service.rootInActiveWindow ?: return "Cannot access screen"
        val sb = StringBuilder()
        appendNodesToString(root, sb, 0)
        root.recycle()
        return sb.toString()
    }

    private fun appendNodesToString(
        node: android.view.accessibility.AccessibilityNodeInfo,
        sb: StringBuilder,
        depth: Int
    ) {
        val indent = "  ".repeat(depth)
        val text = node.text?.toString()
        val contentDesc = node.contentDescription?.toString()
        val className = node.className?.toString()

        if (!text.isNullOrEmpty() || !contentDesc.isNullOrEmpty()) {
            sb.appendLine("$indent[$className]")
            if (!text.isNullOrEmpty()) sb.appendLine("$indent  text: $text")
            if (!contentDesc.isNullOrEmpty()) sb.appendLine("$indent  desc: $contentDesc")
        }

        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { child ->
                appendNodesToString(child, sb, depth + 1)
                child.recycle()
            }
        }
    }

    private fun jsonResponse(success: Boolean, content: String, error: String? = null): Response {
        val json = JSONObject().apply {
            put("success", success)
            put("content", content)
            error?.let { put("error", it) }
        }
        return newFixedLengthResponse(
            Response.Status.OK,
            "application/json",
            json.toString()
        )
    }

    companion object {
        private const val TAG = "MobileActionServer"
        @Volatile
        var instance: MobileActionServer? = null
            private set

        fun start(port: Int = 8080): Boolean {
            return try {
                if (instance == null) {
                    instance = MobileActionServer(port)
                    instance?.start()
                    Log.i(TAG, "Server started on port $port")
                }
                true
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start server", e)
                false
            }
        }

        fun stop() {
            instance?.stop()
            instance = null
            Log.i(TAG, "Server stopped")
        }
    }
}
