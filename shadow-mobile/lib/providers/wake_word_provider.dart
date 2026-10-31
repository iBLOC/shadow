import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/wake_word_service.dart';

final wakeWordServiceProvider = Provider<WakeWordService>((ref) {
  final service = WakeWordService();
  ref.onDispose(() => service.stop());
  return service;
});

final wakeWordEventsProvider = StreamProvider<WakeWordEvent>((ref) {
  final service = ref.watch(wakeWordServiceProvider);
  final controller = StreamController<WakeWordEvent>.broadcast();
  // ⚠️ 必须带 onError：服务层用 addError 报告「这台设备没有语音识别服务」
  // ⇒ 不接住的话，错误会**原样冒到 zone** ⇒ 变成启动流程里的未捕获错误
  // （2026-10-31 真机在小米 2106118C 上实测到过）。
  final sub = service.events.listen(
    controller.add,
    onError: (Object error, StackTrace stack) {
      debugPrint('[wake_word] $error');
    },
  );
  unawaited(service.start());
  ref.onDispose(() {
    unawaited(sub.cancel());
    unawaited(service.stop());
    unawaited(controller.close());
  });
  return controller.stream;
});
