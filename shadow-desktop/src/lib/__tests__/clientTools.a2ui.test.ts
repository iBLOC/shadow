import { describe, it, expect, vi, afterEach } from 'vitest';

// ⚠️⚠️ **全局替换的还原**（2026-11-09 真机实测加的）
//   vitest 默认 unstubGlobals: false ⇒ ⇒ **本文件 stub 出去的东西不会自动还原**
//   ⇒ ⇒ 在**单 worker**下它会**泄漏给同一 worker 的后续文件**（探针实测 leaked=true）
//   ⇒ ⇒ 后面那个文件可能拿到**上一个文件的 mock** ⇒ ⇒ 失败长得像成功。
//   ⇒ ⇒ 装在 beforeEach（每个测试都有一份新的）＋ 还原在 afterEach（不外泄）。
afterEach(() => {
  // 还原 ⇒ ⇒ 不泄漏给同 worker 的后续文件
  vi.unstubAllGlobals();
});

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { desktopClientTools, pickReportPayload } from '../clientTools';
import { ensureI18n } from '../../i18n/core';

// ⚠️ **自己确保 i18n 已初始化** —— `src/i18n` 那一侧带 React 绑定，
// 测试里 import 它会炸（35 个文件各自 mock 了一份 react-i18next）。
const i18n = ensureI18n();

/**
 * 客户端工具 `show_a2ui_surface` —— **「模型在对话里点名要界面」**那条路。
 *
 * ## 为什么钉它
 *
 * 端脑把客户端声明的 `tools` 交给模型（`SendMessageRequest.tools`），
 * 模型决定调用时端脑发 `tool_call`，**设备执行**，结果回传端脑喂回模型
 * ⇒ ⇒ 这条路一通，「对话中激活 Agent2UI」就不需要改协议。
 *
 * ⚠️ **契约**：执行结果 = `{ report, a2ui_events }` ⇒
 * `a2ui_events` 是端脑 `POST /a2a` 发的**同一批事件**
 * （fixture `fixtures/a2ui/tasks_sse.txt`）⇒ ⇒ 移动端消费的是同一份字节。
 *
 * ⚠️ **`report` 用户看得见**（结果卡片会渲染它）⇒ ⇒ 它必须走真 i18n
 * ⇒ ⇒ 所以这条用例同时钉「文案在**中英两端都在**」。
 */
function fixturePath(name: string): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(dir, 'fixtures', 'a2ui', name);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`A2UI fixture not found: ${name}`);
}

/**
 * 仓库里**另一端**的 l10n 文件（移动端的 arb）。
 *
 * ⚠️ **为什么桌面端的测试要读移动端的文件**：`report` 那一句话是
 * **发给模型看的** ⇒ ⇒ 两端必须逐字一致 ⇒ ⇒ 「一致」这件事要**机器可判**
 * ⇒ ⇒ 只能有一处把它读出来比对（这与 `fixtures/a2ui/` 那个共享 fixture 同一族）。
 */
function mobileArbPath(name: string): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(dir, 'shadow-mobile', 'lib', 'l10n', name);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`mobile arb not found: ${name}`);
}

const SSE_FIXTURE = readFileSync(fixturePath('tasks_sse.txt'), 'utf8');

/** fixture 里的事件对象（逐条）。 */
function fixtureEvents(): unknown[] {
  const out: unknown[] = [];
  for (const line of SSE_FIXTURE.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    out.push(JSON.parse(trimmed.slice('data:'.length).trim()));
  }
  return out;
}

/**
 * 端脑**只回纯文本**的那一发（没有 surfaceUpdate / beginRendering）。
 *
 * ⚠️ 为什么要单独造：**有事件 ≠ 画出来了** —— 这一发**有事件**
 * （那条 text 事件）⇒ ⇒ 拿「事件数 > 0」当判据就会把「没画界面」
 * 说成「已展开」⇒ ⇒ **失败长得像成功**。
 */
const TEXT_ONLY_SSE =
  'data: {"result":{"kind":"task-status-update","taskId":"t1","contextId":"c1","status":{"state":"completed","message":{"kind":"message","messageId":"m1","role":"agent","parts":[{"kind":"text","text":"这里能看什么"}]}},"final":true}}\n\n';

/** 端脑**什么都没说**的那一发（连文本都没有）。 */
const SILENT_SSE = '';

/** 一个能流式读的假响应（与 `a2ui.test.tsx` 同形状）。 */
function fakeResponse(body: string): Response {
  return {
    ok: true,
    status: 200,
    async text() {
      return body;
    },
    body: {
      getReader() {
        let sent = false;
        return {
          async read() {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: body };
          },
          releaseLock() {},
        };
      },
    },
  } as unknown as Response;
}

async function runTool(sse: string): Promise<{ report: string; a2ui_events: unknown[] }> {
  vi.stubGlobal('fetch', vi.fn(async () => fakeResponse(sse)));
  const tool = desktopClientTools.lookup('show_a2ui_surface')!;
  return (await tool.execute({ view: 'tasks' }, {})) as {
    report: string;
    a2ui_events: unknown[];
  };
}

describe('客户端工具 show_a2ui_surface', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('已注册，且参数声明告诉模型要一个 view', () => {
    expect(desktopClientTools.supports('show_a2ui_surface')).toBe(true);
    const tool = desktopClientTools.lookup('show_a2ui_surface')!;
    expect(tool.parameters?.properties?.view).toBeDefined();
    expect(tool.parameters?.properties?.view.enum).toEqual(['tasks', 'agents']);
  });

  it('画出来了 ⇒ report 说「已展开」＋ **与 fixture 逐字同形**的事件', async () => {
    const result = await runTool(SSE_FIXTURE);

    // ⚠️ **形状逐字一致** —— 两端吃的是同一批事件。
    expect(result.a2ui_events).toEqual(fixtureEvents());
    // ⚠️ **报告说的是真话** —— 画出来了就别说「没画界面」。
    expect(result.report).toBe(
      i18n.t('a2ui.surfaceDrawn', { label: i18n.t('a2ui.labelTasks') }),
    );
    expect(result.report).toContain('任务看板');
    expect(result.report).not.toContain('没有画界面');
  });

  it('端脑只回纯文本（没画界面）⇒ **如实说**，事件那一半是空的', async () => {
    const result = await runTool(TEXT_ONLY_SSE);

    // ⚠️ **有事件 ≠ 画出来了** ⇒ 这里事件是空的（没画就没有界面）。
    expect(result.a2ui_events).toEqual([]);
    // ⚠️ **端脑自己的话要带出去**（模型得知道它到底说了什么）。
    expect(result.report).toContain('这里能看什么');
    expect(result.report).toContain('没有画界面');
    expect(result.report).not.toContain('已展开');
  });

  it('端脑**既没画也没说话** ⇒ **仍然说「没画界面」**（不许说「已展开」）', async () => {
    const result = await runTool(SILENT_SSE);

    expect(result.a2ui_events).toEqual([]);
    expect(result.report).toBe(i18n.t('a2ui.surfaceNotDrawnSilent'));
    expect(result.report).not.toContain('已展开');
  });

  it('两端 report 的**措辞逐字一致**（同一个模型在手机和桌面上读到同一句话）', () => {
    // ⚠️ **为什么跨端比措辞**：`report` 是**给模型看的那一句**
    // ⇒ ⇒ 两端措辞不一样 ⇒ ⇒ 同一个模型在手机上和桌面上**读到的是两句话**
    // ⇒ ⇒ 行为可能不一样 ⇒ ⇒ 那就是漂移。
    // ⚠️ **这个断言不是一次性的** —— 人工对齐过一次不算数
    // ⇒ ⇒ 两边任何一边改了这几句话 ⇒ ⇒ 这条立刻红。
    const zh = JSON.parse(readFileSync(mobileArbPath('app_zh.arb'), 'utf8'));
    const en = JSON.parse(readFileSync(mobileArbPath('app_en.arb'), 'utf8'));

    // 画出来了
    expect(i18n.t('a2ui.surfaceDrawn', { label: i18n.t('a2ui.labelTasks') })).toBe(
      zh.a2uiSurfaceReportTasks,
    );
    expect(i18n.t('a2ui.surfaceDrawn', { label: i18n.t('a2ui.labelAgents') })).toBe(
      zh.a2uiSurfaceReportAgents,
    );
    // 没画出来（端脑没说话）
    expect(i18n.t('a2ui.surfaceNotDrawnSilent')).toBe(zh.a2uiSurfaceReportNoSurface);
    // 没画出来（端脑说了话）
    expect(i18n.t('a2ui.surfaceNotDrawn', { words: 'W' })).toBe(
      String(zh.a2uiSurfaceReportNoSurfaceSaid).replace('{words}', 'W'),
    );

    // ⚠️ **英文那一遍也要比** —— 只比中文 ⇒ 英文用户读到另一句话。
    // ⚠️ **用 `getFixedT` 切语言** —— i18next 的 `t(key, opts, lng)` 那个三参形式
    // **不是**「第三个参数是语言」（那是 defaultValue）⇒ ⇒ 传了也还是中文
    // ⇒ ⇒ 断言会「看着像绿、其实比的是中文」。
    const tEn = i18n.getFixedT('en-US');
    expect(tEn('a2ui.surfaceDrawn', { label: tEn('a2ui.labelTasks') })).toBe(
      en.a2uiSurfaceReportTasks,
    );
    expect(tEn('a2ui.surfaceDrawn', { label: tEn('a2ui.labelAgents') })).toBe(
      en.a2uiSurfaceReportAgents,
    );
    expect(tEn('a2ui.surfaceNotDrawnSilent')).toBe(en.a2uiSurfaceReportNoSurface);
    expect(tEn('a2ui.surfaceNotDrawn', { words: 'W' })).toBe(
      String(en.a2uiSurfaceReportNoSurfaceSaid).replace('{words}', 'W'),
    );
  });

  it('这些词条在**中英两端都在**（不许只有一边有 ⇒ 英文用户看到 key）', () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'i18n');
    const zh = JSON.parse(readFileSync(join(dir, 'zh-CN.json'), 'utf8'));
    const en = JSON.parse(readFileSync(join(dir, 'en-US.json'), 'utf8'));
    const keys = [
      'surfaceDrawn',
      'surfaceNotDrawn',
      'surfaceNotDrawnSilent',
      'labelTasks',
      'labelAgents',
    ];
    for (const key of keys) {
      expect(typeof zh.a2ui?.[key], `zh a2ui.${key}`).toBe('string');
      expect(zh.a2ui[key].length, `zh a2ui.${key}`).toBeGreaterThan(0);
      expect(typeof en.a2ui?.[key], `en a2ui.${key}`).toBe('string');
      expect(en.a2ui[key].length, `en a2ui.${key}`).toBeGreaterThan(0);
      // ⚠️ **不许是副本** —— 中文原文塞进英文文件 ⇒ 英文用户看到中文。
      expect(en.a2ui[key], `en a2ui.${key}`).not.toBe(zh.a2ui[key]);
    }
  });
});

describe('给模型看的那一份（pickReportPayload）', () => {
  it('有 report ⇒ 只把 report 交出去（组件树不进模型上下文）', () => {
    const payload = pickReportPayload({ report: '已展开「任务看板」。', a2ui_events: [{ a: 1 }] });
    expect(payload).toEqual({ report: '已展开「任务看板」。' });
  });

  it('没有 report ⇒ 原样回传（不把别人的结果改形状）', () => {
    expect(pickReportPayload({ applied: 'accent' })).toEqual({ applied: 'accent' });
    expect(pickReportPayload('plain')).toBe('plain');
  });
});
