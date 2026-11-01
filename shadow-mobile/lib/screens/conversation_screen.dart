import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../router/app_router.dart';
import '../providers/chat_provider.dart';
import '../providers/telencephalon_provider.dart';
import '../services/telencephalon/telencephalon_client.dart';
import '../widgets/glass_card.dart';
import '../widgets/glass_button.dart';
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

  /// 叶区名（端脑的 `agent`）。
  ///
  /// ⚠️ 它以前**就是标题** ⇒ 同一个叶区的所有会话长得一模一样 ⇒
  /// 现在标题让位给「用户第一句话」了 ⇒ ⇒ 叶区名**挪到副标签**，
  /// 免得这条信息白白丢掉（用户得知道自己这条会话落在哪个叶区上）。
  final String agent;

  ConversationInfo({
    required this.id,
    required this.title,
    required this.createdAt,
    required this.updatedAt,
    this.messageCount = 0,
    this.agent = '',
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
                title: conversationTitleOf(c),
                agent: c.agent,
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

/// 会话标题 = **用户自己说过的第一句话**。
///
/// ⚠️ 为什么以前不是这样：端脑的 `Conversation` **没有标题字段**
/// （只有 `id` / `agent` / `created_at` / `updated_at` / `history`）
/// ⇒ 列表里能拿到的只有叶区名（`agent`）⇒ ⇒ **同一个叶区的所有会话
/// 在列表里长得一模一样** ⇒ ⇒ 用户根本分不出哪条是哪条
/// ⇒ ⇒ 「管理多个会话」这件事在**视觉上**就不成立。
///
/// 端脑的 `ConversationView` **带着完整 history** ⇒ ⇒ 标题可以**零成本**
/// 从第一条 `user` 轮次里取（**不用**额外请求）。
///
/// ⚠️ 派生的**规则只有一份**（`lib/utils/conversation_title.dart`）——
/// 对话页也用它 ⇒ ⇒ 列表页与对话页显示的标题**不会分叉**。
String conversationTitleOf(Conversation c) =>
    c.derivedTitle ?? currentL10n().conversationNewSession;

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
          : convState.error != null
          ? _ConversationLoadError(
              error: convState.error!,
              onRetry: () => ref
                  .read(conversationsNotifierProvider.notifier)
                  .loadConversations(),
            )
          : convState.conversations.isEmpty
          ? EmptyState(
              icon: Icons.chat_bubble_outline,
              title: AppLocalizations.of(context)!.conversationEmpty,
              description: AppLocalizations.of(context)!.conversationEmptyHint,
            )
          : _buildConversationList(context, ref, convState),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _startNewConversation(context, ref),
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

  /// 「新对话」⇒ **真的**开一条端脑会话并切过去。
  ///
  /// ⚠️ 以前这里弹一个对话框，里面有个**标题输入框** ⇒ 但端脑的会话
  /// **没有标题字段**（`Conversation` 只有 id / agent / created_at /
  /// updated_at / history）⇒ 那个输入框**无处可存**
  /// ⇒ 而「创建」按钮只是 `Navigator.pop`
  /// ⇒ **什么也没创建** ⇒ 「按了创建像新建了会话，实际没建」
  /// ⇒ **失败长得像成功**。
  ///
  /// 现在：直接建 + 切 + 跳到对话页 ⇒ 会话真的多了一条。
  Future<void> _startNewConversation(BuildContext context, WidgetRef ref) async {
    final created = await ref
        .read(chatProvider.notifier)
        .startNewConversation();
    if (!created || !context.mounted) return;
    // 新会话要出现在列表里 ⇒ 重新拉一次。
    await ref
        .read(conversationsNotifierProvider.notifier)
        .loadConversations();
    if (!context.mounted) return;
    context.go(AppRoutes.chat);
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
                  _subtitle(context, conversation),
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

  /// 副标签 = **叶区名 · 时间**。
  ///
  /// ⚠️ 叶区名以前是**标题** ⇒ 现在标题是「用户第一句话」了 ⇒ ⇒
  /// 叶区名必须**挪到这里**，否则这条信息就丢了。
  String _subtitle(BuildContext context, ConversationInfo conv) {
    final time = _formatTime(context, conv.updatedAt);
    if (conv.agent.isEmpty) return time;
    return '${conv.agent} · $time';
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

/// 列表**读不到**时的样子。
///
/// ⚠️ 为什么不能拿「空态」顶替：
/// - 空态说的是「**真的没有**会话」⇒ 用户该去新建一条；
/// - 读失败说的是「**问不到**」⇒ 用户该去看端脑 / 配钥匙。
///
/// 把失败画成「暂无会话」⇒ 用户以为自己的会话没了 ⇒
/// **失败长得像成功** —— 而且它**不报错**，没人会发现。
///
/// 同族的坑：A2UI 那面「空 surface / 纯文本 / 失败」曾经也被并成两种
///（见 a2ui_answer_state.dart 的三态判定）。同一个病，两处。
class _ConversationLoadError extends StatelessWidget {
  /// 真实原因（端脑回的状态码 + 正文，或连接错误）。
  final String error;
  final VoidCallback onRetry;

  const _ConversationLoadError({required this.error, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark
        ? AppColors.darkTextSecondary
        : AppColors.lightTextSecondary;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.cloud_off,
              size: 56,
              color: textColor.withValues(alpha: 0.6),
            ),
            const SizedBox(height: 16),
            Text(
              l10n.errorGeneric(error),
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(color: textColor),
            ),
            const SizedBox(height: 20),
            GlassButton(
              label: l10n.commonRefresh,
              icon: Icons.refresh,
              onPressed: onRetry,
            ),
          ],
        ),
      ),
    );
  }
}
