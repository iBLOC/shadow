import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../generated/l10n/app_localizations.dart';
import '../l10n/current_l10n.dart';

/// Resonance实例状态
enum ResonanceStatus {
  disconnected,
  connecting,
  connected,
  error,
}

/// Resonance实例
class ResonanceInstance {
  final String id;
  final String name;
  final String host;
  final ResonanceStatus status;
  final String? apiKey;
  final int? latency;
  final List<String> exposedAgents;

  const ResonanceInstance({
    required this.id,
    required this.name,
    required this.host,
    this.status = ResonanceStatus.disconnected,
    this.apiKey,
    this.latency,
    this.exposedAgents = const [],
  });

  ResonanceInstance copyWith({
    String? name,
    String? host,
    ResonanceStatus? status,
    String? apiKey,
    int? latency,
    List<String>? exposedAgents,
  }) {
    return ResonanceInstance(
      id: id,
      name: name ?? this.name,
      host: host ?? this.host,
      status: status ?? this.status,
      apiKey: apiKey ?? this.apiKey,
      latency: latency ?? this.latency,
      exposedAgents: exposedAgents ?? this.exposedAgents,
    );
  }

  /// 状态标签的本地化文案。
  ///
  /// 原来是 `statusLabel` getter —— 但 model 上拿不到 BuildContext，
  /// 所以改成由调用方把文案传进来。
  String statusLabelOf(AppLocalizations l10n) {
    switch (status) {
      case ResonanceStatus.disconnected:
        return l10n.resonanceNotConnected;
      case ResonanceStatus.connecting:
        return l10n.resonanceConnecting;
      case ResonanceStatus.connected:
        return l10n.resonanceConnected;
      case ResonanceStatus.error:
        return l10n.resonanceError;
    }
  }

  Color get statusColor {
    switch (status) {
      case ResonanceStatus.disconnected:
        return Colors.grey;
      case ResonanceStatus.connecting:
        return Colors.orange;
      case ResonanceStatus.connected:
        return Colors.green;
      case ResonanceStatus.error:
        return Colors.red;
    }
  }
}

/// Resonance状态
class ResonanceState {
  final List<ResonanceInstance> instances;
  final String? primaryId;

  const ResonanceState({
    this.instances = const [],
    this.primaryId,
  });

  ResonanceState copyWith({
    List<ResonanceInstance>? instances,
    String? primaryId,
    bool clearPrimary = false,
  }) {
    return ResonanceState(
      instances: instances ?? this.instances,
      primaryId: clearPrimary ? null : (primaryId ?? this.primaryId),
    );
  }

  ResonanceInstance? get primaryInstance {
    if (primaryId == null) return null;
    try {
      return instances.firstWhere((i) => i.id == primaryId);
    } catch (_) {
      return null;
    }
  }
}

/// Resonance状态管理
class ResonanceNotifier extends StateNotifier<ResonanceState> {
  ResonanceNotifier() : super(const ResonanceState()) {
    _init();
  }

  void _init() {
    // 添加示例实例
    addInstance(ResonanceInstance(
      id: '1',
      name: currentL10n().resonanceLocal,
      host: 'localhost:8080',
    ));
  }

  void addInstance(ResonanceInstance instance) {
    state = state.copyWith(
      instances: [...state.instances, instance],
    );
  }

  void updateInstance(String id, ResonanceInstance updated) {
    state = state.copyWith(
      instances: state.instances.map((i) => i.id == id ? updated : i).toList(),
    );
  }

  void removeInstance(String id) {
    state = state.copyWith(
      instances: state.instances.where((i) => i.id != id).toList(),
      clearPrimary: state.primaryId == id,
    );
  }

  void setPrimary(String? id) {
    state = state.copyWith(primaryId: id, clearPrimary: id == null);
  }

  Future<void> testConnection(String id) async {
    final instance = state.instances.firstWhere((i) => i.id == id);
    updateInstance(id, instance.copyWith(status: ResonanceStatus.connecting));

    // 模拟连接测试
    await Future.delayed(const Duration(seconds: 2));
    
    // 假设连接成功
    updateInstance(id, instance.copyWith(
      status: ResonanceStatus.connected,
      latency: 45,
    ));
  }
}

/// Resonance状态Provider
final resonanceProvider = StateNotifierProvider<ResonanceNotifier, ResonanceState>((ref) {
  return ResonanceNotifier();
});

/// Resonance页面
class ResonancePage extends ConsumerStatefulWidget {
  const ResonancePage({super.key});

  @override
  ConsumerState<ResonancePage> createState() => _ResonancePageState();
}

class _ResonancePageState extends ConsumerState<ResonancePage> {
  @override
  Widget build(BuildContext context) {
    final resonanceState = ref.watch(resonanceProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(AppLocalizations.of(context)!.resonanceTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => _showAddDialog(context),
          ),
        ],
      ),
      body: resonanceState.instances.isEmpty
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.cloud_off,
                    size: 64,
                    color: Colors.grey.shade400,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    AppLocalizations.of(context)!.resonanceEmpty,
                    style: TextStyle(
                      fontSize: 16,
                      color: Colors.grey.shade600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  ElevatedButton.icon(
                    onPressed: () => _showAddDialog(context),
                    icon: const Icon(Icons.add),
                    label: Text(AppLocalizations.of(context)!.resonanceAddInstance),
                  ),
                ],
              ),
            )
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: resonanceState.instances.length,
              itemBuilder: (context, index) {
                final instance = resonanceState.instances[index];
                final isPrimary = resonanceState.primaryId == instance.id;
                return _InstanceCard(
                  instance: instance,
                  isPrimary: isPrimary,
                  onSetPrimary: () {
                    ref.read(resonanceProvider.notifier).setPrimary(instance.id);
                  },
                  onTest: () {
                    ref.read(resonanceProvider.notifier).testConnection(instance.id);
                  },
                  onEdit: () => _showEditDialog(context, instance),
                  onDelete: () {
                    ref.read(resonanceProvider.notifier).removeInstance(instance.id);
                  },
                );
              },
            ),
    );
  }

  void _showAddDialog(BuildContext context) {
    final nameController = TextEditingController();
    final hostController = TextEditingController();
    final apiKeyController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(AppLocalizations.of(context)!.resonanceAddTitle),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              decoration: InputDecoration(
                labelText: AppLocalizations.of(context)!.resonanceInstanceName,
                hintText: 'My Resonance',
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: hostController,
              decoration: InputDecoration(
                labelText: AppLocalizations.of(context)!.commonHostAddress,
                hintText: 'resonance.example.com:8080',
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: apiKeyController,
              decoration: InputDecoration(
                labelText: AppLocalizations.of(context)!.resonanceApiKeyOptional,
                hintText: 'sk-...',
              ),
              obscureText: true,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(AppLocalizations.of(context)!.cancel),
          ),
          ElevatedButton(
            onPressed: () {
              final name = nameController.text.trim();
              final host = hostController.text.trim();
              final apiKey = apiKeyController.text.trim();

              if (name.isNotEmpty && host.isNotEmpty) {
                ref.read(resonanceProvider.notifier).addInstance(
                  ResonanceInstance(
                    id: DateTime.now().millisecondsSinceEpoch.toString(),
                    name: name,
                    host: host,
                    apiKey: apiKey.isNotEmpty ? apiKey : null,
                  ),
                );
                Navigator.of(context).pop();
              }
            },
            child: Text(AppLocalizations.of(context)!.commonAdd),
          ),
        ],
      ),
    );
  }

  void _showEditDialog(BuildContext context, ResonanceInstance instance) {
    final nameController = TextEditingController(text: instance.name);
    final hostController = TextEditingController(text: instance.host);
    final apiKeyController = TextEditingController(text: instance.apiKey);

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(AppLocalizations.of(context)!.resonanceEditTitle),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              decoration: InputDecoration(
                labelText: AppLocalizations.of(context)!.resonanceInstanceName,
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: hostController,
              decoration: InputDecoration(
                labelText: AppLocalizations.of(context)!.commonHostAddress,
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: apiKeyController,
              decoration: InputDecoration(
                labelText: AppLocalizations.of(context)!.resonanceApiKeyOptional,
              ),
              obscureText: true,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(AppLocalizations.of(context)!.cancel),
          ),
          ElevatedButton(
            onPressed: () {
              final name = nameController.text.trim();
              final host = hostController.text.trim();
              final apiKey = apiKeyController.text.trim();

              if (name.isNotEmpty && host.isNotEmpty) {
                ref.read(resonanceProvider.notifier).updateInstance(
                  instance.id,
                  instance.copyWith(
                    name: name,
                    host: host,
                    apiKey: apiKey.isNotEmpty ? apiKey : null,
                  ),
                );
                Navigator.of(context).pop();
              }
            },
            child: Text(AppLocalizations.of(context)!.commonSave),
          ),
        ],
      ),
    );
  }
}

/// 实例卡片组件
class _InstanceCard extends StatelessWidget {
  final ResonanceInstance instance;
  final bool isPrimary;
  final VoidCallback onSetPrimary;
  final VoidCallback onTest;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const _InstanceCard({
    required this.instance,
    required this.isPrimary,
    required this.onSetPrimary,
    required this.onTest,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.cloud,
                  color: instance.statusColor,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            instance.name,
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                          if (isPrimary) ...[
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.blue.shade100,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                AppLocalizations.of(context)!.resonancePrimary,
                                style: TextStyle(
                                  fontSize: 10,
                                  color: Colors.blue.shade700,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        instance.host,
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade600,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ],
                  ),
                ),
                // 状态指示器
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: instance.statusColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: instance.statusColor.withOpacity(0.3)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: instance.statusColor,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        instance.statusLabelOf(AppLocalizations.of(context)!),
                        style: TextStyle(
                          fontSize: 12,
                          color: instance.statusColor,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (instance.latency != null) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(Icons.speed, size: 14, color: Colors.grey.shade500),
                  const SizedBox(width: 4),
                  Text(
                    AppLocalizations.of(context)!.resonanceLatency(instance.latency ?? 0),
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ],
              ),
            ],
            if (instance.exposedAgents.isNotEmpty) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                children: instance.exposedAgents.map((agent) {
                  return Chip(
                    label: Text(
                      agent,
                      style: const TextStyle(fontSize: 10),
                    ),
                    backgroundColor: Colors.green.shade50,
                    labelStyle: TextStyle(color: Colors.green.shade700),
                  );
                }).toList(),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (!isPrimary)
                  TextButton(
                    onPressed: onSetPrimary,
                    child: Text(AppLocalizations.of(context)!.resonanceSetPrimary),
                  ),
                TextButton(
                  onPressed: onTest,
                  child: Text(AppLocalizations.of(context)!.resonanceTestConnection),
                ),
                TextButton(
                  onPressed: onEdit,
                  child: Text(AppLocalizations.of(context)!.commonEdit),
                ),
                TextButton(
                  onPressed: onDelete,
                  style: TextButton.styleFrom(
                    foregroundColor: Colors.red,
                  ),
                  child: Text(AppLocalizations.of(context)!.commonDelete),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
