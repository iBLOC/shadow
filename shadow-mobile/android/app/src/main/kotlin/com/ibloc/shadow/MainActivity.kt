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
// MNN imports - commented out, keeping for future reference
// import com.ibloc.shadow.mnn.PrefrontalMNN
// import com.ibloc.shadow.mnn.OpenAIServerManager
import com.ibloc.shadow.litert.LitertEngine
import com.ibloc.shadow.pcm.PcmAudioRecorder
import com.ibloc.shadow.tts.TtsManager
import com.ibloc.shadow.http.MobileActionServer
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class MainActivity : FlutterActivity() {
    private val CHANNEL = "com.ibloc.shadow/mnn"
    private val A11Y_CHANNEL = "com.ibloc.shadow/accessibility"
    private val MDNS_CHANNEL = "com.ibloc.shadow/mdns"
    private val LOG_CHANNEL = "com.ibloc.shadow/mnn_logs"
    private val LITERT_CHANNEL = "com.ibloc.shadow/litert"
    private val TTS_CHANNEL = "com.ibloc.shadow/tts"
    private val PCM_AUDIO_CHANNEL = "com.ibloc.shadow/pcm_audio"
    private val HTTP_SERVER_CHANNEL = "com.ibloc.shadow/http_server"

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
    private var nsdManager: NsdManager? = null
    private val discoveredServices = ConcurrentHashMap<String, NsdServiceInfo>()
    private var logcatReader: LogcatReader? = null
    
    private var litertEngine: LitertEngine? = null
    private var ttsManager: TtsManager? = null
    private var pcmAudioRecorder: PcmAudioRecorder? = null
    
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        
        nsdManager = getSystemService(Context.NSD_SERVICE) as NsdManager
        pcmAudioRecorder = PcmAudioRecorder(this)

        setupAccessibilityChannel(flutterEngine)
        setupMdnsChannel(flutterEngine)
        setupLogcatChannel(flutterEngine)
        setupLitertChannel(flutterEngine)
        setupTtsChannel(flutterEngine)
        setupPcmAudioChannel(flutterEngine)
        setupHttpServerChannel(flutterEngine)
        
        // MNN MethodChannel - commented out, keeping for future reference
        // MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
        //     when (call.method) {
        //         "initialize" -> {
        //             val modelPath = call.argument<String>("modelPath") ?: ""
        //             val threadNum = call.argument<Int>("threadNum") ?: 4
        //             val backendType = call.argument<Int>("backendType") ?: 0
        //             result.success(PrefrontalMNN.initialize(modelPath, threadNum, backendType))
        //         }
        //         "loadModel" -> {
        //             val configPath = call.argument<String>("configPath") ?: ""
        //             result.success(PrefrontalMNN.loadModel(configPath))
        //         }
        //         "generate" -> {
        //             val prompt = call.argument<String>("prompt") ?: ""
        //             result.success(PrefrontalMNN.generate(prompt))
        //         }
        //         "getModelInfo" -> result.success(PrefrontalMNN.getModelInfo())
        //         "isInitialized" -> result.success(PrefrontalMNN.isInitialized())
        //         "isModelLoaded" -> result.success(PrefrontalMNN.isModelLoaded())
        //         "release" -> { PrefrontalMNN.release(); result.success(null) }
        //         "startServer" -> {
        //             val port = call.argument<Int>("port") ?: 8080
        //             result.success(OpenAIServerManager.startServer(applicationContext, port))
        //         }
        //         "stopServer" -> { OpenAIServerManager.stopServer(); result.success(null) }
        //         "isServerRunning" -> result.success(OpenAIServerManager.isServerRunning())
        //         "getServerUrl" -> result.success(OpenAIServerManager.getServerUrl())
        //         "getApiKey" -> result.success(OpenAISServerManager.getApiKey())
        //         "setApiKey" -> { OpenAIServerManager.setApiKey(call.argument<String>("key") ?: ""); result.success(null) }
        //         "setServerAuthEnabled" -> { OpenAIServerManager.setAuthEnabled(call.argument<Boolean>("enabled") ?: true); result.success(null) }
        //         else -> result.notImplemented()
        //     }
        // }
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
    
    override fun onDestroy() {
        super.onDestroy()
        // PrefrontalMNN.release()  // MNN - commented out
        // OpenAIServerManager.stopServer()  // MNN - commented out
        litertEngine?.release()
        litertEngine = null
        ttsManager?.release()
        ttsManager = null
        pcmAudioRecorder?.release()
        pcmAudioRecorder = null
    }
}
