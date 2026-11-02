import 'repositories.dart';
import 'agent_repository.dart';
import 'skill_repository.dart';
import 'mcp_server_repository.dart';
import 'model_repository.dart';
import '../telencephalon/telencephalon_client.dart';

/// Repository factory for creating repository instances
/// Switch between SQLite (current) and Neon (future) based on configuration
class RepositoryFactory {
  static bool _useNeon = false;
  static String? _neonConnectionString;

  /// Configure the repository backend
  /// [useNeon] - true to use Neon, false to use SQLite
  /// [connectionString] - Neon connection string (required if useNeon is true)
  static void configure({required bool useNeon, String? connectionString}) {
    _useNeon = useNeon;
    _neonConnectionString = connectionString;
  }

  /// Check if Neon backend is configured
  static bool get isUsingNeon => _useNeon;

  /// Get Neon connection string
  static String? get neonConnectionString => _neonConnectionString;

  /// 叶区（agent）的仓储 —— 真相源是**端脑面**（不是前额叶方言）。
  static IAgentRepository createAgentRepository(TelencephalonClient client) {
    if (_useNeon) {
      throw UnimplementedError('Neon repository not yet implemented');
    }
    return TelencephalonAgentRepository(client: client);
  }

  /// Create Skill repository instance
  static ISkillRepository createSkillRepository() {
    if (_useNeon) {
      // TODO: Return NeonSkillRepository when implemented
      throw UnimplementedError('Neon repository not yet implemented');
    }
    return SqliteSkillRepository();
  }

  /// Create MCP Server repository instance
  static IMCPServerRepository createMCPServerRepository() {
    if (_useNeon) {
      // TODO: Return NeonMCPServerRepository when implemented
      throw UnimplementedError('Neon repository not yet implemented');
    }
    return SqliteMCPServerRepository();
  }

  /// Create Model repository instance
  static IModelRepository createModelRepository() {
    if (_useNeon) {
      // TODO: Return NeonModelRepository when implemented
      throw UnimplementedError('Neon repository not yet implemented');
    }
    return SqliteModelRepository();
  }
}

/// Future Neon repository implementations (not yet implemented)
/// These will be implemented when migrating to Neon

// class NeonAgentRepository implements IAgentRepository { ... }
// class NeonSkillRepository implements ISkillRepository { ... }
// class NeonMCPServerRepository implements IMCPServerRepository { ... }
// class NeonModelRepository implements IModelRepository { ... }
