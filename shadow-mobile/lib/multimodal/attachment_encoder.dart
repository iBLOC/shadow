import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:path/path.dart' as path;

/// **一份附件能不能发给大脑** —— 以及**为什么不能**。
///
/// ⚠️ 为什么要带「原因」而不是一个 bool：一份附件发不出去有好几种原因
/// （读不出／格式还没接／太大／张数超了）⇒ ⇒ 压成一句「发不出去」⇒ ⇒
/// 用户能做的事情（换一份／拍一张／先转成 PDF）就分不出来了 ⇒ ⇒ 那就
/// 还是「失败长得像失败」的低配版。
class AttachmentEncodeResult {
  /// 成功时的载荷：`{media_type, data, filename?}`（`data` 是**纯 base64**）。
  final Map<String, String>? payload;

  /// 失败原因（**给用户看的那句**）。
  final String? reason;

  const AttachmentEncodeResult.ok(this.payload) : reason = null;
  const AttachmentEncodeResult.failed(this.reason) : payload = null;
}

/// **附件的档** —— 我们能把哪几种发给大脑。
///
/// ⚠️ 为什么在**客户端**也分一遍档：端脑那边也有一份（它决定怎么把附件
/// 变成模型认得的形状）⇒ ⇒ 两份**必须**同口径 ⇒ ⇒ 否则会出现「客户端
/// 放行、端脑拒」⇒ ⇒ 那种错会**指向别处**（用户会以为是模型坏了）。
///
/// ⚠️ **判据只能有一处**：这一份是**客户端侧**的（扩展名 ⇒ MIME ＋ 档）
/// ⇒ ⇒ 端脑侧那份按 **MIME** 判 ⇒ ⇒ 两边以 **MIME** 为**唯一的交接面**
/// ⇒ ⇒ MIME 一致 ⇒ 两边结论必然一致。
enum AttachmentKind {
  /// 图片 ⇒ 大脑那边变成 `image_url`。
  image,

  /// 纯文本类（代码／JSON／CSV／Markdown…）⇒ 大脑那边**内联成文字**。
  text,

  /// PDF ⇒ 大脑那边变成 `file` part。
  pdf,

  /// 音频（wav／mp3）⇒ 大脑那边变成 `input_audio`。
  audio,

  /// **表格**（xlsx / xlsm）⇒ 大脑那边**不解成文字**，而是交给**数据那一条路**
  /// （顶叶解析表格 ⇒ 取表头 ＋ 前几行 ⇒ 由 agent 建本体 ⇒ 再写数据）。
  ///
  /// ⚠️ 为什么**不是** text 档：xlsx 是**二进制**（zip + xml）⇒ ⇒ 当 UTF-8
  /// 解一遍 ⇒ ⇒ 乱码 ⇒ ⇒ **失败长得像成功**。
  spreadsheet,

  /// **这一档还没接**（视频、Word/Excel、别的音频格式…）。
  ///
  /// ⚠️ 它**不是**「模型吃不吃」的问题 ⇒ ⇒ 是**我们**还不会发 ⇒ ⇒
  /// 报错必须说清是**我们**的边界 ⇒ ⇒ 否则用户会去换模型 ⇒ ⇒ 换了也没用
  /// ⇒ ⇒ 白折腾。
  unsupported,
}

/// **附件编码器** —— 把一个本地文件变成**协议要的那一档**。
class AttachmentEncoder {
  /// **一个附件最多允许多少字节**（原始字节，未 base64）。
  ///
  /// ⚠️ 这个数字与端脑那侧（`MAX_ATTACHMENT_BYTES`）**必须一致** ⇒ ⇒ 两边
  /// 都拒 ⇒ ⇒ 不会出现「客户端放行、端脑拒」⇒ ⇒ 那种错会指向别处。
  static const int maxAttachmentBytes = 10 * 1024 * 1024;

  /// **一条消息最多带几个附件**（与端脑那侧一致）。
  static const int maxAttachmentsPerMessage = 8;

  /// **纯文本类附件的上限**（原始字节）—— 比别的档**更严**。
  ///
  /// ⚠️ 为什么文本类要单独更严：文本类会**整段进 prompt** ⇒ ⇒ 不是当成
  /// 图片那样由模型「看」，而是**一个字一个字地占上下文** ⇒ ⇒ 10MB 的
  /// 文本会把这一轮的上下文直接顶爆 ⇒ ⇒ 「能发」不等于「发得出去」。
  static const int maxTextBytes = 256 * 1024;

  /// **扩展名 → MIME**。
  ///
  /// ⚠️ 为什么只认这张表：MIME 是**协议里**的东西 ⇒ ⇒ 它必须**确定**
  /// ⇒ ⇒ 猜出来的 MIME 会让对端按错的类型处理（把 PDF 当纯文本解 ⇒ ⇒
  /// 乱码 ⇒ ⇒ 模型读到乱码 ⇒ ⇒ 失败长得像成功）。
  ///
  /// ⚠️ 为什么**不用** `package:mime` 探测：仓里**没有**那个依赖 ⇒ ⇒ 加它
  /// 是**新增依赖** ⇒ ⇒ 而扩展名表**够用**（手机上的文件来自相机、相册、
  /// 文件管理器，扩展名都是明确的）⇒ ⇒ 不为一个能自建的表引依赖。
  static const Map<String, String> _mimeByExtension = {
    // 图片
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'gif': 'image/gif',
    // 文档
    'pdf': 'application/pdf',
    // 表格（xlsx 是 zip+xml 的二进制；xlsm 是带宏的同族）
    'xlsx':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
    // 纯文本类
    'txt': 'text/plain',
    'md': 'text/markdown',
    'markdown': 'text/markdown',
    'csv': 'text/csv',
    'tsv': 'text/tab-separated-values',
    'html': 'text/html',
    'htm': 'text/html',
    'css': 'text/css',
    'js': 'text/javascript',
    'ts': 'text/plain',
    'json': 'application/json',
    'xml': 'application/xml',
    'yaml': 'application/x-yaml',
    'yml': 'application/x-yaml',
    'toml': 'application/toml',
    'ini': 'text/plain',
    'log': 'text/plain',
    'sh': 'application/x-sh',
    'py': 'text/plain',
    'rs': 'text/plain',
    'sql': 'application/sql',
    // 音频（只认 wav / mp3 —— 见下方说明）
    'wav': 'audio/wav',
    'mp3': 'audio/mpeg',
  };

  /// **这个扩展名落在哪一档**。
  ///
  /// ⚠️ **只认纯文本**：`.docx`／`.xlsx` 那些是**二进制格式**（不是「带格式
  /// 的文本」）⇒ ⇒ 落 `unsupported` ⇒ ⇒ 明确报错 ⇒ ⇒ 而不是把它们当
  /// UTF-8 解一遍（解出来是乱码 ⇒ ⇒ 模型读到乱码 ⇒ ⇒ 失败长得像成功）。
  ///
  /// ⚠️ **音频只认 wav / mp3**：仓里已有同款先例（端脑 `api/voice.rs`：MiMo
  /// 「只收 wav / mp3」，别的格式原样塞过去**必然 400」）⇒ ⇒ 别的音频
  /// 格式（m4a/ogg/webm/flac）落 `unsupported` ⇒ ⇒ 明确说清，而不是塞上去
  /// 换一个上游 400。
  static AttachmentKind kindForExtension(String extension) {
    final ext = extension.toLowerCase().replaceFirst('.', '');
    if (ext.isEmpty) return AttachmentKind.unsupported;
    final mime = _mimeByExtension[ext];
    if (mime == null) return AttachmentKind.unsupported;
    if (mime.startsWith('image/')) return AttachmentKind.image;
    if (mime == 'application/pdf') return AttachmentKind.pdf;
    if (mime.startsWith('audio/')) return AttachmentKind.audio;
    if (mime.startsWith('application/vnd.openxmlformats-officedocument.') ||
        mime.startsWith('application/vnd.ms-excel')) {
      return AttachmentKind.spreadsheet;
    }
    return AttachmentKind.text;
  }

  /// **这个 MIME 落在哪一档**（按扩展名表反查 ⇒ ⇒ 未知 ⇒ unsupported）。
  static AttachmentKind kindForMime(String mime) {
    final lower = mime.trim().toLowerCase();
    for (final entry in _mimeByExtension.entries) {
      if (entry.value.toLowerCase() == lower) {
        return kindForExtension(entry.key);
      }
    }
    return AttachmentKind.unsupported;
  }

  /// **把一个本地文件读成协议要的那一档**（base64 + MIME + 文件名）。
  ///
  /// ⚠️ **读不出／格式还没接／太大 ⇒ 一律带原因失败** ⇒ ⇒ 绝不许把一段
  /// 未知字节**假装成图片**发出去 ⇒ ⇒ 上游会拿它当图片解 ⇒ ⇒ 然后报一个
  /// **指向别处**的错误。
  Future<AttachmentEncodeResult> encode(File file) async {
    final ext = path.extension(file.path);
    final kind = kindForExtension(ext);
    final name = path.basename(file.path);

    if (kind == AttachmentKind.unsupported) {
      return AttachmentEncodeResult.failed(
        ext.isEmpty
            ? 'unsupported file type (no file extension)'
            : 'unsupported file type: .$ext',
      );
    }

    Uint8List bytes;
    try {
      bytes = await file.readAsBytes();
    } catch (e) {
      debugPrint('AttachmentEncoder: 读不出文件: ${file.path} ($e)');
      return AttachmentEncodeResult.failed('could not read the file');
    }

    if (kind == AttachmentKind.text && bytes.length > maxTextBytes) {
      return AttachmentEncodeResult.failed(
        'text file is too large (${bytes.length} bytes, max $maxTextBytes) — '
        'a text file is inlined into the prompt, so it must stay small',
      );
    }
    if (bytes.length > maxAttachmentBytes) {
      return AttachmentEncodeResult.failed(
        'file is too large (${bytes.length} bytes, max $maxAttachmentBytes)',
      );
    }

    final mime = _mimeByExtension[ext.toLowerCase().replaceFirst('.', '')];
    return AttachmentEncodeResult.ok({
      'media_type': mime!,
      'data': base64Encode(bytes),
      'filename': name,
    });
  }
}
