/*
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package com.ibloc.shadow.pcm

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.ibloc.shadow.AppLog
import io.flutter.plugin.common.EventChannel
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val TAG = "PcmAudioRecorder"

const val SAMPLE_RATE = 16000
private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
private const val MAX_DURATION_MS = 30000L

class PcmAudioRecorder(private val context: Context) {
    private var audioRecord: AudioRecord? = null
    private val isRecording = AtomicBoolean(false)
    private val audioStream = ByteArrayOutputStream()
    private var recordingStartTime: Long = 0
    private var audioEventSink: EventChannel.EventSink? = null
    private val streamChunkSize = 4096

    /** 录制循环**自己跑**用的作用域（见 [launchRecordingLoop]）。 */
    private val recordingScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    /**
     * Check if audio recording permission is granted
     */
    fun hasPermission(): Boolean {
        return context.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED
    }

    /**
     * Start recording PCM audio
     * @return true if recording started successfully
     */
    @SuppressLint("MissingPermission")
    suspend fun startRecording(): Boolean = withContext(Dispatchers.IO) {
        if (isRecording.get()) {
            AppLog.w(TAG, "Already recording")
            return@withContext false
        }

        val minBufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
        if (minBufferSize == AudioRecord.ERROR || minBufferSize == AudioRecord.ERROR_BAD_VALUE) {
            AppLog.e(TAG, "Invalid buffer size: $minBufferSize")
            return@withContext false
        }

        try {
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                minBufferSize * 2
            )

            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                AppLog.e(TAG, "AudioRecord failed to initialize")
                audioRecord?.release()
                audioRecord = null
                return@withContext false
            }

            audioStream.reset()
            audioRecord?.startRecording()
            isRecording.set(true)
            recordingStartTime = System.currentTimeMillis()

            AppLog.d(TAG, "Recording started")

            // ⚠️⚠️ **录制循环必须自己跑（不许 await）** ——
            //
            // ⚠️ 以前这里是 `launchRecordingLoop(minBufferSize)` **直接 await**：
            // 那个函数是 `suspend` ＋ `while (isRecording.get())` ⇒ ⇒ 它**一直
            // 挂到录音结束**（30 秒上限）才返回 ⇒ ⇒ 于是 `startRecording()` 这个
            // 「**开始**」调用要 30 秒才回话 ⇒ ⇒ Dart 那边 `await` 30 秒才拿到
            // 「开始录上了」⇒ ⇒ `isRecordingAudio` 一直是假 ⇒ ⇒ **松手时那个
            // `if (isRecording)` 判假 ⇒ ⇒ 停录/转写那条路整个死锁**。
            //
            // ⇒ ⇒ 真机读数（2026-11-15）：`Recording started` 23:22:41 ⇒ ⇒
            //     `Max duration reached` 23:23:11 ⇒ ⇒ 界面到 23:25:33 才翻成
            //     「录音中…」—— **晚了整整 30 秒**。
            recordingScope.launch { launchRecordingLoop(minBufferSize) }
            AppLog.d(TAG, "Recording loop detached (start returns immediately)")

            true
        } catch (e: Exception) {
            AppLog.e(TAG, "Failed to start recording", e)
            audioRecord?.release()
            audioRecord = null
            false
        }
    }

    private suspend fun launchRecordingLoop(minBufferSize: Int) = withContext(Dispatchers.IO) {
        val buffer = ByteArray(minBufferSize)

        try {
            while (isRecording.get()) {
                val elapsed = System.currentTimeMillis() - recordingStartTime
                if (elapsed >= MAX_DURATION_MS) {
                    AppLog.d(TAG, "Max duration reached ($MAX_DURATION_MS ms)")
                    // ⚠️ 到上限就把麦克风**关上**（不许一直占着）⇒ ⇒ 但
                    // `isRecording` 仍为真 ⇒ ⇒ 用户松手时 `stopRecording()` 照样
                    // 能把这 30 秒的字节取走（不丢音频）。
                    releaseRecorder()
                    break
                }

                // ⚠️ `stopRecording()` 会先 `stop()` 录音器 ⇒ ⇒ 阻塞中的 `read`
                // 抛异常是**正常收尾**、不是故障 ⇒ ⇒ 记一笔就收工（不许炸）。
                val bytesRead = try {
                    audioRecord?.read(buffer, 0, buffer.size) ?: 0
                } catch (e: Exception) {
                    AppLog.d(TAG, "Recording loop closed: $e")
                    break
                }
                if (bytesRead > 0) {
                    audioStream.write(buffer, 0, bytesRead)
                    if (audioEventSink != null && bytesRead >= streamChunkSize) {
                        val chunk = buffer.copyOf(bytesRead)
                        Handler(Looper.getMainLooper()).post {
                            audioEventSink?.success(chunk)
                        }
                    }
                }
            }
        } catch (e: Exception) {
            // ⚠️ 这个循环现在**自己跑**（不再被 `startRecording` await）⇒ ⇒
            // 这里的异常**没有调用方接着** ⇒ ⇒ 必须自己兜住（否则整个 App 崩）。
            AppLog.e(TAG, "Recording loop crashed", e)
        }
    }

    /** 关掉并释放录音器（**麦克风不许一直被占着**）。 */
    private fun releaseRecorder() {
        try {
            audioRecord?.stop()
        } catch (e: Exception) {
            AppLog.e(TAG, "Error stopping recorder", e)
        }
        audioRecord?.release()
        audioRecord = null
    }

    /**
     * Stop recording and return the PCM audio data
     * @return ByteArray of 16-bit PCM audio data, or null if not recording
     */
    fun stopRecording(): ByteArray? {
        if (!isRecording.getAndSet(false)) {
            AppLog.w(TAG, "Not recording")
            return null
        }

        releaseRecorder()

        val recordedBytes = audioStream.toByteArray()
        AppLog.d(TAG, "Recording stopped. Recorded ${recordedBytes.size} bytes (${recordedBytes.size / 2} samples)")

        return recordedBytes
    }

    /**
     * Cancel recording and discard audio data
     */
    fun cancelRecording() {
        if (!isRecording.getAndSet(false)) {
            return
        }

        try {
            audioRecord?.stop()
        } catch (_: Exception) {}

        audioRecord?.release()
        audioRecord = null
        audioStream.reset()

        AppLog.d(TAG, "Recording cancelled")
    }

    /**
     * Get current recording amplitude (for UI visualization)
     * @return amplitude value 0-32767
     */
    fun getAmplitude(): Int {
        // This would need to read from the buffer, simplified for now
        return 0
    }

    /**
     * Get elapsed recording time in milliseconds
     */
    fun getElapsedTimeMs(): Long {
        return if (isRecording.get()) {
            System.currentTimeMillis() - recordingStartTime
        } else {
            0
        }
    }

    fun setEventSink(eventSink: EventChannel.EventSink?) {
        audioEventSink = eventSink
    }

    fun isRecording(): Boolean = isRecording.get()

    fun release() {
        cancelRecording()
        audioEventSink = null
    }
}