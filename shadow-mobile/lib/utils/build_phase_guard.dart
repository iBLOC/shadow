import 'dart:async';

/// 把 [action] 推迟到**当前这段同步执行结束之后**再执行 ——
/// 也就是**一定不在 widget 树的构建期**。
///
/// ## 为什么用「微任务」而不是「看 phase」
///
/// 第一版是「看 `SchedulerBinding.schedulerPhase` 是不是
/// `persistentCallbacks`」⇒ **实测不够**：App 死在**第一次 build**
/// （`ShadowApp.build` → 顶层 `final appRouter` 惰性构造 → go_router
/// 打了一条日志 → 同步日志流当场回调 → 写 provider），而那一刻的
/// phase **并不是** `persistentCallbacks`（warm-up 那次构建不落在
/// 那个 phase 里）⇒ 判据放行了这次写入 ⇒ 照旧炸。
///
/// Flutter 真正禁止的是「在 `BuildOwner.buildScope` 期间改 provider」
/// （`owner._debugStateLocked`）。而 `buildScope` 是**同步**的 ⇒
/// 任何**微任务**都在它返回之后才跑 ⇒ **微任务是不依赖 phase 判据、
/// 又必定躲开 buildScope 的推迟方式**。
///
/// ⇒ 一律推迟，**不猜**当前是不是 build 期。
///
/// ## 顺带一条排查纪律
///
/// ⚠️ Riverpod 那句 "Tried to modify a provider while the widget tree was
/// building." 是**假面**：`flutter_riverpod` 的 `_debugCanModifyProviders`
/// 把 `markNeedsBuild()` 抛出的**任何**异常都改写成这一句
/// （连「元素已 dispose」「widget tree was locked」也是这句）
/// ⇒ 排查这类问题**必须看栈**，不能只看那句消息
/// （同族于「HTTP 状态码 ≠ 路由不存在」）。
void runOutsideBuild(void Function() action) {
  scheduleMicrotask(action);
}
