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
import android.util.Log
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val TAG = "PcmAudioRecorder"

// Same constants as Gallery app
const val SAMPLE_RATE = 16000
private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
private const val MAX_DURATION_MS = 30000L // 30 seconds max

class PcmAudioRecorder(private val context: Context) {
    private var audioRecord: AudioRecord? = null
    private val isRecording = AtomicBoolean(false)
    private val audioStream = ByteArrayOutputStream()
    private var recordingStartTime: Long = 0

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
            Log.w(TAG, "Already recording")
            return@withContext false
        }

        val minBufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
        if (minBufferSize == AudioRecord.ERROR || minBufferSize == AudioRecord.ERROR_BAD_VALUE) {
            Log.e(TAG, "Invalid buffer size: $minBufferSize")
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
                Log.e(TAG, "AudioRecord failed to initialize")
                audioRecord?.release()
                audioRecord = null
                return@withContext false
            }

            audioStream.reset()
            audioRecord?.startRecording()
            isRecording.set(true)
            recordingStartTime = System.currentTimeMillis()

            Log.d(TAG, "Recording started")

            // Start recording loop in background
            launchRecordingLoop(minBufferSize)

            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start recording", e)
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
                Log.d(TAG, "Max duration reached ($MAX_DURATION_MS ms)")
                break
            }

            val bytesRead = audioRecord?.read(buffer, 0, buffer.size) ?: 0
            if (bytesRead > 0) {
                audioStream.write(buffer, 0, bytesRead)
            }
        }
    }

    /**
     * Stop recording and return the PCM audio data
     * @return ByteArray of 16-bit PCM audio data, or null if not recording
     */
    fun stopRecording(): ByteArray? {
        if (!isRecording.getAndSet(false)) {
            Log.w(TAG, "Not recording")
            return null
        }

        try {
            audioRecord?.stop()
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping recorder", e)
        }

        audioRecord?.release()
        audioRecord = null

        val recordedBytes = audioStream.toByteArray()
        Log.d(TAG, "Recording stopped. Recorded ${recordedBytes.size} bytes (${recordedBytes.size / 2} samples)")

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

        Log.d(TAG, "Recording cancelled")
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

    /**
     * Check if currently recording
     */
    fun isRecording(): Boolean = isRecording.get()

    /**
     * Release resources
     */
    fun release() {
        cancelRecording()
    }
}