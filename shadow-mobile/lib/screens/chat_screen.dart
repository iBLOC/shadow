import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../generated/l10n/app_localizations.dart';
import '../asr_engine.dart';
import '../providers/chat_provider.dart';
import '../providers/wake_word_provider.dart';
import '../services/wake_word_service.dart';
import '../providers/conversation_mode_provider.dart';
import '../providers/theme_provider.dart';
import '../widgets/continue_on_desktop_dialog.dart';
import '../widgets/chat/local_chat_view.dart';
import '../widgets/chat/in_app_camera_overlay.dart';
import '../services/in_app_camera_service.dart';
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

  /// 相机叠加层开着没（null ＝ 关着）。
  ///
  /// ⚠️ 为什么是**状态**而不是「再跳一页」：跳页 ⇒ ⇒ 聊天页**整页重建**
  /// ⇒ ⇒ 输入框里已经打的字**可能丢**、滚动位置**跳回**、附件行**闪一下**
  /// ⇒ ⇒ 用户感觉「换了个页」⇒ ⇒ 那不是一体化。
  /// ⇒ ⇒ 叠在同一棵 widget 树上 ⇒ ⇒ 聊天页**一秒都没动过**。
  InAppCameraMode? _cameraMode;
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

    // ⚠️ **不再把 PCM 块实时推给 WS** —— 端脑侧**没有**
    // `/api/sessions/{id}/audio` 那条路由（端脑的语音面只有**请求-应答**的
    // `voice/transcribe` / `voice/synthesize`）⇒ ⇒ 推过去是**死流量**，
    // 而转写改走松手时的**一次性请求**（见 `_stopRecordingAndSend`）。
    ref.listen<ConversationState>(conversationModeProvider, (previous, next) {
      ref.read(chatProvider.notifier).setAudioChunkCallback(null);
    });

    // 「本地模型没准备好就弹下载框」那一段**整块删掉**了 ——
    // 移动端本地 LiteRT 已下线，模型不再由客户端下载，
    // 也没有「模型不存在」这个状态可言。
    //
    // ⚠️ **A2UI 的「独立面板」这一格也删掉了（2026-11-18）** ——
    // 用户诉求逐字：「现在移动端 对话也没按和agent2ui页面还是两个页面
    // 有没有一种可能合并为一个页面使用a2ui 传输协议使用ag-ui」
    // ⇒ ⇒ 那块面板走的是 **A2A**（`/a2a` ＋ 自己的输入条 ＋ 自己的连接状态栏
    // ＋ **不记会话**）⇒ ⇒ 它让用户看到的是「对话」与「另一个界面」两块
    // ⇒ ⇒ **同一个页面里住着两条协议**。
    //
    // ⇒ ⇒ 现在**只有一条**：AG-UI 承载的 A2UI 面，**内联在对话消息里**
    // （`local_chat_view.dart` 的 `A2uiSurfacesBlock`）⇒ ⇒ 一个页面。
    // ⇒ ⇒ 能力**零损失**：面板能给的只有 `tasks`／`agents` 两个视图，而端脑
    // 在 AG-UI 路里对**同样两个视图**用**同一套** `a2ui::render_view` 产出
    // （`telencephalon/src/api/shadow/agui.rs`），且**关键词兜底**同样生效
    // （「我的任务」⇒ tasks）⇒ ⇒ 用户在**对话框**里说一句就出面
    // ⇒ ⇒ 而且**这一条还记会话**（面板那条不记）。

    // ⚠️ **这一页**永远是对话页** ⇒ 标题/图标不跟着任何形态变
    //（A2UI 的面**内联在消息里** ⇒ 它没有自己的页头 ⇒ 更不必借整页的标题说事）。
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
          // ⚠️ **这里**曾经**有一个 `widgets` 常驻按钮**（开/关那块 A2UI 面板）
          // ⇒ ⇒ 2026-11-18 摘掉了（理由见上面那段注释）⇒ ⇒ 现在**只有**
          // 「在对话里说一句话 ⇒ 那一句话下面长出界面」这一种形态
          // ⇒ ⇒ AppBar 上**不再有第二个界面**的入口。
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () => _showSettings(context),
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
                  // ⚠️ **这里**曾经**长着 A2UI 的独立面板**（封顶屏高 42%）
                  // ⇒ ⇒ 2026-11-18 摘掉了 ⇒ ⇒ **A2UI 的面不再有「面板」这一形态**
                  // ⇒ ⇒ 它只以「**内联在对话消息里**」的样子出现
                  // ⇒ ⇒ ⇒ **这一页从头到尾只有一个页面**。
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
                      onCaptureImage: () => _openInAppCamera(InAppCameraMode.photo),
                      onPickFile: () =>
                          ref.read(chatProvider.notifier).pickFile(),
                      onStartAudioRecording: () =>
                          ref.read(chatProvider.notifier).startAudioRecording(),
                      onFinishRecording: _finishRecording,
                      onCaptureVideo: () => _openInAppCamera(InAppCameraMode.video),
                    ),
                  ),
                ],
              ),
            ),
          ),
          // ⚠️ **相机叠加层** —— 叠在聊天页**自己身上**（不跳页 ⇒ ⇒ 聊天页
          // 不重建 ⇒ ⇒ 输入框里打的字不丢 ⇒ ⇒ 拍完附件**原地**出现）。
          if (_cameraMode != null)
            InAppCameraOverlay(
              mode: _cameraMode!,
              onCaptured: _onCameraCaptured,
              onCancel: _onCameraCancel,
            ),
        ],
      ),
    );
  }

  /// **内建相机** ⇒ ⇒ 不再走系统相机。
  ///
  /// ⚠️ 为什么改：系统相机那条路是 **intent 回合** ⇒ ⇒ 回合一断，照片就
  /// **静默丢了**（真机实测 MIX 4 / MIUI：OneShotCamera 一被拉起就崩 ——
  /// 「FATAL EXCEPTION: JpegEncoderThread」⇒ ⇒
  /// 「Force finishing activity com.android.camera/.OneShotCamera」）
  /// ⇒ ⇒ 用户只看到「按了没反应」，候选里什么都没有。
  /// ⇒ ⇒ 自己拍 ⇒ ⇒ 拍完直接进附件。
  void _openInAppCamera(InAppCameraMode mode) {
    // ⚠️ **不再跳页** —— 相机是**叠在聊天页自己身上的一层**（一体化）。
    setState(() => _cameraMode = mode);
  }

  /// 拍到了 ⇒ ⇒ **原地**进附件（候选行真的多一条）＋ 这一层收摊。
  Future<void> _onCameraCaptured(InAppCameraCapture capture) async {
    await ref
        .read(chatProvider.notifier)
        .attachCapturedFile(capture.path, isVideo: capture.isVideo);
    if (!mounted) return;
    // ⚠️ 成功失败都**要收摊** —— 不许让相机一直盖在聊天页上。
    // 失败的话 provider 已经说了真话（errorMessage）。
    setState(() => _cameraMode = null);
  }

  /// 用户关掉了相机 ⇒ ⇒ **不带任何东西**（不许挂半截附件）。
  void _onCameraCancel() {
    if (!mounted) return;
    setState(() => _cameraMode = null);
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

  /// **松手** ⇒ 结束这次录音。
  ///
  /// ⚠️ [cancel] 为真 ⇒ 用户按住时**滑到了两侧** ⇒ ⇒ 那是**放弃** ⇒ ⇒
  /// 不转写、不发送、但**必须把录音器关掉**（否则麦克风一直占着 ⇒ ⇒ 下
  /// 一段录不进去、用户也听不到自己说话）。
  ///
  /// ⚠️ 正常松手 ⇒ ⇒ 录到的 PCM **不当附件**挂上去 —— 端脑链路只收纯
  /// 文本，挂上去只会白报一条「附件不可用」横幅 ⇒ ⇒ 改走**一次性转写**：
  /// 端脑 `voice/transcribe` ⇒ ⇒ **模型由能力页那张「语音识别」档决定**。
  ///
  /// ⚠️ **这里没有「实时流」**：原来那条 WS 音频腿（`/api/sessions/{id}/audio`）
  /// **端脑侧压根没有这条路由** ⇒ ⇒ 以前推过去的音频块是**死流量**。
  Future<void> _finishRecording(bool cancel) async {
    if (cancel) {
      await ref.read(chatProvider.notifier).cancelAudioRecording();
      return;
    }
    final input = await ref
        .read(chatProvider.notifier)
        .stopAudioRecording(keepAttachment: false);
    if (input == null) {
      // ⚠️ **失败要说真话** —— 「没录到音频」**不许静默返回**（那等于让
      // 用户以为「说完了话、什么都没发生」）⇒ ⇒ 报出去 ⇒ ⇒ 全局横幅看得见。
      AsrEngine.reportFailure('没录到声音（录音机没交出音频）');
      return;
    }
    final result = await ref.read(asrEngineProvider).transcribe(
          input.data,
          lobe: ref.read(chatProvider).activeConversationAgent,
        );
    if (!result.ok) return;
    final text = result.text ?? '';
    if (text.isNotEmpty) {
      ref.read(chatProvider.notifier).generateResponse(text);
    }
  }

  void _showSettings(BuildContext context) {
    context.push(
      AppRoutes.settings,
      extra: {
        'onReset': () {
          ref.read(chatProvider.notifier).reset();
        },
      },
    );
  }
}
