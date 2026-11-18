#!/usr/bin/env node
/**
 * 桌面端的 A2UI 面**只有一条承载：AG-UI ＋ 内联在对话消息里**。
 *
 * ## 这道闸钉的是什么
 *
 * 2026-11-18 之前，桌面端**同一个页面里住着两条协议**：
 *
 * | 形态 | 传输 | 长在哪 | 记会话吗 |
 * |---|---|---|---|
 * | **独立面板** | **A2A**（`/a2a`） | 对话上方**另一块**（自带视图切换 ＋ 刷新 ＋ 关闭） | **不记** |
 * | **内联** | **AG-UI**（官方 `ACTIVITY_SNAPSHOT`） | **对话消息里**（画在它被点名的那句话下面） | 记 |
 *
 * ⇒ ⇒ 用户诉求逐字（承移动端那一刀的同一句）：「现在移动端 对话也没按和agent2ui页面
 * 还是两个页面 有没有一种可能合并为一个页面使用a2ui 传输协议使用ag-ui」
 * ⇒ ⇒ 台账 㞳 条 ⑦❷ 记着「桌面端同样的重复还在 ⇒ 桌面端另起一刀」⇒ ⇒ **本刀**。
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
 * ## 边界（不扩刀）
 *
 * 客户端工具 `show_a2ui_surface` 的**取数**仍走 A2A（`clientTools.ts` →
 * `requestA2uiSurface`）—— 与移动端 `fetchSurfaceEvents` 同一笔债（端脑给
 * 工具结果挂 `a2ui_operations` 是端脑侧下一刀，两端共用）⇒ ⇒ 本刀不碰 ⇒ ⇒
 * `a2uiClient.ts` **保留** ⇒ ⇒ wire 闸 W7（桌面 `/a2a` 仍在）继续成立。
 *
 * ## 用法
 *
 *   node scripts/check-desktop-single-a2ui-carrier.mjs              # 判
 *   node scripts/check-desktop-single-a2ui-carrier.mjs --self-test  # 判据自检
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
 * 摘掉的那块面板的文件 —— 它们**必须不在**。
 *
 * ⚠️ **复活别名都要盯**（移动端那道闸撞出来的盲点，本闸照抄）：
 * 只盯现名 `A2uiPanel.tsx` ⇒ ⇒ 换个文件名（小写／旧式驼峰）复活照样绿
 * ⇒ ⇒ 尺子自己骗自己 ⇒ ⇒ 现名＋别名都列进来。
 * （桌面端面板**只有一代命名** `A2uiPanel.tsx` —— 与移动端的两代不同。）
 */
export const PANEL_FILES = [
  'shadow-desktop/src/components/chat/A2uiPanel.tsx',
  'shadow-desktop/src/components/chat/a2ui_panel.tsx',
  'shadow-desktop/src/components/chat/Agent2UIPanel.tsx',
];

/**
 * 官方字面量（与 `check-agui-a2ui-wire.mjs` 的 W3 同源 ⇒ ⇒ 不许漂）。
 */
export const A2UI_ACTIVITY_TYPE_LITERAL = "'a2ui-surface'";
export const AGUI_SNAPSHOT_LITERAL = "'ACTIVITY_SNAPSHOT'";

/** 出现次数（纯字符串计数 ⇒ ⇒ 不引正则 ⇒ ⇒ 不用怕反斜杠被吃）。 */
export function hits(src, needle) {
  if (!needle) return 0;
  if (!src) return 0;
  return src.split(needle).length - 1;
}

/**
 * marker 之后的**第一个方括号块**（含括号）—— 与 wire 闸的
 * `bracketBlockAfter` 同形 ⇒ ⇒ 防「同一字面量出现在别处把这一格喂饱」。
 */
export function bracketBlockAfter(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) return null;
  const open = src.indexOf('[', at + marker.length);
  if (open < 0) return null;
  const close = src.indexOf(']', open + 1);
  if (close < 0) return null;
  return src.slice(open, close + 1);
}

/** 递归列目录下的 .ts/.tsx 文件（相对 REPO_ROOT 的路径；跳过 `.` 开头目录）。 */
export function listTsFiles(dirAbs) {
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
      if (e.name.startsWith('.')) continue;
      const child = join(abs, e.name);
      if (e.isDirectory()) walk(child);
      else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) out.push(child);
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

  const conversationPage = sources.conversationPage || '';
  const a2uiActivity = sources.a2uiActivity || '';
  const driver = sources.driver || '';
  const types = sources.types || '';
  const toolSurface = sources.toolSurface || '';
  const allCode = sources.allCode || '';
  const panelFiles = sources.panelFiles || [];

  // M1 —— 对话页**不许**挂那块独立面板（入口那一格）
  //
  // ⚠️ 盯的是**页面对面板的全部接触面**：import ＋ 状态 ＋ 开关按钮 ＋ 渲染。
  if (hits(conversationPage, 'A2uiPanel') > 0
    || hits(conversationPage, 'showA2ui') > 0
    || hits(conversationPage, 'a2ui-toggle') > 0
    || hits(conversationPage, 'a2ui_panel') > 0
    || hits(conversationPage, 'Agent2UIPanel') > 0) {
    add('M1', 'shadow-desktop/src/pages/ConversationPage.tsx',
      '对话页又挂上了「独立 A2UI 面板」⇒ ⇒ 同一个页面里又住着两条协议（A2A 面板 ＋ AG-UI 内联）');
  }

  // M2 —— 面板那个文件**必须不在**（现名＋复活别名）
  for (const f of panelFiles) {
    add('M2', f, '这块「独立面板」的文件又回来了 ⇒ ⇒ 桌面端又有了第二条 A2UI 承载');
  }

  // M3 —— 「面板开/关」那个开关 provider **不许**复活
  //
  // ⚠️ 桌面端从未有过这一格（面板用的是页面本地 useState）⇒ ⇒ 这条是
  // **负控**：谁想复活面板 ＋ 顺手加一个 provider ⇒ ⇒ 当场逮住。
  if (hits(allCode, 'useA2uiModeProvider') > 0
    || hits(allCode, 'useAgent2UIModeProvider') > 0) {
    add('M3', 'shadow-desktop/src/',
      '「面板开/关」那个开关 provider 又回来了 ⇒ ⇒ 面板那条承载正在复活');
  }

  // M4 —— 面板的「开关按钮」那一族**不许**复活
  //
  // ⚠️ M1 盯**页面**；这一条盯**全仓**——把开关按钮挪去别的组件里复活
  // （换文件名／换页面）也躲不过。testid 与状态名都在这一族里。
  if (hits(allCode, 'a2ui-toggle') > 0
    || hits(allCode, 'A2uiToggle') > 0
    || hits(allCode, 'showA2ui') > 0) {
    add('M4', 'shadow-desktop/src/',
      'A2UI 面板的开关按钮那一族又回来了 ⇒ ⇒ 「顶部另一块」的入口正在复活');
  }

  // M5 —— **正控**：AG-UI 内联那条**三跳**都还在
  //
  // ❶ activity 常量字面量（官方 `a2ui-surface`）—— 带等号判定 ⇒ ⇒
  //    防止「注释里提到这个词」把这一格喂饱；
  // ❷ driver 里的 ACTIVITY_SNAPSHOT 档；
  // ❸ 对话页把面画在**那条消息下面**。
  if (hits(a2uiActivity, "A2UI_ACTIVITY_TYPE = 'a2ui-surface'") === 0) {
    add('M5', 'shadow-desktop/src/lib/agui/a2uiActivity.ts',
      'AG-UI 承载 A2UI 的 activity 常量字面量不见了 ⇒ ⇒ 官方形状那条路断了');
  }
  if (hits(driver, "case 'ACTIVITY_SNAPSHOT':") === 0
    || hits(driver, "kind: 'a2ui_surface'") === 0) {
    add('M5', 'shadow-desktop/src/lib/agui/driver.ts',
      'AG-UI 驱动里没有 ACTIVITY_SNAPSHOT 那一档 ⇒ ⇒ 端脑 paint 的面进不了界面');
  }
  if (hits(conversationPage, 'A2uiOpsSurface') === 0
    || hits(conversationPage, 'msg.a2ui_surface.messages') === 0) {
    add('M5', 'shadow-desktop/src/pages/ConversationPage.tsx',
      '消息列表里不画 A2uiOpsSurface ⇒ ⇒ 面没有长在对话消息里（不许退回「顶部一块」）');
  }

  // M6 —— **客户端认得那条官方事件**
  //
  // ⚠️ 与 wire 闸 W4 同形：只认 `AGUI_KNOWN_EVENT_TYPES` **那一块**里的
  // 字面量 ⇒ ⇒ 防「类型别名那行把这一格喂饱」。
  // wire 闸**跨仓不进 CI** ⇒ ⇒ 本条是「CI 里有分母的那一份」（移动端闸 M6 同理）。
  const knownBlock = bracketBlockAfter(types, 'AGUI_KNOWN_EVENT_TYPES');
  if (!knownBlock || hits(knownBlock, AGUI_SNAPSHOT_LITERAL) === 0) {
    add('M6', 'shadow-desktop/src/lib/agui/types.ts',
      '客户端的已知事件类型里没有 ACTIVITY_SNAPSHOT ⇒ ⇒ 端脑 paint 的面会被当成「不认识」⇒ ⇒ 面静默消失');
  }

  // M7 —— 内联面**不许自己另说会话身份**
  //
  // ⚠️ 桌面端唯一的 A2UI 承载是**内联在对话里** ⇒ ⇒ 它**继承**那条对话的
  // 会话身份（AG-UI 请求打的是 `/conversations/{id}/ag-ui:stream`）⇒ ⇒ 允许。
  // ⇒ ⇒ 但它**不许自己另说**一条会话 id ⇒ ⇒ 那会是「界面说谎」。
  //
  // ⚠️ 与 `check-a2ui-session-identity.mjs` **分工**：那边管**端脑 `/a2a`**
  // 「落不落会话」与**仍存在的独立 A2A 形态** ⇒ ⇒ 本刀摘掉桌面那块 ⇒ ⇒
  // 那边 `CLIENTS` 已空 ⇒ ⇒ 这边管**内联块**（移动端闸 M7 同理）。
  for (const m of ['sessionId', 'activeConversationAgent', 'deriveConversationTitle']) {
    if (hits(toolSurface, m) > 0) {
      add('M7', 'shadow-desktop/src/components/chat/A2uiToolSurface.tsx',
        '内联的那块面自己引用了「' + m + '」⇒ ⇒ 它在另说一条会话 ⇒ ⇒ 它继承的是对话那条 ⇒ ⇒ 不许自己另说');
    }
  }

  // M8 —— 那块「A2A 面板」的组件**不许**在任何 .ts/.tsx 里复活
  //
  // ⚠️ M1–M4 盯的是「**入口**」⇒ ⇒ 而面板那套实现可以被**换个文件名**复活
  // ⇒ ⇒ 入口没红、第二条承载已经回来了 ⇒ ⇒ **得盯组件族标识符**。
  //
  // ⚠️ **为什么不是「不许出现 a2ui 这个词」**：AG-UI 内联那条路**合法地**
  // 带着 `a2ui` 前缀（`a2ui_surface`／`A2uiOpsSurface`／`a2uiActivity`）
  // ⇒ ⇒ 负控必须落在**「面板那一族」的专属标识符**上 ⇒ ⇒ 不许宽到误伤
  // 合法那条路。
  for (const m of ['A2uiPanel', 'A2uiPanelProps', 'Agent2UIPanel']) {
    if (hits(allCode, m) > 0) {
      add('M8', 'shadow-desktop/src/',
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
    ['conversationPage', 'shadow-desktop/src/pages/ConversationPage.tsx', join(REPO_ROOT, 'shadow-desktop', 'src', 'pages', 'ConversationPage.tsx')],
    ['a2uiActivity', 'shadow-desktop/src/lib/agui/a2uiActivity.ts', join(REPO_ROOT, 'shadow-desktop', 'src', 'lib', 'agui', 'a2uiActivity.ts')],
    ['driver', 'shadow-desktop/src/lib/agui/driver.ts', join(REPO_ROOT, 'shadow-desktop', 'src', 'lib', 'agui', 'driver.ts')],
    ['types', 'shadow-desktop/src/lib/agui/types.ts', join(REPO_ROOT, 'shadow-desktop', 'src', 'lib', 'agui', 'types.ts')],
    ['toolSurface', 'shadow-desktop/src/components/chat/A2uiToolSurface.tsx', join(REPO_ROOT, 'shadow-desktop', 'src', 'components', 'chat', 'A2uiToolSurface.tsx')],
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

  const srcFiles = listTsFiles(join(REPO_ROOT, 'shadow-desktop', 'src'));
  const testsFiles = listTsFiles(join(REPO_ROOT, 'shadow-desktop', 'tests'));
  if (srcFiles.length === 0) missing.push('shadow-desktop/src/ 下一个 .ts/.tsx 都没读到');
  sources.allCode = concatFiles(srcFiles.concat(testsFiles));
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
    console.log('✅ 桌面端只有一条 A2UI 承载（AG-UI ＋ 内联）：' + passed + '/' + RULE_COUNT + ' 条判据全过');
    console.log('   · 负控：独立面板（现名＋复活别名）＋ 面板开关 provider ＋ 开关按钮族 ＋ 面板族标识符 都不许复活');
    console.log('   · 正控：AG-UI 内联三跳都在 ＋ 客户端认得那条官方事件 ＋ 内联面不另说会话');
    process.exit(0);
  }
  console.error('❌ 桌面端只有一条 A2UI 承载（AG-UI ＋ 内联）：' + passed + '/' + RULE_COUNT + ' 条判据全过');
  for (const f of findings) {
    console.error('   · [' + f.rule + '] ' + f.file + ' ⇒ ⇒ ' + f.detail);
  }
  process.exit(1);
}

/** 自检：合成夹具 ⇒ ⇒ 一份合规 ＋ 每条判据各一道坏法。 */
function selfTest() {
  const good = {
    conversationPage: [
      "import { A2uiOpsSurface } from '../components/chat/A2uiToolSurface';",
      '{msg.a2ui_surface ? (',
      '  <A2uiOpsSurface messages={msg.a2ui_surface.messages} />',
      ') : null}',
    ].join(NL),
    a2uiActivity: "export const A2UI_ACTIVITY_TYPE = 'a2ui-surface';",
    driver: [
      "case 'ACTIVITY_SNAPSHOT': {",
      "  yield { kind: 'a2ui_surface', messageId: ev.messageId, ops };",
    ].join(NL),
    types: [
      'export const AGUI_KNOWN_EVENT_TYPES = [',
      "  'RUN_STARTED',",
      "  'ACTIVITY_SNAPSHOT',",
      '] as const;',
    ].join(NL),
    toolSurface: 'export function A2uiOpsSurface({ messages }: { messages: unknown[] }) {}',
    allCode: 'export function ToolCallMessageCard() {}',
    panelFiles: [],
  };

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const mutate = (base, fn) => {
    const c = clone(base);
    fn(c);
    return c;
  };

  const broken = [
    ['M1', '对话页又挂上了面板（import）', mutate(good, (c) => { c.conversationPage = "import { A2uiPanel } from '../components/chat/A2uiPanel';"; })],
    ['M1', '对话页又挂上了面板（开关状态）', mutate(good, (c) => { c.conversationPage = 'const [showA2ui, setShowA2ui] = useState(false);'; })],
    ['M2', '面板文件又回来了（现名）', mutate(good, (c) => { c.panelFiles = ['shadow-desktop/src/components/chat/A2uiPanel.tsx']; })],
    ['M2', '面板文件又回来了（复活别名）', mutate(good, (c) => { c.panelFiles = ['shadow-desktop/src/components/chat/a2ui_panel.tsx']; })],
    ['M3', '面板开关 provider 复活了', mutate(good, (c) => { c.allCode = 'export const useA2uiModeProvider = () => false;'; })],
    ['M4', '开关按钮那一族复活了（全仓扫）', mutate(good, (c) => { c.allCode = "<Button data-testid='a2ui-toggle'>A2UI</Button>"; })],
    ['M4', '开关按钮那一族复活了（换个组件）', mutate(good, (c) => { c.allCode = 'const [showA2ui, setShowA2ui] = useState(false);'; })],
    ['M5', 'AG-UI 内联断了一跳（activity 字面量）', mutate(good, (c) => { c.a2uiActivity = "export const A2UI_ACTIVITY_TYPE = 'a2ui-v2';"; })],
    ['M5', 'AG-UI 内联断了一跳（driver 档）', mutate(good, (c) => { c.driver = '// 不认这条事件了'; })],
    ['M5', 'AG-UI 内联断了一跳（页面渲染）', mutate(good, (c) => { c.conversationPage = '// 不画了'; })],
    ['M6', '客户端不认那条官方事件（块内删除）', mutate(good, (c) => { c.types = "export const AGUI_KNOWN_EVENT_TYPES = ['RUN_STARTED'] as const;"; })],
    ['M6', '客户端不认那条官方事件（marker 没了）', mutate(good, (c) => { c.types = "export type A = 'ACTIVITY_SNAPSHOT';"; })],
    ['M7', '内联面自己另说会话身份', mutate(good, (c) => { c.toolSurface = 'const sessionId = 1;'; })],
    ['M8', '面板那族组件换个文件名复活', mutate(good, (c) => { c.allCode = 'export class Agent2UIPanel extends Component {}'; })],
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

  // ⚠️ **尺子自己也要被量**：名单里**现名＋复活别名都在** ⇒ ⇒
  // 只列现名 ⇒ ⇒ 换个文件名复活会从尺子底下溜过去。
  check('PANEL_FILES 现名＋复活别名都在',
    PANEL_FILES.includes('shadow-desktop/src/components/chat/A2uiPanel.tsx')
    && PANEL_FILES.includes('shadow-desktop/src/components/chat/a2ui_panel.tsx')
    && PANEL_FILES.includes('shadow-desktop/src/components/chat/Agent2UIPanel.tsx'));

  // ⚠️ M6 用的是**块判定**不是裸词 ⇒ ⇒ 类型别名那一行喂不饱它
  //（good 夹具里类型别名与已知事件块**并存** ⇒ ⇒ 仍判绿）。
  check('M6 块判定：字面量在别处出现不喂饱（块里必须有）',
    evaluate(good).length === 0
    && (() => {
      const tricky = clone(good);
      tricky.types = [
        "export type A = 'ACTIVITY_SNAPSHOT';",
        'export const AGUI_KNOWN_EVENT_TYPES = ["RUN_STARTED"] as const;',
      ].join(NL);
      return evaluate(tricky).some((f) => f.rule === 'M6');
    })());

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
