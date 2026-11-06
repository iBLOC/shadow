import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../generated/l10n/app_localizations.dart';
import '../providers/chat_provider.dart';
import '../providers/genui_provider.dart';
import '../providers/wake_word_provider.dart';
import '../services/wake_word_service.dart';
import '../providers/conversation_mode_provider.dart';
import '../providers/theme_provider.dart';
import '../utils/chat_state_l10n.dart';
import '../widgets/continue_on_desktop_dialog.dart';
import '../widgets/chat/local_chat_view.dart';
import '../widgets/chat/agent2ui_panel.dart';
import '../widgets/chat/mode_switcher.dart';
import '../widgets/chat/conversation_mode_switcher.dart';
import '../widgets/responsive.dart';
import '../theme/app_colors.dart';
import '../router/app_router.dart';

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final TextEditingController _promptController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  ProviderSubscription<AsyncValue<WakeWordEvent>>? _wakeWordSub;

  @override
  void initState() {
    super.initState();
    _wakeWordSub = ref.listenManual<AsyncValue<WakeWordEvent>>(
      wakeWordEventsProvider,
      (prev, next) {
        if (next is AsyncData<WakeWordEvent>) {
          _onWakeWord(next.value);
        }
      },
    );
  }

  void _onWakeWord(WakeWordEvent event) {
    if (!mounted) return;
    if (_promptController.text.isEmpty) {
      _promptController.text = 'Hello!';
      _scrollToBottom();
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Text('🎤 Heard you'),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  void dispose() {
    _wakeWordSub?.close();
    _promptController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final chatState = ref.watch(chatProvider);
    final l10n = AppLocalizations.of(context)!;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final useAgent2UI = ref.watch(useAgent2UIModeProvider);
    // 聊天背景图 —— 设置里选的图；null = 用默认渐变底。
    final bgPath = ref.watch(themeAppearanceProvider).chatBackgroundPath;

    ref.listen(chatProvider, (previous, next) {
      if (previous?.messages.length != next.messages.length) {
        _scrollToBottom();
      }
    });

    // Listen for transcriptions from Rust-side VAD in conversation mode
    ref.listen<ConversationModeNotifier>(conversationModeProvider.notifier, (
      previous,
      next,
    ) {
      next.transcriptionStream.listen((transcription) {
        if (transcription.isNotEmpty) {
          ref.read(chatProvider.notifier).generateResponse(transcription);
        }
      });
    });

    // Set up audio chunk callback when conversation mode changes
    ref.listen<ConversationState>(conversationModeProvider, (previous, next) {
      if (next.mode == ConversationMode.conversation) {
        ref
            .read(chatProvider.notifier)
            .setAudioChunkCallback(
              (chunk) => ref
                  .read(conversationModeProvider.notifier)
                  .sendAudioData(chunk),
            );
      } else {
        ref.read(chatProvider.notifier).setAudioChunkCallback(null);
      }
    });

    // 「本地模型没准备好就弹下载框」那一段**整块删掉**了 ——
    // 移动端本地 LiteRT 已下线，模型不再由客户端下载，
    // 也没有「模型不存在」这个状态可言。
    final isAgent2UI = useAgent2UI;

    // ⚠️ **同页共存** ⇒ 这一页**永远是对话页** ⇒ 标题/图标不再跟着 A2UI 变
    //（A2UI 有自己的面板头 ⇒ 不必借整页的标题说「你现在在 Agent2UI」）。
    String getModeTitle() => l10n.appTitle;

    IconData getModeIcon() => Icons.chat_bubble_outline;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Row(
          children: [
            Icon(getModeIcon(), color: AppColors.primary),
            const SizedBox(width: 8),
            Text(getModeTitle()),
          ],
        ),
        actions: [
          // ⚠️ 这里**曾经**是 `chatState.isInitialized || chatState.isLitertReady`。
          // 那两个字段说的都是**本地** LiteRT 引擎 ⇒ 在移动端**恒为假**
          // ⇒ AppBar 右侧三个入口（继续在桌面 / 语音 / 设置）**永远不可见**，
          // 「设置」页从此进不去。
          //
          // 现在判据是 `canChat`（恒真 —— 本地引擎下线后没有前置条件了），
          // 「继续在桌面」额外要求**已经有会话**（sessionId 在首条消息后才有）。
          // 会话列表（多会话）。
          //
          // 以前移动端**只有一条会话** ⇒ 这个入口也就没有意义；
          // 现在能切会话了 ⇒ 入口补上
          //（否则「会话管理」那页在 UI 上**没有任何入口** ⇒ 用户进不去）。
          // ⚠️ **同页共存** ⇒ 对话的这些入口**永远**在
          //（以前在 A2UI 形态下它们让位 ⇒ ⇒ 因为对话整块被顶掉了）。
          IconButton(
            icon: const Icon(Icons.history),
            onPressed: () => context.push(AppRoutes.conversation),
            tooltip: l10n.conversationManagement,
          ),
          if (chatState.sessionId != null)
            IconButton(
              icon: const Icon(Icons.swap_horiz),
              onPressed: () {
                final sessionId = chatState.sessionId;
                if (sessionId != null) {
                  showContinueOnDesktopDialog(context, sessionId);
                }
              },
              tooltip: l10n.continueDesktopTitle,
            ),
          const ModeSwitcher(),
          // Agent2UI（A2A / GenUI）的入口。
          //
          // 以前唯一的入口是「本地模型没装好 → 弹下载框 → Use Agent2UI」
          // 那个逃生口 —— 下载框下线之后就没有入口了，所以补一个常驻按钮，
          // 不然这个形态会变成**只能进不能出**的死功能。
          //
          // ⚠️ **同页共存** ⇒ 它是「上面多一块面板」，**不是**「换一页」
          // ⇒ ⇒ 这个按钮**常驻**且是**开关**（实心＝面板在）
          // ⇒ ⇒ 用户随时能收起来，对话一秒都不耽误。
          IconButton(
            icon: Icon(isAgent2UI ? Icons.widgets : Icons.widgets_outlined),
            onPressed: () =>
                ref.read(useAgent2UIModeProvider.notifier).state = !isAgent2UI,
            tooltip: l10n.agent2UI,
          ),
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () =>
                _showSettings(context, chatState.displayModelInfo(l10n)),
            tooltip: l10n.settings,
          ),
        ],
      ),
      // 折叠屏展开后屏宽 ≈ 700dp：内容限宽居中，不拉满整屏
      //（列表、输入条、形态切换器一起收进 kContentMaxWidth）。
      //
      // 聊天背景图：设置里选的图铺在整页内容底下（Stack 最底层），
      // 上面罩一层主题底色的半透明遮罩 —— 图片看得见，文字也可读。
      // 图片文件不在了（清缓存 / 换机）→ errorBuilder 退回空，
      // 「图没了」自然落回默认渐变，不许把聊天页画崩。
      body: Stack(
        children: [
          if (bgPath != null) ...[
            Positioned.fill(
              child: Image.file(
                File(bgPath),
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => const SizedBox.shrink(),
              ),
            ),
            Positioned.fill(
              child: ColoredBox(
                color:
                    (isDark
                            ? AppColors.darkBackground
                            : AppColors.lightBackground)
                        .withValues(alpha: 0.72),
              ),
            ),
          ],
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: kContentMaxWidth),
              child: Column(
                children: [
                  // 对话形态（对话 / 语音 / 直播 / 客服）是对话的方式，不是并列 tab
                  const ConversationModeSwitcher(),
                  // ⚠️ **同页共存**：A2UI 面板在**上面**，**对话永远在下面**
                  // ⇒ ⇒ 打开面板**不会**把对话换掉（以前是二选一 ⇒ 对话整块消失）。
                  // ⚠️ 高度封顶 42%（并夹在 180–420dp 之间）
                  // ⇒ ⇒ 小屏也不会把对话挤没、大屏也不会让面板吃掉整页。
                  if (isAgent2UI)
                    ConstrainedBox(
                      constraints: BoxConstraints(
                        maxHeight: (MediaQuery.sizeOf(context).height * 0.42)
                            .clamp(180.0, 420.0),
                      ),
                      child: const Agent2UIPanel(),
                    ),
                  Expanded(
                    child: LocalChatView(
                      chatState: chatState,
                      l10n: l10n,
                      isDark: isDark,
                      scrollController: _scrollController,
                      promptController: _promptController,
                      onSendMessage: _sendMessage,
                      onSpeak: () =>
                          ref.read(chatProvider.notifier).speakLastResponse(),
                      onPickImage: () =>
                          ref.read(chatProvider.notifier).pickImage(),
                      onCaptureImage: () =>
                          ref.read(chatProvider.notifier).captureImage(),
                      onPickFile: () =>
                          ref.read(chatProvider.notifier).pickFile(),
                      onStartAudioRecording: () =>
                          ref.read(chatProvider.notifier).startAudioRecording(),
                      onStopAudioRecording: () =>
                          ref.read(chatProvider.notifier).stopAudioRecording(),
                      onStopAndSend: _stopRecordingAndSend,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _sendMessage() {
    final prompt = _promptController.text.trim();
    final chatState = ref.read(chatProvider);
    final hasAttachments = chatState.attachments.isNotEmpty;

    // 如果没有文字也没有附件，直接返回
    if (prompt.isEmpty && !hasAttachments) return;

    _promptController.clear();

    if (hasAttachments) {
      // 端脑链路**只处理纯文本** ⇒ 带附件会明确报错（错误横幅说清楚原因）。
      // 以前这里是「静默清掉附件、只发文字」—— 用户以为图发出去了，
      // 其实那张图根本没进对话。
      ref
          .read(chatProvider.notifier)
          .generateResponseWithAttachments(prompt, chatState.attachments);
      return;
    }

    if (prompt.isNotEmpty) {
      ref.read(chatProvider.notifier).generateResponse(prompt);
    }
  }

  Future<void> _stopRecordingAndSend() async {
    await ref.read(chatProvider.notifier).stopAudioRecording();
    _sendMessage();
  }

  void _showSettings(BuildContext context, String modelInfo) {
    context.push(
      AppRoutes.settings,
      extra: {
        'modelInfo': modelInfo,
        'onReset': () {
          ref.read(chatProvider.notifier).reset();
        },
      },
    );
  }
}
