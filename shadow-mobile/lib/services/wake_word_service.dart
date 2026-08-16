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
    _available = await _stt.initialize(
      onError: (e) => _controller.addError('stt error: $e'),
      onStatus: (_) {},
    );
    if (!_available) {
      _controller.addError('speech_to_text unavailable on this device');
      return false;
    }
    _running = true;
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
