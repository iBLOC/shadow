import 'dart:convert';
import 'dart:ui' show Color;

/// **客户端工具** —— 在**用户这台设备上**执行的那一半。
///
/// 端脑的 `tool_call` SSE 事件带着工具名和参数。工具分两种：
/// - **端脑本地工具**（`telencephalon::tools`）：改端脑自己的状态；
/// - **客户端工具**（本文件）：改**用户眼前这台设备**的状态 —— 主题色、
///   明暗、窗口、剪贴板、通知。
///
/// 客户端执行完把结果回传端脑（`TelencephalonClient.reportToolResult`），
/// 端脑再把结果喂回模型 —— 这一整条闭环就是「模型自己让客户端换主题」。
///
/// 与桌面端的关系：两端各有一份注册表，因为**能做什么由设备决定**
/// —— 手机没有窗口可最小化，桌面端没有麦克风权限可申请。
class ClientTool {
  final String name;

  /// 一句话说明这个工具干什么（显示在卡片上）。
  final String description;

  /// 要用户点头才执行吗？
  ///
  /// 「把主题换成靛蓝」这种**用户已经要求过**的动作不需要再问一遍；
  /// 但「删掉这条记忆」这种不可逆的动作必须先确认。
  final bool requiresApproval;

  /// 参数的 **JSON Schema** —— **告诉模型这个工具吃什么**。
  ///
  /// 没有它，模型只知道有 `set_theme` 这个工具，不知道它要一个 `color`
  /// 还是 `dark` ⇒ 只能瞎猜，或者干脆不调。
  ///
  /// **为什么是 `Map` 而不是一套 Dart 类型**：这份东西**就是 JSON**
  /// （要塞进发给模型的 `tools` 数组），再包一层类型只会多一次转换。
  ///
  /// ⚠️ **两端（手机 / 桌面）的同名工具必须导出同样的内容** ⇒ 不然同一个
  /// 模型在手机上和桌面上行为不一样。
  final Map<String, dynamic>? parameters;

  /// 真正干活的地方。**抛异常 = 执行失败**（错误会回传给端脑，
  /// 这样模型知道自己这条路走不通，而不是卡在等结果上）。
  final Future<Object?> Function(Map<String, dynamic> args) execute;

  const ClientTool({
    required this.name,
    required this.description,
    this.requiresApproval = false,
    this.parameters,
    required this.execute,
  });
}

/// 一条工具调用的执行结果。
class ClientToolOutcome {
  final bool ok;
  final Object? result;
  final String? errorText;

  const ClientToolOutcome.success(this.result)
    : ok = true,
      errorText = null;

  const ClientToolOutcome.failure(this.errorText)
    : ok = false,
      result = null;
}

/// 一次工具调用的状态。
enum ToolCallStatus {
  /// 刚收到 `tool_call`，还没开始执行。
  pending,

  /// 正在执行。
  running,

  /// 等用户点头（工具声明了 `requiresApproval`）。
  awaitingApproval,

  /// 执行成功。
  succeeded,

  /// 执行失败 —— 工具抛异常、或者端脑不认这个工具。
  failed,
}

/// 一次工具调用的完整记录 —— 对话流里那张卡片的数据源。
class ToolCallModel {
  /// 调用 id。端脑今天**不携带** id ⇒ 客户端自己合成，
  /// 这样「结果回传」和「卡片」才能对上号。
  final String id;

  /// 工具名。
  final String name;

  /// 工具说明（来自客户端注册表；未知工具没有）。
  final String? description;

  /// 工具参数。
  final Map<String, dynamic> args;

  final ToolCallStatus status;

  /// 执行结果（成功时）。
  final Object? result;

  /// 失败原因（失败时）。
  final String? errorText;

  /// 执行耗时（毫秒）。
  final int? latencyMs;

  /// 结果**有没有成功回传给端脑**。
  ///
  /// 这是两件事：工具在本地跑成了 ≠ 端脑知道了。两端要分开显示，
  /// 否则「本地换了主题、端脑那头模型还在等」会被看成成功。
  final bool reported;

  /// 回传失败的原因（工具本身成功，但结果没送回端脑）。
  final String? reportErrorText;

  const ToolCallModel({
    required this.id,
    required this.name,
    this.description,
    this.args = const {},
    this.status = ToolCallStatus.pending,
    this.result,
    this.errorText,
    this.latencyMs,
    this.reported = false,
    this.reportErrorText,
  });

  ToolCallModel copyWith({
    String? description,
    Map<String, dynamic>? args,
    ToolCallStatus? status,
    Object? result,
    String? errorText,
    int? latencyMs,
    bool? reported,
    String? reportErrorText,
  }) {
    return ToolCallModel(
      id: id,
      name: name,
      description: description ?? this.description,
      args: args ?? this.args,
      status: status ?? this.status,
      result: result ?? this.result,
      errorText: errorText ?? this.errorText,
      latencyMs: latencyMs ?? this.latencyMs,
      reported: reported ?? this.reported,
      reportErrorText: reportErrorText ?? this.reportErrorText,
    );
  }
}

/// 客户端工具注册表 —— 工具名 → 工具。
class ClientToolRegistry {
  final Map<String, ClientTool> _tools;

  ClientToolRegistry([Iterable<ClientTool> tools = const []])
    : _tools = {for (final t in tools) t.name: t};

  ClientTool? lookup(String name) => _tools[name];

  bool supports(String name) => _tools.containsKey(name);

  Iterable<String> get names => _tools.keys;
}

/// 端脑 `tool_call.args` 的线上形态有**两种**，必须都认：
/// - **字符串**（JSON 文本）—— 端脑的 `TelencephalonStreamEvent::ToolCall`
///   里 `args: String`，serde 序列化出来就是一段 JSON 文本；
/// - **对象** —— 有些路径传的是已经拆好的 map。
///
/// 认错的后果很具体：拿到字符串还当对象用 ⇒ 参数全是空的，
/// 「把主题换成靛蓝」会退化成「换成默认色」，而且**看不出哪里错了**。
Map<String, dynamic> parseToolArgs(Object? raw) {
  if (raw == null) return <String, dynamic>{};
  if (raw is Map) {
    return Map<String, dynamic>.from(raw);
  }
  if (raw is String) {
    final text = raw.trim();
    if (text.isEmpty) return <String, dynamic>{};
    try {
      final decoded = jsonDecode(text);
      if (decoded is Map) return Map<String, dynamic>.from(decoded);
      return <String, dynamic>{'value': decoded};
    } catch (_) {
      // 不是 JSON —— 当成纯文本参数，别把整个调用丢掉。
      return <String, dynamic>{'value': text};
    }
  }
  return <String, dynamic>{'value': raw};
}

/// 把注册表导成 OpenAI 的 `tools` 数组 —— **发给模型的那一份**。
///
/// 端脑把它透传给 LLM；模型决定调某个工具时，端脑再把 `tool_call` 事件
/// 发回这台设备 ⇒ 这就是「模型自己让客户端换主题」的**起点**。
///
/// ⚠️ **两端（手机 / 桌面）的同名工具必须导出同样的内容** ⇒ 不然同一个模型
/// 在手机上和桌面上行为不一样。
///
/// 没有 `parameters` 的工具 ⇒ 参数表是空的 ⇒ 模型只能不带参数调它 ⇒ 工具
/// 自己会明确失败（不默默什么也不做）。
List<Map<String, dynamic>> toOpenAiTools(ClientToolRegistry registry) {
  return registry.names.map((name) {
    final tool = registry.lookup(name)!;
    return <String, dynamic>{
      'type': 'function',
      'function': <String, dynamic>{
        'name': tool.name,
        'description': tool.description,
        'parameters': tool.parameters ?? <String, dynamic>{
          'type': 'object',
          'properties': <String, dynamic>{},
        },
      },
    };
  }).toList();
}

/// 移动端内置的客户端工具。
///
/// 主题色的两端色调由 `app_colors.dart` 的 `deriveAccentTones` 派生
/// （与桌面端 `accent.g.ts` 同一套算法）：两端算出来的明暗两端色调必须
/// 一致，否则「模型让手机换主题」换出来的颜色和桌面端对不上。
ClientToolRegistry buildMobileClientTools({
  required Future<void> Function(Color color) setAccentColor,
  required Future<void> Function(bool dark) setDarkMode,
}) {
  return ClientToolRegistry([
    ClientTool(
      name: 'set_theme',
      description: 'Change the app theme colour',
      // **参数声明（给模型看的那一份）** —— 没有它，模型不知道这个工具
      // 要一个 `color` 还是 `dark` ⇒ 只能瞎猜。
      //
      // 两个参数都**不是必填**：`color` 和 `dark` 给哪个都算一次合法调用，
      // 两个都不给时工具**明确失败**（不默默什么也不做）。
      //
      // ⚠️ **这段和桌面端 `clientTools.ts` 里的一字不差** —— 两端发给模型的
      // 东西不一样的话，同一个模型在手机上和桌面上行为就不一样。
      parameters: <String, dynamic>{
        'type': 'object',
        'properties': <String, dynamic>{
          'color': <String, dynamic>{
            'type': 'string',
            'description':
                'Hex colour in #RRGGBB form, e.g. #4F46E5. Use this to change the accent colour.',
          },
          'dark': <String, dynamic>{
            'type': 'boolean',
            'description':
                'true = switch to dark mode, false = switch to light mode. Use this when the user only asks for light/dark.',
          },
        },
      },
      execute: (args) async {
        final color = _parseColor(args['color']);
        if (color != null) {
          await setAccentColor(color);
          return <String, dynamic>{'applied': 'accent', 'color': args['color']};
        }

        final dark = args['dark'];
        if (dark is bool) {
          await setDarkMode(dark);
          return <String, dynamic>{'applied': 'mode', 'dark': dark};
        }

        // 参数认不出来 ⇒ 明确失败，别默默什么也不做。
        throw const FormatException(
          'set_theme expects "color" (#RRGGBB) or "dark" (bool)',
        );
      },
    ),
  ]);
}

/// 把 `#RRGGBB` / `RRGGBB` / `#AARRGGBB` 解析成 [Color]。
///
/// 认不出的颜色名**不猜** —— 猜错一次，用户看到的主题色就和模型说的
/// 完全不是一回事，而模型以为自己成功了。
///
/// `#AARRGGBB` 的 **alpha 被丢掉**（取前 6 位）：主题色带透明度没有意义
/// （会跟背景混色），而且桌面端 `parseHexColor` 也是这么处理的 ——
/// 两端必须一样，否则「模型让手机换主题」换出来的颜色和桌面端对不上。
Color? _parseColor(Object? raw) {
  if (raw is! String) return null;
  var text = raw.trim();
  if (text.isEmpty) return null;
  if (text.startsWith('#')) text = text.substring(1);
  if (text.length == 8) text = text.substring(2);
  if (text.length != 6) return null;
  final value = int.tryParse(text, radix: 16);
  if (value == null) return null;
  return Color(0xFF000000 | value);
}
