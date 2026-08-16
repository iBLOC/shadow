package com.ibloc.shadow

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

/**
 * Prefrontal 嵌入式运行时
 *
 * 这个类封装了与 Rust Prefrontal 核心的所有交互:
 * 1. 通过 JNI 启动/停止运行时
 * 2. 通过 HTTP (localhost) 与 Prefrontal 通信
 *
 * 通信流程:
 * - Kotlin Service 启动 → 调用 nativeStart() 启动 .so → 启动 mini HTTP server
 * - Flutter 通过 MethodChannel 调用 Service
 * - Service 内部通过 HTTP 访问 Prefrontal
 * - Prefrontal 通过 JNI 返回结果
 *
 * 整个 Prefrontal 运行时嵌入在 App 进程内,
 * 生命周期与 App 绑定, 无需独立进程。
 */
class PrefrontalRuntime {

    companion object {
        private const val TAG = "PrefrontalRuntime"
        private const val LIBRARY_NAME = "prefrontal_core_lib"
        private const val REQUEST_TIMEOUT_MS = 30_000

        init {
            try {
                System.loadLibrary(LIBRARY_NAME)
                Log.d(TAG, "✅ Prefrontal .so loaded successfully")
            } catch (e: UnsatisfiedLinkError) {
                Log.e(TAG, "❌ Failed to load $LIBRARY_NAME.so: ${e.message}")
                throw e
            }
        }

        @Volatile
        private var instance: PrefrontalRuntime? = null

        @JvmStatic
        fun getInstance(): PrefrontalRuntime {
            return instance ?: synchronized(this) {
                instance ?: PrefrontalRuntime().also { instance = it }
            }
        }
    }

    // ==================== JNI 声明 ====================

    private external fun nativeStart(preferredPort: Int): Int
    private external fun nativeStop(): Int
    private external fun nativeGetPort(): Int
    private external fun nativeHealthCheck(): Int
    private external fun nativeRegisterAgent(
        agentId: String,
        name: String,
        description: String
    ): Int
    private external fun nativeInvokeAgent(
        agentId: String,
        input: String,
        output: ByteArray,
        outputLen: Int
    ): Int

    // ==================== 状态管理 ====================

    @Volatile
    private var currentPort: Int = 0

    @Volatile
    private var isRunning: Boolean = false

    fun getPort(): Int = currentPort

    fun isHealthy(): Boolean {
        return try {
            nativeHealthCheck() == 1
        } catch (e: Exception) {
            Log.w(TAG, "Health check failed: ${e.message}")
            false
        }
    }

    fun start(preferredPort: Int = 0): Boolean {
        return try {
            val port = nativeStart(preferredPort)
            if (port > 0) {
                currentPort = port
                isRunning = true
                Log.i(TAG, "✅ Prefrontal started on port $port")
                true
            } else {
                Log.e(TAG, "❌ Failed to start Prefrontal, returned port: $port")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Exception starting Prefrontal: ${e.message}", e)
            false
        }
    }

    fun stop(): Boolean {
        return try {
            val result = nativeStop()
            isRunning = false
            currentPort = 0
            Log.i(TAG, "Prefrontal stopped, result: $result")
            result == 0
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping Prefrontal: ${e.message}")
            false
        }
    }

    fun registerAgent(agentId: String, name: String, description: String): Boolean {
        return try {
            val result = nativeRegisterAgent(agentId, name, description)
            result == 0
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register agent: ${e.message}")
            false
        }
    }

    fun invokeAgent(agentId: String, input: String): String? {
        if (!isRunning || currentPort == 0) {
            Log.w(TAG, "Cannot invoke: runtime not running")
            return null
        }
        return try {
            val buffer = ByteArray(65536)
            val written = nativeInvokeAgent(agentId, input, buffer, buffer.size)
            if (written > 0) {
                String(buffer, 0, written, StandardCharsets.UTF_8)
            } else {
                Log.w(TAG, "Native invoke returned: $written")
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to invoke agent: ${e.message}")
            null
        }
    }

    // ==================== HTTP API 调用 ====================

    /**
     * 通过 localhost HTTP 与 Prefrontal 通信
     * 注意: HTTP 通信是同进程内的, 不是网络请求
     */
    suspend fun httpGet(path: String): String? = withContext(Dispatchers.IO) {
        val url = URL("http://127.0.0.1:$currentPort$path")
        val connection = url.openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "GET"
            connection.connectTimeout = REQUEST_TIMEOUT_MS
            connection.readTimeout = REQUEST_TIMEOUT_MS
            connection.setRequestProperty("Accept", "application/json")

            if (connection.responseCode == 200) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                Log.w(TAG, "HTTP GET $path returned ${connection.responseCode}")
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "HTTP GET $path failed: ${e.message}")
            null
        } finally {
            connection.disconnect()
        }
    }

    suspend fun httpPost(path: String, body: String): String? = withContext(Dispatchers.IO) {
        val url = URL("http://127.0.0.1:$currentPort$path")
        val connection = url.openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = REQUEST_TIMEOUT_MS
            connection.readTimeout = REQUEST_TIMEOUT_MS
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Accept", "application/json")

            connection.outputStream.use { os: OutputStream ->
                os.write(body.toByteArray(StandardCharsets.UTF_8))
                os.flush()
            }

            if (connection.responseCode in 200..300) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                Log.w(TAG, "HTTP POST $path returned ${connection.responseCode}")
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "HTTP POST $path failed: ${e.message}")
            null
        } finally {
            connection.disconnect()
        }
    }
}
