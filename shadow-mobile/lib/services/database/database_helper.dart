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
      version: 4,
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

    await db.execute('''
      CREATE TABLE models (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'text',
        size INTEGER NOT NULL DEFAULT 0,
        is_loaded INTEGER NOT NULL DEFAULT 0,
        is_local INTEGER NOT NULL DEFAULT 1,
        source TEXT NOT NULL DEFAULT 'localEngine',
        model_type TEXT NOT NULL DEFAULT 'llm',
        endpoint TEXT,
        api_key TEXT,
        model TEXT,
        settings TEXT
      )
    ''');

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
  }

  Future<void> close() async {
    final db = await instance.database;
    db.close();
  }
}
