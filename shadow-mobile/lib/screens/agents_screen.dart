import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../generated/l10n/app_localizations.dart';
import '../providers/brain_model_source_provider.dart';
import '../services/database/database_helper.dart';
import '../services/database/repository_factory.dart';
import '../services/database/repositories.dart';
import '../services/database/agent_settings.dart';
import '../providers/telencephalon_provider.dart';
import '../widgets/brain/lobe_model_override_row.dart';
import '../widgets/glass_card.dart';
import '../widgets/empty_state.dart';
import '../theme/app_colors.dart';

final agentRepositoryProvider = Provider<IAgentRepository>((ref) {
  // ⚠️ 真相源是**端脑面**（叶区登记表）⇒ ⇒ 地址跟着端脑走（内嵌大脑、远端
  // 端脑都自动对）⇒ ⇒ 不再走前额叶方言（那条路端脑**没有** ⇒ 404 ⇒
  // 列表永远是空的 ⇒ 失败长得像成功）。
  final client = ref.watch(telencephalonClientProvider);
  return RepositoryFactory.createAgentRepository(client);
});

final agentsProvider = StateNotifierProvider<AgentsNotifier, AgentsState>((
  ref,
) {
  return AgentsNotifier(ref.watch(agentRepositoryProvider));
});

class AgentsState {
  final List<AgentSettings> agents;
  final bool isLoading;
  final String? error;

  const AgentsState({
    this.agents = const [],
    this.isLoading = false,
    this.error,
  });

  AgentsState copyWith({
    List<AgentSettings>? agents,
    bool? isLoading,
    String? error,
  }) {
    return AgentsState(
      agents: agents ?? this.agents,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class AgentsNotifier extends StateNotifier<AgentsState> {
  final IAgentRepository _repository;

  AgentsNotifier(this._repository) : super(const AgentsState()) {
    _init();
  }

  Future<void> _init() async {
    await DatabaseHelper.instance.database;
    await _repository.initializeDefaultAgents();
    await loadAgents();
  }

  Future<void> loadAgents() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final agents = await _repository.getAll();
      state = state.copyWith(agents: agents, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }
}

/// 叶区 Agents 页 —— **唯一的 agent 面**。
///
/// 这里收口两件原本分裂的事：
/// - agent 是谁、什么状态（本页列表，直读端脑登记表）；
/// - 这个叶区用哪个模型（行内「模型覆盖」下拉 —— 与能力 tab 首卡
///   「默认模型」的叶区段是**同一行组件**、同一份状态）。
///
/// ⚠️ 旧的「Settings」假对话框已删：它展示原始 settings 键值对、
/// 「保存」只是把**没改过**的 map 原样写回（写了个寂寞）；
/// 恒灰的启停开关也删了 —— 端脑没有「启停叶区」这张面，
/// 删掉比灰着诚实。
class AgentsScreen extends ConsumerWidget {
  const AgentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final agentsState = ref.watch(agentsProvider);

    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(l10n.agents),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.read(agentsProvider.notifier).loadAgents(),
          ),
        ],
      ),
      body: agentsState.isLoading
          ? const Center(child: CircularProgressIndicator())
          : agentsState.agents.isEmpty
          ? EmptyState(icon: Icons.psychology_outlined, title: l10n.noModels)
          : _buildAgentList(context, ref, agentsState.agents),
    );
  }

  Widget _buildAgentList(
    BuildContext context,
    WidgetRef ref,
    List<AgentSettings> agents,
  ) {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: agents.length,
      itemBuilder: (context, index) {
        final agent = agents[index];
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: _AgentCard(agent: agent),
        );
      },
    );
  }
}

class _AgentCard extends ConsumerWidget {
  final AgentSettings agent;

  const _AgentCard({required this.agent});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final optionsAsync = ref.watch(brainProviderOptionsProvider);

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                backgroundColor: agent.isEnabled
                    ? AppColors.primary
                    : AppColors.darkTextSecondary,
                radius: 24,
                child: Text(
                  agent.name[0],
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            agent.name,
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        if (agent.isDefault) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.primary.withValues(alpha: 0.2),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              'DEFAULT',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: AppColors.primary,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    if (agent.description != null)
                      Text(
                        agent.description!,
                        style: Theme.of(context).textTheme.bodySmall,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (agent.model.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  const Icon(
                    Icons.model_training,
                    size: 14,
                    color: Colors.grey,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    agent.model,
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: Colors.grey),
                  ),
                ],
              ),
            ),
          if (agent.skills.isNotEmpty) ...[
            const SizedBox(height: 4),
            Wrap(
              spacing: 4,
              runSpacing: 4,
              children: agent.skills.map((skill) {
                return Chip(
                  avatar: const Icon(Icons.extension, size: 14),
                  label: Text(skill, style: const TextStyle(fontSize: 11)),
                  padding: EdgeInsets.zero,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  visualDensity: VisualDensity.compact,
                );
              }).toList(),
            ),
          ],
          if (agent.mcpServers.isNotEmpty) ...[
            const SizedBox(height: 4),
            Wrap(
              spacing: 4,
              runSpacing: 4,
              children: agent.mcpServers.map((server) {
                return Chip(
                  avatar: const Icon(Icons.cloud, size: 14),
                  label: Text(server, style: const TextStyle(fontSize: 11)),
                  padding: EdgeInsets.zero,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  visualDensity: VisualDensity.compact,
                );
              }).toList(),
            ),
          ],
          // ⚠️ 模型覆盖只给**原生叶区** —— 路由负载（lobe_models）按原生
          // 叶区名下发；prompt agent 不给一个静默无效的选项。
          // 目录读不到 ⇒ **说出来**（下拉只剩「跟随全局 / 本地」时，
          // 用户得知道是「读不到」而不是「真的没有云供应商」）。
          if (agent.isNativeLobe) ...[
            const SizedBox(height: 4),
            if (optionsAsync.hasError)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  l10n.encephalonModelOptionsUnavailable,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            // 与能力 tab 首卡的叶区段同一行组件（同一份状态、同一条
            // 下发链 `applyLobeOverride`）。
            LobeModelOverrideRow(lobe: agent.id),
          ],
        ],
      ),
    );
  }
}
