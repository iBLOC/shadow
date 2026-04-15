import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/prefrontal_client.dart';
import '../widgets/glass_card.dart';
import '../widgets/empty_state.dart';
import '../theme/app_colors.dart';

final agentsNotifierProvider =
    StateNotifierProvider<AgentsNotifier, AgentsState>((ref) {
      return AgentsNotifier(ref.watch(prefrontalClientProvider));
    });

class AgentsState {
  final List<AgentInfo> agents;
  final bool isLoading;
  final String? error;

  const AgentsState({
    this.agents = const [],
    this.isLoading = false,
    this.error,
  });

  AgentsState copyWith({
    List<AgentInfo>? agents,
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

class AgentInfo {
  final String id;
  final String name;
  final String? description;
  final String model;
  final List<String> skills;
  final bool isOnline;

  AgentInfo({
    required this.id,
    required this.name,
    this.description,
    required this.model,
    this.skills = const [],
    this.isOnline = false,
  });

  factory AgentInfo.fromJson(Map<String, dynamic> json) {
    return AgentInfo(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      description: json['description'],
      model: json['model'] ?? '',
      skills: json['skills'] != null ? List<String>.from(json['skills']) : [],
      isOnline: json['is_online'] ?? false,
    );
  }
}

class AgentsNotifier extends StateNotifier<AgentsState> {
  final PrefrontalClient _client;

  AgentsNotifier(this._client) : super(const AgentsState()) {
    loadAgents();
  }

  Future<void> loadAgents() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final agents = await _client.getAgents();
      state = state.copyWith(
        agents: agents
            .map(
              (a) => AgentInfo.fromJson({
                'id': a.id,
                'name': a.name,
                'description': a.description,
                'model': a.model,
                'skills': a.skills != null ? a.skills!.split(',') : [],
                'is_online': false,
              }),
            )
            .toList(),
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }
}

class AgentsScreen extends ConsumerWidget {
  const AgentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final agentsState = ref.watch(agentsNotifierProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Agent 管理'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () =>
                ref.read(agentsNotifierProvider.notifier).loadAgents(),
          ),
        ],
      ),
      body: agentsState.isLoading
          ? const Center(child: CircularProgressIndicator())
          : agentsState.agents.isEmpty
          ? EmptyState(
              icon: Icons.psychology_outlined,
              title: '暂无 Agent',
            )
          : _buildAgentList(context, agentsState.agents),
    );
  }

  Widget _buildAgentList(BuildContext context, List<AgentInfo> agents) {
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

class _AgentCard extends StatelessWidget {
  final AgentInfo agent;

  const _AgentCard({required this.agent});

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                backgroundColor: agent.isOnline ? AppColors.success : AppColors.darkTextSecondary,
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
                    Text(
                      agent.name,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    if (agent.description != null)
                      Text(
                        agent.description!,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: agent.isOnline ? AppColors.success : AppColors.darkTextSecondary,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  agent.isOnline ? '在线' : '离线',
                  style: const TextStyle(color: Colors.white, fontSize: 12),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Icon(
                Icons.model_training,
                size: 16,
                color: AppColors.primary,
              ),
              const SizedBox(width: 4),
              Text(
                agent.model,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton.icon(
                onPressed: agent.isOnline ? null : () {},
                icon: const Icon(Icons.play_arrow),
                label: Text(agent.isOnline ? '运行中' : '启动'),
              ),
              const SizedBox(width: 8),
              TextButton.icon(
                onPressed: agent.isOnline ? () {} : null,
                icon: const Icon(Icons.stop),
                label: const Text('停止'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
