package com.ibloc.shadow.litert

import android.content.Context
import android.util.Log
import android.util.Base64
import com.ibloc.shadow.AppLog
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
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import java.io.File

class LitertEngine(private val context: Context) {
    private var engine: Engine? = null
    private var conversation: Conversation? = null
    private var currentModelPath: String = ""
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

    data class ModelInfo(
        val id: String,
        val modelPath: String,
        val backend: String,
        val loadedAt: Long
    )

    fun getLoadedModelInfo(): ModelInfo? {
        if (!_isInitialized.value || engine == null) return null
        return ModelInfo(
            id = "litert-${currentModelPath.hashCode()}",
            modelPath = currentModelPath,
            backend = "CPU",
            loadedAt = System.currentTimeMillis()
        )
    }

    suspend fun initialize(modelPath: String): Boolean {
        if (_isInitialized.value) return true

        _isLoading.value = true
        _lastError.value = null
        currentModelPath = modelPath

        val diagnosis = diagnoseModelDirectory(modelPath)
        if (diagnosis["dispatchLibraryPresent"] != true) {
            val recommendation = diagnosis["recommendation"] as? String ?: "download"
            AppLog.w("LitertEngine", "No dispatch library found, recommendation: $recommendation")
            _lastError.value = "No dispatch library found in $modelPath"
            _isLoading.value = false
            return false
        }

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
            AppLog.d("LitertEngine", "Initialized LiteRT engine with model: $modelPath")
            return true
        } catch (e: Exception) {
            AppLog.e("LitertEngine", "Initialization failed", e)
            _lastError.value = e.message ?: "Unknown error"
            _isLoading.value = false
            return false
        }
    }

    suspend fun initializeWithTimeout(modelPath: String, timeoutMs: Long = 10000): Boolean {
        if (_isInitialized.value) return true

        _isLoading.value = true
        _lastError.value = null

        val diagnosis = diagnoseModelDirectory(modelPath)
        if (diagnosis["dispatchLibraryPresent"] != true) {
            val recommendation = diagnosis["recommendation"] as? String ?: "download"
            AppLog.w("LitertEngine", "No dispatch library found, recommendation: $recommendation")
            _lastError.value = "No dispatch library found in $modelPath"
            _isLoading.value = false
            return false
        }

        Engine.setNativeMinLogSeverity(LogSeverity.ERROR)

        val startTime = System.currentTimeMillis()
        val success = withTimeoutOrNull(timeoutMs) {
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
                AppLog.d("LitertEngine", "Initialized LiteRT engine with model: $modelPath")
                true
            } catch (e: Exception) {
                AppLog.e("LitertEngine", "Initialization failed", e)
                _lastError.value = e.message ?: "Unknown error"
                false
            }
        } ?: false

        val elapsed = System.currentTimeMillis() - startTime
        _isLoading.value = false

        if (!success) {
            if (_lastError.value == null) {
                _lastError.value = "Initialization timed out after ${elapsed}ms"
            }
            AppLog.w("LitertEngine", "initializeWithTimeout timed out after ${elapsed}ms")
        }

        return success
    }

    fun diagnoseModelDirectory(modelPath: String): Map<String, Any> {
        val modelDir = File(modelPath)
        val dirExists = modelDir.exists() && modelDir.isDirectory

        if (!dirExists) {
            return mapOf(
                "exists" to false,
                "dispatchLibraryPresent" to false,
                "modelFiles" to emptyList<String>(),
                "totalSize" to 0L,
                "recommendation" to "download"
            )
        }

        val files = modelDir.listFiles()?.toList() ?: emptyList()
        val fileNames = files.filter { it.isFile }.map { it.name }
        val totalSize = files.sumOf { it.length() }

        val dispatchPatterns = listOf(".dispatch", "_dispatch", "dispatch.", "litertlm")
        val hasDispatchLib = fileNames.any { name ->
            dispatchPatterns.any { pattern ->
                name.contains(pattern, ignoreCase = true)
            }
        } && fileNames.any { it.endsWith(".litertlm", ignoreCase = true) }

        val recommendation = when {
            !hasDispatchLib && fileNames.isEmpty() -> "download"
            !hasDispatchLib -> "wrong-format"
            else -> "ready"
        }

        return mapOf(
            "exists" to dirExists,
            "dispatchLibraryPresent" to hasDispatchLib,
            "modelFiles" to fileNames,
            "totalSize" to totalSize,
            "recommendation" to recommendation
        )
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
            AppLog.e("LitertEngine", "Generation failed", e)
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
            AppLog.e("LitertEngine", "Generation failed", e)
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