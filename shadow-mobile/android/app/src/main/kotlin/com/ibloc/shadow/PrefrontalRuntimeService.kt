package com.ibloc.shadow

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.engine.dart.DartExecutor
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.JSONMethodCodec
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Prefrontal 嵌入式运行时服务
 *
 * 这是一个 Android Service, 负责:
 * 1. 启动/停止 Prefrontal 嵌入式运行时 (.so)
 * 2. 暴露 MethodChannel 供 Flutter 调用
 * 3. 在 App 生命周期内维护 Prefrontal 状态
 *
 * 这个服务嵌入在 Android App 进程内, 不需要独立的外部进程。
 * Prefrontal 作为 .so 加载到 App 进程, 启动 mini HTTP server (localhost),
 * Flutter 通过 MethodChannel 调用这个服务, 服务再通过 JNI + HTTP 与 Prefrontal 通信。
 *
 * 通信架构:
 *   Flutter UI
 *     ↓ MethodChannel
 *   PrefrontalRuntimeService (Kotlin)
 *     ↓ JNI (同进程)
 *   libprefrontal_core_lib.so (Rust)
 *     ↓ HTTP (localhost:0)
 *   mini HTTP server (axum)
 *     ↑ HTTP
 *   PrefrontalRuntimeService.httpGet/httpPost (同进程回环)
 */
class PrefrontalRuntimeService : Service() {

    companion object {
        private const val TAG = "PrefrontalRuntimeService"
        private const val CHANNEL_NAME = "com.ibloc.shadow/prefrontal_runtime"
        private const val DEFAULT_PORT = 0  // 0 = 随机分配

        @Volatile
        private var instance: PrefrontalRuntimeService? = null

        @JvmStatic
        fun getInstance(): PrefrontalRuntimeService? = instance

        /**
         * 启动 Prefrontal 服务 (供其他组件调用)
         */
        @JvmStatic
        fun startService(context: Context) {
            val intent = Intent(context, PrefrontalRuntimeService::class.java)
            context.startService(intent)
        }

        /**
         * 停止 Prefrontal 服务
         */
        @JvmStatic
        fun stopService(context: Context) {
            val intent = Intent(context, PrefrontalRuntimeService::class.java)
            context.stopService(intent)
        }
    }

    private val runtime: PrefrontalRuntime by lazy { PrefrontalRuntime.getInstance() }
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var methodChannel: MethodChannel? = null
    private var isStarted = false

    override fun onCreate() {
        super.onCreate()
        instance = this
        AppLog.d(TAG, "PrefrontalRuntimeService created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        AppLog.d(TAG, "PrefrontalRuntimeService onStartCommand")
        if (!isStarted) {
            startPrefrontal()
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? {
        // 不支持 bind, 只能通过 startService 启动
        return null
    }

    override fun onDestroy() {
        AppLog.d(TAG, "PrefrontalRuntimeService destroyed")
        stopPrefrontal()
        instance = null
        methodChannel?.setMethodCallHandler(null)
        methodChannel = null
        super.onDestroy()
    }

    private fun startPrefrontal() {
        if (isStarted) return

        AppLog.i(TAG, "Starting Prefrontal runtime on port $DEFAULT_PORT")
        val success = runtime.start(DEFAULT_PORT)

        if (success) {
            isStarted = true
            setupMethodChannel()
        } else {
            AppLog.e(TAG, "Failed to start Prefrontal runtime")
        }
    }

    private fun stopPrefrontal() {
        if (!isStarted) return
        AppLog.i(TAG, "Stopping Prefrontal runtime")
        runtime.stop()
        isStarted = false
    }

    private fun setupMethodChannel() {
        // 注意: 实际使用时, 应该从 FlutterEngine 获取 BinaryMessenger
        // 这里使用 JSONMethodCodec 进行结构化数据传输
        // 实际集成时, 这个 channel 会在 Flutter Engine 启动后被注册

        // 暂时使用一个简单的 broadcast 方式
        // 在实际使用中, Flutter Engine 会创建 BinaryMessenger, 我们需要将 channel 绑定到它
        AppLog.d(TAG, "MethodChannel setup deferred to Flutter engine integration")
    }

    /**
     * 当 Flutter Engine 启动时, 注册 MethodChannel
     * 这个方法应该被 Flutter 端的代码调用
     */
    fun registerWithFlutterEngine(engine: FlutterEngine) {
        val messenger = engine.dartExecutor.binaryMessenger
        methodChannel = MethodChannel(messenger, CHANNEL_NAME, JSONMethodCodec.INSTANCE)
        methodChannel?.setMethodCallHandler { call, result ->
            handleMethodCall(call, result)
        }
        AppLog.d(TAG, "MethodChannel registered: $CHANNEL_NAME")
    }

    /**
     * 处理来自 Flutter 的方法调用
     */
    private fun handleMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "start" -> {
                val port = call.argument<Int>("port") ?: 0
                val success = runtime.start(port)
                result.success(mapOf(
                    "success" to success,
                    "port" to runtime.getPort()
                ))
            }

            "stop" -> {
                val success = runtime.stop()
                if (success) isStarted = false
                result.success(success)
            }

            "getPort" -> {
                result.success(runtime.getPort())
            }

            "isHealthy" -> {
                result.success(runtime.isHealthy())
            }

            "registerAgent" -> {
                val agentId = call.argument<String>("agentId")
                val name = call.argument<String>("name")
                val description = call.argument<String>("description")
                if (agentId == null || name == null || description == null) {
                    result.error("INVALID_ARGS", "Missing required arguments", null)
                    return
                }
                val success = runtime.registerAgent(agentId, name, description)
                result.success(success)
            }

            "invokeAgent" -> {
                val agentId = call.argument<String>("agentId")
                val input = call.argument<String>("input")
                if (agentId == null || input == null) {
                    result.error("INVALID_ARGS", "Missing required arguments", null)
                    return
                }
                serviceScope.launch {
                    val output = runtime.invokeAgent(agentId, input)
                    if (output != null) {
                        result.success(output)
                    } else {
                        result.error("INVOKE_FAILED", "Failed to invoke agent", null)
                    }
                }
            }

            "httpGet" -> {
                val path = call.argument<String>("path")
                if (path == null) {
                    result.error("INVALID_ARGS", "Missing path", null)
                    return
                }
                serviceScope.launch {
                    val response = runtime.httpGet(path)
                    result.success(response ?: "")
                }
            }

            "httpPost" -> {
                val path = call.argument<String>("path")
                val body = call.argument<String>("body") ?: "{}"
                if (path == null) {
                    result.error("INVALID_ARGS", "Missing path", null)
                    return
                }
                serviceScope.launch {
                    val response = runtime.httpPost(path, body)
                    result.success(response ?: "")
                }
            }

            "getStatus" -> {
                result.success(mapOf(
                    "running" to isStarted,
                    "port" to runtime.getPort(),
                    "healthy" to runtime.isHealthy()
                ))
            }

            else -> {
                result.notImplemented()
            }
        }
    }
}
