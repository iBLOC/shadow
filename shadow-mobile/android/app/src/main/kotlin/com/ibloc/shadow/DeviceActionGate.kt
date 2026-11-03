package com.ibloc.shadow

import java.util.concurrent.atomic.AtomicBoolean

/**
 * **设备动作闸** —— 「手机操作」在**原生侧**的统一放行标志。
 *
 * ⚠️ **为什么需要它**：Dart 侧那道能力闸只管**模型工具**那条路
 * ⇒ ⇒ 原生侧的两个动作入口 —— HTTP `/api/mobile/action` 与 A2A 的
 * `executeAction` —— **天然绕开**它 ⇒ ⇒ 「闸建好了」这句话在它们
 * 身上**是假的** ⇒ ⇒ 这里补一个原生侧也认的闸 ⇒ ⇒ 闸才是真的。
 *
 * ⚠️ **默认拒绝**（fail-closed）：原生进程刚起来、还没收到 Dart 推来的
 * 状态时 ⇒ ⇒ 一律拒绝 ⇒ ⇒ 「推不到 / 推失败」**不会**退化成
 * 「静悄悄地放行」⇒ ⇒ 那才是真正危险的那种失败。
 */
object DeviceActionGate {

    /**
     * 拒绝时的说明 —— 给调用方（模型 / 外部代理）看的**可操作**提示。
     *
     * ⚠️ 为什么写清楚怎么解：只回一句 denied ⇒ ⇒ 调用方只能反复重试
     * ⇒ ⇒ 换成人能照着做的句子才是真的在帮忙。
     */
    const val DENIED_MESSAGE =
        "Device actions are not allowed: the mobile-use capability is not set to full access. " +
            "Set it to full access in Settings -> Capabilities to let agents drive this phone."

    private val allowed = AtomicBoolean(false)

    /** 放行吗？（false = 拒绝） */
    fun isAllowed(): Boolean = allowed.get()

    /**
     * 设置放行状态 —— **只由 Dart 侧调用**（能力档位变化时推过来）。
     *
     * ⚠️ 用 [AtomicBoolean] 而不是普通 Boolean：写发生在平台主线程
     * （MethodChannel handler），读发生在后台线程（HTTP / A2A 的工作
     * 线程）⇒ ⇒ 需要可见性保证。
     */
    fun setAllowed(value: Boolean) {
        allowed.set(value)
    }
}