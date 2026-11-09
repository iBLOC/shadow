package com.ibloc.shadow

import android.content.Context
import android.content.Intent
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.accessibilityservice.AccessibilityServiceInfo
import android.view.accessibility.AccessibilityManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.android.FlutterView
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel
import com.ibloc.shadow.pcm.PcmAudioRecorder
import com.ibloc.shadow.tts.TtsManager
import com.ibloc.shadow.provision.BleProvisioningService
import com.ibloc.shadow.audio.UsbAudioRouter
import com.ibloc.shadow.device.DeviceDataBridge
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** 等无障碍服务连上的上限（毫秒）—— 真机实测系统重启服务约 1 秒。 */
private const val SERVICE_WAIT_TIMEOUT_MS = 3000L

/** 等无障碍服务连上时的轮询间隔（毫秒）。 */
private const val SERVICE_WAIT_POLL_MS = 100L

/** 无障碍这一层的日志 tag。 */
private const val A11Y_LOG_TAG = "ShadowA11y"

class MainActivity : FlutterActivity() {
    private val CHANNEL = "com.ibloc.shadow/mnn"
    private val A11Y_CHANNEL = "com.ibloc.shadow/accessibility"
    private val MDNS_CHANNEL = "com.ibloc.shadow/mdns"
    private val LOG_CHANNEL = "com.ibloc.shadow/mnn_logs"
    private val TTS_CHANNEL = "com.ibloc.shadow/tts"
    private val PCM_AUDIO_CHANNEL = "com.ibloc.shadow/pcm_audio"
    private val PCM_AUDIO_STREAM_CHANNEL = "com.ibloc.shadow/pcm_audio_stream"
    private val BLE_PROVISION_CHANNEL = "com.ibloc.shadow/ble_provision"
    private val USB_AUDIO_CHANNEL = "com.ibloc.shadow/usb_audio"
    private val ENCEPHALON_CHANNEL = "com.ibloc.shadow/encephalon_runtime"
    private val DEVICE_DATA_CHANNEL = "com.ibloc.shadow/device_data"
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    
    private var nsdManager: NsdManager? = null
    private val discoveredServices = ConcurrentHashMap<String, NsdServiceInfo>()
    
    private var ttsManager: TtsManager? = null
    private var pcmAudioRecorder: PcmAudioRecorder? = null
    private var usbAudioRouter: UsbAudioRouter? = null
    private var bleProvisioner: BleProvisioningService? = null

    // 设备数据桥（日历 / 联系人 / 短信 / 相册）——
    // ⚠️ 之所以留一个字段，是为了让 `onRequestPermissionsResult`
    // 能把**异步的权限申请结果**转回去（申请权限是弹窗，系统回调才到）。
    private var deviceDataBridge: DeviceDataBridge? = null

    /// 主线程的 handler —— 等无障碍服务**连上**时用它轮询。
    ///
    /// ⚠️ 必须是**主线程**：无障碍实例**只能在主线程访问**
    /// ⇒ ⇒ 而 MethodChannel 的 handler 本来就在主线程
    /// ⇒ ⇒ 轮询也回主线程 ⇒ ⇒ 既不阻塞、又守住了那条规矩。
    private val a11yWaitHandler = Handler(Looper.getMainLooper())

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        nsdManager = getSystemService(Context.NSD_SERVICE) as NsdManager
        pcmAudioRecorder = PcmAudioRecorder(this)
        usbAudioRouter = UsbAudioRouter(this)
        bleProvisioner = BleProvisioningService(this)

        setupAccessibilityChannel(flutterEngine)
        setupMdnsChannel(flutterEngine)
        setupLogcatChannel(flutterEngine)
        setupTtsChannel(flutterEngine)
        setupPcmAudioChannel(flutterEngine)
        setupEncephalonRuntimeChannel(flutterEngine)
        setupDeviceDataChannel(flutterEngine)
        setupBleProvisionChannel(flutterEngine)
        setupUsbAudioChannel(flutterEngine)
    }
    
    private fun setupAccessibilityChannel(flutterEngine: FlutterEngine) {
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, A11Y_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                // ⚠️⚠️ **「开关」与「连接」是两件事** —— 这里答的是**开关**。
                //
                // ⚠️ 为什么不能答「连接」：系统的无障碍服务**会被系统自己重启**
                // （真机实测：点按之后约 1 秒里 service 被 destroy 再 connected，
                // 进程没死 ⇒ ⇒ 不是 app 崩了）⇒ ⇒ 那 1 秒里 instance 是 null
                // ⇒ ⇒ 若这里答 instance != null ⇒ ⇒ 「用户在设置里开了没」
                // 这个问题的答案会**跟着系统抖** ⇒ ⇒ 调用方据此抛
                // 「请去系统设置里打开」⇒ ⇒ **报错说了一个假原因**
                // ⇒ ⇒ 模型会劝用户去动一个本来就是开的开关。
                "isEnabled" -> result.success(isAccessibilityServiceEnabledInSettings())
                // ⚠️ **连接态**（瞬时）—— 派发失败时用它区分「没派发出去」
                // 与「服务正在重启」⇒ ⇒ 报错要说**真因**。
                "isServiceConnected" -> result.success(PrefrontalAccessibilityService.instance != null)
                // ⚠️⚠️ **「现在能不能动手」** —— 与「isEnabled」（答「用户开没开」）
                // **不是同一件事** ⇒ ⇒ 判据必须**等得起**：
                // ⇒ ⇒ 真机实测：系统重启无障碍服务的那 1 秒里，**连「已启用列表」
                // 都是空的**（enabled=0 / matched=false）⇒ ⇒ 一读就下结论
                // ⇒ ⇒ 会把「系统正在重启它」说成「用户没开」⇒ ⇒ **假原因**。
                // ⇒ ⇒ ⇒ 所以这里**等服务连上**（≤3 秒）再答 ⇒ ⇒ 抗得住抖。
                "isReady" -> withAccessibilityService(result) { svc -> true }
                "openSettings" -> {
                    val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(intent)
                    result.success(null)
                }
                "tap" -> {
                    val x = (call.argument<Number>("x")?.toFloat()) ?: 0f
                    val y = (call.argument<Number>("y")?.toFloat()) ?: 0f
                    // ⚠️ **等服务连上**再派发 —— 系统重启服务的那 1 秒窗口里
                    // ⇒ ⇒ 直接派发只会拿到 false ⇒ ⇒ 白白让模型以为手势坏了。
                    withAccessibilityService(result) { svc -> svc.performTap(x, y) }
                }
                "longPress" -> {
                    val x = (call.argument<Number>("x")?.toFloat()) ?: 0f
                    val y = (call.argument<Number>("y")?.toFloat()) ?: 0f
                    // ⚠️ 同 tap ⇒ ⇒ 等服务连上再派发。
                    withAccessibilityService(result) { svc -> svc.performLongPress(x, y) }
                }
                "swipe" -> {
                    val x1 = (call.argument<Number>("x1")?.toFloat()) ?: 0f
                    val y1 = (call.argument<Number>("y1")?.toFloat()) ?: 0f
                    val x2 = (call.argument<Number>("x2")?.toFloat()) ?: 0f
                    val y2 = (call.argument<Number>("y2")?.toFloat()) ?: 0f
                    val d = (call.argument<Number>("durationMs")?.toLong()) ?: 300L
                    withAccessibilityService(result) { svc -> svc.performSwipe(x1, y1, x2, y2, d) }
                }
                "globalAction" -> {
                    val action = call.argument<String>("action") ?: "back"
                    // ⚠️ **六个动作都要认** —— Dart 侧的 GlobalAction 枚举列了
                    // back / home / recents / notifications / quick_settings / power_dialog
                    // ⇒ ⇒ 以前这里只认 back 与 home ⇒ ⇒ 其余**静悄悄地**变成了
                    // 「back」（模型要「最近任务」却收到两个「返回」—— 比失败更糟）。
                    // ⇒ ⇒ wire 名用 **snake_case**（与 Dart 侧显式对齐）。
                    val id = when (action) {
                        "back" -> android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK
                        "home" -> android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_HOME
                        "recents" -> android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_RECENTS
                        "notifications" -> android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS
                        "quick_settings" -> android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_QUICK_SETTINGS
                        "power_dialog" -> android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_POWER_DIALOG
                        else -> -1
                    }
                    if (id < 0) {
                        // ⚠️ 认不出来的动作 ⇒ **明确失败**，别静悄悄变成「返回」。
                        result.success(false)
                    } else {
                        withAccessibilityService(result) { svc -> svc.performGlobalActionById(id) }
                    }
                }
                "readScreen" -> {
                    // ⚠️ **读屏**（可访问性树）—— 只读，不碰任何输入。
                    //
                    // ⚠️ MethodChannel 的 handler 跑在**平台主线程**上 ⇒ ⇒
                    // 这里访问无障碍服务是安全的（见 android/AGENTS.md 那条
                    // 「无障碍实例只能在主线程访问」的规矩）。
                    //
                    // null = 服务没连上 / 没有可读的前台窗口 ⇒ ⇒ Dart 侧据此
                    // 报「无障碍服务未开启」，而不是回一段空白。
                    withAccessibilityService(result) { svc -> svc.readScreenContent() }
                }
                "getViewGeometry" -> {
                    // ⚠️ **自家窗口在屏幕上的原点** —— 自家 app 的语义树坐标是
                    // 「**本窗口**」的物理像素 ⇒ ⇒ 而手势派发用的是**整屏**
                    // 物理像素 ⇒ ⇒ 两者差一个窗口原点 ⇒ ⇒ 不知道它就没法
                    // 把自家窗口的坐标拿去点。
                    // ⚠️ **量**而不是算：窗口在屏幕上的位置取决于 edge-to-edge、
                    // 分屏、折叠屏、多屏 ⇒ ⇒ 算不出来 ⇒ ⇒ 只能量。
                    // ⚠️ 拿不到就回 **null** ⇒ ⇒ Dart 侧**不换算**
                    // ⇒ ⇒ 宁可换一个坐标口径，也不给一个错的偏移（错偏移会点歪）。
                    val origin = flutterViewOriginOnScreen()
                    if (origin == null) {
                        result.success(null)
                    } else {
                        result.success(
                            mapOf(
                                "originX" to origin[0].toDouble(),
                                "originY" to origin[1].toDouble()
                            )
                        )
                    }
                }
                "setDeviceActionsAllowed" -> {
                    // ⚠️ **把「手机操作」那一档推给原生侧** ⇒ ⇒
                    // 原生那两个平行面（HTTP `/api/mobile/action`、A2A 的
                    // `executeAction`）据此决定放不放行 ⇒ ⇒ 否则它们绕开闸。
                    //
                    // ⚠️ 认不出来 / 不是 true ⇒ ⇒ 按**拒绝**处理（fail-closed）。
                    DeviceActionGate.setAllowed(call.argument<Boolean>("allowed") == true)
                    result.success(true)
                }
                "findAndClickByText" -> withAccessibilityService(result) { svc -> svc.findAndClickByText(call.argument<String>("text") ?: "") }
                else -> result.notImplemented()
            }
        }
    }

    /**
     * 「用户在系统设置里开了本 app 的无障碍服务没有」—— **权威判据**。
     *
     * ⚠️ 为什么不用 `PrefrontalAccessibilityService.instance != null`：
     * 那是**连接态** ⇒ ⇒ 系统重启服务时会短暂为 false ⇒ ⇒ 用它当「开关」
     * ⇒ ⇒ 会在系统重启的那一秒里**误杀**一次调用 ⇒ ⇒ 而且报出来的是
     * 「请去系统设置里打开」—— **假原因**。
     */
    private fun isAccessibilityServiceEnabledInSettings(): Boolean {
        val manager = getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager
            ?: return false
        // ⚠️ **带参数的那个**自 API 29 起被弃用，但 minSdk=24 ⇒ ⇒ 只能用它
        // ⇒ ⇒ 那个弃用警告是**故意的**（无参数的版本 API 29 才有）。
        @Suppress("DEPRECATION")
        val enabled = manager.getEnabledAccessibilityServiceList(
            AccessibilityServiceInfo.FEEDBACK_ALL_MASK
        ) ?: return false
        val self = PrefrontalAccessibilityService::class.java.name
        val matched = enabled.any { info ->
            val si = info.resolveInfo?.serviceInfo
            si != null && si.packageName == packageName && si.name == self
        }
        // ⚠️ 读数落在**判定行**上 ⇒ ⇒ 真机上能直接看到「系统那边认不认我们」。
        AppLog.d(A11Y_LOG_TAG, "a11y switch: enabled=${enabled.size} self=$self matched=$matched")
        return matched
    }

    /**
     * 等无障碍服务**连上**，再派发动作。
     *
     * ⚠️ 为什么要有这一层：系统的无障碍服务**会被系统自己重启**
     * ⇒ ⇒ 重启那 1 秒里 `PrefrontalAccessibilityService.instance` 是 null
     * ⇒ ⇒ 直接派发只会拿到「没派发出去」⇒ ⇒ 而真因是「服务在重启」。
     *
     * ⚠️ **不能阻塞**：MethodChannel 的 handler 跑在**平台主线程**上
     * ⇒ ⇒ 而无障碍实例**只能在主线程访问** ⇒ ⇒ 所以用主线程的
     * `postDelayed` 轮询 ⇒ ⇒ 既不阻塞、又还在主线程上。
     *
     * @param timeoutMs 等多久；超时回 null（Dart 侧映射成 false / 读不到）。
     */
    private fun <T> withAccessibilityService(
        result: MethodChannel.Result,
        timeoutMs: Long = SERVICE_WAIT_TIMEOUT_MS,
        action: (PrefrontalAccessibilityService) -> T,
    ) {
        val deadline = SystemClock.uptimeMillis() + timeoutMs
        var waited = false
        fun attempt() {
            val svc = PrefrontalAccessibilityService.instance
            if (svc != null) {
                result.success(action(svc))
                return
            }
            if (SystemClock.uptimeMillis() >= deadline) {
                AppLog.d(
                    A11Y_LOG_TAG,
                    "accessibility service did not connect within ${timeoutMs}ms"
                )
                result.success(null)
                return
            }
            // ⚠️ **等得起** —— 真机实测：ART baseline profile 装完那一下，系统会把
            // ⇒ ⇒ 无障碍服务**重启一次** ⇒ ⇒ 那 1 秒里实例是 null
            // ⇒ ⇒ ⇒ 这里等它回来 ⇒ ⇒ 而不是「一读不到就报没开」。
            if (!waited) {
                waited = true
                AppLog.d(
                    A11Y_LOG_TAG,
                    "a11y service not connected yet — waiting for it to come back"
                )
            }
            a11yWaitHandler.postDelayed({ attempt() }, SERVICE_WAIT_POLL_MS)
        }
        attempt()
    }

    /**
     * FlutterView 在**屏幕**上的原点（物理像素）；找不到就 null。
     *
     * ⚠️ 为什么**量**而不是算：窗口在屏幕上的位置取决于 edge-to-edge、
     * 分屏、折叠屏、多屏 ⇒ ⇒ 算不出来 ⇒ ⇒ 只能量。
     */
    private fun flutterViewOriginOnScreen(): IntArray? {
        val decor = window?.decorView ?: return null
        val view = findFlutterView(decor) ?: return null
        val location = IntArray(2)
        view.getLocationOnScreen(location)
        return location
    }

    /**
     * 在视图树里**递归**找 FlutterView。
     *
     * ⚠️ 为什么递归：宿主把 FlutterView 放在**容器**里
     * ⇒ ⇒ 只看 decorView 的直接孩子会找不到。
     */
    private fun findFlutterView(view: View): View? {
        if (view is FlutterView) return view
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                findFlutterView(view.getChildAt(i))?.let { return it }
            }
        }
        return null
    }
    
    private fun setupLogcatChannel(flutterEngine: FlutterEngine) {
        EventChannel(flutterEngine.dartExecutor.binaryMessenger, LOG_CHANNEL).setStreamHandler(
            object : EventChannel.StreamHandler {
                // 原先这里起 `Runtime.exec("logcat …")` 回读自己的日志 ——
                // MIUI 对 app uid 的 logcat 是彻底封锁的（挂死且零输出），
                // 面板因此永远空白。现在订阅进程内的 AppLog（写入端抄送），
                // onListen 先回放存量再实时跟随。通道名沿用 `mnn_logs`
                // —— 两侧（Kotlin/Dart）约定一致即可，改名没有额外收益。
                override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                    AppLog.subscribe(replay = true) { entry ->
                        events?.success(entry)
                    }
                }

                override fun onCancel(arguments: Any?) {
                    AppLog.unsubscribe()
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

    /// 设备数据通道（`com.ibloc.shadow/device_data`）——
    ///
    /// 读日历 / 写日历 / 读联系人 / 读短信 / 读相册**元数据**。
    ///
    /// ⚠️ 桥自己**再查一遍**权限 —— Dart 说「有权限」不算数 ⇒ ⇒
    /// 原生这里才是真的那道门（Dart 侧逻辑出 bug 也拦得住）。
    ///
    /// ⚠️ 桥拿 `applicationContext`（内容查询不依赖 Activity 生命周期），
    /// 只有**申请权限**需要 Activity（系统弹窗要宿主 Activity）。
    private fun setupDeviceDataChannel(flutterEngine: FlutterEngine) {
        val bridge = DeviceDataBridge(applicationContext, this)
        deviceDataBridge = bridge
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, DEVICE_DATA_CHANNEL)
            .setMethodCallHandler { call, result ->
                bridge.handle(call, result)
            }
    }

    /// 系统权限申请的回调 —— **异步**的那一半。
    ///
    /// ⚠️ 申请权限要弹系统框，用户在别的界面上点 ⇒ ⇒ 原生那边必须等
    /// 这个回调才敢答复 Dart ⇒ ⇒ 没有它，`requestPermission` 会永远挂着。
    ///
    /// ⚠️ 桥按 requestCode 自己判断是不是它的（不是它的就原样放过）
    /// ⇒ ⇒ Flutter 插件那条回调链不受影响。
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        deviceDataBridge?.onRequestPermissionsResult(requestCode, grantResults)
    }

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
                                "healthy" to runtime.isHealthy(),
                                // ⚠️ 钥匙跟运行态一起回 —— isolate 重建后走「接管」
                                // 路径的新 isolate 没跑过 "start"（大脑一直在跑），
                                // 客户端的 X-Shadow-Key / X-Admin-Token 只能从
                                // 这里拿。getOrCreate 幂等：同一份，端脑守门、
                                // 客户端敲门（安全语义见 "start" 分支注释）。
                                "shadowKey" to ShadowKey.getOrCreate(filesDir),
                                "adminToken" to AdminKey.getOrCreate(filesDir)
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
        ttsManager?.release()
        ttsManager = null
        pcmAudioRecorder?.release()
        pcmAudioRecorder = null
    }
}
