import 'dart:convert';

import '../services/client_tools/client_tool_registry.dart';
import 'agui_client.dart';
import 'agui_events.dart';
import 'agui_tool_outcome_gate.dart';
import 'agui_types.dart';

/// 移动端 ⇒ ⇒ AG-UI 的**形状转换**（这一层唯一干这件事的地方）。
///
/// ⚠️ **与桌面端 `src/lib/agui/bridge.ts` 逐字对等**（同口径 ⇒ 端脑改一处，
/// 两端都要改，且**改漏了会当场红**）。
///
/// ⚠️ **为什么单独一层**：页面里散着两处形状转换（工具清单 ＋ 用户内容）
/// ⇒ ⇒ 换协议时它们会各改各的 ⇒ ⇒ 这一层把它们钉在一起 ⇒ ⇒ 判据也钉在这里。

/// 设备工具清单 ⇒ ⇒ AG-UI 的**扁平**形状。
///
/// ⚠️ AG-UI 的工具是 `{name, description?, parameters?}`（**不套 function**）
/// ⇒ ⇒ 端脑自己再包成 OpenAI 形状（端脑那一侧有判据钉着）⇒ ⇒ 两端各包一次是
/// **两处真相** ⇒ ⇒ 客户端这一处**不许**包。
///
/// ⚠️ 移动端既有 `toOpenAiTools`（在 `client_tool_registry.dart`）**是** OpenAI
/// 形状（套 `function`）⇒ ⇒ 那是 legacy 路的形状 ⇒ ⇒ **不能**直接拿来做 AG-UI
/// ⇒ ⇒ 这一层就是把那一份**拆平**。
List<AguiTool> toAguiTools(
  ClientToolRegistry registry, {
  /// **要排除的工具名** —— 能力档位「彻底关闭」的那些**不该**出现在模型面前。
  Set<String> excludedNames = const <String>{},
}) {
  return registry.names
      .where((String name) => !excludedNames.contains(name))
      .map((String name) {
    final ClientTool tool = registry.lookup(name)!;
    return AguiTool(
      name: tool.name,
      description: tool.description.isEmpty ? null : tool.description,
      parameters: tool.parameters ??
          <String, dynamic>{
            'type': 'object',
            'properties': <String, dynamic>{},
          },
    );
  }).toList();
}

/// data URL 的形状（**base64** —— 端脑不去拉远程 URL ⇒ ⇒ 客户端必须内联字节）。
final RegExp _dataUrlPattern = RegExp(
  r'^data:([a-z0-9.+-]+/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]*)$',
  caseSensitive: false,
);

/// data URL ⇒ ⇒ （MIME ＋ base64）。
///
/// ⚠️ **形状不对 ⇒ 响亮地拒**（端脑那侧也是响亮地拒）⇒ ⇒ **不许**静默丢图
/// ⇒ ⇒ 丢了图用户只看到「它没看我发的东西」。
AguiInlineFile parseDataUrl(String dataUrl) {
  final RegExpMatch? m = _dataUrlPattern.firstMatch(dataUrl.trim());
  if (m == null) {
    throw AguiProtocolException('staged image is not a base64 data URL');
  }
  return AguiInlineFile(
    mediaType: m.group(1)!.toLowerCase(),
    base64: m.group(2)!.replaceAll(RegExp(r'\s+'), ''),
  );
}

/// 设备工具跑完 ⇒ ⇒ 交回端脑的那一句。
///
/// ⚠️ **只把 `report` 那一句交出去**（组件树是给界面的）⇒ ⇒ 与 legacy 路
/// 同一条规则（`pickReportPayload`）⇒ ⇒ 两端模型看到的形状一致。
/// ⚠️ **失败必须带 error** ⇒ ⇒ 不能只把失败原因塞进 content。
AguiToolOutcome toToolOutcome(bool ok, Object? result, [String? errorText]) {
  if (!ok) return failedOutcome(errorText ?? 'tool failed');
  final Object? payload = pickReportPayload(result);
  if (payload is String) {
    return AguiToolOutcome(ok: true, content: payload);
  }
  try {
    return AguiToolOutcome(ok: true, content: jsonEncode(payload));
  } catch (_) {
    // 序列化不了 ⇒ ⇒ 说清是什么，不要让模型收到「null」。
    return const AguiToolOutcome(
      ok: true,
      content: '[tool result is not serializable]',
    );
  }
}
