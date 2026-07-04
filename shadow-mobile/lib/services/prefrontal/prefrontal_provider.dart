import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logging/logging.dart';
import 'package:path_provider/path_provider.dart';
import 'prefrontal_service.dart';

/// Prefrontal 服务配置
class PrefrontalConfig {
  final String host;
  final int port;
  final bool clusterEnabled;
  final String? apiToken;
  final String executablePath;
  final String? configPath;
  final String? modelsPath;
  
  const PrefrontalConfig({
    this.host = '127.0.0.1',
    this.port = 8082,
    this.clusterEnabled = true,
    this.apiToken,
    required this.executablePath,
    this.configPath,
    this.modelsPath,
  });
}

/// Prefrontal 服务状态
enum PrefrontalStatus {
  stopped,
  starting,
  running,
  stopping,
  error,
}

/// Prefrontal 服务状态
class PrefrontalState {
  final PrefrontalStatus status;
  final PrefrontalService? service;
  final String? errorMessage;
  final List<AgentSpec> agents;
  
  const PrefrontalState({
    this.status = PrefrontalStatus.stopped,
    this.service,
    this.errorMessage,
    this.agents = const [],
  });
  
  PrefrontalState copyWith({
    PrefrontalStatus? status,
    PrefrontalService? service,
    String? errorMessage,
    List<AgentSpec>? agents,
  }) => PrefrontalState(
    status: status ?? this.status,
    service: service ?? this.service,
    errorMessage: errorMessage,
    agents: agents ?? this.agents,
  );
}

/// Prefrontal 服务 Provider
class PrefrontalNotifier extends StateNotifier<PrefrontalState> {
  static final _log = Logger('PrefrontalNotifier');
  
  PrefrontalNotifier() : super(const PrefrontalState());
  
  /// 启动服务
  Future<void> start(PrefrontalConfig config) async {
    if (state.status == PrefrontalStatus.running) {
      _log.warning('服务已在运行中');
      return;
    }
    
    state = state.copyWith(status: PrefrontalStatus.starting);
    
    try {
      final service = PrefrontalService(
        host: config.host,
        port: config.port,
        clusterEnabled: config.clusterEnabled,
        apiToken: config.apiToken,
      );
      
      await service.start(
        executablePath: config.executablePath,
        configPath: config.configPath,
        modelsPath: config.modelsPath,
      );
      
      state = state.copyWith(
        status: PrefrontalStatus.running,
        service: service,
        errorMessage: null,
      );
      
      // 加载智能体列表
      await refreshAgents();
      
      _log.info('Prefrontal 服务启动成功');
      
    } catch (e, stack) {
      _log.severe('启动 Prefrontal 服务失败', e, stack);
      state = state.copyWith(
        status: PrefrontalStatus.error,
        errorMessage: e.toString(),
      );
      rethrow;
    }
  }
  
  /// 停止服务
  Future<void> stop() async {
    if (state.service == null) {
      return;
    }
    
    state = state.copyWith(status: PrefrontalStatus.stopping);
    
    try {
      await state.service!.stop();
      state = const PrefrontalState();
      _log.info('Prefrontal 服务已停止');
      
    } catch (e, stack) {
      _log.severe('停止 Prefrontal 服务失败', e, stack);
      state = state.copyWith(
        status: PrefrontalStatus.error,
        errorMessage: e.toString(),
      );
    }
  }
  
  /// 刷新智能体列表
  Future<void> refreshAgents() async {
    if (state.service == null || !state.service!.isRunning) {
      return;
    }
    
    try {
      final agentsJson = await state.service!.listAgents();
      final agents = agentsJson.map((json) => AgentSpec.fromJson(json)).toList();
      state = state.copyWith(agents: agents);
      
    } catch (e, stack) {
      _log.warning('刷新智能体列表失败', e, stack);
    }
  }
  
  /// 注册智能体
  Future<void> registerAgent(AgentSpec spec) async {
    if (state.service == null || !state.service!.isRunning) {
      throw StateError('Prefrontal 服务未运行');
    }
    
    try {
      await state.service!.registerAgent(spec.toJson());
      await refreshAgents();
      _log.info('智能体注册成功: ${spec.id}');
      
    } catch (e, stack) {
      _log.severe('注册智能体失败', e, stack);
      rethrow;
    }
  }
  
  /// 加载 WASM 包
  Future<void> loadPackage({
    required String agentId,
    String? packagePath,
    String? packageId,
    String? version,
  }) async {
    if (state.service == null || !state.service!.isRunning) {
      throw StateError('Prefrontal 服务未运行');
    }
    
    try {
      await state.service!.loadPackage(
        agentId: agentId,
        packagePath: packagePath,
        packageId: packageId,
        version: version,
      );
      _log.info('WASM 包加载成功: $agentId');
      
    } catch (e, stack) {
      _log.severe('加载 WASM 包失败', e, stack);
      rethrow;
    }
  }
  
  /// 调用智能体
  Future<InvokeResult> invokeAgent({
    required String agentId,
    required String input,
  }) async {
    if (state.service == null || !state.service!.isRunning) {
      throw StateError('Prefrontal 服务未运行');
    }
    
    try {
      final result = await state.service!.invokeAgent(
        agentId: agentId,
        input: input,
      );
      
      return InvokeResult.fromJson(result);
      
    } catch (e, stack) {
      _log.severe('调用智能体失败', e, stack);
      rethrow;
    }
  }
  
  /// A2A 委托任务
  Future<Map<String, dynamic>> delegateTask({
    required String agentId,
    required String peerUrl,
    required Map<String, dynamic> payload,
  }) async {
    if (state.service == null || !state.service!.isRunning) {
      throw StateError('Prefrontal 服务未运行');
    }
    
    try {
      final result = await state.service!.delegateTask(
        agentId: agentId,
        peerUrl: peerUrl,
        payload: payload,
      );
      
      _log.info('任务委托成功: $agentId -> $peerUrl');
      return result;
      
    } catch (e, stack) {
      _log.severe('委托任务失败', e, stack);
      rethrow;
    }
  }
  
  /// 健康检查
  Future<Map<String, dynamic>> health() async {
    if (state.service == null || !state.service!.isRunning) {
      throw StateError('Prefrontal 服务未运行');
    }
    
    return await state.service!.health();
  }
  
  @override
  void dispose() {
    state.service?.dispose();
    super.dispose();
  }
}

/// Prefrontal 服务 Provider
final prefrontalProvider = StateNotifierProvider<PrefrontalNotifier, PrefrontalState>((ref) {
  return PrefrontalNotifier();
});

/// 默认配置 Provider
final prefrontalConfigProvider = Provider<PrefrontalConfig>((ref) {
  return const PrefrontalConfig(
    host: '127.0.0.1',
    port: 8082,
    clusterEnabled: true,
    executablePath: '/usr/local/bin/prefrontal', // 需要根据实际路径调整
  );
});

/// 智能体列表 Provider
final agentsProvider = Provider<List<AgentSpec>>((ref) {
  final state = ref.watch(prefrontalProvider);
  return state.agents;
});

/// 服务状态 Provider
final prefrontalStatusProvider = Provider<PrefrontalStatus>((ref) {
  final state = ref.watch(prefrontalProvider);
  return state.status;
});
