import 'dart:async';

import 'package:flutter/material.dart';

import '../generated/l10n/app_localizations.dart';
import '../services/app_config_service.dart';
import '../theme/app_tokens.g.dart';

/// **全局「没存上」横幅** —— 配置写盘失败时，**任何页面**都看得见。
///
/// ## 为什么挂在 App 根部，而不是每个页面各弹一次
///
/// - 写盘是 [AppConfigService]（**单例**）上的操作 ⇒ ⇒ 调用方散落在
///   设置页 / 外观 / 后台常驻开关 / 端脑页 / 能力授权 / 租户迁移。
/// - SnackBar 依赖**当前页有 Scaffold** ⇒ ⇒ 不在设置页的写入
///   （比如「用户喊停大脑」）就弹不出来 ⇒ ⇒ 那还是「失败长得像成功」。
/// - 一处横幅 ⇒ ⇒ **任何一处写失败都看得见** ⇒ ⇒ 不依赖「谁记得处理」。
///
/// ## 为什么不自动消失
///
/// 失败是**用户要处理的事**（磁盘满 / 权限不足 / 路径不存在）⇒ ⇒
/// 自动消失 ⇒ ⇒ 用户还没看见就没了 ⇒ ⇒ 等于没说。
/// ⇒ ⇒ 手动关掉，且**关掉不等于问题解决**（下次写还会失败）⇒ ⇒
/// 真相源仍是 [AppConfigService.lastSaveError]。
class ConfigSaveErrorBanner extends StatefulWidget {
  const ConfigSaveErrorBanner({super.key});

  @override
  State<ConfigSaveErrorBanner> createState() => _ConfigSaveErrorBannerState();
}

class _ConfigSaveErrorBannerState extends State<ConfigSaveErrorBanner> {
  StreamSubscription<String>? _sub;
  String? _reason;

  @override
  void initState() {
    super.initState();
    // ⚠️ 补上**当前**已有的错误（横幅是后挂的 ⇒ 之前的失败它没听见）。
    _reason = AppConfigService().lastSaveError;
    _sub = AppConfigService().saveFailures.listen((reason) {
      if (!mounted) return;
      setState(() => _reason = reason);
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final reason = _reason;
    if (reason == null || reason.isEmpty) return const SizedBox.shrink();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFF3A1D1D) : const Color(0xFFFFE5E5);
    final fg = isDark ? const Color(0xFFFFB4AB) : const Color(0xFF93000A);
    return Container(
      width: double.infinity,
      color: bg,
      padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline, size: 18, color: fg),
          const SizedBox(width: AppTokens.spaceSm),
          Expanded(
            child: Text(
              // ⚠️ 上下文（译文）＋ 原因（原文）**两者都在** ——
              // 原因不重包（磁盘满 / 权限 / 路径不存在，处置完全不同）。
              l10n == null
                  ? 'Not saved: $reason'
                  : l10n.settingsConfigSaveFailed(reason),
              style: TextStyle(color: fg, fontSize: 13),
            ),
          ),
          IconButton(
            icon: Icon(Icons.close, size: 16, color: fg),
            tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
            onPressed: () => setState(() => _reason = null),
          ),
        ],
      ),
    );
  }
}
