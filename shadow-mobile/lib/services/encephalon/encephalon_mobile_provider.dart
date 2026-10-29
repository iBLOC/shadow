import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logging/logging.dart';

import '../../l10n/current_l10n.dart';
import '../../providers/telencephalon_provider.dart';
import '../../screens/model_management_screen.dart';
import '../../services/database/model_item.dart';
import '../telencephalon/telencephalon_client.dart';
import 'encephalon_mobile_service.dart';

/// Encephalon 移动端状态
class EncephalonMobileState {
  final EncephalonMobileStatus status;
  final int? port;

  /// 端脑 HTTP 面（shadow API / A2A / agent 管理）的端口。
  ///
  /// null = 大脑没在跑；0 = 大脑在跑但端脑面没起来。
  final int? agentPort;
  final String? errorMessage;

  const EncephalonMobileState({
    this.status = EncephalonMobileStatus.stopped,
    this.port,
    this.agentPort,
    this.errorMessage,
  });

  EncephalonMobileState copyWith({
    EncephalonMobileStatus? status,
    int? port,
    int? agentPort,
    String? errorMessage,
  }) {
    return EncephalonMobileState(
      status: status ?? this.status,
      port: port ?? this.port,
      agentPort: agentPort ?? this.agentPort,
      errorMessage: errorMessage,
    );
  }
}

/// Encephalon 移动端状态机
enum EncephalonMobileStatus { stopped, starting, running, stopping, error }

/// Encephalon 移动端 Notifier
class EncephalonMobileNotifier extends StateNotifier<EncephalonMobileState> {
  static final _log = Logger('EncephalonMobileNotifier');

  /// 启动尝试次数：首次 + 2 次重试。
  ///
  /// App 刚起来时端口、SQLite、native 库都可能在「还在就绪途中」，
  /// 一次失败不该让用户手动再点一次。
  static const int _maxStartAttempts = 3;

  /// 重试间隔（第一次重试等这么久，第二次翻倍）。
  static const Duration _retryDelay = Duration(seconds: 2);

  /// 等大脑就绪的上限。
  ///
  /// 启动流程自己最多试 3 次（中间还有 2s / 4s 退避），所以这里留够
  /// 一次完整启动的预算 —— 但**必须有上限**：起不来也不能把用户永远
  /// 吊在「发送中」。
  static const Duration _readyTimeout = Duration(seconds: 15);

  final EncephalonMobileService _service;
  final Ref<EncephalonMobileState> _ref;

  /// 正在跑的启动流程 —— 用来避免并发 boot 两次。
  Future<bool>? _startInFlight;

  /// 用户**主动**停过大脑。
  ///
  /// 有了这个标记，「等大脑就绪」的门才不会把用户刚停掉的大脑偷偷
  /// 拉回来 —— 那个语义是用户自己选的，要恢复得他自己点「启动大脑」。
  bool _stoppedByUser = false;

  EncephalonMobileNotifier(this._service, this._ref)
      : super(const EncephalonMobileState()) {
    // 把「等大脑就绪」的门挂到端脑 client 上。
    //
    // 嵌入式大脑启动要几秒，这期间端脑 client 还指着没人监听的默认端口
    // ⇒ 请求会 connection refused。挂上门之后，**启动期间发出的第一条
    // 消息会等大脑起来**，而不是直接失败。
    _ref.read(telencephalonClientProvider).setReadinessGate(waitUntilReady);
    _init();
  }

  /// 等大脑就绪 —— 端脑 client 的就绪门。
  ///
  /// 语义：
  /// - 大脑在跑 ⇒ 立即返回；
  /// - 大脑没在跑 ⇒ **拉起来再等**（这就是「默认启动，不需要开关」）；
  /// - 用户主动停过 ⇒ 立即返回（不偷偷把用户刚停掉的大脑拉回来）。
  ///
  /// 带上限：起不来就让请求照常失败，别把用户永远吊在这儿。
  Future<void> waitUntilReady() async {
    if (_stoppedByUser) return;
    if (state.status == EncephalonMobileStatus.running) return;
    try {
      await ensureStarted().timeout(_readyTimeout);
    } catch (_) {
      // 起不来 —— 请求照常发出去，按它本来的语义失败。
    }
  }

  /// 初始化：**默认把大脑拉起来**。
  ///
  /// 以前这个函数只查状态、查到没在跑就停在那儿 —— 于是用户必须去
  /// 「我 → 设置 → 嵌入式大脑」点一下「启动大脑」，否则移动端整条
  /// 「大脑 → 端脑 → 叶区」链路是断的（对话页会一直「初始化中…」，
  /// 端脑 client 也还指着没人监听的 `:60080`）。
  ///
  /// 现在：进程里已经在跑（App 被系统重建后进程还在）就接管它；
  /// 否则**自动启动**。用户不需要任何开关。
  Future<void> _init() async {
    // 检查运行时是否已经在跑（比如 App 被系统重建后进程还在）。
    try {
      final status = await _service.getStatus();
      if (!mounted) return;
      if (status['running'] == true) {
        state = state.copyWith(
          status: EncephalonMobileStatus.running,
          port: status['port'] as int?,
          agentPort: status['agentPort'] as int?,
        );
        _log.info(
          '检测到嵌入式大脑已在运行, 端口: ${state.port}, 端脑面: ${state.agentPort}',
        );
        _pointClientsAtAgentSurface(state.agentPort);
        return;
      }
    } catch (e) {
      _log.fine('初始化检查失败: $e');
    }
    // 没在跑 —— **默认拉起来**。
    await ensureStarted();
  }

  /// 拉起嵌入式大脑（幂等）。
  ///
  /// - 已经在跑 ⇒ 直接返回 true；
  /// - 已经在启动流程里 ⇒ 返回那个流程的结果，**不并发 boot 第二次**
  ///   （native 侧虽然也幂等，但没必要白跑一趟）。
  ///
  /// 这是「默认启动」的唯一入口：App 启动时调它，页面上的按钮也调它。
  Future<bool> ensureStarted() {
    if (state.status == EncephalonMobileStatus.running) {
      return Future<bool>.value(true);
    }
    return _startInFlight ??= _startWithRetry().whenComplete(() {
      _startInFlight = null;
    });
  }

  /// 启动流程（带重试）。
  Future<bool> _startWithRetry() async {
    for (var attempt = 1; attempt <= _maxStartAttempts; attempt++) {
      if (!mounted) return false;
      state = state.copyWith(
        status: EncephalonMobileStatus.starting,
        errorMessage: null,
      );

      try {
        // 启动前把「宿主配的云端供应商」交给大脑。
        //
        // neuron 的 remote 引擎只认环境变量（NEURON_REMOTE_BASE_URL 等），
        // 而 Android App 进程的环境变量由 zygote 决定、宿主注入不了 ——
        // 所以只能走这条程序化通道：MethodChannel → JNI → Rust → 注册进
        // neuron 的派发表。叶区随后会按这个模型 id 去请求 neuron。
        await _applyCloudProvider();

        final success = await _service.start();
        if (!mounted) return false;
        if (success) {
          final agentPort = _service.agentPort;
          state = state.copyWith(
            status: EncephalonMobileStatus.running,
            port: _service.port,
            agentPort: agentPort,
            errorMessage: null,
          );
          _log.info(
            '嵌入式大脑启动成功, 端口: ${state.port}, 端脑面: ${state.agentPort}',
          );
          _pointClientsAtAgentSurface(agentPort);
          return true;
        }
        state = state.copyWith(
          status: EncephalonMobileStatus.error,
          errorMessage: currentL10n().encephalonStartFailed,
        );
      } catch (e, stack) {
        _log.severe('启动嵌入式大脑失败', e, stack);
        if (!mounted) return false;
        state = state.copyWith(
          status: EncephalonMobileStatus.error,
          errorMessage: e.toString(),
        );
      }

      if (attempt < _maxStartAttempts) {
        _log.info('嵌入式大脑启动失败（第 $attempt 次）—— 稍后重试');
        await Future.delayed(_retryDelay * attempt);
      }
    }
    return false;
  }

  /// 启动嵌入式大脑（页面上「启动大脑」按钮走这条）。
  ///
  /// 按钮**只在没在跑的时候出现** —— 大脑默认就在跑，那个按钮是
  /// 失败/手动停掉之后的恢复入口，不是「用这个功能之前要先打开的开关」。
  ///
  /// 点它 = 用户明确要大脑跑起来 ⇒ 解除「用户主动停过」的标记，
  /// 之后端脑请求又可以自动等它就绪了。
  Future<bool> start() {
    _stoppedByUser = false;
    return ensureStarted();
  }

  /// 把 App 里配好的云端供应商推给嵌入式大脑。
  ///
  /// 取第一个「云端供应商」模型（`ModelSource.cloudProvider`）—— endpoint
  /// 和 model 都得有，缺一个都跑不起来（neuron 拼的是
  /// `{endpoint}/chat/completions`，叶区按 model 去请求）。
  ///
  /// 没配云端供应商时**不报错**：大脑照样起来，只是叶区没有可用模型
  /// （会回 `NO_MODEL_CONFIGURED`），本地权重那条路仍然可用。
  Future<void> _applyCloudProvider() async {
    // 等模型列表**首次加载完** —— 第一次读 provider 时列表还是空的
    // （加载是异步的），不等会误判成「用户没配云端供应商」。
    try {
      await _ref.read(modelsProvider.notifier).ready;
    } catch (e) {
      _log.warning('模型列表加载失败: $e');
    }
    final models = _ref.read(modelsProvider).models;
    ModelItem? cloud;
    for (final m in models) {
      if (m.source != ModelSource.cloudProvider) continue;
      if ((m.endpoint ?? '').trim().isEmpty) continue;
      if ((m.model ?? '').trim().isEmpty) continue;
      cloud = m;
      break;
    }
    if (cloud == null) {
      _log.info('未配置云端供应商 —— 大脑只会有本地权重可用');
      return;
    }
    final ok = await _service.setLlmProvider(
      baseUrl: (cloud.endpoint ?? '').trim(),
      apiKey: cloud.apiKey ?? '',
      model: (cloud.model ?? '').trim(),
    );
    if (ok) {
      _log.info('云端供应商已交给大脑: ${cloud.endpoint} model=${cloud.model}');
    } else {
      _log.warning('云端供应商交接失败: ${cloud.endpoint}');
    }
  }

  /// 停止嵌入式大脑
  Future<bool> stop() async {
    if (state.status == EncephalonMobileStatus.stopped) {
      return true;
    }

    state = state.copyWith(status: EncephalonMobileStatus.stopping);
    // 用户主动停的 —— 记一笔，免得「等大脑就绪」的门把它偷偷拉回来。
    _stoppedByUser = true;

    try {
      await _service.stop();
      state = const EncephalonMobileState();
      _log.info('嵌入式大脑已停止');
      _restoreExternalEndpoint();
      return true;
    } catch (e, stack) {
      _log.severe('停止嵌入式大脑失败', e, stack);
      state = state.copyWith(
        status: EncephalonMobileStatus.error,
        errorMessage: e.toString(),
      );
      return false;
    }
  }

  /// 健康检查
  Future<bool> healthCheck() async {
    return _service.isHealthy();
  }

  /// 重新读一次运行态。
  ///
  /// 用途：App 被系统重建后进程可能还活着（native 侧仍在跑），
  /// 页面下拉刷新时用它把 UI 状态同步过来。
  Future<void> refreshStatus() async {
    // 正在启动中就别覆盖状态 —— 启动流程自己会把状态改成 running /
    // error，被这里抢先写成 stopped 会让 UI 闪一下。
    if (_startInFlight != null) return;
    try {
      final status = await _service.getStatus();
      if (status['running'] == true) {
        state = state.copyWith(
          status: EncephalonMobileStatus.running,
          port: status['port'] as int?,
          agentPort: status['agentPort'] as int?,
          errorMessage: null,
        );
        _pointClientsAtAgentSurface(state.agentPort);
      } else {
        state = state.copyWith(
          status: EncephalonMobileStatus.stopped,
          port: null,
          agentPort: null,
          errorMessage: null,
        );
      }
    } catch (e) {
      _log.fine('刷新运行态失败: $e');
    }
  }

  /// 把 App 的端脑 client 指向嵌入式大脑的端脑面。
  ///
  /// **只改 client 自己的 baseUrl，不重建 provider 树** —— 重建会把
  /// 聊天历史等 Riverpod 状态一起丢掉。
  ///
  /// **只动说「端脑方言」的 client**（`TelencephalonClient`）。移动端
  /// 还有一个 `PrefrontalClient`，它说的是**前额叶方言**
  /// （`/api/sessions`、`/api/agents`、`/api/skills`、`/api/soul/*`、
  /// `/hippocampus/api/*`）—— 端脑面上一条都不存在（端脑是
  /// `/shadow/v1/*` + `/api/telencephalon/*`）。把它指过来只会把
  /// 「连接被拒」换成「404」，反而更难排查。
  void _pointClientsAtAgentSurface(int? agentPort) {
    if (agentPort == null || agentPort <= 0) {
      // 端脑面没起来 —— 保持指向外部端脑。指向一个没人监听的端口
      // 比指向外部端脑更糟：所有调用都会 connection refused。
      _log.warning('端脑面未启动, 客户端保持指向外部端脑');
      return;
    }
    final url = 'http://127.0.0.1:$agentPort';
    _ref.read(telencephalonClientProvider).setBaseUrl(url);
    _log.info('端脑 client 已指向嵌入式大脑: $url');
  }

  /// 大脑停掉后把 client 复原到外部端脑。
  void _restoreExternalEndpoint() {
    _ref
        .read(telencephalonClientProvider)
        .setBaseUrl(TelencephalonClient.defaultBaseUrl);
  }

  @override
  void dispose() {
    _service.dispose();
    super.dispose();
  }
}

/// 默认服务实例 Provider
final encephalonMobileServiceProvider = Provider<EncephalonMobileService>((ref) {
  return EncephalonMobileService();
});

/// Encephalon 移动端 Provider
final encephalonMobileProvider =
    StateNotifierProvider<EncephalonMobileNotifier, EncephalonMobileState>((ref) {
  final service = ref.watch(encephalonMobileServiceProvider);
  return EncephalonMobileNotifier(service, ref);
});

/// 运行时状态 Provider
final encephalonMobileStatusProvider = Provider<EncephalonMobileStatus>((ref) {
  return ref.watch(encephalonMobileProvider).status;
});

/// 端口 Provider
final encephalonMobilePortProvider = Provider<int?>((ref) {
  return ref.watch(encephalonMobileProvider).port;
});
