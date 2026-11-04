package com.ibloc.shadow

import android.util.Log

/**
 * Encephalon（大脑）嵌入式运行时
 *
 * 与桌面端 `shadow-desktop/src-tauri/src/lib.rs` 的
 * `encephalon::Embedded::boot(EmbeddedConfig { llm_provider: None })` **同源**：
 * 同一套 `Embedded`（thalamus + ACP 总线 + telencephalon + 单一 neuron），
 * 只是跑在 Android App 进程里，而不是跑成外部进程。
 *
 * **推理不走 HTTP** —— 这是它与更早那套内嵌运行时最大的差别。
 * `nativeInfer` 把 OpenAI 兼容请求体直接送进 neuron 的进程内 adapter 管线，
 * 返回 4 字节大端 HTTP 状态码 + 响应体 —— 没有 socket、没有 CORS、
 * 不用等本地端口就绪。neuron 现在是 **router-only**（自己不监听），
 * 它的 OpenAI 兼容面由**统一入口**挂在脑面上（移动端 = agentPort 那个口）。
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
 * 错误处理策略与另一套内嵌运行时一致：`.so` 缺失时**不重抛**，
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
                AppLog.d(TAG, "✅ Encephalon .so loaded successfully")
            } catch (e: UnsatisfiedLinkError) {
                // 这里不重抛。重抛会让类初始化失败，之后每次访问都变成
                // NoClassDefFoundError —— 而调用方接的是 UnsatisfiedLinkError，
                // 接不住 NoClassDefFoundError，App 会直接崩。
                // 不重抛的话，.so 缺失会以 UnsatisfiedLinkError 的形式
                // 从下面的 native 调用点冒出来，正好落进调用方的错误处理：
                // 优雅降级，而不是崩溃。
                AppLog.e(TAG, "❌ Failed to load $LIBRARY_NAME.so: ${e.message}")
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
    private external fun nativeSetModelRouting(json: String): Int
    private external fun nativeSetShadowApiKey(key: String): Int
    private external fun nativeSetAdminToken(token: String): Int
    private external fun nativeSetZitiClient(
        identityPath: String,
        service: String,
        shadowKey: String,
        adminToken: String,
    ): Int
    private external fun nativeSetHippocampusBaseUrl(baseUrl: String): Int
    private external fun nativeSetZitiServer(
        identityPath: String,
        service: String,
    ): Int
    private external fun nativeInfer(
        path: String,
        body: ByteArray,
        output: ByteArray,
        outputLen: Int,
    ): Int
    private external fun nativeExportAccount(
        dataDir: String,
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
            AppLog.w(TAG, "Encephalon native method missing — .so not loaded, or an old .so without this method: ${e.message}")
            false
        } catch (e: Exception) {
            AppLog.w(TAG, "Health check failed: ${e.message}")
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
                AppLog.i(TAG, "✅ LLM provider set: $baseUrl model=$model")
                true
            } else {
                AppLog.e(TAG, "❌ nativeSetLlmProvider returned: $rc")
                false
            }
        } catch (e: UnsatisfiedLinkError) {
            AppLog.w(TAG, "Encephalon native method missing — .so not loaded, or an old .so without this method: ${e.message}")
            false
        } catch (e: Exception) {
            AppLog.e(TAG, "setLlmProvider failed: ${e.message}", e)
            false
        }
    }

    /**
     * 设置 **shadow key**（端脑面那道门的钥匙）。**必须在 [start] 之前调用。**
     *
     * ## 它解决的是什么
     *
     * Android 进程**设不了环境变量**（由 zygote 决定）⇒ 手机上的端脑**没有
     * 配置文件** ⇒ `telencephalon.shadow.api_key` 取默认 `""` ⇒
     * 整张 `/shadow/v1/` 面 **全部放行** ⇒ 同一台设备上**任何别的 App** 都能打它，
     * 包括 `POST /shadow/v1/identity`（导入账号 ⇒ **换掉「这台机器是谁」**）。
     *
     * 给了这把钥匙，端脑面就要求每个请求带 `X-Shadow-Key` ⇒ 别的 App
     * 打不动它。
     *
     * ## 为什么是「单独一个入口」而不是 `start` 的参数
     *
     * JNI 的 `nativeStart` 签名已经被 Kotlin 侧固定住了
     * （`nativeStart(preferredPort, dataDir)`），再加参数要动 ABI ⇒ 走
     * **纯增量**的入口：老版本 Kotlin 调不到就调不到，行为不变（没有 key
     * ⇒ 端脑面敞开，和今天一模一样）。
     *
     * ⚠️ **绝不把 key 打进日志** —— 它是门闩。
     */
    fun setShadowApiKey(key: String): Boolean {
        return try {
            val rc = nativeSetShadowApiKey(key)
            if (rc >= 0) {
                // ⚠️ 只说「设好了」，不说是什么。
                AppLog.i(TAG, "✅ shadow key set (端脑面将要求 X-Shadow-Key)")
                true
            } else {
                AppLog.e(TAG, "❌ nativeSetShadowApiKey returned: $rc")
                false
            }
        } catch (e: UnsatisfiedLinkError) {
            AppLog.w(TAG, "Encephalon native method missing — .so not loaded, or an old .so without this method: ${e.message}")
            false
        } catch (e: Exception) {
            AppLog.e(TAG, "setShadowApiKey failed: ${e.message}", e)
            false
        }
    }

    /**
     * 设置 admin token —— 「**谁能改这台大脑的配置**」的凭据。
     *
     * ## 为什么需要它
     *
     * Android 进程**设不了环境变量** ⇒ 手机上的端脑**没有配置文件** ⇒ 它的
     * admin token 取默认 `""` ⇒ 而端脑的 `verify_admin_token` 在 expected 为
     * **空串**时，只要求「请求里带 `X-Admin-Token` 这个头」⇒ **空值**的头与
     * 空串 `ct_eq` 相等 ⇒ **过** ⇒ ⚠️ **2026-10-31 真机证实过**：空的
     * `X-Admin-Token` 头 ⇒ **200** ⇒ 同设备任何别的 App 都能装 agent、
     * **改 LLM 上游**、动 MCP。
     *
     * 给了这把 token，admin 面就只认它。
     *
     * ## 为什么是「单独一个入口」而不是 `start` 的参数
     *
     * 和 shadow key 一样：**不动 `nativeStart` 的 ABI** ⇒ 走**纯增量**的
     * 入口：老版本 Kotlin 调不到就调不到，行为不变（没有 token ⇒ 端脑回落到
     * 环境变量/配置文件；都没有 ⇒ **admin 面关着**，不是敞开）。
     *
     * ⚠️ **它与 shadow key 是两把不同的钥匙** —— 一个是门闩，一个是凭据。
     *
     * ⚠️ **绝不把 token 打进日志**。
     */
    /**
     * 让这台手机变成**零信任客户端** —— 它**不跑自己的大脑**，而是经零信任网
     * 访问**别的**设备上的大脑。
     *
     * ## 它换掉了什么
     *
     * 本地起的不再是「端脑那张面」，而是**零信任本地代理** ⇒ ⇒ 报给 Dart 的
     * `agentPort` **就是代理的端口** ⇒ ⇒ **Dart 侧零改动**（它照旧打
     * `http://127.0.0.1:<agentPort>`）。
     *
     * ## ⚠️ 必须在 [start] **之前**调
     *
     * 跟 shadow key / admin token 一样 —— 这是**纯增量**的入口：老版本宿主
     * 调不到就调不到，行为不变（没设 ⇒ 手机照旧跑自己的大脑）。
     *
     * ## ⚠️ 为什么还要带门型凭据
     *
     * Rust ziti SDK **不暴露对端身份** ⇒ ⇒ 「进了网络」**不能**替代应用层
     * 凭据 ⇒ ⇒ 授权仍然留在 HTTP 层 ⇒ ⇒ `shadowKey` / `adminToken` 是
     * **远端**大脑那把钥匙。
     *
     * ⚠️ **绝不把 key / token 打进日志**。
     */
    fun setZitiClient(
        identityPath: String,
        service: String = "",
        shadowKey: String = "",
        adminToken: String = "",
    ): Boolean {
        return try {
            val rc = nativeSetZitiClient(identityPath, service, shadowKey, adminToken)
            if (rc >= 0) {
                // ⚠️ 只说「设好了」，不说是什么（路径与钥匙都是秘密）。
                AppLog.i(TAG, "✅ zero-trust client configured (手机将经零信任网访问远端大脑)")
                true
            } else {
                AppLog.e(TAG, "❌ nativeSetZitiClient returned: $rc")
                false
            }
        } catch (e: UnsatisfiedLinkError) {
            AppLog.w(TAG, "Encephalon native method missing — .so not loaded, or an old .so without this method: ${e.message}")
            false
        } catch (e: Exception) {
            AppLog.e(TAG, "❌ nativeSetZitiClient failed: ${e.message}")
            false
        }
    }

    /**
     * 指定海马体在哪儿 —— **远端海马体**。
     *
     * ## 它换掉了什么
     *
     * 备用机上**不跑**海马体 ⇒ ⇒ 它的记忆读写要走到主力机那**一个** ⇒ ⇒
     * 这里给一个地址即可（空的 ⇒ ⇒ 回到默认那条路）。
     *
     * ## ⚠️ 地址可以带**零信任代理前缀**
     *
     * `http://127.0.0.1:<代理口>/_zt/<service>/hippocampus`
     * ⇒ ⇒ 代理按服务名路由并**去掉前缀** ⇒ ⇒ 上游收到 `/hippocampus/api/...`。
     *
     * ## ⚠️ 必须在 [start] **之前**调
     *
     * ⚠️ 地址**不是秘密**（凭据才是）⇒ ⇒ 但仍不打进日志 —— 少一处日志就少一处
     * 泄漏面。
     */
    fun setHippocampusBaseUrl(baseUrl: String): Boolean {
        return try {
            val rc = nativeSetHippocampusBaseUrl(baseUrl)
            if (rc >= 0) {
                AppLog.i(TAG, "✅ hippocampus target set (记忆将走远端海马体)")
                true
            } else {
                AppLog.e(TAG, "❌ nativeSetHippocampusBaseUrl returned: $rc")
                false
            }
        } catch (e: UnsatisfiedLinkError) {
            AppLog.w(TAG, "Encephalon native method missing — .so not loaded, or an old .so without this method: ${e.message}")
            false
        } catch (e: Exception) {
            AppLog.e(TAG, "❌ nativeSetHippocampusBaseUrl failed: ${e.message}")
            false
        }
    }

    /**
     * 让这台手机**发布**自己的大脑 —— 别的设备（PC）可以反过来用它的脑子。
     *
     * ## 它换掉了什么
     *
     * 本地回环面**照旧起**（手机自己要用）⇒ ⇒ 发布**不是**替换本地面，
     * 是**多开一张零信任面** ⇒ ⇒ 走**唯一**那处 serve ⇒ ⇒ 「不支持 ⇒ 明确
     * 501」那层闸在手机上**也在**。
     *
     * ## ⚠️ 必须在 [start] **之前**调
     *
     * ⚠️ `identityPath` 指向 App 私有目录里的 ziti 身份文件（enrollment 的产物）
     * ⇒ ⇒ **没有身份文件就发布不了**。
     *
     * ⚠️ **身份路径是秘密** ⇒ ⇒ 绝不打进日志。
     */
    fun setZitiServer(
        identityPath: String,
        service: String = "",
    ): Boolean {
        return try {
            val rc = nativeSetZitiServer(identityPath, service)
            if (rc >= 0) {
                // ⚠️ 只说「设好了」，不说是什么（身份路径是秘密）。
                AppLog.i(TAG, "✅ zero-trust server configured (这台手机将向零信任网发布大脑)")
                true
            } else {
                AppLog.e(TAG, "❌ nativeSetZitiServer returned: $rc")
                false
            }
        } catch (e: UnsatisfiedLinkError) {
            AppLog.w(TAG, "Encephalon native method missing — .so not loaded, or an old .so without this method: ${e.message}")
            false
        } catch (e: Exception) {
            AppLog.e(TAG, "❌ nativeSetZitiServer failed: ${e.message}")
            false
        }
    }

    fun setAdminToken(token: String): Boolean {
        return try {
            val rc = nativeSetAdminToken(token)
            if (rc >= 0) {
                // ⚠️ 只说「设好了」，不说是什么。
                AppLog.i(TAG, "✅ admin token set (admin 面将要求 X-Admin-Token)")
                true
            } else {
                AppLog.e(TAG, "❌ nativeSetAdminToken returned: $rc")
                false
            }
        } catch (e: UnsatisfiedLinkError) {
            AppLog.w(TAG, "Encephalon native method missing — .so not loaded, or an old .so without this method: ${e.message}")
            false
        } catch (e: Exception) {
            AppLog.e(TAG, "setAdminToken failed: ${e.message}", e)
            false
        }
    }

    /**
     * 设置**模型路由**（全局默认 + 每叶区覆盖）。**必须在 [start] 之前调用。**
     *
     * 模型使用的最小单位是**叶区**：全局默认决定「默认各叶区都走本地 /
     * 都走云端」，per-lobe 覆盖决定「某一个叶区单独换一边」（比如前额叶
     * 本地、实际执行任务的区域云端）。
     *
     * 一次调用下发**整份**路由 —— 「全局默认」与「per-lobe 覆盖」必须
     * 一起生效，拆成多次调用就得让每次调用自己算优先级。
     *
     * @param json 路由 JSON：
     * ```json
     * {
     *   "providers": [{"base_url": "https://.../v1", "api_key": "sk-...", "model": "MiniMax-M3"}],
     *   "default_model": "MiniMax-M3",
     *   "lobe_models": {"prefrontal": null, "temporal": "MiniMax-M3"}
     * }
     * ```
     * - `providers` —— 要注册进 neuron 派发表的全部远端引擎；
     * - `default_model` —— 全局默认模型 id（`null` = 本地）；
     * - `lobe_models` —— per-lobe 覆盖（`null` = 该叶区强制本地；
     *   **不在表里** = 跟随全局默认）。
     *
     * 空串 = 清空路由（回到「只用本地权重」）。
     */
    fun setModelRouting(json: String): Boolean {
        return try {
            val rc = nativeSetModelRouting(json)
            if (rc >= 0) {
                AppLog.i(TAG, "✅ model routing set (${json.length} bytes)")
                true
            } else {
                AppLog.e(TAG, "❌ nativeSetModelRouting returned: $rc")
                false
            }
        } catch (e: UnsatisfiedLinkError) {
            AppLog.w(TAG, "Encephalon native method missing — .so not loaded, or an old .so without this method: ${e.message}")
            false
        } catch (e: Exception) {
            AppLog.e(TAG, "setModelRouting failed: ${e.message}", e)
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
                AppLog.i(
                    TAG,
                    "✅ Encephalon started on port $port " +
                        "(agent surface: ${if (currentAgentPort > 0) currentAgentPort else "unavailable"})"
                )
                true
            } else {
                AppLog.e(TAG, "❌ Failed to start Encephalon, returned: $port")
                false
            }
        } catch (e: UnsatisfiedLinkError) {
            AppLog.e(TAG, "❌ Encephalon native method missing — .so not loaded, or an old .so without this method: ${e.message}")
            false
        } catch (e: Exception) {
            AppLog.e(TAG, "❌ Exception starting Encephalon: ${e.message}", e)
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
            AppLog.i(TAG, "Encephalon stopped, result: $result")
            result == 0
        } catch (e: UnsatisfiedLinkError) {
            AppLog.w(TAG, "Encephalon native method missing — .so not loaded, or an old .so without this method: ${e.message}")
            false
        } catch (e: Exception) {
            AppLog.w(TAG, "Error stopping Encephalon: ${e.message}")
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
                AppLog.e(TAG, "Encephalon native method missing — .so not loaded, or an old .so without this method: ${e.message}")
                return null
            } catch (e: Exception) {
                AppLog.e(TAG, "infer failed: ${e.message}", e)
                return null
            }

            if (written < 0) {
                AppLog.e(TAG, "infer returned error code: $written")
                return null
            }
            if (written > output.size) {
                // 缓冲区不够 —— native 回了需要的大小，按它扩一次再来。
                capacity = written
                return@repeat
            }
            if (written < 4) {
                AppLog.e(TAG, "infer wrote $written bytes, expected >= 4 (status prefix)")
                return null
            }

            val status = ((output[0].toInt() and 0xFF) shl 24) or
                ((output[1].toInt() and 0xFF) shl 16) or
                ((output[2].toInt() and 0xFF) shl 8) or
                (output[3].toInt() and 0xFF)
            val payload = output.copyOfRange(4, written)
            return InferenceResult(status, payload)
        }
        AppLog.e(TAG, "infer: buffer still too small after $MAX_INFER_ATTEMPTS attempts")
        return null
    }

    /**
     * 推理结果：HTTP 状态码 + 原始响应体。
     */
    data class InferenceResult(val status: Int, val body: ByteArray)

    /**
     * 导出账号密钥 —— 拿去另一台设备导入。
     *
     * ⚠️ **这串东西就是身份本身。** 账号密钥派生出 principal 与默认人格
     * ⇒ 持有它的人**就是**那个人（记忆也归那个人）。它像密码管理器的
     * 恢复码，有一样的后果。
     *
     * 导出**不走端脑的 HTTP 面** —— 那张面在 loopback 上，能连上它就
     * 意味着「本机任意进程」，把账号密钥放到那儿等于把身份发出去。
     *
     * @param dataDir App 的私有目录（与 [start] 传的是同一个）—— 账号
     *   身份目录在它下面，端脑写记忆时用的也是那一份。
     * @return 账号密钥；null = 导出失败。
     *
     * ⚠️ **绝不要 log 这个返回值** —— 它是明文的恢复凭据。
     */
    fun exportAccount(dataDir: String): String? {
        return try {
            var capacity = DEFAULT_BUFFER_BYTES
            repeat(MAX_INFER_ATTEMPTS) {
                val output = ByteArray(capacity)
                val written = try {
                    nativeExportAccount(dataDir, output, output.size)
                } catch (e: UnsatisfiedLinkError) {
                    AppLog.e(TAG, "Encephalon native method missing — .so not loaded, or an old .so without this method: ${e.message}")
                    return null
                } catch (e: Exception) {
                    AppLog.e(TAG, "exportAccount failed: ${e.message}", e)
                    return null
                }

                if (written < 0) {
                    AppLog.e(TAG, "exportAccount returned error code: $written")
                    return null
                }
                if (written > output.size) {
                    // 缓冲区不够 —— native 回了需要的大小，按它扩一次再来。
                    capacity = written
                    return@repeat
                }
                // ⚠️ 不 log 内容。
                return String(output.copyOf(written), Charsets.UTF_8)
            }
            AppLog.e(TAG, "exportAccount: buffer still too small after $MAX_INFER_ATTEMPTS attempts")
            null
        } catch (e: UnsatisfiedLinkError) {
            AppLog.w(TAG, "Encephalon native method missing — .so not loaded, or an old .so without this method: ${e.message}")
            null
        } catch (e: Exception) {
            AppLog.e(TAG, "exportAccount failed: ${e.message}", e)
            null
        }
    }
}
