import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logging/logging.dart';

import '../../l10n/current_l10n.dart';
import '../../providers/brain_model_source_provider.dart';
import '../../providers/telencephalon_provider.dart';
import '../../screens/model_management_screen.dart';
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

  /// 用户为**外部**端脑配的 admin token。
  ///
  /// 嵌入式端脑有**自己**那把（两个域：嵌入式那把只对嵌入式端脑有效）⇒
  /// 指回外部端脑时要把这把放回去，否则用户在设置页配的 token 会丢。
  String? _userAdminToken;

  /// 设置 admin token —— 设置页给**外部**端脑配的那把。
  ///
  /// 记下来是为了「指回外部端脑」时能放回去。
  void setAdminToken(String? token) {
    _userAdminToken = (token == null || token.isEmpty) ? null : token;
    _ref.read(telencephalonClientProvider).setAdminToken(_userAdminToken);
  }

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
        // 启动前把「宿主选的模型路由」交给大脑。
        //
        // neuron 的 remote 引擎只认环境变量（NEURON_REMOTE_BASE_URL 等），
        // 而 Android App 进程的环境变量由 zygote 决定、宿主注入不了 ——
        // 所以只能走这条程序化通道：MethodChannel → JNI → Rust → 注册进
        // neuron 的派发表。叶区随后会按这个模型 id 去请求 neuron。
        await _applyModelRouting();

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

  /// 把「大脑的模型路由」交给嵌入式大脑（**启动前**）。
  ///
  /// 路由有两层（见 `BrainModelRouting`）：
  /// - **全局默认** —— 各叶区都走本地，还是都走云端；
  /// - **per-lobe 覆盖** —— 某个叶区单独换一边（前额叶本地、实际执行
  ///   任务的区域云端、颞叶本地……）。
  ///
  /// 两层合起来就是「每个叶区用哪个模型」的有效路由，一次性下发。
  ///
  /// 远端引擎**可以在运行时注册**（neuron 的派发表能后加引擎），所以
  /// 这一份只是「下次启动时用的默认值」—— 改路由**不必重启大脑**
  /// （见 [applyModelRouting] 的第 2 步）。
  ///
  /// 没配云端供应商时**不报错**：大脑照样起来，只是叶区没有远端模型可用
  /// （会回 `NO_MODEL_CONFIGURED`），本地权重那条路仍然可用。
  Future<void> _applyModelRouting() async {
    // 等模型列表**首次加载完** —— 第一次读 provider 时列表还是空的
    // （加载是异步的），不等会误判成「用户没配云端供应商」。
    try {
      await _ref.read(modelsProvider.notifier).ready;
    } catch (e) {
      _log.warning('模型列表加载失败: $e');
    }
    // 等「用户选了哪个来源」也读完 —— 没选过就是自动。
    try {
      await _ref.read(brainModelSourceProvider.notifier).ready;
    } catch (e) {
      _log.warning('模型来源设置读取失败: $e');
    }

    final routing = _ref.read(brainModelSourceProvider).routing;
    final models = _ref.read(modelsProvider).models;
    final payload = buildModelRoutingPayload(routing: routing, models: models);

    final ok = await _service.setModelRouting(payload);
    if (ok) {
      _log.info(
        '大脑模型路由已交付: 默认=${payload['default_model']}, '
        '供应商=${(payload['providers'] as List).length}, '
        '叶区覆盖=${(payload['lobe_models'] as Map).length}',
      );
    } else {
      _log.warning('大脑模型路由交付失败');
    }
  }

  /// 改**全局默认**的模型来源。
  ///
  /// **不必重启大脑** —— 远端引擎可以在运行时注册进 neuron 的派发表，
  /// 叶区的 `default_model` 也能随时改 ⇒ 换来源即时生效。
  Future<bool> applyModelSource(BrainModelSource source) async {
    await _ref.read(brainModelSourceProvider.notifier).setSource(source);
    return applyModelRouting();
  }

  /// 改**某个叶区**的模型来源（覆盖全局默认）。
  ///
  /// 同样**不必重启大脑**。
  Future<bool> applyLobeOverride(String lobe, BrainModelSource source) async {
    await _ref
        .read(brainModelSourceProvider.notifier)
        .setLobeOverride(lobe, source);
    return applyModelRouting();
  }

  /// 把当前路由**落地**（用户改了全局默认或某个叶区）。
  ///
  /// 两步：
  /// 1. **写进 Rust 侧的槽位** —— 大脑下次启动时用它（保证「下次起来
  ///    也是这份路由」）；
  /// 2. **立刻打到端脑面** —— 远端引擎可以在运行时注册进 neuron 的派发表、
  ///    叶区的 `default_model` 也能随时改 ⇒ **不用重启大脑**。
  ///
  /// 大脑没在跑时第 2 步打不通，但那不影响正确性：设置已经落库、第 1 步
  /// 也已经写进槽位，下次启动自然生效。
  Future<bool> applyModelRouting() async {
    final routing = _ref.read(brainModelSourceProvider).routing;
    final models = _ref.read(modelsProvider).models;
    final payload = buildModelRoutingPayload(routing: routing, models: models);

    // 1) 槽位（下次启动用）。
    final slotOk = await _service.setModelRouting(payload);
    if (!slotOk) {
      _log.warning('模型路由写进大脑槽位失败');
    }

    // 2) 大脑在跑 ⇒ 立刻生效。
    if (state.status == EncephalonMobileStatus.running) {
      return _pushLobeModels(payload);
    }
    return slotOk;
  }

  /// 把路由**整份**打到端脑面。
  ///
  /// 下发的形状与写进大脑槽位的**完全一样**（`providers` + `default_model`
  /// + `lobe_models`）—— 两个面说的是同一件事，就该用同一份 JSON。
  ///
  /// ⚠️ **`lobe_models` 只装**显式覆盖**的叶区**。
  /// 「不在表里」= 跟随全局默认 —— 要是把每个叶区的**有效值**都塞进去，
  /// 「跟随全局」就被钉死了，改全局默认时那些叶区不会跟着变。
  Future<bool> _pushLobeModels(Map<String, dynamic> payload) async {
    final client = _ref.read(telencephalonClientProvider);
    final lobeModels = <String, String?>{};
    final rawLobes = payload['lobe_models'];
    if (rawLobes is Map) {
      rawLobes.forEach((key, value) {
        lobeModels['$key'] = value is String ? value : null;
      });
    }
    try {
      await client.applyLobeModels(
        defaultModel: payload['default_model'] as String?,
        lobeModels: lobeModels,
        // 用**负载里那份**供应商列表 —— 槽位与端脑面必须收到一模一样的。
        providers: (payload['providers'] as List)
            .cast<Map<String, String>>()
            .toList(growable: false),
      );
      _log.info('模型路由已下发: 默认=${payload['default_model']}, 覆盖=$lobeModels');
      return true;
    } catch (e) {
      _log.warning('模型路由下发失败: $e');
      return false;
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
    // ⚠️ 接管交给 `TelencephalonNotifier`（**唯一的主人**）—— 它管着
    // 「谁在占着端脑面」这件事 ⇒ ⇒ 配置一改就知道该不该动 client
    // ⇒ 而以前是这里直接改 client ⇒ 「配置」和「client」两个事实源
    // ⇒ 内嵌大脑一放手就把用户配的远端地址弄丢了。
    _ref.read(telencephalonProvider.notifier).takeOverByAgentSurface(
          url,
          shadowKey: _service.shadowKey,
          adminToken: _service.adminToken,
        );
    _log.info('端脑 client 已指向嵌入式大脑: $url');
  }

  /// 大脑停掉后把 client 复原到「**配置里那个端脑**」。
  void _restoreExternalEndpoint() {
    // ⚠️ 复原到**配置里那个**，不是 `TelencephalonClient.defaultBaseUrl`
    // （那是「没配过」的默认值）⇒ ⇒ 用户配了远端、内嵌大脑一停就被拽回
    // 本机默认 ⇒ 「配了、存了、重启后却不生效」的同一族坑。
    _ref.read(telencephalonProvider.notifier).releaseAgentSurface();
    _log.info('端脑 client 已复原到配置里的端脑');
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
