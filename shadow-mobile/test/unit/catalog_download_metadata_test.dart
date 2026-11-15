import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/models/known_models.dart';

void main() {
  group('catalogDownloadMetadata（目录下载默认参数）', () {
    test('注册表命中 ⇒ 出厂默认全套（不问用户要一个参数）', () {
      final m = catalogDownloadMetadata(modelId: 'o3');

      expect(m.modelId, 'o3');
      expect(m.contextWindow, 200000);
      expect(m.maxOutputTokens, 100000);
      expect(m.inputTypes, ['text', 'image']);
      expect(m.capabilities, ['llm', 'vision']);
      expect(m.reasoningLevels, 3);
      // 推理映射 = openai 标准 ＋ 档位名 ＋ 逐档参数，全套齐。
      expect(m.reasoningParamMapping?['standard'], 'openai');
      expect(m.reasoningParamMapping?['levels'], ['low', 'medium', 'high']);
      expect(
        (m.reasoningParamMapping?['params'] as Map<String, dynamic>),
        hasLength(3),
      );
      expect(m.source, 'catalog_download');
    });

    test('ollama tag 形状也命中（qwen3:32b 的 tag 不影响家族参数）', () {
      // 注册表里没有精确 id 也可能靠家族关键词命中 —— 这里用一个
      // 未登记的 tag 组合证明剥 tag 的路径活着。
      final m = catalogDownloadMetadata(modelId: 'o3:Q4_K_M');
      expect(m.contextWindow, 200000);
      expect(m.source, 'catalog_download');
    });

    test('注册表未命中 ⇒ 目录自带的能力词兜底，其余留空', () {
      final m = catalogDownloadMetadata(
        modelId: 'totally-unknown-model',
        catalogCapabilities: ['vision'],
      );

      expect(m.modelId, 'totally-unknown-model');
      expect(m.contextWindow, isNull);
      expect(m.maxOutputTokens, isNull);
      expect(m.inputTypes, ['text']);
      expect(m.capabilities, ['vision']);
      expect(m.reasoningLevels, 0);
      expect(m.reasoningParamMapping, isNull);
      expect(m.source, 'catalog_download');
    });

    test('未命中且目录没给能力词 ⇒ 回落 llm（不空着手落盘）', () {
      final m = catalogDownloadMetadata(modelId: 'totally-unknown-model');
      expect(m.capabilities, ['llm']);
      expect(m.source, 'catalog_download');
    });
  });
}
