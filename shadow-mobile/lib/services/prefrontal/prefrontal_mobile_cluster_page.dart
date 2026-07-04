import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
    final state = ref.watch(prefrontalMobileProvider);
    final notifier = ref.read(prefrontalMobileProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Prefrontal 嵌入式运行时 (NDK)'),
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
            _buildStatusCard(context, state, notifier),

            const SizedBox(height: 16),

            // 智能体管理
            _buildAgentCard(context, state, notifier),

            const SizedBox(height: 16),

            // 调用智能体
            _buildInvokeCard(context, state, notifier),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusCard(
    BuildContext context,
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
                        '嵌入式运行时',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _statusText(state.status),
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (state.port != null) ...[
              const SizedBox(height: 8),
              Text('端口: ${state.port}'),
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
                  '错误: ${state.errorMessage}',
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
                    label: const Text('启动'),
                    onPressed: state.status == PrefrontalMobileStatus.stopped
                        ? () => _startService(context, notifier)
                        : null,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ElevatedButton.icon(
                    icon: const Icon(Icons.stop),
                    label: const Text('停止'),
                    onPressed: isRunning
                        ? () => _stopService(context, notifier)
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
                  '智能体 (${state.agents.length})',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                TextButton.icon(
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('刷新'),
                  onPressed: isRunning ? () => notifier.refreshAgents() : null,
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (!isRunning)
              Container(
                padding: const EdgeInsets.all(16),
                child: Text(
                  '请先启动服务',
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
                      '暂无智能体, 添加一个吧:',
                      style: TextStyle(color: Colors.grey[600]),
                    ),
                    const SizedBox(height: 12),
                    ElevatedButton.icon(
                      icon: const Icon(Icons.add),
                      label: const Text('添加示例智能体'),
                      onPressed: () => _addSampleAgent(context, notifier),
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
                        ? const Chip(
                            label: Text('Running'),
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
              '调用智能体 (JNI)',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _inputController,
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                labelText: '输入',
                hintText: '输入要发送给智能体的内容...',
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
              label: const Text('调用 (JNI)'),
              onPressed: isRunning && hasAgents && !_isInvoking
                  ? () => _invokeAgent(context, notifier)
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

  String _statusText(PrefrontalMobileStatus status) {
    switch (status) {
      case PrefrontalMobileStatus.stopped:
        return '已停止';
      case PrefrontalMobileStatus.starting:
        return '启动中...';
      case PrefrontalMobileStatus.running:
        return '运行中';
      case PrefrontalMobileStatus.stopping:
        return '停止中...';
      case PrefrontalMobileStatus.error:
        return '错误';
    }
  }

  void _showInfoDialog(BuildContext context, PrefrontalMobileState state) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('关于 NDK 嵌入方式'),
        content: const SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('• Prefrontal 作为 .so 嵌入在 App 进程内'),
              SizedBox(height: 4),
              Text('• 通过 JNI 与 Kotlin Service 通信'),
              SizedBox(height: 4),
              Text('• 通过 localhost HTTP 与 Prefrontal 通信'),
              SizedBox(height: 4),
              Text('• 服务生命周期与 App 绑定'),
              SizedBox(height: 4),
              Text('• 不需要外部进程, 不会被杀'),
              SizedBox(height: 8),
              Text('架构:', style: TextStyle(fontWeight: FontWeight.bold)),
              Text('Flutter → MethodChannel → JNI → .so'),
              Text('       ↓ HTTP (localhost)'),
              Text('       mini HTTP server (axum)'),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('关闭'),
          ),
        ],
      ),
    );
  }

  Future<void> _startService(
    BuildContext context,
    PrefrontalMobileNotifier notifier,
  ) async {
    try {
      final success = await notifier.start();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(success ? '嵌入式运行时启动成功' : '启动失败'),
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
            content: Text('启动异常: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _stopService(
    BuildContext context,
    PrefrontalMobileNotifier notifier,
  ) async {
    try {
      final success = await notifier.stop();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(success ? '嵌入式运行时已停止' : '停止失败'),
            backgroundColor: success ? Colors.green : Colors.red,
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('停止异常: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _addSampleAgent(
    BuildContext context,
    PrefrontalMobileNotifier notifier,
  ) async {
    try {
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final success = await notifier.registerAgent(
        agentId: 'sample-agent-$timestamp',
        name: '示例智能体',
        description: '通过 JNI 注册的示例智能体',
      );
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(success ? '添加成功' : '添加失败'),
            backgroundColor: success ? Colors.green : Colors.red,
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('添加异常: $e')),
        );
      }
    }
  }

  Future<void> _invokeAgent(
    BuildContext context,
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
          _output = result ?? '(无输出)';
          _isInvoking = false;
        });

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(result != null ? 'JNI 调用成功' : '调用失败'),
            backgroundColor: result != null ? Colors.green : Colors.red,
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        setState(() {
          _isInvoking = false;
          _output = '错误: $e';
        });

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('调用异常: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
}
