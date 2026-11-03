// ============================================================
// Shadow 移动端导航 —— 由 scripts/gen_nav.mjs 生成
// 请勿手改。改 agent-surface.json 后重新运行：
//     node scripts/gen_nav.mjs
//
// 对话为主：底 tab 只留「对话 / 任务 / 能力 / 我」四个。
// 表达形态（语音 / 直播 / 客服）是**对话的形态**，由对话页切换，不占 tab。
// ============================================================

import 'package:flutter/material.dart';

import '../generated/l10n/app_localizations.dart';

class NavTab {
  final String id;
  final String labelKey;
  final String route;
  final IconData icon;
  final String kind;

  /// 这个 tab 还覆盖哪些路由（选中判定用）
  final List<String> alsoRoutes;

  const NavTab({
    required this.id,
    required this.labelKey,
    required this.route,
    required this.icon,
    required this.kind,
    this.alsoRoutes = const [],
  });
}

class ConversationMode {
  final String id;
  final String labelKey;
  final String route;
  final IconData icon;

  const ConversationMode({
    required this.id,
    required this.labelKey,
    required this.route,
    required this.icon,
  });
}

const mobileNavTabs = <NavTab>[
  NavTab(
    id: 'chat',
    labelKey: 'nav.tab.chat',
    route: '/',
    icon: Icons.chat_bubble_outline,
    kind: 'capability',
    alsoRoutes: ['/conversations'],
  ),
  NavTab(
    id: 'tasks',
    labelKey: 'nav.tab.tasks',
    route: '/tasks',
    icon: Icons.task_alt,
    kind: 'capability',
  ),
  NavTab(
    id: 'capability',
    labelKey: 'nav.tab.capability',
    route: '/manage',
    icon: Icons.auto_awesome,
    kind: 'container',
    alsoRoutes: ['/flows'],
  ),
  NavTab(
    id: 'me',
    labelKey: 'nav.tab.me',
    route: '/settings',
    icon: Icons.settings_outlined,
    kind: 'capability',
  ),
];

const conversationModes = <ConversationMode>[
  ConversationMode(
    id: 'chat',
    labelKey: 'surface.chat',
    route: '/',
    icon: Icons.chat_bubble_outline,
  ),
  ConversationMode(
    id: 'voice',
    labelKey: 'surface.voice',
    route: '/voice',
    icon: Icons.mic_none,
  ),
  ConversationMode(
    id: 'livestream',
    labelKey: 'surface.livestream',
    route: '/livestream',
    icon: Icons.live_tv,
  ),
  ConversationMode(
    id: 'customer-service',
    labelKey: 'surface.customerService',
    route: '/customer-service',
    icon: Icons.headset_mic,
  ),
];

/// 规范 labelKey → 移动端平铺 ARB 的 getter。
///
/// 规范 key 写在 agent-surface.json 里，两端共用同一个；
/// 但 Flutter ARB 是平铺的（带点的 key 解析会报 FormatException），
/// 所以移动端存成 camelCase。这个映射由脚本生成，不手改。
String navLabel(AppLocalizations l10n, String labelKey) {
  switch (labelKey) {
    case 'nav.section.capability':
      return l10n.navSectionCapability;
    case 'nav.section.converse':
      return l10n.navSectionConverse;
    case 'nav.section.more':
      return l10n.navSectionMore;
    case 'nav.section.work':
      return l10n.navSectionWork;
    case 'nav.tab.capability':
      return l10n.navTabCapability;
    case 'nav.tab.chat':
      return l10n.navTabChat;
    case 'nav.tab.me':
      return l10n.navTabMe;
    case 'nav.tab.tasks':
      return l10n.navTabTasks;
    case 'surface.agents':
      return l10n.surfaceAgents;
    case 'surface.chat':
      return l10n.surfaceChat;
    case 'surface.computerUse':
      return l10n.surfaceComputerUse;
    case 'surface.conversations':
      return l10n.surfaceConversations;
    case 'surface.customerService':
      return l10n.surfaceCustomerService;
    case 'surface.discovery':
      return l10n.surfaceDiscovery;
    case 'surface.document':
      return l10n.surfaceDocument;
    case 'surface.flows':
      return l10n.surfaceFlows;
    case 'surface.group':
      return l10n.surfaceGroup;
    case 'surface.jdmEditor':
      return l10n.surfaceJdmEditor;
    case 'surface.livestream':
      return l10n.surfaceLivestream;
    case 'surface.logs':
      return l10n.surfaceLogs;
    case 'surface.mcp':
      return l10n.surfaceMcp;
    case 'surface.memory':
      return l10n.surfaceMemory;
    case 'surface.modelDownload':
      return l10n.surfaceModelDownload;
    case 'surface.modelOnboarding':
      return l10n.surfaceModelOnboarding;
    case 'surface.modelSettings':
      return l10n.surfaceModelSettings;
    case 'surface.models':
      return l10n.surfaceModels;
    case 'surface.previews':
      return l10n.surfacePreviews;
    case 'surface.promptSettings':
      return l10n.surfacePromptSettings;
    case 'surface.providers':
      return l10n.surfaceProviders;
    case 'surface.provisioning':
      return l10n.surfaceProvisioning;
    case 'surface.resonance':
      return l10n.surfaceResonance;
    case 'surface.settings':
      return l10n.surfaceSettings;
    case 'surface.setup':
      return l10n.surfaceSetup;
    case 'surface.skills':
      return l10n.surfaceSkills;
    case 'surface.tasks':
      return l10n.surfaceTasks;
    case 'surface.telencephalon':
      return l10n.surfaceTelencephalon;
    case 'surface.trace':
      return l10n.surfaceTrace;
    case 'surface.voice':
      return l10n.surfaceVoice;
    case 'surface.workflowStudio':
      return l10n.surfaceWorkflowStudio;
    default:
      return labelKey;
  }
}
