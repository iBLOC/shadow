// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSurfaceFromEvents, isStructurallyEmptySurface } from '../a2uiProtocol';
import { A2uiToolSurface } from '../../components/chat/A2uiToolSurface';

/**
 * **真端脑的字节** —— 这份 fixture **不是手写的**。
 *
 * ## 它从哪儿来
 *
 * 2026-11-02 从**活着的**端脑上打下来的（`POST http://127.0.0.1:60080/a2a`，
 * 请求体 `{"metadata":{"a2ui":{"view":"tasks"}}}`）⇒ ⇒ 所以它证明的是
 * 「客户端的解析路径与**活着的端脑**对得上」，而不只是「与 fixture 对得上」。
 *
 * ⚠️ **为什么它是「空看板」**：端脑上**一个任务都没有** ⇒ 于是它产出的是
 * `root(Column) + title(Text) + empty(Text)` ⇒ ⇒ **没有 TaskCard**。
 * ⚠️ 之前那份 fixture（`tasks_sse.txt`）是**有内容**的那一半
 * ⇒ ⇒ 两份合起来才覆盖「有 / 没有」两种形状。
 *
 * ⚠️ **这份字节来自的端脑构建早于「界面文案随语言走」那笔提交**
 * ⇒ ⇒ 所以它是**英文**的（`Tasks (0)` / `No tasks yet.`）
 * ⇒ ⇒ **别拿它断言语言**（语言那件事归 `a2ui_i18n.rs` 的单测）。
 * ⇒ ⇒ 但**信封与 parts 形状**在两版之间**没变** ⇒ ⇒ 协议断言依然成立。
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

function eventsOf(name: string): unknown[] {
  const raw = readFileSync(fixturePath(name), 'utf8');
  const out: unknown[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    out.push(JSON.parse(trimmed.slice('data:'.length).trim()));
  }
  return out;
}

describe('真端脑的字节（活端脑打下来的，不是手写的）', () => {
  const emptyEvents = eventsOf('tasks_sse_empty.txt');

  it('信封与 parts 形状 ⇒ 与另一份 fixture **逐字同形**', () => {
    // ⚠️ **为什么比形状**：端脑换了实现（甚至换了版本）⇒ 信封可能变
    // ⇒ ⇒ 而客户端的解析路径**必须**跟着变 ⇒ ⇒ 所以「同形」是跨版本的契约。
    const withContent = eventsOf('tasks_sse.txt');
    const shapeOf = (event: unknown) => {
      const result = (event as { result?: unknown }).result as {
        status?: { message?: { parts?: { kind?: string }[] } };
      };
      return {
        hasResult: 'result' in (event as object),
        kind: (result?.status?.message?.parts ?? []).map((p) => p.kind),
      };
    };
    for (const event of emptyEvents) {
      const shape = shapeOf(event);
      expect(shape.hasResult).toBe(true);
      expect(shape.kind).toEqual(['data']);
    }
    // 两份 fixture 的**信封形状**必须一样（只是内容不同）。
    expect(shapeOf(emptyEvents[0])).toEqual(shapeOf(withContent[0]));
    expect(shapeOf(emptyEvents[emptyEvents.length - 1])).toEqual(
      shapeOf(withContent[withContent.length - 1]),
    );
  });

  it('能建出 surface（收到了 beginRendering ⇒ 可渲染）', () => {
    const surface = buildSurfaceFromEvents(emptyEvents);
    expect(surface).not.toBeNull();
    expect(surface?.surfaceId).toBe('shadow.tasks');
    expect(surface?.rootId).toBe('root');
    expect(surface?.rendered).toBe(true);
    expect(surface?.components).toHaveLength(3);
  });

  it('**结构上是空的**（没有 TaskCard ⇒ 「没有内容」在结构上可判）', () => {
    expect(isStructurallyEmptySurface(buildSurfaceFromEvents(emptyEvents))).toBe(true);
    // ⚠️ **对照**：有内容的那一份 ⇒ **不是**空的。
    expect(isStructurallyEmptySurface(buildSurfaceFromEvents(eventsOf('tasks_sse.txt')))).toBe(false);
  });

  it('**画得出来**（不是一片空白）—— 用户看到的是「没有任务」这句话', () => {
    render(<A2uiToolSurface events={emptyEvents} />);
    expect(screen.getByTestId('a2ui-inline-surface')).toBeTruthy();
    expect(screen.getByText('Tasks (0)')).toBeTruthy();
    expect(screen.getByText('No tasks yet.')).toBeTruthy();
  });
});
