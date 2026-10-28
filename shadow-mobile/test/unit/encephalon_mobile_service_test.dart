import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/encephalon/encephalon_mobile_service.dart';

/// Encephalon 移动端服务的单测。
///
/// 走 MethodChannel mock —— 不需要真机，也不需要 libencephalon.so：
/// 这里验的是 Dart 侧与 Kotlin 端的**契约**（方法名、参数形状、返回值解析）。
/// JNI 符号本身由 Rust 仓的 `scripts/jni-host-test/` 覆盖。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('com.ibloc.shadow/encephalon_runtime');
  final calls = <MethodCall>[];

  void mockHandler(Future<Object?> Function(MethodCall call) handler) {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) {
      calls.add(call);
      return handler(call);
    });
  }

  setUp(() {
    calls.clear();
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  group('EncephalonMobileService.start', () {
    test('成功后记下端口并标记为运行中', () async {
      mockHandler((call) async {
        return {'success': true, 'port': 41234};
      });

      final service = EncephalonMobileService();
      expect(service.isRunning, isFalse);
      expect(service.port, isNull);

      final ok = await service.start();

      expect(ok, isTrue);
      expect(service.isRunning, isTrue);
      expect(service.port, 41234);
      expect(calls.single.method, 'start');
      expect(calls.single.arguments, {'port': 0});
    });

    test('preferredPort 会被透传给 native', () async {
      mockHandler((call) async => {'success': true, 'port': 8085});

      final service = EncephalonMobileService(preferredPort: 8085);
      await service.start();

      expect(calls.single.arguments, {'port': 8085});
    });

    test('native 报失败时返回 false，不标记运行中', () async {
      mockHandler((call) async => {'success': false, 'port': 0});

      final service = EncephalonMobileService();
      final ok = await service.start();

      expect(ok, isFalse);
      expect(service.isRunning, isFalse);
      expect(service.port, isNull);
    });

    test('channel 抛异常时降级成 false，不炸调用方', () async {
      mockHandler((call) async => throw PlatformException(code: 'SO_NOT_LOADED'));

      final service = EncephalonMobileService();
      final ok = await service.start();

      expect(ok, isFalse);
      expect(service.isRunning, isFalse);
    });

    test('已经在跑时重复 start 不会打到 native', () async {
      mockHandler((call) async => {'success': true, 'port': 1234});

      final service = EncephalonMobileService();
      await service.start();
      expect(calls.length, 1);

      final ok = await service.start();

      expect(ok, isTrue);
      expect(calls.length, 1, reason: '重复 start 不该再调一次 native');
    });
  });

  group('EncephalonMobileService.stop', () {
    test('停止后清掉端口和运行标记', () async {
      mockHandler((call) async {
        if (call.method == 'start') return {'success': true, 'port': 1234};
        if (call.method == 'stop') return true;
        return null;
      });

      final service = EncephalonMobileService();
      await service.start();

      final ok = await service.stop();

      expect(ok, isTrue);
      expect(service.isRunning, isFalse);
      expect(service.port, isNull);
    });

    test('没在跑时 stop 直接返回 true', () async {
      mockHandler((call) async => true);

      final service = EncephalonMobileService();
      final ok = await service.stop();

      expect(ok, isTrue);
      expect(calls, isEmpty, reason: '没在跑就不该调 native');
    });
  });

  group('EncephalonMobileService.infer', () {
    test('解析状态码与响应体', () async {
      // 用 utf8.encode 而不是 codeUnits —— 后者给的是 UTF-16 码元，
      // 中文会被截成一个 16 位值，不是真正的 UTF-8 字节。
      final payload = Uint8List.fromList(utf8.encode('{"answer":"影"}'));
      mockHandler((call) async {
        return {'status': 200, 'body': payload};
      });

      final service = EncephalonMobileService();
      final result = await service.infer(
        path: '/v1/chat/completions',
        body: Uint8List.fromList([1, 2, 3]),
      );

      expect(result, isNotNull);
      expect(result!.status, 200);
      expect(result.isSuccess, isTrue);
      expect(result.body, payload);
      expect(result.bodyText, '{"answer":"影"}');
      expect(calls.single.method, 'infer');
      expect(calls.single.arguments['path'], '/v1/chat/completions');
    });

    test('body 是 List<int> 时也能转成 Uint8List', () async {
      mockHandler((call) async {
        return {'status': 500, 'body': <int>[104, 105]};
      });

      final service = EncephalonMobileService();
      final result = await service.infer(
        path: '/v1/chat/completions',
        body: Uint8List(0),
      );

      expect(result!.status, 500);
      expect(result.isSuccess, isFalse);
      expect(result.bodyText, 'hi');
    });

    test('native 抛异常时返回 null', () async {
      mockHandler((call) async => throw PlatformException(code: 'INFER_FAILED'));

      final service = EncephalonMobileService();
      final result = await service.infer(
        path: '/v1/chat/completions',
        body: Uint8List(0),
      );

      expect(result, isNull);
    });
  });

  group('EncephalonMobileService.getStatus', () {
    test('返回 native 给的状态', () async {
      mockHandler((call) async {
        return {'running': true, 'port': 4242, 'healthy': true};
      });

      final service = EncephalonMobileService();
      final status = await service.getStatus();

      expect(status['running'], isTrue);
      expect(status['port'], 4242);
      expect(status['healthy'], isTrue);
    });

    test('异常时降级成未运行', () async {
      mockHandler((call) async => throw PlatformException(code: 'BOOM'));

      final service = EncephalonMobileService();
      final status = await service.getStatus();

      expect(status['running'], isFalse);
      expect(status['healthy'], isFalse);
    });
  });
}
