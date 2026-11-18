package com.ibloc.shadow.tts

import android.app.NotificationManager
import android.content.Context
import android.media.AudioManager
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

    /**
     * **设备是不是「该安静了」** —— 三档合起来看：媒体音量、响铃档、勿扰。
     *
     * ⚠️ **每一档各自三态**（`"muted"` / `"unmuted"` / `"unknown"`）⇒ ⇒
     * 上层按「**任何一档确定该静 ⇒ 跳过**；任何一档查不到 ⇒ 那一档**不算
     * 数**」判定 ⇒ ⇒ **查不到永远不会导致跳过**（宁可多合成一次，也绝不静
     * 默吞掉声音）⇒ ⇒ 规则只有这一份（同一规则写两份 ⇒ ⇒ 变异只打掉一份
     * 时另一份会把断言喂饱 —— 假绿教训）。
     *
     * ⚠️ **响铃档与勿扰在物理上并不让媒体流闭嘴** —— 静音模式管的是**通
     * 知/铃声**，媒体流照常有声 ⇒ ⇒ 这两档是**产品裁定**（用户说「静音模
     * 式也不需要 tts」⇒ ⇒ 尊重用户意图、少烧算力）⇒ ⇒ **不是**「没人听
     * 得见」⇒ ⇒ 措辞必须如实，别写成「没人听得见」。
     */
    fun deviceSilentState(): Map<String, String> {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        val state = mapOf(
            "volume" to volumeState(am),
            "ringer" to ringerState(am),
            "dnd" to dndState(nm),
        )
        AppLog.d("TtsManager", "deviceSilentState: $state")
        return state
    }

    /**
     * **媒体音量那一档** —— 「媒体音量为 0」**或**「媒体流被静音」。
     *
     * ⚠️ **两个条件都要查**（真机读数：MI MAX 2 / Android 7.1 的
     * `dumpsys audio` 逐字）—— `STREAM_MUSIC: Muted: false /
     * Current: 10`，而**别的流**出现 `Muted: true` 却 `Current: 10`
     * ⇒ ⇒ **「流被静音」与「音量为 0」是两件事**（滑块没动，流被 mute
     * 了）⇒ ⇒ 只查音量 ⇒ ⇒ 漏掉那一格 ⇒ ⇒ 那一格仍会白烧算力。
     * ⚠️ `isStreamMute` 是**公开 API**（android.jar 逐字命中：API 28／33／
     * 36 都有；它自 API 1 起就是公开的）。
     *
     * ⚠️ **固定音量设备**（车机 / kiosk 那种）⇒ ⇒ 音量旋钮不在系统手里
     * ⇒ ⇒ 「音量是不是 0」这件事**没有意义** ⇒ ⇒ 如实说「查不到」，别猜。
     */
    private fun volumeState(am: AudioManager?): String {
        if (am == null) return "unknown"
        return try {
            if (am.isVolumeFixed) {
                AppLog.d("TtsManager", "volumeState: volume is fixed on this device")
                return "unknown"
            }
            val muted = am.getStreamVolume(AudioManager.STREAM_MUSIC) == 0 ||
                am.isStreamMute(AudioManager.STREAM_MUSIC)
            if (muted) "muted" else "unmuted"
        } catch (e: Exception) {
            AppLog.e("TtsManager", "volumeState failed: $e")
            "unknown"
        }
    }

    /**
     * **响铃档那一档** —— 静音 / 振动 / 正常。
     *
     * ⚠️ **静音与振动都算「该安静」**（用户拍板：这两档都不触发 TTS）⇒ ⇒
     * 两档都回 `"muted"` ⇒ ⇒ 上层只需要一档判定，不必再细分。
     *
     * ⚠️ `getRingerMode()` 自 API 23 起公开 ⇒ ⇒ 本仓 minSdk=24 ⇒ ⇒ 不必
     * 做版本判断（做版本判断反而会在旧机上退化成「查不到」）。
     */
    private fun ringerState(am: AudioManager?): String {
        if (am == null) return "unknown"
        return try {
            when (am.ringerMode) {
                // ⚠️ **静音与振动回各自的档名**（不是都回 "muted"）⇒ ⇒
                // 真机 logcat 能逐档认出「这一格查到了什么」⇒ ⇒ 判据也能
                // 分别钉住静音档与振动档。
                AudioManager.RINGER_MODE_SILENT -> "silent"
                AudioManager.RINGER_MODE_VIBRATE -> "vibrate"
                AudioManager.RINGER_MODE_NORMAL -> "normal"
                else -> "unknown"
            }
        } catch (e: Exception) {
            AppLog.e("TtsManager", "ringerState failed: $e")
            "unknown"
        }
    }

    /**
     * **勿扰那一档** —— 开着没有。
     *
     * ⚠️ **`INTERRUPTION_FILTER_UNKNOWN` 必须当「查不到」**（真机读数：
     * MI MAX 2 的 `settings get global zen_mode` = 4）⇒ ⇒ 拿它当「勿扰开
     * 着」⇒ ⇒ 那台机器上**每一轮都被跳过**（用户永远听不到）⇒ ⇒ 那是「查
     * 不到长得像确定」。
     *
     * ⚠️ **「仅闹钟」档（PRIORITY）也算开着** ⇒ ⇒ 它同样是不许打扰的档。
     * ⚠️ `getCurrentInterruptionFilter()` 自 API 23 起公开 ⇒ ⇒ minSdk=24
     * ⇒ ⇒ 不必做版本判断。
     */
    private fun dndState(nm: NotificationManager?): String {
        if (nm == null) return "unknown"
        return try {
            when (nm.currentInterruptionFilter) {
                // ⚠️ **「开着」与「关着」分开回**（不是布尔）⇒ ⇒ 「查不到」
                // 有地方待 ⇒ ⇒ 真机 logcat 能看出这一格是**读到了**还是
                // **读不出来**。
                NotificationManager.INTERRUPTION_FILTER_ALL -> "off"
                NotificationManager.INTERRUPTION_FILTER_PRIORITY,
                NotificationManager.INTERRUPTION_FILTER_NONE -> "on"
                else -> "unknown"
            }
        } catch (e: Exception) {
            AppLog.e("TtsManager", "dndState failed: $e")
            "unknown"
        }
    }

    fun isInitialized(): Boolean = isInitialized
}
