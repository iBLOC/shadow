package com.ibloc.shadow

import org.json.JSONObject
import java.io.File

/**
 * 这台手机在零信任网里的**角色**。
 *
 * 与 Dart 侧（设置页的可视化配置）落盘的 ziti.json **一一对应** ——
 * 字面量相同、含义相同、默认值相同（off）。
 *
 * ⚠️ **认不得的字面量 ⇒ ⇒ null，不猜**（调用方回落 OFF）。
 * 猜 ⇒ ⇒ 配置文件里一个笔误就会把手机变成「零信任客户端」，
 * 而用户以为什么都没变。
 */
enum class ZitiRole(val wire: String) {
    /** 不走零信任（默认）：本地跑自己的大脑。 */
    OFF("off"),

    /** 连远端大脑：本地**不起**大脑，那个端口上坐的是零信任代理。 */
    CLIENT("client"),

    /** 发布本机大脑：手机把自己的脑面发到零信任网（别的设备反过来用它的脑子）。 */
    SERVER("server");

    companion object {
        fun fromWire(wire: String?): ZitiRole? = when (wire) {
            "off" -> OFF
            "client" -> CLIENT
            "server" -> SERVER
            else -> null
        }
    }
}

/**
 * 一份零信任配置（**不含秘密**）。
 *
 * ⚠️ 这里只有**路径**与服务名 —— 身份文件本身（含私钥）由 Dart 侧放在
 * App 私有目录，配置里只记它在哪。
 */
data class ZitiConfig(
    val role: ZitiRole,
    val service: String,
    val identityPath: String,
) {
    /**
     * 配置**完整**吗（角色 + 服务名 + 身份三者齐）。
     *
     * ⚠️ 不齐 ⇒ ⇒ **不半生效**：明确报错并回落「不走零信任」。
     * 半生效 ⇒ ⇒ 「看着连上了，其实没身份」⇒ ⇒ 失败长得像成功。
     */
    val isComplete: Boolean
        get() = role != ZitiRole.OFF && service.isNotBlank() && identityPath.isNotBlank()
}

/**
 * 读那份**可视化配置**（ziti.json）。
 *
 * ## 为什么宿主要读它
 *
 * 设置页（Dart）只能**落盘** —— 而「这台手机是客户端还是发布者」是
 * **启动时**定死的（nativeStart 一跑，那张面就定死了）⇒ ⇒ 生效只能在
 * 宿主启动时读那份文件。
 *
 * ⚠️ 两边**必须读同一个目录**：Dart 写的是 App 私有目录（filesDir），
 * 宿主启动时用的 dataDir 默认也是 filesDir ⇒ ⇒ 对得上。
 */
object ZitiConfigReader {
    /** 配置文件名（App 私有目录根下）。 */
    const val FILE_NAME = "ziti.json"

    /**
     * 解析一段 JSON。**认不得 ⇒ ⇒ null**（不是默认值 ⇒ ⇒ 不猜）。
     */
    fun parse(json: String): ZitiConfig? {
        return try {
            val obj = JSONObject(json)
            val role = ZitiRole.fromWire(obj.optString("mode", "off")) ?: return null
            ZitiConfig(
                role = role,
                service = obj.optString("service", "").trim(),
                identityPath = obj.optString("identityPath", "").trim(),
            )
        } catch (e: Exception) {
            null
        }
    }

    /** 读文件。没有文件 ⇒ ⇒ null；解析失败 ⇒ ⇒ null（当成没配）。 */
    fun read(file: File): ZitiConfig? {
        if (!file.exists()) {
            return null
        }
        return try {
            parse(file.readText())
        } catch (e: Exception) {
            null
        }
    }
}
