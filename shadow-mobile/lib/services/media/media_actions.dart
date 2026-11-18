import 'package:flutter/services.dart';

/// 「聊天里的图片」那两个动作的**结果** —— **成功 / 失败 / 原因**都要带出来。
///
/// ⚠️ **失败不许长得像成功**：相册里没有图、界面却说「已保存」⇒ ⇒ 那就是
/// 「失败长得像成功」⇒ ⇒ 所以这里把**原因**（`code` + `message`）带出去，
/// 让界面能对用户说真话。
class MediaActionResult {
  /// 动作**真的**做成了吗（原生那边说成了才算）。
  final bool ok;

  /// 失败/回落的**机器可读原因**（`permission_denied` / `wechat_not_installed` /
  /// `save_failed` / `share_failed` / `bad_args`）。
  final String? code;

  /// 人话原因（原生那边给的那句）。
  final String? message;

  /// 分享时：**是不是真的**交给了微信（没装微信 ⇒ ⇒ `false` ⇒ ⇒ 界面要说
  /// 「已打开系统分享」，不许说「已分享到微信」）。
  final bool viaWechat;

  const MediaActionResult({
    required this.ok,
    this.code,
    this.message,
    this.viaWechat = false,
  });

  /// 原生那边**整个通道**都不在（桌面端 / 测试环境）⇒ ⇒ 响亮地说「这台设备
  /// 做不了这个动作」，**不假装成功**。
  static const MediaActionResult unsupported = MediaActionResult(
    ok: false,
    code: 'unsupported',
    message: 'this platform has no media actions',
  );
}

/// 「保存到相册」＋「分享到微信」—— **宿主（Android）那侧**的动作。
///
/// ⚠️ **为什么这两件事在大脑那侧做不了**：保存进系统相册要 MediaStore、
/// 分享给微信要 `ACTION_SEND` ⇒ ⇒ 都是**操作系统**的动作 ⇒ ⇒ 只有宿主
/// 能做（不是「两端各写一份」—— 只有 Android 有这两样东西）。
///
/// ⚠️ **通道可注入** ⇒ ⇒ 判据能自己造一个假通道来钉「点了按钮 ⇒ ⇒ 真的
/// 打到了原生那一侧」（不注入的话，判据只能验到「按钮画出来了」⇒ ⇒ 那
/// 是**假绿**）。
class MediaActions {
  /// 与 `MainActivity.kt` 的 `MEDIA_ACTIONS_CHANNEL` 逐字一致。
  static const String channelName = 'com.ibloc.shadow/media_actions';

  final MethodChannel _channel;

  MediaActions({MethodChannel? channel})
      : _channel = channel ?? const MethodChannel(channelName);

  /// **保存到相册**。
  ///
  /// ⚠️ Android 10+ 不需要权限；再旧一点需要 `WRITE_EXTERNAL_STORAGE`
  /// ⇒ ⇒ 拿不到就**响亮失败**（`permission_denied`）⇒ ⇒ 不假装成功。
  Future<MediaActionResult> saveToGallery(
    Uint8List bytes, {
    String fileName = 'shadow_image.jpg',
  }) async {
    return _invoke('saveToGallery', bytes, fileName);
  }

  /// **分享到微信**。
  ///
  /// ⚠️ **没装微信** ⇒ ⇒ 原生那边会改走**系统分享面板**并把
  /// `viaWechat=false` 带回来 ⇒ ⇒ 界面要说「已打开系统分享」⇒ ⇒ **不许**
  /// 说「已分享到微信」（微信根本没收到）。
  Future<MediaActionResult> shareToWeChat(
    Uint8List bytes, {
    String fileName = 'shadow_image.jpg',
  }) async {
    return _invoke('shareToWeChat', bytes, fileName);
  }

  Future<MediaActionResult> _invoke(
    String method,
    Uint8List bytes,
    String fileName,
  ) async {
    try {
      final raw = await _channel.invokeMapMethod<String, dynamic>(method, {
        'bytes': bytes,
        'fileName': fileName,
      });
      if (raw == null) {
        return const MediaActionResult(
          ok: false,
          code: 'empty_reply',
          message: 'the platform returned nothing',
        );
      }
      return MediaActionResult(
        ok: raw['ok'] == true,
        code: raw['code'] as String?,
        message: raw['message'] as String?,
        viaWechat: raw['wechat'] == true,
      );
    } on MissingPluginException {
      // ⚠️ **通道不在**（桌面端 / 旧版本 App）⇒ ⇒ 响亮说「做不了」。
      return MediaActionResult.unsupported;
    } on PlatformException catch (e) {
      return MediaActionResult(
        ok: false,
        code: e.code,
        message: e.message,
      );
    }
  }
}

/// 按**字节的魔数**认格式 ⇒ ⇒ 落盘的文件名带**对的扩展名**。
///
/// ⚠️ **为什么不能一律叫 `.jpg`**：云上游给的常常是 JPEG、**本地腿**给的是
/// PNG ⇒ ⇒ 一律 `.jpg` ⇒ ⇒ 相册里出现「扩展名是 jpg、内容是 png」的文件
/// ⇒ ⇒ 有些图库会**认不出**它（用户看到「打不开」）。
///
/// ⚠️ 认不出 ⇒ ⇒ 兜底 `.jpg`（原生那边也是按扩展名猜 MIME 的 ⇒ ⇒ 两边
/// 猜法一致 ⇒ ⇒ 至少**标签**不会自相矛盾）。
String imageFileName(Uint8List bytes, {String prefix = 'shadow'}) {
  final ext = imageExtensionOf(bytes);
  return '${prefix}_${DateTime.now().millisecondsSinceEpoch}.$ext';
}

/// 字节的魔数 ⇒ 扩展名（`png` / `jpg` / `webp`；认不出 ⇒ `jpg`）。
String imageExtensionOf(Uint8List bytes) {
  if (bytes.length >= 8 &&
      bytes[0] == 0x89 &&
      bytes[1] == 0x50 &&
      bytes[2] == 0x4E &&
      bytes[3] == 0x47) {
    return 'png';
  }
  if (bytes.length >= 3 &&
      bytes[0] == 0xFF &&
      bytes[1] == 0xD8 &&
      bytes[2] == 0xFF) {
    return 'jpg';
  }
  if (bytes.length >= 12 &&
      bytes[0] == 0x52 &&
      bytes[1] == 0x49 &&
      bytes[2] == 0x46 &&
      bytes[3] == 0x46 &&
      bytes[8] == 0x57 &&
      bytes[9] == 0x45 &&
      bytes[10] == 0x42 &&
      bytes[11] == 0x50) {
    return 'webp';
  }
  return 'jpg';
}
