import 'package:flutter/material.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../providers/genui_provider.dart';
import '../../theme/app_colors.dart';

/// 端脑这一次的回答 —— **三种**（外加「失败」）。
///
/// ## 为什么是三种，而不是两种
///
/// 协议层本来就有三种结果（`telencephalon/src/api/a2ui_gateway.rs`）：
///
/// | 端脑的回答 | 界面该说什么 |
/// |---|---|
/// | 画了一个 surface，**里面有内容** | 画出来 |
/// | 画了一个 surface，**里面是空的** | 画出来 —— 端脑自己在空板子上写了「任务（0）」「还没有任务」⇒ **客户端不许再补一句概括** |
/// | **回了一段纯文本**（它这次不画界面，而是说话） | **原话** —— 端脑已经按 `Accept-Language` 翻好 |
/// | **一个字都没说** | 「已连接，但端脑这次没有给出界面」 |
/// | **失败** | **真实原因**（不是「未连接到端脑」） |
///
/// ## ⚠️ 判定顺序有讲究
///
/// 失败 **优先于** 原话：一次请求可能先吐了半句话再失败
/// ⇒ 那时显示「失败 + 原因」比显示半句话诚实。
///
/// ## ⚠️ 客户端**不许**替端脑概括
///
/// 「暂无数据」这类概括只有在端脑**什么都没说**时才允许出现。
/// 端脑说了话还补一句「暂无数据」＝ 把「有话要说」说成「没数据」。
class Agent2UIAnswerState extends StatelessWidget {
  /// 端脑的连接状态（决定「没连上」/「在等」那两档）。
  final ConnectionStatus? status;

  /// 端脑的**原话**（它这次不画界面，而是说话）。
  final String? textReply;

  /// 端脑这次**为什么失败**。
  final String? errorReason;

  const Agent2UIAnswerState({
    super.key,
    this.status,
    this.textReply,
    this.errorReason,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    // ① 失败 ⇒ 说**真实原因**（不是「未连接到端脑」）。
    final reason = errorReason?.trim();
    if (reason != null && reason.isNotEmpty) {
      return _AnswerBlock(
        icon: Icons.error_outline,
        iconColor: AppColors.error,
        message: l10n.errorGeneric(reason),
        messageColor: AppColors.error,
      );
    }

    // ①' 状态已经是「失败」却**没拿到原因** ⇒ 说「失败」，
    // **不许**说「还没给出界面」（那会把失败说成「没内容」）。
    if (status == ConnectionStatus.error) {
      return _AnswerBlock(
        icon: Icons.error_outline,
        iconColor: AppColors.error,
        message: l10n.connectionError,
        messageColor: AppColors.error,
      );
    }

    // ② 端脑说了话 ⇒ **原话直接显示**（端脑自己按 Accept-Language 翻过）。
    final words = textReply?.trim();
    if (words != null && words.isNotEmpty) {
      return _AnswerBlock(
        icon: Icons.chat_bubble_outline,
        iconColor: AppColors.primary,
        message: words,
        messageColor: AppColors.primary,
      );
    }

    // ③ 端脑什么都没说 ⇒ 按连接状态说实话。
    final connected = status == ConnectionStatus.connected;
    final connecting = status == ConnectionStatus.connecting;
    final message = connected
        ? l10n.agent2uiNoSurface
        : (connecting ? l10n.agent2uiWaiting : l10n.agent2uiNoConnection);

    return _AnswerBlock(
      icon: connected
          ? Icons.psychology
          : (connecting ? Icons.wifi_find : Icons.cloud_off),
      iconColor: AppColors.primary,
      message: message,
      messageColor: AppColors.primary,
      // ⚠️ 副标题只描述**机制**，不承诺结果
      // （端脑产不产出界面是端脑的事）。
      hint: l10n.agent2uiSurfaceHint,
    );
  }
}

/// 三态共用的那一块（图标 + 主文案 + 可选副标题）。
class _AnswerBlock extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String message;
  final Color messageColor;
  final String? hint;

  const _AnswerBlock({
    required this.icon,
    required this.iconColor,
    required this.message,
    required this.messageColor,
    this.hint,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 64, color: iconColor.withValues(alpha: 0.5)),
          const SizedBox(height: 16),
          Text(
            message,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium
                ?.copyWith(color: messageColor),
          ),
          if (hint != null) ...[
            const SizedBox(height: 8),
            Text(
              hint!,
              style: TextStyle(
                color: AppColors.darkTextMuted,
                fontSize: 14,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
