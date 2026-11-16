import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as path;

/// **一张图片能不能发给端脑** —— 以及**为什么不能**。
///
/// ⚠️ 为什么要带「原因」而不是一个 bool：一张图发不出去有好几种原因
/// （读不出／格式不认识／太大）⇒ ⇒ 压成一句「发不出去」⇒ ⇒ 用户能做的
/// 事情（换一张／拍一张）就分不出来了 ⇒ ⇒ 那就还是「失败长得像失败」
/// 的低配版。
class ImageEncodeResult {
  /// 成功时的载荷：`{media_type, data}`（`data` 是**纯 base64**）。
  final Map<String, String>? payload;

  /// 失败原因（**给用户看的那句**）。
  final String? reason;

  const ImageEncodeResult.ok(this.payload) : reason = null;
  const ImageEncodeResult.failed(this.reason) : payload = null;
}

class ImageInputHandler {
  final ImagePicker _picker = ImagePicker();

  /// **一张图最多允许多少字节**（原始字节，未 base64）。
  ///
  /// ⚠️ 为什么客户端也要设闸：base64 会把体积**放大约 1/3** ⇒ ⇒ 一张
  /// 原图就是好几 MB 的请求体 ⇒ ⇒ 手机上发一个请求体几十兆 ⇒ ⇒ 网不好
  /// 时它会**超时**，而超时的报错是「没发出去」⇒ ⇒ 用户不知道自己那张
  /// 图太大。
  ///
  /// ⚠️ 这个数字与端脑那侧（`MAX_IMAGE_BYTES`）**必须一致** ⇒ ⇒ 两边
  /// 都拒 ⇒ ⇒ 不会出现「客户端放行、端脑拒」⇒ ⇒ 那种错会指向别处。
  static const int maxImageBytes = 10 * 1024 * 1024;

  /// **一条消息最多带几张图**（与端脑那侧一致）。
  static const int maxImagesPerMessage = 8;

  /// **扩展名 → MIME**。
  ///
  /// ⚠️ 为什么只认这四个：**相机插件默认出 JPEG**，相册选图经
  /// `image_picker` 也归一到 JPEG/PNG ⇒ ⇒ 这四个覆盖了**实际会出现的**
  /// 形态 ⇒ ⇒ HEIC 之类（Android 某些机型）不在表内 ⇒ ⇒ 落到下面那条
  /// 「格式不认识」⇒ ⇒ **明确报错**，而不是发上去让上游解不解。
  static const Map<String, String> _mimeByExtension = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'gif': 'image/gif',
  };

  /// **把一张图片读成端脑协议要的那一档**（base64 + MIME）。
  ///
  /// ⚠️ 为什么在这一层做：媒体类型**从扩展名推** ⇒ ⇒ 只有「图片处理」
  /// 这一层知道扩展名 ⇒ ⇒ 别处各猜一份 ⇒ ⇒ 迟早漂。
  ///
  /// ⚠️ **读不出／不认识／太大 ⇒ 一律带原因失败** ⇒ ⇒ 绝不许把一段
  /// 未知字节**假装成图片**发出去 ⇒ ⇒ 上游会拿它当图片解 ⇒ ⇒ 然后报一个
  /// **指向别处**的错误。
  Future<ImageEncodeResult> encodeForTelencephalon(File file) async {
    final ext = path.extension(file.path).toLowerCase().replaceFirst('.', '');
    final mime = _mimeByExtension[ext];
    if (mime == null) {
      return ImageEncodeResult.failed(
        ext.isEmpty ? 'unsupported image format' : 'unsupported image format: .$ext',
      );
    }
    Uint8List bytes;
    try {
      bytes = await file.readAsBytes();
    } catch (e) {
      debugPrint('ImageInputHandler: 读不出图片: ${file.path} ($e)');
      return ImageEncodeResult.failed('could not read the image file');
    }
    if (bytes.length > maxImageBytes) {
      return ImageEncodeResult.failed(
        'image is too large (${bytes.length} bytes, max $maxImageBytes)',
      );
    }
    return ImageEncodeResult.ok({
      'media_type': mime,
      'data': base64Encode(bytes),
    });
  }

  /// 判据时把「App 自己的目录」换掉。
  ///
  /// ⚠️ 单测里没有 path_provider 的平台实现 ⇒ 真去调会抛
  /// MissingPluginException ⇒ ⇒ 落盘**静默失败**（那正好是「配了不生效」
  /// 那一族的病）⇒ ⇒ 判据里指向临时目录。
  /// ⚠️ 与 AppConfigService.configFileOverride 同一招 —— 不是为测试开的后门，
  /// 是把「落盘目标」这件事**变成可注入的**。
  static Future<Directory> Function()? documentsDirOverride;

  /// **从相册选图**。
  ///
  /// ⚠️ 这里**只剩相册这一条**：拍照那条路在 2026-11-16 那一刀里换成了
  /// **App 内建相机**（见 InAppCameraOverlay）⇒ ⇒ 系统相机那条路**整条删掉**。
  ///
  /// ⚠️ 为什么删：系统相机靠 **intent 回合**把照片带回来 ⇒ ⇒ 回合一断
  /// 就**静默丢照片**（真机实测 MIX 4 / MIUI：OneShotCamera 一被拉起就崩 ——
  /// 「FATAL EXCEPTION: JpegEncoderThread」⇒ ⇒
  /// 「Force finishing activity com.android.camera/.OneShotCamera」
  /// ⇒ ⇒ 拿不回照片 ⇒ ⇒ 候选里什么都没有，也没有提示）。
  Future<File?> pickImage() async {
    try {
      final XFile? image = await _picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );

      if (image != null) {
        final file = File(image.path);
        if (await file.exists()) {
          return file;
        }
        debugPrint(
          'ImageInputHandler: 相册选到的文件不存在: ${image.path}',
        );
        return null;
      }
      debugPrint('ImageInputHandler: 没有选图');
      return null;
    } catch (e) {
      debugPrint('ImageInputHandler: 选图出错: $e');
      return null;
    }
  }

  /// **把内建相机拍到的文件收进 App 自己的目录** ⇒ ⇒ 挂成附件。
  ///
  /// ⚠️ 为什么还要拷一份：camera 插件拍出来的文件落在**缓存目录**
  /// ⇒ ⇒ 系统随时可以清掉它 ⇒ ⇒ 拷进 documents 才靠得住。
  Future<File?> importCapture(File source, {required String dirName}) async {
    if (!await source.exists()) {
      debugPrint('ImageInputHandler: 拍到的文件不存在: ${source.path}');
      return null;
    }
    final name = source.path.split('/').last;
    final savedPath = await _saveToAppDirectory(
      source,
      name,
      dirName: dirName,
    );
    if (savedPath == null) return null;
    return File(savedPath);
  }

  Future<String?> _saveToAppDirectory(
    File sourceFile,
    String fileName, {
    String dirName = 'captured_images',
  }) async {
    try {
      final appDir = await (documentsDirOverride?.call() ??
          getApplicationDocumentsDirectory());
      final imagesDir = Directory('${appDir.path}/$dirName');
      if (!await imagesDir.exists()) {
        await imagesDir.create(recursive: true);
      }
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final extension = path.extension(fileName);
      final newFileName = 'IMG_$timestamp$extension';
      final newPath = '${imagesDir.path}/$newFileName';
      await sourceFile.copy(newPath);
      debugPrint('ImageInputHandler: Saved camera image to: $newPath');
      return newPath;
    } catch (e) {
      debugPrint('ImageInputHandler: Error saving camera image: $e');
      if (e is FileSystemException) {
        debugPrint(
          'ImageInputHandler: File system error - code: ${e.osError?.errorCode}',
        );
      }
      return null;
    }
  }

  Future<List<File>> pickMultipleImages() async {
    try {
      final List<XFile> images = await _picker.pickMultiImage(
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );
      return images.map((x) => File(x.path)).toList();
    } catch (e) {
      debugPrint('ImageInputHandler: Error picking multiple images: $e');
      return [];
    }
  }
}
