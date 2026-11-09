import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/providers/brain_model_source_provider.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// 「按能力分档的默认模型」这一段的**纯逻辑**判据。
///
/// ⚠️ 这些是**纯函数**层面的读数（分组口径 ＋ 解析口径 ＋ 整份合并口径）
/// ⇒ ⇒ 界面那一层（渲染 ＋ 下发顺序）不在这里 ⇒ ⇒ 不许拿这层绿冒充
/// 「界面可用」的读数。
void main() {
  RegisteredProvider provider(
    String id,
    String name,
    List<({String id, String name, String? capability})> models,
  ) {
    return RegisteredProvider(
      id: id,
      name: name,
      baseUrl: 'https://example.invalid',
      apiStandard: 'openai',
      enabled: true,
      models: [
        for (final m in models)
          RegisteredModel(
            id: m.id,
            name: m.name,
            capability: m.capability,
          ),
      ],
    );
  }

  group('capabilityCandidatesByCapability', () {
    test('按模型的能力标注分组', () {
      final out = capabilityCandidatesByCapability([
        provider('openai', 'OpenAI', [
          (id: 'gpt-4o', name: 'GPT-4o', capability: 'llm'),
          (id: 'whisper-1', name: 'Whisper', capability: 'asr'),
          (id: 'tts-1', name: 'TTS-1', capability: 'tts'),
        ]),
      ]);

      expect(out.keys.toSet(), {'llm', 'asr', 'tts'});
      expect(out['asr']!.single.id, 'whisper-1');
      expect(out['asr']!.single.label, 'OpenAI · Whisper');
      expect(out['tts']!.single.id, 'tts-1');
    });

    test('没有能力标注的模型不进任何一档（不猜）', () {
      final out = capabilityCandidatesByCapability([
        provider('x', 'X', [
          (id: 'mystery', name: 'Mystery', capability: null),
        ]),
      ]);
      expect(out, isEmpty);
    });

    test('同一个 id 在两个供应商下 ⇒ 只留一条（不重复）', () {
      final out = capabilityCandidatesByCapability([
        provider('a', 'A', [(id: 'whisper-1', name: 'W1', capability: 'asr')]),
        provider('b', 'B', [(id: 'whisper-1', name: 'W2', capability: 'asr')]),
      ]);
      expect(out['asr']!.length, 1);
    });

    test('空 id 不进候选（端脑按 id 选引擎 ⇒ 空 id 必失败）', () {
      final out = capabilityCandidatesByCapability([
        provider('a', 'A', [(id: '  ', name: 'Blank', capability: 'asr')]),
      ]);
      // ⚠️ 空 id 的模型**整条丢掉** ⇒ ⇒ 这一档连键都不该有
      // （有一个空候选比没有候选更糟：用户能选中，选了必失败）。
      expect(out['asr'] ?? const <CapabilityModelCandidate>[], isEmpty);
    });
  });

  group('CapabilityDefaultsView.fromJson', () {
    test('解析词表 ＋ 当前值', () {
      final view = CapabilityDefaultsView.fromJson({
        'capabilities': ['llm', 'asr'],
        'defaults': {'asr': 'whisper-1'},
      });
      expect(view.capabilities, ['llm', 'asr']);
      expect(view.defaults, {'asr': 'whisper-1'});
    });

    test('空串值不进表（配了但没配 = 失败长得像成功）', () {
      final view = CapabilityDefaultsView.fromJson({
        'capabilities': ['asr'],
        'defaults': {'asr': '   '},
      });
      expect(view.defaults, isEmpty);
    });

    test('形状不对时不炸（端脑改了形状也不能白屏）', () {
      final view = CapabilityDefaultsView.fromJson({
        'capabilities': 'not-a-list',
        'defaults': 'not-a-map',
      });
      expect(view.capabilities, isEmpty);
      expect(view.defaults, isEmpty);
    });
  });

  group('mergeCapabilityDefaultsForPush', () {
    test('基线 = 本地副本 ∪ 端脑当前值（别把另一边的档位抹掉）', () {
      final next = mergeCapabilityDefaultsForPush(
        local: {'tts': 'tts-local'},
        remote: {'asr': 'whisper-1'},
        capability: 'llm',
        model: 'gpt-4o',
      );
      expect(next, {
        'tts': 'tts-local',
        'asr': 'whisper-1',
        'llm': 'gpt-4o',
      });
    });

    test('清空一档 ⇒ 那一档被删掉（不是空串）', () {
      final next = mergeCapabilityDefaultsForPush(
        local: {'asr': 'whisper-1', 'tts': 'tts-1'},
        remote: const {},
        capability: 'asr',
        model: null,
      );
      expect(next.containsKey('asr'), isFalse);
      expect(next['tts'], 'tts-1');
    });
  });
}
