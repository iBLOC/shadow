import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logging/logging.dart';

import '../app_config_service.dart';
import '../background/background_run_provider.dart';
import '../../l10n/current_l10n.dart';
import '../../providers/brain_model_source_provider.dart';
import '../../providers/telencephalon_provider.dart';
import '../../tts_engine.dart';
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

  /// 落盘「用户喊过停」的**队列**。
  ///
  /// 为什么是队列：连着「停 ⇒ 启」两次写入 ⇒ ⇒ 谁后落盘谁赢 ⇒ ⇒ 顺序反了
  /// ⇒ 标记就停在错的一边 ⇒ ⇒ 用一条队列保证顺序。
  Future<void> _persistQueue = Future<void>.value();

  /// 用户为**外部**端脑配的 admin token。
  ///
  /// 嵌入式端脑有**自己**那把（两个域：嵌入式那把只对嵌入式端脑有效）⇒
  /// 指回外部端脑时要把这把放回去，否则用户在设置页配的 token 会丢。
  String? _userAdminToken;

  /// 端脑面就绪轮询在跑的标记 —— 防止 refreshStatus 连发把轮询叠罗汉。
  bool _agentSurfaceWaitInFlight = false;

  /// 设置 admin token —— 设置页给**外部**端脑配的那把。
  ///
  /// 记下来是为了「指回外部端脑」时能放回去。
  void setAdminToken(String? token) {
    _userAdminToken = (token == null || token.isEmpty) ? null : token;
    _ref.read(telencephalonClientProvider).setAdminToken(_userAdminToken);
  }

  EncephalonMobileNotifier(this._service, this._ref)
    : super(const EncephalonMobileState()) {
    // 把 Rust TTS 的端口钩子挂上 —— 闭包每次调用**现读** `_service.port`
    // ⇒ 启动 / 重启换端口后自动跟，不需要每条启动路径都来同步一次。
    TtsEngine.runtimeNeuronPort = () => _service.port;
    // ⚠️ **「用户喊过停」是持久偏好，不是会话状态** ⇒ 从配置里读。
    //
    // 为什么必须落盘：那个标记原先只是**内存里的实例字段** ⇒ 而 Activity
    // 被重建（新 Dart isolate）时它就**归零** ⇒ ⇒ 大脑会自己回来
    // （真机实测 2026-11-01 17:18：BACK 退到底弹掉 Activity ⇒
    // onDetachedFromEngine ⇒ 新 isolate ⇒ main() 重跑 ⇒ 15.4 秒后大脑自己起来）。
    // ⇒ 「用户喊停必须赢」⇒ 赢到底 ⇒ 跨 isolate 也要赢。
    _stoppedByUser = AppConfigService().brainStoppedByUser;
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
        _log.info('检测到嵌入式大脑已在运行, 端口: ${state.port}, 端脑面: ${state.agentPort}');
        _pointClientsAtAgentSurface(state.agentPort);
        // ⚠️⚠️ **接管 ≠ 配置继承** —— 那颗大脑是在**上一次**的路由下起来的
        // ⇒ ⇒ 它的 neuron 派发表里**没有**现在选的远端引擎
        // ⇒ ⇒ 只把路由写进「下次启动才读」的槽位**不够**
        // ⇒ ⇒ 接管后的第一条消息必报
        //     「neuron returned 404: no engine registered for model 'xxx'」
        // ⇒ ⇒ 真机 2026-11-04 实测（App 的 Dart 侧重启过、原生大脑一直在跑）。
        await _applyModelRouting();
        return;
      }
    } catch (e) {
      _log.fine('初始化检查失败: $e');
    }
    // 没在跑 —— **默认拉起来**。
    // ⚠️ 但「用户喊过停」优先：用户说过停 ⇒ 就**别自己拉起来** ⇒ 等他点「启动大脑」。
    if (_stoppedByUser) {
      _log.info('用户之前喊停过大脑 —— 不自动启动（等用户点「启动大脑」）');
      return;
    }
    await ensureStarted();
  }

  /// 拉起嵌入式大脑（幂等）。
  ///
  /// - 已经在跑 ⇒ 直接返回 true；
  /// - 已经在启动流程里 ⇒ 返回那个流程的结果，**不并发 boot 第二次**
  ///   （native 侧虽然也幂等，但没必要白跑一趟）。
  ///
  /// 这是「默认启动」的唯一入口：App 启动时调它，页面上的按钮走 start()
  /// （它会先解除「用户停过」这个标记）。
  ///
  /// ⚠️ **「用户主动停过 ⇒ 不许自动拉起」这条规则实现在 [_startWithRetry] 的
  /// 顶部**（**一处实现**）—— 以前它只挂在「就绪门」（waitUntilReady）上，
  /// 而自动启动这条路径不守 ⇒ ⇒ 两个入口两套语义 ⇒ ⇒ 用户刚停掉的大脑
  /// 会被偷偷拉回来 ⇒ ⇒ 而且没人会发现（界面只写「已停止」）。
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
      // ⚠️ 用户在等的时候喊停 ⇒ 这一轮就别开始了。
      if (_stoppedByUser) {
        _log.info('用户主动停过大脑 —— 放弃启动');
        return false;
      }
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
        // ⚠️⚠️ **启动途中用户喊停** —— native 那次 boot 可能**已经在跑**了
        // （冷启动要十几秒：抽 Flutter 资源 + 加载 150MB 的 so + boot 端脑面）
        // ⇒ ⇒ 这时候「停」必须赢 ⇒ ⇒ 把刚起来的脑关掉
        // ⇒ ⇒ 否则界面说「已停止」而大脑其实在跑 ⇒ ⇒ 「失败长得像成功」。
        if (_stoppedByUser) {
          _log.info('启动途中用户叫停 —— 关掉刚启动的大脑');
          try {
            await _service.stop();
          } catch (e) {
            _log.warning('关掉刚启动的大脑失败: $e');
          }
          state = const EncephalonMobileState();
          _restoreExternalEndpoint();
          return false;
        }
        if (success) {
          final agentPort = _service.agentPort;
          state = state.copyWith(
            status: EncephalonMobileStatus.running,
            port: _service.port,
            agentPort: agentPort,
            errorMessage: null,
          );
          _log.info('嵌入式大脑启动成功, 端口: ${state.port}, 端脑面: ${state.agentPort}');
          _pointClientsAtAgentSurface(agentPort);
          // 后台常驻 —— 大脑起来了，前台服务跟着拉起（开关开着才拉）。
          // ⚠️ unawaited：保活是增强，失败不许把「启动成功」拖成红。
          unawaited(
            _ref.read(backgroundRunProvider.notifier).ensureRunningIfEnabled(),
          );
          // ⚠️⚠️ **起完必须再下发一次路由，且要拿「新目录」重算** ——
          // ❶ 那颗大脑可能是**早就在跑**的 ⇒ 「启动时读槽位」那条路没走
          // ⇒ 派发表里没有现在选的引擎（真机 2026-11-04 实证）；
          // ❷ 上面那份 payload 是 start **前**算的 —— 那时 client 还指着
          // 没人监听的地方 ⇒ 供应商目录读了个空（失败还被缓存进
          // brainProviderOptionsProvider）⇒ 拿它下发 = 注册了个寂寞。
          // 接管刚把 client 指到大脑并作废了缓存 ⇒ 走 _applyModelRouting
          // 重读目录（DeepSeek 就回来了）、重写槽位、打到大脑。
          await _applyModelRouting();
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
  Future<bool> start() async {
    _stoppedByUser = false;
    // ⚠️ **落盘不许挡用户的路**：用户点了「启动大脑」⇒ ⇒ 大脑必须**立刻**开始起
    //    ⇒ ⇒ 落盘是**记账**，不是前置条件 ⇒ ⇒ 慢盘/通道卡住都不能挡住他。
    //    ⇒ ⇒ 只排队、不 await（理由见 [_persistBrainStoppedByUser]）。
    _persistBrainStoppedByUser(false);
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
  Future<Map<String, dynamic>?> _applyModelRouting() async {
    // 等「用户选了哪个来源」读完 —— 没选过就是自动。
    try {
      await _ref.read(brainModelSourceProvider.notifier).ready;
    } catch (e) {
      _log.warning('模型来源设置读取失败: $e');
    }

    // ⚠️ **直读大脑的供应商目录**（2026-11-06「大脑是唯一数据源」刀 ——
    // App 本地不再镜像供应商）。启动链不许被目录拉取失败挡住：大脑照样
    // 起来，只是这一次没有远端模型可注册；失败要在日志里说真话。
    List<BrainModelOption> options;
    try {
      options = await _ref.read(brainProviderOptionsProvider.future);
    } catch (e) {
      _log.warning('大脑供应商目录读取失败，本次启动不注册远端模型: $e');
      options = const [];
    }

    final routing = _ref.read(brainModelSourceProvider).routing;
    final payload = buildModelRoutingPayload(routing: routing, options: options);

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

    // ⚠️⚠️ **槽位只是「下次启动用」** —— 大脑**已经在跑**的时候没人读它
    // ⇒ ⇒ 必须再往端脑面下发一次（远端引擎可以运行时注册进派发表）
    // ⇒ ⇒ 否则接管一颗已经在跑的大脑时，第一条消息必然报
    //     「no engine registered for model 'xxx'」（真机 2026-11-04 实证）。
    //
    // ⚠️ **闸门用「端脑面在不在」（agentPort != null），不用
    //    `state.status == running`** —— 原生那颗大脑可能是**上一个
    //    Activity** 留下的（原生进程还活着、Dart 侧却是新 isolate）
    // ⇒ ⇒ 那时 Dart 侧的状态位还停在「没起来」⇒ ⇒ 用状态位判会把
    //    「该下发」的那一次判成「不用下发」（真机 2026-11-04 实测踩到）。
    if (state.agentPort != null) {
      await _pushLobeModels(payload);
      // ⚠️ **分档默认模型**也要下发（它决定「语音用哪个模型」）。
      await _pushCapabilityDefaults();
    }
    return payload;
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

  /// 改**某个叶区某一档**（asr / tts / image_gen）的模型 —— 覆盖全局分档默认。
  ///
  /// [model] 传 null / 空串 ⇒ 删掉这一格 ⇒ 该叶区该档回到跟随全局。
  ///
  /// ## 写路径：**先端脑、后本地**，且带**合并基线**
  ///
  /// 端脑的 `PUT /lobes/capability-defaults` 对 `defaults` 与 `lobe_defaults`
  /// 都是**整份替换**（`replace_capability_defaults` /
  /// `replace_lobe_capability_defaults`）⇒ ⇒ 只把本机那一份发过去 ⇒ ⇒
  /// **桌面矩阵卡设的覆盖会被抹掉**（两端各留一半的镜像事故）。
  ///
  /// 所以顺序钉死：
  /// 1. **读端脑当前值**（权威基线）—— 读不到就**不写**（拿不到基线就发
  ///    全量＝盲发，抹掉别人 ⇒ 失败长得像成功）；
  /// 2. **合并**（[mergeLobeDefaultsForPush]）：基线 = 本地 ∪ 端脑，
  ///    而**改的这一格以本地这次动作为准**；
  /// 3. **整份 PUT**（两张表一起发 —— 只发表化一份，另一份会被 `defaults`
  ///    的整份替换清空）；
  /// 4. **端脑收下才落本地**（存**合并后**的那一份 —— 本地副本是「开机
  ///    重放」的源，存窄了 ⇒ 重启一次就把对方的格子重放没了）；
  /// 5. 作废 `capabilityDefaultsProvider` 让界面从端脑重读。
  ///
  /// ⚠️ **与 [applyLobeOverride] 不是一条链**：那个走 `lobes/models` 路由面
  /// （只管对话档），这个走分档默认面（只管引擎档）。两面的读者不同，
  /// 硬塞进一份负载会被 serde 静默丢掉。
  ///
  /// ⚠️ **能力词的合法性由端脑判**（词表严格 4005、空值 4006、`llm` 4008
  /// 指路到路由面）—— 界面只渲染 `engine_resolved` ∩ 词表 ＝ asr / tts /
  /// image_gen 那几档，所以正常路径撞不到这些 400。
  Future<bool> applyLobeCapability(
    String lobe,
    String capability,
    String? model,
  ) async {
    final client = _ref.read(telencephalonClientProvider);
    final notifier = _ref.read(brainModelSourceProvider.notifier);
    final routing = _ref.read(brainModelSourceProvider).routing;

    // 1) 读端脑基线（读不到 ⇒ 不盲发）。
    CapabilityDefaultsView view;
    try {
      view = CapabilityDefaultsView.fromJson(
        await client.getCapabilityDefaults(),
      );
    } catch (e) {
      _log.warning('分档默认基线读取失败，叶区覆盖未下发: $e');
      return false;
    }

    // 2) 合并（两张表都要 —— PUT 是整份替换）。
    //    ⚠️ 并集只用 [unionCapabilityDefaults] / [unionLobeDefaults] 这一处
    //    实现 —— 与用户改动那条路共用同一条规则，两边不许各写一份。
    final nextDefaults = unionCapabilityDefaults(
      routing.capabilityDefaults,
      view.defaults,
    );
    final nextLobe = mergeLobeDefaultsForPush(
      local: routing.lobeCapabilityOverrides,
      remote: view.lobeDefaults,
      lobe: lobe,
      capability: capability,
      model: model,
    );

    // 3) 先端脑。
    try {
      await client.setCapabilityDefaults(
        nextDefaults,
        lobeDefaults: nextLobe,
      );
    } catch (e) {
      // ⚠️ **说真话**：带出端脑原话（是词不认识、值为空，还是 llm 走错面）。
      _log.warning('叶区分档覆盖下发失败: $e');
      return false;
    }

    // 4) 后本地（存合并后那一份）。
    final persisted = await notifier.replaceCapabilitySnapshot(
      defaults: nextDefaults,
      lobeDefaults: nextLobe,
    );
    // 5) 让界面从端脑重读（不拿本地副本冒充「生效」）。
    _ref.invalidate(capabilityDefaultsProvider);
    if (!persisted) {
      _log.warning('叶区分档覆盖已下发，但本地副本没存住（重启会回默认）');
    }
    return true;
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
    // ⚠️ 直读大脑的供应商目录（2026-11-06「大脑是唯一数据源」刀）。
    // 读不到 = 落地失败 = 如实报 false（UI 会说「下发失败」），不许静默
    // 拿空目录把用户已配的路由盖掉。
    List<BrainModelOption> options;
    try {
      options = await _ref.read(brainProviderOptionsProvider.future);
    } catch (e) {
      _log.warning('大脑供应商目录读取失败，路由未下发: $e');
      return false;
    }
    final payload = buildModelRoutingPayload(routing: routing, options: options);

    // 1) 槽位（下次启动用）。
    final slotOk = await _service.setModelRouting(payload);
    if (!slotOk) {
      _log.warning('模型路由写进大脑槽位失败');
    }

    // 2) 大脑在跑 ⇒ 立刻生效。
    if (state.status == EncephalonMobileStatus.running) {
      final pushed = await _pushLobeModels(payload);
      // ⚠️ 分档默认模型**单独一条面** ⇒ ⇒ 不许塞进模型路由那个负载
      // （serde 会**静默丢掉**没定义的字段 ⇒ ⇒ 「看起来下发了、其实没生效」
      // ⇒ ⇒ 失败长得像成功）。
      await _pushCapabilityDefaults();
      return pushed;
    }
    return slotOk;
  }

  /// 把**分档默认模型**（能力词 → 模型 id）**＋ 逐叶区覆盖**打到端脑面。
  ///
  /// ⚠️ **它不走模型路由那条面** —— `POST /api/telencephalon/lobes/models`
  /// 的请求体里没有这两档 ⇒ ⇒ serde 会**静默丢掉** ⇒ ⇒ 所以单独一条面
  /// （`PUT /lobes/capability-defaults`）。
  ///
  /// ⚠️ **`lobe_defaults` 必须一起发**（2026-11-13）：手机的大脑随 App
  /// 起停 ⇒ ⇒ 端脑那张表是**内存态** ⇒ ⇒ 不带 ⇒ 冷启一次，用户配的
  /// 「颞叶用哪个语音模型」全丢。
  ///
  /// ⚠️ **发之前先读端脑、按并集合并**（2026-11-13 订正）—— 这一条面是
  /// **整份替换**，而端脑那张表现在**有两个写者**（本机的分档卡 ＋ 桌面
  /// 端的叶区矩阵卡）。以前这里直接发本地那一份全量 ⇒ ⇒ 用户只是改了个
  /// **对话模型**，连带把桌面配的「颞叶用 whisper」抹掉了 ⇒ ⇒ 一次无关的
  /// 写造成另一族配置消失（比「没生效」更坏）。
  /// ⇒ 现在：基线 = 本地 ∪ 端脑，并把合并结果**回写本地副本**（下次重放
  /// 的是同一份，不会来回摆）。读不到端脑 ⇒ 退回「只发本地」（大脑冷启时
  /// 那张表本来就是空的，发全量正是重放的本职）。
  Future<bool> _pushCapabilityDefaults() async {
    final client = _ref.read(telencephalonClientProvider);
    final routing = _ref.read(brainModelSourceProvider).routing;
    var defaults = routing.capabilityDefaults;
    var lobeDefaults = routing.lobeCapabilityOverrides;
    try {
      final view = CapabilityDefaultsView.fromJson(
        await client.getCapabilityDefaults(),
      );
      defaults = unionCapabilityDefaults(defaults, view.defaults);
      lobeDefaults = unionLobeDefaults(lobeDefaults, view.lobeDefaults);
      // 合并结果回写本地副本（失败只影响「下次重放的完整度」，不影响本次
      // 下发 ⇒ ⇒ 不改变返回值，但要记一行）。
      if (!sameCapabilityDefaults(defaults, routing.capabilityDefaults) ||
          !sameLobeDefaults(lobeDefaults, routing.lobeCapabilityOverrides)) {
        final saved = await _ref
            .read(brainModelSourceProvider.notifier)
            .replaceCapabilitySnapshot(
              defaults: defaults,
              lobeDefaults: lobeDefaults,
            );
        if (!saved) {
          _log.warning('分档默认合并结果没落进本地副本（下次重放可能不带对方的格子）');
        }
      }
    } catch (e) {
      // ⚠️ 基线读不到 ⇒ 用本地那份全量（不静默改成「不发」—— 冷启重放
      // 这条腿断了会更糟：App 一重启，用户配的全丢）。
      _log.warning('分档默认基线读取失败，按本地副本下发: $e');
    }
    try {
      await client.setCapabilityDefaults(defaults, lobeDefaults: lobeDefaults);
      _log.info('分档默认模型已下发: $defaults / 叶区覆盖: $lobeDefaults');
      return true;
    } catch (e) {
      _log.warning('分档默认模型下发失败: $e');
      return false;
    }
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
      _log.info(
        '模型路由已下发: 默认=${payload['default_model']}, 覆盖=$lobeModels',
      );
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
    // ⚠️ **落盘**：「用户喊停」是**持久偏好** ⇒ 跨 isolate 也要赢
    //    （真机实测：Activity 重建 ⇒ 新 isolate ⇒ 内存标记归零 ⇒ 大脑自己回来）。
    //    ⚠️ 但它**不许挡用户的路** ⇒ ⇒ 只排队、不 await
    //    （理由见 [_persistBrainStoppedByUser]）。
    _persistBrainStoppedByUser(true);

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

  /// 把「用户喊过停」落盘 —— **有序、不阻塞、失败只记日志**。
  ///
  /// ⚠️ **为什么不能 `await`**：落盘要走平台通道（`path_provider`）⇒ ⇒ 慢盘 /
  ///    通道卡住 ⇒ ⇒ 用户的「停止大脑」「启动大脑」会被**拖住**⇒ ⇒ 大脑还在跑、
  ///    界面却在转圈 ⇒ ⇒ **失败长得像成功**。
  ///    ⚠️ 这不是推测 —— widget 测试就是这么红的：`点「停止大脑」会调 native 的 stop`
  ///    ⇒ `Expected: true / Actual: false` ⇒ 因为 `stop()` 还没轮到 native
  ///    就卡在落盘上了（widget 测试的 fake-async 区里，平台通道**永不返回**）。
  ///
  /// ⇒ 所以：**记账不许挡路** ⇒ 内存标记立刻改（守卫马上生效）⇒ 落盘只排队。
  void _persistBrainStoppedByUser(bool value) {
    _persistQueue = _persistQueue.then((_) async {
      try {
        await AppConfigService().setBrainStoppedByUser(value);
      } catch (e) {
        _log.warning('落盘「用户喊停」失败: $e');
      }
    });
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
      // ⚠️⚠️ 端脑面这会儿还没起来 —— **不能**再「保持指向外部端脑」了事。
      // native `start()` 回来时端脑面经常还在 boot 途中（agentPort==0），
      // 而这条分支以前直接 return ⇒ 之后没人补跑 ⇒ client 永远停在外部
      // 端脑 / 默认 :60080 ⇒ 大脑页整页 401 / connection refused
      // （真机 2026-11-06 实证：干净重启后大脑页红屏，uri=127.0.0.1:60080）。
      // 指向一个没人监听的端口比指向外部端脑更糟：所有调用都会
      // connection refused ⇒ ⇒ 改成后台轮询等就绪再接管（unawaited，
      // 失败不许拖垮主流程），一处实现覆盖全部调用点。
      _log.warning('端脑面未启动（agentPort=$agentPort）—— 后台轮询等就绪再接管');
      _waitForAgentSurfaceAndTakeOver();
      return;
    }
    final url = 'http://127.0.0.1:$agentPort';
    // ⚠️ 接管交给 `TelencephalonNotifier`（**唯一的主人**）—— 它管着
    // 「谁在占着端脑面」这件事 ⇒ ⇒ 配置一改就知道该不该动 client
    // ⇒ 而以前是这里直接改 client ⇒ 「配置」和「client」两个事实源
    // ⇒ 内嵌大脑一放手就把用户配的远端地址弄丢了。
    final shadowKey = _service.shadowKey;
    final adminToken = _service.adminToken;
    // ⚠️ 钥匙为空 = client 指到了大脑但**打不开门**（HTTP 面 401）。
    // 不打断接管（指针照旧），但日志要说真话，别让 401 没名没姓。
    if (shadowKey == null || shadowKey.isEmpty) {
      _log.warning('端脑面已指向嵌入式大脑，但 shadow key 为空 ⇒ HTTP 面将 401');
    }
    _ref
        .read(telencephalonProvider.notifier)
        .takeOverByAgentSurface(
          url,
          shadowKey: shadowKey,
          adminToken: adminToken,
        );
    // ⚠️⚠️ **client 的上游换人了 ⇒ 目录缓存必须作废** ——
    // `brainProviderOptionsProvider` 是直读 client 的 FutureProvider，
    // 而接管是**原位改 baseUrl**（同一个 client 对象）⇒ Riverpod 不认为
    // 依赖变过 ⇒ 之前指向 60080 时读失败的缓存会**永远**留着 ⇒ 路由
    // payload 永远空 providers ⇒ 第一条消息必报 no_engine_for_model。
    // 作废后下一次读 = 从大脑拿真目录（钥匙与指针此刻都已就位）。
    _ref.invalidate(brainProviderOptionsProvider);
    _log.info('端脑 client 已指向嵌入式大脑: $url（供应商目录缓存已作废）');
  }

  /// 轮询等端脑面（agent surface）就绪，拿到端口后把 client 接管过去。
  ///
  /// - 每 2s 问一次 `getStatus()`，最多 15 次（30s 预算 —— 冷启动要加载
  ///   150MB 的 so 再 boot 端脑面，真机要十几秒，预算必须盖得住）；
  /// - 期间用户喊停 ⇒ 立刻放弃 —— 那时停脑流程会把 client 复原到外部
  ///   端脑（[_restoreExternalEndpoint]），轮询不许再抢；
  /// - 超时只打日志：下一次 refreshStatus / 重启大脑会再触发。
  Future<void> _waitForAgentSurfaceAndTakeOver() async {
    if (_agentSurfaceWaitInFlight) return; // 已有轮询在跑，别叠罗汉。
    _agentSurfaceWaitInFlight = true;
    try {
      for (var i = 1; i <= 15; i++) {
        await Future<void>.delayed(const Duration(seconds: 2));
        if (!mounted) return;
        if (_stoppedByUser || state.status == EncephalonMobileStatus.stopped) {
          _log.info('等待端脑面期间大脑已停 —— 放弃接管轮询');
          return;
        }
        try {
          final status = await _service.getStatus();
          final ap = status['agentPort'] as int?;
          if (status['running'] == true && ap != null && ap > 0) {
            if (!mounted) return;
            state = state.copyWith(
              status: EncephalonMobileStatus.running,
              port: status['port'] as int?,
              agentPort: ap,
              errorMessage: null,
            );
            _log.info('端脑面就绪: $ap（第 $i 次轮询）—— 接管端脑 client');
            _pointClientsAtAgentSurface(ap);
            // ⚠️⚠️ **迟到的接管 ⇒ 早前的路由下发多半打在没人监听的旧指针上**
            // ⇒ 接管后必须补一发（重读目录 + 重写槽位 + 打到大脑），
            // 否则第一条消息必报 no_engine_for_model。unawaited 语义：
            // 失败只记日志，不许把「接管成功」拖成红。
            try {
              await _applyModelRouting();
            } catch (e) {
              _log.warning('接管后补发模型路由失败: $e');
            }
            return;
          }
        } catch (e) {
          _log.fine('轮询端脑面就绪失败（第 $i 次）: $e');
        }
      }
      _log.warning('端脑面 30s 内未就绪 —— client 保持指向外部端脑（下次刷新/重启会再试）');
    } finally {
      _agentSurfaceWaitInFlight = false;
    }
  }

  /// 大脑停掉后把 client 复原到「**配置里那个端脑**」。
  void _restoreExternalEndpoint() {
    // ⚠️ 复原到**配置里那个**，不是 `TelencephalonClient.defaultBaseUrl`
    // （那是「没配过」的默认值）⇒ ⇒ 用户配了远端、内嵌大脑一停就被拽回
    // 本机默认 ⇒ 「配了、存了、重启后却不生效」的同一族坑。
    _ref.read(telencephalonProvider.notifier).releaseAgentSurface();
    // 同接管一族：client 的上游换回「配置那个」⇒ 目录缓存作废，
    // 下一次读按当前指针拿数据（大脑是唯一数据源，缓存不许跨上游幸存）。
    _ref.invalidate(brainProviderOptionsProvider);
    _log.info('端脑 client 已复原到配置里的端脑');
  }

  @override
  void dispose() {
    _service.dispose();
    super.dispose();
  }
}

/// 默认服务实例 Provider
final encephalonMobileServiceProvider = Provider<EncephalonMobileService>((
  ref,
) {
  return EncephalonMobileService();
});

/// Encephalon 移动端 Provider
final encephalonMobileProvider =
    StateNotifierProvider<EncephalonMobileNotifier, EncephalonMobileState>((
      ref,
    ) {
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
