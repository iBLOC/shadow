import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/wake_word_service.dart';

/// 唤醒词服务的单测。
///
/// 验的是**设备没有语音识别服务时会不会把启动流程炸掉**。
///
/// ⚠️ 背景（2026-10-31 真机实测，设备 `ee6b4832` / 小米 2106118C / Android 13）：
/// 那台设备**没有语音识别服务** ⇒ 插件的 `SpeechToText.initialize()` 直接抛
/// `PlatformException(recognizerNotAvailable)`，而**插件自己不吞这个异常**
/// ⇒ 异常一路冒到 `WakeWordService.start()` 的调用方（fire-and-forget）
/// ⇒ 变成启动流程里的**未捕获异步错误**：
/// `E flutter: Unhandled Exception: PlatformException(recognizerNotAvailable ...)`。
///
/// ⇒ 唤醒词只是锦上添花 ⇒ 它不可用时必须**优雅降级**，不能炸。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // speech_to_text 插件的通道名（见 speech_to_text_platform_interface）。
  const channel = MethodChannel('plugin.csdcorp.com/speech_to_text');

  void mockHandler(Future<Object?> Function(MethodCall call) handler) {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, handler);
  }

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('设备没有语音识别服务时：start() 不抛异常、返回 false、不标记为运行中', () async {
    mockHandler((call) async {
      throw PlatformException(code: 'recognizerNotAvailable');
    });

    final service = WakeWordService();

    // ⚠️ 关键断言：如果异常逃出 start()，这里就会直接失败（而不是返回 false）。
    final ok = await service.start();

    expect(ok, isFalse);
    expect(service.isRunning, isFalse);
  });

  test('设备没有语音识别服务时：原因是报给订阅者，而不是默默吞掉', () async {
    mockHandler((call) async {
      throw PlatformException(code: 'recognizerNotAvailable');
    });

    final service = WakeWordService();
    final errors = <Object>[];
    final sub = service.events.listen(
      (_) {},
      onError: (Object e) => errors.add(e),
    );

    final ok = await service.start();

    expect(ok, isFalse);
    // broadcast controller 是**异步**派发的 ⇒ 得等一轮事件队列。
    await pumpEventQueue();
    expect(errors, isNotEmpty, reason: '降级也要让订阅者知道为什么');
    await sub.cancel();
  });

  test('语音服务可用时：start() 成功并标记为运行中', () async {
    mockHandler((call) async {
      switch (call.method) {
        case 'initialize':
          return true;
        default:
          return null;
      }
    });

    final service = WakeWordService();
    final ok = await service.start();

    expect(ok, isTrue);
    expect(service.isRunning, isTrue);
    await service.stop();
  });
}
