import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/providers/brain_model_source_provider.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// 「大脑模型来源」的解析规则（2026-11-06「大脑是唯一数据源」刀）。
///
/// 数据源 = **大脑的供应商目录**（`GET /models/providers` 的读视图，
/// 不带 key）；路由 payload 的 providers 条目**不带 api_key** —— 端脑
/// 按 id 从自己的商店解析。这条规则决定大脑启动时用哪个 LLM 上游：
/// - **本地 neuron 权重** —— 不注册远端引擎；
/// - **云端供应商** —— 注册一条远端引擎，叶区按那个模型 id 去请求。
void main() {
  /// 大脑目录里的一条供应商（默认 = 一条可对话的 DeepSeek 形状）。
  RegisteredProvider provider({
    String id = 'deepseek',
    String name = 'DeepSeek',
    String baseUrl = 'https://api.deepseek.com/v1',
    String? selectedModel = 'deepseek-chat',
    List<RegisteredModel> models = const [
      RegisteredModel(
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        capability: 'llm',
      ),
    ],
    bool builtin = false,
  }) {
    return RegisteredProvider(
      id: id,
      name: name,
      baseUrl: baseUrl,
      apiStandard: 'openai',
      enabled: true,
      selectedModel: selectedModel,
      models: models,
      builtin: builtin,
    );
  }

  group('usableBrainOptions（大脑目录 → 可对话选项）', () {
    test('正常供应商在列，视图带 id/模型/地址', () {
      final options = usableBrainOptions([provider()]);
      expect(options, hasLength(1));
      expect(options.first.id, 'deepseek');
      expect(options.first.model, 'deepseek-chat');
      expect(options.first.baseUrl, 'https://api.deepseek.com/v1');
    });

    test('内置条目（neuron）不进 —— 本地权重在大脑页是独立选项', () {
      final options = usableBrainOptions([
        provider(id: 'neuron', name: 'neuron', builtin: true),
      ]);
      expect(options, isEmpty);
    });

    test('没选模型 / 缺地址 ⇒ 不给（失败长得像成功要避免）', () {
      expect(usableBrainOptions([provider(selectedModel: null)]), isEmpty);
      expect(usableBrainOptions([provider(baseUrl: '')]), isEmpty);
    });

    test('⚠️ asr/tts 不能当对话上游 ⇒ 不给（同时收紧注册面）', () {
      final tts = provider(
        id: 'ds-tts',
        selectedModel: 'tts-1',
        models: const [
          RegisteredModel(id: 'tts-1', name: 'TTS', capability: 'tts'),
        ],
      );
      expect(
        usableBrainOptions([tts]),
        isEmpty,
        reason: '把 tts 端点当 chat 端点打的引擎，本就不该注册进 llm 派发表',
      );
    });

    test('capability=vision 归视觉组；目录没给标注时按文本处理', () {
      final vision = provider(
        id: 'gpt4o',
        selectedModel: 'gpt-4o',
        models: const [
          RegisteredModel(id: 'gpt-4o', name: 'GPT-4o', capability: 'vision'),
        ],
      );
      final options = usableBrainOptions([vision, provider()]);
      expect(options[0].chatCategory, ModelChatCategory.vision);
      expect(options[1].chatCategory, ModelChatCategory.text);
    });
  });

  group('BrainModelSource.resolve', () {
    test('显式选本地 ⇒ 不用任何云端供应商', () {
      final resolved = BrainModelSource.resolve(
        BrainModelSource.localSource,
        usableBrainOptions([provider()]),
      );
      expect(resolved, isNull);
    });

    test('显式选某个云端 ⇒ 就是它', () {
      final options = usableBrainOptions([
        provider(id: 'a'),
        provider(
          id: 'b',
          baseUrl: 'https://b.invalid/v1',
          selectedModel: 'b-model',
          models: const [
            RegisteredModel(id: 'b-model', name: 'B', capability: 'llm'),
          ],
        ),
      ]);
      final resolved = BrainModelSource.resolve(
        BrainModelSource.cloud('b'),
        options,
      );
      expect(resolved?.id, 'b');
      expect(resolved?.model, 'b-model');
    });

    test('显式选的那个被删了 ⇒ 退回本地权重，不悄悄换一个供应商', () {
      final resolved = BrainModelSource.resolve(
        BrainModelSource.cloud('gone'),
        usableBrainOptions([provider(id: 'a')]),
      );
      expect(resolved, isNull, reason: '用户选的就是它 —— 换一个供应商是擅自做主');
    });

    test('没选过（自动）⇒ 第一个可对话选项', () {
      final resolved = BrainModelSource.resolve(
        const BrainModelSource.auto(),
        usableBrainOptions([provider(id: 'a')]),
      );
      expect(resolved?.id, 'a');
    });

    test('没选过（自动）且没有可对话选项 ⇒ 本地权重', () {
      final resolved = BrainModelSource.resolve(
        const BrainModelSource.auto(),
        usableBrainOptions([provider(id: 'neuron', builtin: true)]),
      );
      expect(resolved, isNull);
    });
  });

  group('BrainModelSource 取值', () {
    test('local 与 cloud 的解析', () {
      expect(BrainModelSource.localSource.isLocal, isTrue);
      expect(BrainModelSource.localSource.cloudModelId, isNull);

      final c = BrainModelSource.cloud('abc');
      expect(c.isLocal, isFalse);
      expect(c.cloudModelId, 'abc');

      const auto = BrainModelSource.auto();
      expect(auto.isAuto, isTrue);
      expect(auto.cloudModelId, isNull);
    });

    test('持久化的字符串能还原回来', () {
      expect(
        BrainModelSource.parse(BrainModelSource.local).isLocal,
        isTrue,
      );
      expect(
        BrainModelSource.parse('cloud:xyz').cloudModelId,
        'xyz',
      );
      expect(BrainModelSource.parse(null).isAuto, isTrue);
    });
  });

  /// 「全局默认 + per-lobe 覆盖」两层结构的语义。
  group('BrainModelRouting', () {
    test('不在覆盖表里的叶区 ⇒ 跟随全局默认', () {
      const routing = BrainModelRouting(
        defaultSource: BrainModelSource.localSource,
      );
      expect(routing.effectiveFor('temporal').isLocal, isTrue);

      final cloudRouting = BrainModelRouting(
        defaultSource: BrainModelSource.localSource,
        lobeOverrides: {'prefrontal': BrainModelSource.cloud('a')},
      );
      expect(cloudRouting.effectiveFor('prefrontal').cloudModelId, 'a');
      expect(
        cloudRouting.effectiveFor('temporal').isLocal,
        isTrue,
        reason: '没被覆盖的叶区跟着全局默认',
      );
    });

    test('编码 → 解码 能原样还原', () {
      final routing = BrainModelRouting(
        defaultSource: BrainModelSource.cloud('cloud_a'),
        lobeOverrides: {
          'prefrontal': BrainModelSource.localSource,
          'temporal': BrainModelSource.cloud('cloud_b'),
        },
      );
      final decoded = BrainModelRouting.decode(routing.encode());
      expect(decoded.defaultSource.cloudModelId, 'cloud_a');
      expect(decoded.lobeOverrides['prefrontal']?.isLocal, isTrue);
      expect(decoded.lobeOverrides['temporal']?.cloudModelId, 'cloud_b');
    });

    test('坏数据退回「自动」，不把设置页卡死', () {
      expect(BrainModelRouting.decode('not json').defaultSource.isAuto, isTrue);
      expect(BrainModelRouting.decode(null).defaultSource.isAuto, isTrue);
      expect(BrainModelRouting.decode('').defaultSource.isAuto, isTrue);
    });

    // ⚠️ 这是**本地持久化**的形状（设置里的那份副本，开机重放用）；
    // 下发给端脑时它走 `setCapabilityDefaults(lobeDefaults: …)`，
    // 不进 `buildModelRoutingPayload`（见下面那一组）。
    group('per-lobe 分档覆盖（本地副本 lobe_defaults）', () {
      test('编码 → 解码 能原样还原（叶区 → 能力词 → 引擎 id）', () {
        const routing = BrainModelRouting(
          lobeCapabilityOverrides: {
            'temporal': {'asr': 'whisper-model', 'tts': 'voxcpm2'},
          },
        );
        final decoded = BrainModelRouting.decode(routing.encode());
        expect(decoded.lobeCapabilityOverrides['temporal'], {
          'asr': 'whisper-model',
          'tts': 'voxcpm2',
        });
        expect(decoded, routing);
      });

      test('⚠️ 两层都只认非空 ⇒ 坏数据不进表（不留空表）', () {
        final decoded = BrainModelRouting.decode(jsonEncode({
          'lobe_defaults': {
            'temporal': {'asr': '  ', 'tts': 'voxcpm2'},
            'prefrontal': {'asr': ''},
            'parietal': 'not-a-map',
          },
        }));
        expect(decoded.lobeCapabilityOverrides['temporal'], {'tts': 'voxcpm2'});
        expect(
          decoded.lobeCapabilityOverrides.containsKey('prefrontal'),
          isFalse,
          reason: '一格都没剩 ⇒ 那个叶区整个不进表',
        );
        expect(decoded.lobeCapabilityOverrides.containsKey('parietal'), isFalse);
      });

      test('⚠️ 旧本地键名（lobe_capability_models）只读兼容 —— 不丢用户设置', () {
        final decoded = BrainModelRouting.decode(jsonEncode({
          'lobe_capability_models': {
            'temporal': {'asr': 'whisper-model'},
          },
        }));
        expect(decoded.lobeCapabilityOverrides['temporal'], {
          'asr': 'whisper-model',
        });
      });

      test('顺序不是身份：同一份配置换个写法算相等', () {
        const a = BrainModelRouting(
          lobeCapabilityOverrides: {
            'temporal': {'asr': 'w', 'tts': 'v'},
          },
        );
        const b = BrainModelRouting(
          lobeCapabilityOverrides: {
            'temporal': {'tts': 'v', 'asr': 'w'},
          },
        );
        expect(a, b);
        expect(a.hashCode, b.hashCode);
      });

      test('值不同 ⇒ 不相等（不是恒真的比较）', () {
        const a = BrainModelRouting(
          lobeCapabilityOverrides: {
            'temporal': {'asr': 'w'},
          },
        );
        const b = BrainModelRouting(
          lobeCapabilityOverrides: {
            'temporal': {'asr': 'other'},
          },
        );
        expect(a == b, isFalse);
      });

      test('旧数据（没有这个键）⇒ 空表，其余照旧', () {
        final decoded = BrainModelRouting.decode(jsonEncode({
          'default': 'local',
          'lobes': {'temporal': 'cloud:deepseek'},
          'capability_defaults': {'asr': 'w'},
        }));
        expect(decoded.lobeCapabilityOverrides, isEmpty);
        expect(decoded.defaultSource.isLocal, isTrue);
        expect(decoded.capabilityDefaults['asr'], 'w');
      });
    });
  });

  /// 写路径的**合并基线** —— 端脑那张 `lobe_defaults` 表有**两个写者**
  /// （本机分档卡 ＋ 桌面叶区矩阵卡），而 PUT 是整份替换。
  group('mergeLobeDefaultsForPush —— 整份替换面上的并集写', () {
    test('⚠️ 基线 = 本地 ∪ 端脑：对方写的叶区必须原样带上', () {
      final next = mergeLobeDefaultsForPush(
        local: const {
          'prefrontal': {'asr': 'local-asr'},
        },
        remote: const {
          'temporal': {'asr': 'sensevoice-small', 'tts': 'voxcpm2'},
        },
        lobe: 'prefrontal',
        capability: 'tts',
        model: 'voxcpm-model',
      );
      expect(next['prefrontal'], {'asr': 'local-asr', 'tts': 'voxcpm-model'});
      expect(
        next['temporal'],
        {'asr': 'sensevoice-small', 'tts': 'voxcpm2'},
        reason: '本机没配过的叶区不许在这次 PUT 里消失',
      );
    });

    test('没动的格以端脑为准（那张表是权威），改的这一格以本地动作为准', () {
      final next = mergeLobeDefaultsForPush(
        local: const {
          'temporal': {'asr': 'stale-id'},
        },
        remote: const {
          'temporal': {'asr': 'brain-id', 'tts': 'voxcpm2'},
        },
        lobe: 'temporal',
        capability: 'tts',
        model: 'new-tts',
      );
      expect(next['temporal']!['asr'], 'brain-id');
      expect(next['temporal']!['tts'], 'new-tts');
    });

    test('⚠️ 删掉一个叶区的最后一格 ⇒ 整个叶区退出表（不发空 inner）', () {
      final next = mergeLobeDefaultsForPush(
        local: const {
          'prefrontal': {'asr': 'whisper-model'},
        },
        remote: const {},
        lobe: 'prefrontal',
        capability: 'asr',
        model: null,
      );
      expect(next.containsKey('prefrontal'), isFalse);
    });

    test('删格只删那一格，同叶区别的档不动', () {
      final next = mergeLobeDefaultsForPush(
        local: const {},
        remote: const {
          'temporal': {'asr': 'a', 'tts': 'b'},
        },
        lobe: 'temporal',
        capability: 'asr',
        model: '',
      );
      expect(next['temporal'], {'tts': 'b'});
    });
  });

  /// 「有没有变化」的比较必须按**内容** —— Dart 的 `Map.==` 是身份比较。
  group('sameLobeDefaults / sameCapabilityDefaults', () {
    test('内容相同 ⇒ 算相同（不同实例也一样）', () {
      expect(
        sameLobeDefaults({
          'a': {'asr': 'x'},
        }, {
          'a': {'asr': 'x'},
        }),
        isTrue,
      );
      expect(sameCapabilityDefaults({'asr': 'x'}, {'asr': 'x'}), isTrue);
    });

    test('⚠️ 值不同 / 键不同 ⇒ 算不同（不是恒真的比较）', () {
      expect(
        sameLobeDefaults({
          'a': {'asr': 'x'},
        }, {
          'a': {'asr': 'y'},
        }),
        isFalse,
      );
      expect(
        sameLobeDefaults({
          'a': {'asr': 'x'},
        }, {
          'b': {'asr': 'x'},
        }),
        isFalse,
      );
      expect(sameCapabilityDefaults({'asr': 'x'}, {'asr': 'y'}), isFalse);
    });

    test('钉住「为什么需要这两个函数」：Map 的 == 会把相同内容判成不同', () {
      final a = <String, Map<String, String>>{
        'x': {'asr': '1'},
      };
      final b = <String, Map<String, String>>{
        'x': {'asr': '1'},
      };
      expect(a == b, isFalse);
      expect(sameLobeDefaults(a, b), isTrue);
    });
  });

  /// 路由 → 大脑要的负载。
  group('buildModelRoutingPayload', () {
    test('⚠️ 逐叶区分档覆盖**不进**这份负载（它走分档默认面）', () {
      final payload = buildModelRoutingPayload(
        routing: const BrainModelRouting(
          lobeCapabilityOverrides: {
            'temporal': {'asr': 'whisper-model'},
          },
        ),
        options: usableBrainOptions([provider()]),
      );
      // ⚠️ 这份负载的两个读者（Rust 槽位的 `ModelRouting`、端脑的
      // `lobes/models`）**都没有**那个字段 ⇒ ⇒ 塞进来会被 serde 静默丢掉
      // ⇒ ⇒ 「看起来下发了、其实没生效」。它走
      // `setCapabilityDefaults(lobeDefaults: …)`。
      expect(payload.containsKey('lobe_capability_models'), isFalse);
      expect(payload.containsKey('lobe_defaults'), isFalse);
    });

    test('⚠️ providers 条目带 id/base_url/model 且**不带 api_key**', () {
      final payload = buildModelRoutingPayload(
        routing: const BrainModelRouting(),
        options: usableBrainOptions([provider(id: 'deepseek')]),
      );
      final providers = payload['providers'] as List;
      expect(providers, hasLength(1));
      final entry = providers.first as Map;
      expect(entry['id'], 'deepseek');
      expect(entry['base_url'], 'https://api.deepseek.com/v1');
      expect(entry['model'], 'deepseek-chat');
      expect(
        entry.containsKey('api_key'),
        isFalse,
        reason: '供应商材料不出大脑 —— 端脑按 id 从自己的商店解析',
      );
    });

    test('全局默认「自动」⇒ 第一个可对话选项的上游模型 id', () {
      final payload = buildModelRoutingPayload(
        routing: const BrainModelRouting(),
        options: usableBrainOptions([provider(id: 'deepseek')]),
      );
      expect(payload['default_model'], 'deepseek-chat');
    });

    test('全局默认「本地」⇒ default_model 为 null，云端引擎照样注册', () {
      final payload = buildModelRoutingPayload(
        routing: const BrainModelRouting(
          defaultSource: BrainModelSource.localSource,
        ),
        options: usableBrainOptions([provider()]),
      );
      expect(payload['default_model'], isNull);
      // 云端引擎**照样注册** —— 否则某个叶区想单独用云端就不行了。
      expect((payload['providers'] as List).length, 1);
    });

    test('per-lobe 覆盖：写的是**上游模型 id**，不是供应商 id；null = 强制本地', () {
      final payload = buildModelRoutingPayload(
        routing: BrainModelRouting(
          defaultSource: BrainModelSource.localSource,
          lobeOverrides: {
            'prefrontal': BrainModelSource.localSource,
            'temporal': BrainModelSource.cloud('deepseek'),
          },
        ),
        options: usableBrainOptions([provider()]),
      );
      final lobes = payload['lobe_models'] as Map;
      expect(lobes['prefrontal'], isNull, reason: 'null = 该叶区强制本地');
      expect(lobes['temporal'], 'deepseek-chat');
    });

    test('**只装显式覆盖**的叶区 —— 没点名的不能被钉死', () {
      final payload = buildModelRoutingPayload(
        routing: BrainModelRouting(
          defaultSource: BrainModelSource.cloud('deepseek'),
          lobeOverrides: {'prefrontal': BrainModelSource.localSource},
        ),
        options: usableBrainOptions([provider()]),
      );
      final lobes = payload['lobe_models'] as Map;
      expect(lobes.keys.toSet(), {'prefrontal'});
      expect(
        lobes.containsKey('temporal'),
        isFalse,
        reason: '没被覆盖的叶区必须能跟着全局默认变（不能发全量有效值）',
      );
      expect(payload['default_model'], 'deepseek-chat');
    });

    test('覆盖指向的供应商被删了 ⇒ 那个覆盖作废 ⇒ 回到跟随全局', () {
      final payload = buildModelRoutingPayload(
        routing: BrainModelRouting(
          defaultSource: BrainModelSource.cloud('deepseek'),
          lobeOverrides: {'temporal': BrainModelSource.cloud('gone')},
        ),
        options: usableBrainOptions([provider()]),
      );
      final lobes = payload['lobe_models'] as Map;
      expect(
        lobes.containsKey('temporal'),
        isFalse,
        reason: '供应商没了 ⇒ 覆盖作废 ⇒ 回到跟随全局默认',
      );
      expect(payload['default_model'], 'deepseek-chat');
    });
  });

  /// 某个叶区**实际生效**的来源 —— 界面显示与路由负载用同一套算法。
  group('effectiveLobeSource', () {
    test('覆盖赢过全局默认', () {
      final routing = BrainModelRouting(
        defaultSource: BrainModelSource.cloud('deepseek'),
        lobeOverrides: {'prefrontal': BrainModelSource.localSource},
      );
      final options = usableBrainOptions([provider()]);
      expect(
        effectiveLobeSource(
          routing: routing,
          lobe: 'prefrontal',
          options: options,
        ).isLocal,
        isTrue,
      );
      expect(
        effectiveLobeSource(
          routing: routing,
          lobe: 'temporal',
          options: options,
        ).cloudModelId,
        'deepseek',
      );
    });

    test('覆盖指向的供应商被删了 ⇒ 回到全局默认', () {
      final routing = BrainModelRouting(
        defaultSource: BrainModelSource.cloud('deepseek'),
        lobeOverrides: {'temporal': BrainModelSource.cloud('gone')},
      );
      expect(
        effectiveLobeSource(
          routing: routing,
          lobe: 'temporal',
          options: usableBrainOptions([provider()]),
        ).cloudModelId,
        'deepseek',
        reason: '供应商没了 ⇒ 那个覆盖作废',
      );
    });
  });

  /// 「全局默认 + per-lobe 覆盖」合成**有效路由**。
  group('effectiveLobeModels', () {
    test('覆盖赢过全局默认；每个叶区都有一个明确的值', () {
      final effective = effectiveLobeModels(
        routing: BrainModelRouting(
          defaultSource: BrainModelSource.cloud('deepseek'),
          lobeOverrides: {'prefrontal': BrainModelSource.localSource},
        ),
        lobes: ['temporal', 'prefrontal', 'parietal'],
        options: usableBrainOptions([provider()]),
      );
      expect(effective['prefrontal'], isNull);
      expect(effective['temporal'], 'deepseek-chat');
      expect(effective['parietal'], 'deepseek-chat');
    });
  });
}