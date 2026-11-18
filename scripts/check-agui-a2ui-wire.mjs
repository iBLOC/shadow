#!/usr/bin/env node
/**
 * AG-UI 承载 A2UI 的 **wire 形状闸**
 * ============================================================================
 *
 * ## 它钉什么
 *
 * 2026-11-17 那一刀把「面向用户的 A2UI 面」的承载从 A2A 换成 AG-UI
 * （用户裁决：「agui 主要是对用户 和 agent 间无关」＋「多种协议尽量都要兼容
 * 所以保留 a2a」）⇒ ⇒ **面只有一份、承载有两条**：
 *
 *   · **AG-UI** ＝ 对用户那条（官方口径：AG-UI 是 Agent↔User 的标准传输绑定）
 *   · **A2A**   ＝ agent↔agent 那条（**不许删** ⇒ v0.8 旧客户端那条路也不许断）
 *
 * ## 为什么要有闸（自造形状的代价）
 *
 * 上一刀自曝过三处「失败长得像成功」—— 全是**自造协议形状**的代价
 * ⇒ ⇒ 这一刀的形状**只认官方一手**：
 *
 *   · 官方 npm 「@ag-ui/a2ui-middleware」v0.0.16 的 buildLifecycleActivity：
 *     {type:"ACTIVITY_SNAPSHOT", messageId:"a2ui-surface-<surfaceId>",
 *      activityType:"a2ui-surface", content:<ops 数组>, replace:true}
 *   · 官方 npm 「@ag-ui/core」v1.0.4：EventType 含 ACTIVITY_SNAPSHOT／
 *     ACTIVITY_DELTA；ActivitySnapshotEvent 的字段就是上面那五个。
 *
 * ⚠️ **字段数恰为 5** —— 官方 runtime 不认多字段 ⇒ ⇒ 端脑多塞一个字段
 *   ⇒ ⇒ 官方 SDK 那一侧可能整个 activity 被拒 ⇒ ⇒ 界面上「什么都没有」
 *   ⇒ ⇒ **失败长得像成功**。
 *
 * ## 八条
 *
 *   W1 契约形状：发布的契约逐字是官方那五个字段 ＋ content 是非空的 v1.0 ops 数组
 *   W2 四份副本逐字一致（父仓 ＋ 端脑 ＋ 桌面端 ＋ 移动端）
 *   W3 三处字面量一致（activity 类型名 ＋ messageId 前缀）
 *   W4 两端认得 ACTIVITY_SNAPSHOT（不在「已知事件类型」里 ⇒ ⇒ 面静默消失）
 *   W5 端脑产出的 activity 字段**恰为 5 个**（不多不少）
 *   W6 面只有一份：两条承载都调 a2ui::render_view（不许分叉出第二个产出函数）
 *   W7 **负控**：A2A 那条路仍在（端脑 /a2a ＋ 桌面 /a2a ＋ 移动端 message/stream）
 *   W8 版本口径：AG-UI 侧固定 v1.0；A2A 侧仍按客户端声明协商（v0.8 旧路不断）
 *
 * ## 用法
 *
 *   node scripts/check-agui-a2ui-wire.mjs              # 判
 *   node scripts/check-agui-a2ui-wire.mjs --self-test  # 判据自检（8/8）
 *
 * 退出码：**0 绿 / 1 红 / 2 判不了**（源没读全 ⇒ ≠ 没问题）。
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sibling } from './lib/sibling-repo.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const NL = String.fromCharCode(10);

/** 判据条数（自检与「N/N」读数都用它 ⇒ ⇒ 不许手写一个会漂的数）。 */
export const RULE_COUNT = 8;

/** 官方一手常量（真相源见文件头）。 */
export const OFFICIAL_TYPE = 'ACTIVITY_SNAPSHOT';
export const OFFICIAL_ACTIVITY_TYPE = 'a2ui-surface';
export const OFFICIAL_ID_PREFIX = 'a2ui-surface-';
export const OFFICIAL_KEYS = ['type', 'messageId', 'activityType', 'content', 'replace'];
export const V1_MESSAGE_KEYS = ['createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface'];

/** 出现次数（纯字符串计数 ⇒ ⇒ 不引正则 ⇒ ⇒ 不用怕反斜杠被吃）。 */
export function hits(src, needle) {
  if (!needle) return 0;
  return src.split(needle).length - 1;
}

/** marker 之后的第一个引号字符串字面量（单引号或双引号都认）。 */
export function stringLiteralAfter(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) return null;
  const rest = src.slice(at + marker.length);
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (ch !== '"' && ch !== "'") continue;
    const end = rest.indexOf(ch, i + 1);
    if (end < 0) return null;
    return rest.slice(i + 1, end);
  }
  return null;
}

/** marker 之后的 [...] 块（数组字面量）—— 用来钉「已知事件类型」那份名单。 */
export function bracketBlockAfter(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) return null;
  const open = src.indexOf('[', at + marker.length);
  if (open < 0) return null;
  const close = src.indexOf(']', open + 1);
  if (close < 0) return null;
  return src.slice(open, close + 1);
}

/** 一个 Rust 函数体（从 fn name( 到行首的那个 }）。 */
export function rustFnBody(src, name) {
  const at = src.indexOf('fn ' + name + '(');
  if (at < 0) return null;
  const end = src.indexOf(NL + '}', at);
  if (end < 0) return null;
  return src.slice(at, end + 2);
}

/** json! 宏里那些 "key": 的键（不引正则 ⇒ ⇒ 逐行剥引号）。 */
export function jsonMacroKeys(body) {
  const keys = [];
  for (const line of body.split(NL)) {
    const t = line.trim();
    if (!t.startsWith('"')) continue;
    const close = t.indexOf('"', 1);
    if (close < 0) continue;
    const key = t.slice(1, close);
    const rest = t.slice(close + 1).trim();
    if (!rest.startsWith(':')) continue;
    keys.push(key);
  }
  return keys;
}

/** 稳定序列化（键排序）⇒ ⇒ 四份副本的一致性不受键序／缩进影响。 */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}

/** 一批 ops 里的 surfaceId —— **口径照官方**（createSurface ▸ updateComponents ▸ updateDataModel ▸ deleteSurface）。 */
export function surfaceIdOfOps(ops) {
  if (!Array.isArray(ops)) return null;
  for (const op of ops) {
    if (!op || typeof op !== 'object') continue;
    for (const key of V1_MESSAGE_KEYS) {
      const body = op[key];
      if (body && typeof body === 'object' && typeof body.surfaceId === 'string' && body.surfaceId !== '') {
        return body.surfaceId;
      }
    }
  }
  return null;
}

/**
 * 纯函数：各源的内容 ⇒ ⇒ 结论。
 * ⚠️ **零 I/O** ⇒ ⇒ 自检喂合成夹具 ⇒ ⇒ 自检不会恒绿。
 */
export function evaluate(sources) {
  const findings = [];
  const add = (rule, file, detail) => findings.push({ rule, file, detail });

  const contract = sources.contract;
  const copies = sources.copies || {};
  const endbrainAgui = sources.endbrainAgui || '';
  const endbrainGateway = sources.endbrainGateway || '';
  const desktopTypes = sources.desktopTypes || '';
  const desktopActivity = sources.desktopActivity || '';
  const desktopA2uiClient = sources.desktopA2uiClient || '';
  const mobileEvents = sources.mobileEvents || '';
  const mobileActivity = sources.mobileActivity || '';
  const mobileService = sources.mobileService || '';

  // W1 —— 契约形状（官方那五个字段，一字不多一字不少）
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    add('W1', 'fixtures/a2ui/agui_activity_v1.json', '契约读不出来（不是对象）⇒ ⇒ 官方形状没有落地处');
  } else {
    const keys = Object.keys(contract).sort();
    const expect = OFFICIAL_KEYS.slice().sort();
    if (canonicalJson(keys) !== canonicalJson(expect)) {
      add('W1', 'fixtures/a2ui/agui_activity_v1.json',
        '契约的字段集必须逐字是那五个（' + expect.join(' / ') + '）⇒ ⇒ 现在是 ' + keys.join(' / '));
    }
    if (contract.type !== OFFICIAL_TYPE) {
      add('W1', 'fixtures/a2ui/agui_activity_v1.json', 'type 必须是 ' + OFFICIAL_TYPE + ' ⇒ ⇒ 现在是 ' + contract.type);
    }
    if (contract.activityType !== OFFICIAL_ACTIVITY_TYPE) {
      add('W1', 'fixtures/a2ui/agui_activity_v1.json',
        'activityType 必须是 ' + OFFICIAL_ACTIVITY_TYPE + ' ⇒ ⇒ 现在是 ' + contract.activityType);
    }
    if (contract.replace !== true) {
      add('W1', 'fixtures/a2ui/agui_activity_v1.json', 'replace 必须是 true ⇒ ⇒ 现在是 ' + contract.replace);
    }
    if (!Array.isArray(contract.content) || contract.content.length === 0) {
      add('W1', 'fixtures/a2ui/agui_activity_v1.json',
        'content 必须是**非空**的 ops 数组（官方：content 里放 operations 数组）⇒ ⇒ 现在是 ' + JSON.stringify(contract.content));
    } else {
      for (let i = 0; i < contract.content.length; i++) {
        const op = contract.content[i];
        const ok = op && typeof op === 'object' && !Array.isArray(op) &&
          op.version === '1.0' && V1_MESSAGE_KEYS.some((k) => k in op);
        if (!ok) {
          add('W1', 'fixtures/a2ui/agui_activity_v1.json',
            'content[' + i + '] 不是一条 v1.0 的 A2UI 消息（version:"1.0" ＋ 四种消息键之一）');
        }
      }
      const sid = surfaceIdOfOps(contract.content);
      if (sid === null) {
        add('W1', 'fixtures/a2ui/agui_activity_v1.json', 'ops 里读不出 surfaceId ⇒ ⇒ messageId 对不上');
      } else if (contract.messageId !== OFFICIAL_ID_PREFIX + sid) {
        add('W1', 'fixtures/a2ui/agui_activity_v1.json',
          'messageId 必须是 ' + OFFICIAL_ID_PREFIX + sid + '（官方：前缀 ＋ surfaceId）⇒ ⇒ 现在是 ' + contract.messageId);
      }
    }
  }

  // W2 —— 四份副本逐字一致
  const canonical = contract ? canonicalJson(contract) : null;
  const copyLabels = {
    endbrain: 'telencephalon/tests/fixtures/agui_activity_v1.json',
    desktop: 'shadow-desktop/src/lib/agui/__tests__/fixtures/agui_activity_v1.json',
    mobile: 'shadow-mobile/test/support/fixtures/agui_activity_v1.json',
  };
  for (const key of ['endbrain', 'desktop', 'mobile']) {
    const copy = copies[key];
    if (!copy) {
      add('W2', copyLabels[key], '副本读不出来 ⇒ ⇒ 对账没有对象');
      continue;
    }
    if (canonicalJson(copy) !== canonical) {
      add('W2', copyLabels[key], '副本与发布的契约**不逐字一致**⇒ ⇒ 有一端拿着旧的形状');
    }
  }

  // W3 —— 三处字面量一致（端脑 / 桌面端 / 移动端）
  const impls = [
    ['telencephalon/src/api/shadow/agui.rs', endbrainAgui, 'A2UI_ACTIVITY_TYPE', 'A2UI_ACTIVITY_ID_PREFIX'],
    ['shadow-desktop/src/lib/agui/a2uiActivity.ts', desktopActivity, 'A2UI_ACTIVITY_TYPE', 'A2UI_ACTIVITY_ID_PREFIX'],
    ['shadow-mobile/lib/agui/a2ui_activity.dart', mobileActivity, 'a2uiActivityType', 'a2uiActivityIdPrefix'],
  ];
  for (const row of impls) {
    const file = row[0];
    const src = row[1];
    const typeLiteral = stringLiteralAfter(src, row[2]);
    const prefixLiteral = stringLiteralAfter(src, row[3]);
    if (typeLiteral !== OFFICIAL_ACTIVITY_TYPE) {
      add('W3', file, 'activity 类型名必须是 ' + OFFICIAL_ACTIVITY_TYPE + ' ⇒ ⇒ 现在是 ' + typeLiteral);
    }
    if (prefixLiteral !== OFFICIAL_ID_PREFIX) {
      add('W3', file, 'messageId 前缀必须是 ' + OFFICIAL_ID_PREFIX + ' ⇒ ⇒ 现在是 ' + prefixLiteral);
    }
  }

  // W4 —— 两端认得这个事件类型（认不得 ⇒ ⇒ 面静默消失 ⇒ 失败长得像成功）
  const desktopKnown = bracketBlockAfter(desktopTypes, 'AGUI_KNOWN_EVENT_TYPES');
  if (!desktopKnown || desktopKnown.indexOf("'ACTIVITY_SNAPSHOT'") < 0) {
    add('W4', 'shadow-desktop/src/lib/agui/types.ts',
      '已知事件类型里没有 ACTIVITY_SNAPSHOT ⇒ ⇒ 那条 activity 被当成「不认识」⇒ ⇒ 面静默消失');
  }
  const mobileKnown = bracketBlockAfter(mobileEvents, 'aguiKnownEventTypes');
  if (!mobileKnown || mobileKnown.indexOf("'ACTIVITY_SNAPSHOT'") < 0) {
    add('W4', 'shadow-mobile/lib/agui/agui_events.dart',
      '已知事件类型里没有 ACTIVITY_SNAPSHOT ⇒ ⇒ 那条 activity 被当成「不认识」⇒ ⇒ 面静默消失');
  }

  // W5 —— 端脑产出的 activity 字段**恰为 5 个**
  const body = rustFnBody(endbrainAgui, 'a2ui_activity');
  if (!body) {
    add('W5', 'telencephalon/src/api/shadow/agui.rs', '找不到 a2ui_activity 这个产出函数 ⇒ ⇒ 形状无处可钉');
  } else {
    const keys = jsonMacroKeys(body);
    if (canonicalJson(keys.slice().sort()) !== canonicalJson(OFFICIAL_KEYS.slice().sort())) {
      add('W5', 'telencephalon/src/api/shadow/agui.rs',
        'activity 的字段必须逐字是那五个（多一个官方 runtime 可能整个拒）⇒ ⇒ 现在是 ' + keys.join(' / '));
    }
  }

  // W6 —— 面只有一份（两条承载共用同一个产出函数）
  if (hits(endbrainGateway, 'a2ui::render_view(') === 0) {
    add('W6', 'telencephalon/src/api/a2ui_gateway.rs',
      'A2A 那条路没有共用 a2ui::render_view ⇒ ⇒ 两条承载各画各的 ⇒ ⇒ 面不再逐字同形');
  }
  if (hits(endbrainAgui, 'a2ui::render_view(') === 0) {
    add('W6', 'telencephalon/src/api/shadow/agui.rs',
      'AG-UI 那条路没有共用 a2ui::render_view ⇒ ⇒ 两条承载各画各的 ⇒ ⇒ 面不再逐字同形');
  }

  // W7 —— **负控**：A2A 那条路仍在（用户裁决「保留 a2a」）
  if (hits(endbrainGateway, '"/a2a"') === 0) {
    add('W7', 'telencephalon/src/api/a2ui_gateway.rs',
      '端脑的 /a2a 路由不见了 ⇒ ⇒ 「保留 a2a」那条用户裁决被悄悄删了');
  }
  if (hits(desktopA2uiClient, '/a2a') === 0) {
    add('W7', 'shadow-desktop/src/lib/a2uiClient.ts',
      '桌面端不再打 /a2a ⇒ ⇒ 旧客户端那条路断了');
  }
  if (hits(mobileService, 'message/stream') === 0) {
    add('W7', 'shadow-mobile/lib/services/a2ui/a2ui_agent_service.dart',
      '移动端不再走 A2A 的 message/stream ⇒ ⇒ 旧客户端那条路断了');
  }

  // W8 —— 版本口径（AG-UI 固定 v1.0；A2A 仍按客户端声明协商）
  if (hits(endbrainAgui, 'A2uiVersion::V1_0') === 0) {
    add('W8', 'telencephalon/src/api/shadow/agui.rs',
      'AG-UI 侧的版本必须固定 v1.0（两端客户端都是 v1.0）⇒ ⇒ 现在不是');
  }
  if (hits(endbrainGateway, 'resolve_version') === 0) {
    add('W8', 'telencephalon/src/api/a2ui_gateway.rs',
      'A2A 侧必须仍按客户端声明协商版本（resolve_version）⇒ ⇒ 固定 v1.0 会把 v0.8 旧客户端那条路掐断');
  }

  return findings;
}

/** 读不到的源 ⇒ ⇒ 退出码 2（**判不了**，不是「没问题」）。 */
function readSource(label, path, isJson) {
  if (!existsSync(path)) return { missing: label };
  const raw = readFileSync(path, 'utf8');
  if (!isJson) return { text: raw };
  try {
    return { json: JSON.parse(raw) };
  } catch (error) {
    return { missing: label + '（不是合法 JSON：' + error.message + '）' };
  }
}

function main() {
  const end = sibling(REPO_ROOT, 'telencephalon');
  const reads = [
    ['contract', 'fixtures/a2ui/agui_activity_v1.json', join(REPO_ROOT, 'fixtures', 'a2ui', 'agui_activity_v1.json'), true],
    ['copyEndbrain', 'telencephalon/tests/fixtures/agui_activity_v1.json', join(end, 'tests', 'fixtures', 'agui_activity_v1.json'), true],
    ['copyDesktop', 'shadow-desktop/src/lib/agui/__tests__/fixtures/agui_activity_v1.json', join(REPO_ROOT, 'shadow-desktop', 'src', 'lib', 'agui', '__tests__', 'fixtures', 'agui_activity_v1.json'), true],
    ['copyMobile', 'shadow-mobile/test/support/fixtures/agui_activity_v1.json', join(REPO_ROOT, 'shadow-mobile', 'test', 'support', 'fixtures', 'agui_activity_v1.json'), true],
    ['endbrainAgui', 'telencephalon/src/api/shadow/agui.rs', join(end, 'src', 'api', 'shadow', 'agui.rs'), false],
    ['endbrainGateway', 'telencephalon/src/api/a2ui_gateway.rs', join(end, 'src', 'api', 'a2ui_gateway.rs'), false],
    ['desktopTypes', 'shadow-desktop/src/lib/agui/types.ts', join(REPO_ROOT, 'shadow-desktop', 'src', 'lib', 'agui', 'types.ts'), false],
    ['desktopActivity', 'shadow-desktop/src/lib/agui/a2uiActivity.ts', join(REPO_ROOT, 'shadow-desktop', 'src', 'lib', 'agui', 'a2uiActivity.ts'), false],
    ['desktopA2uiClient', 'shadow-desktop/src/lib/a2uiClient.ts', join(REPO_ROOT, 'shadow-desktop', 'src', 'lib', 'a2uiClient.ts'), false],
    ['mobileEvents', 'shadow-mobile/lib/agui/agui_events.dart', join(REPO_ROOT, 'shadow-mobile', 'lib', 'agui', 'agui_events.dart'), false],
    ['mobileActivity', 'shadow-mobile/lib/agui/a2ui_activity.dart', join(REPO_ROOT, 'shadow-mobile', 'lib', 'agui', 'a2ui_activity.dart'), false],
    ['mobileService', 'shadow-mobile/lib/services/a2ui/a2ui_agent_service.dart', join(REPO_ROOT, 'shadow-mobile', 'lib', 'services', 'a2ui', 'a2ui_agent_service.dart'), false],
  ];

  const missing = [];
  const sources = { copies: {} };
  for (const row of reads) {
    const key = row[0];
    const label = row[1];
    const got = readSource(label, row[2], row[3]);
    if (got.missing) {
      missing.push(got.missing);
      continue;
    }
    if (row[3]) {
      if (key === 'contract') sources.contract = got.json;
      else sources.copies[key.replace('copy', '').toLowerCase()] = got.json;
    } else {
      sources[key] = got.text;
    }
  }

  if (missing.length > 0) {
    console.error('❌ 判不了：这些源没读全 ⇒ ⇒ 这一格**没验成**（≠ 没问题）');
    for (const m of missing) console.error('   · ' + m);
    process.exit(2);
  }

  const findings = evaluate(sources);
  const broken = new Set(findings.map((f) => f.rule));
  const passed = RULE_COUNT - broken.size;
  if (findings.length === 0) {
    console.log('✅ AG-UI 承载 A2UI 的 wire 形状：' + passed + '/' + RULE_COUNT + ' 条判据全过');
    console.log('   · 官方五字段 ＋ 四份副本逐字一致 ＋ 三处字面量一致');
    console.log('   · 两端认得 ACTIVITY_SNAPSHOT ＋ 端脑字段恰为 5 ＋ 面只有一份');
    console.log('   · 负控：A2A 那条路仍在 ＋ 版本口径（AG-UI 固定 v1.0／A2A 仍协商）');
    process.exit(0);
  }
  console.error('❌ AG-UI 承载 A2UI 的 wire 形状：' + passed + '/' + RULE_COUNT + ' 条判据全过');
  for (const f of findings) {
    console.error('   · [' + f.rule + '] ' + f.file + ' ⇒ ⇒ ' + f.detail);
  }
  process.exit(1);
}

/** 自检：合成夹具 ⇒ ⇒ 八种形状各一（合规 ＋ 七种坏法）。 */
function selfTest() {
  const good = {
    contract: {
      type: OFFICIAL_TYPE,
      messageId: OFFICIAL_ID_PREFIX + 'shadow.tasks',
      activityType: OFFICIAL_ACTIVITY_TYPE,
      content: [{ version: '1.0', createSurface: { surfaceId: 'shadow.tasks' } }],
      replace: true,
    },
    copies: {
      endbrain: {
        type: OFFICIAL_TYPE,
        messageId: OFFICIAL_ID_PREFIX + 'shadow.tasks',
        activityType: OFFICIAL_ACTIVITY_TYPE,
        content: [{ version: '1.0', createSurface: { surfaceId: 'shadow.tasks' } }],
        replace: true,
      },
      desktop: {
        type: OFFICIAL_TYPE,
        messageId: OFFICIAL_ID_PREFIX + 'shadow.tasks',
        activityType: OFFICIAL_ACTIVITY_TYPE,
        content: [{ version: '1.0', createSurface: { surfaceId: 'shadow.tasks' } }],
        replace: true,
      },
      mobile: {
        type: OFFICIAL_TYPE,
        messageId: OFFICIAL_ID_PREFIX + 'shadow.tasks',
        activityType: OFFICIAL_ACTIVITY_TYPE,
        content: [{ version: '1.0', createSurface: { surfaceId: 'shadow.tasks' } }],
        replace: true,
      },
    },
    endbrainAgui: [
      'const A2UI_ACTIVITY_TYPE: &str = "a2ui-surface";',
      'const A2UI_ACTIVITY_ID_PREFIX: &str = "a2ui-surface-";',
      'fn a2ui_activity(surface_id: &str, ops: Vec<Value>) -> Value {',
      '    serde_json::json!({',
      '        "type": "ACTIVITY_SNAPSHOT",',
      '        "messageId": format!("{}{}", A2UI_ACTIVITY_ID_PREFIX, surface_id),',
      '        "activityType": A2UI_ACTIVITY_TYPE,',
      '        "content": ops,',
      '        "replace": true,',
      '    })',
      '}',
      'let ops = a2ui::render_view(&state, &view, a2ui_v1::A2uiVersion::V1_0, locale).await;',
    ].join(NL),
    endbrainGateway: [
      '.route("/a2a", post(a2ui_message_stream))',
      'let version = a2ui_v1::resolve_version(&req, header);',
      'let payloads = a2ui::render_view(&state, &view, version, locale).await;',
    ].join(NL),
    desktopTypes: 'export const AGUI_KNOWN_EVENT_TYPES = [' + NL + "  'RUN_STARTED'," + NL + "  'ACTIVITY_SNAPSHOT'," + NL + '] as const;',
    desktopActivity: "export const A2UI_ACTIVITY_TYPE = 'a2ui-surface';" + NL + "export const A2UI_ACTIVITY_ID_PREFIX = 'a2ui-surface-';",
    desktopA2uiClient: "const url = baseUrl + '/a2a';",
    mobileEvents: 'const List<String> aguiKnownEventTypes = <String>[' + NL + "  'RUN_STARTED'," + NL + "  'ACTIVITY_SNAPSHOT'," + NL + '];',
    mobileActivity: "const String a2uiActivityType = 'a2ui-surface';" + NL + "const String a2uiActivityIdPrefix = 'a2ui-surface-';",
    mobileService: "'method': 'message/stream',",
  };

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const mutate = (base, fn) => {
    const c = clone(base);
    fn(c);
    return c;
  };

  const broken = [
    ['W1', '契约多一个字段', mutate(good, (c) => { c.contract.extra = 1; })],
    ['W2', '移动端那份副本漂了', mutate(good, (c) => { c.copies.mobile.activityType = 'a2ui-surface-v2'; })],
    ['W3', '桌面端自造了 activity 名', mutate(good, (c) => { c.desktopActivity = "export const A2UI_ACTIVITY_TYPE = 'a2ui-surface-v2';" + NL + "export const A2UI_ACTIVITY_ID_PREFIX = 'a2ui-surface-';"; })],
    ['W4', '桌面端不认这个事件类型', mutate(good, (c) => { c.desktopTypes = 'export const AGUI_KNOWN_EVENT_TYPES = [' + NL + "  'RUN_STARTED'," + NL + '] as const;'; })],
    ['W5', '端脑多塞了一个字段', mutate(good, (c) => {
      c.endbrainAgui = c.endbrainAgui.replace('        "replace": true,', '        "replace": true,' + NL + '        "surfaceId": surface_id,');
    })],
    ['W6', 'A2A 那条路分叉了产出函数', mutate(good, (c) => {
      c.endbrainGateway = c.endbrainGateway.replace('a2ui::render_view', 'a2ui::render_view_legacy');
    })],
    ['W7', 'A2A 那条路被删了', mutate(good, (c) => { c.desktopA2uiClient = "const url = baseUrl + '/api/turn';"; })],
    ['W8', 'A2A 侧固定了 v1.0（v0.8 旧路被掐断）', mutate(good, (c) => {
      c.endbrainGateway = c.endbrainGateway.replace('a2ui_v1::resolve_version(&req, header)', 'a2ui_v1::A2uiVersion::V1_0');
    })],
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

  for (const row of broken) {
    const findings = evaluate(row[2]);
    const hit = findings.some((f) => f.rule === row[0]);
    check('坏法「' + row[1] + '」⇒ 当场逮到 ' + row[0] + '（发现 ' + findings.length + ' 条）', hit);
  }

  console.log('判据自检：' + (total - failed) + '/' + total);
  if (failed > 0) {
    console.error('❌ 自检失败：' + failed + ' 条');
    process.exit(1);
  }
  console.log('✅ 自检通过');
}

if (process.argv[1] && process.argv[1].endsWith('check-agui-a2ui-wire.mjs')) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    main();
  }
}
