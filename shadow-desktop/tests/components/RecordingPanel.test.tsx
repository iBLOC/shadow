import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { RecordingPanel } from '../../src/components/recording/RecordingPanel';
import type { Conversation } from '../../src/types';

/**
 * ⚠️ **读不到 ≠ 没有** —— 这一族的纪律测试。
 *
 * 以前这里是「一个大 try 包两件事」：
 *   ❶ `recording_events` 读失败 ⇒ ⇒ 事件列表空（被说成「什么都没录到」）；
 *   ❷ `recording_report` 读失败 ⇒ ⇒ `.catch(() => null)` ⇒ ⇒ 报告卡片不出现
 *      （被说成「没有报告」）。
 * ⇒ ⇒ 两个不同的失败被压成同一个「什么都没有」。
 */

/** 一个**已经结束**的会话 ⇒ ⇒ 组件走「加载历史事件/报告」那条路。 */
const endedSession: Conversation = {
  id: 'sess-1',
  title: '录一下',
  messages: [],
  createdAt: new Date('2026-11-08T09:00:00Z'),
  updatedAt: new Date('2026-11-08T10:00:00Z'),
  kind: 'audio',
  recordingEndedAt: '2026-11-08T10:00:00Z',
};

function mockInvoke(impl: (cmd: string) => unknown) {
  vi.mocked(invoke).mockImplementation(((cmd: string) =>
    Promise.resolve(impl(cmd))) as any);
}

describe('RecordingPanel —— 「读不到」≠「没有」', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('报告读失败 ⇒ 说出「读不到」＋原因，且**不许**显示报告卡片', async () => {
    mockInvoke((cmd) => {
      if (cmd === 'recording_events') return [];
      if (cmd === 'recording_report') throw new Error('HTTP 500: report backend down');
      return null;
    });

    render(<RecordingPanel session={endedSession} onSessionChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/recording\.reportReadFailed/)).toBeInTheDocument();
    });
    // 上下文（译文）＋ 原因（原文）**两者都在**
    const el = screen.getByText(/recording\.reportReadFailed/);
    expect(el.textContent).toContain('HTTP 500: report backend down');

    // ⚠️ **读不到** ≠ **没有** ⇒ ⇒ 报告卡片不许出现
    expect(screen.queryByTestId('recording-report')).not.toBeInTheDocument();
    // 也不许说「还没有报告」—— 那是「真的读到空」才说的话
    expect(screen.queryByTestId('recording-report-none')).not.toBeInTheDocument();
  });

  it('孪生：报告**真的读到空** ⇒ 说「还没有报告」，**不**说读不到', async () => {
    mockInvoke((cmd) => (cmd === 'recording_events' ? [] : null));

    render(<RecordingPanel session={endedSession} onSessionChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId('recording-report-none')).toBeInTheDocument();
    });
    expect(screen.queryByText(/recording\.reportReadFailed/)).not.toBeInTheDocument();
  });

  it('孪生：报告读到了 ⇒ 报告卡片出现，且**没有**任何错误条', async () => {
    mockInvoke((cmd) => {
      if (cmd === 'recording_events') return [];
      if (cmd === 'recording_report') {
        return {
          id: 'r1',
          session_id: 'sess-1',
          text: '今天聊了三次',
          topics: [],
          person_names: [],
          event_count: 3,
          time_range: [0, 1] as [number, number],
        };
      }
      return null;
    });

    render(<RecordingPanel session={endedSession} onSessionChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId('recording-report')).toBeInTheDocument();
    });
    expect(screen.getByText('今天聊了三次')).toBeInTheDocument();
    expect(screen.queryByText(/recording\.reportReadFailed/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('recording-report-none')).not.toBeInTheDocument();
  });

  it('事件读失败 ⇒ 说出「读不到事件列表」＋原因', async () => {
    mockInvoke((cmd) => {
      if (cmd === 'recording_events') throw new Error('HTTP 503: hippocampus offline');
      return null;
    });

    render(<RecordingPanel session={endedSession} onSessionChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/recording\.eventsReadFailed/)).toBeInTheDocument();
    });
    expect(
      screen.getByText(/recording\.eventsReadFailed/).textContent,
    ).toContain('HTTP 503: hippocampus offline');
  });
});
