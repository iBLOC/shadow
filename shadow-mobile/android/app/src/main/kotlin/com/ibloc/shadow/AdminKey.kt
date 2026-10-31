package com.ibloc.shadow

import java.io.File

/**
 * admin 面（「**谁能改这台大脑的配置**」）的那把 token。
 *
 * ## 为什么需要它
 *
 * Android 进程**设不了环境变量**（zygote 决定）⇒ 手机上的端脑**没有
 * 配置文件** ⇒ 它的 admin token 取默认 `""` ⇒ 而端脑的
 * `verify_admin_token` 在 expected 为**空串**时，要求退化成
 * 「**请求里带 `X-Admin-Token` 这个头**」—— 而**空值**的头与空串 `ct_eq`
 * 相等 ⇒ **过**。
 *
 * ⚠️ **2026-10-31 真机证实过**：端脑面上
 * **不带任何头 ⇒ 401**，但**空 `X-Admin-Token:` 头 ⇒ 200** ⇒ ⇒
 * **同一台设备上任何别的 App 都能**装 agent、增删启停 MCP、**改 LLM 上游**
 * （把大脑的模型流量指到别处）、reset 测试。
 *
 * 这把 token 是**宿主自己的秘密**：放在 App 私有目录里（别的 App 读不到），
 * **同一份**同时递给端脑和 App 自己的客户端 —— 端脑拿它守门，客户端拿它敲门。
 *
 * ⚠️ **绝不把它打进日志**。
 *
 * ⚠️ **它与 [ShadowKey] 是两把不同的钥匙** —— 那个是「客户端 ↔ 自己端脑」
 * 的门闩。一个拿到门闩的人不该顺带就能改大脑配置 ⇒ 两个域，两把钥匙。
 */
object AdminKey {
    /**
     * token 在 App 私有目录里的位置。
     *
     * 放在 `<filesDir>` 根下（与 `shadow.key`、`identity/account.key` 同级）
     * —— 钥匙文件是**宿主自己的**秘密，不该跟端脑的目录规则纠缠。
     */
    private const val RELATIVE_PATH = "admin.key"

    /**
     * 取这把 token，没有就生成一把并存下来。
     *
     * 生成与落盘的实现在 [HostSecret]（两把钥匙共用同一套逻辑 ⇒ 不会分叉）。
     */
    fun getOrCreate(filesDir: File?): String = HostSecret.getOrCreate(filesDir, RELATIVE_PATH)
}
