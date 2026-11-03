package com.ibloc.shadow

import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.concurrent.atomic.AtomicLong

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

    /// 每条日志的单调序号 —— 回放水位线的依据。
    private val seqGen = AtomicLong(0)

    /// 已被**回放**覆盖到的最大序号。实时投递（`main.post` 的那条）如果
    /// 序号 ≤ 水位线就跳过 —— 否则会**双重投递**：emit 先同步入 buffer、
    /// 再 post 投递；若订阅恰好在「已入 buffer、post 还没跑」之间发生
    /// （主线程被 `.so` 加载阻塞时这个窗口以**秒**计 —— 2026-11-01 真机
    /// 复现：面板里最新一条启动日志出现两遍），回放把这条发一遍、滞留的
    /// post 又发一遍。
    @Volatile
    private var replayedUpTo = 0L

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
        val seq = seqGen.incrementAndGet()
        val entry = mapOf(
            "timestamp" to System.currentTimeMillis(),
            "level" to level,
            "tag" to tag,
            "message" to msg,
            "seq" to seq,
        )
        synchronized(buffer) {
            buffer.addLast(entry)
            while (buffer.size > CAPACITY) buffer.removeFirst()
        }
        // EventSink 只能在 platform main thread 上调用 —— LogcatReader 时代如此，这里保持。
        main.post {
            if (seq > replayedUpTo) sink?.invoke(entry)
        }
    }

    /// 订阅并回放存量（端脑冷启动日志在 App 起来时就打完了，
    /// 用户后来才展开日志面板 —— 不回放就只能看到「以后」的）。
    ///
    /// 整个过程锁住 buffer 并**最后**设 sink：回放期间的新 emit 会被锁挡住、
    /// 其 post 排在后面，序号必然 > 水位线 —— 不丢也不重。
    fun subscribe(replay: Boolean, onEntry: (Map<String, Any>) -> Unit) {
        synchronized(buffer) {
            if (replay) {
                buffer.forEach { onEntry(it) }
            }
            (buffer.lastOrNull()?.get("seq") as? Long)?.let { replayedUpTo = it }
            sink = onEntry
        }
    }

    fun unsubscribe() {
        sink = null
    }
}
