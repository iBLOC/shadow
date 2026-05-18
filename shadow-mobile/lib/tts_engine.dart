import 'package:flutter/services.dart';

class TtsEngine {
  static const _channel = MethodChannel('com.ibloc.shadow/tts');
  
  Future<void> speak(String text, {String lang = 'zh-CN'}) async {
    await _channel.invokeMethod<bool>('speak', {
      'text': text,
      'lang': lang,
    });
  }
  
  Future<void> stop() async {
    await _channel.invokeMethod<bool>('stop');
  }
  
  Future<bool> isSpeaking() async {
    final result = await _channel.invokeMethod<bool>('isSpeaking');
    return result ?? false;
  }
}
