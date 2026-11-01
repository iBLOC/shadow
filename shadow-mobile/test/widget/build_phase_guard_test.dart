import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:logging/logging.dart';
import 'package:shadow_mobile/providers/log_provider.dart';

import 'test_helper.dart';

/// 「build 期改 provider ⇒ 整个 App 被打断」这条防线。
///
/// 真实踩过（2026-11-01 真机，小米 2106118C / Android 13）：
/// `ShadowApp.build` 里第一次碰到顶层 `final appRouter` ⇒ `new GoRouter`
/// ⇒ go_router 自己打了一条日志 ⇒ `Logger.root.onRecord` 是**同步**广播流
/// ⇒ 记录当场回调 ⇒ 日志桥在 **build 期**改了 `logServiceProvider` 的
/// state ⇒ App 死在第一次 build。
///
/// 这里钉住三件事：
///  1. build 里打一条日志 ⇒ **不得**把 App 打断（这是真机那一条）；
///  2. 推迟 ≠ 丢弃 ⇒ 那条日志最终仍要进面板；
///  3. 不在 build 期的日志 ⇒ 也是**推迟**写进去的（写入一律推迟，
///     不猜当前是不是 build 期 —— phase 判据在 warm-up 那次构建上
///     实测失效，见 `build_phase_guard.dart` 的注释）。
void main() {
  testSetup();

  testWidgets('在 build 里打一条日志，不得把 App 打断', (tester) async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final sub = wireDartLoggingIntoLogPanel(container);
    addTearDown(sub.cancel);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          home: Builder(
            builder: (context) {
              // ⚠️ 这条日志的回调会**同步**落在 build 里
              // （package:logging 的 onRecord 是 sync 广播流）。
              Logger('BuildPhaseProbe').info('build 里打的日志');
              return const SizedBox.shrink();
            },
          ),
        ),
      ),
    );

    // 真机那一条是「Unhandled Exception」⇒ 走 zone ⇒ flutter_test 直接判失败。
    expect(tester.takeException(), isNull);
  });

  testWidgets('build 里打的日志，推迟之后仍要进面板（推迟 ≠ 丢弃）', (
    tester,
  ) async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final sub = wireDartLoggingIntoLogPanel(container);
    addTearDown(sub.cancel);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          home: Builder(
            builder: (context) {
              Logger('BuildPhaseProbe').info('build 里打的日志');
              return const SizedBox.shrink();
            },
          ),
        ),
      ),
    );

    // 让 post-frame 回调跑掉。
    await tester.pump();

    final logs = container.read(logServiceProvider).logs;
    expect(
      logs.any((e) => e.message.contains('build 里打的日志')),
      isTrue,
      reason: '推迟写 ≠ 丢日志：这条必须最终出现在面板里',
    );
  });

  testWidgets('不在 build 期的日志，也是**推迟**写进去的', (tester) async {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    final sub = wireDartLoggingIntoLogPanel(container);
    addTearDown(sub.cancel);

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: SizedBox.shrink()),
      ),
    );

    Logger('BuildPhaseProbe').info('build 之外的日志');

    // 写入是**推迟**的 ⇒ 此刻还没进面板。
    // ⚠️ 这条断言钉的是「一律推迟」这个语义 —— 第一版按 phase 判据
    // 只在 build 期推迟，第二版改成一律推迟（微任务）⇒ 语义变了，
    // 断言也跟着变（不是把判据放松，是把**意图**写清楚）。
    expect(
      container
          .read(logServiceProvider)
          .logs
          .any((e) => e.message.contains('build 之外的日志')),
      isFalse,
      reason: '写入一律推迟到微任务 ⇒ 此刻不该已经在面板里',
    );

    await tester.pump();

    expect(
      container
          .read(logServiceProvider)
          .logs
          .any((e) => e.message.contains('build 之外的日志')),
      isTrue,
      reason: '推迟 ≠ 丢弃：这条必须最终出现在面板里',
    );
  });
}
