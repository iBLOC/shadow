import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

void main() {
  group('NeuronCatalogEntry.fromJson（neuron 目录条目）', () {
    test('已下载条目：available / size_bytes / default_repo 全带', () {
      final e = NeuronCatalogEntry.fromJson(const {
        'id': 'llm/minicpm5-1b',
        'engine': 'llm',
        'available': true,
        'size_bytes': 123456789,
        'default_repo': 'huggingface:openbmb/MiniCPM5-1B',
      });
      expect(e.id, 'llm/minicpm5-1b');
      expect(e.engine, 'llm');
      expect(e.available, isTrue);
      expect(e.sizeBytes, 123456789);
      expect(e.defaultRepo, 'huggingface:openbmb/MiniCPM5-1B');
      expect(e.modelId, 'minicpm5-1b');
    });

    test('未下载条目：available=false ⇒ 界面要给下载入口', () {
      final e = NeuronCatalogEntry.fromJson(const {
        'id': 'asr/sensevoice-small',
        'engine': 'asr',
        'available': false,
      });
      expect(e.available, isFalse);
      expect(e.sizeBytes, isNull);
      expect(e.defaultRepo, isNull);
      expect(e.modelId, 'sensevoice-small');
    });

    test('modelId 按【第一个】斜杠拆（llm/a/b ⇒ a/b；无前缀原样）', () {
      final e = NeuronCatalogEntry.fromJson(
        const {'id': 'llm/a/b', 'engine': 'llm', 'available': false},
      );
      expect(e.modelId, 'a/b');
      final plain = NeuronCatalogEntry.fromJson(
        const {'id': 'plain', 'engine': 'x', 'available': true},
      );
      expect(plain.modelId, 'plain');
    });

    test('缺字段不炸（id/engine 兜底空串，available 兜底 false）', () {
      final e = NeuronCatalogEntry.fromJson(const {});
      expect(e.id, '');
      expect(e.engine, '');
      expect(e.available, isFalse);
    });

    test('引擎档／推荐档／主源三个新字段（2026-11-18 那一刀）', () {
      // 老模型：recommended=false ⇒ 进「历史支持模型库」段。
      final legacy = NeuronCatalogEntry.fromJson(const {
        'id': 'llm/qwen2.5-0.5b',
        'engine': 'llm',
        'engine_impl': 'candle',
        'recommended': false,
        'source': 'modelscope',
        'default_repo': 'modelscope:Qwen/Qwen2.5-0.5B-Instruct',
        'available': false,
      });
      expect(legacy.engineImpl, 'candle');
      expect(legacy.recommended, isFalse);
      expect(legacy.source, 'modelscope');

      // 当前世代：recommended 缺字段 ⇒ 兜底 true（不许把老服务的目录
      // 全画进历史库）。
      final modern = NeuronCatalogEntry.fromJson(const {
        'id': 'llm/qwen3-0.6b',
        'engine': 'llm',
        'available': false,
      });
      expect(modern.recommended, isTrue);
      expect(modern.engineImpl, '');
      expect(modern.source, '');
    });
  });

  group('NeuronPullJob.fromJson（下载任务）', () {
    test('进行中：isActive ⇒ 轮询继续，进度字段齐', () {
      final j = NeuronPullJob.fromJson(const {
        'job_id': 'j1',
        'status': 'in_progress',
        'reference': 'huggingface:o/r',
        'engine': 'llm',
        'bytes_downloaded': 1024,
        'total_bytes': 4096,
        'current_file': 'model.safetensors',
      });
      expect(j.jobId, 'j1');
      expect(j.isActive, isTrue);
      expect(j.isDone, isFalse);
      expect(j.isFailed, isFalse);
      expect(j.bytesDownloaded, 1024);
      expect(j.totalBytes, 4096);
      expect(j.currentFile, 'model.safetensors');
    });

    test('pending 也算在跑', () {
      final j = NeuronPullJob.fromJson(
        const {'job_id': 'j2', 'status': 'pending'},
      );
      expect(j.isActive, isTrue);
    });

    test('终态三格：completed / failed / cancelled', () {
      final done = NeuronPullJob.fromJson(
        const {'job_id': 'd', 'status': 'completed'},
      );
      final failed = NeuronPullJob.fromJson(
        const {'job_id': 'f', 'status': 'failed', 'error': 'boom'},
      );
      final cancelled = NeuronPullJob.fromJson(
        const {'job_id': 'c', 'status': 'cancelled'},
      );
      expect(done.isDone, isTrue);
      expect(done.isActive, isFalse);
      expect(failed.isFailed, isTrue);
      expect(failed.error, 'boom');
      expect(cancelled.isActive, isFalse);
      expect(cancelled.isDone, isFalse);
      expect(cancelled.isFailed, isFalse);
    });
  });
}
