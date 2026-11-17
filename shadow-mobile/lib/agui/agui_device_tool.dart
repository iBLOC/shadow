import 'dart:convert';

import '../services/capabilities/capability.dart';
import '../services/capabilities/capability_declaration.dart';
import '../services/client_tools/client_tool_registry.dart';
import 'agui_client.dart';
import 'agui_events.dart';

/// AG-UI 那一路的**设备工具判定** —— 纯函数（判据钉在这一层）。
///
/// ⚠️ **为什么单独抽一层**：端脑在 AG-UI 这一路**只负责点名**
/// （工具名 ＋ 参数 JSON）⇒ ⇒ 「这台设备能不能干」「参数对不对」
/// 「有没有被权限声明骗过」这几格判定**必须**有地方住 ⇒ ⇒ 住在
/// provider 里 ⇒ ⇒ 就没法单测 ⇒ ⇒ 这一层把它收成纯函数。
///
/// ⚠️ **失败不许长得像成功**：每一处判不下去都给出**原因**
/// ⇒ ⇒ 那个原因会作为 AG-UI 的 `error` 字段回传 ⇒ ⇒ 端脑那边
/// 「error 在场 ⇒ 状态就是 failed」⇒ ⇒ 模型能看见失败并改口径。
class AguiToolDecision {
  /// **能不能执行** —— false ⇒ ⇒ 失败原因在 [error]（**必须非空**）。
  final bool ok;

  /// 失败原因（端脑那边「error 在场 ⇒ 状态就是 failed」）。
  final String? error;

  /// 查到的工具（[ok] 为 true 时非空）。
  final ClientTool? tool;

  /// 解析好的参数（[ok] 为 true 时非空）。
  final Map<String, dynamic> args;

  const AguiToolDecision.ok({required this.tool, required this.args})
      : ok = true,
        error = null;

  const AguiToolDecision.failed(this.error)
      : ok = false,
        tool = null,
        args = const <String, dynamic>{};
}

/// 端脑点名的这一次调用**能不能在这台设备上跑**。
///
/// ⚠️ **五道闸，顺序与 legacy 路逐条同口径**（legacy 在
/// `chat_provider.dart` 的 `_handleToolCall` 里）：
/// ❶ 名字空 ⇒ 失败；❷ 这台设备不会这个活 ⇒ 失败（unsupported tool）；
/// ❸ 能力「**彻底关闭**」⇒ **绝不执行**（第一道保险之外的双保险）；
/// ❹ 参数不是合法 JSON ⇒ 失败（不许当成空参数跑）；
/// ❺ 权限声明对不上 ⇒ 失败（**核对 ≠ 授权** ⇒ ⇒ 声明说了算就是模型给自己发权限）。
///
/// ⚠️ **「要不要问用户」不在这里判** —— 那是运行时档位（用户随时能改）
/// ⇒ ⇒ 留在 provider（与 legacy 路同一处判）。
AguiToolDecision decideAguiToolCall({
  required String name,
  required String argsJson,
  required ClientToolRegistry registry,
  required AuthorizationMode Function(Capability capability) modeFor,
}) {
  if (name.isEmpty) {
    return const AguiToolDecision.failed('tool call without a name');
  }
  final ClientTool? tool = registry.lookup(name);
  if (tool == null) {
    // ⚠️ 端脑点了一个这台设备不会的活 ⇒ ⇒ **明确失败** ⇒ ⇒ 模型不会
    // 永远等一个不来的结果。
    return AguiToolDecision.failed('unsupported tool: $name');
  }
  final Capability? capability = tool.capability;
  if (capability != null && modeFor(capability) == AuthorizationMode.disabled) {
    return AguiToolDecision.failed(
      'capability disabled: ${capability.wire}',
    );
  }
  Map<String, dynamic> args;
  try {
    final Object? decoded = argsJson.isEmpty
        ? const <String, dynamic>{}
        : jsonDecode(argsJson);
    if (decoded is Map) {
      args = decoded.cast<String, dynamic>();
    } else {
      return const AguiToolDecision.failed('tool arguments are not an object');
    }
  } catch (e) {
    // ⚠️ **参数坏掉不许当成空参数跑** ⇒ ⇒ 那是「跑一个错的活」。
    return AguiToolDecision.failed('tool arguments are not valid JSON: $e');
  }
  final declaration = evaluatePermissionDeclaration(
    capability: capability,
    declared: declaredPermissionsOf(args),
  );
  if (!declaration.ok) {
    return AguiToolDecision.failed(
      'permission declaration mismatch: '
      'declared=[${declaration.declared.join(',')}] '
      'required=[${declaration.required.join(',')}]',
    );
  }
  return AguiToolDecision.ok(tool: tool, args: args);
}

/// legacy 路的附件载荷 ⇒ ⇒ AG-UI 的**内联**附件。
///
/// ⚠️ **键名不一样，这一格是接缝**：legacy 载荷是
/// `{media_type, data, filename?}`（**`media_type` 是下划线**）
/// ⇒ ⇒ AG-UI 的 part 要 `{source:{type:'data', value, mimeType}}`
/// ⇒ ⇒ **`mimeType` 是驼峰** ⇒ ⇒ 照抄键名 ⇒ ⇒ 端脑那侧按错类型处理
/// ⇒ ⇒ （把 PDF 当纯文本解 ⇒ ⇒ 乱码 ⇒ ⇒ 模型读到乱码）⇒ ⇒
/// **失败长得像成功**。
///
/// ⚠️ **缺键 ⇒ 响亮地拒** —— 附件发不出去要说清为什么 ⇒ ⇒ 不许静默丢。
List<AguiInlineFile> aguiInlineFilesFromAttachments(
  List<Map<String, String>>? payloads,
) {
  if (payloads == null || payloads.isEmpty) return const <AguiInlineFile>[];
  final List<AguiInlineFile> files = <AguiInlineFile>[];
  for (final Map<String, String> payload in payloads) {
    final String? mediaType = payload['media_type'];
    final String? data = payload['data'];
    if (mediaType == null || mediaType.isEmpty) {
      throw AguiProtocolException('attachment has no media_type');
    }
    if (data == null || data.isEmpty) {
      throw AguiProtocolException('attachment has no data');
    }
    files.add(AguiInlineFile(mediaType: mediaType, base64: data));
  }
  return files;
}
