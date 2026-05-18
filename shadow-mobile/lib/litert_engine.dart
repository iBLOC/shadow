import 'package:flutter/services.dart';

class LitertEngine {
  static const _channel = MethodChannel('com.ibloc.shadow/litert');
  
  bool _isInitialized = false;
  bool get isInitialized => _isInitialized;
  
  bool _isConversationReady = false;
  bool get isConversationReady => _isConversationReady;
  
  Future<bool> initialize({
    String modelPath = '/data/local/tmp/gemma-4-e4b.litertlm',
  }) async {
    try {
      final result = await _channel.invokeMethod<bool>('initialize', {
        'modelPath': modelPath,
      });
      _isInitialized = result ?? false;
      return _isInitialized;
    } catch (e) {
      _isInitialized = false;
      return false;
    }
  }
  
  Future<String> sendMessage(String text) async {
    if (!_isInitialized) {
      throw StateError('LitertEngine not initialized');
    }
    try {
      final result = await _channel.invokeMethod<String>('sendMessage', {
        'text': text,
      });
      return result ?? '';
    } catch (e) {
      throw Exception('Failed to send message: $e');
    }
  }
  
  Future<bool> release() async {
    try {
      await _channel.invokeMethod<bool>('release');
      _isInitialized = false;
      _isConversationReady = false;
      return true;
    } catch (e) {
      return false;
    }
  }
}
