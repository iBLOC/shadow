import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/multimodal/image_input_handler.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// **图片附件那道线**（2026-11-16 这一刀）。
///
/// ⚠️ 这一族钉的是**协议那一面**：
/// 文件 ⇒ ⇒ base64 + MIME ⇒ ⇒ 随消息发出去 ⇒ ⇒ 端脑把它变成模型看得见的
/// `image_url`。
///
/// ⚠️ 之前**没有这一位** ⇒ ⇒ 移动端只有一道硬拦（「端脑链路当前只处理纯
/// 文本」）⇒ ⇒ 照片拍完、发不出、发不出也不说为什么。
void main() {
  late ImageInputHandler handler;
  late Directory dir;

  setUp(() async {
    handler = ImageInputHandler();
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

  group('扩展名 → MIME', () {
    test('jpg 认得', () async {
      final file = await write('IMG_1.jpg', [1, 2, 3]);
      final result = await handler.encodeForTelencephalon(file);
      expect(result.payload, isNotNull);
      expect(result.payload!['media_type'], 'image/jpeg');
    });

    test('jpeg 认得（同一个 MIME）', () async {
      final file = await write('IMG_1.jpeg', [1, 2, 3]);
      final result = await handler.encodeForTelencephalon(file);
      expect(result.payload!['media_type'], 'image/jpeg');
    });

    test('png 认得', () async {
      final file = await write('IMG_1.png', [1, 2, 3]);
      final result = await handler.encodeForTelencephalon(file);
      expect(result.payload!['media_type'], 'image/png');
    });

    test('webp 认得', () async {
      final file = await write('IMG_1.webp', [1, 2, 3]);
      final result = await handler.encodeForTelencephalon(file);
      expect(result.payload!['media_type'], 'image/webp');
    });

    test('大写扩展名也认得（IMG_1.JPG）', () async {
      final file = await write('IMG_1.JPG', [1, 2, 3]);
      final result = await handler.encodeForTelencephalon(file);
      expect(result.payload, isNotNull, reason: 'the extension is case-insensitive');
    });

    test('不认得的格式 → 带原因失败（不许假装成图片）', () async {
      final file = await write('IMG_1.heic', [1, 2, 3]);
      final result = await handler.encodeForTelencephalon(file);
      expect(result.payload, isNull);
      expect(result.reason, contains('format'));
    });

    test('没有扩展名 → 带原因失败', () async {
      final file = await write('IMG_1', [1, 2, 3]);
      final result = await handler.encodeForTelencephalon(file);
      expect(result.payload, isNull);
      expect(result.reason, isNotNull);
    });
  });

  group('字节 → base64', () {
    test('base64 与文件字节逐字一致', () async {
      final bytes = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 9, 8, 7]);
      final file = await write('IMG_1.jpg', bytes);
      final result = await handler.encodeForTelencephalon(file);
      expect(result.payload!['data'], base64Encode(bytes));
    });

    test('data 不带 data: 前缀（拼前缀是端脑那一端的活）', () async {
      final file = await write('IMG_1.jpg', [1, 2, 3]);
      final result = await handler.encodeForTelencephalon(file);
      expect(result.payload!['data'], isNot(startsWith('data:')));
    });

    test('读不出的文件 → 带原因失败', () async {
      final result = await handler.encodeForTelencephalon(
        File('${dir.path}/nope.jpg'),
      );
      expect(result.payload, isNull);
      expect(result.reason, contains('read'));
    });

    test('太大的图 → 带原因失败（不许发一个超大请求体出去）', () async {
      // ⚠️ 用**真 base64 比例**造（解码后 ≈ 4/3）⇒ ⇒ 与闸的口径一致。
      final big = Uint8List(ImageInputHandler.maxImageBytes + 1024);
      final file = await write('IMG_1.jpg', big);
      final result = await handler.encodeForTelencephalon(file);
      expect(result.payload, isNull);
      expect(result.reason, contains('too large'));
    });
  });

  group('请求体形状', () {
    test('images 进 toJson（键名 images，每项 media_type + data）', () {
      final request = SendMessageRequest(
        text: '这是什么',
        images: const [
          {'media_type': 'image/jpeg', 'data': 'aGVsbG8='},
        ],
      );
      final json = request.toJson();
      expect(json['images'], isA<List<dynamic>>());
      final images = json['images'] as List<dynamic>;
      expect(images.length, 1);
      final first = images.first as Map<String, dynamic>;
      expect(first['media_type'], 'image/jpeg');
      expect(first['data'], 'aGVsbG8=');
    });

    test('没有图片 ⇒ 不带 images 这一键（老端脑不受影响）', () {
      final request = SendMessageRequest(text: 'hello');
      expect(request.toJson().containsKey('images'), isFalse);
    });

    test('空图片列表 ⇒ 也不带 images（不留一个空数组）', () {
      final request = SendMessageRequest(text: 'hello', images: const []);
      expect(request.toJson().containsKey('images'), isFalse);
    });
  });
}
