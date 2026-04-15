import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../mnn_engine.dart';
import 'genui_provider.dart';

final mnnAgentIntegrationProvider = Provider<MnnAgentIntegration>((ref) {
  final service = ref.watch(genUIAgentServiceProvider);
  return MnnAgentIntegration(service: service);
});

class MnnAgentIntegration {
  final GenUIAgentService service;

  static const _localKeywords = [
    '本地',
    'local',
    '离线',
    'offline',
    'mnn',
    '手机端',
    '移动端',
    '不上传',
  ];

  MnnAgentIntegration({required this.service});

  bool shouldUseLocalModel(String message) {
    final lower = message.toLowerCase();
    return _localKeywords.any((k) => lower.contains(k));
  }

  Future<String> processWithLocalMnn(String message) async {
    if (!MNNEngine.isSupported) {
      return 'Error: MNN engine is not supported on this platform';
    }

    final initialized = await MNNEngine.isInitialized();
    if (!initialized) {
      return 'Error: MNN engine is not initialized';
    }

    final modelLoaded = await MNNEngine.isModelLoaded();
    if (!modelLoaded) {
      return 'Error: No model loaded in MNN engine';
    }

    return await MNNEngine.generate(message);
  }

  String checkMnnStatus() {
    if (!MNNEngine.isSupported) {
      return 'MNN not supported';
    }
    return 'MNN available';
  }
}
