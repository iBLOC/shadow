package com.ibloc.shadow

import android.os.Handler
import android.os.Looper
import android.util.Log

/// 进程内的日志桥 —— 让 Flutter 侧的「高级 → 日志」面板能读到本进程日志。
///
/// 为什么需要它：面板原先靠 `Runtime.exec("logcat …")` 从 logcat 读自己的日志，
/// 而 MIUI 对 app uid 的 logcat 是**彻底封锁**的（2026-11-01 真机实测：
/// `run-as com.ibloc.shadow logcat -d` 挂死且零输出）—— 那条路从来没通过。
/// 日志在写入端（`android.util.Log`）一定经过我们 ⇒ 写的同时留一份进
/// ring buffer，EventChannel 订阅时先回放再实时 —— 不依赖任何被封的门。
///
/// 日志仍照常进 logcat（`adb logcat` 侧行为不变），这里只是多抄送一份。
object AppLog {
    private const val CAPACITY = 500
    private val main = Handler(Looper.getMainLooper())
    private val buffer = ArrayDeque<Map<String, Any>>()
    private var sink: ((Map<String, Any>) -> Unit)? = null

    fun d(tag: String, msg: String, tr: Throwable? = null) =
        emit("debug", tag, render(msg, tr)) { Log.d(tag, msg, tr) }

    fun i(tag: String, msg: String, tr: Throwable? = null) =
        emit("info", tag, render(msg, tr)) { Log.i(tag, msg, tr) }

    fun w(tag: String, msg: String, tr: Throwable? = null) =
        emit("warning", tag, render(msg, tr)) { Log.w(tag, msg, tr) }

    fun e(tag: String, msg: String, tr: Throwable? = null) =
        emit("error", tag, render(msg, tr)) { Log.e(tag, msg, tr) }

    /// 面板里单行显示 —— 异常折进消息文本（logcat 侧仍走 Log.x 的完整 stacktrace）。
    private fun render(msg: String, tr: Throwable?): String =
        if (tr != null) "$msg: $tr" else msg

    private inline fun emit(level: String, tag: String, msg: String, writeToLogcat: () -> Unit) {
        writeToLogcat()
        val entry = mapOf(
            "timestamp" to System.currentTimeMillis(),
            "level" to level,
            "tag" to tag,
            "message" to msg,
        )
        synchronized(buffer) {
            buffer.addLast(entry)
            while (buffer.size > CAPACITY) buffer.removeFirst()
        }
        // EventSink 只能在 platform main thread 上调用 —— LogcatReader 时代如此，这里保持。
        main.post { sink?.invoke(entry) }
    }

    /// 订阅并回放存量（端脑冷启动日志在 App 起来时就打完了，
    /// 用户后来才展开日志面板 —— 不回放就只能看到「以后」的）。
    fun subscribe(replay: Boolean, onEntry: (Map<String, Any>) -> Unit) {
        sink = onEntry
        if (replay) {
            synchronized(buffer) {
                buffer.forEach { onEntry(it) }
            }
        }
    }

    fun unsubscribe() {
        sink = null
    }
}
