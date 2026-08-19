import 'dart:async';
import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:logging/logging.dart';

/// Prefrontal NDK 嵌入方式服务
///
/// 这个服务与传统的 external-process 方式不同：
/// - 不启动外部进程
/// - Prefrontal 作为 .so 嵌入在 Android App 进程内
/// - 通过 MethodChannel 与 Android Service 通信
/// - 通过 localhost HTTP 与 Prefrontal 通信（同进程回环）
///
/// 通信流程：
/// Flutter UI
///   ↓ MethodChannel (com.ibloc.shadow/prefrontal_runtime)
/// Android Service (Kotlin)
///   ↓ JNI (nativeStart, nativeStop, etc.)
/// libprefrontal_core_lib.so (Rust)
///   ↓ HTTP (localhost:0)
/// mini HTTP server (axum, 同进程内回环)
///
/// 与外部进程方式对比：
/// - 外部进程：需要管理进程生命周期，可能在 Android 上被杀
/// - NDK 嵌入：服务与 App 绑定，进程稳定，资源占用低
class PrefrontalMobileService {
  static final _log = Logger('PrefrontalMobileService');

  /// MethodChannel 名称（与 Kotlin 端一致）
  static const _channel = MethodChannel('com.ibloc.shadow/prefrontal_runtime');

  final String host;
  final int? preferredPort;

  int? _port;
  bool _isRunning = false;
  late final http.Client _httpClient;

  PrefrontalMobileService({this.host = '127.0.0.1', this.preferredPort}) {
    _httpClient = http.Client();
  }

  /// 获取当前实际端口
  int? get port => _port;

  /// 获取 baseUrl
  String? get baseUrl => _port != null ? 'http://$host:$_port' : null;

  /// 服务是否在运行
  bool get isRunning => _isRunning;

  /// 启动嵌入式 Prefrontal
  ///
  /// 通过 MethodChannel 调用 Android Service，
  /// Service 内部通过 JNI 加载 .so 并启动运行时。
  Future<bool> start() async {
    if (_isRunning) {
      _log.warning('Prefrontal 已在运行中');
      return true;
    }

    try {
      _log.info('启动 Prefrontal 嵌入式运行时...');

      // 1. 通过 MethodChannel 启动 Android Service
      final result = await _channel.invokeMethod<Map<dynamic, dynamic>>(
        'start',
        {'port': preferredPort ?? 0},
      );

      if (result == null || result['success'] != true) {
        _log.severe('启动 Prefrontal 失败: $result');
        return false;
      }

      _port = result['port'] as int?;
      _isRunning = true;
      _log.info('Prefrontal 嵌入式运行时已启动, 端口: $_port');

      // 2. 等待服务就绪 (健康检查)
      await _waitForReady();

      return true;
    } catch (e, stack) {
      _log.severe('启动 Prefrontal 异常', e, stack);
      return false;
    }
  }

  /// 停止嵌入式 Prefrontal
  Future<bool> stop() async {
    if (!_isRunning) {
      return true;
    }

    try {
      _log.info('停止 Prefrontal 嵌入式运行时...');
      final result = await _channel.invokeMethod<bool>('stop');

      _isRunning = false;
      _port = null;

      _log.info('Prefrontal 嵌入式运行时已停止, result: $result');
      return result ?? true;
    } catch (e, stack) {
      _log.severe('停止 Prefrontal 异常', e, stack);
      return false;
    }
  }

  /// 等待服务就绪
  Future<void> _waitForReady({int maxAttempts = 30}) async {
    for (int i = 0; i < maxAttempts; i++) {
      try {
        final healthy = await isHealthy();
        if (healthy) {
          _log.info('Prefrontal 服务就绪');
          return;
        }
      } catch (e) {
        // 忽略
      }
      await Future.delayed(const Duration(milliseconds: 300));
    }
    throw TimeoutException('Prefrontal 服务启动超时');
  }

  /// 健康检查
  Future<bool> isHealthy() async {
    try {
      final result = await _channel.invokeMethod<int>('isHealthy');
      return result == 1;
    } catch (e) {
      _log.warning('健康检查失败: $e');
      return false;
    }
  }

  /// 获取服务状态
  Future<Map<String, dynamic>> getStatus() async {
    try {
      final result = await _channel.invokeMethod<Map<dynamic, dynamic>>(
        'getStatus',
      );
      return Map<String, dynamic>.from(result ?? {});
    } catch (e) {
      _log.warning('获取状态失败: $e');
      return {'running': false, 'port': 0, 'healthy': false};
    }
  }

  /// 注册智能体
  Future<bool> registerAgent({
    required String agentId,
    required String name,
    required String description,
  }) async {
    try {
      final result = await _channel.invokeMethod<bool>('registerAgent', {
        'agentId': agentId,
        'name': name,
        'description': description,
      });
      return result ?? false;
    } catch (e) {
      _log.severe('注册智能体失败: $e');
      return false;
    }
  }

  /// 调用智能体 (通过 JNI)
  Future<String?> invokeAgentViaJni({
    required String agentId,
    required String input,
  }) async {
    try {
      final result = await _channel.invokeMethod<String>('invokeAgent', {
        'agentId': agentId,
        'input': input,
      });
      return result;
    } catch (e) {
      _log.severe('JNI 调用智能体失败: $e');
      return null;
    }
  }

  /// 调用智能体 (通过 HTTP)
  Future<String?> invokeAgentViaHttp({
    required String agentId,
    required String input,
  }) async {
    if (baseUrl == null) {
      _log.warning('服务未启动, 无法调用');
      return null;
    }

    try {
      final response = await _httpClient
          .post(
            Uri.parse('$baseUrl/api/v1/cluster/agents/$agentId/invoke'),
            headers: {'Content-Type': 'application/json'},
            body: json.encode({'input': input}),
          )
          .timeout(const Duration(seconds: 30));

      if (response.statusCode == 200) {
        final body = json.decode(response.body);
        if (body is Map<String, dynamic> && body.containsKey('output')) {
          return body['output'] as String;
        }
        return response.body;
      } else {
        _log.warning('HTTP 调用失败: ${response.statusCode}');
        return null;
      }
    } catch (e) {
      _log.severe('HTTP 调用异常: $e');
      return null;
    }
  }

  /// 启动 Android Service (通过 Platform Channel)
  Future<bool> startAndroidService() async {
    try {
      await _channel.invokeMethod('startAndroidService');
      return true;
    } catch (e) {
      _log.warning('启动 Android Service 失败: $e');
      return false;
    }
  }

  /// 停止 Android Service
  Future<bool> stopAndroidService() async {
    try {
      await _channel.invokeMethod('stopAndroidService');
      return true;
    } catch (e) {
      _log.warning('停止 Android Service 失败: $e');
      return false;
    }
  }

  /// HTTP GET 请求
  Future<String?> httpGet(String path) async {
    if (baseUrl == null) return null;
    try {
      final response = await _httpClient
          .get(Uri.parse('$baseUrl$path'))
          .timeout(const Duration(seconds: 30));
      return response.body;
    } catch (e) {
      _log.warning('HTTP GET $path 失败: $e');
      return null;
    }
  }

  /// HTTP POST 请求
  Future<String?> httpPost(String path, Map<String, dynamic> body) async {
    if (baseUrl == null) return null;
    try {
      final response = await _httpClient
          .post(
            Uri.parse('$baseUrl$path'),
            headers: {'Content-Type': 'application/json'},
            body: json.encode(body),
          )
          .timeout(const Duration(seconds: 30));
      return response.body;
    } catch (e) {
      _log.warning('HTTP POST $path 失败: $e');
      return null;
    }
  }

  /// 释放资源
  Future<void> dispose() async {
    _httpClient.close();
    await stop();
  }
}

/// Prefrontal 状态
enum PrefrontalMobileStatus { stopped, starting, running, stopping, error }

/// Prefrontal 智能体信息
class MobileAgentInfo {
  final String id;
  final String name;
  final String description;
  final bool isRunning;

  MobileAgentInfo({
    required this.id,
    required this.name,
    required this.description,
    required this.isRunning,
  });

  factory MobileAgentInfo.fromMap(Map<String, dynamic> map) {
    return MobileAgentInfo(
      id: map['id'] as String? ?? '',
      name: map['name'] as String? ?? '',
      description: map['description'] as String? ?? '',
      isRunning: map['is_running'] as bool? ?? false,
    );
  }
}
