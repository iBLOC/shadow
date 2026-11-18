import '../../generated/l10n/app_localizations.dart';
import 'a2ui_message_shape.dart';

export 'a2ui_message_shape.dart' show a2uiV1MessageKeys, isA2uiV1Message;

/// **v0.8** 的旧形状（`beginRendering` 那个「渲染门」在 v1.0 里已经没了）。
const a2uiLegacyMessageKeys = <String>{'surfaceUpdate', 'beginRendering'};

/// 这个值是不是 **v0.8 的旧形状**？
///
/// ⚠️ **客户端声明的是 v1.0**（`X-A2A-Extensions` ＋ 能力协商）
/// ⇒ ⇒ 对端还回旧形状 ⇒ **版本没对上**
/// ⇒ ⇒ 必须**响亮地报出来** ⇒ ⇒ 不许静默忽略
/// （静默忽略 ⇒ 界面「什么都没有」⇒ 失败长得像成功）。
bool isA2uiLegacyMessage(Object? value) {
  if (value is! Map) return false;
  return a2uiLegacyMessageKeys.any((key) => value.containsKey(key));
}

/// 事件里的 message parts（`result.status.message.parts`）。
///
/// ⚠️ 路径是端脑那一侧的形状（`telencephalon/src/api/a2ui_gateway.rs`）
/// ⇒ ⇒ 与桌面端同一处路径。
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

/// 从**一条** A2A 事件里取出全部 A2UI 载荷（v1.0 形状）。
List<Map<String, Object?>> a2uiPayloadsFromEvent(Map<String, Object?> event) {
  final out = <Map<String, Object?>>[];
  for (final part in _partsOf(event)) {
    if (part is! Map) continue;
    // ⚠️ **只有 `kind == "data"` 的 part 才带载荷** —— 纯文本 part
    // （端脑「这里能看什么」那段）不带。
    if (part['kind'] != 'data') continue;
    final data = part['data'];
    if (data is! Map) continue;
    out.add(Map<String, Object?>.from(data));
  }
  return out;
}

/// 从一批**原始 A2A 事件**里挖出全部 **v1.0** 的 A2UI 消息。
List<Map<String, Object?>> a2uiV1MessagesFromEvents(
  List<Map<String, Object?>> events,
) {
  final out = <Map<String, Object?>>[];
  for (final event in events) {
    for (final payload in a2uiPayloadsFromEvent(event)) {
      if (isA2uiV1Message(payload)) out.add(payload);
    }
  }
  return out;
}

/// 挖出**旧形状**的消息（版本没对上的那些）。
List<Map<String, Object?>> a2uiLegacyMessagesFromEvents(
  List<Map<String, Object?>> events,
) {
  final out = <Map<String, Object?>>[];
  for (final event in events) {
    for (final payload in a2uiPayloadsFromEvent(event)) {
      if (isA2uiLegacyMessage(payload)) out.add(payload);
    }
  }
  return out;
}

/// 这一批事件里有没有**字符串载荷**（`parts[].data` 是 String 而不是 Map）。
///
/// ⚠️ **官方 v1.0 要求 `parts[].data` 是对象** ⇒ ⇒ 对端若把它发成 JSON **字符串**
///    ⇒ ⇒ 官方 SDK 的提取器**只认 Map** ⇒ ⇒ **整条消息被跳过**
///    ⇒ ⇒ 界面上「什么都没有」⇒ ⇒ **失败长得像成功**。
/// ⇒ ⇒ 桌面端那一侧**已经**会响亮报（`a2uiProtocol.ts` 的 `extractA2uiMessages`
///    会 push 一条 warning：「端脑把 A2UI 载荷发成了 JSON 字符串（官方 v1.0 要求是对象）」）
///    ⇒ ⇒ 本仓也必须报 ⇒ ⇒ **两端一致**：都拒收，但都**说真话**。
bool hasStringA2uiPayload(List<Map<String, Object?>> events) {
  for (final event in events) {
    for (final part in _partsOf(event)) {
      if (part is! Map) continue;
      if (part['kind'] != 'data') continue;
      if (part['data'] is String) return true;
    }
  }
  return false;
}

/// 端脑在「这次请求没有可渲染的视图」时会回一段纯文本
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

/// 这一批事件里**画得出来**的 surface id（v1.0：`createSurface.surfaceId`）。
///
/// ⚠️ **结构规则** —— 只认「有 `createSurface`」这件事，
/// 不认「认识哪些组件名」⇒ ⇒ 端脑加了新组件也不会被误判成空。
List<String> a2uiRenderableSurfaceIdsFromEvents(
  List<Map<String, Object?>> events,
) {
  final out = <String>[];
  for (final message in a2uiV1MessagesFromEvents(events)) {
    final created = message['createSurface'];
    if (created is! Map) continue;
    final surfaceId = created['surfaceId'];
    if (surfaceId is String && surfaceId.isNotEmpty && !out.contains(surfaceId)) {
      out.add(surfaceId);
    }
  }
  return out;
}

/// 给模型看的那**一句**摘要。
///
/// ⚠️ **模型不该看到整棵组件树** —— 组件树那一半走 `a2ui_events`
/// （给界面），这一句走 `report`（给模型）。
///
/// ⚠️ **没画出来就要说没画出来** —— 端脑这次回纯文本（它没画界面）
/// ⇒ ⇒ 那就把**它自己的话**带给模型 ⇒ ⇒ 别假装画出来了。
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
