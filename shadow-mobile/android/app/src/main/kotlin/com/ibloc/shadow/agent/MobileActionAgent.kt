package com.ibloc.shadow.agent

import android.util.Log
import com.ibloc.shadow.AppLog
import com.ibloc.shadow.PrefrontalAccessibilityService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class A2AMessage(
    val type: String,
    val content: String,
    val metadata: Map<String, String> = emptyMap()
)

data class A2AResponse(
    val success: Boolean,
    val content: String,
    val error: String? = null
)

data class AgentCapabilities(
    val canProcessAudio: Boolean = true,
    val canControlUI: Boolean = true,
    val canAccessSensors: Boolean = true,
    val supportedActions: List<String> = listOf(
        "tap",
        "long_press",
        "swipe",
        "find_and_click",
        "find_and_long_press",
        "read_screen",
        "get_current_app",
        "scroll"
    )
)

class MobileActionAgent(
    private val prefrontalUrl: String = "http://localhost:8082"
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val jsonMediaType = "application/json".toMediaType()

    suspend fun sendMessage(message: A2AMessage): A2AResponse = withContext(Dispatchers.IO) {
        try {
            val json = JSONObject().apply {
                put("jsonrpc", "2.0")
                put("method", "tasks/send")
                put("id", System.currentTimeMillis().toString())
                put("params", JSONObject().apply {
                    put("id", "mobile-${System.currentTimeMillis()}")
                    put("message", JSONObject().apply {
                        put("role", "user")
                        put("parts", org.json.JSONArray().apply {
                            put(JSONObject().apply {
                                put("type", "text")
                                put("text", formatActionMessage(message))
                            })
                        })
                    })
                })
            }

            val request = Request.Builder()
                .url("$prefrontalUrl/api/a2a")
                .post(json.toString().toRequestBody(jsonMediaType))
                .build()

            val response = client.newCall(request).execute()
            val body = response.body?.string() ?: ""

            if (response.isSuccessful) {
                parseA2AResponse(body)
            } else {
                A2AResponse(success = false, content = "", error = "HTTP ${response.code}: $body")
            }
        } catch (e: Exception) {
            AppLog.e(TAG, "A2A request failed", e)
            A2AResponse(success = false, content = "", error = e.message)
        }
    }

    suspend fun executeAction(action: String, params: Map<String, Any>): A2AResponse = withContext(Dispatchers.IO) {
        val accessibilityService = PrefrontalAccessibilityService.instance

        if (accessibilityService == null) {
            return@withContext A2AResponse(
                success = false,
                content = "",
                error = "Accessibility service not available"
            )
        }

        try {
            val result = when (action) {
                "tap" -> {
                    val x = (params["x"] as? Number)?.toFloat() ?: return@withContext badParams("x")
                    val y = (params["y"] as? Number)?.toFloat() ?: return@withContext badParams("y")
                    accessibilityService.performTap(x, y)
                    successResult("Tapped at ($x, $y)")
                }
                "long_press" -> {
                    val x = (params["x"] as? Number)?.toFloat() ?: return@withContext badParams("x")
                    val y = (params["y"] as? Number)?.toFloat() ?: return@withContext badParams("y")
                    accessibilityService.performLongPress(x, y)
                    successResult("Long pressed at ($x, $y)")
                }
                "swipe" -> {
                    val x1 = (params["x1"] as? Number)?.toFloat() ?: return@withContext badParams("x1")
                    val y1 = (params["y1"] as? Number)?.toFloat() ?: return@withContext badParams("y1")
                    val x2 = (params["x2"] as? Number)?.toFloat() ?: return@withContext badParams("x2")
                    val y2 = (params["y2"] as? Number)?.toFloat() ?: return@withContext badParams("y2")
                    val duration = (params["duration_ms"] as? Number)?.toLong() ?: 300L
                    accessibilityService.performSwipe(x1, y1, x2, y2, duration)
                    successResult("Swiped from ($x1, $y1) to ($x2, $y2)")
                }
                "find_and_click" -> {
                    val text = params["text"] as? String ?: return@withContext badParams("text")
                    val found = accessibilityService.findAndClickByText(text)
                    if (found) {
                        successResult("Clicked on element with text: $text")
                    } else {
                        A2AResponse(success = false, content = "", error = "Element not found: $text")
                    }
                }
                "find_and_long_press" -> {
                    val text = params["text"] as? String ?: return@withContext badParams("text")
                    val node = accessibilityService.findNodeByText(
                        accessibilityService.rootInActiveWindow!!,
                        text,
                        mutableSetOf()
                    )
                    if (node != null && node.isLongClickable) {
                        val result = node.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_LONG_CLICK)
                        node.recycle()
                        if (result) {
                            successResult("Long pressed on element with text: $text")
                        } else {
                            A2AResponse(success = false, content = "", error = "Long click failed")
                        }
                    } else {
                        A2AResponse(success = false, content = "", error = "Element not found or not long-clickable: $text")
                    }
                }
                "read_screen" -> {
                    val text = readScreenContent(accessibilityService)
                    successResult(text)
                }
                "get_current_app" -> {
                    val packageName = accessibilityService.rootInActiveWindow?.packageName?.toString() ?: "unknown"
                    successResult(packageName)
                }
                "scroll" -> {
                    val direction = params["direction"] as? String ?: return@withContext badParams("direction")
                    val node = accessibilityService.rootInActiveWindow
                    if (node != null) {
                        val action = when (direction) {
                            "up" -> android.view.accessibility.AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
                            "down" -> android.view.accessibility.AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
                            else -> return@withContext A2AResponse(success = false, content = "", error = "Invalid direction: $direction")
                        }
                        val result = node.performAction(action)
                        node.recycle()
                        if (result) {
                            successResult("Scrolled $direction")
                        } else {
                            A2AResponse(success = false, content = "", error = "Scroll failed")
                        }
                    } else {
                        A2AResponse(success = false, content = "", error = "Cannot get root window")
                    }
                }
                else -> A2AResponse(success = false, content = "", error = "Unknown action: $action")
            }
            result
        } catch (e: Exception) {
            AppLog.e(TAG, "Action execution failed: $action", e)
            A2AResponse(success = false, content = "", error = e.message)
        }
    }

    fun getCapabilities(): AgentCapabilities = AgentCapabilities()

    private fun formatActionMessage(message: A2AMessage): String {
        return when (message.type) {
            "action" -> "[ACTION] ${message.content}"
            "chat" -> message.content
            else -> message.content
        }
    }

    private fun parseA2AResponse(body: String): A2AResponse {
        return try {
            val json = JSONObject(body)
            if (json.has("error")) {
                val error = json.getJSONObject("error")
                A2AResponse(
                    success = false,
                    content = "",
                    error = error.optString("message", "Unknown error")
                )
            } else if (json.has("result")) {
                val result = json.getJSONObject("result")
                val status = result.optJSONObject("status")
                val message = status?.optString("message") ?: result.toString()
                A2AResponse(success = true, content = message)
            } else {
                A2AResponse(success = true, content = body)
            }
        } catch (e: Exception) {
            A2AResponse(success = true, content = body)
        }
    }

    private fun readScreenContent(service: PrefrontalAccessibilityService): String {
        val root = service.rootInActiveWindow ?: return "Cannot access screen"
        val sb = StringBuilder()
        appendNodesToString(root, sb, 0)
        root.recycle()
        return sb.toString()
    }

    private fun appendNodesToString(node: android.view.accessibility.AccessibilityNodeInfo, sb: StringBuilder, depth: Int) {
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

    private fun badParams(missing: String): A2AResponse {
        return A2AResponse(success = false, content = "", error = "Missing parameter: $missing")
    }

    private fun successResult(content: String): A2AResponse {
        return A2AResponse(success = true, content = content)
    }

    companion object {
        private const val TAG = "MobileActionAgent"
    }
}
