import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/multimodal/attachment_encoder.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// **附件那道线**（2026-11-16 这一刀，从「只有图片」扩到**全类型**）。
///
/// ⚠️ 这一族钉的是**协议那一面**：
/// 文件 ⇒ ⇒ base64 + MIME + 文件名 ⇒ ⇒ 随消息发出去 ⇒ ⇒ 端脑按 MIME
/// **分档** ⇒ ⇒ 变成模型认得的那种形状（`image_url`／`input_audio`／
/// `file`／内联文字）。
///
/// ⚠️ 之前**没有这一位** ⇒ ⇒ 移动端只有一道硬拦（「端脑链路当前只处理纯
/// 文本」）⇒ ⇒ 照片拍完、发不出、发不出也不说为什么。
void main() {
  late AttachmentEncoder encoder;
  late Directory dir;

  setUp(() async {
    encoder = AttachmentEncoder();
    dir = await Directory.systemTemp.createTemp('shadow-wire-');
  });

  tearDown(() async {
    if (await dir.exists()) {
      await dir.delete(recursive: true);
    }
  });

  Future<File> write(String name, List<int> bytes) async {
    final file = File('${dir.path}/$name');
    await file.writeAsBytes(bytes);
    return file;
  }

  group('扩展名 → MIME → 档', () {
    test('图片认得（jpg/jpeg/png/webp/gif）', () async {
      const cases = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'webp': 'image/webp',
        'gif': 'image/gif',
      };
      cases.forEach((ext, mime) {
        expect(AttachmentEncoder.kindForExtension(ext), AttachmentKind.image,
            reason: '.$ext must be the image kind');
      });
      final file = await write('IMG_1.jpg', [1, 2, 3]);
      final result = await encoder.encode(file);
      expect(result.payload!['media_type'], 'image/jpeg');
    });

    test('纯文本类认得（代码/JSON/CSV/Markdown…）', () async {
      const cases = {
        'txt': 'text/plain',
        'md': 'text/markdown',
        'csv': 'text/csv',
        'json': 'application/json',
        'yaml': 'application/x-yaml',
        'rs': 'text/plain',
      };
      cases.forEach((ext, mime) {
        expect(AttachmentEncoder.kindForExtension(ext), AttachmentKind.text,
            reason: '.$ext must be the text kind');
      });
      final file = await write('a.json', [1, 2, 3]);
      final result = await encoder.encode(file);
      expect(result.payload!['media_type'], 'application/json');
    });

    test('PDF 认得', () async {
      expect(AttachmentEncoder.kindForExtension('pdf'), AttachmentKind.pdf);
      final file = await write('doc.pdf', [1, 2, 3]);
      final result = await encoder.encode(file);
      expect(result.payload!['media_type'], 'application/pdf');
    });

    test('wav / mp3 认得', () async {
      expect(AttachmentEncoder.kindForExtension('wav'), AttachmentKind.audio);
      expect(AttachmentEncoder.kindForExtension('mp3'), AttachmentKind.audio);
      final file = await write('a.wav', [1, 2, 3]);
      final result = await encoder.encode(file);
      expect(result.payload!['media_type'], 'audio/wav');
    });

    test('视频 → 还没接（带原因）', () async {
      expect(AttachmentEncoder.kindForExtension('mp4'),
          AttachmentKind.unsupported);
      final file = await write('v.mp4', [1, 2, 3]);
      final result = await encoder.encode(file);
      expect(result.payload, isNull);
      expect(result.reason, contains('unsupported'));
    });

    test('Word / Excel 那类二进制 → 还没接（不是「带格式的文本」）', () async {
      expect(AttachmentEncoder.kindForExtension('docx'),
          AttachmentKind.unsupported);
      expect(AttachmentEncoder.kindForExtension('xlsx'),
          AttachmentKind.unsupported);
      final file = await write('a.docx', [1, 2, 3]);
      final result = await encoder.encode(file);
      expect(result.payload, isNull);
      expect(result.reason, contains('unsupported'));
    });

    test('别的音频格式 → 还没接（仓里同款先例：只收 wav / mp3）', () async {
      expect(AttachmentEncoder.kindForExtension('m4a'),
          AttachmentKind.unsupported);
      expect(AttachmentEncoder.kindForExtension('ogg'),
          AttachmentKind.unsupported);
      final file = await write('a.m4a', [1, 2, 3]);
      final result = await encoder.encode(file);
      expect(result.payload, isNull);
    });

    test('没有扩展名 → 还没接（带原因）', () async {
      final file = await write('noext', [1, 2, 3]);
      final result = await encoder.encode(file);
      expect(result.payload, isNull);
      expect(result.reason, contains('unsupported'));
    });

    test('大写扩展名也认得（IMG_1.JPG）', () async {
      expect(AttachmentEncoder.kindForExtension('JPG'), AttachmentKind.image);
    });
  });

  group('字节 → 载荷', () {
    test('base64 与文件字节逐字一致', () async {
      final bytes = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 9, 8, 7]);
      final file = await write('IMG_1.jpg', bytes);
      final result = await encoder.encode(file);
      expect(result.payload!['data'], base64Encode(bytes));
    });

    test('data 不带 data: 前缀（拼前缀是端脑那一端的活）', () async {
      final file = await write('IMG_1.jpg', [1, 2, 3]);
      final result = await encoder.encode(file);
      expect(result.payload!['data'], isNot(startsWith('data:')));
    });

    test('filename 带上（模型要知道这是个什么文件）', () async {
      final file = await write('IMG_1794770578.jpg', [1, 2, 3]);
      final result = await encoder.encode(file);
      expect(result.payload!['filename'], 'IMG_1794770578.jpg');
    });

    test('读不出的文件 → 带原因失败', () async {
      final result = await encoder.encode(File('${dir.path}/nope.jpg'));
      expect(result.payload, isNull);
      expect(result.reason, contains('read'));
    });

    test('太大的文件 → 带原因失败', () async {
      final big = Uint8List(AttachmentEncoder.maxAttachmentBytes + 1024);
      final file = await write('big.jpg', big);
      final result = await encoder.encode(file);
      expect(result.payload, isNull);
      expect(result.reason, contains('too large'));
    });

    test('太大的**文本** → 带原因失败（它会整段进 prompt）', () async {
      final big = Uint8List(AttachmentEncoder.maxTextBytes + 1024);
      final file = await write('big.txt', big);
      final result = await encoder.encode(file);
      expect(result.payload, isNull);
      expect(result.reason, contains('too large'));
    });
  });

  group('请求体形状', () {
    test('attachments 进 toJson（键名 attachments，每项 media_type + data）', () {
      final request = SendMessageRequest(
        text: '这是什么',
        attachments: const [
          {'media_type': 'image/jpeg', 'data': 'aGVsbG8=', 'filename': 'a.jpg'},
        ],
      );
      final json = request.toJson();
      expect(json['attachments'], isA<List<dynamic>>());
      final attachments = json['attachments'] as List<dynamic>;
      expect(attachments.length, 1);
      final first = attachments.first as Map<String, dynamic>;
      expect(first['media_type'], 'image/jpeg');
      expect(first['data'], 'aGVsbG8=');
      expect(first['filename'], 'a.jpg');
    });

    test('没有附件 ⇒ 不带 attachments 这一键（老端脑不受影响）', () {
      final request = SendMessageRequest(text: 'hello');
      expect(request.toJson().containsKey('attachments'), isFalse);
    });

    test('空附件列表 ⇒ 也不带 attachments（不留一个空数组）', () {
      final request = SendMessageRequest(text: 'hello', attachments: const []);
      expect(request.toJson().containsKey('attachments'), isFalse);
    });
  });
}
