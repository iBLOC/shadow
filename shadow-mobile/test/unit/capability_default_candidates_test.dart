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

  group('capabilityOptionsByCapability —— 「此刻能不能用」', () {
    // ⚠️ **目录面 ≠ 已注册面** —— 2026-11-09 实测的根因：
    //   目录面（`GET /models/providers`）的 asr id 形如 `whisper-base`，
    //   而端脑真解析引擎时用的是**已注册面**（`asr_registry.runtime_for(id)`
    //   ⇒ 精确匹配已注册的 model_id）⇒ ⇒ 形如 `whisper-model`。
    //   两套只有 `sensevoice-small` / `voxcpm2` 恰好同名 ⇒ ⇒ 客户端拿目录面
    //   的 id 去填 asr 档 ⇒ ⇒ 端脑永远解析不到 ⇒ ⇒ **存得进去、用不了**。
    final catalog = {
      'asr': [
        const CapabilityModelCandidate(id: 'whisper-base', label: '本地 · whisper-base'),
        const CapabilityModelCandidate(id: 'whisper-tiny', label: '本地 · whisper-tiny'),
        const CapabilityModelCandidate(id: 'sensevoice-small', label: '本地 · sensevoice-small'),
      ],
      'tts': [
        const CapabilityModelCandidate(id: 'voxcpm2', label: '本地 · voxcpm2'),
      ],
      'llm': [
        const CapabilityModelCandidate(id: 'Qwen/Qwen3-0.6B', label: '本地 · Qwen3'),
      ],
    };

    test('按引擎 id 解析的档 ⇒ 候选取「已注册面」，不取目录面', () {
      final out = capabilityOptionsByCapability(
        catalog,
        const ['asr', 'tts'],
        const {
          'asr': ['sensevoice-small'],
          'tts': ['voxcpm2'],
        },
      );
      // ⚠️ whisper-base 在目录面里，但**没注册** ⇒ ⇒ 不许出现在可选项里
      //    （出现了就是「用户选了端脑永远解析不到」）。
      expect(out['asr']!.map((o) => o.id).toList(), ['sensevoice-small']);
      expect(out['tts']!.map((o) => o.id).toList(), ['voxcpm2']);
    });

    test('不按引擎 id 解析的档 ⇒ 候选不受影响（仍取目录面）', () {
      final out = capabilityOptionsByCapability(
        catalog,
        const ['asr', 'tts'],
        const {
          'asr': ['sensevoice-small'],
          'tts': ['voxcpm2'],
        },
      );
      expect(out['llm']!.map((o) => o.id).toList(), ['Qwen/Qwen3-0.6B']);
    });

    test('已注册的 id 也可能在目录面里 ⇒ 显示名用目录面那份', () {
      final out = capabilityOptionsByCapability(
        catalog,
        const ['asr'],
        const {'asr': ['sensevoice-small']},
      );
      expect(out['asr']!.single.label, '本地 · sensevoice-small');
    });

    test('已注册的 id 不在目录面里 ⇒ 也要列出来（部署自建的 id 才是唯一真相）', () {
      final out = capabilityOptionsByCapability(
        const {},
        const ['asr'],
        const {'asr': ['self-hosted-asr']},
      );
      expect(out['asr']!.map((o) => o.id).toList(), ['self-hosted-asr']);
      expect(out['asr']!.single.label, 'self-hosted-asr');
    });

    test('这台大脑没注册任何引擎 ⇒ 那一档是空列表（不是「没有这一档」）', () {
      final out = capabilityOptionsByCapability(
        catalog,
        const ['asr', 'tts'],
        const {'asr': [], 'tts': []},
      );
      expect(out['asr'], isEmpty);
      expect(out['tts'], isEmpty);
      // ⚠️ llm 档不受影响。
      expect(out['llm']!.length, 1);
    });

    test('端脑没给 engineResolved ⇒ 全部按目录面（老端脑不许把界面画空）', () {
      final out = capabilityOptionsByCapability(catalog, const [], const {});
      expect(out['asr']!.length, 3);
      expect(out['tts']!.length, 1);
    });
  });

  group('unusableCapabilityDefaults —— 当前默认值此刻用不了', () {
    test('指向没注册的 id ⇒ 判为「用不了」（存得进去、用不了）', () {
      final out = unusableCapabilityDefaults(
        const {'asr': 'whisper-base', 'tts': 'voxcpm2'},
        const ['asr', 'tts'],
        const {
          'asr': ['sensevoice-small'],
          'tts': ['voxcpm2'],
        },
      );
      expect(out.length, 1);
      expect(out.single.capability, 'asr');
      expect(out.single.modelId, 'whisper-base');
    });

    test('不按引擎 id 解析的档 ⇒ 不说「用不了」（客户端没有依据判断）', () {
      final out = unusableCapabilityDefaults(
        const {'llm': 'some-cloud-model'},
        const ['asr'],
        const {'asr': ['sensevoice-small']},
      );
      expect(out, isEmpty);
    });

    test('空值 / 没配 ⇒ 不算「用不了」', () {
      final out = unusableCapabilityDefaults(
        const {'asr': '   '},
        const ['asr'],
        const {'asr': ['sensevoice-small']},
      );
      expect(out, isEmpty);
    });

    test('端脑没给 engineResolved ⇒ 一条都不判（不许凭空指控）', () {
      final out = unusableCapabilityDefaults(
        const {'asr': 'whisper-base'},
        const [],
        const {},
      );
      expect(out, isEmpty);
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

    test('engine_resolved / registered 一起解析（两套 id 命名空间的分界线）', () {
      final view = CapabilityDefaultsView.fromJson({
        'capabilities': ['asr', 'tts'],
        'defaults': {'asr': 'whisper-base'},
        'engine_resolved': ['asr', 'tts'],
        'registered': {
          'asr': ['sensevoice-small'],
          'tts': [],
        },
      });
      expect(view.engineResolved, ['asr', 'tts']);
      expect(view.registered['asr'], ['sensevoice-small']);
      // ⚠️ **空列表 = 这台大脑此刻没注册这类引擎**（不是「没有这个能力」）。
      expect(view.registered['tts'], isEmpty);
    });

    test('老端脑（没有 engine_resolved）⇒ 不许编出 registered', () {
      final view = CapabilityDefaultsView.fromJson({
        'capabilities': ['asr'],
        'defaults': {'asr': 'whisper-base'},
      });
      expect(view.engineResolved, isEmpty);
      expect(view.registered, isEmpty);
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

  group('consumedCapabilityTiers / unconsumedCapabilityTiers —— 哪几档选了真有用', () {
    // 端脑 HEAD 的词表与「按引擎 id 解析」的那几档（逐字照端脑的顺序）。
    const capabilities = [
      'llm',
      'asr',
      'tts',
      'vad',
      'rerank',
      'embedding',
      'vision',
      'forecast',
      'image_gen',
    ];
    const engineResolved = ['asr', 'tts', 'image_gen'];

    test('只给端脑真的会读的档；顺序跟端脑词表走', () {
      expect(
        consumedCapabilityTiers(capabilities, engineResolved),
        ['asr', 'tts', 'image_gen'],
      );
    });

    test('⚠️ 对话档不在分档里 —— 它走路由面（写进分档默认是死槽）', () {
      expect(
        consumedCapabilityTiers(capabilities, engineResolved),
        isNot(contains(chatCapability)),
      );
      // 也不算「端脑不读」—— 它有读者，只是不在这张表里。
      expect(
        unconsumedCapabilityTiers(capabilities, engineResolved),
        isNot(contains(chatCapability)),
      );
    });

    test('端脑不读的档单独列出来（拿去告诉用户，不给下拉）', () {
      expect(
        unconsumedCapabilityTiers(capabilities, engineResolved),
        ['vad', 'rerank', 'embedding', 'vision', 'forecast'],
      );
    });

    test('两张表互补：词表 − 对话档 ＝ 有读者 ∪ 没读者，且不相交', () {
      final read = consumedCapabilityTiers(capabilities, engineResolved);
      final notRead = unconsumedCapabilityTiers(capabilities, engineResolved);
      expect(
        {...read, ...notRead},
        capabilities.where((c) => c != chatCapability).toSet(),
      );
      expect(read.toSet().intersection(notRead.toSet()), isEmpty);
    });

    test('⚠️ 端脑没说哪几档有读者（老端脑）⇒ 不替它判：除对话档外原样全给', () {
      expect(
        consumedCapabilityTiers(const ['llm', 'asr', 'tts'], const []),
        ['asr', 'tts'],
      );
      expect(
        unconsumedCapabilityTiers(const ['llm', 'asr', 'tts'], const []),
        isEmpty,
        reason: '没有依据 ⇒ 不许编一句「这几类没人读」',
      );
    });
  });
}
