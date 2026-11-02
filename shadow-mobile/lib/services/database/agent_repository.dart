import '../telencephalon/telencephalon_client.dart';
import 'agent_settings.dart';
import 'repositories.dart';

/// 叶区（agent）的仓储 —— **打端脑面**。
///
/// ⚠️ 为什么不再打前额叶方言：端脑**没有** `/api/agents` 这一族路由
/// （旧路径一律 **404**）⇒ ⇒ 列表永远是空的（404 被吞成「一个 agent 都没有」）
/// ⇒ ⇒ **失败长得像成功**。
///
/// ⇒ 现在的真相源：端脑的 `GET /shadow/v1/agents`（叶区登记表）。
class TelencephalonAgentRepository implements IAgentRepository {
  final TelencephalonClient _client;

  TelencephalonAgentRepository({required TelencephalonClient client})
    : _client = client;

  @override
  Future<List<AgentSettings>> getAll() async {
    final res = await _client.listAgents();
    return res.agents
        .map((l) => AgentSettings.fromLobe(l, defaultAgent: res.defaultAgent))
        .toList();
  }

  Future<List<AgentSettings>> getAllAgents() => getAll();

  @override
  Future<AgentSettings?> getById(String id) async {
    // ⚠️ 端脑以**名字**为键（`GET /shadow/v1/agents/{name}`）⇒ ⇒ id 就是名字。
    //
    // ⚠️ 读不到**不**说成「不存在」⇒ ⇒ 异常照抛（别在这里 catch 成 null ——
    // 那会把「401 / 500」画成「这个 agent 不在了」⇒ **失败长得像成功**）。
    final json = await _client.getAgent(id);
    return AgentSettings.fromLobe(LobeInfo.fromJson(json));
  }

  Future<AgentSettings?> getAgentById(String id) => getById(id);

  @override
  Future<void> insert(AgentSettings agent) async {
    // 端脑的建叶区面：`POST /api/telencephalon/admin/agents/create`
    // ⇒ ⇒ **admin 门** ⇒ ⇒ 客户端那把 admin 钥匙必须带上。
    //
    // ⚠️ 服务端**要求** `system_prompt` 非空（否则 400）⇒ ⇒ 这里用
    // 「描述，没有就用名字」兜底 ⇒ ⚠️ 这是**兜底**不是发明：界面上还没有
    // 「系统提示词」这个字段。
    final desc = (agent.description ?? '').trim();
    final prompt = desc.isNotEmpty ? desc : agent.name;
    await _client.createPromptAgent(
      name: agent.name,
      systemPrompt: prompt,
      description: agent.description,
      skills: agent.skills.isEmpty ? null : agent.skills,
      modelName: agent.model.isEmpty ? null : agent.model,
    );
  }

  Future<void> insertAgent(AgentSettings agent) => insert(agent);

  @override
  Future<void> update(AgentSettings agent) async {
    // ⚠️ 端脑的**模型路由**是**整份下发**
    // （`POST /api/telencephalon/lobes/models`）⇒ ⇒ **单叶区改模型没有
    // 诚实的做法**（把各叶区的**有效值**回填会把「跟随全局默认」钉死）
    // ⇒ ⇒ 这里**只写叶区自己的配置袋**。
    //
    // 端脑面：`PATCH /api/telencephalon/agents/{name}/config`（合并语义）
    // ⇒ ⇒ 界面上的「设置」终于**真的存下来了**（以前点「保存」什么也没发生）。
    final settings = agent.settings;
    if (settings == null || settings.isEmpty) return;
    await _client.patchAgentConfig(agent.id, settings);
  }

  Future<void> updateAgent(AgentSettings agent) => update(agent);

  @override
  Future<void> delete(String id) async {
    // ⚠️ **端脑没有「删除叶区」这张面** ⇒ ⇒ 不去打那个不存在的路由（404 只
    // 会变成一句看不懂的话）⇒ ⇒ 直接把话说清楚：这件事端脑没做。
    throw UnsupportedError(
      '端脑没有「删除叶区」这张面（DELETE /api/telencephalon/agents/$id 不存在）'
      '—— 删不掉就是删不掉，不能假装删掉了。',
    );
  }

  Future<void> deleteAgent(String id) => delete(id);

  @override
  Future<void> toggleAgent(String id) async {
    // ⚠️ 端脑也没有「启停叶区」这张面 ⇒ ⇒ 界面上那个开关是**灰的**
    // （见 agents_screen.dart）⇒ ⇒ 这里只是把话说清楚，不是被人调用的路径。
    throw UnsupportedError('端脑没有「启停叶区」这张面（叶区的 enabled 只能随注册表写）');
  }

  @override
  Future<void> initializeDefaultAgents() async {
    // ⚠️ 端脑**自带**原生叶区（prefrontal / temporal / …）⇒ ⇒ 客户端**不造**
    // 默认 agent ⇒ ⇒ 这里刻意是空的（不是「忘了做」）。
  }
}

typedef AgentRepository = TelencephalonAgentRepository;
