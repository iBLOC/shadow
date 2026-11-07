import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';

class DatabaseHelper {
  static final DatabaseHelper instance = DatabaseHelper._init();
  static Database? _database;

  DatabaseHelper._init();

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDB('shadow.db');
    return _database!;
  }

  Future<Database> _initDB(String filePath) async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, filePath);

    return await openDatabase(
      path,
      version: 6,
      onCreate: _createDB,
      onUpgrade: _upgradeDB,
    );
  }

  Future<void> _createDB(Database db, int version) async {
    await db.execute('''
      CREATE TABLE agent_settings (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        settings TEXT,
        soul TEXT
      )
    ''');

    await db.execute('''
      CREATE TABLE skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        is_built_in INTEGER NOT NULL DEFAULT 0,
        settings TEXT
      )
    ''');

    await db.execute('''
      CREATE TABLE mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        auth_token TEXT,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        settings TEXT
      )
    ''');

    // ⚠️ **没有 `models` 表** —— 本地 LiteRT/MNN 引擎退役后它就没有任何
    // 读取方了（旧 FAB 往这里写「添加的云端模型」，运行时链路只读大脑的
    // `/models/providers` ⇒ 写了也用不上 ⇒ 失败长得像成功）。v6 迁移把
    // 老库里这张死表删掉（见 `_upgradeDB`）。

    // App 私有的键值设置。
    //
    // 用来存「用户选过、但不属于任何一张表」的东西 —— 比如大脑用哪个
    // 模型来源（见 `lib/providers/brain_model_source_provider.dart`）。
    await db.execute('''
      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    ''');

    await _createModelMetadata(db);
  }

  /// 模型元数据表（v5）—— 「智能配置」的落点。
  ///
  /// ⚠️ **键是模型 ID 字符串，不是供应商条目 id** —— 大脑目录里同一只
  /// 模型可以从不同供应商摸到，参数长在**模型**身上，不长在接入点上。
  /// 孤儿容忍：大脑侧删了供应商，这行留着（下次同名模型再进来还能用）。
  ///
  /// ⚠️ JSON 列（input_types / capabilities / reasoning_param_mapping /
  /// advanced_config）解析失败 ⇒ 整行按「没有元数据」处理 —— 绝不抛进
  /// 列表渲染（repository 里兜）。
  Future<void> _createModelMetadata(Database db) async {
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
  }

  Future<void> _upgradeDB(Database db, int oldVersion, int newVersion) async {
    if (oldVersion < 2) {
      await db.execute(
        'ALTER TABLE models ADD COLUMN source TEXT NOT NULL DEFAULT \'localEngine\'',
      );
    }
    if (oldVersion < 3) {
      await db.execute(
        'ALTER TABLE models ADD COLUMN model_type TEXT NOT NULL DEFAULT \'llm\'',
      );
    }
    if (oldVersion < 4) {
      await db.execute('''
        CREATE TABLE app_settings (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      ''');
    }
    if (oldVersion < 5) {
      await _createModelMetadata(db);
    }
    // v6 —— `models` 死表退役：本地引擎退役后无人读（见 `_createDB` 的
    // 注），老库里的残留行清掉。`IF EXISTS` ⇒ 新装（onCreate 直达 v6，
    // 没建过这张表）也不炸。
    if (oldVersion < 6) {
      await db.execute('DROP TABLE IF EXISTS models');
    }
  }

  Future<void> close() async {
    final db = await instance.database;
    db.close();
  }
}
