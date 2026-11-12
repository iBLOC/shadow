import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../router/app_router.dart';
import '../providers/chat_provider.dart';
import '../services/capabilities/capability_i18n.dart';
import '../services/client_tools/client_tool_registry.dart';
import '../widgets/conversation_running_badge.dart';
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

  /// **归档箱**开着吗？
  ///
  /// ⚠️ 默认 **false** ⇒ ⇒ 列表只显示**未归档**的会话（归档是软标记，
  /// 默认不该再看见它）⇒ ⇒ 开着时只显示**归档**的那批。
  final bool showArchived;

  const ConversationsState({
    this.conversations = const [],
    this.isLoading = false,
    this.error,
    this.showArchived = false,
  });

  ConversationsState copyWith({
    List<ConversationInfo>? conversations,
    bool? isLoading,
    String? error,
    bool? showArchived,
  }) {
    return ConversationsState(
      conversations: conversations ?? this.conversations,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      showArchived: showArchived ?? this.showArchived,
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

  /// 归档标记（服务端说的，客户端不自己猜）。
  final bool archived;

  ConversationInfo({
    required this.id,
    required this.title,
    required this.createdAt,
    required this.updatedAt,
    this.messageCount = 0,
    this.agent = '',
    this.archived = false,
  });
}

class ConversationsNotifier extends StateNotifier<ConversationsState> {
  /// 端脑 client —— 会话列表走端脑方言 `/shadow/v1/conversations`，
  /// 跟对话本身是同一份数据。
  final TelencephalonClient _client;

  /// ⚠️ **构造时不再自动拉**。
  ///
  /// 以前这个拉取在**构造函数**里 ⇒ ⇒ 它只在**第一次**进列表时发生
  /// ⇒ ⇒ 而 `conversationsNotifierProvider` **不是** autoDispose ⇒ ⇒
  /// notifier 一直活着 ⇒ ⇒ 聊完天再回到列表，界面上的**消息数**与
  /// **排序**（按 `updated_at`）**停在旧值** ⇒ ⇒ 刚聊过的那条会话
  /// **不在最上面** ⇒ ⇒ 「最近会话」不是「最近会话」。
  ///
  /// ⇒ 现在由**列表页每次进入时**拉一次（见 `ConversationScreen.initState`）。
  ///
  /// ⚠️ 初始态是 **loading**（不是空列表）⇒ ⇒ 第一帧画的是**转圈**，
  /// 不是「**暂无会话**」⇒ ⇒ 不闪一帧「真的没有」的样子。
  ConversationsNotifier(this._client)
    : super(const ConversationsState(isLoading: true));

  Future<void> loadConversations() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      // ⚠️ 归档箱开着 ⇒ ⇒ 只列**归档**的那批；否则只列**未归档**的。
      // ⇒ ⇒ 两批**互斥**，用户不会在两个地方看到同一条会话。
      final conversations = await _client.listConversations(
        archivedOnly: state.showArchived,
      );
      state = state.copyWith(
        conversations: conversations
            .map(
              (c) => ConversationInfo(
                id: c.id,
                title: conversationTitleOf(c),
                agent: c.agent,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt,
                // ⚠️ **人设那条不算消息** —— 端脑把它存成会话的**第一条**轮次
                // ⇒ ⇒ 对话页**不画**它（它是配置，不是对话）⇒ ⇒ 列表里的
                // 条数也要跟对话页**一致** ⇒ ⇒ 否则用户数出来对不上。
                messageCount: c.history
                    .where((t) => !t.isSystemTurn)
                    .length,
                archived: c.archived,
              ),
            )
            .toList(),
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// 开关**归档箱** —— 切完立刻重拉（两边是**互斥**的两批会话）。
  Future<void> toggleArchiveBox() async {
    state = state.copyWith(showArchived: !state.showArchived);
    await loadConversations();
  }

  /// **归档**一条会话 —— 软标记：会话还在，只是不在默认列表里。
  Future<void> archive(String id) async {
    await _client.archiveConversation(id);
    await loadConversations();
  }

  /// 把归档的会话**取回**默认列表。
  Future<void> unarchive(String id) async {
    await _client.unarchiveConversation(id);
    await loadConversations();
  }

  /// **物理**删除一条会话（连海马体里的那份一起删）。
  Future<void> delete(String id) async {
    await _client.deleteConversation(id);
    await loadConversations();
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

class ConversationScreen extends ConsumerStatefulWidget {
  const ConversationScreen({super.key});

  @override
  ConsumerState<ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends ConsumerState<ConversationScreen>
    with RouteAware {
  /// 本页所在的路由（用来订阅路由观察器）。
  Route<dynamic>? _route;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (route != null && route != _route) {
      if (_route != null) appRouteObserver.unsubscribe(this);
      _route = route;
      appRouteObserver.subscribe(this, route);
    }
  }

  @override
  void dispose() {
    if (_route != null) {
      appRouteObserver.unsubscribe(this);
      _route = null;
    }
    super.dispose();
  }

  /// **退回**到这一页 ⇒ ⇒ 它又被露出来了 ⇒ ⇒ 端脑那边可能已经变了
  /// ⇒ ⇒ 数据会**陈旧** ⇒ ⇒ 重拉。
  ///
  /// ⚠️ 为什么 `initState` 不够：列表页是**从对话页 push 上去**的
  /// ⇒ ⇒ 退回时那一页**仍然挂载** ⇒ ⇒ `initState` **不会重跑**
  /// ⇒ ⇒ 只在 `initState` 拉 ⇒ ⇒ 「进入即刷新」只对**新建**列表页成立
  /// ⇒ ⇒ 2026-11-01 真机实测：退回列表后新会话**不出现**（列表停在旧值）。
  @override
  void didPopNext() {
    super.didPopNext();
    _refreshConversations();
  }

  /// 拉一次列表。
  ///
  /// ⚠️ 必须**下一帧**再拉：Riverpod **不许在 widget 构建期改 provider**
  /// ⇒ ⇒ `didPopNext` 是在 Navigator 处理 pop 时回调的（可能就在帧里）
  /// ⇒ ⇒ 改 provider 会被判成「构建期改 provider」⇒ ⇒ 等下一帧。
  void _refreshConversations() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(conversationsNotifierProvider.notifier).loadConversations();
    });
  }
  /// ⚠️ **进入即刷新** —— 会话列表是「**最近会话**」⇒ ⇒ 它得反映**此刻**
  /// 端脑那边的情况 ⇒ ⇒ 消息数、按 `updated_at` 的排序都得是新的。
  ///
  /// ⚠️ 以前是**陈旧的**：拉取在 notifier 的**构造函数**里 ⇒ ⇒ 只在第一次
  /// 进列表时发生 ⇒ ⇒ 聊完天回到列表，排序还停在旧位置 ⇒ ⇒ 刚聊过的那条
  /// **不在最上面**。
  ///
  /// ⚠️ 为什么**下一帧**再拉，不能在 `initState` 里直接拉：Riverpod
  /// **不许在 widget 构建期改 provider**（`_debugCanModifyProviders` 直接
  /// 抛错）⇒ ⇒ 只能等下一帧。
  /// ⇒ ⇒ 而「一帧的假空态」由**初始态 = loading** 挡掉（见 notifier）。
  @override
  void initState() {
    super.initState();
    _refreshConversations();
  }

  @override
  Widget build(BuildContext context) {
    final ref = this.ref;
    final convState = ref.watch(conversationsNotifierProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(AppLocalizations.of(context)!.conversationManagement),
        actions: [
          // ⚠️ **归档箱开关** —— 归档是软标记，默认列表看不见它
          // ⇒ ⇒ 用户得有一个地方能把它翻出来（否则「归档」= 藏没了）。
          IconButton(
            icon: Icon(
              convState.showArchived
                  ? Icons.unarchive_outlined
                  : Icons.archive_outlined,
            ),
            tooltip: AppLocalizations.of(context)!.conversationArchiveBox,
            onPressed: () => ref
                .read(conversationsNotifierProvider.notifier)
                .toggleArchiveBox(),
          ),
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
              icon: convState.showArchived
                  ? Icons.archive_outlined
                  : Icons.chat_bubble_outline,
              title: convState.showArchived
                  ? AppLocalizations.of(context)!.conversationArchiveBoxEmpty
                  : AppLocalizations.of(context)!.conversationEmpty,
              description: convState.showArchived
                  ? null
                  : AppLocalizations.of(context)!.conversationEmptyHint,
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
        // ⚠️ **运行状态从这里来** —— 正在跑的那条会话（当前 ChatNotifier
        // 绑定的会话）在列表条目上显示「运行中 · 工具」徽章；其他会话
        // 不受影响（客户端只知道本机的运行状态，别的设备照旧）。
        final chat = ref.watch(chatProvider);
        final isRunning =
            chat.sessionId == conv.id &&
            (chat.isLoading || chat.streamingText.isNotEmpty);
        String? runningBadge;
        if (isRunning) {
          final l10n = AppLocalizations.of(context)!;
          final tool = _runningBadgeLabel(context, chat.messages);
          runningBadge = tool == null
              ? l10n.conversationRunning
              : '${l10n.conversationRunning} · $tool';
        }
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: _ConversationCard(
            conversation: conv,
            runningBadge: runningBadge,
            onArchive: () => _runAction(
              context,
              ref,
              () => ref
                  .read(conversationsNotifierProvider.notifier)
                  .archive(conv.id),
            ),
            onUnarchive: () => _runAction(
              context,
              ref,
              () => ref
                  .read(conversationsNotifierProvider.notifier)
                  .unarchive(conv.id),
            ),
            onDelete: () => _confirmDelete(context, ref, conv),
          ),
        );
      },
    );
  }

  /// 「正在执行的工具」的人话短标签 —— 取**最后一张还没落定**的
  /// 工具卡片（running／awaitingApproval）；全落定了就返回 null
  /// ⇒ 徽章退化为纯「运行中」。
  String? _runningBadgeLabel(
    BuildContext context,
    List<ChatMessageModel> messages,
  ) {
    // 工具卡片住在 ~messages~ 里（ChatMessageModel.toolCall）——
    // ChatState 没有独立的 toolCalls 列表 ⇒ 从消息流里挑出来。
    final calls =
        messages.map((m) => m.toolCall).whereType<ToolCallModel>().toList();
    for (final call in calls.reversed) {
      if (call.status == ToolCallStatus.running ||
          call.status == ToolCallStatus.awaitingApproval) {
        final cap = call.capability;
        if (cap == null) return call.name;
        return capabilityToolShortLabel(
          AppLocalizations.of(context)!,
          cap,
          toolName: call.name,
        );
      }
    }
    return null;
  }

  /// 跑一个会改状态的动作 —— **失败要说真话**。
  ///
  /// ⚠️ 归档 / 取回 / 删除都在端脑的**写门**后面（admin token）⇒ ⇒
  /// 没钥匙时端脑回 401 ⇒ ⇒ 静默吞掉 = 用户以为归档了、实际没归档
  /// ⇒ ⇒ **失败长得像成功**。
  Future<void> _runAction(
    BuildContext context,
    WidgetRef ref,
    Future<void> Function() action,
  ) async {
    try {
      await action();
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            AppLocalizations.of(context)!
                .conversationActionFailed(e.toString()),
          ),
        ),
      );
    }
  }

  /// 删除前**问一句** —— 这是不可逆的操作（真删，含海马体里那份）。
  Future<void> _confirmDelete(
    BuildContext context,
    WidgetRef ref,
    ConversationInfo conv,
  ) async {
    final l10n = AppLocalizations.of(context)!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.commonDeleteConfirmNamed(conv.title)),
        content: Text(l10n.conversationDeleteBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.commonDelete),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    // ⚠️ showDialog 之后 **context 可能已经没了** ⇒ ⇒ 用之前先问一句。
    if (!context.mounted) return;
    await _runAction(context, ref, () async {
      try {
        await ref
            .read(conversationsNotifierProvider.notifier)
            .delete(conv.id);
      } catch (e) {
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.commonDeleteFailed(e.toString())),
          ),
        );
      }
    });
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
    // ⚠️ **不重拉列表** —— 草稿**还没进端脑** ⇒ ⇒ 端脑那边**什么都没变**
    // ⇒ ⇒ 重拉是一次**全量列表拉取**（每条会话带着**完整 history**）⇒ ⇒
    // 纯浪费；而且它会让「列表里立刻多出一条空会话」变得**看得见**⇒ ⇒
    // 而那正是要消除的垃圾（端脑**没有删会话的端点** ⇒ ⇒ 空会话一旦建了
    // 就**永久留着**）。
    context.go(AppRoutes.chat);
  }
}

class _ConversationCard extends StatelessWidget {
  final ConversationInfo conversation;
  final VoidCallback onArchive;
  final VoidCallback onUnarchive;
  final VoidCallback onDelete;

  /// **运行中徽章**（「运行中 · 读屏」）—— 只有正在跑的那条会话非空。
  final String? runningBadge;

  const _ConversationCard({
    required this.conversation,
    required this.onArchive,
    required this.onUnarchive,
    required this.onDelete,
    this.runningBadge,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
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
                // ⚠️ 归档标记**摆出来** —— 否则用户进归档箱也不知道
                // 哪些是归档的（而默认列表里它们直接消失 ⇒ 像是丢了）。
                if (runningBadge != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: RunningToolBadge(label: runningBadge!),
                  ),
                if (conversation.archived)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      l10n.conversationArchivedBadge,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppColors.primary,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          // ⚠️ 端脑现在**有**这三个端点了（2026-11-02）：
          // `POST /shadow/v1/conversations/{id}/archive` /
          // `.../unarchive` / `DELETE /shadow/v1/conversations/{id}`
          // ⇒ ⇒ 以前那条「端脑没有删除会话的端点 ⇒ 按钮必然 404 ⇒
          // 不如不留」的注释已经过期 ⇒ ⇒ 那个洞现在补上了。
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert),
            onSelected: (value) {
              switch (value) {
                case 'archive':
                  onArchive();
                  break;
                case 'unarchive':
                  onUnarchive();
                  break;
                case 'delete':
                  onDelete();
                  break;
              }
            },
            itemBuilder: (context) => [
              if (!conversation.archived)
                PopupMenuItem(
                  value: 'archive',
                  child: Text(l10n.conversationArchive),
                ),
              if (conversation.archived)
                PopupMenuItem(
                  value: 'unarchive',
                  child: Text(l10n.conversationUnarchive),
                ),
              PopupMenuItem(
                value: 'delete',
                child: Text(l10n.commonDelete),
              ),
            ],
          ),
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
