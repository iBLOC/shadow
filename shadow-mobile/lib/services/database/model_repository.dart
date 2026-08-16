import 'package:sqflite/sqflite.dart';
import 'package:flutter/services.dart';
import 'database_helper.dart';
import 'model_item.dart';
import 'repositories.dart';

/// SQLite implementation of IModelRepository
/// Used as temporary local storage before Neon migration
class SqliteModelRepository implements IModelRepository {
  final DatabaseHelper _dbHelper = DatabaseHelper.instance;

  static const String _tableName = 'models';

  @override
  Future<List<ModelItem>> getAll() async {
    final db = await _dbHelper.database;
    final maps = await db.query(_tableName);
    return maps.map((map) => ModelItem.fromMap(map)).toList();
  }

  @override
  Future<List<ModelItem>> getAllModels() async => getAll();

  @override
  Future<ModelItem?> getById(String id) async {
    final db = await _dbHelper.database;
    final maps = await db.query(_tableName, where: 'id = ?', whereArgs: [id]);
    if (maps.isEmpty) return null;
    return ModelItem.fromMap(maps.first);
  }

  @override
  Future<ModelItem?> getModelById(String id) async => getById(id);

  @override
  Future<void> insert(ModelItem model) async {
    final db = await _dbHelper.database;
    await db.insert(
      _tableName,
      model.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  @override
  Future<void> insertModel(ModelItem model) async => insert(model);

  @override
  Future<void> update(ModelItem model) async {
    final db = await _dbHelper.database;
    await db.update(
      _tableName,
      model.toMap(),
      where: 'id = ?',
      whereArgs: [model.id],
    );
  }

  @override
  Future<void> updateModel(ModelItem model) async => update(model);

  @override
  Future<void> delete(String id) async {
    final db = await _dbHelper.database;
    await db.delete(_tableName, where: 'id = ?', whereArgs: [id]);
  }

  @override
  Future<void> deleteModel(String id) async => delete(id);

  @override
  Future<void> setModelLoaded(String id, bool isLoaded) async {
    final model = await getById(id);
    if (model != null) {
      await update(model.copyWith(isLoaded: isLoaded));
    }
  }

  @override
  Future<List<ModelItem>> getLocalModels() async {
    final models = await getAll();
    return models.where((m) => m.isLocal).toList();
  }

  @override
  Future<List<ModelItem>> getCloudModels() async {
    final models = await getAll();
    return models.where((m) => !m.isLocal).toList();
  }

  @override
  Future<void> initializeDefaultModels() async {
    final models = await getAll();
    if (models.isNotEmpty) return;

    final localModels = await _scanLocalModels();
    for (final model in localModels) {
      await insert(model);
    }
  }

  Future<List<ModelItem>> _scanLocalModels() async {
    try {
      final manifestContent = await rootBundle.loadString('AssetManifest.json');
      final Map<String, dynamic> manifest = Map<String, dynamic>.from(
        manifestContent.contains('"assets"')
            ? _parseManifest(manifestContent)
            : {},
      );

      final modelDirs = <String, List<String>>{};
      for (final key in manifest.keys) {
        if (key.startsWith('assets/models/')) {
          final parts = key.split('/');
          if (parts.length >= 3) {
            final modelName = parts[2];
            if (!modelDirs.containsKey(modelName)) {
              modelDirs[modelName] = [];
            }
            modelDirs[modelName]!.add(key);
          }
        }
      }

      final localModels = <ModelItem>[];
      for (final entry in modelDirs.entries) {
        final modelName = entry.key;
        final files = entry.value;
        final hasVision = files.any(
          (f) =>
              f.contains('_vl') || f.contains('vision') || f.contains('_image'),
        );

        final totalSize = await _estimateModelSize(modelName);

        localModels.add(
          ModelItem(
            id: 'local_$modelName',
            name: _formatModelName(modelName),
            path: 'assets/models/$modelName',
            type: hasVision ? 'vision' : 'text',
            size: totalSize,
            isLoaded: false,
            isLocal: true,
          ),
        );
      }

      if (localModels.isEmpty) {
        localModels.add(
          const ModelItem(
            id: 'local_placeholder',
            name: '暂无本地模型',
            path: '',
            type: 'text',
            size: 0,
            isLoaded: false,
            isLocal: true,
          ),
        );
      }

      return localModels;
    } catch (e) {
      return [
        const ModelItem(
          id: 'local_placeholder',
          name: '暂无本地模型',
          path: '',
          type: 'text',
          size: 0,
          isLoaded: false,
          isLocal: true,
        ),
      ];
    }
  }

  Map<String, dynamic> _parseManifest(String content) {
    final Map<String, dynamic> result = {};
    try {
      final lines = content.split('\n');
      for (final line in lines) {
        if (line.contains('": [')) {
          final keyMatch = RegExp(r'"([^"]+)":\s*\[').firstMatch(line);
          if (keyMatch != null) {
            final key = keyMatch.group(1)!;
            final assets = <String>[];
            final assetMatches = RegExp(r'"([^"]+)"').allMatches(line);
            for (final m in assetMatches) {
              if (m.group(1) != null) {
                assets.add(m.group(1)!);
              }
            }
            if (assets.isNotEmpty) {
              result[key] = assets;
            }
          }
        }
      }
    } catch (_) {}
    return result;
  }

  String _formatModelName(String name) {
    return name
        .replaceAll('-', ' ')
        .replaceAll('_', ' ')
        .split(' ')
        .map(
          (w) => w.isNotEmpty ? '${w[0].toUpperCase()}${w.substring(1)}' : '',
        )
        .join(' ');
  }

  Future<int> _estimateModelSize(String modelName) async {
    try {
      final manifestContent = await rootBundle.loadString('AssetManifest.json');
      int totalSize = 0;
      for (final key in manifestContent.split('"')) {
        if (key.contains('assets/models/$modelName/') && key.endsWith('.bin')) {
          totalSize += 1024 * 1024;
        }
      }
      return totalSize > 0 ? totalSize : 1024;
    } catch (_) {
      return 1024;
    }
  }
}

// Alias for backward compatibility
typedef ModelRepository = SqliteModelRepository;
