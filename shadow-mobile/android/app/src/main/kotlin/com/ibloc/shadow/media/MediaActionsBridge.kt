package com.ibloc.shadow.media

import android.Manifest
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

/**
 * 「聊天里的图片」的两个动作 —— **保存到相册** ＋ **分享到微信**。
 *
 * ## 为什么这两件事**必须**落在宿主（Android）这一侧
 *
 * 「保存进系统相册」与「交给微信」都是**操作系统**的动作（MediaStore /
 * Intent），大脑那侧**碰不到** ⇒ ⇒ 与「多端兼容实现全在大脑」那条规矩
 * **不冲突**：规矩管的是「**同一件事的逻辑**别在两端各写一份」，而这里
 * **只有宿主能写**（系统相册、微信 Intent 是 Android 独有的）。
 *
 * ⇒ ⇒ 端脑/桌面那边**不做**这两个动作 ⇒ ⇒ 客户端自己接。
 *
 * ## 两条路的诚实口径
 *
 * ❶ **保存到相册**
 *   * Android 10（API 29）起：MediaStore 直接写 ⇒ ⇒ **不需要任何权限**
 *     （分区存储的规矩：应用写自己建的媒体条目不用运行时权限）。
 *   * Android 9（API 28）及以下：要写公共 Pictures 目录 ⇒ ⇒ **需要
 *     `WRITE_EXTERNAL_STORAGE` 运行期权限** ⇒ ⇒ 拿不到就**响亮地说
 *     「需要存储权限」**，**不假装保存成功**（否则相册里没有图、界面却说
 *     「已保存」⇒ ⇒ 那就是「失败长得像成功」）。
 *
 * ❷ **分享到微信**
 *   * 微信的包名 `com.tencent.mm` ⇒ ⇒ **先查它在不在**（Android 11+ 有
 *     包可见性 ⇒ ⇒ 清单里必须有 `<queries><package …/></queries>`）。
 *   * **不在** ⇒ ⇒ **不静默改成别的目标**：把结果原样报回去（`wechat_not_installed`）
 *     ⇒ ⇒ 客户端据此**回落到系统分享面板**并说清「没检测到微信」⇒ ⇒
 *     用户要的是「分享」，不是「必须微信」。
 *   * **在** ⇒ ⇒ 直接 `ACTION_SEND` + `setPackage("com.tencent.mm")` ⇒ ⇒
 *     微信自己接管 ⇒ ⇒ **不需要微信 SDK**（分享图片走的是系统 Intent 族）。
 *
 * ## 文件为什么必须走 FileProvider
 *
 * `ACTION_SEND` 传 `file://` URI 在 Android 7+ 会直接抛
 * `FileUriExposedException` ⇒ ⇒ 必须给**内容 URI** ⇒ ⇒ 只能由
 * `FileProvider` 发（`content://<applicationId>.fileprovider/…`）⇒ ⇒
 * ⇒ ⇒ 清单里要声明 provider，`res/xml/file_paths.xml` 要放行**缓存目录**
 * （我们只分享自己刚写的那个文件 ⇒ ⇒ 只放行 `shared/` 这一段）。
 */
class MediaActionsBridge(private val context: Context) {

    companion object {
        /** 微信的包名（国际版也是它 ⇒ ⇒ 不用区分）。 */
        const val WECHAT_PACKAGE = "com.tencent.mm"

        /** FileProvider 放行的缓存子目录（只放行这一段 ⇒ ⇒ 别把整个缓存开了）。 */
        private const val SHARE_DIR = "shared"

        /** 相册里我们自己那一格（用户找得到 ⇒ ⇒ 不塞得到处都是）。 */
        private const val ALBUM_DIR = "Shadow"
    }

    /** 通道入口 —— 接线方（MainActivity）把 handler 指到这里。 */
    fun handle(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "saveToGallery" -> saveToGallery(call, result)
            "shareToWeChat" -> shareToWeChat(call, result)
            else -> result.notImplemented()
        }
    }

    // ─────────────────────────────────────────────────────────────
    // ❶ 保存到相册
    // ─────────────────────────────────────────────────────────────
    private fun saveToGallery(call: MethodCall, result: MethodChannel.Result) {
        val bytes = call.argument<ByteArray>("bytes")
        if (bytes == null) {
            result.error("bad_args", "bytes is required", null)
            return
        }
        val fileName = sanitizeFileName(call.argument<String>("fileName"))
        val mime = mimeOf(fileName)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            saveViaMediaStore(bytes, fileName, mime, result)
            return
        }

        // API ≤ 28 —— 写公共目录要运行时权限。
        if (context.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            != PackageManager.PERMISSION_GRANTED
        ) {
            result.error(
                "permission_denied",
                "Android 9 及以下保存到相册需要存储权限（WRITE_EXTERNAL_STORAGE）",
                null
            )
            return
        }
        try {
            val dir = File(
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                ALBUM_DIR
            )
            if (!dir.exists() && !dir.mkdirs()) {
                result.error("save_failed", "cannot create $dir", null)
                return
            }
            val file = File(dir, fileName)
            FileOutputStream(file).use { it.write(bytes) }
            // ⚠️ **扫一遍** ⇒ ⇒ 相册/文件管理器立刻看得到（否则要等系统扫盘）。
            MediaScannerConnection.scanFile(context, arrayOf(file.absolutePath), arrayOf(mime), null)
            result.success(mapOf("ok" to true, "uri" to Uri.fromFile(file).toString()))
        } catch (e: Exception) {
            result.error("save_failed", e.message ?: "save failed", null)
        }
    }

    /**
     * Android 10+ 的那条路 —— MediaStore 直接写，**不需要权限**。
     *
     * ⚠️ **`IS_PENDING`**：先挂 1 写完再置 0 ⇒ ⇒ 写一半崩了也不会在相册里
     * 留半张图（用户看到的是「要么有、要么没有」）。
     */
    private fun saveViaMediaStore(
        bytes: ByteArray,
        fileName: String,
        mime: String,
        result: MethodChannel.Result
    ) {
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
            put(MediaStore.Images.Media.MIME_TYPE, mime)
            put(
                MediaStore.Images.Media.RELATIVE_PATH,
                Environment.DIRECTORY_PICTURES + "/" + ALBUM_DIR
            )
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
        if (uri == null) {
            result.error("save_failed", "MediaStore refused the insert", null)
            return
        }
        try {
            val out = resolver.openOutputStream(uri)
                ?: throw IOException("openOutputStream returned null")
            out.use { it.write(bytes) }
        } catch (e: Exception) {
            // ⚠️ 写坏了 ⇒ ⇒ **把那条半成品删掉**（不许留在相册里）。
            try {
                resolver.delete(uri, null, null)
            } catch (_: Exception) {
            }
            result.error("save_failed", e.message ?: "save failed", null)
            return
        }
        val done = ContentValues().apply {
            put(MediaStore.Images.Media.IS_PENDING, 0)
        }
        resolver.update(uri, done, null, null)
        result.success(mapOf("ok" to true, "uri" to uri.toString()))
    }

    // ─────────────────────────────────────────────────────────────
    // ❷ 分享到微信
    // ─────────────────────────────────────────────────────────────
    private fun shareToWeChat(call: MethodCall, result: MethodChannel.Result) {
        val bytes = call.argument<ByteArray>("bytes")
        if (bytes == null) {
            result.error("bad_args", "bytes is required", null)
            return
        }
        val fileName = sanitizeFileName(call.argument<String>("fileName"))

        val wechatInstalled = try {
            context.packageManager.getLaunchIntentForPackage(WECHAT_PACKAGE) != null
        } catch (e: Exception) {
            false
        }

        val uri = try {
            writeShareFile(bytes, fileName)
        } catch (e: Exception) {
            result.error("share_failed", e.message ?: "cannot stage the file", null)
            return
        }

        val intent = Intent(Intent.ACTION_SEND).apply {
            type = mimeOf(fileName)
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            clipData = android.content.ClipData.newUri(context.contentResolver, fileName, uri)
            if (wechatInstalled) {
                // ⚠️ **点名给微信**（用户要的就是微信）⇒ ⇒ 不让系统弹选择器。
                setPackage(WECHAT_PACKAGE)
            }
        }
        try {
            context.startActivity(intent)
        } catch (e: Exception) {
            result.error("share_failed", e.message ?: "cannot start the share", null)
            return
        }
        // ⚠️ **说清走的是哪条路** ⇒ ⇒ 没装微信 ⇒ ⇒ 客户端据此回落到系统面板。
        result.success(
            mapOf(
                "ok" to true,
                "wechat" to wechatInstalled,
                "uri" to uri.toString()
            )
        )
    }

    /**
     * 把字节写进**缓存目录**并换成 FileProvider 的内容 URI。
     *
     * ⚠️ 为什么要落文件而不是直接给 `ByteArray`：微信要**读文件**
     * （ACTION_SEND + EXTRA_STREAM 传的是 URI）⇒ ⇒ 必须有文件。
     */
    private fun writeShareFile(bytes: ByteArray, fileName: String): Uri {
        val dir = File(context.cacheDir, SHARE_DIR)
        if (!dir.exists() && !dir.mkdirs()) {
            throw IOException("cannot create $dir")
        }
        val file = File(dir, fileName)
        FileOutputStream(file).use { it.write(bytes) }
        return FileProvider.getUriForFile(
            context,
            context.packageName + ".fileprovider",
            file
        )
    }

    /** 文件名净化 —— 不许带路径分隔符（那是**目录穿越**）。 */
    private fun sanitizeFileName(raw: String?): String {
        val name = (raw ?: "").trim().substringAfterLast('/').substringAfterLast('\\')
        if (name.isEmpty()) return "shadow_image_${System.currentTimeMillis()}.jpg"
        return name
    }

    /** 按扩展名猜 MIME（**猜不出就当 jpeg** ⇒ ⇒ 相册/微信都认）。 */
    private fun mimeOf(fileName: String): String {
        val lower = fileName.lowercase()
        return when {
            lower.endsWith(".png") -> "image/png"
            lower.endsWith(".webp") -> "image/webp"
            else -> "image/jpeg"
        }
    }
}
