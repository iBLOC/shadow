import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:shadow_mobile/services/database/model_metadata.dart';

/// 模型元数据表的仓储契约（sqflite_common_ffi 内存库，不碰真机文件）。
void main() {
  sqfliteFfiInit();
  databaseFactory = databaseFactoryFfi;

  late Database db;
  late ModelMetadataRepository repository;

  setUp(() async {
    db = await databaseFactory.openDatabase(
      inMemoryDatabasePath,
      options: OpenDatabaseOptions(
        version: 1,
        onCreate: (db, version) async {
          // 与 database_helper v5 的 model_metadata 建表语句逐字同形
          // （改表结构时两处必须一起改 —— 测试就是那道对齐闸）。
          await db.execute('''
            CREATE TABLE model_metadata (
              model_id TEXT PRIMARY KEY,
              display_name TEXT,
              context_window INTEGER,
              max_output_tokens INTEGER,
              input_types TEXT,
              capabilities TEXT,
              reasoning_levels INTEGER NOT NULL DEFAULT 0,
              reasoning_param_mapping TEXT,
              advanced_config TEXT,
              source TEXT NOT NULL DEFAULT 'smart_config',
              updated_at TEXT
            )
          ''');
        },
      ),
    );
    ModelMetadataRepository.databaseOverride = () async => db;
    repository = ModelMetadataRepository();
  });

  tearDown(() async {
    ModelMetadataRepository.databaseOverride = null;
    await db.close();
  });

  ModelMetadata sample({String id = 'qwen3:32b'}) => ModelMetadata(
        modelId: id,
        displayName: 'Qwen3 32B',
        contextWindow: 128000,
        maxOutputTokens: 8192,
        inputTypes: ['text'],
        capabilities: ['llm'],
        reasoningLevels: 2,
        reasoningParamMapping: const {
          'openai': {'enable_thinking': true},
        },
        advancedConfig: const {'temperature': 0.6},
      );

  test('put → get 往返（JSON 列无损）', () async {
    await repository.put(sample());

    final back = await repository.get('qwen3:32b');
    expect(back, isNotNull);
    expect(back!.displayName, 'Qwen3 32B');
    expect(back.contextWindow, 128000);
    expect(back.maxOutputTokens, 8192);
    expect(back.inputTypes, ['text']);
    expect(back.capabilities, ['llm']);
    expect(back.reasoningLevels, 2);
    expect(back.reasoningParamMapping!['openai']['enable_thinking'], isTrue);
    expect(back.advancedConfig!['temperature'], 0.6);
    expect(back.updatedAt, isNotNull);
  });

  test('同 ID 重复 put = 覆盖（upsert）', () async {
    await repository.put(sample());
    await repository.put(sample().copyWith(contextWindow: 65536));

    final back = await repository.get('qwen3:32b');
    expect(back!.contextWindow, 65536);
    expect((await repository.getAll()).length, 1);
  });

  test('getAll 的键是模型 ID（多行并存）', () async {
    await repository.put(sample());
    await repository.put(sample(id: 'gpt-4o'));
    final all = await repository.getAll();
    expect(all.keys, containsAll(['qwen3:32b', 'gpt-4o']));
  });

  test('坏 JSON 行 ⇒ 跳过不抛（getAll 的孤儿容忍）', () async {
    await repository.put(sample());
    await db.insert('model_metadata', {
      'model_id': 'broken',
      'input_types': '{not-json',
      'reasoning_levels': 2,
    });

    final all = await repository.getAll();
    expect(all.containsKey('qwen3:32b'), isTrue);
    expect(all.containsKey('broken'), isFalse);
  });

  test('坏 JSON 行单读 ⇒ null（不抛进调用方）', () async {
    await db.insert('model_metadata', {
      'model_id': 'broken',
      'capabilities': '[oops',
    });
    expect(await repository.get('broken'), isNull);
  });

  test('delete 删单条；删不存在的 id 不炸', () async {
    await repository.put(sample());
    await repository.delete('qwen3:32b');
    expect(await repository.get('qwen3:32b'), isNull);
    await repository.delete('never-existed');
  });
}
