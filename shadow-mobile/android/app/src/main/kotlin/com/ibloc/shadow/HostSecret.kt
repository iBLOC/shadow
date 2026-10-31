package com.ibloc.shadow

import android.util.Base64
import java.io.File
import java.security.SecureRandom

/**
 * 宿主自己的**秘密文件** —— 一把随机钥匙，读或生成，落在 App 私有目录里。
 *
 * ## 为什么要有它
 *
 * 端脑面与 admin 面各要一把**不同的**钥匙：
 *
 * - `shadow.key` —— 「客户端 ↔ 自己端脑」那扇门的**门闩**；
 * - `admin.key` —— 「**谁能改这台大脑的配置**」（装 agent、**改 LLM 上游**、
 *   动 MCP）的**凭据**。
 *
 * 两个**域**，两把**钥匙** —— 一把钥匙不能开两扇门（拿到门闩的人不该顺带
 * 就能改大脑配置）。
 *
 * ## 它做什么
 *
 * 同一套「读或生成 + 只给本人读写」的逻辑，**由调用方指定文件名** ⇒ 两把
 * 钥匙不可能在实现上分叉。
 *
 * ⚠️ **绝不把这些值打进日志**（它们不是账号密钥，但它们同样是秘密）。
 */
internal object HostSecret {
    /** 钥匙的字节数 —— 32 字节 = 256 位。 */
    private const val KEY_BYTES = 32

    /**
     * 取 [dir] 下名为 [name] 的那把钥匙，没有就生成一把并存下来。
     *
     * **存下来**是为了重启后不变：端脑与 App 的生命周期不完全重合（大脑停了
     * App 还在，或反过来），钥匙一变，两边就得重新对齐一次。
     *
     * 拿不到私有目录（理论上不会）⇒ 就用一把临时的：这一轮能用，下一轮换
     * 一把 —— 宁可换钥匙，也不要开着门。
     */
    fun getOrCreate(dir: File?, name: String): String {
        val target = dir ?: return generate()
        val file = File(target, name)
        try {
            if (file.exists()) {
                val existing = file.readText().trim()
                if (existing.isNotEmpty()) return existing
            }
        } catch (e: Exception) {
            // 读不出来就重新生成一把（下面会覆盖它）。
        }
        val key = generate()
        try {
            file.parentFile?.mkdirs()
            file.writeText(key)
            // 只给本人读写。
            file.setReadable(false, false)
            file.setReadable(true, true)
            file.setWritable(false, false)
            file.setWritable(true, true)
        } catch (e: Exception) {
            // 存不下来也要能用 —— 只是每次启动都会换一把。
        }
        return key
    }

    /** 生成一把新钥匙（base64url，无 padding）。 */
    private fun generate(): String {
        val bytes = ByteArray(KEY_BYTES)
        SecureRandom().nextBytes(bytes)
        return Base64.encodeToString(
            bytes,
            Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
        )
    }
}
