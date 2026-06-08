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
    return agents.map((a) => AgentSettings.fromAgentResponse(a)).toList();
  }

  @override
  Future<List<AgentSettings>> getAllAgents() => getAll();

  @override
  Future<AgentSettings?> getById(String id) async {
    try {
      final agent = await _client.getAgent(id);
      return AgentSettings.fromAgentResponse(agent);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<AgentSettings?> getAgentById(String id) => getById(id);

  @override
  Future<void> insert(AgentSettings agent) async {
    final request = CreateAgentRequest(
      name: agent.name,
      description: agent.description,
      model: agent.model.isNotEmpty ? agent.model : 'gpt-4o',
      skills: agent.skills,
    );
    await _client.createAgent(request);
  }

  @override
  Future<void> insertAgent(AgentSettings agent) => insert(agent);

  @override
  Future<void> update(AgentSettings agent) async {
    if (agent.model.isNotEmpty) {
      await _client.updateAgentModel(agent.id, agent.model);
    }
  }

  @override
  Future<void> updateAgent(AgentSettings agent) => update(agent);

  @override
  Future<void> delete(String id) async {
    await _client.deleteAgent(id);
  }

  @override
  Future<void> deleteAgent(String id) => delete(id);

  @override
  Future<void> toggleAgent(String id) async {}

  @override
  Future<void> initializeDefaultAgents() async {}
}

typedef AgentRepository = PrefrontalAgentRepository;
