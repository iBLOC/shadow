import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'prefrontal_provider.dart';
import 'prefrontal_service.dart';

/// Prefrontal 集群管理页面
class PrefrontalClusterPage extends ConsumerStatefulWidget {
  const PrefrontalClusterPage({super.key});

  @override
  ConsumerState<PrefrontalClusterPage> createState() => _PrefrontalClusterPageState();
}

class _PrefrontalClusterPageState extends ConsumerState<PrefrontalClusterPage> {
  final _inputController = TextEditingController();
  String _output = '';
  bool _isLoading = false;

  @override
  void dispose() {
    _inputController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(prefrontalProvider);
    final notifier = ref.read(prefrontalProvider.notifier);
    final config = ref.watch(prefrontalConfigProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Prefrontal 集群管理'),
        actions: [
          IconButton(
            icon: Icon(
              state.status == PrefrontalStatus.running
                  ? Icons.check_circle
                  : Icons.error,
              color: state.status == PrefrontalStatus.running
                  ? Colors.green
                  : Colors.red,
            ),
            onPressed: () => _showStatusDialog(state),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // 服务控制
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '服务状态: ${_statusText(state.status)}',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '地址: ${config.host}:${config.port}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton.icon(
                            icon: const Icon(Icons.play_arrow),
                            label: const Text('启动服务'),
                            onPressed: state.status == PrefrontalStatus.stopped
                                ? () => _startService(notifier, config)
                                : null,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: ElevatedButton.icon(
                            icon: const Icon(Icons.stop),
                            label: const Text('停止服务'),
                            onPressed: state.status == PrefrontalStatus.running
                                ? () => _stopService(notifier)
                                : null,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // 智能体列表
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '智能体列表 (${state.agents.length})',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        IconButton(
                          icon: const Icon(Icons.refresh),
                          onPressed: state.status == PrefrontalStatus.running
                              ? () => notifier.refreshAgents()
                              : null,
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    if (state.agents.isEmpty)
                      const Text('暂无智能体')
                    else
                      ...state.agents.map((agent) => ListTile(
                            title: Text(agent.name),
                            subtitle: Text(agent.description),
                            trailing: const Icon(Icons.chevron_right),
                            onTap: () => _showAgentDialog(agent),
                          )),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // 调用智能体
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '调用智能体',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _inputController,
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        labelText: '输入',
                        hintText: '输入要发送给智能体的内容...',
                      ),
                      maxLines: 3,
                      enabled: state.status == PrefrontalStatus.running &&
                          state.agents.isNotEmpty,
                    ),
                    const SizedBox(height: 8),
                    ElevatedButton.icon(
                      icon: _isLoading
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.send),
                      label: const Text('调用'),
                      onPressed: state.status == PrefrontalStatus.running &&
                              state.agents.isNotEmpty &&
                              _inputController.text.isNotEmpty &&
                              !_isLoading
                          ? () => _invokeAgent(notifier)
                          : null,
                    ),
                    if (_output.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      Text(
                        '输出:',
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.grey[100],
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(_output),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _statusText(PrefrontalStatus status) {
    switch (status) {
      case PrefrontalStatus.stopped:
        return '已停止';
      case PrefrontalStatus.starting:
        return '启动中...';
      case PrefrontalStatus.running:
        return '运行中';
      case PrefrontalStatus.stopping:
        return '停止中...';
      case PrefrontalStatus.error:
        return '错误';
    }
  }

  Future<void> _startService(
    PrefrontalNotifier notifier,
    PrefrontalConfig config,
  ) async {
    try {
      await notifier.start(config);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('服务启动成功')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('启动失败: $e')),
        );
      }
    }
  }

  Future<void> _stopService(PrefrontalNotifier notifier) async {
    try {
      await notifier.stop();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('服务已停止')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('停止失败: $e')),
        );
      }
    }
  }

  Future<void> _invokeAgent(PrefrontalNotifier notifier) async {
    final state = ref.read(prefrontalProvider);
    if (state.agents.isEmpty) return;

    setState(() {
      _isLoading = true;
      _output = '';
    });

    try {
      final result = await notifier.invokeAgent(
        agentId: state.agents.first.id,
        input: _inputController.text,
      );

      setState(() {
        _output = result.output;
        _isLoading = false;
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '调用成功 (${result.durationMs}ms, ${result.fuelConsumed} fuel)',
            ),
          ),
        );
      }
    } catch (e) {
      setState(() {
        _isLoading = false;
        _output = '错误: $e';
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('调用失败: $e')),
        );
      }
    }
  }

  void _showStatusDialog(PrefrontalState state) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('服务状态'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('状态: ${_statusText(state.status)}'),
            if (state.errorMessage != null) ...[
              const SizedBox(height: 8),
              Text(
                '错误: ${state.errorMessage}',
                style: const TextStyle(color: Colors.red),
              ),
            ],
          ],
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

  void _showAgentDialog(AgentSpec agent) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(agent.name),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('ID: ${agent.id}'),
            const SizedBox(height: 8),
            Text('描述: ${agent.description}'),
            const SizedBox(height: 8),
            Text('指令: ${agent.instructions}'),
            const SizedBox(height: 8),
            Text('工具: ${agent.tools.join(", ")}'),
          ],
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
}
