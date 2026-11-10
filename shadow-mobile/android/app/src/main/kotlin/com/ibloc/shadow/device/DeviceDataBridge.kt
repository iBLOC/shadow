package com.ibloc.shadow.device

import android.Manifest
import android.app.Activity
import android.content.ContentResolver
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.database.Cursor
import android.os.Build
import android.os.Handler
import android.net.Uri
import android.os.Looper
import android.provider.BaseColumns
import android.provider.CalendarContract
import android.provider.ContactsContract
import android.provider.MediaStore
import android.provider.Settings
import android.provider.Telephony
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.ibloc.shadow.AppLog
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.util.TimeZone
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

private const val TAG = "DeviceDataBridge"

/// 错误码 —— Dart 侧按**字符串**匹配（见 `lib/services/capabilities/device_data_channel.dart`）。
/// ⇒ ⇒ 改这里等于改 Dart 侧的判断，两边必须一起改。
private const val ERROR_PERMISSION_DENIED = "PERMISSION_DENIED"
private const val ERROR_DEVICE_DATA = "DEVICE_DATA_ERROR"

/// 默认条数与上限。
/// 为什么要有上限：Dart 侧是可以随便传 limit 的，而「把整本通讯录搬进模型上下文」
/// 既慢又贵 ⇒ 宁可**少给几条**，也不让一次调用把上下文撑爆。
private const val DEFAULT_LIMIT = 50
private const val MAX_LIMIT = 500

/// 进程级的 IO 作用域。
///
/// 为什么不挂在 Activity 上：这些调用都是**短平快的 provider 查询**，
/// 而 Activity 的生命周期比它们长得多 ⇒ 挂上去反而要处理「Activity 没了、
/// 结果还没回」这种半截状态。进程级作用域 + 单次调用一个 Job 最省事。
private val deviceDataScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

/// 能力枚举 —— wire 名必须与 Dart 侧 `capability.dart` 的枚举值**一字不差**
/// （calendar_read / calendar_write / contacts / sms / photos）。
private enum class Capability(val wire: String) {
    CALENDAR_READ("calendar_read"),
    CALENDAR_WRITE("calendar_write"),
    CONTACTS("contacts"),
    SMS("sms"),
    PHOTOS("photos");

    companion object {
        fun fromWire(value: String?): Capability? = values().firstOrNull { it.wire == value }
    }
}

/// 一次调用的结果 —— 只有两种终态：**成功** 或 **失败**。
/// 做成类型而不是裸的 Result，是为了让「恰好一次交付」这件事在类型上说得通。
private sealed class Outcome {
    data class Ok(val value: Any?) : Outcome()
    data class Err(val code: String, val message: String?, val details: Any?) : Outcome()
}

/// 只允许交付一次的结果包装器。
///
/// 为什么需要它：Flutter 的 `MethodChannel.Result` **只能调用一次**
/// （二次调用会抛 IllegalStateException，或者消息被静默丢掉）——
/// 而我们这条链路上「抛异常」和「回错误」都可能发生 ⇒ 必须有一道
/// 「只算第一次」的闸，否则极端情况下会出现两个终态。
private class SingleReply(private val delegate: MethodChannel.Result) : MethodChannel.Result {
    private val delivered = AtomicBoolean(false)

    override fun success(result: Any?) {
        once { delegate.success(result) }
    }

    override fun error(errorCode: String, errorMessage: String?, errorDetails: Any?) {
        once { delegate.error(errorCode, errorMessage, errorDetails) }
    }

    override fun notImplemented() {
        once { delegate.notImplemented() }
    }

    private inline fun once(block: () -> Unit) {
        if (delivered.compareAndSet(false, true)) {
            block()
        } else {
            AppLog.w(TAG, "结果已经交付过了，丢弃这次重复的回调")
        }
    }
}

/// **设备数据桥** —— Dart 侧 `com.ibloc.shadow/device_data` 通道的原生实现。
///
/// ## 它做什么
/// 把「读日历 / 写日历 / 读通讯录 / 读短信 / 读相册**元数据**」这几件事
/// 在 Kotlin 侧执行，再按契约的形状把数据搬回 Dart。
///
/// ## 为什么权限检查要在这里**再做一遍**（本文件最重要的一件事）
/// Dart 侧也会查权限，但**原生这道门才是真的**：Dart 说「有权限」不算数，
/// 原生这里没有权限就是拒绝 ⇒ 万一 Dart 侧的判断逻辑出 bug，
/// 数据依然出不去 ⇒ **fail-closed**。
/// ⇒ 因此每个方法都在**碰 content provider 的前一刻**查权限，
/// 缺权限 ⇒ 立刻 `PERMISSION_DENIED` 且**不去碰 provider**。
///
/// ## 线程
/// provider 查询是阻塞 I/O ⇒ 全部丢到 `Dispatchers.IO`；
/// 结果回到 **platform 主线程**再交付（Flutter 的 `MethodChannel.Result`
/// 底层是 `BinaryMessenger.send`，官方标注 `@UiThread`）。
class DeviceDataBridge(
    private val context: Context,
    private val activity: Activity,
) {

    /// 正在等系统回调的那一次权限申请。
    ///
    /// 为什么要有它：系统权限弹窗是**异步**的 ⇒ MethodChannel 的 Result
    /// 不能在 requestPermission 里就答掉 ⇒ 必须先把它存下来，
    /// 等 Activity 把 `onRequestPermissionsResult` 转回来时再答。
    ///
    /// ⚠️ 为什么要把**这次申请的几件事**一起存着（而不是只存 Result）：
    /// 「系统框到底弹了没有」这个事实**只能在请求发出之前**算出来
    /// ⇒ ⇒ 事后（回调里）再问系统就晚了（那时状态已经被这次拒绝改掉了）
    /// ⇒ ⇒ 所以 [willShowDialog] 必须在**发请求之前**取好、带进来。
    private class PendingPermission(
        val reply: SingleReply,
        /// 回**详细结果**（Map）还是回**一个布尔**（旧契约）。
        val detailed: Boolean,
        /// 这次请求**会不会**真的弹出系统框。
        ///
        /// ⚠️ 「会不会弹」与「批没批」是**两件事**：
        /// - 批了 ⇒ ⇒ 系统框出现过，用户点了允许；
        /// - 没批 ⇒ ⇒ 可能是用户点了拒绝（框出现过），
        ///   也可能是系统**拒绝再弹**（框压根没出现 ⇒ 只能去设置页）。
        /// ⇒ ⇒ 不区分这两者 ⇒ ⇒ 用户点了拒绝，我们却把他送去系统设置页。
        val willShowDialog: Boolean,
    )

    @Volatile
    private var pendingPermission: PendingPermission? = null

    /// 「这个能力**问过没有**」的落盘标记。
    ///
    /// ⚠️ 为什么需要它 —— 这是「弹不出框」与「还没问过」的**唯一**分界：
    /// Android 的 `shouldShowRequestPermissionRationale` 在这两种情况下
    /// **都返回 false**（前者是「没问过」，后者是「被永久拒绝」）
    /// ⇒ ⇒ 不自己记一份「问过没有」，就分不清该弹窗还是该跳设置页。
    ///
    /// ⚠️ 为什么它必须是**落盘**的而不是内存的：
    /// 「问过没有」这件事在**进程重启后依然成立**
    /// ⇒ ⇒ 内存版一重启就忘 ⇒ ⇒ 又变成「当成没问过」⇒ ⇒ 弹一个**永远弹不出来**的框。
    private val permissionPrefs: SharedPreferences by lazy {
        context.getSharedPreferences("device_data_permission_asked", Context.MODE_PRIVATE)
    }

    /// 「这个能力问过没有」的落盘键。
    private fun askedKey(capability: Capability): String = "asked_${capability.wire}"

    /// 通道入口 —— 接线方（MainActivity）把 `MethodChannel` 的 handler 指向这里。
    ///
    /// 约定：
    /// - **绝不把异常抛给调用方**：所有异常都兜成 `DEVICE_DATA_ERROR`；
    /// - **只回一次**结果（见 `SingleReply`）；
    /// - 参数全部来自 `Map<String, Any?>`，缺参数 ⇒ 回错误而不是崩。
    fun handle(call: MethodCall, result: MethodChannel.Result) {
        // 权限申请**不走 IO 协程** —— 它的结果要等系统的弹窗回来（可能几秒），
        // 所以必须在原路上把 Result 存起来，而不是在协程里干等。
        if (call.method == "requestPermission") {
            requestPermission(call, result)
            return
        }
        // ⚠️ 详细版 —— 除了「批没批」，还要回「系统框到底弹了没有」
        // ⇒ ⇒ 设置页据此决定「就地弹窗」还是「退到系统设置页」。
        if (call.method == "requestPermissionDetailed") {
            requestPermissionDetailed(call, result)
            return
        }
        // 打开系统权限页同样是**主线程**的事（要启 Activity）⇒ ⇒ 也不进 IO 协程。
        if (call.method == "openAppSettings") {
            openAppSettings(result)
            return
        }
        val reply = SingleReply(result)
        val args = call.arguments as? Map<*, *>
        deviceDataScope.launch {
            val outcome = try {
                dispatch(call.method, args)
            } catch (e: Exception) {
                AppLog.e(TAG, "设备数据调用失败：${call.method}", e)
                Outcome.Err(ERROR_DEVICE_DATA, e.message, null)
            }
            deliver(reply, outcome)
        }
    }

    /// 打开**本 App**的系统权限页。
    ///
    /// ⚠️ 为什么是 App 详情页而不是「逐个权限」的设置页：
    /// 那些页面一个权限一个权限，用户得自己找哪个是哪个
    /// ⇒ ⇒ 这里直接打开本 App 的详情页 —— 那里一眼能看到所有权限的开关。
    ///
    /// ⚠️ 界面上写着「系统权限未授予」⇒ ⇒ 用户得有个**一键**去授的入口
    /// ⇒ ⇒ 否则那句话只是把人卡在那儿。
    ///
    /// ⚠️ 必须走**主线程**（Intent 的启动在 UI 线程）⇒ ⇒ 不进 IO 协程。
    private fun openAppSettings(result: MethodChannel.Result) {
        val reply = SingleReply(result)
        try {
            val intent = Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", context.packageName, null),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.startActivity(intent)
            postToMain { reply.success(true) }
        } catch (e: Exception) {
            AppLog.e(TAG, "打开系统权限页失败", e)
            postToMain { reply.success(false) }
        }
    }

    /// 申请权限 —— **按能力**申请（不是按权限字符串）。
    ///
    /// 为什么不接收权限字符串：Dart 侧只认能力名（calendar_read / contacts / …），
    /// 「这个能力在 Android 上要哪几个权限」是**平台侧的知识** ⇒ 放在这个文件的
    /// `requiredPermissions` 里 —— Dart 侧不该有第二份映射，否则 iOS 端口
    /// 还得再写一份，两边迟早漂移。
    ///
    /// ⚠️ 日历**读**与**写**在这里是两个独立的能力 ⇒ 用户点「允许读日历」
    /// 不会顺带拿到「允许写日历」—— 这正是绕开 permission_handler 的理由
    /// （它的 calendarFullAccess 把读和写捆在一起）。
    private fun requestPermission(call: MethodCall, result: MethodChannel.Result) {
        requestPermissionInternal(call, result, detailed = false)
    }

    /// **详细版**的权限申请 —— 除了「批没批」，还回「系统框到底弹了没有」。
    ///
    /// ⚠️ 为什么要分两档（而不是把旧的也改成回 Map）：
    /// 聊天流那条路只需要一个布尔（批没批）⇒ ⇒ 契约越窄越不容易漂；
    /// 而设置页那条路需要知道「弹不出来」⇒ ⇒ 才能决定要不要退到系统设置页。
    private fun requestPermissionDetailed(call: MethodCall, result: MethodChannel.Result) {
        requestPermissionInternal(call, result, detailed = true)
    }

    /// 权限申请的**共同实现**。
    ///
    /// ⚠️ **核心**：在**发请求之前**就把「这次会不会真的弹框」算出来
    /// ⇒ ⇒ 因为事后（回调里）再问系统就晚了 ——
    /// 用户这一次的拒绝**已经**把系统的状态改了
    /// ⇒ ⇒ 事后算出来的「会不会弹」是**下一次**的答案，不是这一次的。
    private fun requestPermissionInternal(
        call: MethodCall,
        result: MethodChannel.Result,
        detailed: Boolean,
    ) {
        val reply = SingleReply(result)
        val capability = Capability.fromWire(argString(call.arguments as? Map<*, *>, "capability"))
        if (capability == null) {
            // 未知/缺失的能力 ⇒ fail-closed（当没给），不抛。
            AppLog.w(TAG, "requestPermission：未知的能力")
            postToMain {
                reply.success(
                    permissionOutcome(detailed, granted = false, dialogShown = false, permanentlyDenied = false),
                )
            }
            return
        }

        val perms = requiredPermissions(capability)
        if (perms.all { isGranted(it) }) {
            // 已经全有了 ⇒ 不用弹窗，直接 true。
            postToMain {
                reply.success(
                    permissionOutcome(detailed, granted = true, dialogShown = false, permanentlyDenied = false),
                )
            }
            return
        }

        // 上一次还没回来 ⇒ 先把它结掉（那个请求被顶掉了）—— **不许丢结果**，
        // 否则 Dart 侧那个 await 会永远悬着。
        val superseded = pendingPermission
        pendingPermission = null
        if (superseded != null) {
            AppLog.w(TAG, "requestPermission：上一次请求被顶掉了，先回 false")
            postToMain {
                superseded.reply.success(
                    permissionOutcome(
                        superseded.detailed,
                        granted = false,
                        dialogShown = false,
                        permanentlyDenied = false,
                        // ⚠️ **顶掉了** ⇒ ⇒ 这一次的系统框压根没出现，
                        // 但那**不是**「系统拒绝再弹」⇒ ⇒ 界面不该退到设置页
                        // ⇒ ⇒ 必须单独标出来，否则用户会被莫名送去系统设置。
                        superseded = true,
                    ),
                )
            }
        }

        // ⚠️ **「问过没有」要在请求发出之前就落盘** ⇒ ⇒ 用户点拒绝**也算**问过
        // ⇒ ⇒ 这是区分「从没问过（还能弹）」与「永久拒绝（弹不出来）」的唯一依据。
        val askedBefore = permissionPrefs.getBoolean(askedKey(capability), false)
        permissionPrefs.edit().putBoolean(askedKey(capability), true).apply()

        // ⚠️ **会不会弹框** —— 在**发请求之前**判定（理由见上面的注释）。
        // - 从没问过 ⇒ ⇒ 第一次请求**一定**会弹（哪怕 shouldShowRationale 是 false）；
        // - 问过 ⇒ ⇒ 只有系统还愿意弹（shouldShowRationale == true）才会弹。
        val willShowDialog = !askedBefore || perms.any {
            ActivityCompat.shouldShowRequestPermissionRationale(activity, it)
        }

        val pending = PendingPermission(reply, detailed, willShowDialog)
        pendingPermission = pending
        AppLog.i(TAG, "requestPermission：申请 ${perms.joinToString(", ")}（会弹框=${willShowDialog}）")

        // requestPermissions 必须在主线程调。
        postToMain {
            try {
                ActivityCompat.requestPermissions(activity, perms.toTypedArray(), REQUEST_CODE)
            } catch (e: Exception) {
                AppLog.e(TAG, "requestPermissions 失败", e)
                // 只清**自己**那一格 —— 别把后来那次请求的结果也端走。
                if (pendingPermission === pending) {
                    pendingPermission = null
                }
                // SingleReply 保证只答一次（顶掉时已经答过 false 了）。
                reply.success(
                    permissionOutcome(detailed, granted = false, dialogShown = false, permanentlyDenied = false),
                )
            }
        }
    }

    /// 一次权限申请的**结果** —— 按契约回布尔还是回 Map。
    ///
    /// ⚠️ 为什么把两种形状收在一个函数里 ⇒ ⇒ 保证「哪条路回什么」
    /// 只有**一个**事实来源 ⇒ ⇒ 不会两处漂移。
    private fun permissionOutcome(
        detailed: Boolean,
        granted: Boolean,
        dialogShown: Boolean,
        permanentlyDenied: Boolean,
        superseded: Boolean = false,
    ): Any = if (detailed) {
        mapOf(
            "granted" to granted,
            "dialogShown" to dialogShown,
            "permanentlyDenied" to permanentlyDenied,
            "superseded" to superseded,
        )
    } else {
        granted
    }

    /// Activity 把系统的权限回调转发过来 —— **只有我们的 requestCode 才处理**。
    ///
    /// @return true = 这个回调是我的（Activity 据此决定要不要继续往下传）。
    fun onRequestPermissionsResult(requestCode: Int, grantResults: IntArray): Boolean {
        if (requestCode != REQUEST_CODE) {
            return false
        }
        // 先清再答 ⇒ 保证「只答一次」。
        val pending = pendingPermission
        pendingPermission = null
        if (pending == null) {
            AppLog.w(TAG, "onRequestPermissionsResult：没有等着的结果，丢弃")
            return true
        }
        val granted = grantResults.isNotEmpty() &&
            grantResults.all { it == PackageManager.PERMISSION_GRANTED }
        // ⚠️ **永久拒绝**的判定 —— 只在「压根没弹框」时才成立：
        // 系统愿意弹框却没批 ⇒ ⇒ 那是用户点了拒绝 ⇒ ⇒ 下次**还能**弹
        // ⇒ ⇒ 只有系统**拒绝再弹**时，才只能退到系统设置页。
        val permanentlyDenied = !granted && !pending.willShowDialog
        postToMain {
            pending.reply.success(
                permissionOutcome(
                    pending.detailed,
                    granted = granted,
                    dialogShown = pending.willShowDialog,
                    permanentlyDenied = permanentlyDenied,
                ),
            )
        }
        return true
    }

    /// 方法分发 —— 未知方法也算**失败**（而不是 `notImplemented`）：
    /// 这个通道是 App 私有的，"不认识的方法" 只可能是**调用方的 bug**，
    /// 回一个带人话的 error 比回 MissingPluginException 好定位得多。
    private fun dispatch(method: String, args: Map<*, *>?): Outcome = when (method) {
        "hasPermission" -> Outcome.Ok(hasOsPermission(args))
        "readCalendar" -> readCalendar(args)
        "writeCalendar" -> writeCalendar(args)
        "readContacts" -> readContacts(args)
        "readSms" -> readSms(args)
        "readPhotos" -> readPhotos(args)
        else -> {
            AppLog.w(TAG, "未知的方法：$method")
            Outcome.Err(ERROR_DEVICE_DATA, "Unsupported method: $method", null)
        }
    }

    /// 终态交付 —— 统一切到 platform 主线程。
    private fun deliver(reply: SingleReply, outcome: Outcome) {
        postToMain {
            when (outcome) {
                is Outcome.Ok -> reply.success(outcome.value)
                is Outcome.Err -> reply.error(outcome.code, outcome.message, outcome.details)
            }
        }
    }

    /// 交付到 platform 主线程 —— Flutter 的 `MethodChannel.Result` 底层是
    /// `BinaryMessenger.send`（官方标注 `@UiThread`）⇒ 回哪儿都行，
    /// 但**必须**在主线程回。
    private fun postToMain(block: () -> Unit) {
        Handler(Looper.getMainLooper()).post(block)
    }

    // ─────────────────────────────────────────────────────────────
    // 权限
    // ─────────────────────────────────────────────────────────────

    /// 能力 → 需要的系统权限。
    ///
    /// - 日历**读**只要 READ_CALENDAR；
    /// - 日历**写**要 WRITE_CALENDAR，**外加** READ_CALENDAR
    ///   （写的时候要查 CalendarContract.Calendars 找可写日历）；
    /// - 相册在 API 33（TIRAMISU）起换成了 READ_MEDIA_IMAGES，
    ///   之前是 READ_EXTERNAL_STORAGE ⇒ 必须按 SDK 版本分支，
    ///   否则新系统上会永远「查不到权限」。
    private fun requiredPermissions(capability: Capability): List<String> = when (capability) {
        Capability.CALENDAR_READ -> listOf(Manifest.permission.READ_CALENDAR)
        Capability.CALENDAR_WRITE -> listOf(
            Manifest.permission.WRITE_CALENDAR,
            // 写也要能**读** —— 因为要查 CalendarContract.Calendars 找可写日历。
            Manifest.permission.READ_CALENDAR,
        )
        Capability.CONTACTS -> listOf(Manifest.permission.READ_CONTACTS)
        Capability.SMS -> listOf(Manifest.permission.READ_SMS)
        Capability.PHOTOS ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                listOf(Manifest.permission.READ_MEDIA_IMAGES)
            } else {
                listOf(Manifest.permission.READ_EXTERNAL_STORAGE)
            }
    }

    private fun isGranted(permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    /// 返回 null = 放行；非 null = 人话版的「缺哪个权限」。
    private fun missingPermission(capability: Capability): String? {
        val missing = requiredPermissions(capability).filterNot { isGranted(it) }
        if (missing.isEmpty()) return null
        val names = missing.joinToString(", ") { it.substringAfterLast('.') }
        return "缺少系统权限：$names（能力 ${capability.wire}）"
    }

    /// `hasPermission` —— 只读，**不弹窗**（弹窗是 Dart/UI 层的事）。
    ///
    /// 未知能力 ⇒ 返回 false（fail-closed）：不认识的权限组合一律当「没有」。
    private fun hasOsPermission(args: Map<*, *>?): Boolean {
        val capability = Capability.fromWire(argString(args, "capability")) ?: run {
            AppLog.w(TAG, "未知的能力：${argString(args, "capability")}")
            return false
        }
        return missingPermission(capability) == null
    }

    // ─────────────────────────────────────────────────────────────
    // 日历
    // ─────────────────────────────────────────────────────────────

    /// 读日历 —— 时间窗 `[startMs, endMs)` 内的事件。
    ///
    /// 用 `CalendarContract.Instances` 而不是 `Events`：Instances 是**展开后**的视图
    /// ⇒ 重复事件在窗内会出现多次（每次一条 occurrence），这才是用户看到的样子。
    /// 排序固定按开始时间**升序**（同一条调用里始终一致）。
    private fun readCalendar(args: Map<*, *>?): Outcome {
        val startMs = argLong(args, "startMs")
            ?: return Outcome.Err(ERROR_DEVICE_DATA, "缺少参数：startMs", null)
        val endMs = argLong(args, "endMs")
            ?: return Outcome.Err(ERROR_DEVICE_DATA, "缺少参数：endMs", null)
        if (endMs < startMs) {
            return Outcome.Err(ERROR_DEVICE_DATA, "endMs 不能早于 startMs", null)
        }
        val limit = normalizedLimit(argInt(args, "limit"))

        // 权限检查 —— 放在**真的要查 provider 的前一刻**，中间不做任何 provider 访问。
        val denied = missingPermission(Capability.CALENDAR_READ)
        if (denied != null) {
            AppLog.w(TAG, "readCalendar 被拒：$denied")
            return Outcome.Err(ERROR_PERMISSION_DENIED, denied, null)
        }

        val projection = arrayOf(
            CalendarContract.Instances.EVENT_ID,
            CalendarContract.Events.TITLE,
            CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.END,
            CalendarContract.Events.ALL_DAY,
            CalendarContract.Events.DESCRIPTION,
            CalendarContract.Events.EVENT_LOCATION,
            CalendarContract.Events.CALENDAR_DISPLAY_NAME,
        )

        val out = ArrayList<Map<String, Any?>>()
        val cursor: Cursor? = CalendarContract.Instances.query(
            context.contentResolver,
            projection,
            startMs,
            endMs,
            "${CalendarContract.Instances.BEGIN} ASC",
        )
        cursor?.use { c ->
            val idIdx = c.getColumnIndexOrThrow(CalendarContract.Instances.EVENT_ID)
            val titleIdx = c.getColumnIndexOrThrow(CalendarContract.Events.TITLE)
            val beginIdx = c.getColumnIndexOrThrow(CalendarContract.Instances.BEGIN)
            val endIdx = c.getColumnIndexOrThrow(CalendarContract.Instances.END)
            val allDayIdx = c.getColumnIndex(CalendarContract.Events.ALL_DAY)
            val descIdx = c.getColumnIndex(CalendarContract.Events.DESCRIPTION)
            val locIdx = c.getColumnIndex(CalendarContract.Events.EVENT_LOCATION)
            val calIdx = c.getColumnIndex(CalendarContract.Events.CALENDAR_DISPLAY_NAME)

            while (c.moveToNext() && out.size < limit) {
                val allDay = allDayIdx >= 0 && !c.isNull(allDayIdx) && c.getInt(allDayIdx) == 1
                out.add(
                    mapOf(
                        // event_id（不是 instance 的 _ID）—— 因为 writeCalendar 的
                        // eventId 指的是**事件**，两边必须能对上。
                        "id" to c.getLong(idIdx).toString(),
                        "title" to c.getStringOrEmpty(titleIdx),
                        "startMs" to c.getLong(beginIdx),
                        "endMs" to c.getLong(endIdx),
                        "location" to c.getStringOrNull(locIdx),
                        "description" to c.getStringOrNull(descIdx),
                        "allDay" to allDay,
                        "calendar" to c.getStringOrNull(calIdx),
                    )
                )
            }
        }
        AppLog.i(TAG, "readCalendar：${out.size} 条事件")
        return Outcome.Ok(out)
    }

    /// 写日历 —— `eventId` 为空 ⇒ 新建；不为空 ⇒ 改那一条。
    ///
    /// ⚠️ 写入的 event 来自 `readCalendar` 的话，**重复事件的 id 是同一个**
    /// ⇒ 改它会改掉整个系列（这是 `CalendarContract` 的语义，不是我们能绕开的）。
    ///
    /// 写入一律按**带时刻**的事件处理（接口里没有 allDay 参数）。
    private fun writeCalendar(args: Map<*, *>?): Outcome {
        val title = argString(args, "title")
            ?: return Outcome.Err(ERROR_DEVICE_DATA, "缺少参数：title", null)
        val startMs = argLong(args, "startMs")
            ?: return Outcome.Err(ERROR_DEVICE_DATA, "缺少参数：startMs", null)
        val endMs = argLong(args, "endMs")
            ?: return Outcome.Err(ERROR_DEVICE_DATA, "缺少参数：endMs", null)
        if (endMs < startMs) {
            return Outcome.Err(ERROR_DEVICE_DATA, "endMs 不能早于 startMs", null)
        }
        val description = argString(args, "description")
        val location = argString(args, "location")
        val eventId = argString(args, "eventId")

        val denied = missingPermission(Capability.CALENDAR_WRITE)
        if (denied != null) {
            AppLog.w(TAG, "writeCalendar 被拒：$denied")
            return Outcome.Err(ERROR_PERMISSION_DENIED, denied, null)
        }

        val resolver = context.contentResolver
        val zone = TimeZone.getDefault().id
        val values = ContentValues().apply {
            put(CalendarContract.Events.TITLE, title)
            put(CalendarContract.Events.DTSTART, startMs)
            put(CalendarContract.Events.DTEND, endMs)
            put(CalendarContract.Events.ALL_DAY, 0)
            // 时区必须给 —— provider 靠它把毫秒换算到墙上时间。
            put(CalendarContract.Events.EVENT_TIMEZONE, zone)
            put(CalendarContract.Events.EVENT_END_TIMEZONE, zone)
            if (description != null) put(CalendarContract.Events.DESCRIPTION, description)
            if (location != null) put(CalendarContract.Events.EVENT_LOCATION, location)
        }

        val resolvedId: String
        if (eventId == null) {
            // 新建 ⇒ 必须先挑一个**可写**的日历，否则 provider 会直接拒绝。
            val calendarId = pickWritableCalendarId(resolver)
                ?: return Outcome.Err(ERROR_DEVICE_DATA, "没有找到可写的日历", null)
            values.put(CalendarContract.Events.CALENDAR_ID, calendarId)
            val uri = resolver.insert(CalendarContract.Events.CONTENT_URI, values)
                ?: return Outcome.Err(ERROR_DEVICE_DATA, "写入日历失败：provider 没返回 uri", null)
            resolvedId = uri.lastPathSegment
                ?: return Outcome.Err(ERROR_DEVICE_DATA, "写入日历失败：uri 里没有 id", null)
        } else {
            val numericId = eventId.toLongOrNull()
                ?: return Outcome.Err(ERROR_DEVICE_DATA, "eventId 不是数字：$eventId", null)
            val updated = resolver.update(
                ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, numericId),
                values,
                null,
                null,
            )
            if (updated <= 0) {
                return Outcome.Err(ERROR_DEVICE_DATA, "没有这条事件：$eventId", null)
            }
            resolvedId = eventId
        }

        AppLog.i(TAG, "writeCalendar：$resolvedId")
        return Outcome.Ok(
            mapOf(
                "id" to resolvedId,
                "title" to title,
                "startMs" to startMs,
                "endMs" to endMs,
                "description" to description,
                "location" to location,
                "allDay" to false,
            )
        )
    }

    /// 挑一个**可写**的日历。
    ///
    /// 为什么不能随手挑：日历有访问级别（READ / FREEBUSY / CONTRIBUTOR / EDITOR / OWNER），
    /// 只有 >= CONTRIBUTOR 的才写得动 ⇒ 先按 VISIBLE=1 且访问级别 >= CONTRIBUTOR 过滤，
    /// 再优先 IS_PRIMARY（用户自己的那个），其次按名字排。
    ///
    /// ⚠️ `IS_DEFAULT` 不是公开 API（被 @hide 了）⇒ 这里只用公开的 `IS_PRIMARY`。
    private fun pickWritableCalendarId(resolver: ContentResolver): Long? {
        val projection = arrayOf(
            BaseColumns._ID,
            CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
            CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL,
            CalendarContract.Calendars.IS_PRIMARY,
        )
        val selection =
            "${CalendarContract.Calendars.VISIBLE} = 1 AND " +
                "${CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL} >= ?"
        val selectionArgs = arrayOf(CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR.toString())
        val sortOrder =
            "${CalendarContract.Calendars.IS_PRIMARY} DESC, " +
                "${CalendarContract.Calendars.CALENDAR_DISPLAY_NAME} ASC"

        val cursor = resolver.query(
            CalendarContract.Calendars.CONTENT_URI,
            projection,
            selection,
            selectionArgs,
            sortOrder,
        )
        cursor?.use { c ->
            if (c.moveToFirst()) {
                return c.getLong(c.getColumnIndexOrThrow(BaseColumns._ID))
            }
        }
        AppLog.w(TAG, "设备上没有可写的日历（VISIBLE=1 且访问级别 >= CONTRIBUTOR）")
        return null
    }

    // ─────────────────────────────────────────────────────────────
    // 通讯录
    // ─────────────────────────────────────────────────────────────

    /// 读通讯录 —— 可带一个**不区分大小写**的名字过滤词。
    ///
    /// 两次查询：
    /// 1. `Contacts` 拿「有哪些联系人 + 显示名」；
    /// 2. `Phone` 拿「每个联系人有哪些号码」。
    /// ⇒ 分组后一个联系人对应一组号码。
    ///
    /// 为什么不用一次查询搞定：一次查询只能从 `Phone` 出发 ⇒ **没有号码的联系人会整条丢失**。
    /// 通讯录里「有名字没号码」的人不少（公司名片、家属），那也是用户的数据。
    private fun readContacts(args: Map<*, *>?): Outcome {
        val query = argString(args, "query")?.trim()
        val limit = normalizedLimit(argInt(args, "limit"))

        val denied = missingPermission(Capability.CONTACTS)
        if (denied != null) {
            AppLog.w(TAG, "readContacts 被拒：$denied")
            return Outcome.Err(ERROR_PERMISSION_DENIED, denied, null)
        }

        val resolver = context.contentResolver

        // 1) 联系人 + 显示名
        val contactsProjection = arrayOf(
            BaseColumns._ID,
            ContactsContract.Contacts.DISPLAY_NAME_PRIMARY,
        )
        val selection: String?
        val selectionArgs: Array<String>?
        if (query.isNullOrEmpty()) {
            selection = null
            selectionArgs = null
        } else {
            // SQL 侧先粗筛（LIKE 对 ASCII 不区分大小写），
            // Kotlin 侧再精确判一次（含 Unicode）⇒ 两边都要。
            selection =
                "${ContactsContract.Contacts.DISPLAY_NAME_PRIMARY} LIKE ? ESCAPE '\\'"
            selectionArgs = arrayOf("%${escapeLike(query)}%")
        }

        val ids = ArrayList<Long>()
        val names = HashMap<Long, String>()
        val contactCursor = resolver.query(
            ContactsContract.Contacts.CONTENT_URI,
            contactsProjection,
            selection,
            selectionArgs,
            null,
        )
        contactCursor?.use { c ->
            val idIdx = c.getColumnIndexOrThrow(BaseColumns._ID)
            val nameIdx = c.getColumnIndex(ContactsContract.Contacts.DISPLAY_NAME_PRIMARY)
            while (c.moveToNext()) {
                val id = c.getLong(idIdx)
                val name = c.getStringOrNull(nameIdx).orEmpty()
                if (!query.isNullOrEmpty() && !name.contains(query, ignoreCase = true)) {
                    continue
                }
                ids.add(id)
                names[id] = name
            }
        }

        // 2) 号码 —— 按 contact id 归堆
        val phones = HashMap<Long, MutableList<String>>()
        val phoneCursor = resolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(
                ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                ContactsContract.CommonDataKinds.Phone.NUMBER,
            ),
            null,
            null,
            null,
        )
        phoneCursor?.use { c ->
            val contactIdx = c.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.CONTACT_ID)
            val numberIdx = c.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER)
            while (c.moveToNext()) {
                val contactId = c.getLong(contactIdx)
                val number = c.getStringOrNull(numberIdx)?.trim()
                if (number.isNullOrEmpty()) continue
                val bucket = phones.getOrPut(contactId) { ArrayList() }
                if (!bucket.contains(number)) bucket.add(number)
            }
        }

        val out = ArrayList<Map<String, Any?>>()
        for (id in ids) {
            if (out.size >= limit) break
            out.add(
                mapOf(
                    "id" to id.toString(),
                    "name" to (names[id] ?: ""),
                    "phones" to (phones[id] ?: emptyList<String>()),
                )
            )
        }
        AppLog.i(TAG, "readContacts：${out.size} 个联系人")
        return Outcome.Ok(out)
    }

    // ─────────────────────────────────────────────────────────────
    // 短信
    // ─────────────────────────────────────────────────────────────

    /// 读最近的短信（按时间**倒序**，新的在前）。
    ///
    /// ⚠️ 现实约束：很多机型上只有**默认短信应用**能读到完整收件箱
    /// （系统把 SMS provider 的读取权收紧了）⇒ 查询结果为空是**正常**的，
    /// 不是 bug —— 所以这里返回空列表而不是报错。
    private fun readSms(args: Map<*, *>?): Outcome {
        val limit = normalizedLimit(argInt(args, "limit"))

        val denied = missingPermission(Capability.SMS)
        if (denied != null) {
            AppLog.w(TAG, "readSms 被拒：$denied")
            return Outcome.Err(ERROR_PERMISSION_DENIED, denied, null)
        }

        val projection = arrayOf(
            BaseColumns._ID,
            Telephony.Sms.ADDRESS,
            Telephony.Sms.BODY,
            Telephony.Sms.DATE,
            Telephony.Sms.READ,
        )
        val out = ArrayList<Map<String, Any?>>()
        val cursor = context.contentResolver.query(
            Telephony.Sms.CONTENT_URI,
            projection,
            null,
            null,
            "${Telephony.Sms.DATE} DESC",
        )
        cursor?.use { c ->
            val idIdx = c.getColumnIndexOrThrow(BaseColumns._ID)
            val addrIdx = c.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
            val bodyIdx = c.getColumnIndexOrThrow(Telephony.Sms.BODY)
            val dateIdx = c.getColumnIndexOrThrow(Telephony.Sms.DATE)
            val readIdx = c.getColumnIndex(Telephony.Sms.READ)
            while (c.moveToNext() && out.size < limit) {
                out.add(
                    mapOf(
                        "id" to c.getLong(idIdx).toString(),
                        "address" to c.getStringOrEmpty(addrIdx),
                        "body" to c.getStringOrEmpty(bodyIdx),
                        "dateMs" to c.getLong(dateIdx),
                        "read" to (readIdx >= 0 && !c.isNull(readIdx) && c.getInt(readIdx) != 0),
                    )
                )
            }
        }
        AppLog.i(TAG, "readSms：${out.size} 条短信")
        return Outcome.Ok(out)
    }

    // ─────────────────────────────────────────────────────────────
    // 相册
    // ─────────────────────────────────────────────────────────────

    /// 读相册的**元数据**（标题 / 时间 / 尺寸 / 大小）。
    ///
    /// ⚠️ **只取元数据，不取像素** —— 像素进模型上下文既没意义又贵。
    /// 想看图，走 contentUri 自己去加载。
    private fun readPhotos(args: Map<*, *>?): Outcome {
        val limit = normalizedLimit(argInt(args, "limit"))

        val denied = missingPermission(Capability.PHOTOS)
        if (denied != null) {
            AppLog.w(TAG, "readPhotos 被拒：$denied")
            return Outcome.Err(ERROR_PERMISSION_DENIED, denied, null)
        }

        val projection = arrayOf(
            BaseColumns._ID,
            MediaStore.Images.Media.DISPLAY_NAME,
            MediaStore.Images.Media.DATE_TAKEN,
            MediaStore.Images.Media.DATE_ADDED,
            MediaStore.Images.Media.SIZE,
            MediaStore.Images.Media.WIDTH,
            MediaStore.Images.Media.HEIGHT,
        )
        val out = ArrayList<Map<String, Any?>>()
        val cursor = context.contentResolver.query(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            projection,
            null,
            null,
            "${MediaStore.Images.Media.DATE_TAKEN} DESC",
        )
        cursor?.use { c ->
            val idIdx = c.getColumnIndexOrThrow(BaseColumns._ID)
            val nameIdx = c.getColumnIndex(MediaStore.Images.Media.DISPLAY_NAME)
            val takenIdx = c.getColumnIndex(MediaStore.Images.Media.DATE_TAKEN)
            val addedIdx = c.getColumnIndex(MediaStore.Images.Media.DATE_ADDED)
            val sizeIdx = c.getColumnIndex(MediaStore.Images.Media.SIZE)
            val widthIdx = c.getColumnIndex(MediaStore.Images.Media.WIDTH)
            val heightIdx = c.getColumnIndex(MediaStore.Images.Media.HEIGHT)
            while (c.moveToNext() && out.size < limit) {
                val id = c.getLong(idIdx)
                // DATE_TAKEN 常常是 0（没扫 EXIF）⇒ 退回 DATE_ADDED（秒 ⇒ 毫秒）。
                val taken = c.getLongOrZero(takenIdx)
                val added = c.getLongOrZero(addedIdx)
                val dateMs = if (taken > 0) taken else added * 1000L
                out.add(
                    mapOf(
                        "id" to id.toString(),
                        "title" to c.getStringOrNull(nameIdx),
                        "dateMs" to dateMs,
                        "sizeBytes" to c.getLongOrZero(sizeIdx),
                        "width" to c.getIntOrZero(widthIdx),
                        "height" to c.getIntOrZero(heightIdx),
                        "contentUri" to ContentUris
                            .withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
                            .toString(),
                    )
                )
            }
        }
        AppLog.i(TAG, "readPhotos：${out.size} 张图片的元数据")
        return Outcome.Ok(out)
    }

    // ─────────────────────────────────────────────────────────────
    // 小工具
    // ─────────────────────────────────────────────────────────────

    private fun argString(args: Map<*, *>?, key: String): String? = args?.get(key) as? String

    /// Dart 的 int 在通道里可能是 Int 也可能是 Long（StandardMessageCodec 按值大小选）⇒ 一律按 Number 取。
    private fun argLong(args: Map<*, *>?, key: String): Long? = (args?.get(key) as? Number)?.toLong()

    private fun argInt(args: Map<*, *>?, key: String): Int? = (args?.get(key) as? Number)?.toInt()

    private fun normalizedLimit(raw: Int?): Int {
        val value = raw ?: DEFAULT_LIMIT
        return value.coerceIn(1, MAX_LIMIT)
    }

    /// LIKE 里的通配符要转义 —— 否则用户搜 "50%" 会把全表捞出来。
    private fun escapeLike(value: String): String =
        value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

    private fun Cursor.getStringOrNull(index: Int): String? {
        if (index < 0 || isNull(index)) return null
        val value = getString(index)
        return if (value.isNullOrEmpty()) null else value
    }

    private fun Cursor.getStringOrEmpty(index: Int): String {
        if (index < 0 || isNull(index)) return ""
        return getString(index) ?: ""
    }

    private fun Cursor.getLongOrZero(index: Int): Long {
        if (index < 0 || isNull(index)) return 0L
        return getLong(index)
    }

    private fun Cursor.getIntOrZero(index: Int): Int {
        if (index < 0 || isNull(index)) return 0
        return getInt(index)
    }

    companion object {
        /// 请求权限用的 request code —— Activity 那边靠
        /// `onRequestPermissionsResult` 的返回值区分「这是不是我们的回调」。
        private const val REQUEST_CODE = 0x5CA1
    }
}
