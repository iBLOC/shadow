import 'package:sqflite/sqflite.dart';

import 'database_helper.dart';

/// App 私有的键值设置。
///
/// 用来存「用户选过、但不属于任何一张表」的东西 —— 比如大脑用哪个模型
/// 来源（`BrainModelSource`）。放在 SQLite 里而不是内存里，是因为这个
/// 选择要**跨进程重启存活**：App 被系统杀掉再拉起来，大脑该用哪个上游
/// 不能变。
class AppSettingsRepository {
  static const String _tableName = 'app_settings';

  final DatabaseHelper _dbHelper = DatabaseHelper.instance;

  /// 读一个设置。
  ///
  /// **没有这个键**返回 null —— 对「用户还没选过」与「用户选了空」是
  /// 同一件事：调用方要区分的话，自己给「没选过」另设一个取值。
  Future<String?> get(String key) async {
    final db = await _dbHelper.database;
    final rows = await db.query(
      _tableName,
      columns: ['value'],
      where: 'key = ?',
      whereArgs: [key],
      limit: 1,
    );
    if (rows.isEmpty) return null;
    return rows.first['value'] as String?;
  }

  /// 写一个设置。
  Future<void> set(String key, String value) async {
    final db = await _dbHelper.database;
    await db.insert(
      _tableName,
      {'key': key, 'value': value},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// 删掉一个设置（回到「用户还没选过」）。
  Future<void> remove(String key) async {
    final db = await _dbHelper.database;
    await db.delete(_tableName, where: 'key = ?', whereArgs: [key]);
  }
}
