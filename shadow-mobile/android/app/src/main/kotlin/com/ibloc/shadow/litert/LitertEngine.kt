package com.ibloc.shadow.litert

import android.content.Context
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Contents
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class LitertEngine(private val context: Context) {
    private var engine: Engine? = null
    private var conversation: Conversation? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val _isInitialized = MutableStateFlow(false)
    val isInitialized: StateFlow<Boolean> = _isInitialized

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _isConversationReady = MutableStateFlow(false)
    val isConversationReady: StateFlow<Boolean> = _isConversationReady

    suspend fun initialize(modelPath: String): Boolean {
        if (_isInitialized.value) return true

        _isLoading.value = true
        return try {
            val config = EngineConfig(
                modelPath = modelPath,
                backend = Backend.GPU(),
                cacheDir = context.cacheDir.path
            )
            engine = Engine(config)
            engine?.initialize()
            _isInitialized.value = true
            true
        } catch (e: Exception) {
            e.printStackTrace()
            _isInitialized.value = false
            false
        } finally {
            _isLoading.value = false
        }
    }

    suspend fun createConversation(systemInstruction: String? = null): Boolean {
        if (!_isInitialized.value || engine == null) return false

        return try {
            // Create conversation with empty config - system instruction not supported directly
            val convConfig = ConversationConfig()
            conversation = engine?.createConversation(convConfig)
            _isConversationReady.value = true
            true
        } catch (e: Exception) {
            e.printStackTrace()
            _isConversationReady.value = false
            false
        }
    }

    suspend fun sendMessage(text: String): String {
        if (conversation == null) {
            throw IllegalStateException("Conversation not created. Call createConversation first.")
        }

        return try {
            // Use String overload of sendMessage
            val response = conversation?.sendMessage(text)
            // Response is Message type - extract text content
            // Based on API, Message has text property
            response?.let { msg ->
                // Try different ways to get text from Message
                try {
                    val textField = msg.javaClass.getDeclaredField("text")
                    textField.isAccessible = true
                    textField.get(msg) as? String ?: ""
                } catch (e: Exception) {
                    // Fallback: return class name for debugging
                    "Response: ${msg.javaClass.simpleName}"
                }
            } ?: ""
        } catch (e: Exception) {
            e.printStackTrace()
            throw e
        }
    }

    fun release() {
        try {
            conversation?.close()
        } catch (_: Exception) {}
        conversation = null
        _isConversationReady.value = false

        try {
            engine?.close()
        } catch (_: Exception) {}
        engine = null
        _isInitialized.value = false
        _isLoading.value = false
    }
}