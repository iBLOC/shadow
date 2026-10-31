import 'dart:async';

import 'package:speech_to_text/speech_to_text.dart';
import 'package:speech_to_text/speech_recognition_result.dart';

enum WakeWordEvent { detectedHeyShadow, detectedNihao }

class WakeWordService {
  final SpeechToText _stt = SpeechToText();
  bool _running = false;
  bool _available = false;
  final _controller = StreamController<WakeWordEvent>.broadcast();

  Stream<WakeWordEvent> get events => _controller.stream;
  bool get isRunning => _running;

  Future<bool> start() async {
    if (_running) return true;
    try {
      _available = await _stt.initialize(
        onError: (e) => _controller.addError('stt error: $e'),
        onStatus: (_) {},
      );
    } catch (_) {
      // 设备上**没有语音识别服务**时（没装 Google 服务的国产 ROM 最典型），
      // 插件的 initialize 会直接抛 PlatformException(recognizerNotAvailable)
      // —— 插件自己**不吞**这个异常。
      // ⚠️ 唤醒词只是锦上添花，不能让它把启动流程炸成「未捕获的异步错误」
      // （2026-10-31 在小米 2106118C / Android 13 上真机实测到这条）。
      // ⇒ 走下面同一条「优雅降级」的路：告诉订阅者，然后返回 false。
      _available = false;
    }
    if (!_available) {
      _controller.addError('speech_to_text unavailable on this device');
      return false;
    }
    _running = true;
    try {
      await _stt.listen(
        onResult: _onResult,
        listenOptions: SpeechListenOptions(
          partialResults: true,
          cancelOnError: true,
          autoPunctuation: false,
          listenMode: ListenMode.dictation,
          listenFor: const Duration(seconds: 5),
          pauseFor: const Duration(seconds: 1),
        ),
      );
    } catch (_) {
      // 同理：listen 失败（权限被拒、设备被占用）也不该炸启动流程。
      _running = false;
      _available = false;
      return false;
    }
    return true;
  }

  void _onResult(SpeechRecognitionResult result) {
    if (!result.finalResult) return;
    final text = _normalize(result.recognizedWords);
    if (text.isEmpty) return;

    if (text.contains('hey shadow') ||
        text.contains('hey, shadow') ||
        text.contains('heyshadow')) {
      _controller.add(WakeWordEvent.detectedHeyShadow);
      return;
    }
    if (text.contains('你好影') ||
        text.contains('你好 影') ||
        text.contains('您好影') ||
        text.contains('nihao') ||
        text.contains('ni hao')) {
      _controller.add(WakeWordEvent.detectedNihao);
    }
  }

  String _normalize(String s) {
    return s.toLowerCase().replaceAll(RegExp(r'[\p{P}\s]+'), ' ').trim();
  }

  Future<void> stop() async {
    if (!_running) return;
    _running = false;
    if (_available) {
      await _stt.stop();
    }
    await _controller.close();
  }
}
