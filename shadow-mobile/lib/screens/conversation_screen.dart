import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../router/app_router.dart';
import '../services/prefrontal_client.dart';
import '../widgets/glass_card.dart';
import '../widgets/empty_state.dart';
import '../theme/app_colors.dart';

final conversationsNotifierProvider =
    StateNotifierProvider<ConversationsNotifier, ConversationsState>((ref) {
      return ConversationsNotifier(ref.watch(prefrontalClientProvider));
    });

class ConversationsState {
  final List<ConversationInfo> conversations;
  final bool isLoading;
  final String? error;

  const ConversationsState({
    this.conversations = const [],
    this.isLoading = false,
    this.error,
  });

  ConversationsState copyWith({
    List<ConversationInfo>? conversations,
    bool? isLoading,
    String? error,
  }) {
    return ConversationsState(
      conversations: conversations ?? this.conversations,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class ConversationInfo {
  final String id;
  final String title;
  final DateTime createdAt;
  final DateTime updatedAt;
  final int messageCount;

  ConversationInfo({
    required this.id,
    required this.title,
    required this.createdAt,
    required this.updatedAt,
    this.messageCount = 0,
  });

  factory ConversationInfo.fromJson(Map<String, dynamic> json) {
    return ConversationInfo(
      id: json['id'] ?? '',
      title: json['title'] ?? '新会话',
      createdAt: DateTime.tryParse(json['created_at'] ?? '') ?? DateTime.now(),
      updatedAt: DateTime.tryParse(json['updated_at'] ?? '') ?? DateTime.now(),
      messageCount: json['message_count'] ?? 0,
    );
  }
}

class ConversationsNotifier extends StateNotifier<ConversationsState> {
  final PrefrontalClient _client;

  ConversationsNotifier(this._client) : super(const ConversationsState()) {
    loadConversations();
  }

  Future<void> loadConversations() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final conversations = await _client.getConversations();
      state = state.copyWith(
        conversations: conversations
            .map(
              (c) => ConversationInfo.fromJson({
                'id': c.id,
                'title': c.title,
                'created_at': c.createdAt.toIso8601String(),
                'updated_at': c.updatedAt.toIso8601String(),
                'message_count': c.messageCount,
              }),
            )
            .toList(),
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> deleteConversation(String id) async {
    try {
      await _client.deleteSession(id);
      state = state.copyWith(
        conversations: state.conversations.where((c) => c.id != id).toList(),
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }
}

class ConversationScreen extends ConsumerWidget {
  const ConversationScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final convState = ref.watch(conversationsNotifierProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('会话管理'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref
                .read(conversationsNotifierProvider.notifier)
                .loadConversations(),
          ),
        ],
      ),
      body: convState.isLoading
          ? const Center(child: CircularProgressIndicator())
          : convState.conversations.isEmpty
          ? EmptyState(
              icon: Icons.chat_bubble_outline,
              title: '暂无会话',
              description: '点击右下角开始新对话',
            )
          : _buildConversationList(context, ref, convState),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _startNewConversation(context),
        icon: const Icon(Icons.add),
        label: const Text('新对话'),
      ),
    );
  }

  Widget _buildConversationList(
    BuildContext context,
    WidgetRef ref,
    ConversationsState state,
  ) {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: state.conversations.length,
      itemBuilder: (context, index) {
        final conv = state.conversations[index];
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: _ConversationCard(
            conversation: conv,
            onDelete: () => ref
                .read(conversationsNotifierProvider.notifier)
                .deleteConversation(conv.id),
          ),
        );
      },
    );
  }

  void _startNewConversation(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('新对话'),
        content: const TextField(
          decoration: InputDecoration(
            labelText: '对话标题',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('创建'),
          ),
        ],
      ),
    );
  }
}

class _ConversationCard extends StatelessWidget {
  final ConversationInfo conversation;
  final VoidCallback onDelete;

  const _ConversationCard({required this.conversation, required this.onDelete});

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      onTap: () {
        context.push(AppRoutes.chat, extra: {'sessionId': conversation.id});
      },
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: AppColors.primary.withValues(alpha: 0.2),
            child: Text(
              '${conversation.messageCount}',
              style: TextStyle(color: AppColors.primary),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  conversation.title,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                Text(
                  _formatTime(conversation.updatedAt),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          IconButton(
            icon: Icon(Icons.delete, color: AppColors.error),
            onPressed: () => _confirmDelete(context),
          ),
        ],
      ),
    );
  }

  void _confirmDelete(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('确认删除'),
        content: Text('确定要删除 "${conversation.title}" 吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () {
              onDelete();
              Navigator.pop(context);
            },
            child: Text('删除', style: TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
  }

  String _formatTime(DateTime time) {
    final now = DateTime.now();
    final diff = now.difference(time);

    if (diff.inMinutes < 60) {
      return '${diff.inMinutes} 分钟前';
    } else if (diff.inHours < 24) {
      return '${diff.inHours} 小时前';
    } else if (diff.inDays < 7) {
      return '${diff.inDays} 天前';
    } else {
      return '${time.month}/${time.day}/${time.year}';
    }
  }
}
