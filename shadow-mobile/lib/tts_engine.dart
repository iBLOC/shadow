import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;

enum TtsEngineType {
  androidBuiltIn('Android 内置', 'android'),
  rust('Rust TTS', 'rust'),
  external('外部服务', 'external');

  final String label;
  final String value;
  const TtsEngineType(this.label, this.value);
}

class TtsEngine {
  static const _channel = MethodChannel('com.ibloc.shadow/tts');
  static const String _rustTtsUrl = 'http://localhost:60080/v1/audio/speech';

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

    switch (_engineType) {
      case TtsEngineType.rust:
        await _speakRust(text, lang);
        break;
      case TtsEngineType.external:
        if (_externalUrl.isNotEmpty) {
          await _speakExternal(text, lang);
        }
        break;
      case TtsEngineType.androidBuiltIn:
        final initialized = await initialize();
        if (!initialized) {
          debugPrint('TtsEngine.speak: TTS not initialized');
          return;
        }
        try {
          await _channel.invokeMethod<bool>('speak', {
            'text': text,
            'lang': lang,
          });
        } catch (e) {
          debugPrint('TtsEngine.speak error: $e');
        }
        break;
    }
  }

  Future<void> _speakRust(String text, String lang) async {
    try {
      final response = await http.post(
        Uri.parse(_rustTtsUrl),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'text': text, 'voice_path': null, 'speed': null}),
      );

      if (response.statusCode != 200) {
        debugPrint('TtsEngine._speakRust: HTTP ${response.statusCode}');
        return;
      }

      final data = json.decode(response.body) as Map<String, dynamic>;
      final audioBase64 = data['audio'] as String?;
      if (audioBase64 == null || audioBase64.isEmpty) {
        debugPrint('TtsEngine._speakRust: No audio in response');
        return;
      }

      final audioBytes = base64Decode(audioBase64);
      await _playAudio(audioBytes);
    } catch (e) {
      debugPrint('TtsEngine._speakRust error: $e');
    }
  }

  Future<void> _playAudio(Uint8List audioBytes) async {
    debugPrint('TtsEngine._playAudio: Playing ${audioBytes.length} bytes');
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
