import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../services/encephalon/encephalon_mobile_provider.dart';

enum ServiceStatus { unknown, checking, healthy, unhealthy, offline }

class ServiceInfo {
  final String name;
  final String displayName;
  final String host;
  final int port;
  final String path;
  ServiceStatus status;
  int? latencyMs;
  String? error;
  DateTime? lastCheck;

  ServiceInfo({
    required this.name,
    required this.displayName,
    required this.host,
    required this.port,
    this.path = '/health',
    this.status = ServiceStatus.unknown,
    this.latencyMs,
    this.error,
    this.lastCheck,
  });

  String get url => 'http://$host:$port$path';
}

/// 服务状态 —— 反映**这台设备真实的拓扑**，只报真的会跑的东西。
///
/// ⚠️ **病史（2026-11-01 真机修复）**：这里探的曾是写死的**桌面拓扑
/// 三件套** —— `localhost:8080`（Resonance）/ `localhost:60080`（桌面
/// sidecar 端脑）/ `localhost:8081`（本地海马体）。手机上**一个都不存在**：
/// 嵌入式端脑绑**随机端口**（每次启动都变，`EncephalonMobileService.agentPort`），
/// Resonance 不是移动端的东西，海马体在移动端根本不编本地（记忆走零信任
/// 网络）⇒ 三行**永远「离线」**，而真正活着的大脑反倒没人探 ——
/// 「探针指错门」：判据在动（`Connection refused` 是真的），语义是错的。
///
/// 现在只有一行：**嵌入式端脑**，探它**真实的**端脑面端口上的
/// `/health` —— 免鉴权（真机实测 200；`/health` 在端脑面
/// 上是 404，别用）。
class ServiceNotifier extends StateNotifier<List<ServiceInfo>> {
  final http.Client _client;
  final int? Function() _agentPortResolver;
  final bool Function() _isRunningResolver;

  ServiceNotifier({
    http.Client? client,
    int? Function()? agentPortResolver,
    bool Function()? isRunningResolver,
  }) : _client = client ?? http.Client(),
       _agentPortResolver = agentPortResolver ?? (() => null),
       _isRunningResolver = isRunningResolver ?? (() => false),
       super(const []);

  /// 嵌入式大脑的独占一行。大脑没在跑时说「未知 + 未启动」，
  /// **不说「离线」** —— 没有任何该活的东西死了（对话页会自动拉起）。
  List<ServiceInfo> _rows({
    int? port,
    ServiceStatus? status,
    int? latencyMs,
    String? error,
  }) {
    return [
      ServiceInfo(
        name: 'encephalon',
        displayName: 'Encephalon',
        host: '127.0.0.1',
        port: port ?? 0,
        path: '/health',
        status: status ?? ServiceStatus.unknown,
        latencyMs: latencyMs,
        error: error,
        lastCheck: DateTime.now(),
      ),
    ];
  }

  Future<void> checkAll() async {
    final port = _agentPortResolver();
    final running = _isRunningResolver();

    if (!running || port == null || port <= 0) {
      state = _rows(
        status: ServiceStatus.unknown,
        error: '大脑未启动 —— 进入对话页会自动拉起',
      );
      return;
    }

    state = _rows(port: port, status: ServiceStatus.checking);

    final result = await _probe('127.0.0.1', port, '/.well-known/agent.json');

    state = [
      if (result.ok)
        ..._rows(
          port: port,
          status: ServiceStatus.healthy,
          latencyMs: result.latencyMs,
        )
      else
        ..._rows(
          port: port,
          status: ServiceStatus.unhealthy,
          error: result.error,
        ),
    ];
  }

  Future<({bool ok, int? latencyMs, String? error})> _probe(
    String host,
    int port,
    String path,
  ) async {
    final stopwatch = Stopwatch()..start();
    try {
      final uri = Uri.parse('http://$host:$port$path');
      final response = await _client
          .get(uri)
          .timeout(const Duration(seconds: 3));
      stopwatch.stop();

      if (response.statusCode >= 200 && response.statusCode < 400) {
        return (
          ok: true,
          latencyMs: stopwatch.elapsedMilliseconds,
          error: null,
        );
      }
      return (
        ok: false,
        latencyMs: stopwatch.elapsedMilliseconds,
        error: 'HTTP ${response.statusCode}',
      );
    } on TimeoutException {
      stopwatch.stop();
      return (
        ok: false,
        latencyMs: stopwatch.elapsedMilliseconds,
        error: 'Timeout',
      );
    } catch (e) {
      stopwatch.stop();
      return (
        ok: false,
        latencyMs: stopwatch.elapsedMilliseconds,
        error: e.toString(),
      );
    }
  }
}

final serviceProvider =
    StateNotifierProvider<ServiceNotifier, List<ServiceInfo>>((ref) {
      final service = ref.read(encephalonMobileServiceProvider);
      return ServiceNotifier(
        agentPortResolver: () => service.agentPort,
        isRunningResolver: () => service.isRunning,
      );
    });
