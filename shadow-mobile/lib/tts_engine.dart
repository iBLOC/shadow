import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

enum TtsEngineType {
  androidBuiltIn('Android 内置', 'android'),
  external('外部服务', 'external');

  final String label;
  final String value;
  const TtsEngineType(this.label, this.value);
}

class TtsEngine {
  static const _channel = MethodChannel('com.ibloc.shadow/tts');

  TtsEngineType _engineType = TtsEngineType.androidBuiltIn;
  String _externalUrl = '';
  bool _isInitialized = false;

  TtsEngineType get engineType => _engineType;
  String get externalUrl => _externalUrl;
  bool get isInitialized => _isInitialized;

  Future<void> setEngineType(TtsEngineType type) async {
    _engineType = type;
  }

  Future<void> setExternalUrl(String url) async {
    _externalUrl = url;
  }

  Future<bool> initialize() async {
    const maxRetries = 5;
    const retryDelay = Duration(milliseconds: 500);

    for (int i = 0; i < maxRetries; i++) {
      try {
        final result = await _channel.invokeMethod<bool>('isInitialized');
        _isInitialized = result ?? false;
        if (_isInitialized) return true;
        if (i < maxRetries - 1) {
          await Future.delayed(retryDelay);
        }
      } catch (e) {
        debugPrint('TtsEngine.initialize error: $e');
        _isInitialized = false;
        return false;
      }
    }
    return _isInitialized;
  }

  Future<bool> isAvailable() async {
    if (_engineType == TtsEngineType.external && _externalUrl.isEmpty) {
      return false;
    }
    return initialize();
  }

  Future<void> speak(String text, {String lang = 'zh-CN'}) async {
    if (text.isEmpty) return;

    if (_engineType == TtsEngineType.external && _externalUrl.isNotEmpty) {
      await _speakExternal(text, lang);
      return;
    }

    final initialized = await initialize();
    if (!initialized) {
      debugPrint('TtsEngine.speak: TTS not initialized');
      return;
    }

    try {
      await _channel.invokeMethod<bool>('speak', {'text': text, 'lang': lang});
    } catch (e) {
      debugPrint('TtsEngine.speak error: $e');
    }
  }

  Future<void> _speakExternal(String text, String lang) async {
    try {
      final client = HttpClient();
      final request = await client.postUrl(Uri.parse(_externalUrl));
      request.headers.set('Content-Type', 'application/json');
      request.write('{"text":"$text","lang":"$lang"}');
      await request.close();
      client.close();
    } catch (e) {
      debugPrint('TtsEngine._speakExternal error: $e');
    }
  }

  Future<void> stop() async {
    try {
      await _channel.invokeMethod<bool>('stop');
    } catch (e) {
      debugPrint('TtsEngine.stop error: $e');
    }
  }

  Future<bool> isSpeaking() async {
    try {
      final result = await _channel.invokeMethod<bool>('isSpeaking');
      return result ?? false;
    } catch (e) {
      debugPrint('TtsEngine.isSpeaking error: $e');
      return false;
    }
  }
}
