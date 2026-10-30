import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/providers/brain_model_source_provider.dart';
import 'package:shadow_mobile/services/database/model_item.dart';

/// 「大脑模型来源」的解析规则。
///
/// 这条规则决定了大脑启动时用哪个 LLM 上游：
/// - **本地 neuron 权重** —— 不注册远端引擎；
/// - **云端供应商** —— 注册一条远端引擎，叶区按那个模型 id 去请求。
void main() {
  ModelItem cloud({
    String id = 'cloud_minimax',
    String endpoint = 'https://api.minimax.io/v1',
    String model = 'MiniMax-M3',
  }) {
    return ModelItem(
      id: id,
      name: id,
      path: endpoint,
      type: 'text',
      size: 0,
      isLoaded: false,
      isLocal: false,
      source: ModelSource.cloudProvider,
      endpoint: endpoint,
      apiKey: 'sk-test',
      model: model,
    );
  }

  ModelItem localWeight({String id = 'local_gguf'}) {
    return ModelItem(
      id: id,
      name: id,
      path: 'assets/models/$id',
      type: 'text',
      size: 0,
      isLoaded: false,
      isLocal: true,
      source: ModelSource.localEngine,
    );
  }

  group('BrainModelSource.resolve', () {
    test('显式选本地 ⇒ 不用任何云端供应商', () {
      final resolved = BrainModelSource.resolve(
        BrainModelSource.localSource,
        [cloud()],
      );
      expect(resolved, isNull);
    });

    test('显式选某个云端 ⇒ 就是它', () {
      final models = [
        cloud(id: 'a'),
        cloud(id: 'b', endpoint: 'https://b.invalid/v1', model: 'b-model'),
      ];
      final resolved = BrainModelSource.resolve(
        BrainModelSource.cloud('b'),
        models,
      );
      expect(resolved?.id, 'b');
      expect(resolved?.endpoint, 'https://b.invalid/v1');
    });

    test('显式选的那个被删了 ⇒ 退回本地权重，不悄悄换一个供应商', () {
      final resolved = BrainModelSource.resolve(
        BrainModelSource.cloud('gone'),
        [cloud(id: 'a')],
      );
      expect(resolved, isNull, reason: '用户选的就是它 —— 换一个供应商是擅自做主');
    });

    test('缺 endpoint 或 model 的云端供应商不算数', () {
      final resolved = BrainModelSource.resolve(
        BrainModelSource.cloud('broken'),
        [cloud(id: 'broken', endpoint: '')],
      );
      expect(resolved, isNull);
    });

    test('没选过（自动）⇒ 第一个可用的云端供应商', () {
      final resolved = BrainModelSource.resolve(
        const BrainModelSource.auto(),
        [localWeight(), cloud(id: 'a')],
      );
      expect(resolved?.id, 'a');
    });

    test('没选过（自动）且一个云端都没有 ⇒ 本地权重', () {
      final resolved = BrainModelSource.resolve(
        const BrainModelSource.auto(),
        [localWeight()],
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
      );      final decoded = BrainModelRouting.decode(routing.encode());
      expect(decoded.defaultSource.cloudModelId, 'cloud_a');
      expect(decoded.lobeOverrides['prefrontal']?.isLocal, isTrue);
      expect(decoded.lobeOverrides['temporal']?.cloudModelId, 'cloud_b');
    });

    test('坏数据退回「自动」，不把设置页卡死', () {
      expect(BrainModelRouting.decode('not json').defaultSource.isAuto, isTrue);
      expect(BrainModelRouting.decode(null).defaultSource.isAuto, isTrue);
      expect(BrainModelRouting.decode('').defaultSource.isAuto, isTrue);
    });
  });

  /// 路由 → 大脑要的负载。
  group('buildModelRoutingPayload', () {
    test('全局默认「自动」⇒ 第一个可用的云端供应商', () {
      final payload = buildModelRoutingPayload(
        routing: const BrainModelRouting(),
        models: [localWeight(), cloud(id: 'a')],
      );
      expect(payload['default_model'], 'MiniMax-M3');
      expect((payload['providers'] as List).length, 1);
    });

    test('全局默认「本地」⇒ default_model 为 null（回落本地权重）', () {
      final payload = buildModelRoutingPayload(
        routing: const BrainModelRouting(
          defaultSource: BrainModelSource.localSource,
        ),
        models: [cloud()],
      );
      expect(payload['default_model'], isNull);
      // 云端引擎**照样注册** —— 否则某个叶区想单独用云端就不行了。
      expect((payload['providers'] as List).length, 1);
    });

    test('per-lobe 覆盖：写的是**上游模型 id**，不是 App 里的记录 id', () {
      final payload = buildModelRoutingPayload(
        routing: BrainModelRouting(
          defaultSource: BrainModelSource.localSource,
          lobeOverrides: {
            'prefrontal': BrainModelSource.localSource,
            'temporal': BrainModelSource.cloud('cloud_minimax'),
          },
        ),
        models: [cloud()],
      );
      final lobes = payload['lobe_models'] as Map;
      expect(lobes['prefrontal'], isNull, reason: 'null = 该叶区强制本地');
      expect(lobes['temporal'], 'MiniMax-M3');
    });

    test('**只装显式覆盖**的叶区 —— 没点名的不能被钉死', () {
      final payload = buildModelRoutingPayload(
        routing: BrainModelRouting(
          defaultSource: BrainModelSource.cloud('a'),
          lobeOverrides: {'prefrontal': BrainModelSource.localSource},
        ),
        models: [cloud(id: 'a')],
      );
      final lobes = payload['lobe_models'] as Map;
      expect(lobes.keys.toSet(), {'prefrontal'});
      expect(
        lobes.containsKey('temporal'),
        isFalse,
        reason: '没被覆盖的叶区必须能跟着全局默认变（不能发全量有效值）',
      );
      expect(payload['default_model'], 'MiniMax-M3');
    });

    test('覆盖指向的供应商被删了 ⇒ 那个覆盖作废 ⇒ 回到跟随全局', () {
      final payload = buildModelRoutingPayload(
        routing: BrainModelRouting(
          defaultSource: BrainModelSource.cloud('a'),
          lobeOverrides: {'temporal': BrainModelSource.cloud('gone')},
        ),
        models: [cloud(id: 'a')],
      );
      final lobes = payload['lobe_models'] as Map;
      expect(
        lobes.containsKey('temporal'),
        isFalse,
        reason: '供应商没了 ⇒ 覆盖作废 ⇒ 回到跟随全局默认',
      );
      expect(payload['default_model'], 'MiniMax-M3');
    });
  });

  /// 某个叶区**实际生效**的来源 —— 界面显示与路由负载用同一套算法。
  group('effectiveLobeSource', () {
    test('覆盖赢过全局默认', () {
      final routing = BrainModelRouting(
        defaultSource: BrainModelSource.cloud('a'),
        lobeOverrides: {'prefrontal': BrainModelSource.localSource},
      );
      expect(
        effectiveLobeSource(
          routing: routing,
          lobe: 'prefrontal',
          models: [cloud(id: 'a')],
        ).isLocal,
        isTrue,
      );
      expect(
        effectiveLobeSource(
          routing: routing,
          lobe: 'temporal',
          models: [cloud(id: 'a')],
        ).cloudModelId,
        'a',
      );
    });

    test('覆盖指向的供应商被删了 ⇒ 回到全局默认', () {
      final routing = BrainModelRouting(
        defaultSource: BrainModelSource.cloud('a'),
        lobeOverrides: {'temporal': BrainModelSource.cloud('gone')},
      );
      expect(
        effectiveLobeSource(
          routing: routing,
          lobe: 'temporal',
          models: [cloud(id: 'a')],
        ).cloudModelId,
        'a',
        reason: '供应商没了 ⇒ 那个覆盖作废',
      );
    });
  });

  /// 「全局默认 + per-lobe 覆盖」合成**有效路由**。
  group('effectiveLobeModels', () {
    test('覆盖赢过全局默认', () {
      final effective = effectiveLobeModels(
        routing: BrainModelRouting(
          defaultSource: BrainModelSource.cloud('a'),
          lobeOverrides: {'prefrontal': BrainModelSource.localSource},
        ),
        lobes: ['temporal', 'prefrontal', 'parietal'],
        models: [cloud(id: 'a')],
      );
      expect(effective['prefrontal'], isNull);
      expect(effective['temporal'], 'MiniMax-M3');
      expect(effective['parietal'], 'MiniMax-M3');
    });
  });
}
