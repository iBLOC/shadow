import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/identity/tenant_migration.dart';
import '../services/prefrontal_client.dart';
import '../services/telencephalon/telencephalon_client.dart';
import 'telencephalon_provider.dart';

/// 「当前是谁」—— 以及**读写哪一份记忆**。
///
/// ## 为什么要有这一层
///
/// 客户端以前把海马体租户写死成 `'default'`。但端脑不是这么回事：
/// 端脑写记忆走 `hippo_store::hippo_auth()` —— **凭证优先，没有凭证就
/// 回退本机账号**，租户 = 账号的默认人格 `persona-<hex16>`；只有既没有
/// 账号也没有凭证时才回退 `"default"`。
///
/// ⇒ 客户端写 `'default'`、端脑写 `persona-xxx` ⇒ **两边不在同一个桶
/// 里**。桌面端存的主题色，端脑读不到。
///
/// ## 这一档的形状
///
/// 租户**只由端脑说了算**：问端脑「你是谁」（`GET /shadow/v1/identity`），
/// 端脑答的人格就是租户。于是：
///
/// - 桌面与手机用**同一个账号**时，两端算出**同一个人格** ⇒ 同一份记忆；
/// - 端脑没起来 / 没有账号 ⇒ 回退 `"default"`，**老部署逐字节不变**。
///
/// ## 身份 ≠ 授权
///
/// 这里的「谁」只是**请求属性**：凭证带着主体，请求到达即确定。端脑不验签，
/// 它读到的 `sub` 只是提示（真校验在海马体那边）。所以这里**不做**「每回合
/// 问一次身份」那种设计 —— 授权判定必须确定性、可复现。
class IdentityState {
  /// 人（principal），例如 `principal:alice`。
  final String? principal;

  /// 人格 —— 记忆的隔离单元，也是海马体的租户。
  final String? persona;

  /// 哪台设备。
  final String? device;

  /// 背后有没有人。没有 ⇒ 退到默认租户。
  final bool identified;

  /// **有效租户** —— 永远是一个具体的桶名。
  final String tenantId;

  /// 解析成功过没有。失败时保持 false ⇒ 下次还会再试。
  final bool resolved;

  /// 最近一次解析失败的原因（不弹窗，只记录）。
  final String? error;

  const IdentityState({
    this.principal,
    this.persona,
    this.device,
    this.identified = false,
    this.tenantId = fallbackTenantId,
    this.resolved = false,
    this.error,
  });

  IdentityState copyWith({
    String? principal,
    String? persona,
    String? device,
    bool? identified,
    String? tenantId,
    bool? resolved,
    String? error,
    bool clearError = false,
  }) {
    return IdentityState(
      principal: principal ?? this.principal,
      persona: persona ?? this.persona,
      device: device ?? this.device,
      identified: identified ?? this.identified,
      tenantId: tenantId ?? this.tenantId,
      resolved: resolved ?? this.resolved,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

/// 身份解析的默认超时。
///
/// ⚠️ **必须有上界**：端脑的 fetch **没有超时**（没用 AbortController）⇒
/// 端脑的地址指到一个不回话的地方时，请求会永远挂着。
const Duration identityTimeout = Duration(seconds: 15);

/// 身份解析 + 租户落地。
class IdentityNotifier extends StateNotifier<IdentityState> {
  final TelencephalonClient _telencephalon;
  final PrefrontalClient _prefrontal;

  /// 正在飞的那一次解析 —— 并发调用共享它。
  Future<String>? _inflight;

  IdentityNotifier(this._telencephalon, this._prefrontal)
      : super(const IdentityState());

  /// 问端脑「你是谁」，并把结果落到海马体租户上。
  ///
  /// - 并发的调用方**共享同一次**请求，不重复打端脑；
  /// - 已经解析成功过就直接返回（除非 `force`）；
  /// - 端脑连不上 ⇒ 保持兜底租户，**不**标记 resolved（下次还会再试）；
  /// - 端脑**挂着不回** ⇒ 超时后按失败处理（见 [timeout]）—— 端脑的
  ///   fetch 没有超时（没用 AbortController）⇒ 不兜一层的话，这次调用会
  ///   永远挂着。
  ///
  /// ⚠️ 端脑 client 自带**就绪门**（`EncephalonMobileNotifier` 装的）⇒
  /// 大脑还没起来时，这次调用会**等它起来**，而不是直接失败。
  Future<String> resolve({bool force = false, Duration? timeout}) async {
    if (!force && state.resolved) {
      return state.tenantId;
    }
    final inflight = _inflight;
    if (inflight != null) return inflight;

    final future = _resolveOnce(timeout ?? identityTimeout);
    _inflight = future;
    try {
      return await future;
    } finally {
      _inflight = null;
    }
  }

  Future<String> _resolveOnce(Duration timeout) async {
    try {
      final identity = await _telencephalon
          .getIdentity()
          .timeout(timeout, onTimeout: () => throw Exception(
              'identity timeout after ${timeout.inMilliseconds}ms',
            ));
      // 「背后有人」+「有人格」⇒ 用人格当租户；否则默认桶。
      final persona = identity.persona;
      final tenant = (identity.identified && persona != null && persona.isNotEmpty)
          ? persona
          : fallbackTenantId;

      state = state.copyWith(
        principal: identity.principal,
        persona: identity.persona,
        device: identity.device,
        identified: identity.identified,
        tenantId: tenant,
        resolved: true,
        clearError: true,
      );

      // 落到海马体租户上 —— 记忆与任务从此读写那个桶。
      _prefrontal.setTenantId(tenant);

      return tenant;
    } catch (e) {
      // 端脑没起来 ⇒ 保持当前租户（多半是兜底桶），并且**不**标记
      // resolved —— 下次调用还会再试，端脑起来后自动切过去。
      state = state.copyWith(error: e.toString(), resolved: false);
      return state.tenantId;
    }
  }

  /// 一次性迁移：`default` 桶 → 账号人格桶（复制，不删旧行）。
  ///
  /// 失败不抛 —— 迁移失败不该拖垮启动；下次还会再试。
  Future<TenantMigrationResult> migrate() async {
    final tenant = state.tenantId;
    try {
      return await migrateLegacyTenant(client: _prefrontal, targetTenant: tenant);
    } catch (e) {
      return TenantMigrationResult(ran: false, errors: ['$e']);
    }
  }
}

final identityProvider =
    StateNotifierProvider<IdentityNotifier, IdentityState>((ref) {
  return IdentityNotifier(
    ref.watch(telencephalonClientProvider),
    ref.watch(prefrontalClientProvider),
  );
});
