import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logging/logging.dart';
import 'prefrontal_mobile_service.dart';

/// Prefrontal 移动端状态
class PrefrontalMobileState {
  final PrefrontalMobileStatus status;
  final int? port;
  final String? errorMessage;
  final List<MobileAgentInfo> agents;

  const PrefrontalMobileState({
    this.status = PrefrontalMobileStatus.stopped,
    this.port,
    this.errorMessage,
    this.agents = const [],
  });

  PrefrontalMobileState copyWith({
    PrefrontalMobileStatus? status,
    int? port,
    String? errorMessage,
    List<MobileAgentInfo>? agents,
  }) {
    return PrefrontalMobileState(
      status: status ?? this.status,
      port: port ?? this.port,
      errorMessage: errorMessage,
      agents: agents ?? this.agents,
    );
  }
}

/// Prefrontal 移动端 Notifier
class PrefrontalMobileNotifier extends StateNotifier<PrefrontalMobileState> {
  static final _log = Logger('PrefrontalMobileNotifier');

  final PrefrontalMobileService _service;

  PrefrontalMobileNotifier(this._service)
      : super(const PrefrontalMobileState()) {
    _init();
  }

  Future<void> _init() async {
    // 检查服务是否已经在运行
    try {
      final status = await _service.getStatus();
      if (status['running'] == true) {
        state = state.copyWith(
          status: PrefrontalMobileStatus.running,
          port: status['port'] as int?,
        );
        _log.info('检测到 Prefrontal 服务已在运行, 端口: ${state.port}');
      }
    } catch (e) {
      _log.fine('初始化检查失败: $e');
    }
  }

  /// 启动服务
  Future<bool> start() async {
    if (state.status == PrefrontalMobileStatus.running) {
      _log.warning('服务已在运行中');
      return true;
    }

    state = state.copyWith(
      status: PrefrontalMobileStatus.starting,
      errorMessage: null,
    );

    try {
      // 1. 启动 Android Service
      await _service.startAndroidService();

      // 2. 通过 MethodChannel 启动 Prefrontal 嵌入式运行时
      final success = await _service.start();

      if (success) {
        state = state.copyWith(
          status: PrefrontalMobileStatus.running,
          port: _service.port,
          errorMessage: null,
        );
        _log.info('Prefrontal 嵌入式运行时启动成功, 端口: ${state.port}');
        return true;
      } else {
        state = state.copyWith(
          status: PrefrontalMobileStatus.error,
          errorMessage: '启动失败',
        );
        return false;
      }
    } catch (e, stack) {
      _log.severe('启动 Prefrontal 失败', e, stack);
      state = state.copyWith(
        status: PrefrontalMobileStatus.error,
        errorMessage: e.toString(),
      );
      return false;
    }
  }

  /// 停止服务
  Future<bool> stop() async {
    if (state.status == PrefrontalMobileStatus.stopped) {
      return true;
    }

    state = state.copyWith(status: PrefrontalMobileStatus.stopping);

    try {
      // 1. 停止 Prefrontal 嵌入式运行时
      await _service.stop();

      // 2. 停止 Android Service
      await _service.stopAndroidService();

      state = const PrefrontalMobileState();
      _log.info('Prefrontal 嵌入式运行时已停止');
      return true;
    } catch (e, stack) {
      _log.severe('停止 Prefrontal 失败', e, stack);
      state = state.copyWith(
        status: PrefrontalMobileStatus.error,
        errorMessage: e.toString(),
      );
      return false;
    }
  }

  /// 刷新智能体列表
  Future<void> refreshAgents() async {
    if (state.status != PrefrontalMobileStatus.running) {
      return;
    }

    try {
      // 通过 HTTP 获取智能体列表
      final response = await _service.httpGet('/api/v1/cluster/agents');
      if (response != null) {
        final body = jsonDecode(response);
        if (body is List) {
          final agents = body
              .map((e) => MobileAgentInfo.fromMap(Map<String, dynamic>.from(e as Map)))
              .toList();
          state = state.copyWith(agents: agents);
        }
      }
    } catch (e, stack) {
      _log.warning('刷新智能体列表失败', e, stack);
    }
  }

  /// 注册智能体
  Future<bool> registerAgent({
    required String agentId,
    required String name,
    required String description,
  }) async {
    if (state.status != PrefrontalMobileStatus.running) {
      throw StateError('Prefrontal 服务未运行');
    }

    try {
      // 通过 JNI 注册（更快）
      final success = await _service.registerAgent(
        agentId: agentId,
        name: name,
        description: description,
      );

      if (success) {
        await refreshAgents();
        _log.info('智能体注册成功: $agentId');
      }

      return success;
    } catch (e, stack) {
      _log.severe('注册智能体失败', e, stack);
      return false;
    }
  }

  /// 调用智能体 (优先使用 JNI，回退到 HTTP)
  Future<String?> invokeAgent({
    required String agentId,
    required String input,
  }) async {
    if (state.status != PrefrontalMobileStatus.running) {
      throw StateError('Prefrontal 服务未运行');
    }

    // 尝试 JNI (更快, 同进程直接调用)
    var result = await _service.invokeAgentViaJni(
      agentId: agentId,
      input: input,
    );

    // 如果 JNI 失败, 回退到 HTTP
    if (result == null) {
      _log.fine('JNI 调用失败, 回退到 HTTP');
      result = await _service.invokeAgentViaHttp(
        agentId: agentId,
        input: input,
      );
    }

    return result;
  }

  /// 健康检查
  Future<bool> healthCheck() async {
    return await _service.isHealthy();
  }

  @override
  void dispose() {
    _service.dispose();
    super.dispose();
  }
}

// 导入 jsonDecode
import 'dart:convert' show jsonDecode;

/// 默认服务实例 Provider
final prefrontalMobileServiceProvider = Provider<PrefrontalMobileService>((ref) {
  return PrefrontalMobileService();
});

/// Prefrontal 移动端 Provider
final prefrontalMobileProvider =
    StateNotifierProvider<PrefrontalMobileNotifier, PrefrontalMobileState>((ref) {
  final service = ref.watch(prefrontalMobileServiceProvider);
  return PrefrontalMobileNotifier(service);
});

/// 服务状态 Provider
final prefrontalMobileStatusProvider = Provider<PrefrontalMobileStatus>((ref) {
  return ref.watch(prefrontalMobileProvider).status;
});

/// 端口 Provider
final prefrontalMobilePortProvider = Provider<int?>((ref) {
  return ref.watch(prefrontalMobileProvider).port;
});

/// 智能体列表 Provider
final mobileAgentsProvider = Provider<List<MobileAgentInfo>>((ref) {
  return ref.watch(prefrontalMobileProvider).agents;
});
