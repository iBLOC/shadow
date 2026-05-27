import '../prefrontal_client.dart';
import 'agent_settings.dart';
import 'repositories.dart';

class PrefrontalAgentRepository implements IAgentRepository {
  final PrefrontalClient _client;

  PrefrontalAgentRepository({required PrefrontalClient client})
    : _client = client;

  @override
  Future<List<AgentSettings>> getAll() async {
    final agents = await _client.getAgents();
    return agents
        .map(
          (a) => AgentSettings(
            id: a.id,
            name: a.name,
            description: a.description,
            isEnabled: true,
            settings: {},
            soul: null,
          ),
        )
        .toList();
  }

  @override
  Future<List<AgentSettings>> getAllAgents() => getAll();

  @override
  Future<AgentSettings?> getById(String id) async {
    final agents = await getAll();
    try {
      return agents.firstWhere((a) => a.id == id);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<AgentSettings?> getAgentById(String id) => getById(id);

  @override
  Future<void> insert(AgentSettings agent) async {
    throw UnimplementedError('Use Prefrontal server to create agents');
  }

  @override
  Future<void> insertAgent(AgentSettings agent) => insert(agent);

  @override
  Future<void> update(AgentSettings agent) async {
    throw UnimplementedError('Use Prefrontal server to update agents');
  }

  @override
  Future<void> updateAgent(AgentSettings agent) => update(agent);

  @override
  Future<void> delete(String id) async {
    throw UnimplementedError('Use Prefrontal server to delete agents');
  }

  @override
  Future<void> deleteAgent(String id) => delete(id);

  @override
  Future<void> toggleAgent(String id) async {
    throw UnimplementedError('Use Prefrontal server to toggle agents');
  }

  @override
  Future<void> initializeDefaultAgents() async {}
}

typedef AgentRepository = PrefrontalAgentRepository;
