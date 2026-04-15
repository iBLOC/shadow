import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/prefrontal_client.dart';
import '../widgets/empty_state.dart';

final mcpNotifierProvider = StateNotifierProvider<MCPNotifier, MCPState>((ref) {
  return MCPNotifier(ref.watch(prefrontalClientProvider));
});

class MCPState {
  final List<MCPServerInfo> servers;
  final bool isLoading;
  final String? error;

  const MCPState({this.servers = const [], this.isLoading = false, this.error});

  MCPState copyWith({
    List<MCPServerInfo>? servers,
    bool? isLoading,
    String? error,
  }) {
    return MCPState(
      servers: servers ?? this.servers,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class MCPServerInfo {
  final String name;
  final String command;
  final List<String> args;
  final Map<String, String> env;
  final bool enabled;
  final bool isRunning;

  MCPServerInfo({
    required this.name,
    required this.command,
    this.args = const [],
    this.env = const {},
    this.enabled = false,
    this.isRunning = false,
  });

  factory MCPServerInfo.fromJson(Map<String, dynamic> json) {
    return MCPServerInfo(
      name: json['name'] ?? '',
      command: json['command'] ?? '',
      args: List<String>.from(json['args'] ?? []),
      env: Map<String, String>.from(json['env'] ?? {}),
      enabled: json['enabled'] ?? false,
      isRunning: json['is_running'] ?? false,
    );
  }
}

class MCPNotifier extends StateNotifier<MCPState> {
  final PrefrontalClient _client;

  MCPNotifier(this._client) : super(const MCPState()) {
    loadServers();
  }

  Future<void> loadServers() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final servers = await _client.getMCPServers();
      state = state.copyWith(
        servers: servers
            .map(
              (s) => MCPServerInfo.fromJson({
                'name': s.name,
                'command': s.command,
                'args': s.args,
                'env': s.env,
                'enabled': s.enabled,
                'is_running': false,
              }),
            )
            .toList(),
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> addServer(String name, String command, List<String> args) async {
    try {
      await _client.addMCPServer(
        AddMCPServerRequest(name: name, command: command, args: args, env: {}),
      );
      await loadServers();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> deleteServer(String name) async {
    try {
      await _client.deleteMCPServer(name);
      await loadServers();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> toggleServer(String name) async {
    final server = state.servers.firstWhere((s) => s.name == name);
    final newEnabled = !server.enabled;
    try {
      final servers = await _client.toggleMCPServer(name, newEnabled);
      state = state.copyWith(
        servers: servers
            .map(
              (s) => MCPServerInfo.fromJson({
                'name': s.name,
                'command': s.command,
                'args': s.args,
                'env': s.env,
                'enabled': s.enabled,
              }),
            )
            .toList(),
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }
}

class MCPScreen extends ConsumerWidget {
  const MCPScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mcpState = ref.watch(mcpNotifierProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('MCP 服务管理'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () =>
                ref.read(mcpNotifierProvider.notifier).loadServers(),
          ),
        ],
      ),
      body: mcpState.isLoading
          ? const Center(child: CircularProgressIndicator())
          : mcpState.servers.isEmpty
          ? _buildEmptyState(context, ref)
          : _buildServerList(context, ref, mcpState),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showAddDialog(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('添加服务器'),
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context, WidgetRef ref) {
    return EmptyState(
      icon: Icons.dns_outlined,
      title: '暂无 MCP 服务器',
      description: '点击右下角添加服务器',
    );
  }

  Widget _buildServerList(BuildContext context, WidgetRef ref, MCPState state) {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: state.servers.length,
      itemBuilder: (context, index) {
        final server = state.servers[index];
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: _ServerCard(server: server),
        );
      },
    );
  }

  void _showAddDialog(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (context) => _AddServerDialog(
        onAdd: (name, command, args) {
          ref.read(mcpNotifierProvider.notifier).addServer(name, command, args);
        },
      ),
    );
  }
}

class _ServerCard extends ConsumerWidget {
  final MCPServerInfo server;

  const _ServerCard({required this.server});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Card(
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: server.isRunning ? Colors.green : Colors.grey,
          child: const Icon(Icons.dns, color: Colors.white, size: 20),
        ),
        title: Text(server.name),
        subtitle: Text(
          '${server.command} ${server.args.join(' ')}',
          style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: Icon(
                server.isRunning ? Icons.stop : Icons.play_arrow,
                color: server.isRunning ? Colors.red : Colors.green,
              ),
              onPressed: () {
                ref
                    .read(mcpNotifierProvider.notifier)
                    .toggleServer(server.name);
              },
            ),
            IconButton(
              icon: const Icon(Icons.delete, color: Colors.red),
              onPressed: () => _confirmDelete(context, ref),
            ),
          ],
        ),
      ),
    );
  }

  void _confirmDelete(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('确认删除'),
        content: Text('确定要删除 ${server.name} 吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () {
              ref.read(mcpNotifierProvider.notifier).deleteServer(server.name);
              Navigator.pop(context);
            },
            child: const Text('删除', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }
}

class _AddServerDialog extends StatefulWidget {
  final Function(String name, String command, List<String> args) onAdd;

  const _AddServerDialog({required this.onAdd});

  @override
  State<_AddServerDialog> createState() => _AddServerDialogState();
}

class _AddServerDialogState extends State<_AddServerDialog> {
  final _nameController = TextEditingController();
  final _commandController = TextEditingController();
  final _argsController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    _commandController.dispose();
    _argsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('添加 MCP 服务器'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: '名称',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _commandController,
              decoration: const InputDecoration(
                labelText: '命令',
                border: OutlineInputBorder(),
                hintText: 'npx',
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _argsController,
              decoration: const InputDecoration(
                labelText: '参数 (逗号分隔)',
                border: OutlineInputBorder(),
                hintText: '-y, @modelcontextprotocol/server-filesystem',
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('取消'),
        ),
        FilledButton(
          onPressed: () {
            if (_nameController.text.isNotEmpty &&
                _commandController.text.isNotEmpty) {
              final args = _argsController.text
                  .split(',')
                  .map((e) => e.trim())
                  .where((e) => e.isNotEmpty)
                  .toList();
              widget.onAdd(_nameController.text, _commandController.text, args);
              Navigator.pop(context);
            }
          },
          child: const Text('添加'),
        ),
      ],
    );
  }
}
