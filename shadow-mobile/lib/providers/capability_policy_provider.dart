import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/accessibility_controller.dart';
import '../services/app_config_service.dart';
import '../services/capabilities/capability.dart';
import '../services/capabilities/device_data_channel.dart';

/// **能力授权策略** —— 「每个能力，用户自己决定要不要放开、要不要每次问」。
///
/// ## 三层授权，一层都不能少
///
/// 1. **系统层**（Android 的 READ_CALENDAR 等）⇒ 用户在系统弹窗里批。
///    〔Dart 侧管不着，原生层还会再查一遍 —— 见 `DeviceDataBridge`〕
/// 2. **应用层的档位**（本文件）⇒ 每次询问 / 完全访问。
/// 3. **执行时的那道闸**（`chat_provider` 里那张 Allow / Deny 卡片）。
///
/// ⇒ ⇒ 三层是**串联**的：任何一层不同意，能力就不生效。
///
/// ## 为什么默认是「每次询问」
///
/// 默认值必须是**最保守**的那个 ⇒ ⇒ 用户没配置过 = 每次都要点头。
/// ⚠️ 反过来（默认「完全访问」）⇒ ⇒ 装完 App 的第一秒，
/// 模型就能读走你的日历、联系人、短信 ⇒ ⇒ 那不是「授权」，那是「默认同意」。
final capabilityPolicyProvider =
    StateNotifierProvider<CapabilityPolicyNotifier, CapabilityPolicy>(
      (ref) => CapabilityPolicyNotifier(),
    );

/// 能力 → 档位的映射（**只存显式配置过的**那些）。
///
/// ⚠️ 没出现过的能力 = 用 [CapabilityPolicy.modeFor] 的默认值
/// （= 每次询问），**不是**「完全访问」。
class CapabilityPolicy {
  final Map<Capability, AuthorizationMode> _modes;

  const CapabilityPolicy(this._modes);

  /// 空策略 = 所有能力都是「每次询问」。
  static const CapabilityPolicy empty = CapabilityPolicy({});

  /// 这个能力的档位。
  ///
  /// ⚠️ 认不出来的 / 没配过的 ⇒ **每次询问**（fail-closed）。
  AuthorizationMode modeFor(Capability capability) =>
      _modes[capability] ?? AuthorizationMode.askEveryTime;

  /// 这份策略里**显式配过**的那些（界面用来标「你改过」）。
  Map<Capability, AuthorizationMode> get explicitModes =>
      Map.unmodifiable(_modes);

  /// 换掉某个能力的档位。
  CapabilityPolicy withMode(
    Capability capability,
    AuthorizationMode mode,
  ) {
    final next = Map<Capability, AuthorizationMode>.from(_modes);
    next[capability] = mode;
    return CapabilityPolicy(next);
  }

  /// 落盘用的形状（能力 wire → 档位 wire）。
  Map<String, String> toWire() {
    final out = <String, String>{};
    _modes.forEach((capability, mode) {
      out[capability.wire] = mode.wire;
    });
    return out;
  }

  /// 从落盘形状还原。
  ///
  /// ⚠️ 认不出来的档位字符串 ⇒ `AuthorizationMode.fromWire` 退化成
  /// 「每次询问」⇒ ⇒ **fail-closed**。
  factory CapabilityPolicy.fromWire(Map<String, String> wire) {
    final out = <Capability, AuthorizationMode>{};
    wire.forEach((key, value) {
      // ⚠️ **认不出来的能力名 ⇒ 整条丢掉** —— 不许落到某个真实能力上
      // ⇒ ⇒ 否则一条坏配置就能凭空给「读日历」开一道门（fail-open）。
      final capability = Capability.fromWire(key);
      if (capability == null) return;
      out[capability] = AuthorizationMode.fromWire(value);
    });
    return CapabilityPolicy(out);
  }

  @override
  bool operator ==(Object other) {
    if (other is! CapabilityPolicy) return false;
    if (other._modes.length != _modes.length) return false;
    for (final entry in _modes.entries) {
      if (other._modes[entry.key] != entry.value) return false;
    }
    return true;
  }

  @override
  int get hashCode => Object.hashAllUnordered(
    _modes.entries.map((e) => '${e.key.wire}:${e.value.wire}'),
  );
}

/// 某个能力的**系统权限**状态（只读，不弹窗）。
///
/// ⚠️ 走**原生通道**而不是 `permission_handler` —— 后者在 Android 上把
/// 日历的读写捆成一个权限组 ⇒ ⇒ 看不出「用户只批了读」这个状态。
///
/// ⚠️ 原生通道不在（单测 / 裁剪版）⇒ ⇒ 原生那侧已经兜成 false
/// ⇒ ⇒ 这里也是 false ⇒ ⇒ 界面显示「未授予」⇒ ⇒ **fail-closed**。
final capabilitySystemPermissionProvider =
    FutureProvider.family<bool, Capability>((ref, capability) async {
      // ⚠️ **按能力分派** —— 不同能力的「系统层」根本不是一回事：
      // - 日历 / 联系人 / 短信 / 相册 ⇒ Android 的**运行时权限**（走设备数据通道）；
      // - 手机操作 ⇒ Android 的**无障碍服务**（它是系统设置里的一个开关，
      //   **不是**运行时权限 ⇒ ⇒ 也不能像权限那样弹窗申请）。
      // ⇒ ⇒ 收在一个 provider 里按能力分派 ⇒ ⇒ 界面那侧不用各写一遍。
      if (capability == Capability.mobileUse) {
        return AccessibilityController.isEnabled;
      }
      const channel = DeviceDataChannel();
      return channel.hasOsPermission(capability.wire);
    });

/// 策略的读写器 —— 内存 + 落盘（`app_config.json`）。
/// 「手机操作」这一档**是否允许原生侧执行设备动作**。
///
/// ⚠️ 为什么只有「完全访问」才放行：「每次询问」在这条路上**没法问**
/// ⇒ ⇒ 没有 UI 可以弹那张 Allow / Deny 卡片 ⇒ ⇒ 不能问就只能拒
/// ⇒ ⇒ fail-closed。「彻底关闭」同理。
///
/// ⚠️ 这是**纯函数** ⇒ ⇒ 单测能直接钉住它，不必起真机、不必装 App。
bool deviceActionsAllowedFor(CapabilityPolicy policy) =>
    policy.modeFor(Capability.mobileUse) == AuthorizationMode.fullAccess;

class CapabilityPolicyNotifier extends StateNotifier<CapabilityPolicy> {
  CapabilityPolicyNotifier() : super(CapabilityPolicy.empty) {
    _restore();
  }

  final AppConfigService _config = AppConfigService();

  // ⚠️ **用户已经改过档位了吗** —— 用来防「恢复把用户的改动覆盖掉」。
  //
  // 为什么需要它：[CapabilityPolicyNotifier] 构造时**不 await** [_restore]
  // ⇒ ⇒ 恢复是**异步**的 ⇒ ⇒ 用户（或调用方）若在这期间改了档位
  // ⇒ ⇒ 恢复一完成就会把 state 覆盖成「文件里那个」⇒ ⇒
  // **用户的改动被静默吃掉**（界面跳回旧档 ⇒ 用户以为没改成）
  // ⇒ ⇒ 这是「失败长得像成功」的近亲：**改动发生了，却被回退**。
  bool _userChanged = false;

  /// 从配置文件恢复上次的选择。
  Future<void> _restore() async {
    try {
      await _config.init();
      // ⚠️ **用户改过 ⇒ 恢复不许覆盖**（以用户的为准）。
      if (mounted && !_userChanged) {
        state = CapabilityPolicy.fromWire(_config.capabilityModes);
      }
    } catch (e) {
      // 读失败就用默认值 —— 授权配置坏了不该让 App 进不去。
      // ⚠️ 默认值是「每次询问」⇒ ⇒ 坏文件不会**放宽**授权。
      if (mounted && !_userChanged) state = CapabilityPolicy.empty;
    }
    // ⚠️ **无论成功失败都要推** —— 闸的状态必须与内存里的档位一致
    // ⇒ ⇒ 恢复失败（走默认值）时也要把原生侧**推回拒绝**。
    await _pushDeviceActionGate();
  }

  /// 用户改了某个能力的档位。
  Future<void> setMode(
    Capability capability,
    AuthorizationMode mode,
  ) async {
    if (!mounted) return;
    // ⚠️ 先记「用户改过」⇒ ⇒ 恢复（若还在飞）不许覆盖这一改。
    _userChanged = true;
    state = state.withMode(capability, mode);
    await _config.setCapabilityModes(state.toWire());
    // ⚠️ 改完档位**立刻**推 ⇒ ⇒ 原生侧不会拿着上一档的授权继续动作。
    await _pushDeviceActionGate();
  }

  /// 把闸的状态推给原生侧。
  ///
  /// ⚠️ 原生侧那两个平行面**不经过** Dart 侧的能力闸 ⇒ ⇒ 它们只认
  /// 这个推过去的状态 ⇒ ⇒ 推错了就等于闸失效 ⇒ ⇒ 每次档位变化都推。
  Future<void> _pushDeviceActionGate() async {
    await AccessibilityController.setDeviceActionsAllowed(
      deviceActionsAllowedFor(state),
    );
  }
}
