import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/prefrontal_client.dart';
import '../services/soul_service.dart';
import '../widgets/glass_card.dart';
import '../theme/app_colors.dart';

final soulServiceProvider = Provider<SoulService>((ref) {
  final client = ref.watch(prefrontalClientProvider);
  return SoulService(client: client);
});

final soulHistoryProvider =
    FutureProvider.family<List<SoulVersionResponse>, String>((
      ref,
      agentId,
    ) async {
      final service = ref.watch(soulServiceProvider);
      return await service.getVersionHistory(agentId);
    });

final currentSoulProvider = FutureProvider.family<String?, String>((
  ref,
  agentId,
) async {
  final service = ref.watch(soulServiceProvider);
  return await service.getCurrentSoul(agentId);
});

class SoulScreen extends ConsumerStatefulWidget {
  final String agentId;

  const SoulScreen({super.key, this.agentId = 'chat'});

  @override
  ConsumerState<SoulScreen> createState() => _SoulScreenState();
}

class _SoulScreenState extends ConsumerState<SoulScreen> {
  late TextEditingController _controller;
  bool _hasChanges = false;
  bool _isLoading = true;
  String? _currentSoul;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
    _loadSoul();
  }

  Future<void> _loadSoul() async {
    final service = ref.read(soulServiceProvider);
    final soul = await service.getCurrentSoul(widget.agentId);
    if (mounted) {
      setState(() {
        _controller.text = soul ?? '';
        _currentSoul = soul;
        _isLoading = false;
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _saveSoul() async {
    if (_controller.text == _currentSoul) return;

    final service = ref.read(soulServiceProvider);
    await service.updateSoulByUser(
      agentId: widget.agentId,
      newSoul: _controller.text,
    );

    setState(() {
      _hasChanges = false;
      _currentSoul = _controller.text;
    });

    ref.invalidate(soulHistoryProvider(widget.agentId));

    if (mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Soul 已保存')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final historyAsync = ref.watch(soulHistoryProvider(widget.agentId));

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Soul 设置'),
        actions: [
          if (_hasChanges)
            TextButton.icon(
              onPressed: _saveSoul,
              icon: const Icon(Icons.save),
              label: const Text('保存'),
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Expanded(
                  flex: 2,
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: GlassCard(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Icon(Icons.person, color: AppColors.primary),
                                const SizedBox(width: 8),
                                Text(
                                  'Soul - 你的个人助理灵魂',
                                  style: Theme.of(
                                    context,
                                  ).textTheme.titleMedium,
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(
                              '描述你的个人助理的性格、习惯和偏好。'
                              ' System Prompt 优先级最高。',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            const SizedBox(height: 16),
                            Expanded(
                              child: TextField(
                                controller: _controller,
                                maxLines: null,
                                expands: true,
                                textAlignVertical: TextAlignVertical.top,
                                decoration: InputDecoration(
                                  hintText:
                                      '例如：\n- 语气友好、简洁\n- 称呼用户为"你"\n- 主动提供有用的建议',
                                  border: OutlineInputBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  filled: true,
                                  fillColor: Colors.white.withValues(
                                    alpha: 0.05,
                                  ),
                                ),
                                onChanged: (value) {
                                  if (value != _currentSoul && !_hasChanges) {
                                    setState(() => _hasChanges = true);
                                  }
                                },
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                Expanded(
                  flex: 1,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: GlassCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsets.all(16),
                            child: Row(
                              children: [
                                Icon(Icons.history, color: AppColors.primary),
                                const SizedBox(width: 8),
                                Text(
                                  '版本历史',
                                  style: Theme.of(
                                    context,
                                  ).textTheme.titleMedium,
                                ),
                              ],
                            ),
                          ),
                          Expanded(
                            child: historyAsync.when(
                              data: (history) => _buildHistoryList(history),
                              loading: () => const Center(
                                child: CircularProgressIndicator(),
                              ),
                              error: (e, _) => Center(
                                child: Text(
                                  '无法加载历史: $e',
                                  style: const TextStyle(color: Colors.red),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
              ],
            ),
    );
  }

  Widget _buildHistoryList(List<SoulVersionResponse> history) {
    if (history.isEmpty) {
      return const Center(child: Text('暂无版本历史'));
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      itemCount: history.length,
      itemBuilder: (context, index) {
        final item = history[index];
        return ListTile(
          dense: true,
          leading: CircleAvatar(
            radius: 16,
            backgroundColor: item.source == 'user'
                ? AppColors.primary.withValues(alpha: 0.2)
                : AppColors.secondary.withValues(alpha: 0.2),
            child: Text(
              'v${item.version}',
              style: TextStyle(
                fontSize: 10,
                color: item.source == 'user'
                    ? AppColors.primary
                    : AppColors.secondary,
              ),
            ),
          ),
          title: Text(
            item.source == 'user' ? '用户修改' : 'Agent 评估',
            style: const TextStyle(fontSize: 14),
          ),
          subtitle: Text(
            item.reason ?? '无原因',
            style: const TextStyle(fontSize: 12),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          trailing: Text(
            _formatDate(item.createdAt),
            style: Theme.of(context).textTheme.bodySmall,
          ),
          onTap: () => _showVersionDetail(item),
        );
      },
    );
  }

  String _formatDate(DateTime date) {
    return '${date.month}/${date.day} ${date.hour}:${date.minute.toString().padLeft(2, '0')}';
  }

  void _showVersionDetail(SoulVersionResponse item) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.7,
        maxChildSize: 0.9,
        minChildSize: 0.5,
        builder: (context, scrollController) => Container(
          decoration: BoxDecoration(
            color: Theme.of(context).scaffoldBackgroundColor,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              Container(
                margin: const EdgeInsets.symmetric(vertical: 8),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Text(
                      '版本 ${item.version}',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const Spacer(),
                    Chip(
                      label: Text(item.source == 'user' ? '用户修改' : 'Agent 评估'),
                      backgroundColor: item.source == 'user'
                          ? AppColors.primary.withValues(alpha: 0.2)
                          : AppColors.secondary.withValues(alpha: 0.2),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: SingleChildScrollView(
                  controller: scrollController,
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (item.reason != null) ...[
                        Text(
                          '修改原因',
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                        const SizedBox(height: 4),
                        Text(item.reason!),
                        const SizedBox(height: 16),
                      ],
                      if (item.conversationSummary != null) ...[
                        Text(
                          '对话摘要',
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                        const SizedBox(height: 4),
                        Text(item.conversationSummary!),
                        const SizedBox(height: 16),
                      ],
                      Text('内容', style: Theme.of(context).textTheme.titleSmall),
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.05),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(item.content),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
