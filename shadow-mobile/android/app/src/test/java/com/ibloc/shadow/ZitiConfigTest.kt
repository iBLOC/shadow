package com.ibloc.shadow

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 零信任配置的**纯逻辑**判据。
 *
 * ⚠️ **为什么只测这两样**：JSON 解析走 org.json（Android 框架类）⇒ ⇒
 * JVM 单测里没有它 ⇒ ⇒ 那部分只能靠真机验；这里钉的是**不依赖平台的
 * 那两条**：字面量映射 ＋ 完整性判据。
 *
 * ⚠️ 这两条正是「配置错了会不会静默变成另一种角色」与
 * 「字段不全会不会半生效」的守门人。
 */
class ZitiConfigTest {
    @Test
    fun wireNamesMapToRoles() {
        assertEquals(ZitiRole.OFF, ZitiRole.fromWire("off"))
        assertEquals(ZitiRole.CLIENT, ZitiRole.fromWire("client"))
        assertEquals(ZitiRole.SERVER, ZitiRole.fromWire("server"))
    }

    @Test
    fun anUnknownWireNameIsNotGuessed() {
        // ⚠️ **不猜** —— 认不得就是认不得 ⇒ ⇒ 回落由调用方决定（OFF）。
        assertNull(ZitiRole.fromWire("publish-everything"))
        assertNull(ZitiRole.fromWire(""))
        assertNull(ZitiRole.fromWire(null))
    }

    @Test
    fun theWireNamesAreExactlyTheThreeWeAgreedOn() {
        // ⚠️ 钉死字面量 ⇒ ⇒ 改了枚举顺序或大小写，Dart 侧就对不上了。
        assertEquals("off", ZitiRole.OFF.wire)
        assertEquals("client", ZitiRole.CLIENT.wire)
        assertEquals("server", ZitiRole.SERVER.wire)
    }

    @Test
    fun aCompleteConfigNeedsRoleServiceAndIdentity() {
        val complete = ZitiConfig(ZitiRole.CLIENT, "shadow-brain", "/data/id.json")
        assertTrue(complete.isComplete)
    }

    @Test
    fun anIncompleteConfigIsNeverComplete() {
        // 角色是 off ⇒ 永远不完整（哪怕字段齐）。
        assertFalse(ZitiConfig(ZitiRole.OFF, "shadow-brain", "/data/id.json").isComplete)
        // 服务名空 ⇒ 不完整。
        assertFalse(ZitiConfig(ZitiRole.CLIENT, "  ", "/data/id.json").isComplete)
        // 身份路径空 ⇒ 不完整。
        assertFalse(ZitiConfig(ZitiRole.CLIENT, "shadow-brain", "").isComplete)
    }
}
