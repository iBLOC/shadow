package com.ibloc.shadow

import android.util.Log

/**
 * Encephalon（大脑）嵌入式运行时
 *
 * 与桌面端 `shadow-desktop/src-tauri/src/lib.rs` 的
 * `encephalon::Embedded::boot(EmbeddedConfig { neuron_port: 8085 })` **同源**：
 * 同一套 `Embedded`（thalamus + ACP 总线 + telencephalon + 单一 neuron），
 * 只是跑在 Android App 进程里，而不是跑成外部进程。
 *
 * 与 `PrefrontalRuntime` 的关键差别：**推理不走 HTTP**。
 * `nativeInfer` 把 OpenAI 兼容请求体直接送进 neuron 的进程内 adapter 管线，
 * 返回 4 字节大端 HTTP 状态码 + 响应体 —— 没有 socket、没有 CORS、
 * 不用等本地端口就绪。neuron 自己仍然会起一个 127.0.0.1 的 HTTP 面
 * （OpenAI 兼容），那是给同进程的其它组件用的。
 *
 * 通信架构：
 * ```
 *   Flutter UI
 *     ↓ MethodChannel (com.ibloc.shadow/encephalon_runtime)
 *   MainActivity (Kotlin)
 *     ↓ JNI (nativeStart / nativeInfer / ...)
 *   libencephalon.so (Rust, cdylib)
 *     ↓ 进程内调用，不绕 socket
 *   Embedded → thalamus + ACP 总线 + telencephalon + 单一 neuron
 * ```
 *
 * 错误处理策略与 `PrefrontalRuntime` 一致：`.so` 缺失时**不重抛**，
 * 让每个调用点自己降级，而不是让 App 直接崩。
 */
class EncephalonRuntime {

    companion object {
        private const val TAG = "EncephalonRuntime"

        /** crate 的 lib name 是 `encephalon` → Android 上是 libencephalon.so。 */
        private const val LIBRARY_NAME = "encephalon"

        /** infer 的初始缓冲区。响应更大时按 native 返回的需求值重试。 */
        private const val DEFAULT_BUFFER_BYTES = 64 * 1024

        /** 缓冲区重试上限。 */
        private const val MAX_INFER_ATTEMPTS = 3

        init {
            try {
                System.loadLibrary(LIBRARY_NAME)
                Log.d(TAG, "✅ Encephalon .so loaded successfully")
            } catch (e: UnsatisfiedLinkError) {
                // 这里不重抛。重抛会让类初始化失败，之后每次访问都变成
                // NoClassDefFoundError —— 而调用方接的是 UnsatisfiedLinkError，
                // 接不住 NoClassDefFoundError，App 会直接崩。
                // 不重抛的话，.so 缺失会以 UnsatisfiedLinkError 的形式
                // 从下面的 native 调用点冒出来，正好落进调用方的错误处理：
                // 优雅降级，而不是崩溃。
                Log.e(TAG, "❌ Failed to load $LIBRARY_NAME.so: ${e.message}")
            }
        }

        @Volatile
        private var instance: EncephalonRuntime? = null

        @JvmStatic
        fun getInstance(): EncephalonRuntime {
            return instance ?: synchronized(this) {
                instance ?: EncephalonRuntime().also { instance = it }
            }
        }
    }

    // ==================== JNI 声明 ====================

    private external fun nativeStart(preferredPort: Int, dataDir: String): Int
    private external fun nativeStop(): Int
    private external fun nativeGetPort(): Int
    private external fun nativeGetAgentPort(): Int
    private external fun nativeHealthCheck(): Int
    private external fun nativeSetLlmProvider(
        baseUrl: String,
        apiKey: String,
        model: String,
    ): Int
    private external fun nativeInfer(
        path: String,
        body: ByteArray,
        output: ByteArray,
        outputLen: Int,
    ): Int

    // ==================== 状态管理 ====================

    @Volatile
    private var currentPort: Int = 0

    @Volatile
    private var currentAgentPort: Int = 0

    @Volatile
    private var isRunning: Boolean = false

    /** neuron 的 HTTP 面端口（OpenAI 兼容面）。 */
    fun getPort(): Int = currentPort

    /**
     * 端脑 HTTP 面端口（shadow API + A2A gateway + agent 管理）。
     *
     * 移动端不再依赖外部 telencephalon 进程 —— 同一套端脑就跑在 App
     * 进程里，这个端口就是它。
     *
     * 0 = 端脑面没起来（但大脑本体在跑，neuron 面照常用）；
     * -2 = 大脑整个没在跑。
     */
    fun getAgentPort(): Int = currentAgentPort

    /** 运行时是否已启动。 */
    fun isRunning(): Boolean = isRunning

    /** 健康检查：在跑返回 true。 */
    fun isHealthy(): Boolean {
        return try {
            nativeHealthCheck() == 1
        } catch (e: UnsatisfiedLinkError) {
            Log.w(TAG, "Encephalon .so not loaded: ${e.message}")
            false
        } catch (e: Exception) {
            Log.w(TAG, "Health check failed: ${e.message}")
            false
        }
    }

    /**
     * 设置 LLM 上游（OpenAI 兼容）。**必须在 [start] 之前调用。**
     *
     * 为什么要有这条通道：neuron 的 remote 引擎只认环境变量，而 Android
     * App 进程的环境变量由 zygote 决定、宿主注入不了 —— 于是「手机上跑
     * 一个云端模型」只能走程序化注册。注册进去之后，叶区会改用这个模型
     * id 去请求 neuron 的 OpenAI 面。
     *
     * @param baseUrl OpenAI 兼容的 base URL，**要含 `/v1`**。
     * @param apiKey bearer token；空串 = 不带 Authorization 头。
     * @param model 上游的模型 id，也是叶区请求时用的模型名。
     *
     * 三个参数都传空串 = 清空配置，回到「只用本地权重」。
     */
    fun setLlmProvider(baseUrl: String, apiKey: String, model: String): Boolean {
        return try {
            val rc = nativeSetLlmProvider(baseUrl, apiKey, model)
            if (rc >= 0) {
                Log.i(TAG, "✅ LLM provider set: $baseUrl model=$model")
                true
            } else {
                Log.e(TAG, "❌ nativeSetLlmProvider returned: $rc")
                false
            }
        } catch (e: UnsatisfiedLinkError) {
            Log.w(TAG, "Encephalon .so not loaded: ${e.message}")
            false
        } catch (e: Exception) {
            Log.e(TAG, "setLlmProvider failed: ${e.message}", e)
            false
        }
    }

    /**
     * 启动嵌入式大脑。
     *
     * @param preferredPort neuron HTTP 面的期望端口；0 = 随机。
     * @param dataDir App 的私有目录（Android 上是 `context.filesDir`）。
     *   端脑的 flow（工作流）存储要写在那里 —— Android 没有 `$HOME`，
     *   进程工作目录是 `/`（不可写），不给目录 flow 就写不进去。
     *   传 null 用默认位置。
     */
    fun start(preferredPort: Int = 0, dataDir: String? = null): Boolean {
        return try {
            val port = nativeStart(preferredPort, dataDir ?: "")
            if (port > 0) {
                currentPort = port
                isRunning = true
                // 端脑 HTTP 面（shadow API / A2A / agent 管理）的端口。
                // 0 = 这条面没起来 —— 但大脑本体在跑，neuron 面照常用。
                currentAgentPort = try {
                    nativeGetAgentPort()
                } catch (e: UnsatisfiedLinkError) {
                    0
                }
                Log.i(
                    TAG,
                    "✅ Encephalon started on port $port " +
                        "(agent surface: ${if (currentAgentPort > 0) currentAgentPort else "unavailable"})"
                )
                true
            } else {
                Log.e(TAG, "❌ Failed to start Encephalon, returned: $port")
                false
            }
        } catch (e: UnsatisfiedLinkError) {
            Log.e(TAG, "❌ Encephalon .so not loaded: ${e.message}")
            false
        } catch (e: Exception) {
            Log.e(TAG, "❌ Exception starting Encephalon: ${e.message}", e)
            false
        }
    }

    /** 停止嵌入式大脑。 */
    fun stop(): Boolean {
        return try {
            val result = nativeStop()
            isRunning = false
            currentPort = 0
            currentAgentPort = 0
            Log.i(TAG, "Encephalon stopped, result: $result")
            result == 0
        } catch (e: UnsatisfiedLinkError) {
            Log.w(TAG, "Encephalon .so not loaded: ${e.message}")
            false
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping Encephalon: ${e.message}")
            false
        }
    }

    /**
     * 进程内推理。
     *
     * @param path OpenAI 兼容路径，例如 `/v1/chat/completions`。
     * @param body 请求体原始字节（JSON）。
     * @return (status, body)；失败返回 null。
     *
     * `nativeInfer` 的返回值语义（Rust 侧约定，见 `src/mobile/mod.rs`）：
     * - `0 < n <= 缓冲区容量`：写入了 n 字节
     * - `n > 缓冲区容量`：缓冲区不够，n 是**需要的**总字节数 —— 按它重试即可
     * - `n < 0`：错误码
     */
    fun infer(path: String, body: ByteArray): InferenceResult? {
        var capacity = DEFAULT_BUFFER_BYTES
        repeat(MAX_INFER_ATTEMPTS) {
            val output = ByteArray(capacity)
            val written = try {
                nativeInfer(path, body, output, output.size)
            } catch (e: UnsatisfiedLinkError) {
                Log.e(TAG, "Encephalon .so not loaded: ${e.message}")
                return null
            } catch (e: Exception) {
                Log.e(TAG, "infer failed: ${e.message}", e)
                return null
            }

            if (written < 0) {
                Log.e(TAG, "infer returned error code: $written")
                return null
            }
            if (written > output.size) {
                // 缓冲区不够 —— native 回了需要的大小，按它扩一次再来。
                capacity = written
                return@repeat
            }
            if (written < 4) {
                Log.e(TAG, "infer wrote $written bytes, expected >= 4 (status prefix)")
                return null
            }

            val status = ((output[0].toInt() and 0xFF) shl 24) or
                ((output[1].toInt() and 0xFF) shl 16) or
                ((output[2].toInt() and 0xFF) shl 8) or
                (output[3].toInt() and 0xFF)
            val payload = output.copyOfRange(4, written)
            return InferenceResult(status, payload)
        }
        Log.e(TAG, "infer: buffer still too small after $MAX_INFER_ATTEMPTS attempts")
        return null
    }

    /**
     * 推理结果：HTTP 状态码 + 原始响应体。
     */
    data class InferenceResult(val status: Int, val body: ByteArray)
}
