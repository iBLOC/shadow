import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// MNN Engine Flutter Platform Channel
///
/// This class provides the Dart interface to the native MNN LLM engine.
/// Only available on Android platform. All methods are no-op on other platforms.
class MNNEngine {
  static const MethodChannel _channel = MethodChannel('com.ibloc.shadow/mnn');

  /// Whether MNN engine is supported on this platform
  static bool get isSupported => Platform.isAndroid;

  /// Initialize the MNN engine
  ///
  /// [modelPath] - Path to the model directory
  /// [threadNum] - Number of threads for CPU inference
  /// [backendType] - Backend type: 0=CPU, 1=OpenCL, 2=Metal
  ///
  /// Returns false immediately on non-Android platforms.
  static Future<bool> initialize({
    required String modelPath,
    int threadNum = 4,
    int backendType = 0,
  }) async {
    if (!isSupported) {
      debugPrint('MNN Engine: Not supported on this platform');
      return false;
    }

    try {
      final result = await _channel.invokeMethod<bool>('initialize', {
        'modelPath': modelPath,
        'threadNum': threadNum,
        'backendType': backendType,
      });
      return result ?? false;
    } on PlatformException catch (e) {
      debugPrint('Failed to initialize MNN: ${e.message}');
      return false;
    }
  }

  /// Load an LLM model
  ///
  /// [configPath] - Path to the model config.json
  static Future<bool> loadModel(String configPath) async {
    if (!isSupported) return false;

    try {
      final result = await _channel.invokeMethod<bool>('loadModel', {
        'configPath': configPath,
      });
      return result ?? false;
    } on PlatformException catch (e) {
      debugPrint('Failed to load model: ${e.message}');
      return false;
    }
  }

  /// Generate a response from the LLM
  ///
  /// [prompt] - Input prompt
  static Future<String> generate(String prompt) async {
    if (!isSupported) {
      return 'Error: MNN engine is only supported on Android';
    }

    try {
      final result = await _channel.invokeMethod<String>('generate', {
        'prompt': prompt,
      });
      return result ?? '';
    } on PlatformException catch (e) {
      debugPrint('Failed to generate: ${e.message}');
      return 'Error: ${e.message}';
    }
  }

  /// Get information about the loaded model
  static Future<String> getModelInfo() async {
    if (!isSupported) return 'Not available on this platform';

    try {
      final result = await _channel.invokeMethod<String>('getModelInfo');
      return result ?? 'Unknown';
    } on PlatformException catch (e) {
      debugPrint('Failed to get model info: ${e.message}');
      return 'Error: ${e.message}';
    }
  }

  /// Check if MNN is initialized
  static Future<bool> isInitialized() async {
    if (!isSupported) return false;

    try {
      final result = await _channel.invokeMethod<bool>('isInitialized');
      return result ?? false;
    } on PlatformException {
      return false;
    }
  }

  /// Check if model is loaded
  static Future<bool> isModelLoaded() async {
    if (!isSupported) return false;

    try {
      final result = await _channel.invokeMethod<bool>('isModelLoaded');
      return result ?? false;
    } on PlatformException {
      return false;
    }
  }

  /// Release all resources
  static Future<void> release() async {
    if (!isSupported) return;

    try {
      await _channel.invokeMethod<void>('release');
    } on PlatformException catch (e) {
      debugPrint('Failed to release: ${e.message}');
    }
  }
}

/// OpenAI API Server Manager
///
/// Provides methods to control the local OpenAI-compatible API server.
/// Only available on Android platform.
class APIServer {
  static const MethodChannel _channel = MethodChannel('com.ibloc.shadow/mnn');

  /// Whether API server is supported on this platform
  static bool get isSupported => Platform.isAndroid;

  /// Start the API server
  ///
  /// [port] - Server port (default: 8080)
  static Future<bool> startServer({int port = 8080}) async {
    if (!isSupported) {
      debugPrint('API Server: Not supported on this platform');
      return false;
    }

    try {
      final result = await _channel.invokeMethod<bool>('startServer', {
        'port': port,
      });
      return result ?? false;
    } on PlatformException catch (e) {
      debugPrint('Failed to start server: ${e.message}');
      return false;
    }
  }

  /// Stop the API server
  static Future<void> stopServer() async {
    if (!isSupported) return;

    try {
      await _channel.invokeMethod<void>('stopServer');
    } on PlatformException catch (e) {
      debugPrint('Failed to stop server: ${e.message}');
    }
  }

  /// Check if server is running
  static Future<bool> isServerRunning() async {
    if (!isSupported) return false;

    try {
      final result = await _channel.invokeMethod<bool>('isServerRunning');
      return result ?? false;
    } on PlatformException {
      return false;
    }
  }

  /// Get server URL
  static Future<String> getServerUrl() async {
    if (!isSupported) return '';

    try {
      final result = await _channel.invokeMethod<String>('getServerUrl');
      return result ?? '';
    } on PlatformException {
      return '';
    }
  }

  /// Get API key
  static Future<String> getApiKey() async {
    if (!isSupported) return '';

    try {
      final result = await _channel.invokeMethod<String>('getApiKey');
      return result ?? '';
    } on PlatformException {
      return '';
    }
  }

  /// Set API key
  static Future<void> setApiKey(String key) async {
    if (!isSupported) return;

    try {
      await _channel.invokeMethod<void>('setApiKey', {'key': key});
    } on PlatformException catch (e) {
      debugPrint('Failed to set API key: ${e.message}');
    }
  }

  /// Enable/disable authentication
  static Future<void> setAuthEnabled(bool enabled) async {
    if (!isSupported) return;

    try {
      await _channel.invokeMethod<void>('setServerAuthEnabled', {
        'enabled': enabled,
      });
    } on PlatformException catch (e) {
      debugPrint('Failed to set auth: ${e.message}');
    }
  }
}
