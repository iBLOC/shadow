package com.ibloc.shadow.litert

import android.content.Context
import android.util.Log
import android.util.Base64
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.LogSeverity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONObject

class LitertEngine(private val context: Context) {
    private var engine: Engine? = null
    private var conversation: Conversation? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val _isInitialized = MutableStateFlow(false)
    val isInitialized: StateFlow<Boolean> = _isInitialized

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _downloadProgress = MutableStateFlow<Pair<Long, Long>?>(null)
    val downloadProgress: StateFlow<Pair<Long, Long>?> = _downloadProgress

    private val _lastError = MutableStateFlow<String?>(null)
    val lastError: StateFlow<String?> = _lastError

    private val _responseText = MutableStateFlow("")
    val responseText: StateFlow<String> = _responseText

    private var isStreaming = false

    suspend fun initialize(modelPath: String): Boolean {
        if (_isInitialized.value) return true

        _isLoading.value = true
        _lastError.value = null

        Engine.setNativeMinLogSeverity(LogSeverity.ERROR)

        try {
            val engineConfig = EngineConfig(
                modelPath = modelPath,
                backend = Backend.CPU(),
                cacheDir = context.cacheDir.path
            )

            engine = Engine(engineConfig)
            engine!!.initialize()

            conversation = engine!!.createConversation()

            _isInitialized.value = true
            _isLoading.value = false
            Log.d("LitertEngine", "Initialized LiteRT engine with model: $modelPath")
            return true
        } catch (e: Exception) {
            Log.e("LitertEngine", "Initialization failed", e)
            _lastError.value = e.message
            _isLoading.value = false
            return false
        }
    }

    suspend fun generateContent(prompt: String): String {
        if (!_isInitialized.value || engine == null || conversation == null) {
            _lastError.value = "Engine not initialized"
            return ""
        }

        try {
            val response = conversation!!.sendMessage(prompt)
            return response.toString()
        } catch (e: Exception) {
            Log.e("LitertEngine", "Generation failed", e)
            _lastError.value = e.message
            return ""
        }
    }

    suspend fun generateContentStream(contentJson: String): String {
        if (!_isInitialized.value || engine == null || conversation == null) {
            _lastError.value = "Engine not initialized"
            return ""
        }

        if (isStreaming) {
            _lastError.value = "Already generating"
            return ""
        }

        isStreaming = true
        _responseText.value = ""

        try {
            val contents = buildContentsFromJson(contentJson)
            val response = conversation!!.sendMessage(contents)
            val responseStr = response.toString()
            _responseText.value = responseStr
            return responseStr
        } catch (e: Exception) {
            Log.e("LitertEngine", "Generation failed", e)
            _lastError.value = e.message
            return ""
        } finally {
            isStreaming = false
        }
    }

    private fun buildContentsFromJson(contentJson: String): Contents {
        val json = JSONObject(contentJson)
        val prompt = json.optString("prompt", "")
        val partsJson = json.optJSONArray("parts")

        val contents = mutableListOf<Content>()

        if (prompt.isNotEmpty()) {
            contents.add(Content.Text(prompt))
        }

        if (partsJson != null) {
            for (i in 0 until partsJson.length()) {
                val part = partsJson.getJSONObject(i)

                if (part.has("text")) {
                    val text = part.getString("text")
                    contents.add(Content.Text(text))
                }

                if (part.has("audio")) {
                    val base64Audio = part.getString("audio")
                    val audioBytes = Base64.decode(base64Audio, Base64.DEFAULT)
                    contents.add(Content.AudioBytes(audioBytes))
                }

                if (part.has("image")) {
                    val base64Image = part.getString("image")
                    val imageBytes = Base64.decode(base64Image, Base64.DEFAULT)
                    contents.add(Content.ImageBytes(imageBytes))
                }
            }
        }

        return Contents.of(contents)
    }

    fun release() {
        try {
            conversation?.close()
            engine?.close()
        } catch (_: Exception) {}
        engine = null
        conversation = null
        _isInitialized.value = false
        _isLoading.value = false
        _downloadProgress.value = null
        _responseText.value = ""
    }
}