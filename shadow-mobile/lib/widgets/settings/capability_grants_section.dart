import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../providers/capability_policy_provider.dart';
import '../../services/accessibility_controller.dart';
import '../../services/capabilities/capability.dart';
import '../../services/capabilities/capability_i18n.dart';
import '../../services/capabilities/device_data_channel.dart';
import '../../theme/app_tokens.g.dart';
import 'settings_row.dart';

/// **能力授权** —— 用户自己决定「模型能碰这台手机上的哪些东西」。
///
/// ## 这一层是**应用层**，不是系统层
///
/// 系统层（Android 的 READ_CALENDAR 等）是用户在**系统弹窗**里批的；
/// 这一层是「用户对这个助手说：日历这件事你自己看着办 / 每次都问我」。
///
/// ⇒ ⇒ 两层是**串联**的：
/// - 系统层没批 ⇒ ⇒ 就算这里选了「完全访问」也读不到；
/// - 这里选了「每次询问」⇒ ⇒ 即使系统层批了，模型每叫一次都要点头。
///
/// ## 为什么每一项都是**独立**的
///
/// 「日历」在一句话里是**两件事**：读（标题 / 地点 / 参与人会流进模型
/// 上下文 = 外泄面）与写（改用户真实日历 = 副作用面）⇒ ⇒ 风险面不同
/// ⇒ ⇒ 必须能分别放开。联系人 / 短信 / 相册同理，各是一档。
///
/// ## ⚠️ 默认是「每次询问」
///
/// 用户没配过 = 每次都要点头（fail-closed）⇒ ⇒ 装完 App 的第一秒，
/// 模型就能读走你的日历 ⇒ ⇒ 那不是「授权」，那是「默认同意」。
class CapabilityGrantsSection extends ConsumerStatefulWidget {
  const CapabilityGrantsSection({super.key});

  @override
  ConsumerState<CapabilityGrantsSection> createState() =>
      _CapabilityGrantsSectionState();
}

class _CapabilityGrantsSectionState
    extends ConsumerState<CapabilityGrantsSection>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // ⚠️ 用户去系统设置里批完权限再回来 ⇒ ⇒ 这里必须**重新查一遍**
    // ⇒ ⇒ 否则那一行永远写着「系统权限未授予」（用户明明已经批了）。
    if (state == AppLifecycleState.resumed) {
      _refreshPermissionStates();
    }
  }

  /// 把五个能力的系统权限状态全部作废重查。
  void _refreshPermissionStates() {
    if (!mounted) return;
    for (final capability in Capability.values) {
      ref.invalidate(capabilitySystemPermissionProvider(capability));
    }
  }

  /// 「去授权」的入口 —— **先就地弹系统框**，弹不出来才退到系统设置页。
  ///
  /// ⚠️ **为什么不再一上来就跳系统设置页**（老做法）：
  /// 跳设置页 ⇒ ⇒ 用户得自己在 App 详情页里翻那个开关 ⇒ ⇒ 交互体验极差
  /// ⇒ ⇒ 而且**绝大多数时候根本不用跳**：用户第一次点「去授权」时，
  /// 系统框**是能弹的** ⇒ ⇒ 就地弹，用户点一下「允许」就完事
  /// ⇒ ⇒ 全程**不离开 App**。
  ///
  /// ⚠️ **什么时候才跳设置页**：只有系统**拒绝再弹**的时候
  /// （Android 11+ 拒绝两次 / 勾了「不再询问」；iOS 拒绝过一次）
  /// ⇒ ⇒ 那时跳设置页是**唯一**剩下的路 ⇒ ⇒ 不是体验差，是没得选。
  ///
  /// ⚠️ 「手机操作」是**无障碍服务** ⇒ ⇒ 程序**弹不出**那个框
  /// ⇒ ⇒ 那一档仍然直接去系统的无障碍设置页（两端平台的事实如此）。
  Future<void> _grantSystemPermission(Capability capability) async {
    // ⚠️ 先把 l10n / messenger **取出来** ⇒ ⇒ 后面有 await
    // ⇒ ⇒ 不能再随手碰 context（Flutter 的 lint 会拦，真机上 context 也可能没了）。
    final l10n = AppLocalizations.of(context)!;
    final messenger = ScaffoldMessenger.maybeOf(context);

    if (capability == Capability.mobileUse) {
      var opened = false;
      try {
        await AccessibilityController.openSettings();
        opened = true;
      } catch (_) {
        // 打不开 ⇒ ⇒ 不假装成功（界面状态不会因此变成「已开启」）。
        opened = false;
      }
      if (!opened) return;
      // 真正可靠的刷新在「回到前台」那个回调里；这里先作废一次，
      // 让状态尽快跟上。
      _refreshPermissionStates();
      return;
    }

    const channel = DeviceDataChannel();
    final outcome = await channel.requestPermissionDetailed(capability.wire);
    if (!mounted) return;
    // 授权结果会改「系统权限状态」⇒ ⇒ 立刻作废重查。
    _refreshPermissionStates();

    // ⚠️ 被**后一次**请求顶掉了 ⇒ ⇒ 这次压根没到用户面前
    // ⇒ ⇒ 什么都不用做（既不提示，也不跳设置页 —— 那是别人的那次请求的事）。
    if (outcome.superseded) return;

    if (outcome.granted) {
      _toast(messenger, l10n.capabilityGrantSucceeded);
      return;
    }
    if (!outcome.needsSystemSettings) {
      // 系统框弹了，用户点了拒绝 ⇒ ⇒ **留在原地**（系统还愿意弹，下次还能问）。
      _toast(messenger, l10n.capabilityGrantDenied);
      return;
    }
    // 弹不出来 ⇒ ⇒ 只能退到系统设置页 ⇒ ⇒ **先说清楚为什么**，再去
    // ⇒ ⇒ 否则用户被弹到设置页却不知道要干什么。
    final goToSettings = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.capabilityGrantNeedsSettingsTitle),
        content: Text(l10n.capabilityGrantNeedsSettingsBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(l10n.commonCancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(l10n.capabilityGrantGoToSettings),
          ),
        ],
      ),
    );
    if (goToSettings != true) return;
    await channel.openAppSettings();
    if (!mounted) return;
    _refreshPermissionStates();
  }

  /// 底部一条短提示 —— 授权的结果必须**看得见**
  /// ⇒ ⇒ 否则用户点了「去授权」之后界面毫无变化 ⇒ ⇒ 不知道成没成。
  void _toast(ScaffoldMessengerState? messenger, String message) {
    messenger?.showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final policy = ref.watch(capabilityPolicyProvider);
    final notifier = ref.read(capabilityPolicyProvider.notifier);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final capability in Capability.values) ...[
          _CapabilityGrantRow(
            capability: capability,
            mode: policy.modeFor(capability),
            onChanged: (mode) => notifier.setMode(capability, mode),
            onGrantSystemPermission: _grantSystemPermission,
          ),
          if (capability != Capability.values.last)
            const ShadSeparator.horizontal(
              margin: EdgeInsets.symmetric(horizontal: AppTokens.spaceLg),
            ),
        ],
      ],
    );
  }
}

/// 一行 = 一个能力 = 一档授权 + 一个系统权限状态。
class _CapabilityGrantRow extends ConsumerWidget {
  final Capability capability;
  final AuthorizationMode mode;
  final ValueChanged<AuthorizationMode> onChanged;

  /// 「去开启系统层那一层」的入口（**按能力**分派 ⇒ ⇒ 传能力）。
  final ValueChanged<Capability> onGrantSystemPermission;

  const _CapabilityGrantRow({
    required this.capability,
    required this.mode,
    required this.onChanged,
    required this.onGrantSystemPermission,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final systemGranted = ref.watch(
      capabilitySystemPermissionProvider(capability),
    );

    // ⚠️ 通道还没答 / 答不上 ⇒ ⇒ 当作**未授予** ⇒ ⇒ 界面不会谎称已就绪。
    //
    // ⚠️ 用 `valueOrNull` 而不是 `is AsyncData` —— Riverpod 在**刷新期间**
    // （`invalidate` 之后重新查）会**保留上一次的旧值**（那不是 AsyncData，
    // 而是 isLoading + hasValue）⇒ ⇒ 只认 AsyncData 的话，每次回到前台
    // 都会闪一下「未授予」⇒ ⇒ 用户以为权限被撤销了。
    final granted = systemGranted.valueOrNull ?? false;

    // ⚠️ **平台不支持的能力**（iOS 上的短信）⇒ ⇒ 这一行不是「没配」，
    // 而是「**这个平台压根没有这个能力**」⇒ ⇒ 界面上要说明白，
    // 下拉也要**禁用** ⇒ ⇒ 否则用户配了一个永远不会被触发的档，
    // 还以为是自己配错了。
    final supported = capabilitySupportedOn(capability);

    return SettingsRow(
      title: capabilityLabel(l10n, capability),
      icon: _capabilityIcon(capability),
      subtitle: supported
          ? '${_modeDescription(l10n, mode, capability)} · ${_systemStateText(l10n, capability, granted)}'
          : l10n.capabilityUnsupportedPlatform,
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 118,
            child: ShadSelect<AuthorizationMode>(
              initialValue: mode,
              // ⚠️ 平台不支持 ⇒ ⇒ 下拉**禁用** ⇒ ⇒ 别让用户配一个
              // 永远不会被触发的档。
              enabled: supported,
              selectedOptionBuilder: (context, value) =>
                  Text(_modeLabel(l10n, value)),
              options: [
                ShadOption(
                  value: AuthorizationMode.askEveryTime,
                  child: Text(l10n.capabilityAuthAsk),
                ),
                ShadOption(
                  value: AuthorizationMode.fullAccess,
                  child: Text(l10n.capabilityAuthFull),
                ),
                // ⚠️ **第三档** —— 「彻底关闭」⇒ ⇒ 这个能力对模型**不存在**
                // ⇒ ⇒ 工具不进 `tools` 数组，被点名时客户端**明确拒绝**。
                ShadOption(
                  value: AuthorizationMode.disabled,
                  child: Text(l10n.capabilityAuthDisabled),
                ),
              ],
              onChanged: (value) {
                if (value == null) return;
                onChanged(value);
              },
            ),
          ),
          // ⚠️ **没授予系统权限时给一键入口** —— 否则「系统权限未授予」
          // 只是把人卡在那儿（要去系统设置里自己找是哪个开关）。
          // ⚠️ 平台不支持 ⇒ ⇒ 没有「系统权限」可授 ⇒ ⇒ 不给那个入口
          // ⇒ ⇒ 否则会点到一个**打不开**的系统设置页。
          if (!granted && supported) ...[
            const SizedBox(width: 6),
            ShadButton.link(
              padding: EdgeInsets.zero,
              onPressed: () => onGrantSystemPermission(capability),
              child: Text(
                capability == Capability.mobileUse
                    ? l10n.capabilityGrantService
                    : l10n.capabilityGrantSystemPermission,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// 这个能力的**系统层**状态那句话。
///
/// ⚠️ **为什么分两种说法** —— 「手机操作」缺的不是「权限」而是
/// 「**无障碍服务**」这个系统开关 ⇒ ⇒ 说「系统权限未授予」会让用户
/// 去权限页里找一个**根本不存在**的开关 ⇒ ⇒ 界面必须说实话。
String _systemStateText(
  AppLocalizations l10n,
  Capability capability,
  bool granted,
) {
  if (capability == Capability.mobileUse) {
    return granted
        ? l10n.capabilityServiceGranted
        : l10n.capabilityServiceMissing;
  }
  return granted
      ? l10n.capabilitySystemGranted
      : l10n.capabilitySystemMissing;
}

/// 能力 → 图标。
IconData _capabilityIcon(Capability capability) {
  switch (capability) {
    case Capability.calendarRead:
      return Icons.event_note_outlined;
    case Capability.calendarWrite:
      return Icons.edit_calendar_outlined;
    case Capability.contacts:
      return Icons.contacts_outlined;
    case Capability.sms:
      return Icons.sms_outlined;
    case Capability.photos:
      return Icons.photo_library_outlined;
    case Capability.mobileUse:
      return Icons.touch_app_outlined;
  }
}

/// 档位 → 下拉里那一项的名字。
String _modeLabel(AppLocalizations l10n, AuthorizationMode mode) {
  switch (mode) {
    case AuthorizationMode.askEveryTime:
      return l10n.capabilityAuthAsk;
    case AuthorizationMode.fullAccess:
      return l10n.capabilityAuthFull;
    case AuthorizationMode.disabled:
      return l10n.capabilityAuthDisabled;
  }
}

/// 档位 → 副标题里那半句解释。
///
/// ⚠️ 「手机操作」在「每次询问」档下的**真实语义**是「一轮问一次」
/// ⇒ ⇒ 执行闸上同一轮点过头就不再弹（敏感目标除外）⇒ ⇒
/// 这里必须按真实语义说，否则设置页在说谎。
String _modeDescription(
  AppLocalizations l10n,
  AuthorizationMode mode,
  Capability capability,
) {
  switch (mode) {
    case AuthorizationMode.askEveryTime:
      return capability == Capability.mobileUse
          ? l10n.capabilityAuthAskMobileUseDesc
          : l10n.capabilityAuthAskDesc;
    case AuthorizationMode.fullAccess:
      return l10n.capabilityAuthFullDesc;
    case AuthorizationMode.disabled:
      return l10n.capabilityAuthDisabledDesc;
  }
}