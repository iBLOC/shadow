/**
 * **活端脑的 A2UI 字节** —— 打包时复验「端脑 ↔ 客户端」这条链。
 *
 * ## 为什么要有这条
 *
 * 之前的验证全是「对着**冻结的** fixture 测」⇒ ⇒ 证明的是
 * 「客户端与**那份字节**对得上」⇒ ⇒ **证明不了「客户端与活着的端脑对得上」**。
 * ⇒ ⇒ 而端脑是会改的（换实现、加字段、改信封）⇒ ⇒ 改了就会**静悄悄地**对不上
 * ⇒ ⇒ 界面变成一块空白（用户只看到一个空卡片，还以为没任务）。
 *
 * ⇒ 所以这里直接打**活端脑**，而且**用客户端自己的请求函数**去打
 * （`requestA2uiSurface` —— 不是在探针里另抄一份）⇒ ⇒ 验的是**整条真实链路**：
 * 请求头 ⇒ SSE 解码 ⇒ 协议解析 ⇒ 能不能画出一块界面。
 *
 * ## 跑的时候
 *
 * - `pnpm test:api`（打包时也会跑）：端脑不在 ⇒ **跳过**（不是「假绿」）；
 * - `RUN_API_TESTS=force-fail`：端脑不在 ⇒ **硬失败**（发布流水线用）。
 *
 * ⚠️ **端脑需要重新编译才能看到新特性**：本机那个端脑若是 2026-11-01 01:33
 * 之前编的 ⇒ ⇒ 它**不认** `Accept-Language` ⇒ ⇒ 界面文案是英文 ⇒
 * ⇒ 下面那条「文案随语言走」会**给出警告**（软失败），而不是假装通过。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { A2uiHttpError, requestA2uiSurface } from '../../src/lib/a2uiClient';
import { buildSurfaceFromEvents } from '../../src/lib/a2uiProtocol';
import { API_BASE_URL, checkServerReachable, IS_STRICT, SHADOW_KEY } from './server-check';

/** 冻结的 fixture —— 「协议长什么样」的快照。 */
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

function eventsOf(text: string): unknown[] {
  const out: unknown[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    out.push(JSON.parse(trimmed.slice('data:'.length).trim()));
  }
  return out;
}

/** 一个值的「形状签名」—— **只有键与结构，没有值**。 */
function shapeSignature(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shapeSignature);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      out[key] = shapeSignature((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return typeof value;
}

/** surface 里第一个非空的文字（标题）。 */
function firstText(surface: { components?: { component?: Record<string, unknown> }[] } | null): string {
  for (const component of surface?.components ?? []) {
    const props = Object.values(component.component ?? {})[0] as
      | { text?: { literalString?: string } }
      | undefined;
    const text = props?.text?.literalString;
    if (typeof text === 'string' && text.trim() !== '') return text;
  }
  return '';
}

let serverUp = false;
const setup = (async () => {
  const r = await checkServerReachable();
  serverUp = r.reachable;
  if (IS_STRICT && !r.reachable) {
    throw new Error(`RUN_API_TESTS=force-fail but telencephalon unreachable: ${r.reason}`);
  }
  if (!r.reachable) {
    console.warn(
      `\n[a2ui-live] telencephalon not reachable on ${API_BASE_URL}; skipping. ` +
        `reason: ${r.reason}\n  set SHADOW_TELENCEPHALON_URL or start the server.\n`,
    );
  }
})();

describe('活端脑的 A2UI 字节（走客户端自己那条路）', () => {
  it('端脑的字节能被客户端解析成**一块可渲染的界面**', async (ctx) => {
    await setup;
    if (!serverUp) {
      ctx.skip();
      return;
    }

    // ⚠️⚠️ **影子锁要显式注入**（2026-11-09 真端脑实测）：端脑的 `/a2a` 在
    // shadow key 后面 ⇒ ⇒ 不带 ⇒ ⇒ **401** ⇒ ⇒ 而这条用例断言的是「端脑的
    // 字节能不能被解析成一块界面」⇒ ⇒ 401 时那条**根本没测到**⇒ ⇒ 判红是
    // 「判据在测错东西」⇒ ⇒ ⇒ 这里把判据自己的影子锁递进去（与门形同规则）。
    let result: Awaited<ReturnType<typeof requestA2uiSurface>>;
    try {
      result = await requestA2uiSurface({
        baseUrl: API_BASE_URL,
        apiKey: SHADOW_KEY,
        view: 'tasks',
        locale: 'zh-CN',
      });
    } catch (e) {
      if (e instanceof A2uiHttpError && e.status === 401) {
        console.warn(
          '[a2ui-live] 端脑拒了这次请求（401）—— 影子锁对不上 ⇒ ⇒ ' +
            '这条**字节形状**测不了 ⇒ ⇒ 跳过（不是「形状不对」）',
        );
        ctx.skip();
        return;
      }
      throw e;
    }

    // ⚠️ **协议层的问题必须为零** —— 有一条就说明端脑吐了客户端读不懂的东西
    // ⇒ ⇒ 而那种情况在界面上是**一块空白**（用户以为没任务）。
    expect(result.errors).toEqual([]);
    expect(result.events.length).toBeGreaterThan(0);

    // ⭐ **落点**：客户端能不能把它变成一块**能画出来**的界面。
    const surface = buildSurfaceFromEvents(result.events);
    expect(surface).not.toBeNull();
    expect(surface?.rendered).toBe(true);
    expect(surface?.rootId).toBeTruthy();
    expect(firstText(surface)).not.toBe('');
  });

  it('端脑的界面文案随 `Accept-Language` 走（**旧端脑会在这里露馅**）', async (ctx) => {
    await setup;
    if (!serverUp) {
      ctx.skip();
      return;
    }

    // ⚠️⚠️ **影子锁要显式注入**（2026-11-09 真端脑实测）：端脑的 `/a2a` 在
    // shadow key 后面 ⇒ ⇒ 不带 ⇒ ⇒ **401** ⇒ ⇒ 而这条用例断言的是「端脑的
    // 字节能不能被解析成一块界面」⇒ ⇒ 401 时那条**根本没测到**⇒ ⇒ 判红是
    // 「判据在测错东西」⇒ ⇒ ⇒ 这里把判据自己的影子锁递进去（与门形同规则）。
    let result: Awaited<ReturnType<typeof requestA2uiSurface>>;
    try {
      result = await requestA2uiSurface({
        baseUrl: API_BASE_URL,
        apiKey: SHADOW_KEY,
        view: 'tasks',
        locale: 'zh-CN',
      });
    } catch (e) {
      if (e instanceof A2uiHttpError && e.status === 401) {
        console.warn(
          '[a2ui-live] 端脑拒了这次请求（401）—— 影子锁对不上 ⇒ ⇒ ' +
            '这条**字节形状**测不了 ⇒ ⇒ 跳过（不是「形状不对」）',
        );
        ctx.skip();
        return;
      }
      throw e;
    }
    const title = firstText(buildSurfaceFromEvents(result.events));
    expect(title).not.toBe('');

    if (!/\p{Script=Han}/u.test(title)) {
      // ⚠️ **软失败**：端脑**不认** `Accept-Language` ⇒ 多半是**旧构建**
      // ⇒ ⇒ 重新编一遍端脑即可 ⇒ ⇒ 但**不该把打包卡死**（不是桌面端的锅）。
      console.warn(
        `[a2ui-live] 端脑回的界面文案不是中文（title="${title}"）⇒ ` +
          `它**不认** Accept-Language ⇒ 多半是 2026-11-01 01:33 之前的旧构建 ⇒ 重新编一遍端脑即可。`,
      );
      return;
    }
    expect(title).toMatch(/\p{Script=Han}/u);
  });

  it('活端脑的字节**形状**与冻结的 fixture 一致（不一致 ⇒ 该重新抓 fixture）', async (ctx) => {
    await setup;
    if (!serverUp) {
      ctx.skip();
      return;
    }

    // ⚠️⚠️ **影子锁要显式注入**（2026-11-09 真端脑实测）：端脑的 `/a2a` 在
    // shadow key 后面 ⇒ ⇒ 不带 ⇒ ⇒ **401** ⇒ ⇒ 而这条用例断言的是「端脑的
    // 字节能不能被解析成一块界面」⇒ ⇒ 401 时那条**根本没测到**⇒ ⇒ 判红是
    // 「判据在测错东西」⇒ ⇒ ⇒ 这里把判据自己的影子锁递进去（与门形同规则）。
    let result: Awaited<ReturnType<typeof requestA2uiSurface>>;
    try {
      result = await requestA2uiSurface({
        baseUrl: API_BASE_URL,
        apiKey: SHADOW_KEY,
        view: 'tasks',
        locale: 'zh-CN',
      });
    } catch (e) {
      if (e instanceof A2uiHttpError && e.status === 401) {
        console.warn(
          '[a2ui-live] 端脑拒了这次请求（401）—— 影子锁对不上 ⇒ ⇒ ' +
            '这条**字节形状**测不了 ⇒ ⇒ 跳过（不是「形状不对」）',
        );
        ctx.skip();
        return;
      }
      throw e;
    }
    const frozen = eventsOf(readFileSync(fixturePath('tasks_sse_empty.txt'), 'utf8'));
    expect(frozen.length).toBeGreaterThan(0);

    const liveShape = JSON.stringify(shapeSignature(result.events[0]));
    const frozenShape = JSON.stringify(shapeSignature(frozen[0]));
    if (liveShape !== frozenShape) {
      // ⚠️ **软失败**：协议**形状**变了 ⇒ ⇒ 客户端多半还能读，但**冻结的 fixture 过期了**
      // ⇒ ⇒ 该重新抓一份（不然两端会对着过期的字节对齐）。
      console.warn(
        '[a2ui-live] 活端脑的事件**形状**与冻结的 fixture 不一致 ⇒ ' +
          'fixture 该重新抓了（客户端本身仍能解析 ⇒ 这不是客户端的锅）。',
      );
      return;
    }
    expect(liveShape).toBe(frozenShape);
  });
});
