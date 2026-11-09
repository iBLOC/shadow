import { describe, it, expect } from 'vitest';
import {
  isAwaitingConfirmation,
  mapEndbrainTask,
  normalizeEndbrainPriority,
  normalizeEndbrainStatus,
} from '../../src/lib/endbrainTasks';

describe('端脑任务的线上形状', () => {
  it('把端脑的 serde 变体名原样认下来', () => {
    const task = mapEndbrainTask({
      id: 'task-1',
      title: '和客户开会',
      description: '讨论项目进度',
      status: 'InProgress',
      priority: 'High',
      due_time: '2026-10-31T09:00:00Z',
      confirmed: true,
      created_at: '2026-10-30T01:00:00Z',
    });
    expect(task).not.toBeNull();
    expect(task!.id).toBe('task-1');
    expect(task!.status).toBe('InProgress');
    expect(task!.priority).toBe('High');
    expect(task!.dueTime).toBe('2026-10-31T09:00:00Z');
    expect(task!.confirmed).toBe(true);
  });

  it('认不得任务号 ⇒ 这条认不得（跳过，不是静默塞一条空任务）', () => {
    expect(mapEndbrainTask({ title: '没有号' })).toBeNull();
    expect(mapEndbrainTask(null)).toBeNull();
    expect(mapEndbrainTask('nope')).toBeNull();
  });

  it('认不得的状态/优先级 ⇒ 与移动端同一口径（Pending/Medium）', () => {
    expect(normalizeEndbrainStatus('Nope')).toBe('Pending');
    expect(normalizeEndbrainPriority('Nope')).toBe('Medium');
  });

  it('只有「待确认」的才给确认按钮', () => {
    const pending = mapEndbrainTask({ id: 'task-1', status: 'Pending', confirmed: false })!;
    const confirmed = mapEndbrainTask({ id: 'task-2', status: 'Pending', confirmed: true })!;
    const done = mapEndbrainTask({ id: 'task-3', status: 'Completed', confirmed: true })!;
    expect(isAwaitingConfirmation(pending)).toBe(true);
    expect(isAwaitingConfirmation(confirmed)).toBe(false);
    expect(isAwaitingConfirmation(done)).toBe(false);
  });
});
