import 'dart:async';

/// 设备工具交回端脑的结果（**失败不许长得像成功**）。
///
/// ⚠️ **与 `services/client_tools` 那个 `ClientToolOutcome` 是两样东西**：
/// 那个是「设备本地执行完的结果」（ok／result／errorText），这个是「**要交给
/// 端脑的那一句**」（ok／content／error?）⇒ ⇒ 两者之间由 `agui_bridge.dart`
/// 的 `toToolOutcome` 转（与桌面端 `bridge.ts` 同一处规则）。
class AguiToolOutcome {
  final bool ok;

  /// 给模型看的那一句（成功时给什么就带什么）。
  final String content;

  /// 失败原因（失败时**必填** —— 空着就等于把失败说成成功）。
  final String? error;

  const AguiToolOutcome({
    required this.ok,
    required this.content,
    this.error,
  });
}

/// 失败的兜底结局 —— **error 必填**（空着＝把失败说成成功）。
///
/// [reason] 空白 ⇒ ⇒ 换成一句通用的话，**不许**留空。
AguiToolOutcome failedOutcome(String reason) {
  final String why = reason.trim().isEmpty ? 'tool failed' : reason.trim();
  return AguiToolOutcome(ok: false, content: '', error: why);
}

/// 结算闸 —— **一次调用只兑现一次**。
///
/// ⚠️ **为什么需要它**：AG-UI 的工具闭环是「**下一次请求**带回去」⇒ ⇒ 端脑在
/// AG-UI 这一路**不等**设备 ⇒ ⇒ 设备这边**必须一定**把结果交出去（成功或失败）
/// ⇒ ⇒ 否则模型永远等一个不来的结果 ⇒ ⇒ 那正是「失败长得像成功」。
///
/// ⚠️ **兑现的两种结局**：
/// · 成功 ⇒ ⇒ 内容给模型；
/// · 失败 ⇒ ⇒ **必须带 error**（端脑那边「error 在场 ⇒ 状态就是 failed」）
///   ⇒ ⇒ 不能只把失败原因塞进 content。
///
/// ⚠️ **「只第一次有效」不是洁癖**：用户点两次「批准」／工具既失败又超时 ⇒ ⇒
/// 第二次兑现会把已经结算过的那次**再喂一遍**给模型 ⇒ ⇒ 模型看见两条结果
/// ⇒ ⇒ 那是「重复执行」而不是「重复回话」。
class ToolOutcomeGate {
  final Map<String, Completer<AguiToolOutcome>> _pending =
      <String, Completer<AguiToolOutcome>>{};

  /// 登记一次调用 ⇒ ⇒ 返回它的结算 future（页面在批准／输入完成后兑现）。
  Future<AguiToolOutcome> open(String callId) {
    final Completer<AguiToolOutcome> completer = Completer<AguiToolOutcome>();
    _pending[callId] = completer;
    return completer.future;
  }

  /// 兑现（**只第一次有效**）⇒ ⇒ 返回这次是否真的兑现了。
  bool settle(String callId, AguiToolOutcome outcome) {
    final Completer<AguiToolOutcome>? completer = _pending.remove(callId);
    if (completer == null) return false;
    if (!completer.isCompleted) completer.complete(outcome);
    return true;
  }

  /// 这条调用还欠着结果吗？
  bool isOpen(String callId) => _pending.containsKey(callId);

  /// 还欠着几条（诊断用）。
  int get openCount => _pending.length;

  /// 放弃全部（页面卸载／用户中断）⇒ ⇒ **每一条都兑现成失败**
  /// ⇒ ⇒ 模型不会干等一个永远不来的结果。
  void abandonAll(String reason) {
    final List<String> ids = List<String>.of(_pending.keys);
    for (final String id in ids) {
      settle(id, failedOutcome(reason));
    }
  }
}
