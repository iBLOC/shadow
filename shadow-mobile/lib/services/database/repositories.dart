import 'agent_settings.dart';
import 'skill.dart';
import 'mcp_server.dart';
import 'model_item.dart';

/// Base interface for all repositories
/// Future implementations: SqliteRepository, NeonRepository
abstract class IRepository<T> {
  Future<List<T>> getAll();
  Future<T?> getById(String id);
  Future<void> insert(T item);
  Future<void> update(T item);
  Future<void> delete(String id);
}

/// Agent repository interface
abstract class IAgentRepository extends IRepository<AgentSettings> {
  Future<void> toggleAgent(String id);
  Future<void> initializeDefaultAgents();
}

/// Skill repository interface
abstract class ISkillRepository extends IRepository<Skill> {
  Future<void> toggleSkill(String id);
  Future<void> initializeDefaultSkills();
}

/// MCP Server repository interface
abstract class IMCPServerRepository extends IRepository<MCPServer> {
  Future<void> toggleServer(String id);
  Future<void> initializeDefaultServers();
}

/// Model repository interface
abstract class IModelRepository extends IRepository<ModelItem> {
  Future<void> setModelLoaded(String id, bool isLoaded);
  Future<List<ModelItem>> getLocalModels();
  Future<List<ModelItem>> getCloudModels();
  Future<void> initializeDefaultModels();
}
