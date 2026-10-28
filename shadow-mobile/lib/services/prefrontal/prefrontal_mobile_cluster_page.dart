import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../generated/l10n/app_localizations.dart';
import 'prefrontal_mobile_provider.dart';
import 'prefrontal_mobile_service.dart';

/// Prefrontal 嵌入式运行时管理页面
///
/// 这个页面使用 MethodChannel 与 Android Service 通信，
/// 通过 JNI 调用 Prefrontal 嵌入式运行时。
///
/// 与外部进程方式不同，Prefrontal 作为 .so 嵌入在 App 进程内。
class PrefrontalMobilePage extends ConsumerStatefulWidget {
  const PrefrontalMobilePage({super.key});

  @override
  ConsumerState<PrefrontalMobilePage> createState() => _PrefrontalMobilePageState();
}

class _PrefrontalMobilePageState extends ConsumerState<PrefrontalMobilePage> {
  final _inputController = TextEditingController();
  String _output = '';
  bool _isInvoking = false;

  @override
  void dispose() {
    _inputController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final state = ref.watch(prefrontalMobileProvider);
    final notifier = ref.read(prefrontalMobileProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.prefrontalEmbeddedTitle),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        actions: [
          IconButton(
            icon: const Icon(Icons.info_outline),
            onPressed: () => _showInfoDialog(context, state),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => notifier.refreshAgents(),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // 服务状态卡片
            _buildStatusCard(context, l10n, state, notifier),

            const SizedBox(height: 16),

            // 智能体管理
            _buildAgentCard(context, l10n, state, notifier),

            const SizedBox(height: 16),

            // 调用智能体
            _buildInvokeCard(context, l10n, state, notifier),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusCard(
    BuildContext context,
    AppLocalizations l10n,
    PrefrontalMobileState state,
    PrefrontalMobileNotifier notifier,
  ) {
    final isRunning = state.status == PrefrontalMobileStatus.running;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  isRunning ? Icons.check_circle : Icons.error,
                  color: isRunning ? Colors.green : Colors.red,
                  size: 32,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l10n.prefrontalEmbeddedRuntime,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _statusText(l10n, state.status),
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (state.port != null) ...[
              const SizedBox(height: 8),
              Text(l10n.prefrontalPort(state.port!)),
              Text('baseUrl: http://127.0.0.1:${state.port}'),
            ],
            if (state.errorMessage != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.red[50],
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  l10n.prefrontalErrorPrefix(state.errorMessage!),
                  style: const TextStyle(color: Colors.red, fontSize: 12),
                ),
              ),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    icon: const Icon(Icons.play_arrow),
                    label: Text(l10n.prefrontalStart),
                    onPressed: state.status == PrefrontalMobileStatus.stopped
                        ? () => _startService(context, l10n, notifier)
                        : null,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ElevatedButton.icon(
                    icon: const Icon(Icons.stop),
                    label: Text(l10n.prefrontalStop),
                    onPressed: isRunning
                        ? () => _stopService(context, l10n, notifier)
                        : null,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAgentCard(
    BuildContext context,
    AppLocalizations l10n,
    PrefrontalMobileState state,
    PrefrontalMobileNotifier notifier,
  ) {
    final isRunning = state.status == PrefrontalMobileStatus.running;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  l10n.prefrontalAgentsCount(state.agents.length),
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                TextButton.icon(
                  icon: const Icon(Icons.refresh, size: 18),
                  label: Text(l10n.prefrontalRefresh),
                  onPressed: isRunning ? () => notifier.refreshAgents() : null,
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (!isRunning)
              Container(
                padding: const EdgeInsets.all(16),
                child: Text(
                  l10n.prefrontalStartFirst,
                  style: TextStyle(color: Colors.grey[600]),
                  textAlign: TextAlign.center,
                ),
              )
            else if (state.agents.isEmpty)
              Container(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Text(
                      l10n.prefrontalNoAgentsHint,
                      style: TextStyle(color: Colors.grey[600]),
                    ),
                    const SizedBox(height: 12),
                    ElevatedButton.icon(
                      icon: const Icon(Icons.add),
                      label: Text(l10n.prefrontalAddSampleAgent),
                      onPressed: () => _addSampleAgent(context, l10n, notifier),
                    ),
                  ],
                ),
              )
            else
              ...state.agents.map((agent) => ListTile(
                    leading: CircleAvatar(
                      child: Text(agent.name.isNotEmpty ? agent.name[0] : '?'),
                    ),
                    title: Text(agent.name),
                    subtitle: Text(agent.description),
                    trailing: agent.isRunning
                        ? Chip(
                            label: Text(l10n.prefrontalStatusRunning),
                            backgroundColor: Colors.green,
                          )
                        : null,
                  )),
          ],
        ),
      ),
    );
  }

  Widget _buildInvokeCard(
    BuildContext context,
    AppLocalizations l10n,
    PrefrontalMobileState state,
    PrefrontalMobileNotifier notifier,
  ) {
    final isRunning = state.status == PrefrontalMobileStatus.running;
    final hasAgents = state.agents.isNotEmpty;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              l10n.prefrontalInvokeTitle,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _inputController,
              decoration: InputDecoration(
                border: OutlineInputBorder(),
                labelText: l10n.prefrontalInput,
                hintText: l10n.prefrontalInputHint,
              ),
              maxLines: 3,
              enabled: isRunning && hasAgents,
            ),
            const SizedBox(height: 8),
            ElevatedButton.icon(
              icon: _isInvoking
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.send),
              label: Text(l10n.prefrontalInvoke),
              onPressed: isRunning && hasAgents && !_isInvoking
                  ? () => _invokeAgent(context, l10n, notifier)
                  : null,
            ),
            if (_output.isNotEmpty) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.blue[50],
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.blue[200]!),
                ),
                child: Text(_output),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _statusText(AppLocalizations l10n, PrefrontalMobileStatus status) {
    switch (status) {
      case PrefrontalMobileStatus.stopped:
        return l10n.prefrontalStatusStopped;
      case PrefrontalMobileStatus.starting:
        return l10n.prefrontalStatusStarting;
      case PrefrontalMobileStatus.running:
        return l10n.prefrontalStatusRunning;
      case PrefrontalMobileStatus.stopping:
        return l10n.prefrontalStatusStopping;
      case PrefrontalMobileStatus.error:
        return l10n.prefrontalStatusError;
    }
  }

  void _showInfoDialog(BuildContext context, PrefrontalMobileState state) {
    final l10n = AppLocalizations.of(context)!;
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.prefrontalAboutTitle),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(l10n.prefrontalAboutLine1),
              SizedBox(height: 4),
              Text(l10n.prefrontalAboutLine2),
              SizedBox(height: 4),
              Text(l10n.prefrontalAboutLine3),
              SizedBox(height: 4),
              Text(l10n.prefrontalAboutLine4),
              SizedBox(height: 4),
              Text(l10n.prefrontalAboutLine5),
              SizedBox(height: 8),
              Text(
                l10n.prefrontalAboutArchitecture,
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              Text('Flutter → MethodChannel → JNI → .so'),
              Text('       ↓ HTTP (localhost)'),
              Text('       mini HTTP server (axum)'),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(l10n.cameraClose),
          ),
        ],
      ),
    );
  }

  Future<void> _startService(
    BuildContext context,
    AppLocalizations l10n,
    PrefrontalMobileNotifier notifier,
  ) async {
    try {
      final success = await notifier.start();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(success ? l10n.prefrontalStartSuccess : l10n.prefrontalStartFailed),
            backgroundColor: success ? Colors.green : Colors.red,
          ),
        );
        if (success) {
          await notifier.refreshAgents();
        }
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.prefrontalStartError(e.toString())),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _stopService(
    BuildContext context,
    AppLocalizations l10n,
    PrefrontalMobileNotifier notifier,
  ) async {
    try {
      final success = await notifier.stop();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(success ? l10n.prefrontalStopSuccess : l10n.prefrontalStopFailed),
            backgroundColor: success ? Colors.green : Colors.red,
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.prefrontalStopError(e.toString())),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _addSampleAgent(
    BuildContext context,
    AppLocalizations l10n,
    PrefrontalMobileNotifier notifier,
  ) async {
    try {
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final success = await notifier.registerAgent(
        agentId: 'sample-agent-$timestamp',
        name: l10n.prefrontalSampleAgentName,
        description: l10n.prefrontalSampleAgentDesc,
      );
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(success ? l10n.prefrontalAddSuccess : l10n.prefrontalAddFailed),
            backgroundColor: success ? Colors.green : Colors.red,
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.prefrontalAddError(e.toString()))),
        );
      }
    }
  }

  Future<void> _invokeAgent(
    BuildContext context,
    AppLocalizations l10n,
    PrefrontalMobileNotifier notifier,
  ) async {
    final state = ref.read(prefrontalMobileProvider);
    if (state.agents.isEmpty) return;

    setState(() {
      _isInvoking = true;
      _output = '';
    });

    try {
      final result = await notifier.invokeAgent(
        agentId: state.agents.first.id,
        input: _inputController.text,
      );

      if (context.mounted) {
        setState(() {
          _output = result ?? l10n.prefrontalNoOutput;
          _isInvoking = false;
        });

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(result != null ? l10n.prefrontalInvokeSuccess : l10n.prefrontalInvokeFailed),
            backgroundColor: result != null ? Colors.green : Colors.red,
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        setState(() {
          _isInvoking = false;
          _output = l10n.prefrontalErrorPrefix(e.toString());
        });

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.prefrontalInvokeError(e.toString())),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}
