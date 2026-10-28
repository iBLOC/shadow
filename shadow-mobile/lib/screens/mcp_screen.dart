import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/database/database_helper.dart';
import '../services/database/repository_factory.dart';
import '../services/database/repositories.dart';
import '../services/database/mcp_server.dart';
import '../widgets/glass_card.dart';
import '../widgets/empty_state.dart';
import '../theme/app_colors.dart';
import '../generated/l10n/app_localizations.dart';

final mcpServerRepositoryProvider = Provider<IMCPServerRepository>((ref) {
  return RepositoryFactory.createMCPServerRepository();
});

final mcpNotifierProvider = StateNotifierProvider<MCPNotifier, MCPState>((ref) {
  return MCPNotifier(ref.watch(mcpServerRepositoryProvider));
});

class MCPState {
  final List<MCPServer> servers;
  final bool isLoading;
  final String? error;

  const MCPState({this.servers = const [], this.isLoading = false, this.error});

  MCPState copyWith({
    List<MCPServer>? servers,
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

class MCPNotifier extends StateNotifier<MCPState> {
  final IMCPServerRepository _repository;

  MCPNotifier(this._repository) : super(const MCPState()) {
    _init();
  }

  Future<void> _init() async {
    await DatabaseHelper.instance.database;
    await _repository.initializeDefaultServers();
    await loadServers();
  }

  Future<void> loadServers() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final servers = await _repository.getAll();
      state = state.copyWith(servers: servers, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> addServer(String name, String url, String? authToken) async {
    try {
      final server = MCPServer(
        id: 'mcp_${DateTime.now().millisecondsSinceEpoch}',
        name: name,
        url: url,
        authToken: authToken,
        isEnabled: true,
      );
      await _repository.insert(server);
      await loadServers();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> deleteServer(String id) async {
    try {
      await _repository.delete(id);
      await loadServers();
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> toggleServer(String id) async {
    try {
      await _repository.toggleServer(id);
      await loadServers();
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
        title: Text(AppLocalizations.of(context)!.mcpTitle),
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
          ? _buildEmptyState(context)
          : _buildServerList(context, ref, mcpState),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showAddDialog(context, ref),
        icon: const Icon(Icons.add),
        label: Text(AppLocalizations.of(context)!.mcpAddServer),
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    return EmptyState(
      icon: Icons.dns_outlined,
      title: AppLocalizations.of(context)!.mcpEmpty,
      description: AppLocalizations.of(context)!.mcpEmptyHint,
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
        onAdd: (name, url, token) {
          ref.read(mcpNotifierProvider.notifier).addServer(name, url, token);
        },
      ),
    );
  }
}

class _ServerCard extends ConsumerWidget {
  final MCPServer server;

  const _ServerCard({required this.server});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                backgroundColor: server.isEnabled
                    ? AppColors.success.withValues(alpha: 0.2)
                    : AppColors.darkTextSecondary.withValues(alpha: 0.2),
                child: Icon(
                  Icons.dns,
                  color: server.isEnabled
                      ? AppColors.success
                      : AppColors.darkTextSecondary,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      server.name,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      server.url,
                      style: Theme.of(
                        context,
                      ).textTheme.bodySmall?.copyWith(fontFamily: 'monospace'),
                    ),
                  ],
                ),
              ),
              Switch(
                value: server.isEnabled,
                onChanged: (value) {
                  ref
                      .read(mcpNotifierProvider.notifier)
                      .toggleServer(server.id);
                },
                activeThumbColor: AppColors.primary,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton.icon(
                icon: const Icon(Icons.delete, color: Colors.red, size: 18),
                label: Text(AppLocalizations.of(context)!.commonDelete, style: TextStyle(color: Colors.red)),
                onPressed: () => _confirmDelete(context, ref),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _confirmDelete(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(AppLocalizations.of(context)!.commonConfirmDelete),
        content: Text(AppLocalizations.of(context)!.commonDeleteConfirmNamed(server.name)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(AppLocalizations.of(context)!.cancel),
          ),
          TextButton(
            onPressed: () {
              ref.read(mcpNotifierProvider.notifier).deleteServer(server.id);
              Navigator.pop(context);
            },
            child: Text(AppLocalizations.of(context)!.commonDelete, style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }
}

class _AddServerDialog extends StatefulWidget {
  final Function(String name, String url, String? authToken) onAdd;

  const _AddServerDialog({required this.onAdd});

  @override
  State<_AddServerDialog> createState() => _AddServerDialogState();
}

class _AddServerDialogState extends State<_AddServerDialog> {
  final _nameController = TextEditingController();
  final _urlController = TextEditingController();
  final _tokenController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    _urlController.dispose();
    _tokenController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(AppLocalizations.of(context)!.mcpAddServerTitle),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _nameController,
              decoration: InputDecoration(
                labelText: AppLocalizations.of(context)!.commonName,
                border: OutlineInputBorder(),
                hintText: 'My MCP Server',
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _urlController,
              decoration: InputDecoration(
                labelText: AppLocalizations.of(context)!.mcpServerUrl,
                border: OutlineInputBorder(),
                hintText: 'http://localhost:3000',
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _tokenController,
              decoration: InputDecoration(
                labelText: AppLocalizations.of(context)!.mcpAuthTokenOptional,
                border: OutlineInputBorder(),
                hintText: 'Bearer token',
              ),
              obscureText: true,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(AppLocalizations.of(context)!.cancel),
        ),
        FilledButton(
          onPressed: () {
            if (_nameController.text.isNotEmpty &&
                _urlController.text.isNotEmpty) {
              widget.onAdd(
                _nameController.text,
                _urlController.text,
                _tokenController.text.isEmpty ? null : _tokenController.text,
              );
              Navigator.pop(context);
            }
          },
          child: Text(AppLocalizations.of(context)!.commonAdd),
        ),
      ],
    );
  }
}
