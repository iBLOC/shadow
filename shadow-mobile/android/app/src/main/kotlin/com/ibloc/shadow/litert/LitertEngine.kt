package com.ibloc.shadow.litert

import android.content.Context
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.Message
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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
                // Use cache dir for better performance on subsequent loads
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
            val convConfig = if (systemInstruction != null) {
                ConversationConfig(
                    systemInstruction = Content.of(Message.of(systemInstruction))
                )
            } else null

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
            val content = Content.of(Message.of(text))
            val response = conversation?.sendMessage(content)
            response?.let { extractText(it) } ?: ""
        } catch (e: Exception) {
            e.printStackTrace()
            throw e
        }
    }

    private fun extractText(message: Message): String {
        // Extract text content from the response message
        // The message structure contains content parts
        return try {
            val text = StringBuilder()
            // Message contains content parts - extract text from each
            if (message.text.isNotEmpty()) {
                text.append(message.text)
            }
            text.toString()
        } catch (e: Exception) {
            e.printStackTrace()
            ""
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
