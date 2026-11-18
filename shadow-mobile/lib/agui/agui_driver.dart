import 'agui_client.dart';
import 'agui_events.dart';
import 'a2ui_activity.dart';
import 'agui_tool_outcome_gate.dart';
import 'agui_types.dart';

/// 端脑点名让**这台设备**干的一次活（**参数已拼齐**）。
class AguiToolCall {
  final String toolCallId;
  final String toolCallName;
  final String args;
  final String? parentMessageId;

  const AguiToolCall({
    required this.toolCallId,
    required this.toolCallName,
    required this.args,
    this.parentMessageId,
  });
}

/// 设备本地工具的执行入口 —— **界面那一侧给**（审批／输入／真跑都在那边）。
typedef AguiToolExecutor = Future<AguiToolOutcome> Function(AguiToolCall call);

/// driver 吐出来的事件（**kind 分档**：与桌面端那份同形）。
class AguiDriverEvent {
  /// `text` ／ `tool_call` ／ `tool_failed` ／ `tool_result` ／ `progress` ／ `finished`。
  final String kind;

  final String? messageId;
  final String? delta;
  final AguiToolCall? call;

  /// 失败原因（`tool_failed` 时必填）。
  final String? error;

  /// 工具名（`tool_result` ／ `progress`）。
  final String? name;

  /// lobe 那边自己跑的工具结果（`tool_result`）。
  final Object? result;

  /// 其他 CUSTOM 的原值（`progress`）。
  final Object? value;

  final String? toolCallId;
  final String? runId;
  final String? outcome;
  final String? endState;

  /// **AG-UI 承载的那块 A2UI 面**（官方 `ACTIVITY_SNAPSHOT` 的 content）。
  ///
  /// ⚠️ 是**官方 ops 数组**（A2UI v1.0 消息）⇒ ⇒ 零翻译 ⇒ ⇒ 直接喂官方
  /// `MessageProcessor`。
  final List<Map<String, Object?>>? a2uiOps;

  const AguiDriverEvent({
    required this.kind,
    this.messageId,
    this.delta,
    this.call,
    this.error,
    this.name,
    this.result,
    this.value,
    this.toolCallId,
    this.runId,
    this.outcome,
    this.endState,
    this.a2uiOps,
  });
}

/// 一轮最多续几次（工具结果要随**下一次请求**带回去 ⇒ ⇒ 一次请求不够）。
const int aguiDefaultMaxContinuations = 4;

/// AG-UI 的**一轮对话驱动** —— 把协议层变成「客户端真的能跑的一轮」。
///
/// ⚠️ **与桌面端 `src/lib/agui/driver.ts` 逐字对等**（同口径 ⇒ 端脑改一处，
/// 两端都要改，且**改漏了会当场红**）。
///
/// ⚠️ **AG-UI 的工具闭环是「下一次请求带回去」**（不是 legacy 路的
/// `/tool-results` 旁路）：端脑在 AG-UI 这一路**不等**设备回传 ⇒ ⇒ 客户端
/// 跑完工具后，必须**重发**这一轮（`messages[]` 末尾追加 tool 消息）⇒ ⇒
/// 端脑把它当**续轮**喂回模型 ⇒ ⇒ 模型这一轮就能接着说「换好了」。
///
/// ⚠️ **失败不许长得像成功**：
/// · 工具失败 ⇒ ⇒ 回传的 tool 消息**必须带 `error`**（端脑那边「error 在场
///   ⇒ 状态就是 failed」）⇒ ⇒ 不能只把失败原因塞进 content；
/// · 流没跑完就断（没有 RUN_FINISHED）⇒ ⇒ **抛**，不许当成「跑完了」；
/// · RUN_ERROR ⇒ ⇒ 抛，且**带上端脑的原话**。
class AguiDriver {
  final AguiClient client;

  /// 设备本地工具的执行入口。
  ///
  /// ⚠️ **没有它也能跑**：端脑点了名而这台设备干不了 ⇒ ⇒ driver 自己合成一条
  /// **失败**的工具结果回传 ⇒ ⇒ 模型不会干等一个永远不来的结果（与 legacy
  /// 路「unsupported tool → 回传失败」同一口径）。
  final AguiToolExecutor? executeTool;

  final int maxContinuations;

  AguiDriver({
    required this.client,
    this.executeTool,
    this.maxContinuations = aguiDefaultMaxContinuations,
  });

  /// 跑一轮（工具闭环在里面）⇒ ⇒ 逐个事件吐出来。
  Stream<AguiDriverEvent> streamTurn(
    String conversationId,
    AguiRunRequest req,
  ) async* {
    // 每一轮**重发全量** messages[]（AG-UI 的哲学）⇒ ⇒ 用副本，别动调用方的数组。
    //
    // ⚠️ **请求面要整份带上**（tools／threadId／runId）⇒ ⇒ 只发 messages
    // ⇒ ⇒ 模型**不知道这台设备会什么** ⇒ ⇒ 设备工具静默失灵（这一格真踩过）。
    final List<AguiMessage> sent = List<AguiMessage>.of(req.messages);

    int round = 0;
    while (true) {
      if (round > maxContinuations) {
        throw AguiProtocolException(
          'ag-ui driver exceeded $maxContinuations continuations (tool loop did not settle)',
        );
      }
      AguiTurnState state = initialAguiTurnState();
      /// 本轮跑完、等着回传的工具结果（**按调用顺序**）。
      final List<AguiMessage> toolResults = <AguiMessage>[];

      final AguiRunRequest request = AguiRunRequest(
        threadId: req.threadId,
        runId: req.runId,
        messages: sent,
        tools: req.tools,
      );

      await for (final AguiEvent ev
          in client.streamTurn(conversationId, request.toJson())) {
        state = reduceAguiEvent(state, ev);
        if (!ev.isKnown) continue;
        switch (ev.type) {
          case 'TEXT_MESSAGE_CONTENT':
            yield AguiDriverEvent(
              kind: 'text',
              messageId: ev.messageId,
              delta: ev.delta,
            );
            break;
          case 'TOOL_CALL_END':
            final String id = ev.toolCallId ?? '';
            AguiToolCallState? found;
            for (final AguiToolCallState t in state.toolCalls) {
              if (t.toolCallId == id) {
                found = t;
                break;
              }
            }
            if (found == null) break;
            final AguiToolCall call = AguiToolCall(
              toolCallId: found.toolCallId,
              toolCallName: found.toolCallName,
              args: found.args,
              parentMessageId: found.parentMessageId,
            );
            yield AguiDriverEvent(kind: 'tool_call', call: call);
            final AguiToolOutcome outcome = await _runTool(call);
            if (!outcome.ok) {
              yield AguiDriverEvent(
                kind: 'tool_failed',
                call: call,
                error: outcome.error ?? 'tool failed',
              );
            }
            toolResults.add(AguiMessage(
              role: 'tool',
              toolCallId: call.toolCallId,
              content: outcome.content,
              error: outcome.error,
            ));
            break;
          case 'ACTIVITY_SNAPSHOT':
            // ⚠️ **只有 `a2ui-surface` 那一种 activity 归我们管**；
            // 别的 activity ⇒ ⇒ 不画（也不报错）。
            final List<Map<String, Object?>>? ops = a2uiOpsFromEvent(ev);
            if (ops == null) break;
            yield AguiDriverEvent(
              kind: 'a2ui_surface',
              messageId: ev.messageId,
              a2uiOps: ops,
            );
            break;
          case 'CUSTOM':
            final Object? raw = ev.value;
            final Map<String, dynamic> v =
                raw is Map ? raw.cast<String, dynamic>() : <String, dynamic>{};
            if (ev.name == AguiCustomNames.toolResult) {
              final Object? rawToolCallId = v['toolCallId'];
              yield AguiDriverEvent(
                kind: 'tool_result',
                toolCallId: rawToolCallId is String ? rawToolCallId : null,
                name: v['name'] is String ? v['name'] as String : '',
                result: v['result'],
              );
            } else {
              yield AguiDriverEvent(
                kind: 'progress',
                name: ev.name,
                value: ev.value,
              );
            }
            break;
          case 'RUN_ERROR':
            throw AguiProtocolException(ev.message ?? 'ag-ui run failed');
          default:
            break;
        }
      }

      // ⚠️ 流跑完了但**没有** RUN_FINISHED ⇒ ⇒ 这一轮没跑完
      // ⇒ ⇒ **不许当成成功**（那会让界面显示「好了」而其实没跑完）。
      if (state.status != 'finished') {
        throw AguiProtocolException('ag-ui stream ended without RUN_FINISHED');
      }

      if (toolResults.isEmpty) {
        yield AguiDriverEvent(
          kind: 'finished',
          runId: state.runId,
          outcome: state.outcome,
          endState: state.endState,
        );
        return;
      }
      // ⇒ ⇒ 工具结果随**下一次请求**带回去（端脑那边就是「续轮」）。
      sent.addAll(toolResults);
      round++;
    }
  }

  Future<AguiToolOutcome> _runTool(AguiToolCall call) async {
    final AguiToolExecutor? executor = executeTool;
    if (executor == null) {
      // 这台设备干不了 ⇒ ⇒ **合成一条失败结果**回传 ⇒ ⇒ 模型不会干等。
      return AguiToolOutcome(
        ok: false,
        content: '',
        error: 'this client cannot execute tool: ${call.toolCallName}',
      );
    }
    final AguiToolOutcome outcome = await executor(call);
    if (!outcome.ok && (outcome.error == null || outcome.error!.isEmpty)) {
      // 失败却不说为什么 ⇒ ⇒ 等于把失败说成成功 ⇒ ⇒ 不许。
      throw AguiProtocolException(
        'ag-ui tool executor reported failure without a reason: ${call.toolCallName}',
      );
    }
    return outcome;
  }
}
