import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startReminderPoller } from '../../src/lib/reminderInbox';
import type { ReminderNotification } from '../../src/lib/telencephalonClient';

function reminder(id: string): ReminderNotification {
  return {
    id,
    task_id: `task-${id}`,
    task_title: '和客户开会',
    notification_type: 'Reminder',
    message: '⏰ 任务即将到期: 和客户开会',
    timestamp: '2026-11-09T00:00:00Z',
    due_time: null,
  };
}

describe('reminderInbox', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('delivers a pending reminder and acks it afterwards', async () => {
    const listNotifications = vi.fn().mockResolvedValue([reminder('1')]);
    const ackNotifications = vi.fn().mockResolvedValue(undefined);
    const deliver = vi.fn().mockResolvedValue(true);

    const stop = startReminderPoller({
      source: { listNotifications, ackNotifications },
      deliver,
      intervalMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0][0].id).toBe('1');
    expect(ackNotifications).toHaveBeenCalledWith(['1']);
    stop();
  });

  it('does NOT ack a reminder that was not delivered', async () => {
    // ⚠️ 这是本文件的**核心纪律**：送不出去 ⇒ ⇒ 不确认 ⇒ ⇒ 提醒留在待办里。
    //    确认掉一条用户没看到的提醒 ⇒ ⇒ 提醒静默消失 ⇒ ⇒ 失败长得像成功。
    const listNotifications = vi.fn().mockResolvedValue([reminder('1')]);
    const ackNotifications = vi.fn().mockResolvedValue(undefined);
    const deliver = vi.fn().mockResolvedValue(false);

    const stop = startReminderPoller({
      source: { listNotifications, ackNotifications },
      deliver,
      intervalMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(deliver).toHaveBeenCalledTimes(1);
    expect(ackNotifications).not.toHaveBeenCalled();
    stop();
  });

  it('keeps polling and retries a reminder that was not delivered', async () => {
    const listNotifications = vi.fn().mockResolvedValue([reminder('1')]);
    const ackNotifications = vi.fn().mockResolvedValue(undefined);
    const deliver = vi.fn().mockResolvedValue(false);

    const stop = startReminderPoller({
      source: { listNotifications, ackNotifications },
      deliver,
      intervalMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);

    expect(deliver).toHaveBeenCalledTimes(2);
    expect(ackNotifications).not.toHaveBeenCalled();
    stop();
  });

  it('stops polling when the returned stop function is called', async () => {
    const listNotifications = vi.fn().mockResolvedValue([]);
    const ackNotifications = vi.fn().mockResolvedValue(undefined);

    const stop = startReminderPoller({
      source: { listNotifications, ackNotifications },
      deliver: vi.fn().mockResolvedValue(true),
      intervalMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(listNotifications).toHaveBeenCalledTimes(1);
  });

  it('keeps running when the poll itself fails', async () => {
    const listNotifications = vi
      .fn()
      .mockRejectedValueOnce(new Error('endbrain is down'))
      .mockResolvedValue([reminder('1')]);
    const ackNotifications = vi.fn().mockResolvedValue(undefined);
    const deliver = vi.fn().mockResolvedValue(true);
    const onError = vi.fn();

    const stop = startReminderPoller({
      source: { listNotifications, ackNotifications },
      deliver,
      intervalMs: 1000,
      onError,
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);

    expect(onError).toHaveBeenCalled();
    expect(deliver).toHaveBeenCalledTimes(1);
    stop();
  });
});
