import 'package:flutter/material.dart';

import '../../generated/l10n/app_localizations.dart';
import 'agent2ui_view.dart';

/// Agent2UI 面板 —— **与对话同页共存**的那一块。
///
/// ## 为什么是「面板」而不是「整页形态」
///
/// 以前移动端是**二选一**：开 Agent2UI ⇒ 整个对话区被 `Agent2UIView` 顶掉
/// ⇒ ⇒ 对话**消失** ⇒ ⇒ 「问一句」和「看一眼界面」必须来回切 ⇒ 交互割裂。
///
/// ⇒ 现在：**对话永远在下面**，A2UI 的界面**在上面多出一块**
/// —— 桌面端早就是这个形状（`ConversationPage.tsx:742` 的 `A2uiPanel`
/// 就长在消息列表**上方**，不是另一个页面）。
///
/// ## ⚠️ 它**不记会话**（这条不变量与布局无关）
///
/// 端脑 `/a2a` 每次请求现造 `context_id`（`a2ui_gateway.rs:68-69`）
/// ⇒ ⇒ A2UI 那条通道**不是**对话那条会话
/// ⇒ ⇒ 面板里**不许**显示会话身份 ⇒ ⇒ 这里没有「当前会话」那一行。
///
/// ## 为什么**复用** `Agent2UIView` 而不是重写一块
///
/// 连接状态栏 / surface 区 / 输入条全在那里面 ⇒ ⇒ 抄一份就是「各写一份」
/// ⇒ ⇒ 迟早两边漂（这一族病这个仓已经犯过好几回）。
class Agent2UIPanel extends StatelessWidget {
  const Agent2UIPanel({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final theme = Theme.of(context);

    return Column(
      // ⚠️ 高度由**外层**给（`chat_screen.dart` 把它封在屏高的 42%）
      // ⇒ ⇒ 这里不能写 `MainAxisSize.min`（那会让里面的 Expanded 无界 ⇒ 报错）。
      children: [
        // 面板头：**只说「这是什么」** ⇒ 不说「你现在在哪个形态」
        //（页面标题那一行归对话页 ⇒ A2UI 不借用它说事）。
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: theme.dividerColor)),
          ),
          child: Row(
            children: [
              Icon(
                Icons.widgets_outlined,
                size: 16,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(width: 6),
              Text(
                l10n.agent2UI,
                style: theme.textTheme.labelLarge?.copyWith(
                  color: theme.colorScheme.onSurface,
                ),
              ),
            ],
          ),
        ),
        // 复用既有视图（连接状态栏 / surface / 输入条都在里面）
        const Expanded(child: Agent2UIView()),
      ],
    );
  }
}
