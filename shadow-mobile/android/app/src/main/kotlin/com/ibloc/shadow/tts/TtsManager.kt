package com.ibloc.shadow.tts

import android.content.Context
import android.media.MediaPlayer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import com.ibloc.shadow.AppLog
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File
import java.util.Locale

class TtsManager(private val context: Context) : TextToSpeech.OnInitListener {
    private var tts: TextToSpeech? = null
    private var isInitialized = false
    private var pendingText: String? = null

    /// **端脑合成回来的音频**的播放器（MediaPlayer）。
    ///
    /// ⚠️ 以前这一格在 Dart 侧**只 debugPrint**（「Playing N bytes」）⇒ ⇒
    /// 音频取到了却从来没响过 ⇒ ⇒ 「取到了」被当成了「播出来了」。
    /// ⇒ ⇒ 播放落到**原生**（MediaPlayer）⇒ ⇒ 零新增依赖。
    private var mediaPlayer: MediaPlayer? = null

    private val _isSpeaking = MutableStateFlow(false)
    val isSpeaking: StateFlow<Boolean> = _isSpeaking

    init {
        tts = TextToSpeech(context, this)
    }

    override fun onInit(status: Int) {
        isInitialized = status == TextToSpeech.SUCCESS
        AppLog.d("TtsManager", "onInit: isInitialized=$isInitialized, status=$status")
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
                    AppLog.e("TtsManager", "onError: utteranceId=$utteranceId")
                }

                override fun onError(utteranceId: String?, errorCode: Int) {
                    _isSpeaking.value = false
                    AppLog.e("TtsManager", "onError: utteranceId=$utteranceId, errorCode=$errorCode")
                }
            })
            pendingText?.let { speak(it); pendingText = null }
        }
    }

    fun speak(text: String, lang: String = "zh-CN") {
        AppLog.d("TtsManager", "speak called: text length=${text.length}, isInitialized=$isInitialized")
        if (text.isBlank()) {
            AppLog.w("TtsManager", "speak: text is blank")
            return
        }
        if (!isInitialized) {
            AppLog.w("TtsManager", "speak: not initialized, queueing text")
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
        AppLog.d("TtsManager", "speak: tts.speak called")
    }

    /**
     * **播放端脑合成回来的音频字节** —— 真播。
     *
     * 形状：`MediaPlayer` 只能吃**文件或 URL** ⇒ ⇒ 落到 cache 目录的临时
     * 文件（**每次新名** ⇒ ⇒ 不会撞上正在播的那一份）。
     *
     * @return 真的开始播了没有（false ⇒ 调用方要如实报「没播出来」）。
     */
    fun playAudioBytes(bytes: ByteArray): Boolean {
        if (bytes.isEmpty()) {
            AppLog.w("TtsManager", "playAudioBytes: empty bytes")
            return false
        }
        var file: File? = null
        return try {
            val dir = File(context.cacheDir, "tts")
            if (!dir.exists()) dir.mkdirs()
            file = File(dir, "tts_${System.currentTimeMillis()}_${bytes.size}.mp3")
            file.writeBytes(bytes)

            val mp = MediaPlayer()
            mp.setDataSource(file.absolutePath)
            mp.setOnPreparedListener {
                it.start()
                _isSpeaking.value = true
                AppLog.d("TtsManager", "playAudioBytes: started (${bytes.size} bytes)")
            }
            mp.setOnCompletionListener {
                _isSpeaking.value = false
                it.release()
                synchronized(this@TtsManager) {
                    if (mediaPlayer === it) mediaPlayer = null
                }
                // 播完就删（cache 不该越攒越多）。
                runCatching { file?.delete() }
            }
            mp.setOnErrorListener { player, what, extra ->
                _isSpeaking.value = false
                AppLog.e("TtsManager", "playAudioBytes: MediaPlayer error what=$what extra=$extra")
                runCatching { player.release() }
                synchronized(this@TtsManager) {
                    if (mediaPlayer === player) mediaPlayer = null
                }
                runCatching { file?.delete() }
                true
            }
            mp.prepareAsync()
            synchronized(this@TtsManager) {
                mediaPlayer?.release()
                mediaPlayer = mp
            }
            true
        } catch (e: Exception) {
            AppLog.e("TtsManager", "playAudioBytes failed: $e")
            runCatching { file?.delete() }
            false
        }
    }

    fun stop() {
        tts?.stop()
        synchronized(this@TtsManager) {
            runCatching { mediaPlayer?.stop() }
            runCatching { mediaPlayer?.release() }
            mediaPlayer = null
        }
        _isSpeaking.value = false
    }

    fun release() {
        tts?.stop()
        tts?.shutdown()
        tts = null
        isInitialized = false
        synchronized(this@TtsManager) {
            runCatching { mediaPlayer?.release() }
            mediaPlayer = null
        }
        _isSpeaking.value = false
    }

    fun isInitialized(): Boolean = isInitialized
}
