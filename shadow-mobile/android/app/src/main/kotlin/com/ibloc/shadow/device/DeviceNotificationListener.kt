package com.ibloc.shadow.device

import android.app.Notification
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/// **通知使用权服务** —— Android 的 `NotificationListenerService`。
///
/// ## 它是什么
/// Android 没有「读通知栏」的运行时权限 —— 读通知靠**绑定一个服务**
///（用户在 系统设置 → 通知使用权 里逐应用授权）⇒ ⇒ 这是一条**服务开关**，
/// 与日历/联系人那种「弹框批一次」的运行时权限在**语义上完全不同**：
/// - 没有系统弹窗可弹 ⇒ ⇒ 一键入口只能把用户送到设置页；
/// - **授权**（开关开了）与**连接**（服务被系统绑上）是两个状态 —— 开关刚打开，
///   系统可能还没把服务绑上 ⇒ ⇒ 读的时候要分得清这两种「还没准备好」。
///
/// ## 生命周期
/// 系统负责绑定/解绑；连接后 [onListenerConnected] 把实例记进 companion，
/// 解绑时清掉并在 API 26+ 主动 [requestRebind]（系统掉线自动重绑的官方姿势）。
class DeviceNotificationListener : NotificationListenerService() {

    override fun onListenerConnected() {
        connected = this
    }

    override fun onListenerDisconnected() {
        if (connected === this) {
            connected = null
        }
        // ⚠️ 系统把监听断掉了（多半是服务被重启）⇒ ⇒ 主动请求重绑，
        // 不然「已授权但永远读不到」会一直装成正常（requestRebind 要 API 24+）。
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            requestRebind(ComponentName(this, DeviceNotificationListener::class.java))
        }
    }

    override fun onDestroy() {
        if (connected === this) {
            connected = null
        }
        super.onDestroy()
    }

    /// 读当前还在通知栏里的通知，按投递时间**倒序**取前 [limit] 条。
    ///
    /// ⚠️ 默认滤三件事：自家 app 的通知（那是我们自己发的常驻条）、
    /// 常驻通知（includeOngoing 才收 —— 它们不是「发生了什么」）、
    /// 组摘要（纯折叠占位，没有内容）。
    fun readActiveNotifications(
        limit: Int,
        includeOngoing: Boolean,
        includeOwn: Boolean,
    ): List<Map<String, Any?>> {
        val active = activeNotifications ?: return emptyList()
        val pm = packageManager
        return active.asSequence()
            .filter { includeOwn || it.packageName != packageName }
            .filter { includeOngoing || !it.isOngoingNotification() }
            .filter { !it.isGroupSummaryNotification() }
            .sortedByDescending { it.postTime }
            .take(limit)
            .map { sbn ->
                val extras = sbn.notification.extras
                val title = extras.getCharSequence(Notification.EXTRA_TITLE)
                val text = extras.getCharSequence(Notification.EXTRA_TEXT)
                    ?: extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
                val app = runCatching {
                    pm.getApplicationLabel(pm.getApplicationInfo(sbn.packageName, 0)).toString()
                }.getOrDefault(sbn.packageName)
                mapOf(
                    "id" to sbn.key,
                    "app" to app,
                    "package" to sbn.packageName,
                    "title" to (title?.toString() ?: ""),
                    "text" to (text?.toString() ?: ""),
                    "postedAtMs" to sbn.postTime,
                    "ongoing" to sbn.isOngoingNotification(),
                )
            }
            .toList()
    }

    /// 「常驻」判定 —— API 29 起有现成的 [StatusBarNotification.isOngoing]，
    /// 之前读 flags（FLAG_ONGOING_EVENT 在 API 29 起弃用，但旧系统只能读它）。
    private fun StatusBarNotification.isOngoingNotification(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            isOngoing
        } else {
            (notification.flags and Notification.FLAG_ONGOING_EVENT) != 0
        }

    /// 「组摘要」判定 —— 同上（API 29 起 isGroup，之前读 flags）。
    private fun StatusBarNotification.isGroupSummaryNotification(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            isGroup
        } else {
            (notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0
        }

    companion object {

        @Volatile
        private var connected: DeviceNotificationListener? = null

        /// 「通知使用权」的**授权位** —— 查系统设置里 enabled_notification_listeners
        /// 有没有本应用的这个服务。
        ///
        /// ⚠️ 只查**授权**，不查**连接** —— 两个状态（见类注释），调用方要分开问：
        /// 「授权了但没连上」要说「稍后重试」，不是「没授权」。
        fun isAccessGranted(context: Context): Boolean {
            val flat = Settings.Secure.getString(
                context.contentResolver,
                "enabled_notification_listeners",
            ) ?: return false
            val expected = ComponentName(context, DeviceNotificationListener::class.java)
            return flat.split(":").any { entry ->
                val cn = ComponentName.unflattenFromString(entry.trim())
                cn != null &&
                    cn.packageName == expected.packageName &&
                    cn.className == expected.className
            }
        }

        /// 当前**已连接**的服务实例（没有 ⇒ null —— 「已授权但未连接」）。
        fun connectedInstance(): DeviceNotificationListener? = connected

        /// 打开系统的「通知使用权」设置页（**主线程**调用）。
        fun openAccessSettings(context: Context) {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        }
    }
}
