package com.ibloc.shadow

import java.io.File

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
 *
 * ⚠️ **它与 [AdminKey] 是两把不同的钥匙** —— 那个是「谁能改这台大脑的配置」
 * 的凭据。两个域，不能一把钥匙开两扇门。
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

    /**
     * 取这把钥匙，没有就生成一把并存下来。
     *
     * 生成与落盘的实现在 [HostSecret]（两把钥匙共用同一套逻辑 ⇒ 不会分叉）。
     */
    fun getOrCreate(filesDir: File?): String = HostSecret.getOrCreate(filesDir, RELATIVE_PATH)
}
