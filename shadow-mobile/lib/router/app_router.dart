import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/chat_provider.dart';
import '../utils/build_phase_guard.dart';
import '../screens/chat_screen.dart';
import '../screens/model_management_screen.dart';
import '../screens/settings_screen.dart';
import '../screens/task_board_screen.dart';
import '../screens/mcp_screen.dart';
import '../screens/skills_screen.dart';
import '../screens/providers_screen.dart';
import '../screens/conversation_screen.dart';
import '../screens/memory_screen.dart';
import '../screens/agents_screen.dart';
import '../screens/manage/management_hub_screen.dart';
import '../screens/model_settings_screen.dart';
import '../screens/prompt_settings_screen.dart';
import '../screens/voice_conversation_screen.dart';
import '../screens/livestream_screen.dart';
import '../screens/customer_service_screen.dart';
import '../screens/flows_screen.dart';
import '../screens/discovery_screen.dart';
import '../screens/identity_screen.dart';
import '../screens/logs_screen.dart';
import '../screens/resonance_screen.dart';
import '../services/encephalon/encephalon_mobile_page.dart';
import '../widgets/main_shell.dart';

/// Route names
class AppRoutes {
  static const String chat = '/';
  static const String taskBoard = '/tasks';
  static const String conversation = '/conversations';
  static const String manage = '/manage';
  static const String manageProviders = '/manage/providers';
  static const String manageModels = '/manage/models';
  static const String manageMcp = '/manage/mcp';
  static const String manageSkills = '/manage/skills';
  static const String manageAgents = '/manage/agents';
  static const String manageMemory = '/manage/memory';
  static const String settings = '/settings';
  static const String modelSettings = '/settings/model';
  static const String promptSettings = '/settings/prompt';
  static const String voice = '/voice';
  static const String liveStream = '/livestream';
  static const String customerService = '/customer-service';
  // ⚠️ 2026-11-03：**Group 入口已下线** —— 端脑没有 group 概念
  // （`/api/group/*` 一律 404）⇒ ⇒ 代码留档在 `screens/group_screen.dart`
  // ＋ `services/group_service.dart` ⇒ ⇒ 要恢复 revert 本次提交即可。
  static const String flows = '/flows';
  static const String discovery = '/discovery';
  static const String logs = '/logs';
  static const String resonance = '/resonance';
  static const String encephalonEmbedded = '/settings/encephalon';
  static const String identity = '/settings/identity';

  // Legacy routes (redirect)
  static const String agents = '/agents';
  static const String models = '/models';
  static const String providers = '/providers';
  static const String mcp = '/mcp';
  static const String skills = '/skills';
  static const String memory = '/memory';
}

/// Wrap a page in MainShell with current route context
Widget _wrapInShell(GoRouterState state, Widget child) {
  final location = state.uri.path;
  return MainShell(currentPath: location, child: child);
}

/// Custom fade transition for smooth page switching
CustomTransitionPage<void> _fadePage(GoRouterState state, Widget child) {
  return CustomTransitionPage<void>(
    key: state.pageKey,
    child: child,
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      return FadeTransition(
        opacity: CurveTween(curve: Curves.easeInOut).animate(animation),
        child: child,
      );
    },
  );
}

/// 路由观察器 —— 让「被盖住的页面」知道自己**又露出来了**。
///
/// ⚠️ 为什么需要它：会话列表页是**从对话页 push 上去**的（点某条会话）
/// ⇒ ⇒ 退回时那一页**仍然挂载**（只是被盖住）⇒ ⇒ `initState` **不会重跑**
/// ⇒ ⇒ 「进入即刷新」只对「**新建**列表页」成立 ⇒ ⇒ 退回时列表会**停在旧值**
/// ⇒ ⇒ 2026-11-01 真机实测逮到（`scripts/prove-mobile-multi-session-on-device.ps1`
/// 那条「退回列表后新会话立刻出现」红）⇒ ⇒ ⇒ `didPopNext` 就是
/// 「我又变成当前路由了」那个信号。
final RouteObserver<ModalRoute<void>> appRouteObserver =
    RouteObserver<ModalRoute<void>>();

/// GoRouter configuration for Shadow Mobile
final GoRouter appRouter = GoRouter(
  initialLocation: AppRoutes.chat,
  debugLogDiagnostics: true,
  observers: [appRouteObserver],
  routes: [
    // Chat (default tab)
    GoRoute(
      path: AppRoutes.chat,
      name: 'chat',
      pageBuilder: (context, state) {
        // 「从会话列表点开某条历史会话」⇒ **真的切过去**。
        //
        // ⚠️ 以前这里把 `extra` 带过来就**丢掉**（pageBuilder 压根不读
        // `state.extra`）⇒ ⇒ 点开哪条会话看到的都是当前那条
        // ⇒ 「点了一下像切了会话，实际没切」。
        //
        // ⚠️ 切换**必须**发生在 build 期之外 —— pageBuilder 是在 build 里
        // 跑的，此时改 provider 会被 Riverpod 判成「在 widget 树构建期间
        // 改 provider」⇒ 整个 App 打断（2026-11-01 真机实证，
        // 见 `lib/utils/build_phase_guard.dart`）。
        final extra = state.extra as Map<String, dynamic>?;
        final sessionId = extra?['sessionId'] as String?;
        if (sessionId != null && sessionId.isNotEmpty) {
          final container = ProviderScope.containerOf(context, listen: false);
          runOutsideBuild(() {
            container.read(chatProvider.notifier).switchTo(sessionId);
          });
        }
        return _fadePage(state, _wrapInShell(state, const ChatScreen()));
      },
    ),
    // Tasks tab
    GoRoute(
      path: AppRoutes.taskBoard,
      name: 'tasks',
      pageBuilder: (context, state) =>
          _fadePage(state, _wrapInShell(state, const TaskBoardScreen())),
    ),
    GoRoute(
      path: AppRoutes.conversation,
      name: 'conversations',
      pageBuilder: (context, state) =>
          _fadePage(state, _wrapInShell(state, const ConversationScreen())),
    ),
    // Manage tab
    GoRoute(
      path: AppRoutes.manage,
      name: 'manage',
      pageBuilder: (context, state) =>
          _fadePage(state, _wrapInShell(state, const ManagementHubScreen())),
    ),
    GoRoute(
      path: AppRoutes.manageProviders,
      name: 'manageProviders',
      pageBuilder: (context, state) =>
          _fadePage(state, _wrapInShell(state, const ProvidersScreen())),
    ),
    GoRoute(
      path: AppRoutes.manageModels,
      name: 'manageModels',
      pageBuilder: (context, state) =>
          _fadePage(state, _wrapInShell(state, const ModelManagementScreen())),
    ),
    GoRoute(
      path: AppRoutes.manageMcp,
      name: 'manageMcp',
      pageBuilder: (context, state) =>
          _fadePage(state, _wrapInShell(state, const MCPScreen())),
    ),
    GoRoute(
      path: AppRoutes.manageSkills,
      name: 'manageSkills',
      pageBuilder: (context, state) =>
          _fadePage(state, _wrapInShell(state, const SkillsScreen())),
    ),
    GoRoute(
      path: AppRoutes.manageAgents,
      name: 'manageAgents',
      pageBuilder: (context, state) =>
          _fadePage(state, _wrapInShell(state, const AgentsScreen())),
    ),
    GoRoute(
      path: AppRoutes.manageMemory,
      name: 'manageMemory',
      pageBuilder: (context, state) =>
          _fadePage(state, _wrapInShell(state, const MemoryScreen())),
    ),
    // Settings tab
    GoRoute(
      path: AppRoutes.settings,
      name: 'settings',
      pageBuilder: (context, state) {
        final extra = state.extra as Map<String, dynamic>?;
        final modelInfo = extra?['modelInfo'] as String? ?? 'No model loaded';
        final onReset = extra?['onReset'] as VoidCallback? ?? () {};
        return _fadePage(
          state,
          _wrapInShell(
            state,
            SettingsScreen(modelInfo: modelInfo, onReset: onReset),
          ),
        );
      },
    ),
    // Model settings
    GoRoute(
      path: AppRoutes.modelSettings,
      name: 'modelSettings',
      pageBuilder: (context, state) =>
          _fadePage(state, _wrapInShell(state, const ModelSettingsScreen())),
    ),
    // Prompt settings
    GoRoute(
      path: AppRoutes.promptSettings,
      name: 'promptSettings',
      pageBuilder: (context, state) =>
          _fadePage(state, _wrapInShell(state, const PromptSettingsScreen())),
    ),
    // Voice conversation (voice-assistant mode)
    GoRoute(
      path: AppRoutes.voice,
      name: 'voice',
      pageBuilder: (context, state) => _fadePage(
        state,
        _wrapInShell(state, const VoiceConversationScreen()),
      ),
    ),
    // Live-stream / read-aloud mode (voice-only, no digital avatar)
    GoRoute(
      path: AppRoutes.liveStream,
      name: 'livestream',
      pageBuilder: (context, state) => _fadePage(
        state,
        _wrapInShell(state, const LivestreamScreen()),
      ),
    ),
    // Smart customer service mode (AI auto-answer calls via shadow-esp32)
    GoRoute(
      path: AppRoutes.customerService,
      name: 'customerService',
      pageBuilder: (context, state) => _fadePage(
        state,
        _wrapInShell(state, const CustomerServiceScreen()),
      ),
    ),
    // ⚠️ 2026-11-03：Group 路由已下线（理由见 `AppRoutes` 处的说明）——
    // 端脑没有 group 概念 ⇒ ⇒ 不再挂这条会打 404 的路。
    // Flows
    GoRoute(
      path: AppRoutes.flows,
      name: 'flows',
      pageBuilder: (context, state) =>
          _fadePage(state, _wrapInShell(state, const FlowsScreen())),
    ),
    // Discovery
    GoRoute(
      path: AppRoutes.discovery,
      name: 'discovery',
      pageBuilder: (context, state) =>
          _fadePage(state, _wrapInShell(state, const DiscoveryPage())),
    ),
    // Logs
    GoRoute(
      path: AppRoutes.logs,
      name: 'logs',
      pageBuilder: (context, state) =>
          _fadePage(state, _wrapInShell(state, const LogsPage())),
    ),
    // Resonance
    GoRoute(
      path: AppRoutes.resonance,
      name: 'resonance',
      pageBuilder: (context, state) =>
          _fadePage(state, _wrapInShell(state, const ResonancePage())),
    ),
    // Embedded Encephalon runtime (NDK .so) —— 与桌面端同款的大脑
    GoRoute(
      path: AppRoutes.encephalonEmbedded,
      name: 'encephalonEmbedded',
      pageBuilder: (context, state) =>
          _fadePage(state, _wrapInShell(state, const EncephalonMobilePage())),
    ),
    // 「当前是谁」—— 账号级身份 + 跨设备搬运（导出/导入）
    GoRoute(
      path: AppRoutes.identity,
      name: 'identity',
      pageBuilder: (context, state) =>
          _fadePage(state, _wrapInShell(state, const IdentityScreen())),
    ),
    // Legacy redirects
    GoRoute(
      path: AppRoutes.agents,
      redirect: (context, state) => AppRoutes.manageAgents,
    ),
    GoRoute(
      path: AppRoutes.models,
      redirect: (context, state) => AppRoutes.manageModels,
    ),
    GoRoute(
      path: AppRoutes.providers,
      redirect: (context, state) => AppRoutes.manageProviders,
    ),
    GoRoute(
      path: AppRoutes.mcp,
      redirect: (context, state) => AppRoutes.manageMcp,
    ),
    GoRoute(
      path: AppRoutes.skills,
      redirect: (context, state) => AppRoutes.manageSkills,
    ),
    GoRoute(
      path: AppRoutes.memory,
      redirect: (context, state) => AppRoutes.manageMemory,
    ),
  ],
  errorBuilder: (context, state) => Scaffold(
    body: Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 64, color: Colors.red),
          const SizedBox(height: 16),
          Text(
            'Page not found',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          Text(
            state.uri.toString(),
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: Colors.grey),
          ),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: () => context.go(AppRoutes.chat),
            child: const Text('Go Home'),
          ),
        ],
      ),
    ),
  ),
);
