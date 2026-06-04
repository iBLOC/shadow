import 'dart:convert';
import 'package:flutter/services.dart';
import 'litert_model.dart';

class LitertEngine {
  static const _channel = MethodChannel('com.ibloc.shadow/litert');

  LiteRTModel _currentModel = LiteRTModels.defaultModel;
  bool _isInitialized = false;
  bool get isInitialized => _isInitialized;

  String? _lastError;
  String? get lastError => _lastError;

  final String _responseText = '';
  String get responseText => _responseText;

  LiteRTModel get currentModel => _currentModel;

  void setModel(LiteRTModel model) {
    _currentModel = model;
  }

  Future<bool> initialize({
    required String modelPath,
    int timeoutMs = 15000,
  }) async {
    final startTime = DateTime.now();
    try {
      final result = await _channel.invokeMethod<bool>(
        'initializeWithTimeout',
        {'modelPath': modelPath, 'timeoutMs': timeoutMs},
      );

      final elapsed = DateTime.now().difference(startTime).inMilliseconds;
      _isInitialized = result ?? false;
      if (!_isInitialized) {
        _lastError ??=
            await _channel.invokeMethod<String>('getLastError') ??
            'Initialization failed after ${elapsed}ms';
      } else {
        // ignore: avoid_print
        print('LitertEngine.initialize succeeded in ${elapsed}ms');
      }
      return _isInitialized;
    } catch (e) {
      _lastError = e.toString();
      _isInitialized = false;
      return false;
    }
  }

  Future<Map<String, dynamic>> diagnoseModelDirectory(String modelPath) async {
    try {
      final result = await _channel.invokeMethod<Map<Object?, Object?>>(
        'diagnose',
        {'modelPath': modelPath},
      );
      if (result == null) {
        return {
          'exists': false,
          'dispatchLibraryPresent': false,
          'modelFiles': <String>[],
          'totalSize': 0,
          'recommendation': 'download',
        };
      }
      return {
        'exists': result['exists'] ?? false,
        'dispatchLibraryPresent': result['dispatchLibraryPresent'] ?? false,
        'modelFiles':
            (result['modelFiles'] as List?)?.cast<String>() ?? <String>[],
        'totalSize': (result['totalSize'] as num?)?.toInt() ?? 0,
        'recommendation': result['recommendation'] ?? 'download',
      };
    } catch (e) {
      return {
        'exists': false,
        'dispatchLibraryPresent': false,
        'modelFiles': <String>[],
        'totalSize': 0,
        'recommendation': 'download',
        'error': e.toString(),
      };
    }
  }

  Future<String> generateContent(String prompt) async {
    if (!_isInitialized) {
      throw StateError('LitertEngine not initialized');
    }
    try {
      final result = await _channel.invokeMethod<String>('generateContent', {
        'prompt': prompt,
      });
      return result ?? '';
    } catch (e) {
      throw Exception('Failed to generate content: $e');
    }
  }

  Future<String> generateContentWithAttachments(
    String prompt,
    List<Map<String, dynamic>> attachments,
  ) async {
    if (!_isInitialized) {
      throw StateError('LitertEngine not initialized');
    }
    try {
      final content = <String, dynamic>{'prompt': prompt, 'parts': attachments};
      final result = await _channel.invokeMethod<String>(
        'generateContentStream',
        {'content': jsonEncode(content)},
      );
      return result ?? '';
    } catch (e) {
      throw Exception('Failed to generate content with attachments: $e');
    }
  }

  Future<void> generateContentStream(String prompt) async {
    if (!_isInitialized) {
      throw StateError('LitertEngine not initialized');
    }
    try {
      await _channel.invokeMethod<bool>('generateContentStream', {
        'prompt': prompt,
      });
    } catch (e) {
      throw Exception('Failed to generate content stream: $e');
    }
  }

  Future<String?> getResponseText() async {
    try {
      return await _channel.invokeMethod<String>('getResponseText');
    } catch (e) {
      return null;
    }
  }

  Future<Map<String, int>?> getDownloadProgress() async {
    try {
      final result = await _channel.invokeMethod<Map>('getDownloadProgress');
      if (result == null) return null;
      return {
        'downloaded': (result['downloaded'] as num?)?.toInt() ?? 0,
        'total': (result['total'] as num?)?.toInt() ?? 0,
      };
    } catch (e) {
      return null;
    }
  }

  Future<bool> isLoading() async {
    try {
      return await _channel.invokeMethod<bool>('isLoading') ?? false;
    } catch (e) {
      return false;
    }
  }

  Future<bool> release() async {
    try {
      await _channel.invokeMethod<bool>('release');
      _isInitialized = false;
      return true;
    } catch (e) {
      return false;
    }
  }
}
