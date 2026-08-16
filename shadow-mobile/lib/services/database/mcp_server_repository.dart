import 'package:sqflite/sqflite.dart';
import 'database_helper.dart';
import 'mcp_server.dart';
import 'repositories.dart';

/// SQLite implementation of IMCPServerRepository
/// Used as temporary local storage before Neon migration
class SqliteMCPServerRepository implements IMCPServerRepository {
  final DatabaseHelper _dbHelper = DatabaseHelper.instance;

  static const String _tableName = 'mcp_servers';

  @override
  Future<List<MCPServer>> getAll() async {
    final db = await _dbHelper.database;
    final maps = await db.query(_tableName);
    return maps.map((map) => MCPServer.fromMap(map)).toList();
  }

  Future<List<MCPServer>> getAllServers() async => getAll();

  @override
  Future<MCPServer?> getById(String id) async {
    final db = await _dbHelper.database;
    final maps = await db.query(_tableName, where: 'id = ?', whereArgs: [id]);
    if (maps.isEmpty) return null;
    return MCPServer.fromMap(maps.first);
  }

  Future<MCPServer?> getServerById(String id) async => getById(id);

  @override
  Future<void> insert(MCPServer server) async {
    final db = await _dbHelper.database;
    await db.insert(
      _tableName,
      server.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> insertServer(MCPServer server) async => insert(server);

  @override
  Future<void> update(MCPServer server) async {
    final db = await _dbHelper.database;
    await db.update(
      _tableName,
      server.toMap(),
      where: 'id = ?',
      whereArgs: [server.id],
    );
  }

  Future<void> updateServer(MCPServer server) async => update(server);

  @override
  Future<void> delete(String id) async {
    final db = await _dbHelper.database;
    await db.delete(_tableName, where: 'id = ?', whereArgs: [id]);
  }

  Future<void> deleteServer(String id) async => delete(id);

  @override
  Future<void> toggleServer(String id) async {
    final server = await getById(id);
    if (server != null) {
      await update(server.copyWith(isEnabled: !server.isEnabled));
    }
  }

  @override
  Future<void> initializeDefaultServers() async {
    final servers = await getAll();
    if (servers.isNotEmpty) return;

    final defaultServers = [
      const MCPServer(
        id: 'builtin_filesystem',
        name: 'File System',
        url: 'http://localhost:3000',
        isEnabled: true,
      ),
    ];

    for (final server in defaultServers) {
      await insert(server);
    }
  }
}

// Alias for backward compatibility
typedef MCPServerRepository = SqliteMCPServerRepository;
