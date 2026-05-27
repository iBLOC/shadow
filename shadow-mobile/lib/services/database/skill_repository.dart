import 'package:sqflite/sqflite.dart';
import 'database_helper.dart';
import 'skill.dart';
import 'repositories.dart';

/// SQLite implementation of ISkillRepository
/// Used as temporary local storage before Neon migration
class SqliteSkillRepository implements ISkillRepository {
  final DatabaseHelper _dbHelper = DatabaseHelper.instance;

  static const String _tableName = 'skills';

  @override
  Future<List<Skill>> getAll() async {
    final db = await _dbHelper.database;
    final maps = await db.query(_tableName);
    return maps.map((map) => Skill.fromMap(map)).toList();
  }

  @override
  Future<List<Skill>> getAllSkills() async => getAll();

  @override
  Future<Skill?> getById(String id) async {
    final db = await _dbHelper.database;
    final maps = await db.query(_tableName, where: 'id = ?', whereArgs: [id]);
    if (maps.isEmpty) return null;
    return Skill.fromMap(maps.first);
  }

  @override
  Future<Skill?> getSkillById(String id) async => getById(id);

  @override
  Future<void> insert(Skill skill) async {
    final db = await _dbHelper.database;
    await db.insert(
      _tableName,
      skill.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  @override
  Future<void> insertSkill(Skill skill) async => insert(skill);

  @override
  Future<void> update(Skill skill) async {
    final db = await _dbHelper.database;
    await db.update(
      _tableName,
      skill.toMap(),
      where: 'id = ?',
      whereArgs: [skill.id],
    );
  }

  @override
  Future<void> updateSkill(Skill skill) async => update(skill);

  @override
  Future<void> delete(String id) async {
    final db = await _dbHelper.database;
    await db.delete(_tableName, where: 'id = ?', whereArgs: [id]);
  }

  @override
  Future<void> deleteSkill(String id) async => delete(id);

  @override
  Future<void> toggleSkill(String id) async {
    final skill = await getById(id);
    if (skill != null) {
      await update(skill.copyWith(isEnabled: !skill.isEnabled));
    }
  }

  @override
  Future<void> initializeDefaultSkills() async {
    final skills = await getAll();
    if (skills.isNotEmpty) return;

    final defaultSkills = [
      const Skill(
        id: 'builtin_math',
        name: 'Math Calculator',
        description: 'Perform mathematical calculations',
        isEnabled: true,
        isBuiltIn: true,
      ),
      const Skill(
        id: 'builtin_search',
        name: 'Web Search',
        description: 'Search the web for information',
        isEnabled: true,
        isBuiltIn: true,
      ),
    ];

    for (final skill in defaultSkills) {
      await insert(skill);
    }
  }
}

// Alias for backward compatibility
typedef SkillRepository = SqliteSkillRepository;
