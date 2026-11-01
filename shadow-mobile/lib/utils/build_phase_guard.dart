import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';

/// 在**不在 build 期**的时候执行 [action]。
///
/// 为什么需要它：Riverpod 的 `debugCanModifyProviders` 钩子把
/// `markNeedsBuild()` 抛出的**任何**异常都改写成同一句
/// "Tried to modify a provider while the widget tree was building."
/// ⇒ 只要在 build 期改了任何一个 provider 的 state，整个 App 就被打断。
///
/// 真实踩过的坑（2026-11-01 真机，小米 2106118C / Android 13）：
/// `ShadowApp.build` 里第一次碰到顶层 `final appRouter` ⇒ `new GoRouter`
/// ⇒ go_router 自己打了一条日志 ⇒ `package:logging` 的
/// `Logger.root.onRecord` 是**同步**广播流（`broadcast(sync: true)`）
/// ⇒ 记录当场回调 ⇒ 日志桥在 **build 期**改了 `logServiceProvider` 的
/// state ⇒ App 死在第一次 build（真机栈：`#24 ShadowApp.build` →
/// `#22 appRouter` → `#17 go_router log` → `#7 wireDartLoggingIntoLogPanel`
/// → `#5 LogService.addLog` → `#0 Riverpod`）。
///
/// 判定用 [WidgetsBinding.schedulerPhase]：
/// - [SchedulerPhase.persistentCallbacks] = build / layout / paint ⇒ **必须**推迟；
/// - 其余（idle / transientCallbacks / postFrameCallbacks）⇒ 可以直接写。
///
/// 推迟用 `addPostFrameCallback`：它在**本帧的 build 之后**执行
/// ⇒ 那时已经不是 build 期了。
/// ⚠️ 只有「当前确实有一帧要画」时才会被调用 —— 而能撞上 build 期，
/// 说明当前就有帧在画 ⇒ 推迟不会把这条日志丢掉。
void runOutsideBuild(VoidCallback action) {
  final binding = WidgetsBinding.instance;
  if (binding.schedulerPhase == SchedulerPhase.persistentCallbacks) {
    binding.addPostFrameCallback((_) => action());
    return;
  }
  action();
}
