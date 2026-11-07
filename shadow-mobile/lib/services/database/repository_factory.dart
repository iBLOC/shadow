import 'agent_repository.dart';
import 'mcp_server_repository.dart';
import 'repositories.dart';
import 'skill_repository.dart';
import '../telencephalon/telencephalon_client.dart';

/// Repository factory for creating repository instances.
///
/// ⚠️ 旧版这里有一套 `configure(useNeon: …)` 开关＋每条工厂里的
/// `if (_useNeon) throw` 分支 —— **零调用方**的死机械（Neon 仓储从未
/// 落地，开关没人拨过）⇒ 2026-11-07 刀三摘除：工厂现在只有真实存在
/// 的那几条路。真要加第二种后端，到时再引入配置点（别留空壳）。
class RepositoryFactory {
  /// 叶区（agent）的仓储 —— 真相源是**端脑面**（不是前额叶方言）。
  static IAgentRepository createAgentRepository(TelencephalonClient client) {
    return TelencephalonAgentRepository(client: client);
  }

  /// Create Skill repository instance
  static ISkillRepository createSkillRepository() {
    return SqliteSkillRepository();
  }

  /// Create MCP Server repository instance
  static IMCPServerRepository createMCPServerRepository() {
    return SqliteMCPServerRepository();
  }
}
