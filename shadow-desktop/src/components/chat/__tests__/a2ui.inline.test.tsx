// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ToolCallMessageCard } from '../ToolCallMessageCard';
import type { ToolCallMessage } from '../../../types';

/**
 * **A2UI 内联在消息里** —— 这条不变量钉在这里。
 *
 * ## 为什么钉它
 *
 * 客户端工具 `show_a2ui_surface` 让**模型在对话里**点名要界面 ⇒
 * 设备取回 surface ⇒ **画在那条消息里**（不是顶部面板、不是另一个页面）。
 *
 * ⚠️ **契约是共享 fixture**：事件字节与端脑 `POST /a2a` 发的**逐字同形**
 * （`fixtures/a2ui/tasks_sse.txt`）⇒ ⇒ 移动端那份消费的是同一批字节。
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

/** fixture 的每一行 `data: {...}` ⇒ 一个 A2A 事件对象。 */
function fixtureEvents(): unknown[] {
  const raw = readFileSync(fixturePath('tasks_sse.txt'), 'utf8');
  const out: unknown[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    out.push(JSON.parse(trimmed.slice('data:'.length).trim()));
  }
  return out;
}

function callWith(result: unknown): ToolCallMessage {
  return {
    id: 'call-1',
    name: 'show_a2ui_surface',
    args: { view: 'tasks' },
    status: 'succeeded',
    result,
    reported: true,
  } as ToolCallMessage;
}

describe('A2UI 内联在消息里', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('工具结果带了 A2UI 事件 ⇒ 界面画在**这条消息里**', () => {
    render(
      <ToolCallMessageCard
        call={callWith({ report: '已展开「任务看板」。', a2ui_events: fixtureEvents() })}
      />,
    );

    // 内联插槽在。
    expect(screen.getByTestId('a2ui-inline-surface')).toBeTruthy();
    // ⚠️ 而且**真的画出了组件树**（fixture 里的任务标题）。
    expect(screen.getByText('写周报')).toBeTruthy();
    // ⚠️ **原始事件 JSON 不许甩给用户** —— 事件已经画成界面了。
    expect(screen.queryByText(/surfaceUpdate/)).toBeNull();
    // ⚠️ **结果卡片显示的是那句人话**（不是一坨协议字节）。
    expect(screen.getByText('已展开「任务看板」。')).toBeTruthy();
  });

  it('没有 A2UI 事件 ⇒ 不画内联界面（普通工具结果照旧）', () => {
    render(
      <ToolCallMessageCard
        call={callWith({ report: '端脑这次没有画界面，它说：这里能看什么。' })}
      />,
    );

    expect(screen.queryByTestId('a2ui-inline-surface')).toBeNull();
  });

  it('**只有 surfaceUpdate 没有 beginRendering** ⇒ 不画半成品', () => {
    const events = fixtureEvents();
    // 只留第一条（surfaceUpdate，没有 beginRendering）。
    render(
      <ToolCallMessageCard call={callWith({ a2ui_events: [events[0]] })} />,
    );

    expect(screen.queryByTestId('a2ui-inline-surface')).toBeNull();
  });
});
