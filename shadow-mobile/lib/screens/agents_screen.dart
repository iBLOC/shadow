import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../generated/l10n/app_localizations.dart';
import '../services/database/database_helper.dart';
import '../services/database/repository_factory.dart';
import '../services/database/repositories.dart';
import '../services/database/agent_settings.dart';
import '../services/prefrontal_client.dart';
import '../widgets/glass_card.dart';
import '../widgets/empty_state.dart';
import '../theme/app_colors.dart';
import 'soul_screen.dart';

final agentRepositoryProvider = Provider<IAgentRepository>((ref) {
  final client = ref.watch(prefrontalClientProvider);
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

  Future<void> toggleAgent(String id) async {
    await _repository.toggleAgent(id);
    await loadAgents();
  }

  Future<void> updateAgentSettings(
    String id,
    Map<String, dynamic> settings,
  ) async {
    final agent = state.agents.firstWhere((a) => a.id == id);
    final updated = agent.copyWith(settings: settings);
    await _repository.update(updated);
    await loadAgents();
  }
}

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
              Switch(
                value: agent.isEnabled,
                onChanged: (value) {
                  ref.read(agentsProvider.notifier).toggleAgent(agent.id);
                },
                activeThumbColor: AppColors.primary,
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
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              if (agent.id == 'main-agent' || agent.id == 'chat')
                TextButton.icon(
                  onPressed: () => _showSoulSettings(context),
                  icon: const Icon(Icons.person),
                  label: const Text('Soul'),
                ),
              TextButton.icon(
                onPressed: () => _showSettingsDialog(context, ref),
                icon: const Icon(Icons.settings),
                label: const Text('Settings'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSettingsRow(
    BuildContext context,
    Map<String, dynamic> settings,
  ) {
    return Wrap(
      spacing: 8,
      runSpacing: 4,
      children: settings.entries.map((entry) {
        return Chip(
          label: Text('${entry.key}: ${entry.value}'),
          backgroundColor: AppColors.primary.withValues(alpha: 0.1),
          labelStyle: TextStyle(color: AppColors.primary, fontSize: 12),
        );
      }).toList(),
    );
  }

  void _showSettingsDialog(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (context) => _AgentSettingsDialog(agent: agent),
    );
  }

  void _showSoulSettings(BuildContext context) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const SoulScreen()),
    );
  }
}

class _AgentSettingsDialog extends ConsumerStatefulWidget {
  final AgentSettings agent;

  const _AgentSettingsDialog({required this.agent});

  @override
  ConsumerState<_AgentSettingsDialog> createState() =>
      _AgentSettingsDialogState();
}

class _AgentSettingsDialogState extends ConsumerState<_AgentSettingsDialog> {
  late Map<String, dynamic> _settings;
  bool _isEnabled = true;

  @override
  void initState() {
    super.initState();
    _settings = Map.from(widget.agent.settings ?? {});
    _isEnabled = widget.agent.isEnabled;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return AlertDialog(
      title: Text(widget.agent.name),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SwitchListTile(
              title: const Text('Enabled'),
              value: _isEnabled,
              onChanged: (value) {
                setState(() {
                  _isEnabled = value;
                });
              },
            ),
            const Divider(),
            const Text('Settings:'),
            const SizedBox(height: 8),
            ..._settings.entries.map((entry) {
              return ListTile(
                title: Text(entry.key),
                trailing: Text(
                  entry.value.toString(),
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              );
            }),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: () {
            widget.agent.settings;
            ref
                .read(agentsProvider.notifier)
                .updateAgentSettings(widget.agent.id, _settings);
            Navigator.of(context).pop();
          },
          child: const Text('Save'),
        ),
      ],
    );
  }
}
