package com.ibloc.shadow.litert

import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class LitertEngine {
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
                backend = Backend.GPU()
            )
            engine = Engine(config)
            engine?.initialize()
            _isInitialized.value = true
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        } finally {
            _isLoading.value = false
        }
    }
    
    suspend fun createConversation(systemInstruction: String? = null): Boolean {
        if (!_isInitialized.value) return false
        
        return try {
            val convConfig = if (systemInstruction != null) {
                ConversationConfig(
                    systemInstruction = com.google.ai.edge.litertlm.Content.Text(systemInstruction)
                )
            } else null
            
            conversation = engine?.createConversation(convConfig)
            _isConversationReady.value = conversation != null
            conversation != null
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
    
    suspend fun sendMessage(text: String): String {
        val conv = conversation ?: throw IllegalStateException("Conversation not created")
        return try {
            val response = conv.sendMessage(
                com.google.ai.edge.litertlm.Content.Text(text)
            )
            response.text ?: ""
        } catch (e: Exception) {
            e.printStackTrace()
            throw e
        }
    }
    
    fun release() {
        try {
            conversation?.close()
            conversation = null
            _isConversationReady.value = false
        } catch (_: Exception) {}
        
        try {
            engine?.close()
            engine = null
            _isInitialized.value = false
        } catch (_: Exception) {}
        
        _isLoading.value = false
    }
}
