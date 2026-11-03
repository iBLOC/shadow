#!/usr/bin/env node
/**
 * 跨端客户端工具一致性校验
 *
 * ## 为什么要有这个守卫
 *
 * 两端（桌面 / 移动）是**同一个 agent 的两个终端**。客户端工具 = 「在这台设备上执行的那一半」，
 * 注册表**导出的那份 `tools` 数组**会被端脑透传给 LLM ⇒ 模型据此决定调哪个工具、怎么传参。
 *
 * 两端源码都写着同一句不变量：
 *   - 桌面 `src/lib/clientTools.ts:143-145`：「两端（桌面端 / 移动端）的同名工具必须导出同样的内容
 *     ⇒ 不然同一个模型在手机上和桌面上行为不一样」
 *   - 移动 `lib/services/client_tools/client_tool_registry.dart:206-207`：同一句
 *
 * ⚠️ 但**这句话一直没有守卫** —— 两边各写各的，改了一边没人知道。
 * 2026-10-31 的对齐审计实测抓到：桌面端有 `set_theme` + `ask_user`，
 * 移动端**只有 `set_theme`** ⇒ 模型在手机上根本调不出「反问用户」。
 *
 * 这个脚本把那句话变成**可执行的不变量**。
 *
 * ## 比对什么
 *
 * 比对**发给模型的那一份**（`toOpenAiTools` 的输出形状），不是比对源码文本：
 *   tool 名 / description / parameters（JSON Schema）
 *
 * ⚠️ **只比对「发给模型的部分」** —— `execute` 实现两端必然不同（桌面走 zustand、
 * 移动走 Riverpod），那不是「发给模型的内容」。
 *
 * ## 用法
 *
 *   node scripts/check-client-tools.mjs
 *
 * 退出码 0 = 通过；1 = 有阻断问题。
 *
 * ⚠️ **端侧专属工具怎么表达**：如果将来某端真的要多一个工具（比如手机有麦克风、
 * 桌面没有窗口），那**不是**「漂移」，而是**显式声明的分叉** ——
 * 写进本脚本下方的 `ALLOWED_DIVERGENCES`，并写清理由。**默认不允许悄悄分叉。**
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DESKTOP_FILE = 'shadow-desktop/src/lib/clientTools.ts';
const MOBILE_FILE = 'shadow-mobile/lib/services/client_tools/client_tool_registry.dart';

/**
 * 允许的显式分叉 —— 每个都要写清理由。
 *
 * 形如：`{ tool: 'xxx', end: 'mobile' | 'desktop', reason: '为什么这端独有', status: 'accepted' | 'known-gap' }`
 *
 * - `accepted`（默认）：**产品决定**的端侧专属差异 —— 这是合法分叉，**不报**。
 * - `known-gap`：**已知但还没补**的缺口 —— 报**警告**（不阻断），但缺口留在视野里，
 *   不会被「加豁免」这个动作悄悄抹掉。
 *
 * ⚠️ **加一条之前先问一句**：这个差异是**产品决定的**（端侧专属），
 * 还是**忘了做**（漂移）？后者应该补实现，不是加豁免 ——
 * 实在要缓，就用 `known-gap` 并写清什么时候补。
 */
const ALLOWED_DIVERGENCES = [
  {
    tool: 'ask_user',
    end: 'mobile',
    status: 'known-gap',
    reason:
      '⚠️ 已知缺口（2026-10-31 对齐审计 A10）：移动端**整条**「模型反问用户」链路缺失 —— ' +
      '注册表没有这个工具，ToolCallStatus 也没有 awaitingInput 状态，' +
      '工具卡片不支持等用户填表。桌面端有（clientTools.ts:212，ConversationPage.tsx:499 走 collectsInput → awaiting-input）。' +
      '⇒ 模型在手机上根本调不出「反问用户」。' +
      '待补：移动端补工具注册 + awaitingInput 状态 + 表单 UI + 结果回传。',
  },
  // ── 设备能力工具（手机独有）─────────────────────────────────
  // 日历 / 联系人 / 短信 / 相册是**这台手机上**的东西 ——
  // 桌面端没有「这台机器的日历」可读 ⇒ ⇒ 做不出这个工具（不是忘了做）
  // ⇒ ⇒ 记为 accepted（合法分叉），不是 known-gap（缺口）。
  {
    tool: 'calendar_read_events',
    end: 'desktop',
    status: 'accepted',
    reason:
      '✅ 产品决定（2026-11-03 设备能力授权）：日历 / 联系人 / 短信 / 相册是**手机上的东西** —— ' +
      '桌面端没有「这台机器的日历」可读 ⇒ ⇒ 桌面端做不出这个工具（不是忘了做）。' +
      '⇒ 手机上这五个工具各自带一档**按能力**的授权（每次询问 / 完全访问），' +
      '系统权限在原生层逐个申请 ⇒ ⇒ 装完 App 不会「默认就能读走你的日历」。',
  },
  {
    tool: 'calendar_write_event',
    end: 'desktop',
    status: 'accepted',
    reason:
      '同上 —— 手机独有的能力（写日历）。' +
      '⚠️ 写日历与读日历是**两个独立档位**（一个是副作用面，一个是外泄面）。',
  },
  {
    tool: 'contacts_search',
    end: 'desktop',
    status: 'accepted',
    reason: '同上 —— 手机独有的能力（读通讯录）。',
  },
  {
    tool: 'sms_read_messages',
    end: 'desktop',
    status: 'accepted',
    reason: '同上 —— 手机独有的能力（读短信）。',
  },
  {
    tool: 'photos_list_recent',
    end: 'desktop',
    status: 'accepted',
    reason: '同上 —— 手机独有的能力（读相册**元数据**，不取像素）。',
  },
  // ── 手机操作（mobile use，手机独有）──────────────────────────
  // ⚠️ 桌面端**有** computer-use —— 但它操作的是「**这台电脑**的屏幕与鼠标」，
  // 不是「**这台手机**」⇒ ⇒ 语义不同，不是同一个工具 ⇒ ⇒ 端侧专属差异。
  // ⇒ ⇒ 移动端这一族自带一档「手机操作」的授权（每次询问 / 完全访问 / 彻底关闭）
  // ⇒ ⇒ 装完 App 不会「默认就能点你的屏幕」。
  {
    tool: 'mobile_read_screen',
    end: 'desktop',
    status: 'accepted',
    reason:
      '✅ 产品决定（2026-11-03 手机操作能力）：读这台手机的当前屏幕（可访问性树）。' +
      '桌面端的 computer-use 读的是**电脑**的屏幕 ⇒ ⇒ 不是同一个东西。',
  },
  {
    tool: 'mobile_tap',
    end: 'desktop',
    status: 'accepted',
    reason: '同上 —— 手机独有的能力（点这台手机的屏幕）。',
  },
  {
    tool: 'mobile_long_press',
    end: 'desktop',
    status: 'accepted',
    reason: '同上 —— 手机独有的能力（长按这台手机的屏幕）。',
  },
  {
    tool: 'mobile_swipe',
    end: 'desktop',
    status: 'accepted',
    reason: '同上 —— 手机独有的能力（滑动这台手机的屏幕）。',
  },
  {
    tool: 'mobile_find_and_click',
    end: 'desktop',
    status: 'accepted',
    reason: '同上 —— 手机独有的能力（按文字点击这台手机上的控件）。',
  },
  {
    tool: 'mobile_global_action',
    end: 'desktop',
    status: 'accepted',
    reason: '同上 —— 手机独有的能力（返回 / 桌面 / 最近任务等系统动作）。',
  },
];
// ─────────────────────────────────────────────────────────────
// 提取：桌面端
// ─────────────────────────────────────────────────────────────

/**
 * 桌面端：`desktopClientTools` 是一串 `.register({ name, description, parameters, ... })`。
 *
 * 用「括号配平」切出每个 `.register({...})` 的字面量，再从里面抠 name/description/parameters。
 * ⚠️ 不能用正则去 match `name:` —— execute 闭包里也有 name 变量。
 */
function extractDesktopTools(src) {
  const tools = [];
  const anchor = src.indexOf('export const desktopClientTools');
  if (anchor < 0) throw new Error('找不到 desktopClientTools');

  // 从 anchor 起，逐个找 `.register(` 并配平括号
  let i = src.indexOf('.register(', anchor);
  while (i >= 0) {
    const open = src.indexOf('{', i);
    if (open < 0) break;
    const body = matchBraces(src, open);
    if (!body) break;

    const name = pickString(body.text, 'name');
    const description = pickString(body.text, 'description');
    const parameters = pickObject(body.text, 'parameters');

    if (name) {
      tools.push({
        name,
        description,
        parameters,
        line: lineOf(src, open),
      });
    }
    i = src.indexOf('.register(', body.end + 1);
  }
  return tools;
}

// ─────────────────────────────────────────────────────────────
// 提取：移动端
// ─────────────────────────────────────────────────────────────

/**
 * 移动端：`buildMobileClientTools` 返回 `ClientToolRegistry([ ClientTool(name: ..., description: ..., parameters: <String, dynamic>{...}), ... ])`。
 *
 * 同样按括号配平切出每个 `ClientTool(` 的字面量。
 */
function extractMobileTools(src) {
  const tools = [];
  const anchor = src.indexOf('ClientToolRegistry buildMobileClientTools');
  if (anchor < 0) throw new Error('找不到 buildMobileClientTools');

  let i = src.indexOf('ClientTool(', anchor);
  while (i >= 0) {
    const open = src.indexOf('(', i);
    if (open < 0) break;
    const body = matchBraces(src, open, '(', ')');
    if (!body) break;

    const name = pickString(body.text, 'name');
    const description = pickString(body.text, 'description');
    const parameters = pickObject(body.text, 'parameters');

    if (name) {
      tools.push({
        name,
        description,
        parameters,
        line: lineOf(src, open),
      });
    }
    i = src.indexOf('ClientTool(', body.end + 1);
  }
  return tools;
}

// ─────────────────────────────────────────────────────────────
// 迷你解析工具（不引第三方依赖 —— CI 里少一个依赖少一份风险）
// ─────────────────────────────────────────────────────────────

/** 从 openIdx 处的括号开始配平，返回内部文本与结束位置。 */
function matchBraces(src, openIdx, openCh = '{', closeCh = '}') {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      i = skipString(src, i);
      continue;
    }
    if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) {
        return { text: src.slice(openIdx + 1, i), end: i };
      }
    }
  }
  return null;
}

/** 跳过字符串字面量（含转义），返回结束引号的下标。 */
function skipString(src, i) {
  const quote = src[i];
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') {
      j++;
      continue;
    }
    if (src[j] === quote) return j;
  }
  return src.length - 1;
}

/**
 * 取 `key: 'value'` 或 `key: "value"` 的字符串值。
 * ⚠️ 只在**顶层**找（跳过嵌套大括号里的），避免抓到 execute 闭包里的同名 key。
 */
function pickString(text, key) {
  // ⚠️ key 可能是 `'description'`（Dart）也可能是 `description`（TS）⇒ 引号要可选。
  const re = new RegExp(
    `(?:^|[\\s{,])'?${key}'?\\s*:\\s*('([^'\\\\]*(?:\\\\.[^'\\\\]*)*)'|"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)")`,
    'm'
  );
  const m = re.exec(text);
  if (!m) return null;
  const raw = m[2] !== undefined ? m[2] : m[3];
  return unescapeBasic(raw);
}

/**
 * 取 `key: ['a', 'b']` 的字符串数组（用于 `enum`）。
 *
 * ⚠️ **顺序会被排序** —— 模型看的是**集合** ⇒ 顺序不同不算漂移。
 * ⚠️ **取不到返回 null**（不是空数组）⇒ 「没有这个键」与「空数组」能分开。
 */
function pickStringArray(text, key) {
  const re = new RegExp(`(?:^|[\\s{,])'?${key}'?\\s*:\\s*\\[([^\\]]*)\\]`, 'm');
  const m = re.exec(text);
  if (!m) return null;
  const items = [...m[1].matchAll(/'([^']*)'|"([^"]*)"/g)].map((x) =>
    x[1] !== undefined ? x[1] : x[2]
  );
  return items.sort();
}

/**
 * 取 `key: { ... }` 的对象字面量 —— 返回**规范化**后的结构（用于比对）。
 * ⚠️ Dart 与 TS 的字面量写法不同（`<String, dynamic>{...}` vs `{...}`），
 * 但**结构**一样 ⇒ 规范化后可比。
 */
function pickObject(text, key) {
  const re = new RegExp(`(?:^|[\\s{,])'?${key}'?\\s*:\\s*`, 'm');
  const m = re.exec(text);
  if (!m) return null;
  const after = m.index + m[0].length;
  // 跳过 Dart 的类型参数 `<String, dynamic>`
  let start = after;
  const dartType = /^<[^>]*>\s*/.exec(text.slice(start));
  if (dartType) start += dartType[0].length;
  if (text[start] !== '{') return null;
  const body = matchBraces(text, start);
  if (!body) return null;
  return normalizeObject(body.text);
}

/**
 * 把对象字面量文本规范化成可比较的结构。
 *
 * 只保留**发给模型**时真正会出现的部分：
 *   - `type` / `properties`（每个 property 的 `type` / `description` / `enum`）/ `required`
 *
 * ⚠️ 故意**不**保留 key 的顺序 ⇒ 两端 key 顺序不同不算漂移（模型不关心）。
 * ⚠️ 故意保留 property 的**描述文本** ⇒ 描述不一样就是漂移（模型看得见）。
 * ⚠️ **保留 `enum`** —— 它决定模型能填**哪几个值** ⇒ 两端不一样
 * ⇒ ⇒ 同一个模型在手机上和桌面上行为不同 ⇒ ⇒ 那就是漂移。
 * （⚠️ 2026-11-02 补：此前**只抽 type / description / required**
 * ⇒ `enum` 漂了闸**看不见** ⇒ ⇒ 闸会「静悄悄地不再管这件事」。）
 */
function normalizeObject(text) {
  const out = {};
  // ⚠️ key 可能是 `'type'`（Dart）也可能是 `type`（TS）⇒ 前导字符类要含引号。
  const typeMatch = /(?:^|[\s{,])'?type'?\s*:\s*'([^']*)'|"([^"]*)"/.exec(text);
  if (typeMatch) out.type = typeMatch[1] !== undefined ? typeMatch[1] : typeMatch[2];

  // required: ['question'] —— 只取数组里的字符串
  const reqMatch = /(?:^|[\s{,])'?required'?\s*:\s*\[([^\]]*)\]/.exec(text);
  if (reqMatch) {
    out.required = [...reqMatch[1].matchAll(/'([^']*)'|"([^"]*)"/g)]
      .map((m) => (m[1] !== undefined ? m[1] : m[2]))
      .sort();
  }

  // properties: { name: { ... } }  或  properties: <String, dynamic>{ ... }
  // ⚠️ Dart 侧带类型参数 ⇒ 正则里要把 `<...>` 也吃掉。
  const propMatch = /(?:^|[\s{,])'?properties'?\s*:\s*(?:<[^>]*>\s*)?\{/.exec(text);
  if (propMatch) {
    const braceStart = propMatch.index + propMatch[0].length - 1;
    const body = matchBraces(text, braceStart);
    if (body) {
      out.properties = {};
      for (const [pname, pbody] of splitEntries(body.text)) {
        const p = {};
        const pt = /(?:^|[\s{,])'?type'?\s*:\s*'([^']*)'|"([^"]*)"/.exec(pbody);
        if (pt) p.type = pt[1] !== undefined ? pt[1] : pt[2];
        const pd = pickString(pbody, 'description');
        if (pd !== null) p.description = pd;
        const pe = pickStringArray(pbody, 'enum');
        if (pe !== null) p.enum = pe;
        out.properties[pname] = p;
      }
    }
  }
  return out;
}

/** 把 `a: {...}, b: {...}` 切成条目（也要能吃 Dart 的 `<String, dynamic>{...}`）。 */
function splitEntries(text) {
  const entries = [];
  const re = /(?:^|[\s{,])'?([A-Za-z_][A-Za-z0-9_]*)'?\s*:\s*(?:<[^>]*>\s*)?\{/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const key = m[1];
    const braceStart = m.index + m[0].length - 1;
    const body = matchBraces(text, braceStart);
    if (!body) continue;
    entries.push([key, body.text]);
    re.lastIndex = body.end + 1;
  }
  return entries;
}

function unescapeBasic(s) {
  return s.replace(/\\(['"\\nrt])/g, (_, c) => {
    switch (c) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      default:
        return c;
    }
  });
}

function lineOf(src, idx) {
  return src.slice(0, idx).split('\n').length;
}

// ─────────────────────────────────────────────────────────────
// 比对
// ─────────────────────────────────────────────────────────────

function compare(desktop, mobile) {
  const errors = [];
  const warnings = [];

  const dMap = new Map(desktop.map((t) => [t.name, t]));
  const mMap = new Map(mobile.map((t) => [t.name, t]));

  /** 查这个差异有没有被登记豁免。 */
  const waiverFor = (tool, end) =>
    ALLOWED_DIVERGENCES.find((d) => d.tool === tool && d.end === end);

  // 1. 只在桌面端有的工具
  for (const [name, d] of dMap) {
    if (!mMap.has(name)) {
      const w = waiverFor(name, 'mobile');
      if (w?.status === 'accepted') continue;
      if (w?.status === 'known-gap') {
        warnings.push(`工具 "${name}" 移动端缺失 —— 已登记为 known-gap：${w.reason}`);
        continue;
      }
      errors.push(
        `工具 "${name}" 只有桌面端有（${DESKTOP_FILE}:${d.line}），移动端没有` +
          ` —— 模型在手机上就调不出它。要么补移动端，要么在 ALLOWED_DIVERGENCES 里显式声明分叉。`
      );
    }
  }

  // 2. 只在移动端有的工具
  for (const [name, m] of mMap) {
    if (!dMap.has(name)) {
      const w = waiverFor(name, 'desktop');
      if (w?.status === 'accepted') continue;
      if (w?.status === 'known-gap') {
        warnings.push(`工具 "${name}" 桌面端缺失 —— 已登记为 known-gap：${w.reason}`);
        continue;
      }
      errors.push(
        `工具 "${name}" 只有移动端有（${MOBILE_FILE}:${m.line}），桌面端没有` +
          ` —— 模型在电脑上就调不出它。要么补桌面端，要么在 ALLOWED_DIVERGENCES 里显式声明分叉。`
      );
    }
  }

  // 3. 两端都有的：逐字段比对
  for (const [name, d] of dMap) {
    const m = mMap.get(name);
    if (!m) continue;

    if (d.description !== m.description) {
      errors.push(
        `工具 "${name}" 的 description 两端不一致 —— 这段文字是**发给模型看的**：` +
          `桌面「${d.description}」(${DESKTOP_FILE}:${d.line}) vs ` +
          `移动「${m.description}」(${MOBILE_FILE}:${m.line})`
      );
    }

    const dp = d.parameters ?? { type: 'object', properties: {} };
    const mp = m.parameters ?? { type: 'object', properties: {} };
    if (JSON.stringify(dp) !== JSON.stringify(mp)) {
      errors.push(
        `工具 "${name}" 的 parameters（JSON Schema）两端不一致 —— ` +
          `这决定模型怎么传参：\n` +
          `    桌面 ${DESKTOP_FILE}:${d.line} → ${JSON.stringify(dp)}\n` +
          `    移动 ${MOBILE_FILE}:${m.line} → ${JSON.stringify(mp)}`
      );
    }
  }

  if (desktop.length === 0 && mobile.length === 0) {
    warnings.push('两端都没提取到工具 —— 提取逻辑可能失效了（静默通过比失败更糟）');
  }

  return { errors, warnings };
}

// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// 自检（--self-test）：证明这把闸**有分辨力**，不是恒绿
// ─────────────────────────────────────────────────────────────
/**
 * 四颗钉子：
 *   1. 两端逐字一致 ⇒ **不报**；
 *   2. `enum` 不一致 ⇒ **必须报**（本轮补上的那个盲点）；
 *   3. 一边没有 `enum` ⇒ **必须报**（「没这个键」≠「空数组」）；
 *   4. `required` 不一致 ⇒ **必须报**（闸早就有这个能力，别退化了）。
 *
 * ⚠️ **为什么要有**：判据一旦放宽（忘了抽 `enum`），闸会**静悄悄地
 * 不再管这件事** ⇒ ⇒ 两端漂了也没人知道 ⇒ ⇒ 那就是恒绿。
 */
function runSelfTest() {
  const desktopSrc = (params) => `
export const desktopClientTools = new ClientToolRegistry()
  .register({
    name: 'show_a2ui_surface',
    description: 'SAME',
    parameters: ${params},
    execute: async () => ({}),
  });
`;
  const mobileSrc = (params) => `
ClientToolRegistry buildMobileClientTools() {
  return ClientToolRegistry([
    ClientTool(
      name: 'show_a2ui_surface',
      description: 'SAME',
      parameters: <String, dynamic>${params},
    ),
  ]);
}
`;

  const VIEW_ENUM =
    "{ type: 'object', required: ['view'], properties: { view: { type: 'string', enum: ['tasks', 'agents'], description: 'd' } } }";
  const VIEW_ENUM_DIFF =
    "{ type: 'object', required: ['view'], properties: { view: { type: 'string', enum: ['tasks'], description: 'd' } } }";
  const VIEW_NO_ENUM =
    "{ type: 'object', required: ['view'], properties: { view: { type: 'string', description: 'd' } } }";
  const VIEW_NO_REQUIRED =
    "{ type: 'object', properties: { view: { type: 'string', enum: ['tasks', 'agents'], description: 'd' } } }";

  const cases = [
    { name: '两端逐字一致 ⇒ 不报', d: VIEW_ENUM, m: VIEW_ENUM, want: 0 },
    { name: 'enum 不一致 ⇒ 报', d: VIEW_ENUM, m: VIEW_ENUM_DIFF, want: 1 },
    { name: '一边没有 enum ⇒ 报', d: VIEW_ENUM, m: VIEW_NO_ENUM, want: 1 },
    { name: 'required 不一致 ⇒ 报', d: VIEW_ENUM, m: VIEW_NO_REQUIRED, want: 1 },
  ];

  let failed = 0;
  for (const c of cases) {
    const d = extractDesktopTools(desktopSrc(c.d));
    const m = extractMobileTools(mobileSrc(c.m));
    const { errors } = compare(d, m);
    const ok = errors.length === c.want;
    if (!ok) failed += 1;
    console.log(
      `  ${ok ? '✓' : '✗'} ${c.name}（期望 ${c.want} 条，实际 ${errors.length} 条）`
    );
    if (!ok) for (const e of errors) console.log(`      ${e.split('\n')[0]}`);
  }
  console.log(`\n自检 ${cases.length - failed}/${cases.length} 通过`);
  process.exit(failed > 0 ? 1 : 0);
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
}

const errors = [];
const warnings = [];
const infos = [];

for (const rel of [DESKTOP_FILE, MOBILE_FILE]) {
  if (!existsSync(join(ROOT, rel))) {
    errors.push(`文件缺失：${rel}`);
  }
}

if (errors.length === 0) {
  let desktop = [];
  let mobile = [];
  try {
    desktop = extractDesktopTools(readFileSync(join(ROOT, DESKTOP_FILE), 'utf8'));
    mobile = extractMobileTools(readFileSync(join(ROOT, MOBILE_FILE), 'utf8'));
  } catch (e) {
    errors.push(`提取失败：${e.message}`);
  }

  if (errors.length === 0) {
    infos.push(
      `桌面端工具 ${desktop.length} 个（${desktop.map((t) => t.name).join(', ') || '无'}），` +
        `移动端工具 ${mobile.length} 个（${mobile.map((t) => t.name).join(', ') || '无'}）`
    );

    const cmp = compare(desktop, mobile);
    errors.push(...cmp.errors);
    warnings.push(...cmp.warnings);
  }
}

// ─────────────────────────────────────────────────────────────
report();

function report() {
  const line = '─'.repeat(72);
  console.log(line);
  console.log('跨端客户端工具一致性校验 —— 两端发给模型的 tools 必须一样');
  console.log(line);

  for (const i of infos) console.log(`  ·  ${i}`);
  for (const w of warnings) console.log(`  !  ${w}`);
  for (const e of errors) console.error(`  ✗  ${e}`);

  console.log(line);
  console.log(
    `阻断 ${errors.length} 项 / 提示 ${warnings.length} 项 / 信息 ${infos.length} 项`
  );
  console.log(line);

  process.exit(errors.length > 0 ? 1 : 0);
}
