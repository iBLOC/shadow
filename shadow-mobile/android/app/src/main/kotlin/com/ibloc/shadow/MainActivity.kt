package com.ibloc.shadow

import android.content.Context
import android.content.Intent
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel
import com.ibloc.shadow.litert.LitertEngine
import com.ibloc.shadow.mnn.OpenAIServer
import com.ibloc.shadow.mnn.OpenAIServerManager
import com.ibloc.shadow.pcm.PcmAudioRecorder
import com.ibloc.shadow.tts.TtsManager
import com.ibloc.shadow.http.MobileActionServer
import com.ibloc.shadow.provision.BleProvisioningService
import com.ibloc.shadow.audio.UsbAudioRouter
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : FlutterActivity() {
    private val CHANNEL = "com.ibloc.shadow/mnn"
    private val A11Y_CHANNEL = "com.ibloc.shadow/accessibility"
    private val MDNS_CHANNEL = "com.ibloc.shadow/mdns"
    private val LOG_CHANNEL = "com.ibloc.shadow/mnn_logs"
    private val LITERT_CHANNEL = "com.ibloc.shadow/litert"
    private val TTS_CHANNEL = "com.ibloc.shadow/tts"
    private val PCM_AUDIO_CHANNEL = "com.ibloc.shadow/pcm_audio"
    private val PCM_AUDIO_STREAM_CHANNEL = "com.ibloc.shadow/pcm_audio_stream"
    private val HTTP_SERVER_CHANNEL = "com.ibloc.shadow/http_server"
    private val ENGINE_CHANNEL = "com.ibloc.shadow/engine"
    private val BLE_PROVISION_CHANNEL = "com.ibloc.shadow/ble_provision"
    private val USB_AUDIO_CHANNEL = "com.ibloc.shadow/usb_audio"
    private val ENCEPHALON_CHANNEL = "com.ibloc.shadow/encephalon_runtime"

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
    private var nsdManager: NsdManager? = null
    private val discoveredServices = ConcurrentHashMap<String, NsdServiceInfo>()
    private var logcatReader: LogcatReader? = null
    
    private var litertEngine: LitertEngine? = null
    private var ttsManager: TtsManager? = null
    private var pcmAudioRecorder: PcmAudioRecorder? = null
    private var usbAudioRouter: UsbAudioRouter? = null
    private var bleProvisioner: BleProvisioningService? = null

    private var engineRegistrationListener: NsdManager.RegistrationListener? = null
    private var engineRegisteredName: String? = null
    
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        nsdManager = getSystemService(Context.NSD_SERVICE) as NsdManager
        pcmAudioRecorder = PcmAudioRecorder(this)
        usbAudioRouter = UsbAudioRouter(this)
        bleProvisioner = BleProvisioningService(this)

        setupAccessibilityChannel(flutterEngine)
        setupMdnsChannel(flutterEngine)
        setupLogcatChannel(flutterEngine)
        setupLitertChannel(flutterEngine)
        setupTtsChannel(flutterEngine)
        setupPcmAudioChannel(flutterEngine)
        setupHttpServerChannel(flutterEngine)
        setupEngineChannel(flutterEngine)
        setupPrefrontalRuntimeChannel(flutterEngine)
        setupEncephalonRuntimeChannel(flutterEngine)
        setupBleProvisionChannel(flutterEngine)
        setupUsbAudioChannel(flutterEngine)
    }
    
    private fun setupAccessibilityChannel(flutterEngine: FlutterEngine) {
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, A11Y_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "isEnabled" -> result.success(PrefrontalAccessibilityService.instance != null)
                "openSettings" -> {
                    val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(intent)
                    result.success(null)
                }
                "tap" -> {
                    val x = (call.argument<Number>("x")?.toFloat()) ?: 0f
                    val y = (call.argument<Number>("y")?.toFloat()) ?: 0f
                    result.success(PrefrontalAccessibilityService.instance?.performTap(x, y) ?: false)
                }
                "longPress" -> {
                    val x = (call.argument<Number>("x")?.toFloat()) ?: 0f
                    val y = (call.argument<Number>("y")?.toFloat()) ?: 0f
                    result.success(PrefrontalAccessibilityService.instance?.performLongPress(x, y) ?: false)
                }
                "swipe" -> {
                    val x1 = (call.argument<Number>("x1")?.toFloat()) ?: 0f
                    val y1 = (call.argument<Number>("y1")?.toFloat()) ?: 0f
                    val x2 = (call.argument<Number>("x2")?.toFloat()) ?: 0f
                    val y2 = (call.argument<Number>("y2")?.toFloat()) ?: 0f
                    val d = (call.argument<Number>("durationMs")?.toLong()) ?: 300L
                    result.success(PrefrontalAccessibilityService.instance?.performSwipe(x1, y1, x2, y2, d) ?: false)
                }
                "globalAction" -> {
                    val action = call.argument<String>("action") ?: "back"
                    val id = when(action) {
                        "back" -> android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK
                        "home" -> android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_HOME
                        else -> android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK
                    }
                    result.success(PrefrontalAccessibilityService.instance?.performGlobalActionById(id) ?: false)
                }
                "findAndClickByText" -> result.success(PrefrontalAccessibilityService.instance?.findAndClickByText(call.argument<String>("text") ?: "") ?: false)
                else -> result.notImplemented()
            }
        }
    }
    
    private fun setupLogcatChannel(flutterEngine: FlutterEngine) {
        EventChannel(flutterEngine.dartExecutor.binaryMessenger, LOG_CHANNEL).setStreamHandler(
            object : EventChannel.StreamHandler {
                override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                    logcatReader = LogcatReader()
                    logcatReader?.startReading { entry ->
                        events?.success(entry)
                    }
                }

                override fun onCancel(arguments: Any?) {
                    logcatReader?.stopReading()
                    logcatReader = null
                }
            }
        )
    }
    
    private fun bindEngineToLiteRT() {
        val engine = litertEngine ?: return
        OpenAIServerManager.setEngineProvider(OpenAIServer.EngineProvider { prompt ->
            kotlinx.coroutines.runBlocking {
                engine.generateContent(prompt)
            }
        })
    }

    private fun registerEngineService(port: Int) {
        val manager = nsdManager ?: run {
            android.util.Log.w("MainActivity", "NsdManager unavailable; engine not advertised")
            return
        }
        if (engineRegistrationListener != null) return

        val serviceInfo = NsdServiceInfo().apply {
            serviceName = "shadow-engine-${android.os.Build.MODEL}"
                .replace(' ', '_')
                .take(63)
            serviceType = "_shadow._tcp."
            this.port = port
            setAttribute("id", android.provider.Settings.Secure.getString(
                contentResolver, android.provider.Settings.Secure.ANDROID_ID
            ) ?: "android-unknown")
            setAttribute("name", "Shadow Mobile Engine")
            setAttribute("type", "engine")
            setAttribute("capabilities", "llm,asr,tts")
            setAttribute("endpoints", "chat,chat_stream,audio_speech,audio_transcriptions,models")
            setAttribute("version", "1.0")
        }

        val listener = object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(serviceInfo: NsdServiceInfo) {
                engineRegisteredName = serviceInfo.serviceName
                android.util.Log.i("MainActivity", "Engine advertised as ${serviceInfo.serviceName}")
            }
            override fun onRegistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                android.util.Log.e("MainActivity", "Engine registration failed: $errorCode")
            }
            override fun onServiceUnregistered(arg0: NsdServiceInfo) {
                android.util.Log.i("MainActivity", "Engine unregistered")
            }
            override fun onUnregistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                android.util.Log.w("MainActivity", "Engine unregistration failed: $errorCode")
            }
        }

        try {
            manager.registerService(serviceInfo, NsdManager.PROTOCOL_DNS_SD, listener)
            engineRegistrationListener = listener
        } catch (e: Exception) {
            android.util.Log.e("MainActivity", "registerService threw", e)
        }
    }

    private fun unregisterEngineService() {
        val manager = nsdManager ?: return
        val listener = engineRegistrationListener ?: return
        try {
            manager.unregisterService(listener)
        } catch (e: Exception) {
            android.util.Log.w("MainActivity", "unregisterService threw", e)
        }
        engineRegistrationListener = null
        engineRegisteredName = null
    }

    private fun setupMdnsChannel(flutterEngine: FlutterEngine) {
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, MDNS_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "discoverMdns" -> {
                    val serviceType = call.argument<String>("serviceType") ?: "_shadow._tcp"
                    val timeout = call.argument<Int>("timeout") ?: 5000
                    discoverMdnsServices(serviceType, timeout, result)
                }
                "resolveMdns" -> {
                    val serviceName = call.argument<String>("serviceName") ?: ""
                    resolveMdnsService(serviceName, result)
                }
                else -> result.notImplemented()
            }
        }
    }
    
    private fun setupLitertChannel(flutterEngine: FlutterEngine) {
        litertEngine = LitertEngine(this)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, LITERT_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "initialize" -> {
                    val modelPath = call.argument<String>("modelPath") ?: ""
                    scope.launch {
                        try {
                            val success = litertEngine?.initialize(modelPath) ?: false
                            result.success(success)
                        } catch (e: Exception) {
                            result.error("INIT_ERROR", e.message, null)
                        }
                    }
                }
                "initializeWithTimeout" -> {
                    val modelPath = call.argument<String>("modelPath") ?: ""
                    val timeoutMs = call.argument<Number>("timeoutMs")?.toLong() ?: 10000L
                    scope.launch {
                        try {
                            val success = litertEngine?.initializeWithTimeout(modelPath, timeoutMs) ?: false
                            result.success(success)
                        } catch (e: Exception) {
                            result.error("INIT_ERROR", e.message, null)
                        }
                    }
                }
                "diagnose" -> {
                    val modelPath = call.argument<String>("modelPath") ?: ""
                    val diagnosis = litertEngine?.diagnoseModelDirectory(modelPath)
                    result.success(diagnosis ?: emptyMap<String, Any>())
                }
                "generateContent" -> {
                    val prompt = call.argument<String>("prompt") ?: ""
                    scope.launch {
                        try {
                            val response = litertEngine?.generateContent(prompt) ?: ""
                            result.success(response)
                        } catch (e: Exception) {
                            result.error("GEN_ERROR", e.message, null)
                        }
                    }
                }
                "generateContentStream" -> {
                    val content = call.argument<String>("content") ?: ""
                    scope.launch {
                        try {
                            val response = litertEngine?.generateContentStream(content) ?: ""
                            result.success(response)
                        } catch (e: Exception) {
                            result.error("GEN_ERROR", e.message, null)
                        }
                    }
                }
                "getResponseText" -> {
                    result.success(litertEngine?.responseText?.value ?: "")
                }
                "isInitialized" -> {
                    result.success(litertEngine?.isInitialized?.value ?: false)
                }
                "isLoading" -> {
                    result.success(litertEngine?.isLoading?.value ?: false)
                }
                "getDownloadProgress" -> {
                    val progress = litertEngine?.downloadProgress?.value
                    result.success(progress?.let { mapOf("downloaded" to it.first, "total" to it.second) })
                }
                "getLastError" -> {
                    result.success(litertEngine?.lastError?.value)
                }
                "release" -> {
                    litertEngine?.release()
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }
    }
    
    private fun setupTtsChannel(flutterEngine: FlutterEngine) {
        ttsManager = TtsManager(this)
        
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, TTS_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "speak" -> {
                    val text = call.argument<String>("text") ?: ""
                    val lang = call.argument<String>("lang") ?: "zh-CN"
                    ttsManager?.speak(text, lang)
                    result.success(true)
                }
                "stop" -> {
                    ttsManager?.stop()
                    result.success(true)
                }
                "isSpeaking" -> {
                    result.success(ttsManager?.isSpeaking?.value ?: false)
                }
                "isInitialized" -> {
                    result.success(ttsManager?.isInitialized() ?: false)
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun setupPcmAudioChannel(flutterEngine: FlutterEngine) {
        EventChannel(flutterEngine.dartExecutor.binaryMessenger, PCM_AUDIO_STREAM_CHANNEL).setStreamHandler(
            object : EventChannel.StreamHandler {
                override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                    pcmAudioRecorder?.setEventSink(events)
                }

                override fun onCancel(arguments: Any?) {
                    pcmAudioRecorder?.setEventSink(null)
                }
            }
        )

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, PCM_AUDIO_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "hasPermission" -> {
                    result.success(pcmAudioRecorder?.hasPermission() ?: false)
                }
                "startRecording" -> {
                    scope.launch {
                        val success = pcmAudioRecorder?.startRecording() ?: false
                        result.success(success)
                    }
                }
                "stopRecording" -> {
                    val pcmData = pcmAudioRecorder?.stopRecording()
                    if (pcmData != null) {
                        result.success(pcmData)
                    } else {
                        result.success(null)
                    }
                }
                "cancelRecording" -> {
                    pcmAudioRecorder?.cancelRecording()
                    result.success(true)
                }
                "isRecording" -> {
                    result.success(pcmAudioRecorder?.isRecording() ?: false)
                }
                "getElapsedTimeMs" -> {
                    result.success(pcmAudioRecorder?.getElapsedTimeMs() ?: 0L)
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun setupHttpServerChannel(flutterEngine: FlutterEngine) {
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, HTTP_SERVER_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "start" -> {
                    val port = call.argument<Int>("port") ?: 8080
                    val success = MobileActionServer.start(port)
                    result.success(success)
                }
                "stop" -> {
                    MobileActionServer.stop()
                    result.success(true)
                }
                "isRunning" -> {
                    result.success(MobileActionServer.instance != null)
                }
                "getPort" -> {
                    result.success(MobileActionServer.instance?.listeningPort ?: -1)
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun setupEngineChannel(flutterEngine: FlutterEngine) {
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, ENGINE_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "startServer" -> {
                    val port = call.argument<Int>("port") ?: OpenAIServerManager.DEFAULT_PORT
                    val advertise = call.argument<Boolean>("advertise") ?: true
                    val authEnabled = call.argument<Boolean>("authEnabled") ?: true
                    OpenAIServerManager.setAuthEnabled(authEnabled)
                    val started = OpenAIServerManager.startServer(applicationContext, port)
                    if (started && advertise) {
                        bindEngineToLiteRT()
                        registerEngineService(port)
                    }
                    result.success(started)
                }
                "stopServer" -> {
                    unregisterEngineService()
                    OpenAIServerManager.stopServer()
                    result.success(true)
                }
                "isServerRunning" -> result.success(OpenAIServerManager.isServerRunning())
                "getServerUrl" -> result.success(OpenAIServerManager.getServerUrl())
                "getApiKey" -> result.success(OpenAIServerManager.getApiKey())
                "setApiKey" -> {
                    OpenAIServerManager.setApiKey(call.argument<String>("key") ?: "")
                    result.success(true)
                }
                "setAuthEnabled" -> {
                    OpenAIServerManager.setAuthEnabled(call.argument<Boolean>("enabled") ?: true)
                    result.success(true)
                }
                "getServiceName" -> result.success(engineRegisteredName)
                else -> result.notImplemented()
            }
        }
    }

    private fun discoverMdnsServices(serviceType: String, timeout: Int, result: MethodChannel.Result) {
        val manager = nsdManager
        if (manager == null) {
            result.success(emptyList<Map<String, Any>>())
            return
        }
        
        discoveredServices.clear()
        val services = mutableListOf<Map<String, Any>>()
        
        val discoveryListener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) {}
            
            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                if (serviceInfo.serviceType == serviceType || serviceInfo.serviceType == "$serviceType.") {
                    discoveredServices[serviceInfo.serviceName] = serviceInfo
                }
            }
            
            override fun onServiceLost(serviceInfo: NsdServiceInfo) {
                discoveredServices.remove(serviceInfo.serviceName)
            }
            
            override fun onDiscoveryStopped(serviceType: String) {}
            
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {}
            
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
        }
        
        try {
            manager.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
            
            Handler(Looper.getMainLooper()).postDelayed({
                try {
                    manager.stopServiceDiscovery(discoveryListener)
                } catch (_: Exception) {}
                
                val resolvedServices = mutableListOf<Map<String, Any>>()
                val latch = java.util.concurrent.CountDownLatch(discoveredServices.size)
                
                discoveredServices.forEach { (name, serviceInfo) ->
                    val resolveListener = object : NsdManager.ResolveListener {
                        override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                            latch.countDown()
                        }
                        
                        override fun onServiceResolved(resolvedInfo: NsdServiceInfo) {
                            val txtRecords = mutableMapOf<String, String>()
                            resolvedInfo.attributes?.forEach { (key, value) ->
                                txtRecords[key] = String(value ?: byteArrayOf())
                            }
                            
                            synchronized(resolvedServices) {
                                resolvedServices.add(mapOf(
                                    "name" to resolvedInfo.serviceName,
                                    "host" to (resolvedInfo.host?.hostAddress ?: ""),
                                    "port" to (resolvedInfo.port ?: 0),
                                    "txtRecords" to txtRecords
                                ))
                            }
                            latch.countDown()
                        }
                    }
                    
                    try {
                        manager.resolveService(serviceInfo, resolveListener)
                    } catch (_: Exception) {
                        latch.countDown()
                    }
                }
                
                latch.await((timeout / 2).toLong(), java.util.concurrent.TimeUnit.MILLISECONDS)
                result.success(resolvedServices)
            }, timeout.toLong())
        } catch (e: Exception) {
            result.success(emptyList<Map<String, Any>>())
        }
    }
    
    private fun resolveMdnsService(serviceName: String, result: MethodChannel.Result) {
        val manager = nsdManager
        if (manager == null) {
            result.success(null)
            return
        }
        
        val pendingInfo = discoveredServices[serviceName]
        if (pendingInfo == null) {
            result.success(null)
            return
        }
        
        val resolveListener = object : NsdManager.ResolveListener {
            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                result.success(null)
            }
            
            override fun onServiceResolved(resolvedInfo: NsdServiceInfo) {
                val txtRecords = mutableMapOf<String, String>()
                resolvedInfo.attributes?.forEach { (key, value) ->
                    txtRecords[key] = String(value ?: byteArrayOf())
                }
                
                result.success(mapOf(
                    "name" to resolvedInfo.serviceName,
                    "host" to (resolvedInfo.host?.hostAddress ?: ""),
                    "port" to (resolvedInfo.port ?: 0),
                    "txtRecords" to txtRecords
                ))
            }
        }
        
        try {
            manager.resolveService(pendingInfo, resolveListener)
        } catch (e: Exception) {
            result.success(null)
        }
    }

    /**
     * Prefrontal 嵌入式运行时 MethodChannel
     *
     * 这个 MethodChannel 与 PrefrontalRuntimeService 通信，
     * 让 Flutter 可以通过 JNI 调用嵌入在 App 进程内的 Prefrontal 运行时。
     *
     * 通信流程:
     * Flutter → MethodChannel → PrefrontalRuntimeService → JNI → libprefrontal_core_lib.so
     *                                                          ↓
     *                                                          mini HTTP server (axum)
     *                                                          ↑
     *                                                       HTTP (localhost)
     */
    private fun setupPrefrontalRuntimeChannel(flutterEngine: FlutterEngine) {
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.ibloc.shadow/prefrontal_runtime")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "start" -> {
                        // 启动 Android Service (后台)
                        val serviceStarted = try {
                            val intent = Intent(this, PrefrontalRuntimeService::class.java)
                            startService(intent)
                            true
                        } catch (e: Exception) {
                            false
                        }

                        if (serviceStarted) {
                            // 等待服务启动
                            Thread.sleep(500)
                        }

                        // 获取 port (从 Kotlin Service 启动的 JNI)
                        val port = try {
                            val runtime = PrefrontalRuntime.getInstance()
                            val started = runtime.start(0) // 0 = 随机端口
                            if (started) runtime.getPort() else -1
                        } catch (e: UnsatisfiedLinkError) {
                            result.error("SO_NOT_LOADED", "Prefrontal .so not loaded: ${e.message}", null)
                            return@setMethodCallHandler
                        } catch (e: Exception) {
                            result.error("START_FAILED", e.message ?: "Unknown error", null)
                            return@setMethodCallHandler
                        }

                        result.success(mapOf(
                            "success" to (port > 0),
                            "port" to port
                        ))
                    }

                    "stop" -> {
                        try {
                            val runtime = PrefrontalRuntime.getInstance()
                            val stopped = runtime.stop()
                            // 停止 Android Service
                            val intent = Intent(this, PrefrontalRuntimeService::class.java)
                            stopService(intent)
                            result.success(stopped)
                        } catch (e: Exception) {
                            result.success(false)
                        }
                    }

                    "isHealthy" -> {
                        try {
                            val runtime = PrefrontalRuntime.getInstance()
                            result.success(runtime.isHealthy())
                        } catch (e: Exception) {
                            result.success(false)
                        }
                    }

                    "getStatus" -> {
                        try {
                            val runtime = PrefrontalRuntime.getInstance()
                            result.success(mapOf(
                                "running" to runtime.isHealthy(),
                                "port" to runtime.getPort()
                            ))
                        } catch (e: Exception) {
                            result.success(mapOf(
                                "running" to false,
                                "port" to 0
                            ))
                        }
                    }

                    "registerAgent" -> {
                        val agentId = call.argument<String>("agentId") ?: ""
                        val name = call.argument<String>("name") ?: ""
                        val description = call.argument<String>("description") ?: ""
                        try {
                            val runtime = PrefrontalRuntime.getInstance()
                            val success = runtime.registerAgent(agentId, name, description)
                            result.success(success)
                        } catch (e: Exception) {
                            result.error("REGISTER_FAILED", e.message ?: "Unknown error", null)
                        }
                    }

                    "invokeAgent" -> {
                        val agentId = call.argument<String>("agentId") ?: ""
                        val input = call.argument<String>("input") ?: ""
                        try {
                            val runtime = PrefrontalRuntime.getInstance()
                            val output = runtime.invokeAgent(agentId, input)
                            if (output != null) {
                                result.success(output)
                            } else {
                                result.error("INVOKE_FAILED", "Failed to invoke agent", null)
                            }
                        } catch (e: Exception) {
                            result.error("INVOKE_FAILED", e.message ?: "Unknown error", null)
                        }
                    }

                    "startAndroidService" -> {
                        try {
                            val intent = Intent(this, PrefrontalRuntimeService::class.java)
                            startService(intent)
                            result.success(true)
                        } catch (e: Exception) {
                            result.error("SERVICE_START_FAILED", e.message ?: "Unknown error", null)
                        }
                    }

                    "stopAndroidService" -> {
                        try {
                            val intent = Intent(this, PrefrontalRuntimeService::class.java)
                            stopService(intent)
                            result.success(true)
                        } catch (e: Exception) {
                            result.success(false)
                        }
                    }

                    else -> result.notImplemented()
                }
            }
    }

    /**
     * Encephalon（大脑）嵌入式运行时 MethodChannel
     *
     * 与桌面端同源：`encephalon::Embedded::boot(...)` 那一整栈大脑跑在
     * App 进程内（libencephalon.so），不是外部进程。
     *
     * 通信流程:
     * Flutter → MethodChannel → EncephalonRuntime → JNI → libencephalon.so
     *                                                     ↓
     *                                          进程内推理（不绕 socket）
     *
     * 与 Prefrontal 的差别：推理走 `infer`（进程内直接进 neuron 的
     * adapter 管线），不是走 localhost HTTP。
     */
    private fun setupEncephalonRuntimeChannel(flutterEngine: FlutterEngine) {
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, ENCEPHALON_CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    // LLM 上游（OpenAI 兼容）—— 必须在 "start" 之前调用。
                    //
                    // neuron 的 remote 引擎只认环境变量，而 Android App 进程的
                    // 环境变量由 zygote 决定、宿主注入不了 —— 所以这条通道是
                    // 「手机上跑一个云端模型」唯一的入口。
                    "setLlmProvider" -> {
                        val baseUrl = call.argument<String>("baseUrl") ?: ""
                        val apiKey = call.argument<String>("apiKey") ?: ""
                        val model = call.argument<String>("model") ?: ""
                        try {
                            result.success(
                                EncephalonRuntime.getInstance()
                                    .setLlmProvider(baseUrl, apiKey, model)
                            )
                        } catch (e: Exception) {
                            result.success(false)
                        }
                    }

                    // 模型路由（全局默认 + 每叶区覆盖）—— 必须在 "start" 之前调用。
                    //
                    // 模型使用的最小单位是叶区：全局默认决定「默认各叶区都走
                    // 本地 / 都走云端」，per-lobe 覆盖决定「某一个叶区单独换
                    // 一边」。一次调用下发整份路由。
                    "setModelRouting" -> {
                        val json = call.argument<String>("json") ?: ""
                        try {
                            result.success(
                                EncephalonRuntime.getInstance().setModelRouting(json)
                            )
                        } catch (e: Exception) {
                            result.success(false)
                        }
                    }

                    "start" -> {
                        val port = call.argument<Int>("port") ?: 0
                        // App 私有目录 —— 端脑的 flow（工作流）存储要写在那里。
                        // Android 没有 $HOME，进程工作目录是 /（不可写）。
                        val dataDir = call.argument<String>("dataDir")
                            ?: filesDir?.absolutePath
                        // 端脑面那道门的钥匙 —— 宿主生成，**同一份**同时给端脑
                        // 和 App 自己的客户端。
                        //
                        // ⚠️ 必须在 start **之前**设进去：Rust 侧是在 start 的
                        // 时候读这个槽位的（跟 LLM 上游那条通道一样）。
                        //
                        // ⚠️ 没有它，手机上的端脑面是**敞开**的：同一台设备上
                        // 任何别的 App 都能 `POST /shadow/v1/identity` ⇒
                        // **换掉「这台机器是谁」**（记忆改写进另一个人格、
                        // 而且不报错）。
                        val shadowKey = ShadowKey.getOrCreate(filesDir)
                        // admin 面（「谁能改这台大脑的配置」）的那把 token ——
                        // 宿主生成，**同一份**同时给端脑和 App 自己的客户端。
                        //
                        // ⚠️ 必须在 start **之前**设进去（Rust 侧是在 start 的
                        // 时候读这个槽位的）。
                        //
                        // ⚠️ 没有它，手机上的 admin 面是**敞开**的：端脑的
                        // admin token 取默认 `""` ⇒ 而 `verify_admin_token`
                        // 在 expected 为空串时只要求「请求里带 `X-Admin-Token`
                        // 头」⇒ **空值**的头就能过 ⇒ ⚠️ **2026-10-31 真机
                        // 证实过**（空头 ⇒ 200）⇒ 同设备任何别的 App 都能装
                        // agent、**改 LLM 上游**、动 MCP。
                        //
                        // ⚠️ **它与 shadow key 是两把不同的钥匙** —— 一个是
                        // 门闩，一个是凭据。
                        val adminToken = AdminKey.getOrCreate(filesDir)
                        try {
                            val runtime = EncephalonRuntime.getInstance()
                            runtime.setShadowApiKey(shadowKey)
                            runtime.setAdminToken(adminToken)
                            val started = runtime.start(port, dataDir)
                            result.success(mapOf(
                                "success" to started,
                                "port" to runtime.getPort(),
                                "agentPort" to runtime.getAgentPort(),
                                // 客户端要靠它给端脑请求带 X-Shadow-Key。
                                // 同一把，端脑守门、客户端敲门。
                                "shadowKey" to shadowKey,
                                // 同理：客户端要靠它给 admin 请求带
                                // X-Admin-Token ⇒ **App 自己的** MCP/agent
                                // 管理功能在手机上才不是 401。
                                "adminToken" to adminToken
                            ))
                        } catch (e: UnsatisfiedLinkError) {
                            result.error("SO_NOT_LOADED", "Encephalon .so not loaded: ${e.message}", null)
                        } catch (e: Exception) {
                            result.error("START_FAILED", e.message ?: "Unknown error", null)
                        }
                    }

                    // 导出账号密钥 —— 拿去另一台设备导入。
                    //
                    // ⚠️ **这串东西就是身份本身** —— 持有它的人**就是**那个人
                    // （记忆也归那个人）。所以导出**不走端脑的 HTTP 面**：
                    // 那张面在 loopback 上，能连上它就意味着「本机任意
                    // 进程」，把账号密钥放到那儿等于把身份发出去。
                    //
                    // 这里的 dataDir 必须与 "start" 传的是同一个 —— 账号
                    // 身份目录在它下面，端脑写记忆时用的也是那一份。
                    "exportAccount" -> {
                        val dataDir = call.argument<String>("dataDir")
                            ?: filesDir?.absolutePath
                            ?: ""
                        try {
                            val code = EncephalonRuntime.getInstance().exportAccount(dataDir)
                            if (code == null) {
                                result.error(
                                    "EXPORT_FAILED",
                                    "the account could not be exported",
                                    null
                                )
                            } else {
                                // ⚠️ 不 log 内容 —— 它是明文的恢复凭据。
                                result.success(code)
                            }
                        } catch (e: UnsatisfiedLinkError) {
                            result.error("SO_NOT_LOADED", "Encephalon .so not loaded: ${e.message}", null)
                        } catch (e: Exception) {
                            result.error("EXPORT_FAILED", e.message ?: "Unknown error", null)
                        }
                    }

                    "stop" -> {
                        try {
                            result.success(EncephalonRuntime.getInstance().stop())
                        } catch (e: Exception) {
                            result.success(false)
                        }
                    }

                    "getPort" -> {
                        try {
                            result.success(EncephalonRuntime.getInstance().getPort())
                        } catch (e: Exception) {
                            result.success(0)
                        }
                    }

                    "isHealthy" -> {
                        try {
                            result.success(EncephalonRuntime.getInstance().isHealthy())
                        } catch (e: Exception) {
                            result.success(false)
                        }
                    }

                    "getStatus" -> {
                        try {
                            val runtime = EncephalonRuntime.getInstance()
                            result.success(mapOf(
                                "running" to runtime.isRunning(),
                                "port" to runtime.getPort(),
                                "agentPort" to runtime.getAgentPort(),
                                "healthy" to runtime.isHealthy()
                            ))
                        } catch (e: Exception) {
                            result.success(mapOf(
                                "running" to false,
                                "port" to 0,
                                "agentPort" to 0,
                                "healthy" to false
                            ))
                        }
                    }

                    "infer" -> {
                        val path = call.argument<String>("path")
                        val body = call.argument<ByteArray>("body")
                        if (path == null || body == null) {
                            result.error("INVALID_ARGS", "Missing path or body", null)
                            return@setMethodCallHandler
                        }
                        // nativeInfer 是阻塞调用（Rust 侧 rt.block_on），
                        // 放 IO 线程，别卡住 UI。
                        scope.launch {
                            val inference = withContext(Dispatchers.IO) {
                                try {
                                    EncephalonRuntime.getInstance().infer(path, body)
                                } catch (e: Exception) {
                                    null
                                }
                            }
                            if (inference == null) {
                                result.error("INFER_FAILED", "infer failed", null)
                            } else {
                                result.success(mapOf(
                                    "status" to inference.status,
                                    "body" to inference.body
                                ))
                            }
                        }
                    }

                    else -> result.notImplemented()
                }
            }
    }

    private fun setupBleProvisionChannel(flutterEngine: FlutterEngine) {
        bleProvisioner?.attach(flutterEngine)
    }

    private fun setupUsbAudioChannel(flutterEngine: FlutterEngine) {
        val router = usbAudioRouter ?: return
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger,
                       USB_AUDIO_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "listRoutes" -> {
                    scope.launch {
                        try {
                            val routes = router.listSinks()
                            result.success(routes)
                        } catch (e: Exception) {
                            result.error("USB_AUDIO_LIST", e.message, null)
                        }
                    }
                }
                "routeTo" -> {
                    val id = call.argument<Number>("id")?.toInt() ?: -1
                    if (id < 0) {
                        result.error("USB_AUDIO_ID", "missing id", null)
                    } else {
                        try {
                            router.routeTo(id)
                            result.success(true)
                        } catch (e: Exception) {
                            result.error("USB_AUDIO_ROUTE", e.message, null)
                        }
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterEngineService()
        OpenAIServerManager.stopServer()
        litertEngine?.release()
        litertEngine = null
        ttsManager?.release()
        ttsManager = null
        pcmAudioRecorder?.release()
        pcmAudioRecorder = null
    }
}
