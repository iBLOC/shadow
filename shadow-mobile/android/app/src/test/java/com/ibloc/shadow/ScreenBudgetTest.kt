package com.ibloc.shadow

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * **读屏预算的边界** —— 三道闸各自在什么点上收手。
 *
 * ⚠️ 这组用例存在的理由：Android 模块**一个 JVM 单测都没有**
 * ⇒ ⇒ 而 `ScreenBudget` 是**故意写成纯 Kotlin**（不碰任何 Android 类型）
 * ⇒ ⇒ 就是为了能在这里直接验 ⇒ ⇒ 以后 Kotlin 的纯逻辑都往这儿放。
 *
 * ⚠️ 边界值都**钉死**：`>` 还是 `>=` 差一个字符 ⇒ ⇒ 截断多一屏或少一屏
 * ⇒ ⇒ 而这类差只在边界上出现 ⇒ ⇒ 只能靠用例钉。
 */
class ScreenBudgetTest {

    @Test
    fun `没超预算 ⇒ 不算截断`() {
        val b = ScreenBudget()
        assertTrue(b.visit(0))
        assertTrue(b.visit(1))
        assertFalse(b.truncated)
        assertEquals(2, b.visited)
    }

    @Test
    fun `深度：恰好等于上限 ⇒ 放行`() {
        val b = ScreenBudget(maxDepth = 3)
        assertTrue(b.visit(3))
        assertFalse(b.truncated)
    }

    @Test
    fun `深度：超一行 ⇒ 拒绝并记账`() {
        val b = ScreenBudget(maxDepth = 3)
        assertTrue(b.visit(3))
        assertFalse(b.visit(4))
        assertTrue(b.truncated)
    }

    @Test
    fun `节点数：第 N+1 个 ⇒ 拒绝并记账`() {
        val b = ScreenBudget(maxNodes = 2)
        assertTrue(b.visit(0))
        assertTrue(b.visit(0))
        assertFalse(b.visit(0))
        assertTrue(b.truncated)
        assertEquals(2, b.visited)
    }

    @Test
    fun `字符数：恰好等于上限 ⇒ 放行`() {
        val b = ScreenBudget(maxChars = 10)
        assertTrue(b.canWrite(0, 10))
        assertFalse(b.truncated)
    }

    @Test
    fun `字符数：超一行 ⇒ 拒绝并记账`() {
        val b = ScreenBudget(maxChars = 10)
        assertFalse(b.canWrite(6, 5))
        assertTrue(b.truncated)
    }

    @Test
    fun `默认值就是台账里写的那三个`() {
        assertEquals(20, ScreenBudget.DEFAULT_MAX_DEPTH)
        assertEquals(2000, ScreenBudget.DEFAULT_MAX_NODES)
        assertEquals(20_000, ScreenBudget.DEFAULT_MAX_CHARS)
    }
}
