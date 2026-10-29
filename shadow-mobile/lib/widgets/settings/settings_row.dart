import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

import '../../theme/app_tokens.g.dart';

/// 设置页原语 —— 移动端设置页的「行」「组」「子块」「折叠」。
///
/// ## 为什么不用 Material 的 `ListTile`
///
/// `ListTile` 把水波纹画在**最近的 Material 祖先**上，而设置页的表面是
/// 半影层（`GlassCard`，玻璃 + 模糊）。玻璃层自带背景色，水波纹会被盖住 →
/// 点击没有反馈。Flutter 3.47 起在 debug 模式下对此直接断言报错。
///
/// ## 为什么不用 shadcn 的 `ShadButton` 承载可点行
///
/// `ShadButton` 的内部 `Row` 是 `MainAxisSize.min`，它把**无界**的主轴约束
/// 传给子节点 —— 行内放 `Expanded` 会直接抛
/// "RenderFlex children have non-zero flex but incoming width constraints
/// are unbounded"。而设置行恰恰需要「标题占满剩余宽度 + 尾部控件靠右」。
///
/// 所以行是手写的（结构对齐桌面端 `SettingsPage.tsx` 的 `SettingRow`），
/// 但**配色、hover / focus 反馈全部取自 shadcn 主题** ——
/// 统一的是语言，不是像素。
class SettingsRow extends StatefulWidget {
  /// 行标题。
  final String title;

  /// 行副标题（可空）。
  final String? subtitle;

  /// 左侧图标（可空）。
  final IconData? icon;

  /// 尾部控件（开关 / 下拉 / 按钮 / 箭头）。
  final Widget? trailing;

  /// 整行是否可点。
  final VoidCallback? onTap;

  /// 破坏性行（用 destructive 色）。
  final bool destructive;

  /// 紧凑行（更小的上下留白）。
  final bool dense;

  const SettingsRow({
    super.key,
    required this.title,
    this.subtitle,
    this.icon,
    this.trailing,
    this.onTap,
    this.destructive = false,
    this.dense = false,
  });

  @override
  State<SettingsRow> createState() => _SettingsRowState();
}

class _SettingsRowState extends State<SettingsRow> {
  bool _hovered = false;
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final theme = ShadTheme.of(context);
    final titleColor = widget.destructive
        ? theme.colorScheme.destructive
        : theme.colorScheme.foreground;
    final subtitleColor = theme.colorScheme.mutedForeground;
    final interactive = widget.onTap != null;

    final content = Padding(
      padding: EdgeInsets.symmetric(
        horizontal: AppTokens.spaceLg,
        vertical: widget.dense ? AppTokens.spaceSm : AppTokens.spaceMd,
      ),
      child: Row(
        children: [
          if (widget.icon != null) ...[
            Icon(
              widget.icon,
              size: 20,
              color: widget.destructive ? titleColor : subtitleColor,
            ),
            const SizedBox(width: AppTokens.spaceMd),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  widget.title,
                  style: theme.textTheme.p.copyWith(
                    color: titleColor,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                if (widget.subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    widget.subtitle!,
                    style: theme.textTheme.small.copyWith(color: subtitleColor),
                  ),
                ],
              ],
            ),
          ),
          if (widget.trailing != null) ...[
            const SizedBox(width: AppTokens.spaceMd),
            widget.trailing!,
          ],
        ],
      ),
    );

    if (!interactive) return content;

    final highlighted = _hovered || _focused;

    return FocusableActionDetector(
      enabled: true,
      mouseCursor: SystemMouseCursors.click,
      onShowHoverHighlight: (value) => setState(() => _hovered = value),
      onShowFocusHighlight: (value) => setState(() => _focused = value),
      actions: {
        ActivateIntent: CallbackAction<ActivateIntent>(
          onInvoke: (_) {
            widget.onTap!();
            return null;
          },
        ),
      },
      child: Semantics(
        button: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: widget.onTap,
          child: AnimatedContainer(
            duration: AppTokens.durationFast,
            curve: Curves.easeOut,
            color: highlighted ? theme.colorScheme.accent : Colors.transparent,
            child: content,
          ),
        ),
      ),
    );
  }
}

/// 设置分组 —— 一组相关的行，带组标题与描述。
///
/// 对应桌面端 `SettingsPage.tsx` 的 `SettingsCard`（组标题 + 组描述 + 内容）。
class SettingsGroup extends StatelessWidget {
  final String title;

  /// 组描述（可空）。
  final String? description;

  /// 组图标（可空）。
  final IconData? icon;

  /// 组内的块。块之间自动插入分隔线；块内部的行由块自己管。
  final List<Widget> children;

  /// 破坏性组（标题用 destructive 色）。
  final bool destructive;

  const SettingsGroup({
    super.key,
    required this.title,
    this.description,
    this.icon,
    required this.children,
    this.destructive = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = ShadTheme.of(context);
    final titleColor = destructive
        ? theme.colorScheme.destructive
        : theme.colorScheme.foreground;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Padding(
          padding: const EdgeInsets.only(
            left: AppTokens.spaceXs,
            bottom: AppTokens.spaceSm,
          ),
          child: Row(
            children: [
              if (icon != null) ...[
                Icon(icon, size: 16, color: titleColor),
                const SizedBox(width: AppTokens.spaceSm),
              ],
              Expanded(
                child: Text(
                  title,
                  style: theme.textTheme.p.copyWith(
                    color: titleColor,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
        if (description != null) ...[
          Padding(
            padding: const EdgeInsets.only(
              left: AppTokens.spaceXs,
              bottom: AppTokens.spaceSm,
            ),
            child: Text(
              description!,
              style: theme.textTheme.small.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
          ),
        ],
        ..._withSeparators(children),
      ],
    );
  }

  /// 块之间插分隔线（shadcn 的 `ShadSeparator`，不依赖 Material）。
  static List<Widget> _withSeparators(List<Widget> children) {
    if (children.isEmpty) return const [];
    final result = <Widget>[];
    for (var i = 0; i < children.length; i++) {
      if (i > 0) {
        result.add(
          const ShadSeparator.horizontal(
            margin: EdgeInsets.symmetric(horizontal: AppTokens.spaceLg),
          ),
        );
      }
      result.add(children[i]);
    }
    return result;
  }
}

/// 设置页的子块 —— 组内的一组行（自带内部行间分隔线）。
///
/// 与 [SettingsGroup] 的区别：没有组标题，只是把若干行打包成一块，
/// 便于父组在块之间统一插分隔线。
class SettingsBlock extends StatelessWidget {
  final List<Widget> children;

  const SettingsBlock({super.key, required this.children});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: SettingsGroup._withSeparators(children),
    );
  }
}

/// 折叠区 —— 「高级」这类不常用内容的容器。
///
/// 用手写的展开动画而不是 `ShadAccordion`：`ShadAccordion` 的每一项自带
/// 标题行与边框，与设置页「组标题 + 行列表」的视觉不搭；
/// 而这里需要的是「一个可点击的标题 → 展开内容」。
class SettingsDisclosure extends StatefulWidget {
  final String title;

  /// 折叠态的副标题（可空）。
  final String? subtitle;

  final IconData? icon;

  /// 展开后的内容。
  final Widget child;

  /// 默认是否展开。
  final bool initiallyExpanded;

  const SettingsDisclosure({
    super.key,
    required this.title,
    this.subtitle,
    this.icon,
    required this.child,
    this.initiallyExpanded = false,
  });

  @override
  State<SettingsDisclosure> createState() => _SettingsDisclosureState();
}

class _SettingsDisclosureState extends State<SettingsDisclosure> {
  late bool _expanded = widget.initiallyExpanded;

  @override
  Widget build(BuildContext context) {
    final theme = ShadTheme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        SettingsRow(
          title: widget.title,
          subtitle: widget.subtitle,
          icon: widget.icon,
          onTap: () => setState(() => _expanded = !_expanded),
          trailing: Icon(
            _expanded ? Icons.expand_less : Icons.expand_more,
            size: 20,
            color: theme.colorScheme.mutedForeground,
          ),
        ),
        // 折叠时**完全不构建**子树 —— 不只是不显示。
        //
        // `AnimatedCrossFade` 会把两个子树都留在树里（只切换绘制），那样
        // 折叠区的内容在页面打开时就已经被创建了：日志面板会在用户根本没
        // 展开「高级」时就去连日志流。折叠的意义就是不构建。
        if (_expanded) widget.child,
      ],
    );
  }
}
