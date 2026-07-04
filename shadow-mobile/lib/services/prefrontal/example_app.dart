import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'services/prefrontal/prefrontal_provider.dart';

/// Prefrontal 集成示例应用
/// 
/// 演示如何在 Flutter 应用中使用 Prefrontal 嵌入式集群服务
void main() {
  // 启用日志
  WidgetsFlutterBinding.ensureInitialized();
  
  runApp(
    const ProviderScope(
      child: PrefrontalExampleApp(),
    ),
  );
}

class PrefrontalExampleApp extends StatelessWidget {
  const PrefrontalExampleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Prefrontal 示例',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        useMaterial3: true,
      ),
      home: const HomePage(),
    );
  }
}

class HomePage extends ConsumerWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(prefrontalProvider);
    final notifier = ref.read(prefrontalProvider.notifier);
    final config = ref.watch(prefrontalConfigProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Prefrontal 集成示例'),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // 服务状态卡片
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '服务状态',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Icon(
                        state.status == PrefrontalStatus.running
                            ? Icons.check_circle
                            : Icons.error,
                        color: state.status == PrefrontalStatus.running
                            ? Colors.green
                            : Colors.red,
                      ),
                      const SizedBox(width: 8),
                      Text(_statusText(state.status)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '地址: ${config.host}:${config.port}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // 控制按钮
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    '服务控制',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton.icon(
                    icon: const Icon(Icons.play_arrow),
                    label: const Text('启动服务'),
                    onPressed: state.status == PrefrontalStatus.stopped
                        ? () => _startService(context, notifier, config)
                        : null,
                  ),
                  const SizedBox(height: 8),
                  ElevatedButton.icon(
                    icon: const Icon(Icons.stop),
                    label: const Text('停止服务'),
                    onPressed: state.status == PrefrontalStatus.running
                        ? () => _stopService(context, notifier)
                        : null,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // 智能体管理
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        '智能体管理',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      Text(
                        '${state.agents.length} 个智能体',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton.icon(
                    icon: const Icon(Icons.add),
                    label: const Text('注册智能体'),
                    onPressed: state.status == PrefrontalStatus.running
                        ? () => _registerAgent(context, notifier)
                        : null,
                  ),
                  const SizedBox(height: 8),
                  ElevatedButton.icon(
                    icon: const Icon(Icons.refresh),
                    label: const Text('刷新列表'),
                    onPressed: state.status == PrefrontalStatus.running
                        ? () => notifier.refreshAgents()
                        : null,
                  ),
                  if (state.agents.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    const Divider(),
                    const SizedBox(height: 8),
                    ...state.agents.map((agent) => ListTile(
                          leading: const Icon(Icons.smart_toy),
                          title: Text(agent.name),
                          subtitle: Text(agent.description),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => _showAgentDetails(context, agent),
                        )),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // 调用智能体
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    '调用智能体',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton.icon(
                    icon: const Icon(Icons.send),
                    label: const Text('调用示例智能体'),
                    onPressed: state.status == PrefrontalStatus.running &&
                            state.agents.isNotEmpty
                        ? () => _invokeAgent(context, notifier, state.agents.first)
                        : null,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // 健康检查
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    '健康检查',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton.icon(
                    icon: const Icon(Icons.health_and_safety),
                    label: const Text('检查服务状态'),
                    onPressed: state.status == PrefrontalStatus.running
                        ? () => _healthCheck(context, notifier)
                        : null,
                  ),
                ],
              ),
            ),
          ),
        ],
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
    BuildContext context,
    PrefrontalNotifier notifier,
    PrefrontalConfig config,
  ) async {
    try {
      await notifier.start(config);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('服务启动成功'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('启动失败: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _stopService(
    BuildContext context,
    PrefrontalNotifier notifier,
  ) async {
    try {
      await notifier.stop();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('服务已停止'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('停止失败: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _registerAgent(
    BuildContext context,
    PrefrontalNotifier notifier,
  ) async {
    try {
      final spec = AgentSpec(
        id: 'example-agent-${DateTime.now().millisecondsSinceEpoch}',
        name: '示例智能体',
        description: '这是一个示例智能体',
        instructions: '你是一个友好的助手，可以帮助用户解答问题。',
        model: {
          'provider': 'openai',
          'name': 'gpt-4',
        },
        tools: ['search', 'calculate'],
      );

      await notifier.registerAgent(spec);

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('智能体注册成功: ${spec.name}'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('注册失败: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _invokeAgent(
    BuildContext context,
    PrefrontalNotifier notifier,
    AgentSpec agent,
  ) async {
    try {
      final result = await notifier.invokeAgent(
        agentId: agent.id,
        input: '你好，请介绍一下你自己。',
      );

      if (context.mounted) {
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: Text('调用 ${agent.name}'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('输入: 你好，请介绍一下你自己。'),
                const SizedBox(height: 16),
                const Text('输出:', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text(result.output),
                const SizedBox(height: 16),
                Text(
                  '性能: ${result.durationMs}ms, ${result.fuelConsumed} fuel, ${result.memoryUsedMb}MB',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
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
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('调用失败: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _healthCheck(
    BuildContext context,
    PrefrontalNotifier notifier,
  ) async {
    try {
      final health = await notifier.health();

      if (context.mounted) {
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('健康检查'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('状态: ${health['status'] ?? 'unknown'}'),
                const SizedBox(height: 8),
                Text('会话数: ${health['session_count'] ?? 0}'),
                const SizedBox(height: 8),
                Text('智能体数: ${health['agent_count'] ?? 0}'),
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
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('健康检查失败: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _showAgentDetails(BuildContext context, AgentSpec agent) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(agent.name),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('ID: ${agent.id}'),
              const SizedBox(height: 8),
              Text('描述: ${agent.description}'),
              const SizedBox(height: 8),
              Text('指令: ${agent.instructions}'),
              const SizedBox(height: 8),
              Text('模型: ${agent.model['provider']}/${agent.model['name']}'),
              const SizedBox(height: 8),
              Text('工具: ${agent.tools.join(", ")}'),
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
}
