package com.ibloc.shadow.litert

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.TextPart
import com.google.mlkit.genai.prompt.generateContentRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class LitertEngine(private val context: Context) {
    private var generativeModel: GenerativeModel? = null
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

    suspend fun initialize(modelName: String = "gemma-4-it-4b"): Boolean {
        if (_isInitialized.value) return true

        _isLoading.value = true
        _lastError.value = null

        try {
            generativeModel = Generation.getClient()

            val status = generativeModel!!.checkStatus()
            when (status) {
                FeatureStatus.AVAILABLE -> {
                    generativeModel!!.warmup()
                    _isInitialized.value = true
                    _isLoading.value = false
                    Log.d("LitertEngine", "Model is available")
                }
                FeatureStatus.DOWNLOADABLE, FeatureStatus.DOWNLOADING -> {
                    Log.d("LitertEngine", "Model needs download, starting download...")
                    generativeModel!!.download().collect { downloadStatus ->
                        when (downloadStatus) {
                            is DownloadStatus.DownloadStarted -> {
                                _downloadProgress.value = Pair(0L, 0L)
                            }
                            is DownloadStatus.DownloadProgress -> {
                                _downloadProgress.value = Pair(
                                    downloadStatus.totalBytesDownloaded,
                                    downloadStatus.totalBytesDownloaded
                                )
                            }
                            is DownloadStatus.DownloadCompleted -> {
                                _downloadProgress.value = null
                                generativeModel!!.warmup()
                                _isInitialized.value = true
                                _isLoading.value = false
                                Log.d("LitertEngine", "Model download completed")
                            }
                            is DownloadStatus.DownloadFailed -> {
                                _lastError.value = downloadStatus.e?.message
                                _isLoading.value = false
                                Log.e("LitertEngine", "Download failed", downloadStatus.e)
                            }
                        }
                    }
                }
                FeatureStatus.UNAVAILABLE -> {
                    _lastError.value = "Model is unavailable on this device"
                    _isLoading.value = false
                    Log.e("LitertEngine", "Model unavailable")
                }
                else -> {
                    _lastError.value = "Unknown model status: $status"
                    _isLoading.value = false
                }
            }

            Log.d("LitertEngine", "Initialized ML Kit for model: $modelName")
            return _isInitialized.value
        } catch (e: Exception) {
            Log.e("LitertEngine", "Initialization failed", e)
            _lastError.value = e.message
            _isLoading.value = false
            return false
        }
    }

    suspend fun generateContentStream(prompt: String, image: Bitmap? = null) {
        if (!_isInitialized.value || generativeModel == null) {
            _lastError.value = "Model not initialized"
            return
        }

        if (isStreaming) {
            _lastError.value = "Already generating"
            return
        }

        isStreaming = true
        _responseText.value = ""

        try {
            val request = generateContentRequest(TextPart(prompt)) {}
            val flow = generativeModel!!.generateContentStream(request)

            flow.collect { response ->
                val text = response.candidates.firstOrNull()?.text ?: ""
                _responseText.value += text
            }
        } catch (e: Exception) {
            Log.e("LitertEngine", "Generation failed", e)
            _lastError.value = e.message
        } finally {
            isStreaming = false
        }
    }

    suspend fun generateContent(prompt: String, image: Bitmap? = null): String {
        if (!_isInitialized.value || generativeModel == null) {
            _lastError.value = "Model not initialized"
            return ""
        }

        try {
            val response = generativeModel!!.generateContent(prompt)
            return response.candidates.firstOrNull()?.text ?: ""
        } catch (e: Exception) {
            Log.e("LitertEngine", "Generation failed", e)
            _lastError.value = e.message
            return ""
        }
    }

    fun release() {
        try {
            generativeModel?.close()
        } catch (_: Exception) {}
        generativeModel = null
        _isInitialized.value = false
        _isLoading.value = false
        _downloadProgress.value = null
        _responseText.value = ""
    }
}
