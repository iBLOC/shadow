import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/app_config_service.dart';
import '../services/telencephalon/telencephalon_client.dart';

enum TelencephalonStatus { stopped, starting, running, unreachable, error }

class TelencephalonState {
  final TelencephalonConnection connection;
  final TelencephalonStatus status;
  final String? telencephalonId;
  final String? defaultAgent;
  final List<LobeInfo> lobes;
  final DateTime? lastCheck;
  final String? error;

  /// **记忆面**（`/hippocampus/*`）该打哪台端脑 —— **null = 跟着
  /// [connection] 走**（= 用户配的那台）。
  ///
  /// ⚠️ **为什么记忆面要单独一个地址**（2026-11-17）：
  /// - 端脑面（聊天 / 身份）归**本机内嵌端脑**（接管期间）；
  /// - 记忆面归**带海马体的那台**。
  /// ⇒ ⇒ 以前这台只能是**远端**（因为内嵌端脑**没编**海马体 ⇒ `/hippocampus/*`
  /// 直接 404）⇒ ⇒ 而**移动端没有任何 UI 能改「后端地址」** ⇒ ⇒ 记忆面
  /// 恒指默认回环口 `127.0.0.1:60080` ⇒ ⇒ **手机上永远没人监听**
  /// （内嵌端脑用每次启动都变的随机端口）⇒ ⇒ 记忆页必败。
  /// ⇒ ⇒ `mobile-memory` 档（内嵌端脑**带**海马体）之后 ⇒ ⇒ 记忆面
  /// **可以指本机** ⇒ ⇒ 没配远端时它指本机内嵌端脑。
  final String? memorySurfaceUrl;

  /// 记忆面的门闩（跟 [memorySurfaceUrl] 配套）。
  ///
  /// ⚠️ `/hippocampus/*` 在端脑门型表里是 `auto` 门 ⇒ ⇒ 读要 shadow key
  /// ∪ admin token、写要 admin token ⇒ ⇒ **不带 ⇒ 401**。
  final String? memorySurfaceKey;

  /// 记忆面的 admin token（**写门只认它** ⇒ ⇒ 只带门闩 ⇒ 写操作 403/401）。
  ///
  /// ⚠️ 与 [memorySurfaceKey] 分开 ⇒ ⇒ 两把钥匙**不是一把**（一个是门闩，
  /// 一个是凭据）⇒ ⇒ 不能塞进同一个字段。
  final String? memorySurfaceAdminToken;

  const TelencephalonState({
    this.connection = const TelencephalonConnection(baseUrl: 'http://127.0.0.1:60080'),
    this.status = TelencephalonStatus.stopped,
    this.telencephalonId,
    this.defaultAgent,
    this.lobes = const [],
    this.lastCheck,
    this.error,
    this.memorySurfaceUrl,
    this.memorySurfaceKey,
    this.memorySurfaceAdminToken,
    this.configuredAdminToken,
  });

  /// 记忆面**当前**该打的地址。
  String get memoryBaseUrl => memorySurfaceUrl ?? connection.baseUrl;

  /// 记忆面**当前**该带的门闩。
  String? get memoryShadowKey => memorySurfaceKey ?? connection.apiKey;

  /// 记忆面**当前**该带的 admin token。
  ///
  /// ⚠️ 优先「接管期间」那把（内嵌端脑自己的）⇒ ⇒ 否则用「配置里那把」
  /// （远端自己的）⇒ ⇒ **写门**（`auto` 门的非 GET 那一支）只认它。
  String? get memoryAdminToken => memorySurfaceAdminToken ?? configuredAdminToken;

  /// 「配置里那个端脑」的 admin token（用户为**远端**配的那把）。
  final String? configuredAdminToken;

  TelencephalonState copyWith({
    TelencephalonConnection? connection,
    TelencephalonStatus? status,
    String? telencephalonId,
    String? defaultAgent,
    List<LobeInfo>? lobes,
    DateTime? lastCheck,
    String? error,
    bool clearError = false,
    String? memorySurfaceUrl,
    String? memorySurfaceKey,
    String? memorySurfaceAdminToken,
    String? configuredAdminToken,
    bool clearMemorySurface = false,
  }) {
    return TelencephalonState(
      connection: connection ?? this.connection,
      status: status ?? this.status,
      telencephalonId: telencephalonId ?? this.telencephalonId,
      defaultAgent: defaultAgent ?? this.defaultAgent,
      lobes: lobes ?? this.lobes,
      lastCheck: lastCheck ?? this.lastCheck,
      error: clearError ? null : (error ?? this.error),
      memorySurfaceUrl: clearMemorySurface
          ? null
          : (memorySurfaceUrl ?? this.memorySurfaceUrl),
      memorySurfaceKey: clearMemorySurface
          ? null
          : (memorySurfaceKey ?? this.memorySurfaceKey),
      memorySurfaceAdminToken: clearMemorySurface
          ? null
          : (memorySurfaceAdminToken ?? this.memorySurfaceAdminToken),
      configuredAdminToken: configuredAdminToken ?? this.configuredAdminToken,
    );
  }
}

class TelencephalonNotifier extends StateNotifier<TelencephalonState> {
  final TelencephalonClient _client;

  /// 内嵌大脑是不是正占着端脑面（client）。
  ///
  /// ⚠️ **同一时刻只有一个主人** —— 这是这一轮的核心不变量：
  ///
  /// - 内嵌大脑在跑 ⇒ **它**是端脑面的主人（client 指
  ///   `127.0.0.1:<agentPort>`，带内嵌那把影子锁 + admin token）；
  /// - 内嵌大脑没跑 ⇒ **用户配置**是主人（client 指配置里那个地址）。
  ///
  /// ⇒ 「配置」永远是**歇着时**的那个值 ⇒ 内嵌大脑放手时**不用猜**放回
  /// 哪 ⇒ 也不会「配了远端、内嵌大脑一停就被拽回默认地址」。
  ///
  /// ⚠️ 而**记忆面**（`PrefrontalClient`）跟的是 **state 里那个**
  /// （= 配置那个）⇒ ⇒ 它**始终**是配置说了算，跟内嵌大脑在不在跑无关
  /// ⇒ 这正是「两端读写同一份记忆」成立的前提（内嵌端脑**没有**海马体）。
  bool _agentSurfaceOwned = false;

  TelencephalonNotifier({TelencephalonClient? client})
      : _client = client ?? defaultTelencephalonClient,
        super(TelencephalonState(
          connection: TelencephalonConnection(
            // ⚠️ 初始地址 = **存储里**那个（没配才用默认）。
            //
            // 为什么要在**构造时**就取：设置页只在**用户改动那一刻**调
            // `setConfiguredEndpoint` ⇒ 而配置是**持久化**的
            // （`app_config.json`）⇒ ⇒ **重启后那个地址就没人应用了**
            // ⇒ 「配了、存了、界面里还显示着，重启后却不生效」
            // ⇒ **失败长得像成功**。
            baseUrl: AppConfigService().telencephalonBaseUrl ??
                TelencephalonClient.defaultBaseUrl,
          ),
        )) {
    // 把存储里的地址、admin token、影子锁**真正应用**给 client
    // （不只是 state）。
    final cfg = AppConfigService();
    // ⚠️ 「配置里那把」admin token 也要进 state（2026-11-17）——
    // 记忆面（`/hippocampus/*` 的**写门**）要用它 ⇒ ⇒ state 里原本没有
    // 这个字段 ⇒ ⇒ 记忆面永远写不进去（只带门闩不够）。
    state = state.copyWith(
      configuredAdminToken: cfg.telencephalonAdminToken,
    );
    final url = cfg.telencephalonBaseUrl;
    if (url != null && url.isNotEmpty) {
      _client.setBaseUrl(url);
    }
    final token = cfg.telencephalonAdminToken;
    if (token != null && token.isNotEmpty) {
      _client.setAdminToken(token);
    }
    // ⚠️ **影子锁也要应用** —— 读门 = 影子锁 ∪ admin token ⇒ 少递一把 ⇒
    // 那台端脑只认另一把时 ⇒ 读面 401 ⇒ 「配了、存了、重启后却不生效」。
    final shadowKey = cfg.telencephalonShadowKey;
    if (shadowKey != null && shadowKey.isNotEmpty) {
      _client.setApiKey(shadowKey);
    }
  }

  TelencephalonClient get client => _client;

  /// 内嵌大脑接管端脑面 —— 期间 **client 归它管**。
  ///
  /// ⚠️ **先设钥匙，再改地址** —— 端脑面要 `X-Shadow-Key`；顺序反了就有一个
  /// 「指着新地址、却还没带钥匙」的窗口 ⇒ 那个窗口里的请求会 401 ——
  /// 而 401 比 connection refused 难查得多。
  void takeOverByAgentSurface(
    String url, {
    String? shadowKey,
    String? adminToken,
  }) {
    _agentSurfaceOwned = true;
    if (shadowKey != null && shadowKey.isNotEmpty) {
      _client.setApiKey(shadowKey);
    }
    if (adminToken != null && adminToken.isNotEmpty) {
      _client.setAdminToken(adminToken);
    }
    _client.setBaseUrl(url);
    // ⚠️ **记忆面单独记一个地址**（2026-11-17）——
    //
    // ⚠️ **为什么不能让它跟着 state 的地址走**：state 的地址是「用户配的
    // 那个」⇒ ⇒ 而**移动端没有任何 UI 能改它**（`setConfiguredEndpoint`
    // 在移动端零调用方）⇒ ⇒ 它的值恒为 `null` ⇒ ⇒ 记忆面恒指
    // `http://127.0.0.1:60080` ⇒ ⇒ **手机上永远没人监听那个口**
    // （内嵌端脑用的是**每次启动都变的随机端口**）⇒ ⇒ 记忆页必败。
    //
    // ⚠️ **为什么现在能指本机了**：「记忆面必须指远端」这个前提是
    // 「**内嵌端脑没有海马体**」⇒ ⇒ 而 `mobile-memory` 档（2026-11-17 起
    // 是默认档）把它变成了**有** ⇒ ⇒ 本机 `/hippocampus/*` 面已挂上 ⇒ ⇒
    // 记忆面可以（也应该）指**本机内嵌端脑**。
    //
    // ⚠️ **配置优先**：用户配了远端 ⇒ ⇒ 仍指远端（那是显式意图）⇒ ⇒
    // 没配 ⇒ ⇒ 指本机内嵌端脑（它带海马体）。
    final configured = _configuredUrlOrNull;
    state = state.copyWith(
      memorySurfaceUrl: configured == null ? url : null,
      memorySurfaceKey: configured == null ? shadowKey : null,
      memorySurfaceAdminToken:
          configured == null ? adminToken : null,
    );
  }

  /// 配置里那个端脑地址（**没配过 ⇒ null**）。
  String? get _configuredUrlOrNull {
    final u = AppConfigService().telencephalonBaseUrl;
    return (u == null || u.isEmpty) ? null : u;
  }



  /// 内嵌大脑放手 ⇒ client 回到「**配置里那个**」。
  ///
  /// ⚠️ 不是回到 `TelencephalonClient.defaultBaseUrl` —— 那是「没配过」
  /// 的默认值 ⇒ ⇒ 用户配了远端、内嵌大脑一停就被拽回本机默认
  /// ⇒ 「配了、存了、重启后却不生效」的同一族坑。
  void releaseAgentSurface() {
    _agentSurfaceOwned = false;
    // ⚠️ 记忆面也放手 ⇒ 回到「配置里那个」（没配过 ⇒ 默认回环口）。
    state = state.copyWith(clearMemorySurface: true);
    final cfg = AppConfigService();
    _client.setBaseUrl(
      cfg.telencephalonBaseUrl ?? TelencephalonClient.defaultBaseUrl,
    );
    // ⚠️ 外部端脑用的是**它自己**那把影子锁 ⇒ 放回用户为**外部**端脑配的
    // 那把（没配过 ⇒ null ⇒ **不带那个头**，绝不塞空串）。
    // （内嵌端脑那把只对内嵌端脑有效，别带过去。）
    _client.setApiKey(cfg.telencephalonShadowKey);
    // admin token 同理 ⇒ 放回用户为**外部**端脑配的那把（没配过 ⇒ null）。
    _client.setAdminToken(cfg.telencephalonAdminToken);
  }

  /// 改「**用户配置的那个端脑**」—— 地址 + admin token + 影子锁。
  ///
  /// - **记忆面**（`PrefrontalClient`）跟的是 state 里这个 ⇒ 立刻生效。
  /// - **端脑面**（client）**只在没人接管时**跟着改 ⇒ 内嵌大脑在跑的时候
  ///   改它**不会**把聊天面拽走（聊天面归内嵌大脑管）。
  ///
  /// ⚠️ `token` / `shadowKey` 传 **null = 清空**（与设置页「留空即没有」
  /// 一致）⇒ 调用方要表达「保持原样」，就**别用这个方法改钥匙**。
  void setConfiguredEndpoint(String? url, String? token, {String? shadowKey}) {
    final resolved = (url == null || url.isEmpty)
        ? TelencephalonClient.defaultBaseUrl
        : url;
    state = state.copyWith(
      connection: TelencephalonConnection(
        baseUrl: resolved,
        apiKey: shadowKey,
      ),
      configuredAdminToken: token,
    );
    if (!_agentSurfaceOwned) {
      _client.setBaseUrl(resolved);
      _client.setAdminToken(token);
      // ⚠️ 影子锁也要跟着改 —— 读门 = **影子锁 ∪ admin token** ⇒
      // 少递一把 ⇒ 那台端脑只认另一把时 ⇒ 读面 401。
      _client.setApiKey(shadowKey);
    }
  }

  /// 只改**地址**（钥匙不动）。
  ///
  /// ⚠️ 以前它转发 `setConfiguredEndpoint(url, null)` ⇒ 那个 `null` 把
  /// **admin token 一起清掉**了 ⇒ 「改个地址，钥匙没了」⇒ 读面 401
  /// ⇒ ⇒ **失败长得像成功**（用户以为自己只是改了地址）。
  void setBaseUrl(String url) {
    final resolved = url.isEmpty ? TelencephalonClient.defaultBaseUrl : url;
    state = state.copyWith(
      connection: TelencephalonConnection(
        baseUrl: resolved,
        apiKey: state.connection.apiKey,
      ),
    );
    if (!_agentSurfaceOwned) {
      _client.setBaseUrl(resolved);
    }
  }

  void setApiKey(String? key) {
    _client.setApiKey(key);
    state = state.copyWith(connection: TelencephalonConnection(baseUrl: state.connection.baseUrl, apiKey: key));
  }

  void setAdminToken(String? token) {
    _client.setAdminToken(token);
  }

  Future<void> refreshStatus() async {
    state = state.copyWith(status: TelencephalonStatus.starting, clearError: true);
    try {
      final resp = await _client.health();
      final id = (resp['id'] as String?) ?? 'telencephalon';
      state = state.copyWith(
        status: TelencephalonStatus.running,
        telencephalonId: id,
        lastCheck: DateTime.now(),
      );
    } catch (e) {
      state = state.copyWith(
        status: TelencephalonStatus.unreachable,
        error: e.toString(),
        lastCheck: DateTime.now(),
      );
    }
  }

  Future<void> refreshLobes() async {
    try {
      final resp = await _client.listAgents();
      state = state.copyWith(
        lobes: resp.agents,
        telencephalonId: resp.telencephalonId.isNotEmpty ? resp.telencephalonId : state.telencephalonId,
        defaultAgent: resp.defaultAgent.isNotEmpty ? resp.defaultAgent : state.defaultAgent,
        lastCheck: DateTime.now(),
        clearError: true,
      );
    } catch (e) {
      state = state.copyWith(error: e.toString(), lastCheck: DateTime.now());
    }
  }
}

final telencephalonProvider = StateNotifierProvider<TelencephalonNotifier, TelencephalonState>((ref) {
  return TelencephalonNotifier();
});

final telencephalonClientProvider = Provider<TelencephalonClient>((ref) {
  return ref.watch(telencephalonProvider.notifier).client;
});
