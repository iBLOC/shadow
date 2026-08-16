import 'dart:async';

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
  final sub = service.events.listen(controller.add);
  unawaited(service.start());
  ref.onDispose(() {
    unawaited(sub.cancel());
    unawaited(service.stop());
    unawaited(controller.close());
  });
  return controller.stream;
});
