import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logging/logging.dart';

import '../services/log_service.dart';
import '../utils/build_phase_guard.dart';

final logServiceProvider = StateNotifierProvider<LogService, LogState>((ref) {
  return LogService();
});

final filteredLogsProvider = Provider<List<LogEntry>>((ref) {
  final logState = ref.watch(logServiceProvider);
  return logState.filteredLogs;
});

/// 把 Dart 侧 package:logging 的全部记录接进日志面板（设置 → 高级 → 日志）。
///
/// App 里几十个 Notifier / Service 都在用 `Logger('…')` 打运行时日志
/// （大脑启动、模型路由、错误降级…），但 logging 包默认没有监听者 ——
/// 这些日志此前哪儿也不去。面板此前唯一的数据源是被 MIUI 封锁的
/// app-uid logcat（挂死且零输出），因此永远空白。
///
/// 放在 main() 里用 **app 生命周期的 [ProviderContainer]** 调用一次；
/// 返回订阅仅供测试管理生命周期，App 内不取消。
StreamSubscription<LogRecord> wireDartLoggingIntoLogPanel(
  ProviderContainer container,
) {
  return Logger.root.onRecord.listen((record) {
    // ⚠️ `Logger.root.onRecord` 是**同步**广播流（package:logging 用
    // `StreamController.broadcast(sync: true)`）⇒ 记录一产生就**当场**回调。
    //
    // 而 App 里有人在 **build 里**打日志 —— go_router 就是其中一个
    // （`new GoRouter` → `_onRoutingTableChanged` → `log()`）⇒ 回调会
    // 落在 build 期 ⇒ 此时改 provider 会被 Riverpod 判成
    // 「在 widget 树构建期间改 provider」⇒ 整个 App 打断。
    //
    // 真实踩过：2026-11-01 真机（小米 2106118C）App 死在第一次 build。
    // ⇒ 这里把**读 + 写**整块挪到 build 期之外。
    runOutsideBuild(() {
      try {
        container.read(logServiceProvider.notifier).addDartLog(
              record.loggerName,
              record.level.name,
              record.message,
              record.error?.toString(),
            );
      } catch (e) {
        // 日志面板**不许**把 App 带崩（容器已销毁等）。
        // ignore: avoid_print
        print('log panel write failed: $e');
      }
    });
  });
}
