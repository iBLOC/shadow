package com.ibloc.shadow

import android.util.Base64
import java.io.File
import java.security.SecureRandom

/**
 * 端脑面（整张 `/shadow/v1/` 面）的那把钥匙。
 *
 * ## 为什么需要它
 *
 * Android 进程**设不了环境变量**（由 zygote 决定、宿主注入不了）⇒ 手机上的
 * 端脑**没有配置文件** ⇒ `telencephalon.shadow.api_key` 取默认 `""` ⇒
 * `require_shadow_key` **全部放行** ⇒ 同一台设备上**任何别的 App** 都能打
 * 这张面，包括 `POST /shadow/v1/identity`（导入账号 ⇒ **换掉「这台机器是谁」**
 * ⇒ 记忆改写进另一个人格、而且**不报错**）。
 *
 * 这把钥匙是**宿主自己的秘密**：放在 App 私有目录里（别的 App 读不到），
 * **同一份**同时递给端脑和 App 自己的客户端 —— 端脑拿它守门，客户端拿它敲门。
 *
 * ⚠️ **绝不把它打进日志**（它不是账号密钥，但它同样是门闩）。
 */
object ShadowKey {
    /**
     * 钥匙在 App 私有目录里的位置。
     *
     * ⚠️ **必须与设备端集成测试读的那个路径逐字一致**
     * （`integration_test/shadow_key.dart` 读 `<filesDir>/shadow.key`）——
     * 对不上时测试会以为「端脑面还开着」（key 读成 null ⇒ 不带 key 也过），
     * 于是**上锁这件事在测试里看不见**。
     *
     * 放在 `<filesDir>` 根下（与 `identity/account.key` 同级）而不是
     * `shadow/` 子目录：前者的合成规则只有一处（`identity_dir_for`），
     * 钥匙文件是**宿主自己的**秘密，不该跟端脑的目录规则纠缠。
     */
    private const val RELATIVE_PATH = "shadow.key"

    /** 钥匙的字节数 —— 32 字节 = 256 位。 */
    private const val KEY_BYTES = 32

    /**
     * 取这把钥匙，没有就生成一把并存下来。
     *
     * **存下来**是为了重启后不变：端脑与 App 的生命周期不完全重合（大脑停了
     * App 还在，或反过来），钥匙一变，两边就得重新对齐一次。
     *
     * 拿不到私有目录（理论上不会）⇒ 就用一把临时的：这一轮能用，下一轮换
     * 一把 —— 宁可换钥匙，也不要开着门。
     */
    fun getOrCreate(filesDir: File?): String {
        val dir = filesDir ?: return generate()
        val file = File(dir, RELATIVE_PATH)
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
