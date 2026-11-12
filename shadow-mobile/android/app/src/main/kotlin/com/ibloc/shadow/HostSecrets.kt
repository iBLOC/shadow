package com.ibloc.shadow

import java.io.File

/**
 * 读**大脑生成的那两把宿主秘密**（`shadow.key` / `admin.key`）。
 *
 * ## 为什么这里只有「读」
 *
 * 生成、落盘、权限（0600）、以及「写不下来怎么办」**全在大脑里**
 * （`encephalon/src/mobile/host.rs`）—— 与桌面端同一套语义。平台差异只有
 * 一件：**目录由宿主给**（Android 没有 `$HOME`）。
 *
 * ⇒ ⇒ 这个对象**只做一件事**：把大脑写下的值读出来，交给 **App 自己的
 * 客户端**（客户端要用同一把钥匙敲门：`X-Shadow-Key` / `X-Admin-Token`）。
 *
 * ⚠️ **必须在 `start` 之后读** —— 第一次启动时文件是大脑刚写下的。
 *
 * ⚠️ **绝不把这些值打进日志**（它们不是账号密钥，但同样是门闩）。
 */
internal object HostSecrets {
    /** 客户端 ↔ 自己大脑那扇门的门闩。 */
    const val SHADOW_KEY_FILE = "shadow.key"

    /** 「谁能改这台大脑的配置」的凭据。 */
    const val ADMIN_TOKEN_FILE = "admin.key"

    /**
     * 读 `filesDir/<name>`；没有 / 读不出来 ⇒ 空串。
     *
     * 空串的后果**不是静默**：客户端会不带那个头 ⇒ 大脑回 401（门是关着的，
     * 而且它关得对）⇒ 界面会说「没连上」，而不是「连上了但什么都做不了」。
     */
    fun read(filesDir: File?, name: String): String {
        val dir = filesDir ?: return ""
        val file = File(dir, name)
        return try {
            if (file.exists()) file.readText().trim() else ""
        } catch (e: Exception) {
            ""
        }
    }
}
