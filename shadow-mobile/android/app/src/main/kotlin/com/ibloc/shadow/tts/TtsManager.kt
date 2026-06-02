package com.ibloc.shadow.tts

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.Locale

class TtsManager(private val context: Context) : TextToSpeech.OnInitListener {
    private var tts: TextToSpeech? = null
    private var isInitialized = false
    private var pendingText: String? = null
    
    private val _isSpeaking = MutableStateFlow(false)
    val isSpeaking: StateFlow<Boolean> = _isSpeaking
    
    init {
        tts = TextToSpeech(context, this)
    }
    
    override fun onInit(status: Int) {
        isInitialized = status == TextToSpeech.SUCCESS
        Log.d("TtsManager", "onInit: isInitialized=$isInitialized, status=$status")
        if (isInitialized) {
            tts?.language = Locale.CHINA
            tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {
                    _isSpeaking.value = true
                }
                
                override fun onDone(utteranceId: String?) {
                    _isSpeaking.value = false
                }
                
                override fun onError(utteranceId: String?) {
                    _isSpeaking.value = false
                    Log.e("TtsManager", "onError: utteranceId=$utteranceId")
                }
                
                override fun onError(utteranceId: String?, errorCode: Int) {
                    _isSpeaking.value = false
                    Log.e("TtsManager", "onError: utteranceId=$utteranceId, errorCode=$errorCode")
                }
            })
            pendingText?.let { speak(it); pendingText = null }
        }
    }
    
    fun speak(text: String, lang: String = "zh-CN") {
        Log.d("TtsManager", "speak called: text length=${text.length}, isInitialized=$isInitialized")
        if (text.isBlank()) {
            Log.w("TtsManager", "speak: text is blank")
            return
        }
        if (!isInitialized) {
            Log.w("TtsManager", "speak: not initialized, queueing text")
            pendingText = text
            return
        }
        
        val locale = when (lang) {
            "zh-CN" -> Locale.CHINA
            "en-US" -> Locale.US
            else -> Locale.getDefault()
        }
        
        tts?.language = locale
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "tts_${System.currentTimeMillis()}")
        Log.d("TtsManager", "speak: tts.speak called")
    }
    
    fun stop() {
        tts?.stop()
        _isSpeaking.value = false
    }
    
    fun release() {
        tts?.stop()
        tts?.shutdown()
        tts = null
        isInitialized = false
        _isSpeaking.value = false
    }

    fun isInitialized(): Boolean = isInitialized
}
