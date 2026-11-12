import 'dart:convert';
import 'dart:ui' show Color;
// ⚠️ `TargetPlatform` 在 **package:flutter/foundation.dart** 里
// ⇒ ⇒ `dart:ui` **不导出**它（那里只有 `Color`）。
import 'package:flutter/foundation.dart' show TargetPlatform;

import '../../generated/l10n/app_localizations.dart';
import '../../l10n/current_l10n.dart';
import '../genui/a2ui_surface_events.dart';
import '../capabilities/accessibility_ops.dart';
import '../capabilities/capability.dart';
import '../capabilities/capability_tools.dart';
import '../capabilities/device_data_channel.dart';
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

  /// 这个工具要**哪一档设备能力**才能跑（可空）。
  ///
  /// ⚠️ 普通工具（`set_theme` 之类）**没有**能力这一说 ⇒ ⇒ 所以可空。
  /// 能力这一层是「**用户配的是能力、不是工具名**」那件事的落点
  /// （见 `capabilities/capability.dart`）⇒ ⇒ 同一个能力下的读 / 写工具
  /// 共享同一档授权 ⇒ ⇒ 授权语义对用户是稳定的。
  ///
  /// ⚠️ **2026-11-03**：这个字段是 `services/capabilities/capability_tools.dart`
  /// （设备能力工具：日历 / 联系人 / 短信 / 相册）需要的 —— 那个文件把
  /// `capability: Capability.xxx` 传进来 ⇒ ⇒ 而这里原来**没有**这个参数
  /// ⇒ ⇒ `dart analyze` 报 `undefined_named_parameter`。
  final Capability? capability;

  /// 真正干活的地方。**抛异常 = 执行失败**（错误会回传给端脑，
  /// 这样模型知道自己这条路走不通，而不是卡在等结果上）。
  final Future<Object?> Function(Map<String, dynamic> args) execute;

  const ClientTool({
    required this.name,
    required this.description,
    this.requiresApproval = false,
    this.parameters,
    this.capability,
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
  /// 调用 id。端脑**带** id 时用端脑那个（`tool_call_id`），
  /// 端脑没带（老端脑）时客户端自己合成一个 ——
  /// 这样「结果回传」和「卡片」才能对上号。
  final String id;

  /// 工具名。
  final String name;

  /// 工具说明（来自客户端注册表；未知工具没有）。
  final String? description;

  /// 这个调用要的是**哪一档设备能力**（可空）。
  ///
  /// ⚠️ 只有能力工具（读日历 / 写日历 / 联系人 / 短信 / 相册）有
  /// ⇒ ⇒ 普通工具（`set_theme`）是 null。
  ///
  /// ⚠️ 授权卡片靠它把 `calendar_read_events` 翻成「读取日历」——
  /// 用户点头前看到的必须是**人话**，不是工具名。
  final Capability? capability;

  /// 这次调用**需要哪些权限**（能力级 token）。
  ///
  /// ⚠️ 它是**工具真实**要的那一档 ⇒ ⇒ **不是** agent 声明的那一档
  /// ⇒ ⇒ 两者对不上时，这次调用**根本不会执行**
  /// ⇒ ⇒ 所以卡片上显示的这份是「**实际要什么**」，不是「它说它要什么」。
  final List<String> requiredPermissions;

  /// 工具参数。
  final Map<String, dynamic> args;

  final ToolCallStatus status;

  /// 执行结果（成功时）。
  final Object? result;

  /// 失败原因（失败时）。
  final String? errorText;

  /// 执行耗时（毫秒）。
  final int? latencyMs;

  /// 这次调用**画出来**的 surface（内联渲染用）。
  ///
  /// ⚠️ 它是**界面**那一半 —— 模型那一半只有 `report`（见
  /// [pickReportPayload]）⇒ ⇒ 组件树不进模型上下文。
  ///
  /// ⚠️ 只有**画得出**的 surface 才会进来（`beginRendering` 才有根组件）
  /// ⇒ ⇒ 只有 `surfaceUpdate` 的那些**不进来** ⇒ ⇒ 不画半成品。
  final List<String> a2uiSurfaceIds;

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
    this.capability,
    this.requiredPermissions = const [],
    this.args = const {},
    this.status = ToolCallStatus.pending,
    this.result,
    this.errorText,
    this.latencyMs,
    this.reported = false,
    this.reportErrorText,
    this.a2uiSurfaceIds = const [],
  });

  ToolCallModel copyWith({
    String? description,
    Capability? capability,
    List<String>? requiredPermissions,
    Map<String, dynamic>? args,
    ToolCallStatus? status,
    Object? result,
    String? errorText,
    int? latencyMs,
    bool? reported,
    String? reportErrorText,
    List<String>? a2uiSurfaceIds,
  }) {
    return ToolCallModel(
      id: id,
      name: name,
      description: description ?? this.description,
      capability: capability ?? this.capability,
      requiredPermissions: requiredPermissions ?? this.requiredPermissions,
      args: args ?? this.args,
      status: status ?? this.status,
      result: result ?? this.result,
      errorText: errorText ?? this.errorText,
      latencyMs: latencyMs ?? this.latencyMs,
      reported: reported ?? this.reported,
      reportErrorText: reportErrorText ?? this.reportErrorText,
      a2uiSurfaceIds: a2uiSurfaceIds ?? this.a2uiSurfaceIds,
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
List<Map<String, dynamic>> toOpenAiTools(
  ClientToolRegistry registry, {
  /// **要排除的工具名** —— 它们**不出现在**发给模型的那一份里。
  ///
  /// ⚠️ **为什么需要**：用户把某个能力设成「彻底关闭」⇒ ⇒ 那个能力对
  /// 模型**不存在** ⇒ ⇒ 模型**不该**在 `tools` 数组里看见它
  /// ⇒ ⇒ 否则模型会浪费回合去调一个必然被拒的工具。
  ///
  /// ⚠️ **可选带默认值** ⇒ ⇒ 旧的调用点 `toOpenAiTools(registry)` 不受影响
  /// ⇒ ⇒ 跨端闸与兄弟的既有测试都照旧跑。
  Set<String> excludedNames = const {},
}) {
  return registry.names
      .where((name) => !excludedNames.contains(name))
      .map((name) {
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

/// 「档位 = 彻底关闭」的那些能力，对应的**工具名**。
///
/// ⚠️ **为什么按能力挑、而不是让调用方按工具名挑**：用户配的是**能力**
/// ⇒ ⇒ 同一个能力下的读 / 写工具共享同一档 ⇒ ⇒ 过滤也必须按能力走
/// ⇒ ⇒ 否则「关了读日历」可能只挡住读、却漏了写。
///
/// ⚠️ 普通工具（`set_theme` 之类）**没有**能力 ⇒ ⇒ 永远不在这个集合里
/// ⇒ ⇒ 「彻底关闭日历」不会误伤换主题。
Set<String> disabledCapabilityToolNames(
  ClientToolRegistry registry,
  AuthorizationMode Function(Capability capability) modeFor,
) {
  final out = <String>{};
  for (final name in registry.names) {
    final capability = registry.lookup(name)?.capability;
    if (capability == null) continue;
    if (modeFor(capability) == AuthorizationMode.disabled) out.add(name);
  }
  return out;
}

/// 「**这个平台压根没有**」的那些能力，对应的工具名。
///
/// ⚠️ iOS 没有公开的短信读取 API ⇒ ⇒ 短信这个能力在 iOS 上**不存在**
/// ⇒ ⇒ 那个工具**不该**出现在发给模型的 `tools` 数组里
/// ⇒ ⇒ 否则模型会调一个**注定失败**的工具 ⇒ ⇒ 白白浪费一个回合
/// ⇒ ⇒ 而且用户看到的是「报错」而不是「这平台没有这能力」。
///
/// ⚠️ 这一条与「用户关掉了某个能力」**语义不同**（一个是平台没有，
/// 一个是用户不让用）⇒ ⇒ 但对模型来说**效果一样**（都看不见）
/// ⇒ ⇒ 于是两件事都归到「不该给模型看」这一类。
Set<String> unsupportedCapabilityToolNames(
  ClientToolRegistry registry, {
  TargetPlatform? platform,
}) {
  final out = <String>{};
  for (final name in registry.names) {
    final capability = registry.lookup(name)?.capability;
    if (capability == null) continue;
    if (!capabilitySupportedOn(capability, platform: platform)) out.add(name);
  }
  return out;
}

/// 取 surface 的**原始事件** —— 注入进来的。
///
/// ⚠️ **为什么注入**：工具这一层不该自己去碰端脑的地址 / 钥匙
/// ⇒ ⇒ 真相源是 [GenUIAgentService]（它已经在用既有传输与凭据）
/// ⇒ ⇒ 单测里换成喂 fixture 的假 fetcher 就行。
typedef A2uiSurfaceEventFetcher =
    Future<List<Map<String, Object?>>> Function(String view);

/// 一份工具结果有**两个读者**：**界面**（要整棵组件树）与**模型**（要一句话）。
///
/// ⚠️ 把组件树原样喂回模型 ⇒ 模型上下文被一堆 JSON 淹了 ⇒ ⇒
/// 这里只把 `report` 那一句交出去 ⇒ ⇒ 界面那份仍然完整。
///
/// ⚠️ 没有 `report` 的工具**原样回传**（别把别人的结果改形状）。
///
/// ⚠️ **与桌面端 `pickReportPayload` 同一处规则**
/// （`shadow-desktop/src/lib/clientTools.ts:100-108`）
/// ⇒ ⇒ 两端给模型看的东西一样。
Object? pickReportPayload(Object? result) {
  if (result is Map) {
    final report = result['report'];
    if (report is String && report.trim().isNotEmpty) {
      return <String, Object?>{'report': report};
    }
  }
  return result;
}

/// 工具结果里带的 surface id —— 内联渲染用。
///
/// ⚠️ **只有 `beginRendering` 才算数** ⇒ 只有 `surfaceUpdate` 那些
/// ⇒ 组件还在缓存里 ⇒ 画不出东西 ⇒ ⇒ 不画半成品。
List<String> a2uiSurfaceIdsFromToolResult(Object? result) {
  if (result is! Map) return const [];
  final events = result['a2ui_events'];
  if (events is! List) return const [];
  final maps = <Map<String, Object?>>[];
  for (final event in events) {
    if (event is Map) maps.add(Map<String, Object?>.from(event));
  }
  return a2uiRenderableSurfaceIdsFromEvents(maps);
}

/// 移动端内置的客户端工具。
///
/// 主题色的两端色调由 `app_colors.dart` 的 `deriveAccentTones` 派生
/// （与桌面端 `accent.g.ts` 同一套算法）：两端算出来的明暗两端色调必须
/// 一致，否则「模型让手机换主题」换出来的颜色和桌面端对不上。
ClientToolRegistry buildMobileClientTools({
  required Future<void> Function(Color color) setAccentColor,
  required Future<void> Function(bool dark) setDarkMode,
  // ⚠️ **必填** —— 没有它就没有 `show_a2ui_surface` 这个工具
  // ⇒ ⇒ 两端发给模型的 `tools` 数组会**不一样**
  // ⇒ ⇒ 同一个模型在手机上叫不出它 ⇒ ⇒ 「两端一致」就破了。
  required A2uiSurfaceEventFetcher fetchSurfaceEvents,
  // ⚠️ **给模型看的那句话走真的 l10n** —— 默认取**当前语言**
  // （`currentL10n()`：设备语言就是界面语言）。
  // ⇒ 注入是为了**测**：单测要能钉住「英文系统里那句话**就是英文**」
  // ⇒ ⇒ 不然「硬编码中文」在中文机器上**测不出来**。
  AppLocalizations Function()? l10nProvider,
  // 设备数据通道（读日历 / 写日历 / 联系人 / 短信 / 相册）——
  // ⚠️ **可注入**是为了单测能塞一个假通道进来 ⇒ ⇒ 单测不必真的连原生层。
  DeviceDataChannel deviceDataChannel = const DeviceDataChannel(),
  // 无障碍那一层（读屏 / 点击 / 滑动）——
  // ⚠️ **同样可注入**：否则单测只能测到「服务没开 ⇒ 失败」，
  // ⇒ ⇒ 测不到「服务已开 ⇒ 真的会去点」那条正路径。
  AccessibilityOps? accessibilityOps,
}) {
  final l10n = l10nProvider ?? currentL10n;
  // 能力工具的**执行器** —— 工具定义在下面（必须是**字面量**形式，
  // 跨端对齐闸要看得见），干活的那一半在 `capabilities/capability_tools.dart`。
  final capabilityTools = CapabilityTools(
    channel: deviceDataChannel,
    accessibility: accessibilityOps,
  );
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
    ClientTool(
      // ⚠️ **工具名与桌面端逐字一致** —— 两端发给模型的 `tools` 数组
      // 里必须**有同一个名字** ⇒ ⇒ 不然同一个模型在手机上叫不出它。
      name: 'show_a2ui_surface',
      // ⚠️ **这段描述与桌面端一字不差**
      // （`shadow-desktop/src/lib/clientTools.ts` 的同名工具）
      // ⇒ 两端发给模型的东西不一样 ⇒ 同一个模型在两端行为不一样。
      description:
          'Show the user a generated interface inside the conversation (task board or agent list). Use it when the user asks to SEE their tasks or agents instead of listing them as text.',
      // ⚠️ **参数声明（给模型看的那一份）** —— 没有它，模型不知道这个工具
      // 要一个 `view` ⇒ 只能瞎猜，或者干脆不调。
      parameters: <String, dynamic>{
        'type': 'object',
        'properties': <String, dynamic>{
          'view': <String, dynamic>{
            'type': 'string',
            // ⚠️ **不要写 `<String>[` —— 跨端闸 `scripts/check-client-tools.mjs`
            // 的正则只认「键后面直接跟 `[`」**
            // （`'?enum'?\s*:\s*\[([^\]]*)\]`）
            // ⇒ 带上类型参数 ⇒ 闸**看不见这个键**
            // ⇒ ⇒ 两端明明一样，闸却报「不一致」。
            // ⇒ ⇒ Dart 的 `Map<String, dynamic>` 里字面量本来就不需要类型标注。
            'enum': ['tasks', 'agents'],
            'description':
                "Which interface to draw: 'tasks' = the task board, 'agents' = the registered agent list.",
          },
        },
        // ⚠️ 同上 —— `required` 也**不能**带 `<String>`。
        'required': ['view'],
      },
      execute: (args) async {
        // ⚠️ **认不出的 view 当 tasks** —— 模型偶尔会瞎填；
        // 宁可画错一块看板，也不要让这一轮失败。
        // （与桌面端逐字一致 ⇒ 两端对模型说同一件事。）
        final view = args['view'] == 'agents' ? 'agents' : 'tasks';
        final events = await fetchSurfaceEvents(view);
        // ⚠️ **契约**：`{report, a2ui_events}` ——
        // `a2ui_events` 是端脑 `POST /a2a` 发的**同一批事件**
        // （逐字同形）⇒ ⇒ 两端吃的是同一份字节；
        // `report` 是给模型看的那**一句** ⇒ ⇒ 回传端脑时**只带它**
        // （见 [pickReportPayload]）⇒ ⇒ 模型上下文里没有组件树。
        return <String, dynamic>{
          // ⚠️ **走真的 l10n** —— 这句话**用户也看得见**
          //（画在那次工具调用下面）⇒ ⇒ 不能硬编码中文。
          // ⚠️ `currentL10n()` 是**拿不到 BuildContext 时**取当前语言的那一套
          //（`lib/l10n/current_l10n.dart`）—— 工具执行器正好是那种地方。
          'report': a2uiSurfaceReport(
            view: view,
            events: events,
            l10n: l10n(),
          ),
          'a2ui_events': events,
        };
      },
    ),

    // ── 设备能力工具 ─────────────────────────────────────────
    //
    // ⚠️ **这五个是「手机独有」的** —— 桌面端没有手机上的日历 / 联系人 /
    // 短信 / 相册 ⇒ ⇒ 跨端对齐闸（`scripts/check-client-tools.mjs`）里
    // 登记成「桌面端缺失 = 已接受的产品差异」。
    //
    // ⚠️ **`requiresApproval` 一律 false** —— 授权闸**不在工具上**，
    // 而在**档位**上（见 `capability_policy_provider`）：
    // 「每次询问」⇒ 这一档要出 Allow / Deny 卡片；「完全访问」⇒ 直接跑。
    // ⇒ ⇒ 档位是**运行时**可改的 ⇒ ⇒ 把它钉在工具上就不对了。
    ClientTool(
      name: 'calendar_read_events',
      description:
          'Read calendar events on this phone within a time range. Use when the user asks what is on their calendar, whether they are free at a certain time, or when their next meeting is.',
      capability: Capability.calendarRead,
      parameters: <String, dynamic>{
        'type': 'object',
        'properties': <String, dynamic>{
          'required_permissions': <String, dynamic>{
            'type': 'array',
            'items': <String, dynamic>{
              'type': 'string',
              'enum': ['calendar_read'],
            },
            'description':
                'Declare which device permission this call needs on this phone. It must be exactly ["calendar_read"] for this tool. The app checks the declaration against the real requirement and refuses the call if they do not match.',
          },
          'from': <String, dynamic>{
            'type': 'string',
            'description':
                'Start of the range as an ISO-8601 local date-time, e.g. 2026-11-02T09:00:00. Defaults to now.',
          },
          'to': <String, dynamic>{
            'type': 'string',
            'description':
                'End of the range as an ISO-8601 local date-time. Defaults to 7 days from the start.',
          },
          'limit': <String, dynamic>{
            'type': 'integer',
            'description': 'Maximum number of events to return. Defaults to 50.',
          },
        },
      },
      execute: (args) => capabilityTools.readCalendar(args),
    ),
    ClientTool(
      name: 'calendar_write_event',
      description:
          'Create or update an event in the calendar on this phone. Use when the user asks to schedule a meeting, add a reminder, or block a time slot.',
      capability: Capability.calendarWrite,
      parameters: <String, dynamic>{
        'type': 'object',
        'properties': <String, dynamic>{
          'required_permissions': <String, dynamic>{
            'type': 'array',
            'items': <String, dynamic>{
              'type': 'string',
              'enum': ['calendar_write'],
            },
            'description':
                'Declare which device permission this call needs on this phone. It must be exactly ["calendar_write"] for this tool. The app checks the declaration against the real requirement and refuses the call if they do not match.',
          },
          'title': <String, dynamic>{
            'type': 'string',
            'description': 'Event title.',
          },
          'start': <String, dynamic>{
            'type': 'string',
            'description':
                'Start time as an ISO-8601 local date-time, e.g. 2026-11-02T14:00:00.',
          },
          'end': <String, dynamic>{
            'type': 'string',
            'description':
                'End time as an ISO-8601 local date-time. Defaults to one hour after the start.',
          },
          'description': <String, dynamic>{
            'type': 'string',
            'description': 'Optional event body.',
          },
          'location': <String, dynamic>{
            'type': 'string',
            'description': 'Optional location.',
          },
          'event_id': <String, dynamic>{
            'type': 'string',
            'description':
                'Existing event id to update. Omit to create a new event.',
          },
        },
        'required': ['title', 'start'],
      },
      execute: (args) => capabilityTools.writeCalendar(args),
    ),
    ClientTool(
      name: 'contacts_search',
      description:
          "Search the contacts stored on this phone by name. Use when the user asks for someone's phone number, email address, or how to reach a person.",
      capability: Capability.contacts,
      parameters: <String, dynamic>{
        'type': 'object',
        'properties': <String, dynamic>{
          'required_permissions': <String, dynamic>{
            'type': 'array',
            'items': <String, dynamic>{
              'type': 'string',
              'enum': ['contacts'],
            },
            'description':
                'Declare which device permission this call needs on this phone. It must be exactly ["contacts"] for this tool. The app checks the declaration against the real requirement and refuses the call if they do not match.',
          },
          'query': <String, dynamic>{
            'type': 'string',
            'description':
                'Name fragment to search for. Omit to list the first contacts.',
          },
          'limit': <String, dynamic>{
            'type': 'integer',
            'description': 'Maximum number of contacts to return. Defaults to 50.',
          },
        },
      },
      execute: (args) => capabilityTools.readContacts(args),
    ),
    ClientTool(
      name: 'sms_read_messages',
      description:
          'Read the most recent SMS messages on this phone. Use when the user asks about their messages, whether someone replied, or what a message said.',
      capability: Capability.sms,
      parameters: <String, dynamic>{
        'type': 'object',
        'properties': <String, dynamic>{
          'required_permissions': <String, dynamic>{
            'type': 'array',
            'items': <String, dynamic>{
              'type': 'string',
              'enum': ['sms'],
            },
            'description':
                'Declare which device permission this call needs on this phone. It must be exactly ["sms"] for this tool. The app checks the declaration against the real requirement and refuses the call if they do not match.',
          },
          'limit': <String, dynamic>{
            'type': 'integer',
            'description': 'Maximum number of messages to return. Defaults to 30.',
          },
        },
      },
      execute: (args) => capabilityTools.readSms(args),
    ),
    ClientTool(
      name: 'photos_list_recent',
      description:
          'List recent photos on this phone (title, date, size only). Use when the user asks about their pictures or screenshots.',
      capability: Capability.photos,
      parameters: <String, dynamic>{
        'type': 'object',
        'properties': <String, dynamic>{
          'required_permissions': <String, dynamic>{
            'type': 'array',
            'items': <String, dynamic>{
              'type': 'string',
              'enum': ['photos'],
            },
            'description':
                'Declare which device permission this call needs on this phone. It must be exactly ["photos"] for this tool. The app checks the declaration against the real requirement and refuses the call if they do not match.',
          },
          'limit': <String, dynamic>{
            'type': 'integer',
            'description': 'Maximum number of photos to return. Defaults to 30.',
          },
        },
      },
      execute: (args) => capabilityTools.readPhotos(args),
    ),
    ClientTool(
      name: 'notification_read_events',
      description:
          'Read recent notifications on this device (app, title, text, time). Use when the user asks what notifications arrived, whether a message came in, or what is currently in the notification center.',
      capability: Capability.notificationsRead,
      parameters: <String, dynamic>{
        'type': 'object',
        'properties': <String, dynamic>{
          'required_permissions': <String, dynamic>{
            'type': 'array',
            'items': <String, dynamic>{
              'type': 'string',
              'enum': ['notifications_read'],
            },
            'description':
                'Declare which device permission this call needs on this phone. It must be exactly ["notifications_read"] for this tool. The app checks the declaration against the real requirement and refuses the call if they do not match.',
          },
          'limit': <String, dynamic>{
            'type': 'integer',
            'description': 'Maximum number of notifications to return. Defaults to 30.',
          },
          'include_ongoing': <String, dynamic>{
            'type': 'boolean',
            'description': 'Include ongoing notifications (music playback, downloads). Defaults to false.',
          },
        },
      },
      execute: (args) => capabilityTools.readNotifications(args),
    ),

    // ── 手机操作（mobile use）────────────────────────────────
    //
    // ⚠️ **移动端对标桌面端 computer-use 的那一条腿** ——
    // 「读日历 / 写日历 / 联系人 / 短信 / 相册」是**读这台手机的数据**，
    // 而这一族是「**操作这台手机**」（能点「确认支付」、能打字发消息）
    // ⇒ ⇒ 风险面高一个量级 ⇒ ⇒ 它有自己的能力与授权档。
    //
    // ⚠️ 底座是 Android 的**无障碍服务**（AccessibilityService）
    // ⇒ ⇒ 走 `com.ibloc.shadow/accessibility` 那条通道
    // ⇒ ⇒ 而无障碍服务**不能**由程序弹窗申请 ⇒ ⇒ 用户得在系统设置里开
    // ⇒ ⇒ 那一层由设置页的「无障碍服务」状态行负责。
    ClientTool(
      name: 'mobile_read_screen',
      description:
          'Read what is currently on this phone screen as an accessibility tree (the visible text and control labels). Call it before tapping so you know what is actually on screen. Three separate fields tell you what you are looking at. source says which TREE the text came from: android-a11y (the native accessibility tree of whatever window is in front) or flutter-semantics (this app own Flutter semantics tree, used when the native tree is unavailable); it does NOT say whose screen it is, because either tree can be this app own screen. coordinateSpace says how to read the coordinates: screen means whole-screen physical pixels you can tap directly with mobile_tap, view means this window own pixels, so use mobile_find_and_click to act on them. foregroundPackage says whose screen it is: it is the package name of the app that currently owns the screen, so you can tell another app from this app own screen; when it is null it means the foreground app could not be read, not that there is no foreground app.',
      capability: Capability.mobileUse,
      parameters: <String, dynamic>{
        'type': 'object',
        'properties': <String, dynamic>{
          'required_permissions': <String, dynamic>{
            'type': 'array',
            'items': <String, dynamic>{
              'type': 'string',
              'enum': ['mobile_use'],
            },
            'description':
                'Declare which device permission this call needs on this phone. For the phone-control tools it must be exactly ["mobile_use"] — the on-device accessibility service that lets the assistant drive this phone. The app checks the declaration against the real requirement and refuses the call if they do not match.',
          },
        },
      },
      execute: (args) => capabilityTools.readScreen(args),
    ),
    ClientTool(
      name: 'mobile_tap',
      description:
          'Tap one point on this phone screen. Use it to press a button or a field. Prefer mobile_find_and_click when the target shows visible text, because coordinates break as soon as the layout shifts.',
      capability: Capability.mobileUse,
      parameters: <String, dynamic>{
        'type': 'object',
        'properties': <String, dynamic>{
          'required_permissions': <String, dynamic>{
            'type': 'array',
            'items': <String, dynamic>{
              'type': 'string',
              'enum': ['mobile_use'],
            },
            'description':
                'Declare which device permission this call needs on this phone. For the phone-control tools it must be exactly ["mobile_use"] — the on-device accessibility service that lets the assistant drive this phone. The app checks the declaration against the real requirement and refuses the call if they do not match.',
          },
          'x': <String, dynamic>{
            'type': 'integer',
            'description':
                'X coordinate in screen pixels, measured from the left edge.',
          },
          'y': <String, dynamic>{
            'type': 'integer',
            'description':
                'Y coordinate in screen pixels, measured from the top edge.',
          },
        },
        'required': ['x', 'y'],
      },
      execute: (args) => capabilityTools.tap(args),
    ),
    ClientTool(
      name: 'mobile_long_press',
      description:
          'Press and hold one point on this phone screen. Use it for long-press menus and drag handles.',
      capability: Capability.mobileUse,
      parameters: <String, dynamic>{
        'type': 'object',
        'properties': <String, dynamic>{
          'required_permissions': <String, dynamic>{
            'type': 'array',
            'items': <String, dynamic>{
              'type': 'string',
              'enum': ['mobile_use'],
            },
            'description':
                'Declare which device permission this call needs on this phone. For the phone-control tools it must be exactly ["mobile_use"] — the on-device accessibility service that lets the assistant drive this phone. The app checks the declaration against the real requirement and refuses the call if they do not match.',
          },
          'x': <String, dynamic>{
            'type': 'integer',
            'description':
                'X coordinate in screen pixels, measured from the left edge.',
          },
          'y': <String, dynamic>{
            'type': 'integer',
            'description':
                'Y coordinate in screen pixels, measured from the top edge.',
          },
        },
        'required': ['x', 'y'],
      },
      execute: (args) => capabilityTools.longPress(args),
    ),
    ClientTool(
      name: 'mobile_swipe',
      description:
          'Swipe on this phone screen from one point to another. Use it to scroll a list or swipe a page.',
      capability: Capability.mobileUse,
      parameters: <String, dynamic>{
        'type': 'object',
        'properties': <String, dynamic>{
          'required_permissions': <String, dynamic>{
            'type': 'array',
            'items': <String, dynamic>{
              'type': 'string',
              'enum': ['mobile_use'],
            },
            'description':
                'Declare which device permission this call needs on this phone. For the phone-control tools it must be exactly ["mobile_use"] — the on-device accessibility service that lets the assistant drive this phone. The app checks the declaration against the real requirement and refuses the call if they do not match.',
          },
          'x1': <String, dynamic>{
            'type': 'integer',
            'description': 'Start X coordinate in screen pixels.',
          },
          'y1': <String, dynamic>{
            'type': 'integer',
            'description': 'Start Y coordinate in screen pixels.',
          },
          'x2': <String, dynamic>{
            'type': 'integer',
            'description': 'End X coordinate in screen pixels.',
          },
          'y2': <String, dynamic>{
            'type': 'integer',
            'description': 'End Y coordinate in screen pixels.',
          },
          'duration_ms': <String, dynamic>{
            'type': 'integer',
            'description':
                'How long the swipe lasts, in milliseconds. Defaults to 300.',
          },
        },
        'required': ['x1', 'y1', 'x2', 'y2'],
      },
      execute: (args) => capabilityTools.swipe(args),
    ),
    ClientTool(
      name: 'mobile_find_and_click',
      description:
          'Find a control on the current screen by its visible text and click it. More reliable than coordinates because it survives layout changes.',
      capability: Capability.mobileUse,
      parameters: <String, dynamic>{
        'type': 'object',
        'properties': <String, dynamic>{
          'required_permissions': <String, dynamic>{
            'type': 'array',
            'items': <String, dynamic>{
              'type': 'string',
              'enum': ['mobile_use'],
            },
            'description':
                'Declare which device permission this call needs on this phone. For the phone-control tools it must be exactly ["mobile_use"] — the on-device accessibility service that lets the assistant drive this phone. The app checks the declaration against the real requirement and refuses the call if they do not match.',
          },
          'text': <String, dynamic>{
            'type': 'string',
            'description':
                'The visible text of the control to click, e.g. 确定 or Send.',
          },
        },
        'required': ['text'],
      },
      execute: (args) => capabilityTools.findAndClick(args),
    ),
    ClientTool(
      name: 'mobile_global_action',
      description:
          'Trigger a system-wide navigation action on this phone: go back, go home, open the recent-apps list, pull down the notification shade, or open the power menu.',
      capability: Capability.mobileUse,
      parameters: <String, dynamic>{
        'type': 'object',
        'properties': <String, dynamic>{
          'required_permissions': <String, dynamic>{
            'type': 'array',
            'items': <String, dynamic>{
              'type': 'string',
              'enum': ['mobile_use'],
            },
            'description':
                'Declare which device permission this call needs on this phone. For the phone-control tools it must be exactly ["mobile_use"] — the on-device accessibility service that lets the assistant drive this phone. The app checks the declaration against the real requirement and refuses the call if they do not match.',
          },
          'action': <String, dynamic>{
            'type': 'string',
            // ⚠️ **不要写 `<String>[`** —— 跨端闸 `scripts/check-client-tools.mjs`
            // 的正则只认「键后面直接跟 `[`」
            // （`'?enum'?\s*:\s*\[([^\]]*)\]`）
            // ⇒ 带上类型参数 ⇒ 闸**看不见这个键**
            // ⇒ ⇒ 两端明明一样，闸却报「不一致」。
            'enum': [
              'back',
              'home',
              'recents',
              'notifications',
              'quick_settings',
              'power_dialog',
            ],
            'description': 'Which system action to trigger.',
          },
        },
        'required': ['action'],
      },
      execute: (args) => capabilityTools.globalAction(args),
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
