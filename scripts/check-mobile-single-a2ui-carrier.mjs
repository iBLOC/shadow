#!/usr/bin/env node
/**
 * 移动端的 A2UI 面**只有一条承载：AG-UI ＋ 内联在对话消息里**。
 *
 * ## 这道闸钉的是什么
 *
 * 2026-11-18 之前，移动端**同一个页面里住着两条协议**：
 *
 * | 形态 | 传输 | 长在哪 | 记会话吗 |
 * |---|---|---|---|
 * | **独立面板** | **A2A**（`/a2a`） | 顶部**另一块**（自带输入条、连接状态栏） | **不记** |
 * | **内联** | **AG-UI**（官方 `ACTIVITY_SNAPSHOT`） | **对话消息里** | 记 |
 *
 * ⇒ ⇒ 用户诉求逐字：「现在移动端 对话也没按和agent2ui页面还是两个页面
 * 有没有一种可能合并为一个页面使用a2ui 传输协议使用ag-ui」
 * ⇒ ⇒ **独立面板那条被摘掉了** ⇒ ⇒ **一个页面**。
 *
 * ## 为什么「摘掉重复的第二条路」不丢能力
 *
 * ① 面板能给的只有 `tasks`／`agents` 两个视图；
 * ② 端脑在 **AG-UI** 路里对**同样两个视图**用**同一套** `a2ui::render_view`
 *    产出面 ⇒ ⇒ 两边**逐字同形**（`check-agui-a2ui-wire.mjs` 的 W6 钉着）；
 * ③ 端脑的**关键词兜底**同样生效（`resolve_view`：「任务」⇒ tasks）
 *    ⇒ ⇒ 用户在**对话框**里说一句「我的任务」就出面
 *    ⇒ ⇒ 而且**这一条记会话**（面板那条不记）。
 *
 * ## 用法
 *
 *   node scripts/check-mobile-single-a2ui-carrier.mjs              # 判
 *   node scripts/check-mobile-single-a2ui-carrier.mjs --self-test  # 判据自检
 *
 * 退出码：**0 绿 / 1 红 / 2 判不了**（源没读全 ⇒ ≠ 没问题）。
 *
 * ⚠️ **这道闸钉的是「当前口径」** —— 将来若要恢复那块面板，
 * **必须同刀把本闸改掉**（⇒ ⇒ 不许偷偷加回一个「第二条承载」）。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const NL = String.fromCharCode(10);

/** 判据条数（自检与「N/N」读数都用它 ⇒ ⇒ 不许手写一个会漂的数）。 */
export const RULE_COUNT = 8;

/**
 * 摘掉的那三个文件（面板专用）—— 它们**必须不在**。
 *
 * ⚠️ **两代命名都要盯**（这一格是本闸自己撞出来的盲点）：
 * 仓库 **HEAD** 里存的是**旧名** `agent2ui_*.dart`（`Agent2UIPanel`／
 * `Agent2UIView`／`Agent2UIInputBar`／`Agent2UIAnswerState`／
 * `useAgent2UIModeProvider`／`genUIAgentService`），而**工作树**里那份是
 * **新名** `a2ui_*.dart` ⇒ ⇒ 只盯新名 ⇒ ⇒ **把 HEAD 那份恢复回来照样绿**
 * ⇒ ⇒ 尺子自己骗自己 ⇒ ⇒ 两代都列进来。
 */
export const PANEL_FILES = [
  // 新名（工作树那一代）
  'shadow-mobile/lib/widgets/chat/a2ui_panel.dart',
  'shadow-mobile/lib/widgets/chat/a2ui_view.dart',
  'shadow-mobile/lib/widgets/chat/a2ui_answer_state.dart',
  // 旧名（HEAD 那一代 —— 复活面板最可能被恢复的就是这三份）
  'shadow-mobile/lib/widgets/chat/agent2ui_panel.dart',
  'shadow-mobile/lib/widgets/chat/agent2ui_view.dart',
  'shadow-mobile/lib/widgets/chat/agent2ui_answer_state.dart',
];

/** 出现次数（纯字符串计数 ⇒ ⇒ 不引正则 ⇒ ⇒ 不用怕反斜杠被吃）。 */
export function hits(src, needle) {
  if (!needle) return 0;
  if (!src) return 0;
  return src.split(needle).length - 1;
}

/** 递归列目录下的 .dart 文件（相对 REPO_ROOT 的路径）。 */
export function listDartFiles(dirAbs) {
  if (!existsSync(dirAbs)) return [];
  const out = [];
  const walk = (abs) => {
    let entries = [];
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const e of entries) {
      const child = join(abs, e.name);
      if (e.isDirectory()) walk(child);
      else if (e.name.endsWith('.dart')) out.push(child);
    }
  };
  walk(dirAbs);
  return out;
}

/** 把一批文件读成一个字符串（只看内容；文件名另算）。 */
export function concatFiles(paths) {
  const parts = [];
  for (const p of paths) {
    try {
      parts.push(readFileSync(p, 'utf8'));
    } catch (_) {
      // 读不到 ⇒ 由调用方单独判「判不了」
    }
  }
  return parts.join(NL);
}

/**
 * 纯函数：各源的内容 ⇒ ⇒ 结论。
 * ⚠️ **零 I/O** ⇒ ⇒ 自检喂合成夹具 ⇒ ⇒ 自检不会恒绿。
 */
export function evaluate(sources) {
  const findings = [];
  const add = (rule, file, detail) => findings.push({ rule, file, detail });

  const chatScreen = sources.chatScreen || '';
  const chatProvider = sources.chatProvider || '';
  const localChatView = sources.localChatView || '';
  const mobileActivity = sources.mobileActivity || '';
  const mobileEvents = sources.mobileEvents || '';
  const mobileInline = sources.mobileInline || '';
  const mobileLib = sources.mobileLib || '';
  const mobileTest = sources.mobileTest || '';
  const panelFiles = sources.panelFiles || [];

  // M1 —— 对话页**不许**挂那块独立面板
  //
  // ⚠️ **两代命名都要盯**：`a2ui_panel`（新名）／`agent2ui_panel`（旧名，
  // **HEAD 里就是这个名字**）⇒ ⇒ 只盯新名 ⇒ ⇒ 恢复旧名照样绿。
  if (hits(chatScreen, 'a2ui_panel') > 0
    || hits(chatScreen, 'A2uiPanel') > 0
    || hits(chatScreen, 'agent2ui_panel') > 0
    || hits(chatScreen, 'Agent2UIPanel') > 0) {
    add('M1', 'shadow-mobile/lib/screens/chat_screen.dart',
      '对话页又挂上了「独立 A2UI 面板」⇒ ⇒ 同一个页面里又住着两条协议（A2A 面板 ＋ AG-UI 内联）');
  }

  // M2 —— 面板那三个文件**必须不在**
  for (const f of panelFiles) {
    add('M2', f, '这块「独立面板」的文件又回来了 ⇒ ⇒ 移动端又有了第二条 A2UI 承载');
  }

  // M3 —— 「面板开/关」那个开关**不许**复活
  if (hits(mobileLib, 'useA2uiModeProvider') > 0
    || hits(mobileTest, 'useA2uiModeProvider') > 0
    || hits(mobileLib, 'useAgent2UIModeProvider') > 0
    || hits(mobileTest, 'useAgent2UIModeProvider') > 0) {
    add('M3', 'shadow-mobile/lib/providers/a2ui_provider.dart',
      '「面板开/关」那个开关又回来了 ⇒ ⇒ 面板那条承载正在复活（恢复要三件一起做，见 AGENTS.md）');
  }

  // M4 —— 面板那个输入条**不许**复活（同屏两个输入框 ⇒ 用户分不清在跟谁说话）
  if (hits(mobileLib, 'A2uiInputBar') > 0
    || hits(mobileTest, 'A2uiInputBar') > 0
    || hits(mobileLib, 'Agent2UIInputBar') > 0
    || hits(mobileTest, 'Agent2UIInputBar') > 0) {
    add('M4', 'shadow-mobile/lib/widgets/chat/',
      'A2UI 面板那个输入条又回来了 ⇒ ⇒ 同屏会有两个输入框 ⇒ ⇒ 用户分不清在跟谁说话');
  }

  // M5 —— **正控**：AG-UI 内联那条**三跳**都还在
  if (hits(chatProvider, "case 'a2ui_surface':") === 0) {
    add('M5', 'shadow-mobile/lib/providers/chat_provider.dart',
      '对话链路里没有接 AG-UI 的 a2ui_surface 事件 ⇒ ⇒ 端脑 paint 的面进不了界面');
  }
  if (hits(localChatView, 'A2uiSurfacesBlock(') === 0) {
    add('M5', 'shadow-mobile/lib/widgets/chat/local_chat_view.dart',
      '消息列表里不画 A2uiSurfacesBlock ⇒ ⇒ 面没有长在对话消息里（不许退回「顶部一块」）');
  }
  if (hits(mobileActivity, 'a2uiActivityType') === 0) {
    add('M5', 'shadow-mobile/lib/agui/a2ui_activity.dart',
      'AG-UI 承载 A2UI 的 activity 常量不见了 ⇒ ⇒ 官方形状那条路断了');
  }

  // M6 —— **客户端认得那条官方事件**
  //
  // ⚠️ **为什么是客户端这一格**：端脑「能不能出面」那件事**不是**客户端的
  // 职责 ⇒ ⇒ 它归 `check-agui-a2ui-wire.mjs`（W6／W8，**跨仓**、本机跑）。
  // ⇒ ⇒ 而这一条钉的是**客户端这一侧必须认得那条事件**：不认 ⇒ ⇒ 端脑
  // 画的面**静默消失** ⇒ ⇒ 失败长得像成功。
  //
  // ⚠️ 与 `check-agui-a2ui-wire.mjs` 的 W4 **不重复**：那道闸**跨仓** ⇒ ⇒
  // **不进 CI**（真值源在兄弟仓）⇒ ⇒ 本条是「**CI 里有分母的那一份**」。
  if (hits(mobileEvents, "'ACTIVITY_SNAPSHOT'") === 0) {
    add('M6', 'shadow-mobile/lib/agui/agui_events.dart',
      '客户端的已知事件类型里没有 ACTIVITY_SNAPSHOT ⇒ ⇒ 端脑 paint 的面会被当成「不认识」⇒ ⇒ 面静默消失');
  }

  // M7 —— 内联面**不许自己另说会话身份**
  //
  // ⚠️ **为什么这一格归本闸**：移动端唯一的 A2UI 承载是**内联在对话里**
  // ⇒ ⇒ 它**继承**那条对话的会话身份（它就是那条对话的一部分）⇒ ⇒ 允许。
  // ⇒ ⇒ 但它**不许自己另说**一条会话 id ⇒ ⇒ 那会是「界面说谎」——
  // 用户看到的会话不是消息会落进去的那条（同族：㋠ 条治的那个病）。
  //
  // ⚠️ 与 `check-a2ui-session-identity.mjs` **分工**：那边管**端脑 `/a2a`**
  // 「落不落会话」与**仍存在的 A2A 形态**（桌面端）⇒ ⇒ 这边管**内联块**。
  for (const m of ['sessionId', 'activeConversationAgent', 'deriveConversationTitle']) {
    if (hits(mobileInline, m) > 0) {
      add('M7', 'shadow-mobile/lib/widgets/chat/a2ui_inline_block.dart',
        '内联的那块面自己引用了「' + m + '」⇒ ⇒ 它在另说一条会话 ⇒ ⇒ 它继承的是对话那条 ⇒ ⇒ 不许自己另说');
    }
  }

  // M8 —— 那套「A2A 面板」的类/服务**不许**在任何 .dart 里复活
  //
  // ⚠️ **为什么单独一条**：M1–M4 盯的是「**入口**」（页面挂载／文件在不在／
  // 开关／输入条）⇒ ⇒ 而**面板那套实现**可以被**换个文件名**复活（旧名的
  // `Agent2UIView`／`Agent2UIAnswerState` ＋ 旧名的 `genUIAgentService`
  // —— 那正是打 `/a2a` 的那个客户端）⇒ ⇒ 入口没红、第二条承载已经回来了
  // ⇒ ⇒ **得盯类名与服务名**。
  //
  // ⚠️ **为什么不是「不许出现 a2ui 这个词」**：AG-UI 内联那条路**合法地**
  // 带着 `a2ui` 前缀（`a2ui_surface`／`a2ui_inline_block`／
  // `A2uiSurfacesBlock`）⇒ ⇒ 负控必须落在**「面板那一族」的专属标识符**上
  // ⇒ ⇒ 不许宽到误伤合法那条路。
  for (const m of ['Agent2UIView', 'Agent2UIAnswerState', 'genUIAgentService']) {
    if (hits(mobileLib, m) > 0 || hits(mobileTest, m) > 0) {
      add('M8', 'shadow-mobile/lib/',
        '面板那一族的标识符「' + m + '」又出现了 ⇒ ⇒ 第二条 A2UI 承载正在复活（换个文件名复活也躲不过这一条）');
    }
  }

  return findings;
}

/** 读不到的源 ⇒ ⇒ 退出码 2（**判不了**，不是「没问题」）。 */
function readSource(label, path) {
  if (!existsSync(path)) return { missing: label };
  try {
    return { text: readFileSync(path, 'utf8') };
  } catch (error) {
    return { missing: label + '（读不出来：' + error.message + '）' };
  }
}

function main() {
  const reads = [
    ['chatScreen', 'shadow-mobile/lib/screens/chat_screen.dart', join(REPO_ROOT, 'shadow-mobile', 'lib', 'screens', 'chat_screen.dart')],
    ['chatProvider', 'shadow-mobile/lib/providers/chat_provider.dart', join(REPO_ROOT, 'shadow-mobile', 'lib', 'providers', 'chat_provider.dart')],
    ['localChatView', 'shadow-mobile/lib/widgets/chat/local_chat_view.dart', join(REPO_ROOT, 'shadow-mobile', 'lib', 'widgets', 'chat', 'local_chat_view.dart')],
    ['mobileActivity', 'shadow-mobile/lib/agui/a2ui_activity.dart', join(REPO_ROOT, 'shadow-mobile', 'lib', 'agui', 'a2ui_activity.dart')],
    ['mobileEvents', 'shadow-mobile/lib/agui/agui_events.dart', join(REPO_ROOT, 'shadow-mobile', 'lib', 'agui', 'agui_events.dart')],
    ['mobileInline', 'shadow-mobile/lib/widgets/chat/a2ui_inline_block.dart', join(REPO_ROOT, 'shadow-mobile', 'lib', 'widgets', 'chat', 'a2ui_inline_block.dart')],
  ];

  const missing = [];
  const sources = {};
  for (const row of reads) {
    const got = readSource(row[1], row[2]);
    if (got.missing) {
      missing.push(got.missing);
      continue;
    }
    sources[row[0]] = got.text;
  }

  const libFiles = listDartFiles(join(REPO_ROOT, 'shadow-mobile', 'lib'));
  const testFiles = listDartFiles(join(REPO_ROOT, 'shadow-mobile', 'test'));
  if (libFiles.length === 0) missing.push('shadow-mobile/lib/ 下一个 .dart 都没读到');
  sources.mobileLib = concatFiles(libFiles);
  sources.mobileTest = concatFiles(testFiles);
  sources.panelFiles = PANEL_FILES.filter((f) => existsSync(join(REPO_ROOT, f)));

  if (missing.length > 0) {
    console.error('❌ 判不了：这些源没读全 ⇒ ⇒ 这一格**没验成**（≠ 没问题）');
    for (const m of missing) console.error('   · ' + m);
    process.exit(2);
  }

  const findings = evaluate(sources);
  const broken = new Set(findings.map((f) => f.rule));
  const passed = RULE_COUNT - broken.size;
  if (findings.length === 0) {
    console.log('✅ 移动端只有一条 A2UI 承载（AG-UI ＋ 内联）：' + passed + '/' + RULE_COUNT + ' 条判据全过');
    console.log('   · 负控：独立面板（两代命名）＋ 面板开关 ＋ 面板输入条 ＋ 面板那族类名 都不许复活');
    console.log('   · 正控：AG-UI 内联三跳都在 ＋ 客户端认得那条官方事件 ＋ 内联面不另说会话');
    process.exit(0);
  }
  console.error('❌ 移动端只有一条 A2UI 承载（AG-UI ＋ 内联）：' + passed + '/' + RULE_COUNT + ' 条判据全过');
  for (const f of findings) {
    console.error('   · [' + f.rule + '] ' + f.file + ' ⇒ ⇒ ' + f.detail);
  }
  process.exit(1);
}

/** 自检：合成夹具 ⇒ ⇒ 一份合规 ＋ 六种坏法。 */
function selfTest() {
  const good = {
    chatScreen: [
      "import '../widgets/chat/local_chat_view.dart';",
      'Expanded(child: LocalChatView(...)),',
    ].join(NL),
    chatProvider: [
      "  case 'a2ui_surface':",
      '    service.ingestA2uiOps(ops);',
    ].join(NL),
    localChatView: [
      'if (msg.a2uiSurfaceIds.isNotEmpty)',
      '  A2uiSurfacesBlock(surfaceIds: msg.a2uiSurfaceIds),',
    ].join(NL),
    mobileActivity: "const String a2uiActivityType = 'a2ui-surface';",
    mobileEvents: 'const List<String> aguiKnownEventTypes = <String>[' + NL + "  'RUN_STARTED'," + NL + "  'ACTIVITY_SNAPSHOT'," + NL + '];',
    mobileInline: 'class A2uiInlineBlock extends ConsumerWidget {}',
    mobileLib: 'class ChatScreen {}',
    mobileTest: 'void main() {}',
    panelFiles: [],
  };

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const mutate = (base, fn) => {
    const c = clone(base);
    fn(c);
    return c;
  };

  const broken = [
    ['M1', '对话页又挂上了面板（新名）', mutate(good, (c) => { c.chatScreen = "import '../widgets/chat/a2ui_panel.dart';"; })],
    ['M1', '对话页又挂上了面板（旧名 —— HEAD 里那三个字）', mutate(good, (c) => { c.chatScreen = "import '../widgets/chat/agent2ui_panel.dart';"; })],
    ['M2', '面板文件又回来了（新名）', mutate(good, (c) => { c.panelFiles = ['shadow-mobile/lib/widgets/chat/a2ui_panel.dart']; })],
    ['M2', '面板文件又回来了（旧名 —— 最可能被恢复的那一份）', mutate(good, (c) => { c.panelFiles = ['shadow-mobile/lib/widgets/chat/agent2ui_panel.dart']; })],
    ['M3', '面板开关复活了（新名）', mutate(good, (c) => { c.mobileLib = 'final useA2uiModeProvider = StateProvider<bool>((ref) => false);'; })],
    ['M3', '面板开关复活了（旧名）', mutate(good, (c) => { c.mobileLib = 'final useAgent2UIModeProvider = StateProvider<bool>((ref) => false);'; })],
    ['M4', '面板输入条复活了（新名）', mutate(good, (c) => { c.mobileLib = 'class A2uiInputBar extends ConsumerStatefulWidget {}'; })],
    ['M4', '面板输入条复活了（旧名）', mutate(good, (c) => { c.mobileLib = 'class Agent2UIInputBar extends ConsumerStatefulWidget {}'; })],
    ['M5', 'AG-UI 内联断了一跳', mutate(good, (c) => { c.localChatView = '// 不画了'; })],
    ['M6', '客户端不认那条官方事件', mutate(good, (c) => { c.mobileEvents = "const List<String> aguiKnownEventTypes = <String>['RUN_STARTED'];"; })],
    ['M7', '内联面自己另说会话身份', mutate(good, (c) => { c.mobileInline = 'final sessionId = 1;'; })],
    ['M8', '面板那族的类又出现了（旧名那套实现换个文件名复活）', mutate(good, (c) => { c.mobileLib = 'class Agent2UIView extends ConsumerWidget {}'; })],
  ];

  let total = 0;
  let failed = 0;
  const check = (name, cond) => {
    total += 1;
    if (!cond) failed += 1;
    console.log((cond ? '  [PASS] ' : '  [FAIL] ') + name);
  };

  const clean = evaluate(good);
  check('合规夹具 ⇒ 零条发现', clean.length === 0);

  // ⚠️ **尺子自己也要被量**：名单里**必须两代命名都在** ⇒ ⇒
  // 只列新名 ⇒ ⇒ 「恢复 HEAD 那份旧名面板」会从尺子底下溜过去。
  check('PANEL_FILES 两代命名都在（旧名那三份在名单里）',
    ['shadow-mobile/lib/widgets/chat/agent2ui_panel.dart',
      'shadow-mobile/lib/widgets/chat/agent2ui_view.dart',
      'shadow-mobile/lib/widgets/chat/agent2ui_answer_state.dart'].every((f) => PANEL_FILES.includes(f)));

  for (const row of broken) {
    const findings = evaluate(row[2]);
    const hit = findings.some((f) => f.rule === row[0]);
    check('坏法「' + row[1] + '」⇒ 当场逮到 ' + row[0] + '（发现 ' + findings.length + ' 条）', hit);
  }

  console.log('判据自检：' + (total - failed) + '/' + total);
  if (failed > 0) {
    console.error('❌ 判据自检没过');
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  main();
}
