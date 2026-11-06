import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/models/known_models.dart';

/// 「智能配置」注册表的契约。
///
/// 这张表是**出厂默认**，不是真理 —— 测的是**匹配规则**与**参数映射的
/// 形状**，不测具体数值的时效性（数值会随上游更新，表单里可改）。
void main() {
  group('lookupKnownModel —— 匹配规则', () {
    test('精确命中（含 ollama tag 剥离）', () {
      final m = lookupKnownModel('gpt-4o');
      expect(m, isNotNull);
      expect(m!.matchedBy, 'exact');

      // ollama 写法：`gpt-4o:latest` ⇒ 剥 tag 后仍精确命中。
      final tagged = lookupKnownModel('gpt-4o:latest');
      expect(tagged, isNotNull);
      expect(tagged!.matchedBy, 'exact');
    });

    test('家族关键词命中（大小写不敏感）', () {
      final m = lookupKnownModel('DeepSeek-R1-Distill-Qwen-32B');
      expect(m, isNotNull);
      expect(m!.matchedBy, 'family');
      expect(m.family, 'deepseek-r1');
    });

    test('ollama tag 不影响家族匹配（qwen3:32b → qwen3 家族）', () {
      final m = lookupKnownModel('qwen3:32b');
      expect(m, isNotNull);
      // 剥 tag 后精确表里没有 `qwen3` 单条 ⇒ 走家族关键词。
      expect(m!.matchedBy, 'family');
      expect(m.family, 'qwen3');
      expect(m.params.reasoningLevels, 2);
    });

    test('未命中 ⇒ null（表单走探测兜底）', () {
      expect(lookupKnownModel('my-private-finetune-v99'), isNull);
      expect(lookupKnownModel(''), isNull);
      expect(lookupKnownModel('   '), isNull);
    });

    test('精确命中优先于家族命中', () {
      // `qwen2.5-coder` 同时是 qwen2.5 家族的关键词与精确条目
      // ⇒ 必须走精确（注册表里 exact 有它）。
      final m = lookupKnownModel('qwen2.5-coder:14b');
      expect(m, isNotNull);
      expect(m!.matchedBy, 'exact');
    });
  });

  group('reasoningParams —— 推理参数映射的形状', () {
    test('OpenAI 系：reasoning_effort 档位（低→高）', () {
      final m = lookupKnownModel('o3')!;
      expect(m.params.reasoningLevels, 3);
      expect(
        m.params.reasoningParams!('openai', 0),
        {'reasoning_effort': 'low'},
      );
      expect(
        m.params.reasoningParams!('openai', 2),
        {'reasoning_effort': 'high'},
      );
      // Claude 标准下 OpenAI 模板的形状不适用 ⇒ 空（不许硬塞）。
      expect(m.params.reasoningParams!('claude', 1), isEmpty);
    });

    test('Claude 系：thinking.budget_tokens 档位（低→高）', () {
      final m = lookupKnownModel('claude-sonnet-4-5')!;
      expect(m.params.reasoningLevels, 3);
      final p = m.params.reasoningParams!('claude', 1);
      expect(p['thinking']['type'], 'enabled');
      expect(p['thinking']['budget_tokens'], 8192);
      // OpenAI 兼容网关上没有这条原生参数 ⇒ 空。
      expect(m.params.reasoningParams!('openai', 1), isEmpty);
    });

    test('开关型（Qwen3）：enable_thinking 两档', () {
      final m = lookupKnownModel('qwen3:14b')!;
      expect(m.params.reasoningLevels, 2);
      expect(m.params.reasoningParams!('openai', 0), {
        'enable_thinking': false,
      });
      expect(m.params.reasoningParams!('openai', 1), {
        'enable_thinking': true,
      });
    });

    test('恒开思考（deepseek-r1）：无档位 ⇒ 不产生参数', () {
      final m = lookupKnownModel('deepseek-r1:32b')!;
      expect(m.params.reasoningLevels, 0);
    });

    test('档位越界 ⇒ 空 map（fail-closed，不塞半截参数）', () {
      final m = lookupKnownModel('o3')!;
      expect(m.params.reasoningParams!('openai', 99), isEmpty);
      expect(m.params.reasoningParams!('openai', -1), isEmpty);
    });
  });

  group('reasoningLevelNames —— 档位名的取值域', () {
    test('档位数与名字数一致', () {
      expect(reasoningLevelNames(0), isEmpty);
      expect(reasoningLevelNames(2).length, 2);
      expect(reasoningLevelNames(3), ['low', 'medium', 'high']);
      expect(reasoningLevelNames(4).length, 4);
    });
  });

  group('defaultReasoningParams —— 通用兜底', () {
    test('2 档 = enable_thinking 开关；3 档 = reasoning_effort', () {
      expect(defaultReasoningParams(2, 0), {'enable_thinking': false});
      expect(defaultReasoningParams(2, 1), {'enable_thinking': true});
      expect(defaultReasoningParams(3, 0), {'reasoning_effort': 'low'});
      expect(defaultReasoningParams(3, 2), {'reasoning_effort': 'high'});
      expect(defaultReasoningParams(4, 0), {'reasoning_effort': 'minimal'});
    });

    test('越界 / 无档位 ⇒ 空 map（fail-closed）', () {
      expect(defaultReasoningParams(0, 0), isEmpty);
      expect(defaultReasoningParams(3, 3), isEmpty);
      expect(defaultReasoningParams(3, -1), isEmpty);
      expect(defaultReasoningParams(9, 1), isEmpty);
    });
  });

  group('出厂参数的形状自检', () {
    test('inputTypes 都在取值域内（表单 chips 直接吃这个）', () {
      for (final family in const [
        'gpt-4o',
        'claude-sonnet-4-5',
        'gemini-2.5-pro',
        'qwen3',
        'llama3',
      ]) {
        final m = lookupKnownModel(family)!;
        for (final t in m.params.inputTypes) {
          expect(kModelInputTypes, contains(t), reason: family);
        }
        expect(m.params.inputTypes, isNotEmpty, reason: family);
      }
    });

    test('contextWindow / maxOutputTokens 要么 null 要么正数', () {
      for (final id in const [
        'gpt-4o',
        'claude-sonnet-4-5',
        'deepseek-r1',
        'qwen3:32b',
        'llama3:8b',
        'glm-4.5',
        'kimi-k2',
      ]) {
        final m = lookupKnownModel(id);
        expect(m, isNotNull, reason: id);
        final cw = m!.params.contextWindow;
        final mo = m.params.maxOutputTokens;
        expect(cw == null || cw > 0, isTrue, reason: id);
        expect(mo == null || mo > 0, isTrue, reason: id);
      }
    });
  });
}
