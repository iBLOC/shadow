package com.ibloc.shadow.mnn

import android.content.Context
import android.util.Log
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.PrintWriter
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors
import kotlin.concurrent.thread

class OpenAIServer(private val context: Context) {
    companion object {
        private const val TAG = "OpenAIServer"
        private const val DEFAULT_PORT = 8080
        private const val MAX_THREADS = 4
    }
    
    private var serverSocket: ServerSocket? = null
    private var isRunning = false
    private var port = DEFAULT_PORT
    private var corsEnabled = false
    private var authEnabled = true
    private var apiKey = generateApiKey()
    private val executor = Executors.newFixedThreadPool(MAX_THREADS)
    
    fun start(): Boolean {
        if (isRunning) return true
        
        try {
            serverSocket = ServerSocket(port)
            isRunning = true
            
            thread {
                Log.i(TAG, "OpenAI-compatible server started on port $port")
                while (isRunning) {
                    try {
                        val client = serverSocket!!.accept()
                        executor.execute { handleClient(client) }
                    } catch (e: Exception) {
                        if (isRunning) {
                            Log.e(TAG, "Error accepting connection", e)
                        }
                    }
                }
            }
            
            Log.i(TAG, "Server started successfully on http://localhost:$port")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start server", e)
            isRunning = false
            return false
        }
    }
    
    fun stop() {
        isRunning = false
        try {
            serverSocket?.close()
        } catch (e: Exception) {
            Log.e(TAG, "Error closing server", e)
        }
        executor.shutdown()
        Log.i(TAG, "Server stopped")
    }
    
    private fun handleClient(client: Socket) {
        try {
            val reader = BufferedReader(InputStreamReader(client.getInputStream()))
            val writer = PrintWriter(client.getOutputStream(), true)
            
            val requestLine = reader.readLine() ?: return
            val parts = requestLine.split(" ")
            if (parts.size < 2) {
                sendError(writer, 400, "Bad Request")
                return
            }
            
            val method = parts[0]
            val path = parts[1]
            
            val headers = mutableMapOf<String, String>()
            var contentLength = 0
            var line: String?
            while (reader.readLine().also { line = it }?.isNotEmpty() == true) {
                val headerParts = line!!.split(":", limit = 2)
                if (headerParts.size == 2) {
                    headers[headerParts[0].trim().lowercase()] = headerParts[1].trim()
                    if (headerParts[0].trim().lowercase() == "content-length") {
                        contentLength = headerParts[1].trim().toIntOrNull() ?: 0
                    }
                }
            }
            
            if (authEnabled && !validateAuth(headers)) {
                sendError(writer, 401, "Unauthorized", """{"error": {"message": "Invalid API key", "type": "invalid_request_error"}}""")
                return
            }
            
            val body = if (contentLength > 0) {
                val bodyChars = CharArray(contentLength)
                reader.read(bodyChars, 0, contentLength)
                String(bodyChars)
            } else ""
            
            when {
                path == "/v1/chat/completions" && method == "POST" -> {
                    handleChatCompletion(writer, body)
                }
                path == "/v1/models" && method == "GET" -> {
                    handleModels(writer)
                }
                path == "/health" && method == "GET" -> {
                    sendJson(writer, 200, """{"status": "ok"}""")
                }
                else -> {
                    sendError(writer, 404, "Not Found", """{"error": {"message": "Endpoint not found: $path", "type": "invalid_request_error"}}""")
                }
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error handling client", e)
        } finally {
            try {
                client.close()
            } catch (e: Exception) {
                Log.e(TAG, "Error closing client", e)
            }
        }
    }
    
    private fun validateAuth(headers: Map<String, String>): Boolean {
        val authHeader = headers["authorization"]
        return authHeader == null || authHeader.startsWith("Bearer $apiKey")
    }
    
    private fun handleChatCompletion(writer: PrintWriter, body: String) {
        try {
            val request = parseChatRequest(body)
            val messages = request.messages
            val temperature = request.temperature ?: 0.7
            val maxTokens = request.maxTokens ?: 2048
            
            val lastUserMessage = messages.lastOrNull { it["role"] == "user" }
            val prompt = lastUserMessage?.get("content") ?: ""
            
            val response = PrefrontalMNN.generate(prompt)
            
            if (response.startsWith("Error:")) {
                val errorResponse = buildChatResponse(
                    "chatcmpl-${System.currentTimeMillis()}",
                    request.model ?: "qwen2.5-0.5b",
                    "抱歉，模型推理服务暂时不可用",
                    listOf(
                        mapOf("index" to 0, "message" to mapOf("role" to "assistant", "content" to response), "finish_reason" to "stop")
                    ),
                    mapOf("prompt_tokens" to prompt.length, "completion_tokens" to response.length, "total_tokens" to prompt.length + response.length)
                )
                sendJson(writer, 200, errorResponse)
            } else {
                val chatResponse = buildChatResponse(
                    "chatcmpl-${System.currentTimeMillis()}",
                    request.model ?: "qwen2.5-0.5b",
                    response,
                    listOf(
                        mapOf("index" to 0, "message" to mapOf("role" to "assistant", "content" to response), "finish_reason" to "stop")
                    ),
                    mapOf("prompt_tokens" to prompt.length, "completion_tokens" to response.length, "total_tokens" to prompt.length + response.length)
                )
                sendJson(writer, 200, chatResponse)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error processing chat completion", e)
            sendError(writer, 500, "Internal Server Error", """{"error": {"message": "${e.message}", "type": "server_error"}}""")
        }
    }
    
    private fun handleModels(writer: PrintWriter) {
        val models = mapOf(
            "object" to "list",
            "data" to listOf(
                mapOf(
                    "id" to "qwen2.5-0.5b",
                    "object" to "model",
                    "created" to (System.currentTimeMillis() / 1000),
                    "owned_by" to "prefrontal",
                    "permission" to listOf<Map<String, Any>>(),
                    "root" to "qwen2.5-0.5b",
                    "parent" to null as String?
                )
            )
        )
        sendJson(writer, 200, models.toString())
    }
    
    private fun parseChatRequest(body: String): ChatRequest {
        val result = mutableMapOf<String, Any?>()
        
        val modelMatch = Regex(""""model"\s*:\s*"([^"]+)"""").find(body)
        result["model"] = modelMatch?.groupValues?.get(1)
        
        val tempMatch = Regex(""""temperature"\s*:\s*([\d.]+)""").find(body)
        result["temperature"] = tempMatch?.groupValues?.get(1)?.toDoubleOrNull()
        
        val maxTokensMatch = Regex(""""max_tokens"\s*:\s*(\d+)""").find(body)
        result["maxTokens"] = maxTokensMatch?.groupValues?.get(1)?.toIntOrNull()
        
        val messages = mutableListOf<Map<String, String>>()
        val msgPattern = Regex("""\{"role"\s*:\s*"([^"]+)"\s*,\s*"content"\s*:\s*"([^"]+)"}""")
        msgPattern.findAll(body).forEach { match ->
            messages.add(mapOf("role" to match.groupValues[1], "content" to match.groupValues[2]))
        }
        result["messages"] = messages
        
        return ChatRequest(
            model = result["model"] as? String,
            temperature = result["temperature"] as? Double,
            maxTokens = result["maxTokens"] as? Int,
            messages = result["messages"] as List<Map<String, String>>
        )
    }
    
    private fun buildChatResponse(
        id: String,
        model: String,
        content: String,
        choices: List<Map<String, Any>>,
        usage: Map<String, Int>
    ): String {
        return """
        {
            "id": "$id",
            "object": "chat.completion",
            "created": ${System.currentTimeMillis() / 1000},
            "model": "$model",
            "choices": $choices,
            "usage": $usage
        }
        """.trimIndent()
    }
    
    private fun sendJson(writer: PrintWriter, status: Int, json: String) {
        writer.println("HTTP/1.1 $status OK")
        writer.println("Content-Type: application/json")
        if (corsEnabled) {
            writer.println("Access-Control-Allow-Origin: *")
            writer.println("Access-Control-Allow-Methods: GET, POST, OPTIONS")
            writer.println("Access-Control-Allow-Headers: Content-Type, Authorization")
        }
        writer.println("Content-Length: ${json.toByteArray().size}")
        writer.println()
        writer.println(json)
    }
    
    private fun sendError(writer: PrintWriter, status: Int, message: String, body: String? = null) {
        val responseBody = body ?: """{"error": {"message": "$message", "type": "invalid_request_error"}}"""
        writer.println("HTTP/1.1 $status $message")
        writer.println("Content-Type: application/json")
        if (corsEnabled) {
            writer.println("Access-Control-Allow-Origin: *")
        }
        writer.println("Content-Length: ${responseBody.toByteArray().size}")
        writer.println()
        writer.println(responseBody)
    }
    
    fun isRunning(): Boolean = isRunning
    fun getServerUrl(): String = "http://localhost:$port"
    fun getPort(): Int = port
    fun setPort(newPort: Int) { if (!isRunning) port = newPort }
    fun setCorsEnabled(enabled: Boolean) { corsEnabled = enabled }
    fun setAuthEnabled(enabled: Boolean) { authEnabled = enabled }
    fun setApiKey(key: String) { apiKey = key }
    fun getApiKey(): String = apiKey
    
    private fun generateApiKey(): String {
        val chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
        return (1..32).map { chars.random() }.joinToString("")
    }
    
    data class ChatRequest(
        val model: String?,
        val temperature: Double?,
        val maxTokens: Int?,
        val messages: List<Map<String, String>>
    )
}
