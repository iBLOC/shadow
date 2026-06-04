import 'package:flutter/services.dart';

class EngineService {
  static const MethodChannel _channel = MethodChannel(
    'com.ibloc.shadow/engine',
  );

  static Future<bool> startServer({
    int port = 8085,
    bool advertise = true,
    bool authEnabled = true,
  }) async {
    final result = await _channel.invokeMethod<bool>('startServer', {
      'port': port,
      'advertise': advertise,
      'authEnabled': authEnabled,
    });
    return result ?? false;
  }

  static Future<bool> stopServer() async {
    final result = await _channel.invokeMethod<bool>('stopServer');
    return result ?? false;
  }

  static Future<bool> isServerRunning() async {
    final result = await _channel.invokeMethod<bool>('isServerRunning');
    return result ?? false;
  }

  static Future<String> getServerUrl() async {
    final result = await _channel.invokeMethod<String>('getServerUrl');
    return result ?? '';
  }

  static Future<String> getApiKey() async {
    final result = await _channel.invokeMethod<String>('getApiKey');
    return result ?? '';
  }

  static Future<bool> setApiKey(String key) async {
    final result = await _channel.invokeMethod<bool>('setApiKey', {'key': key});
    return result ?? false;
  }

  static Future<bool> setAuthEnabled(bool enabled) async {
    final result = await _channel.invokeMethod<bool>('setAuthEnabled', {
      'enabled': enabled,
    });
    return result ?? false;
  }

  static Future<String?> getServiceName() async {
    return await _channel.invokeMethod<String>('getServiceName');
  }
}
