import 'package:sqflite/sqflite.dart';
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

    final defaultModels = [
      const ModelItem(
        id: 'local_qwen2.5-0.5b',
        name: 'Qwen2.5-0.5B',
        path: 'assets/models/qwen2.5-0.5b',
        type: 'text',
        size: 1024,
        isLoaded: true,
        isLocal: true,
      ),
      const ModelItem(
        id: 'local_qwen2.5-1.5b',
        name: 'Qwen2.5-1.5B',
        path: 'assets/models/qwen2.5-1.5b',
        type: 'text',
        size: 3072,
        isLoaded: false,
        isLocal: true,
      ),
      const ModelItem(
        id: 'local_qwen2-vl-2b',
        name: 'Qwen2-VL-2B',
        path: 'assets/models/qwen2-vl-2b',
        type: 'vision',
        size: 4608,
        isLoaded: false,
        isLocal: true,
      ),
    ];

    for (final model in defaultModels) {
      await insert(model);
    }
  }
}

// Alias for backward compatibility
typedef ModelRepository = SqliteModelRepository;
