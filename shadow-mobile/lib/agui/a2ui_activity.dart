import '../services/a2ui/a2ui_message_shape.dart';
import 'agui_events.dart';

/// 官方 AG-UI 承载 A2UI 面的 **activity 类型名**。
///
/// ⚠️ **真相源**：官方 npm `@ag-ui/a2ui-middleware`（v0.0.16）的
/// `buildLifecycleActivity` —— 它 paint 出来的那条 activity 就是：
/// `{type:"ACTIVITY_SNAPSHOT", messageId:"a2ui-surface-<surfaceId>",`
/// `{activityType:"a2ui-surface", content:<ops 数组>, replace:true}`
/// ⇒ ⇒ **字面量照抄官方那一处**，不手打、不自造。
const String a2uiActivityType = 'a2ui-surface';

/// 官方 messageId 的前缀（`a2ui-surface-${surfaceId}`）。
const String a2uiActivityIdPrefix = 'a2ui-surface-';

/// 从一条 AG-UI 事件里取出 A2UI 的 ops。
///
/// ⚠️ **三档各有一档的读数**：
/// · 不是 activity ⇒ `null`（不是我们的活）；
/// · 是 activity 但**不是** `a2ui-surface` ⇒ `null`（别的 activity 不归我们管）；
/// · 是 `a2ui-surface` 但**形状不对** ⇒ ⇒ **抛** ⇒ ⇒ 响亮地拒。
///
/// ⚠️ 为什么坏形状要抛：静默吞掉 ⇒ ⇒ 界面上「什么都没有」且不报错
/// ⇒ ⇒ **失败长得像成功**。
List<Map<String, Object?>>? a2uiOpsFromEvent(AguiEvent event) {
  if (event.type != 'ACTIVITY_SNAPSHOT') return null;
  if (event.activityType != a2uiActivityType) return null;

  final Object? content = event.content;
  if (content is! List) {
    throw AguiProtocolException(
      'ag-ui a2ui activity carries no operations array '
      '(official content is an array of A2UI operations)',
    );
  }
  final List<Map<String, Object?>> ops = <Map<String, Object?>>[];
  for (final Object? op in content) {
    if (!isA2uiV1Message(op)) {
      throw AguiProtocolException(
        'ag-ui a2ui activity carries an operation that is not an A2UI v1.0 message',
      );
    }
    ops.add(Map<String, Object?>.from(op as Map));
  }
  return ops;
}

/// 一批 ops 里的 surfaceId —— **口径照官方**（`buildLifecycleActivity`
/// 的取法：createSurface ▸ updateComponents ▸ updateDataModel ▸ deleteSurface）。
String? a2uiSurfaceIdOf(List<Map<String, Object?>> ops) {
  const List<String> order = <String>[
    'createSurface',
    'updateComponents',
    'updateDataModel',
    'deleteSurface',
  ];
  for (final Map<String, Object?> op in ops) {
    for (final String key in order) {
      final Object? body = op[key];
      if (body is! Map) continue;
      final Object? surfaceId = body['surfaceId'];
      if (surfaceId is String && surfaceId.isNotEmpty) return surfaceId;
    }
  }
  return null;
}
