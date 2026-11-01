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
import kotlinx.coroutines.Dispatchers
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

            // Start recording loop in background
            launchRecordingLoop(minBufferSize)

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

        while (isRecording.get()) {
            val elapsed = System.currentTimeMillis() - recordingStartTime
            if (elapsed >= MAX_DURATION_MS) {
                AppLog.d(TAG, "Max duration reached ($MAX_DURATION_MS ms)")
                break
            }

            val bytesRead = audioRecord?.read(buffer, 0, buffer.size) ?: 0
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

        try {
            audioRecord?.stop()
        } catch (e: Exception) {
            AppLog.e(TAG, "Error stopping recorder", e)
        }

        audioRecord?.release()
        audioRecord = null

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