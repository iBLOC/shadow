package com.ibloc.shadow

import android.util.Log
import kotlinx.coroutines.*
import java.io.BufferedReader
import java.io.InputStreamReader
import java.text.SimpleDateFormat
import java.util.*
import java.util.regex.Pattern

class LogcatReader {
    companion object {
        private const val TAG = "ShadowLogcat"
        private val LOGCAT_PATTERN = Pattern.compile(
            "(\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}:\\d{2}\\.\\d{3})\\s+(\\d+)\\s+(\\d+)\\s+([DIWE])\\s+([\\w]+):\\s+(.*)"
        )
        private val TAGS = listOf("PrefrontalMNN", "OpenAIServer", "mnn_bridge", "ShadowMNN")
        private val DATE_FORMAT = SimpleDateFormat("yy-MM-dd HH:mm:ss.SSS", Locale.US)
    }

    private var readingJob: Job? = null
    private var onLogEntry: ((Map<String, Any>) -> Unit)? = null

    fun startReading(onLogEntry: (Map<String, Any>) -> Unit) {
        this.onLogEntry = onLogEntry
        readingJob = CoroutineScope(Dispatchers.IO).launch {
            readLogcat()
        }
    }

    fun stopReading() {
        readingJob?.cancel()
        readingJob = null
    }

    private suspend fun readLogcat() = withContext(Dispatchers.IO) {
        try {
            Runtime.getRuntime().exec("logcat -c").waitFor()
            delay(100)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to clear logcat", e)
        }

        val process = Runtime.getRuntime().exec("logcat -v threadtime")
        val reader = BufferedReader(InputStreamReader(process.inputStream))

        try {
            while (isActive) {
                val line = reader.readLine() ?: break
                parseLine(line)?.let { entry ->
                    withContext(Dispatchers.Main) {
                        onLogEntry?.invoke(entry)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error reading logcat", e)
        } finally {
            reader.close()
            process.destroy()
        }
    }

    private fun parseLine(line: String): Map<String, Any>? {
        val matcher = LOGCAT_PATTERN.matcher(line)
        if (!matcher.matches()) return null

        val dateStr = matcher.group(1) ?: return null
        val level = matcher.group(4) ?: return null
        val tag = matcher.group(5) ?: return null

        if (!TAGS.contains(tag)) return null

        return try {
            val date = DATE_FORMAT.parse(dateStr)
            val timestamp = Calendar.getInstance().apply {
                time = date ?: Date()
            }.timeInMillis

            mapOf(
                "timestamp" to timestamp,
                "level" to when (level) {
                    "D" -> "debug"
                    "I" -> "info"
                    "W" -> "warning"
                    "E" -> "error"
                    else -> "info"
                },
                "tag" to tag,
                "message" to (matcher.group(6) ?: "")
            )
        } catch (e: Exception) {
            null
        }
    }
}
