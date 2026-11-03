package com.ibloc.shadow

/**
 * 读屏输出的**预算** —— 深度 / 节点数 / 字符数三道闸。
 *
 * ⚠️ **为什么要有预算**：可访问性树的大小**不封顶** —— 一个 WebView 或一个
 * 长列表页能挂上千个节点 ⇒ ⇒ 而这份文本**直接进模型上下文** ⇒ ⇒ 一次读屏
 * 就能灌进几万 token ⇒ ⇒ 模型反复读屏还会**把上下文堆爆**。
 * ⇒ ⇒ 这不是「慢一点」的问题，是**钱**和**上下文**的问题。
 *
 * ⚠️ **为什么单独一个类**：这一层**不碰任何 Android 类型**（纯计数器）
 * ⇒ ⇒ 可以被 JVM 单测直接验 ⇒ ⇒ 而「Android 模块一个单测都没有」
 * 是本仓最扎手的事实之一（见根 AGENTS.md）。
 *
 * ⚠️ **截断必须显式**：预算用完时**不是**静悄悄少一段 ⇒ ⇒ 调用方要在
 * 末尾看到 `[truncated]` ⇒ ⇒ 模型才知道自己**没看全**。
 */
class ScreenBudget(
    private val maxDepth: Int = DEFAULT_MAX_DEPTH,
    private val maxNodes: Int = DEFAULT_MAX_NODES,
    val maxChars: Int = DEFAULT_MAX_CHARS,
) {
    /** 已经走过多少个节点。 */
    var visited: Int = 0
        private set

    /** 有没有被截断？⇒ ⇒ 调用方据此在末尾加显式标记。 */
    var truncated: Boolean = false
        private set

    /**
     * 这个节点还该不该看？
     *
     * ⚠️ **深度也算预算**：Android 的树深度通常 < 30，但深度太深说明
     * 那是布局套布局（对模型没有额外信息）⇒ ⇒ 到顶就停。
     */
    fun visit(depth: Int): Boolean {
        if (depth > maxDepth) {
            truncated = true
            return false
        }
        if (visited >= maxNodes) {
            truncated = true
            return false
        }
        visited++
        return true
    }

    /**
     * 还能再写 `extra` 个字符吗？
     *
     * ⚠️ **只回答「能不能」，不替你写** ⇒ ⇒ 写多少由调用方决定
     * ⇒ ⇒ 要写就写**能写下的那部分** ⇒ ⇒ 不能整段丢掉（用户会看到
     * 「屏幕突然没了」）。
     */
    fun canWrite(current: Int, extra: Int): Boolean {
        if (current + extra <= maxChars) return true
        truncated = true
        return false
    }

    companion object {
        /** 深度上限 —— 再深就是布局套布局，对模型没额外信息。 */
        const val DEFAULT_MAX_DEPTH = 20

        /** 节点上限 —— 防止在超大树上白跑（纯遍历开销）。 */
        const val DEFAULT_MAX_NODES = 2000

        /**
         * 字符上限 —— **这份文本直接进模型上下文** ⇒ ⇒ 这就是钱。
         * ⚠️ 典型一屏只有 1–3 KB ⇒ ⇒ 这个值很少会真的截到 ⇒ ⇒
         * ⇒ 它挡的是「WebView / 超长列表」那种病态情况。
         */
        const val DEFAULT_MAX_CHARS = 20_000
    }
}
