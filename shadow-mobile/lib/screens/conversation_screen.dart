import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../router/app_router.dart';
import '../providers/telencephalon_provider.dart';
import '../services/telencephalon/telencephalon_client.dart';
import '../widgets/glass_card.dart';
import '../widgets/empty_state.dart';
import '../theme/app_colors.dart';
import '../generated/l10n/app_localizations.dart';
import '../l10n/current_l10n.dart';

final conversationsNotifierProvider =
    StateNotifierProvider<ConversationsNotifier, ConversationsState>((ref) {
      return ConversationsNotifier(ref.watch(telencephalonClientProvider));
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
}

class ConversationsNotifier extends StateNotifier<ConversationsState> {
  /// 端脑 client —— 会话列表走端脑方言 `/shadow/v1/conversations`，
  /// 跟对话本身是同一份数据。
  final TelencephalonClient _client;

  ConversationsNotifier(this._client) : super(const ConversationsState()) {
    loadConversations();
  }

  Future<void> loadConversations() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final conversations = await _client.listConversations();
      state = state.copyWith(
        conversations: conversations
            .map(
              (c) => ConversationInfo(
                id: c.id,
                title: c.agent.isNotEmpty
                    ? c.agent
                    : currentL10n().conversationNewSession,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt,
                messageCount: c.history.length,
              ),
            )
            .toList(),
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
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
        title: Text(AppLocalizations.of(context)!.conversationManagement),
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
              title: AppLocalizations.of(context)!.conversationEmpty,
              description: AppLocalizations.of(context)!.conversationEmptyHint,
            )
          : _buildConversationList(context, ref, convState),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _startNewConversation(context),
        icon: const Icon(Icons.add),
        label: Text(AppLocalizations.of(context)!.conversationNewChat),
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
          ),
        );
      },
    );
  }

  void _startNewConversation(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(AppLocalizations.of(context)!.conversationNewChat),
        content: TextField(
          decoration: InputDecoration(
            labelText: AppLocalizations.of(context)!.conversationTitleField,
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(AppLocalizations.of(context)!.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context),
            child: Text(AppLocalizations.of(context)!.conversationCreate),
          ),
        ],
      ),
    );
  }
}

class _ConversationCard extends StatelessWidget {
  final ConversationInfo conversation;

  const _ConversationCard({required this.conversation});

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
                  _formatTime(context, conversation.updatedAt),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          // 端脑（`/shadow/v1/conversations`）**没有删除会话的端点** ——
          // 桌面端也没提供这个操作（`telencephalonClient.ts` 只有
          // create / get / list）。留着一个必然 404 的删除按钮不如不留；
          // 真要删除，得先在端脑侧把「删会话」这个语义定下来
          // （删掉，还是只 close）。
        ],
      ),
    );
  }

  String _formatTime(BuildContext context, DateTime time) {
    final now = DateTime.now();
    final diff = now.difference(time);

    if (diff.inMinutes < 60) {
      return AppLocalizations.of(context)!.commonMinutesAgo(diff.inMinutes);
    } else if (diff.inHours < 24) {
      return AppLocalizations.of(context)!.commonHoursAgo(diff.inHours);
    } else if (diff.inDays < 7) {
      return AppLocalizations.of(context)!.commonDaysAgo(diff.inDays);
    } else {
      return '${time.month}/${time.day}/${time.year}';
    }
  }
}
