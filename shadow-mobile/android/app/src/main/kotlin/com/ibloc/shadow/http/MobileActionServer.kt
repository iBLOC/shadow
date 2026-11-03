package com.ibloc.shadow.http

import android.util.Log
import com.ibloc.shadow.AppLog
import com.ibloc.shadow.DeviceActionGate
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

        AppLog.d(TAG, "$method $uri")

        return when {
            uri == "/api/mobile/action" && method == Method.POST -> handleMobileAction(session)
            uri == "/api/health" && method == Method.GET -> newFixedLengthResponse("OK")
            else -> newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not Found")
        }
    }

    private fun handleMobileAction(session: IHTTPSession): Response {
        // ⚠️ **设备动作闸** —— 这张脸**不经过** Dart 侧的能力闸
        // ⇒ ⇒ 原生侧自己认那道闸 ⇒ ⇒ 否则「闸建好了」这句话在这条腿上是假的。
        //
        // ⚠️ 放在**最前面**：未授权的调用方连动作词表都不该看到。
        if (!DeviceActionGate.isAllowed()) {
            return jsonResponse(false, "", DeviceActionGate.DENIED_MESSAGE)
        }
        try {
            val files = mutableMapOf<String, String>()
            session.parseBody(files)

            val requestBody = files["postData"] ?: files["postData-1"] ?: "{}"
            AppLog.d(TAG, "Request body: $requestBody")

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
                    // ⚠️ 树遍历的真相源在服务那一层（PrefrontalAccessibilityService.readScreenContent）
                    // ⇒ ⇒ 这里不再留第二份拷贝 —— 两份必然漂移 ⇒ ⇒ 与模型工具 / A2A 动作族读同一棵树。
                    val text = accessibilityService.readScreenContent() ?: "Cannot access screen"
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
            AppLog.e(TAG, "Error handling mobile action", e)
            return jsonResponse(false, "", e.message ?: "Unknown error")
        }
    }

    /// ⚠️ 树遍历**不在这一层**了 —— 真相源是 `PrefrontalAccessibilityService.readScreenContent`。
    ///
    /// ⚠️ **为什么**：读屏有三处消费者（模型工具通道 / A2A 动作族 / 这个 HTTP 面）
    /// ⇒ ⇒ 每一份拷贝都是一处会漂移的地方 ⇒ ⇒ 真相源只留一份，三边都调它。
    ///

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
                    AppLog.i(TAG, "Server started on port $port")
                }
                true
            } catch (e: Exception) {
                AppLog.e(TAG, "Failed to start server", e)
                false
            }
        }

        fun stop() {
            instance?.stop()
            instance = null
            AppLog.i(TAG, "Server stopped")
        }
    }
}
