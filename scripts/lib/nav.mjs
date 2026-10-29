/**
 * 导航结构生成 —— 从 agent-surface.json 翻译成两端的导航数据。
 *
 * 为什么要生成：
 *   两端是同一个 agent 的两个终端，导航**结构**应该只有一份定义。
 *   之前桌面端侧栏 12 项平铺硬编码在 Layout.tsx、移动端 6 个 tab 硬编码在
 *   main_shell.dart —— 两份互不相干的清单，还各有一套分类法。
 *
 * 纯函数，无 IO —— 生成与校验共用。
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ─────────────────────────────────────────────────────────────
// 图标：清单里是**语义名**，各端映射到自己的图标集
// ─────────────────────────────────────────────────────────────

/** 语义图标名 → lucide-react 组件名（桌面端） */
export const DESKTOP_ICONS = {
  chat: 'MessageSquare',
  history: 'History',
  mic: 'Mic',
  broadcast: 'Radio',
  headset: 'Headphones',
  board: 'LayoutGrid',
  users: 'Users',
  file: 'FileText',
  eye: 'Eye',
  robot: 'Bot',
  cube: 'Box',
  download: 'Download',
  rocket: 'Rocket',
  sliders: 'SlidersHorizontal',
  plug: 'Plug',
  wrench: 'Wrench',
  sparkles: 'Sparkles',
  database: 'Database',
  quote: 'MessageSquareQuote',
  workflow: 'Workflow',
  'git-branch': 'GitBranch',
  cursor: 'MousePointer',
  code: 'FileCode',
  wifi: 'Wifi',
  radar: 'Radar',
  scroll: 'ScrollText',
  activity: 'Activity',
  cloud: 'Cloud',
  brain: 'Brain',
  settings: 'Settings',
  psychology: 'Puzzle',
  chevron: 'ChevronRight',
};

/** 语义图标名 → Material 图标常量（移动端） */
export const MOBILE_ICONS = {
  chat: 'Icons.chat_bubble_outline',
  history: 'Icons.history',
  mic: 'Icons.mic_none',
  broadcast: 'Icons.live_tv',
  headset: 'Icons.headset_mic',
  board: 'Icons.task_alt',
  users: 'Icons.groups',
  file: 'Icons.description',
  eye: 'Icons.visibility',
  robot: 'Icons.smart_toy',
  cube: 'Icons.inventory_2',
  download: 'Icons.download',
  rocket: 'Icons.rocket_launch',
  sliders: 'Icons.tune',
  plug: 'Icons.power',
  wrench: 'Icons.build',
  sparkles: 'Icons.auto_awesome',
  database: 'Icons.memory',
  quote: 'Icons.format_quote',
  workflow: 'Icons.account_tree',
  'git-branch': 'Icons.account_tree',
  cursor: 'Icons.pan_tool',
  code: 'Icons.code',
  wifi: 'Icons.wifi',
  radar: 'Icons.radar',
  scroll: 'Icons.receipt_long',
  activity: 'Icons.monitor_heart',
  cloud: 'Icons.cloud',
  brain: 'Icons.psychology_alt',
  settings: 'Icons.settings_outlined',
  psychology: 'Icons.psychology',
  chevron: 'Icons.chevron_right',
};

// ─────────────────────────────────────────────────────────────
// 解析
// ─────────────────────────────────────────────────────────────

export function loadManifest() {
  return JSON.parse(
    readFileSync(join(ROOT, 'agent-surface.json'), 'utf8'),
  );
}

/**
 * 规范 labelKey → 移动端平铺 ARB 的 key。
 *
 * 规范 key 写在 agent-surface.json 里（如 `surface.chat`），两端共用同一个；
 * 但 Flutter ARB 是平铺的 —— 带点的 key 解析会抛 FormatException ——
 * 所以移动端存成 camelCase（`surfaceChat`）。
 *
 * 生成器与守门员共用这一份实现，映射不会各写各的。
 */
export function toArbKey(dottedKey) {
  return dottedKey
    .replace(/\./g, '_')
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * 清单里用到的全部 labelKey（能力 + 导航段 + 底 tab + 对话形态）。
 *
 * 生成器用它写 navLabel switch，守门员用它查两端文案齐备度 ——
 * 同一份收集逻辑，不会各数各的。
 */
export function collectLabelKeys(manifest) {
  const keys = new Set();
  const capLabel = new Map(
    manifest.capabilities.map((c) => [c.id, c.labelKey]),
  );

  for (const c of manifest.capabilities) keys.add(c.labelKey);

  for (const t of manifest.navigation.mobile.tabs ?? []) {
    keys.add(t.labelKey);
  }
  for (const s of manifest.navigation.mobile.sections ?? []) {
    keys.add(s.labelKey);
  }
  for (const s of manifest.navigation.desktop.sections ?? []) {
    keys.add(s.labelKey);
  }

  // footer / conversationModes 是能力 id 数组，labelKey 来自能力本身
  for (const id of manifest.navigation.desktop.footer ?? []) {
    keys.add(capLabel.get(id));
  }
  for (const id of manifest.navigation.desktop.conversationModes ?? []) {
    keys.add(capLabel.get(id));
  }
  for (const id of manifest.navigation.mobile.conversationModes ?? []) {
    keys.add(capLabel.get(id));
  }

  return [...keys].filter(Boolean);
}

/**
 * 把 navigation 结构解析成两端各自的导航数据。
 *
 * @param {object} manifest
 * @param {'desktop'|'mobile'} end
 * @returns {{sections: Array, footer: Array, modes: Array}}
 */
export function resolveNav(manifest, end) {
  const byId = new Map(manifest.capabilities.map((c) => [c.id, c]));
  const nav = manifest.navigation[end];

  const resolveItem = (id) => {
    const cap = byId.get(id);
    if (!cap) {
      throw new Error(`导航引用了不存在的能力 id：${id}`);
    }
    const side = cap[end] ?? {};
    if (!side.route) return null; // 端侧专属 —— 该端没有，跳过
    return {
      id: cap.id,
      labelKey: cap.labelKey,
      icon: cap.icon,
      route: side.route,
      group: cap.group,
    };
  };

  const sections = (nav.sections ?? []).map((section) => ({
    id: section.id,
    labelKey: section.labelKey,
    collapsible: section.collapsible === true,
    items: section.items.map(resolveItem).filter(Boolean),
  }));

  const footer = (nav.footer ?? []).map(resolveItem).filter(Boolean);

  // 对话形态：只有该端真的实现了才进切换器
  const modes = (nav.conversationModes ?? [])
    .map(resolveItem)
    .filter(Boolean);

  return { sections, footer, modes };
}

/** 移动端的 tab：capability 走能力路由，container 走容器路由 */
export function resolveTabs(manifest) {
  const byId = new Map(manifest.capabilities.map((c) => [c.id, c]));
  const tabs = manifest.navigation.mobile.tabs;

  return tabs.map((tab) => {
    if (tab.container) {
      const container = (manifest._containers?.mobile ?? []).find(
        (c) => c.route === tab.container,
      );
      if (!container) {
        throw new Error(`移动端 tab "${tab.id}" 指向未知容器 ${tab.container}`);
      }
      return {
        id: tab.id,
        labelKey: tab.labelKey,
        route: tab.container,
        icon: 'sparkles',
        kind: 'container',
        alsoRoutes: tab.alsoRoutes ?? [],
      };
    }
    const cap = byId.get(tab.capability);
    if (!cap) {
      throw new Error(`移动端 tab "${tab.id}" 引用了不存在的能力 ${tab.capability}`);
    }
    const route = cap.mobile?.route;
    if (!route) {
      throw new Error(`移动端 tab "${tab.id}" 的能力 ${tab.capability} 在移动端没有路由`);
    }
    return {
      id: tab.id,
      labelKey: tab.labelKey,
      route,
      icon: cap.icon,
      kind: 'capability',
      capability: cap.id,
      alsoRoutes: tab.alsoRoutes ?? [],
    };
  });
}

// ─────────────────────────────────────────────────────────────
// 生成
// ─────────────────────────────────────────────────────────────

export function buildDesktopNav(manifest) {
  const { sections, footer, modes } = resolveNav(manifest, 'desktop');
  const L = [];

  L.push('// ============================================================');
  L.push('// Shadow 桌面端导航 —— 由 scripts/gen_nav.mjs 生成');
  L.push('// 请勿手改。改 agent-surface.json 后重新运行：');
  L.push('//     node scripts/gen_nav.mjs');
  L.push('//');
  L.push('// 对话为主：对话是唯一主干，能力收成一块，表达形态是对话的形态。');
  L.push('// ============================================================');
  L.push('');
  L.push('import type { LucideIcon } from "lucide-react";');
  L.push('import {');
  // 导入的是 **lucide 组件名**（DESKTOP_ICONS 映射之后），不是语义名 ——
  // 语义名如 `git-branch` 根本不是合法标识符。
  const used = new Set();
  const collect = (i) => {
    const mapped = DESKTOP_ICONS[i.icon];
    if (!mapped) {
      throw new Error(
        `能力 ${i.id} 的语义图标 "${i.icon}" 没有桌面端映射（DESKTOP_ICONS）`,
      );
    }
    used.add(mapped);
  };
  for (const s of sections) for (const i of s.items) collect(i);
  for (const f of footer) collect(f);
  for (const m of modes) collect(m);
  for (const name of [...used].sort()) {
    L.push(`  ${name},`);
  }
  L.push('} from "lucide-react";');
  L.push('');
  L.push('export interface NavItem {');
  L.push('  id: string;');
  L.push('  labelKey: string;');
  L.push('  route: string;');
  L.push('  icon: LucideIcon;');
  L.push('}');
  L.push('');
  L.push('export interface NavSection {');
  L.push('  id: string;');
  L.push('  labelKey: string;');
  L.push('  collapsible: boolean;');
  L.push('  items: NavItem[];');
  L.push('}');
  L.push('');
  L.push('export interface NavManifest {');
  L.push('  sections: NavSection[];');
  L.push('  footer: NavItem[];');
  L.push('  /** 对话形态 —— 由对话页的形态切换器进入，不是导航项 */');
  L.push('  conversationModes: NavItem[];');
  L.push('}');
  L.push('');
  L.push('export const desktopNav: NavManifest = {');
  L.push('  sections: [');
  for (const s of sections) {
    L.push('    {');
    L.push(`      id: ${JSON.stringify(s.id)},`);
    L.push(`      labelKey: ${JSON.stringify(s.labelKey)},`);
    L.push(`      collapsible: ${s.collapsible},`);
    L.push('      items: [');
    for (const i of s.items) {
      L.push(
        `        { id: ${JSON.stringify(i.id)}, labelKey: ${JSON.stringify(i.labelKey)}, route: ${JSON.stringify(i.route)}, icon: ${DESKTOP_ICONS[i.icon] ?? 'Circle'} },`,
      );
    }
    L.push('      ],');
    L.push('    },');
  }
  L.push('  ],');
  L.push('  footer: [');
  for (const f of footer) {
    L.push(
      `    { id: ${JSON.stringify(f.id)}, labelKey: ${JSON.stringify(f.labelKey)}, route: ${JSON.stringify(f.route)}, icon: ${DESKTOP_ICONS[f.icon] ?? 'Circle'} },`,
    );
  }
  L.push('  ],');
  L.push('  conversationModes: [');
  for (const m of modes) {
    L.push(
      `    { id: ${JSON.stringify(m.id)}, labelKey: ${JSON.stringify(m.labelKey)}, route: ${JSON.stringify(m.route)}, icon: ${DESKTOP_ICONS[m.icon] ?? 'Circle'} },`,
    );
  }
  L.push('  ],');
  L.push('};');
  L.push('');

  return L.join('\n');
}

export function buildMobileNav(manifest) {
  const tabs = resolveTabs(manifest);
  const { modes } = resolveNav(manifest, 'mobile');
  const L = [];

  // Dart 字符串用单引号（flutter_lints 的 prefer_single_quotes）
  const ds = (s) =>
    `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

  L.push('// ============================================================');
  L.push('// Shadow 移动端导航 —— 由 scripts/gen_nav.mjs 生成');
  L.push('// 请勿手改。改 agent-surface.json 后重新运行：');
  L.push('//     node scripts/gen_nav.mjs');
  L.push('//');
  L.push('// 对话为主：底 tab 只留「对话 / 任务 / 能力 / 我」四个。');
  L.push('// 表达形态（语音 / 直播 / 客服）是**对话的形态**，由对话页切换，不占 tab。');
  L.push('// ============================================================');
  L.push('');
  L.push("import 'package:flutter/material.dart';");
  L.push('');
  L.push("import '../generated/l10n/app_localizations.dart';");
  L.push('');
  L.push('class NavTab {');
  L.push('  final String id;');
  L.push('  final String labelKey;');
  L.push('  final String route;');
  L.push('  final IconData icon;');
  L.push('  final String kind;');
  L.push('');
  L.push('  /// 这个 tab 还覆盖哪些路由（选中判定用）');
  L.push('  final List<String> alsoRoutes;');
  L.push('');
  L.push('  const NavTab({');
  L.push('    required this.id,');
  L.push('    required this.labelKey,');
  L.push('    required this.route,');
  L.push('    required this.icon,');
  L.push('    required this.kind,');
  L.push('    this.alsoRoutes = const [],');
  L.push('  });');
  L.push('}');
  L.push('');
  L.push('class ConversationMode {');
  L.push('  final String id;');
  L.push('  final String labelKey;');
  L.push('  final String route;');
  L.push('  final IconData icon;');
  L.push('');
  L.push('  const ConversationMode({');
  L.push('    required this.id,');
  L.push('    required this.labelKey,');
  L.push('    required this.route,');
  L.push('    required this.icon,');
  L.push('  });');
  L.push('}');
  L.push('');
  L.push('const mobileNavTabs = <NavTab>[');
  for (const t of tabs) {
    L.push('  NavTab(');
    L.push(`    id: ${ds(t.id)},`);
    L.push(`    labelKey: ${ds(t.labelKey)},`);
    L.push(`    route: ${ds(t.route)},`);
    L.push(`    icon: ${MOBILE_ICONS[t.icon] ?? 'Icons.circle'},`);
    L.push(`    kind: ${ds(t.kind)},`);
    if (t.alsoRoutes.length) {
      const list = `[${t.alsoRoutes.map((r) => `'${r}'`).join(', ')}]`;
      L.push(`    alsoRoutes: ${list},`);
    }
    L.push('  ),');
  }
  L.push('];');
  L.push('');
  L.push('const conversationModes = <ConversationMode>[');
  for (const m of modes) {
    L.push('  ConversationMode(');
    L.push(`    id: ${ds(m.id)},`);
    L.push(`    labelKey: ${ds(m.labelKey)},`);
    L.push(`    route: ${ds(m.route)},`);
    L.push(`    icon: ${MOBILE_ICONS[m.icon] ?? 'Icons.circle'},`);
    L.push('  ),');
  }
  L.push('];');
  L.push('');

  // 规范 labelKey → 移动端平铺 ARB 的 getter。
  // Dart 不能用字符串动态取属性，所以只能生成一个 switch ——
  // 但它是从清单生成的，所以映射本身不会漂。
  const camel = toArbKey;

  const labelKeys = new Set(collectLabelKeys(manifest));

  L.push('/// 规范 labelKey → 移动端平铺 ARB 的 getter。');
  L.push('///');
  L.push('/// 规范 key 写在 agent-surface.json 里，两端共用同一个；');
  L.push('/// 但 Flutter ARB 是平铺的（带点的 key 解析会报 FormatException），');
  L.push('/// 所以移动端存成 camelCase。这个映射由脚本生成，不手改。');
  L.push('String navLabel(AppLocalizations l10n, String labelKey) {');
  L.push('  switch (labelKey) {');
  // dart format 的 case 体一律换行 —— 生成器直接产出合规样式，
  // 免得「生成物 ≠ 格式化后」导致每次都要手动跑一遍 dart format。
  for (const key of [...labelKeys].sort()) {
    L.push(`    case ${ds(key)}:`);
    L.push(`      return l10n.${camel(key)};`);
  }
  L.push('    default:');
  L.push('      return labelKey;');
  L.push('  }');
  L.push('}');
  L.push('');

  return L.join('\n');
}
