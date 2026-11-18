import 'package:a2ui_flutter/a2ui_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/a2ui_provider.dart';
import '../../services/client_tools/client_tool_registry.dart';

/// **对话里内联**的 A2UI 那一块 —— 画在**承载这次工具调用的那条消息里**。
///
/// ## 它画两样东西
///
/// ① **给模型看、也给用户看的那一句**（`report`）——
///    用户看得见它 ⇒ ⇒ 它走**真的 l10n**（不是硬编码中文）。
/// ② **那块界面本身**（surface）—— 组件树，**不是**一句文字。
///
/// ## 它为什么在这儿
///
/// 端脑的 A2UI 产出面 `POST /a2a` **只**按固定视图（`tasks` / `agents`）
/// 渲染 ⇒ ⇒ 它**进不了对话**（不读对话上下文、不进模型）。
///
/// 而「**模型在对话里点名要界面**」这条路是通的 —— 客户端工具
/// `show_a2ui_surface`（模型点名 ⇒ 设备取回 surface）
/// ⇒ ⇒ 界面**画在它被点名的那句话下面**
/// ⇒ ⇒ **不是顶部面板、不是另开一页**。
///
/// ## 界面从哪来
///
/// `A2uiSurface` 画的是 **processor 里的定义** ⇒ ⇒
/// 消息**必须先喂进 processor**（`A2uiAgentService.ingestSurfaceEvents`）
/// ⇒ ⇒ surface 才存在 ⇒ ⇒ 这里才画得出组件树。
class A2uiInlineBlock extends ConsumerWidget {
  /// 这次工具调用（报告那句 + 画出来的 surface 都在它身上）。
  final ToolCallModel call;

  const A2uiInlineBlock({super.key, required this.call});

  /// 内联插槽的标记 —— 测试按它找（桌面端是 `data-testid`，
  /// 同一个名字 ⇒ 两端的用例说的是同一件事）。
  static const Key inlineKey = ValueKey('a2ui-inline-surface');

  /// 工具结果里那一句「给模型看的话」—— **用户也看得见**。
  ///
  /// ⚠️ 只有**非空**的字符串才算 ⇒ 空句 / 不是字符串 ⇒ **不画**
  /// ⇒ ⇒ 界面不许显示一句空话。
  static String? reportOf(ToolCallModel call) {
    final result = call.result;
    if (result is! Map) return null;
    final report = result['report'];
    if (report is String && report.trim().isNotEmpty) return report;
    return null;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final report = reportOf(call);
    final surfaceIds = call.a2uiSurfaceIds;
    if (report == null && surfaceIds.isEmpty) return const SizedBox.shrink();
    return Column(
      key: inlineKey,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (report != null) _ReportLine(report: report),
        if (surfaceIds.isNotEmpty)
          A2uiSurfacesBlock(surfaceIds: surfaceIds),
      ],
    );
  }
}

/// 那一句摘要。
class _ReportLine extends StatelessWidget {
  final String report;

  const _ReportLine({required this.report});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(top: 8, left: 4),
      child: Text(
        report,
        style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
      ),
    );
  }
}

/// 那几块面 —— **按 id 画**（谁画出来的那块面，谁负责画它）。
///
/// ⚠️ **必须是同一个 service 实例** —— 消息喂进的是**那个** processor
/// ⇒ ⇒ 换一个 service ⇒ 换了一个空 processor ⇒ 画出来是空白。
class A2uiSurfacesBlock extends ConsumerWidget {
  final List<String> surfaceIds;

  const A2uiSurfacesBlock({super.key, required this.surfaceIds});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // ⚠️ **必须是同一个 service 实例** —— 消息喂进的是**那个** processor
    // ⇒ ⇒ 换一个 service ⇒ 换了一个空 processor ⇒ 画出来是空白。
    final service = ref.watch(a2uiAgentServiceProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final surfaceId in surfaceIds)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: _A2uiSurfaceView(
              service: service,
              surfaceId: surfaceId,
            ),
          ),
      ],
    );
  }
}

/// 一个 surface —— 官方 `A2uiSurface` 渲染器。
///
/// ⚠️ **找不到这个 surface ⇒ 画空白，而不是崩** ——
/// 「工具成功了、界面却是空的」是**失败长得像成功** ⇒ ⇒ 宁可什么都不画，
/// 也不能画一个「看起来正常」的空面板。
class _A2uiSurfaceView extends StatelessWidget {
  final A2uiAgentService service;
  final String surfaceId;

  const _A2uiSurfaceView({required this.service, required this.surfaceId});

  @override
  Widget build(BuildContext context) {
    final surface = service.surfaceById(surfaceId);
    if (surface == null) return const SizedBox.shrink();
    return A2uiSurface(surface: surface);
  }
}
