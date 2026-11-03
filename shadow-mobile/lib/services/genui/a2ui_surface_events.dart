// A2UI 事件的**纯函数**那一层 —— 从端脑 `POST /a2a` 发来的**原始事件**里
// 挖出界面要的东西。
//
// ## 为什么单独一个文件
//
// A2UI 的事件现在有**两条消费路径**（两端一样）：
// ① 「面板」那条（`Agent2UIView` / `Agent2UIPanel` 自己解析）；
// ② 「**对话里内联**」那条（客户端工具 `show_a2ui_surface`）。
// ⇒ ⇒ 两边吃的是**同一批事件** ⇒ ⇒ 「事件 → 载荷」这件事
// **只该有一处实现** ⇒ 两端都调它 ⇒ ⇒ 免得「面板对、内联不对」。
//
// ## 一条事件长什么样
//
// 端脑 `POST /a2a` 的每一行 SSE 是 `data: {"result":{…}}`
// ⇒ 去掉 `data: ` 前缀就是**一条 A2A 事件**：
//
// ```json
// {"result":{"kind":"task-status-update",
//   "status":{"message":{"parts":[{"kind":"data",
//     "data":{"surfaceUpdate":{…}}}]}}}}
// ```
//
// ⇒ A2UI 载荷落在 `result.status.message.parts[]` 里 `kind == "data"`
// 的那些 part 的 `data` 上 —— 与桌面端 `a2uiProtocol.ts` 的
// `extractA2uiPayloads` **同一处路径**（`messageParts`）。
//
// ## 权威样本
//
// `fixtures/a2ui/tasks_sse.txt` —— 端脑导出的**真实 SSE 字节**
// ⇒ 两端（桌面 `clientTools.a2ui.test.ts` / 移动端那份用例）
// 断言的是**同一份 fixture** ⇒ ⇒ 两端吃的是同一批事件。

import '../../generated/l10n/app_localizations.dart';

/// A2UI 载荷的四种键 —— 与 `A2uiMessage.fromJson` 认的那四种**一一对应**
/// （`genui-0.7.0/lib/src/model/a2ui_message.dart:22-35`）。
const a2uiPayloadKeys = <String>{
  'surfaceUpdate',
  'beginRendering',
  'dataModelUpdate',
  'deleteSurface',
};

/// 这个对象像不像一个 A2UI 载荷？
///
/// ⚠️ **用结构规则，不用「认识哪些组件名」的白名单** ——
/// 白名单版本在端脑**加一种新组件**时会把它当成「不认识 ⇒ 当作空」
/// ⇒ ⇒ **把有内容的界面说成空的**。
bool isA2uiPayload(Object? value) {
  if (value is! Map) return false;
  return a2uiPayloadKeys.any((key) => value.containsKey(key));
}

/// 事件里的 message parts（`result.status.message.parts`）。
///
/// ⚠️ 路径是端脑那一侧的形状（`telencephalon/src/a2a/a2ui.rs:407-431`
/// 的 `a2ui_event`）⇒ ⇒ 与桌面端 `messageParts` 同一处。
List<Object?> _partsOf(Map<String, Object?> event) {
  final result = event['result'];
  if (result is! Map) return const [];
  final status = result['status'];
  if (status is! Map) return const [];
  final message = status['message'];
  if (message is! Map) return const [];
  final parts = message['parts'];
  if (parts is! List) return const [];
  return parts;
}

/// 从**一条** A2A 事件里取出全部 A2UI 载荷。
List<Map<String, Object?>> a2uiPayloadsFromEvent(Map<String, Object?> event) {
  final out = <Map<String, Object?>>[];
  for (final part in _partsOf(event)) {
    if (part is! Map) continue;
    // ⚠️ **只有 `kind == "data"` 的 part 才带载荷** —— 纯文本 part
    // （端脑「这里能看什么」那段）不带。
    if (part['kind'] != 'data') continue;
    final data = part['data'];
    if (!isA2uiPayload(data)) continue;
    out.add(Map<String, Object?>.from(data as Map));
  }
  return out;
}

/// 从一批事件里取出全部 A2UI 载荷。
List<Map<String, Object?>> a2uiPayloadsFromEvents(
  List<Map<String, Object?>> events,
) {
  return <Map<String, Object?>>[
    for (final event in events) ...a2uiPayloadsFromEvent(event),
  ];
}

/// 这批事件里**画得出**的 surface id（按出现顺序、去重）。
///
/// ⚠️ **只有 `beginRendering` 才算数** —— A2UI 的语义是
/// 「先 `surfaceUpdate` 递组件，再 `beginRendering` 说『从哪个根开始画』」
/// ⇒ 只有 `surfaceUpdate` ⇒ 组件还在缓存里，**画不出东西**
/// ⇒ ⇒ 只画半成品比不画更糟（用户看到一块空白，还以为界面坏了）。
///
/// ⇒ 与桌面端那条不变量一致：「只有 surfaceUpdate 没有 beginRendering
/// ⇒ 不画半成品」（`shadow-desktop/src/components/chat/__tests__/a2ui.inline.test.tsx`）。
List<String> a2uiRenderableSurfaceIdsFromEvents(
  List<Map<String, Object?>> events,
) {
  final ids = <String>[];
  for (final payload in a2uiPayloadsFromEvents(events)) {
    final begin = payload['beginRendering'];
    if (begin is! Map) continue;
    final id = begin['surfaceId'];
    if (id is String && id.isNotEmpty && !ids.contains(id)) {
      ids.add(id);
    }
  }
  return ids;
}

/// 事件里的**纯文本**回复（端脑「这里能看什么」那段）。
///
/// ⚠️ 端脑在「这次请求没有可渲染的视图」时会回一段纯文本
/// （`a2ui_gateway.rs` 的 `text_reply` ⇒ `parts[].kind === "text"`）
/// ⇒ 那段话**要带给模型**（不然模型以为界面出来了，其实没有）。
List<String> a2uiTextPartsFromEvents(List<Map<String, Object?>> events) {
  final out = <String>[];
  for (final event in events) {
    for (final part in _partsOf(event)) {
      if (part is! Map) continue;
      if (part['kind'] != 'text') continue;
      final text = part['text'];
      if (text is String && text.trim().isNotEmpty) out.add(text.trim());
    }
  }
  return out;
}

/// 给模型看的那**一句**摘要。
///
/// ⚠️ **模型不该看到整棵组件树** —— 组件树那一半走 `a2ui_events`
/// （给界面），这一句走 `report`（给模型）⇒ ⇒ 回传端脑的 payload
/// **只带这一句**（见 `pickReportPayload`）。
///
/// ⚠️ **没画出来就要说没画出来** —— 端脑这次回纯文本（它没画界面）
/// ⇒ ⇒ 那就把**它自己的话**带给模型 ⇒ ⇒ 别假装画出来了
/// （界面不许说谎，工具结果也不许）。
///
/// ⚠️ **走真的 l10n** —— 这句话**用户也看得见**（它画在那次工具调用下面）
/// ⇒ ⇒ 硬编码中文 ⇒ 英文系统里夹一句中文 ⇒ ⇒ 界面不许说谎，也不许说错话。
/// ⇒ ⇒ 文案在 `app_en.arb` / `app_zh.arb`（键 `a2uiSurfaceReport*`）。
///
/// ⚠️ **有事件 ≠ 画出来了** —— 端脑只回**纯文本**的时候**也有事件**
/// ⇒ ⇒ 判据是「有没有 `beginRendering`」（= 有没有根组件）
/// ⇒ ⇒ 只有 `surfaceUpdate` 的那些 ⇒ **没画出来** ⇒ ⇒ 如实说。
String a2uiSurfaceReport({
  required String view,
  required List<Map<String, Object?>> events,
  required AppLocalizations l10n,
}) {
  final surfaceIds = a2uiRenderableSurfaceIdsFromEvents(events);
  if (surfaceIds.isNotEmpty) {
    return view == 'agents'
        ? l10n.a2uiSurfaceReportAgents
        : l10n.a2uiSurfaceReportTasks;
  }
  final words = a2uiTextPartsFromEvents(events).join(' ').trim();
  if (words.isEmpty) {
    return l10n.a2uiSurfaceReportNoSurface;
  }
  return l10n.a2uiSurfaceReportNoSurfaceSaid(words);
}
