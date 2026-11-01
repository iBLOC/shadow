import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

const { telencephalonState } = vi.hoisted(() => ({
  telencephalonState: { connection: { baseUrl: 'http://localhost:8085' } },
}));

vi.mock('../platform', () => ({
  // ⚠️ `isTauri` 也要给 —— client 现在会走 `lib/adminToken.ts`（读 admin 钥匙）
  // ⇒ ⇒ 而 adminToken 判「是不是 Tauri」用的就是它 ⇒ ⇒ 少了它 ⇒ TypeError。
  isTauri: () => false,
  prefrontalUrl: () => 'http://localhost:8085',
}));

vi.mock('../telencephalonClient', () => ({
  telencephalonClient: { setBaseUrl: vi.fn() },
}));

vi.mock('../../stores/telencephalonStore', () => ({
  useTelencephalonStore: {
    getState: () => ({
      connection: telencephalonState.connection,
      setBaseUrl: (url: string) => { telencephalonState.connection.baseUrl = url; },
    }),
  },
}));

import {
  mapTask,
  mapTaskStep,
  toTaskRecordWire,
  PrefrontalClient,
} from '../prefrontalClient';

describe('hippocampus task wire mapping', () => {
  // hippocampus-core/src/task.rs puts `#[serde(rename_all = "camelCase")]`
  // on TaskRecord / TaskStep, so the server speaks camelCase while the
  // desktop UI reads snake_case.

  it('mapTask converts the camelCase record into the UI shape', () => {
    const task = mapTask({
      taskId: 't-1',
      source: 'a2a',
      targetAgent: 'prefrontal',
      status: 'running',
      tenantId: 'default',
      receivedAt: '2026-10-28T00:00:00Z',
      completedAt: null,
      tags: ['a', 'b'],
    });

    expect(task.task_id).toBe('t-1');
    expect(task.target_agent).toBe('prefrontal');
    expect(task.tenant_id).toBe('default');
    expect(task.received_at).toBe('2026-10-28T00:00:00Z');
    expect(task.completed_at).toBeNull();
    expect(task.status).toBe('running');
    expect(task.tags).toEqual(['a', 'b']);
  });

  it('mapTask still accepts the snake_case spelling', () => {
    const task = mapTask({
      task_id: 't-2',
      target_agent: 'occipital',
      tenant_id: 'acme',
      received_at: '2026-10-28T01:00:00Z',
    });

    expect(task.task_id).toBe('t-2');
    expect(task.target_agent).toBe('occipital');
    expect(task.tenant_id).toBe('acme');
    expect(task.received_at).toBe('2026-10-28T01:00:00Z');
  });

  it('mapTaskStep converts step fields', () => {
    const step = mapTaskStep({
      stepId: 's-1',
      order: 2,
      dependsOn: ['s-0'],
      status: 'completed',
      startedAt: '2026-10-28T00:00:00Z',
      completedAt: '2026-10-28T00:01:00Z',
    });

    expect(step.step_id).toBe('s-1');
    expect(step.order).toBe(2);
    expect(step.depends_on).toEqual(['s-0']);
    expect(step.status).toBe('completed');
    expect(step.started_at).toBe('2026-10-28T00:00:00Z');
    expect(step.completed_at).toBe('2026-10-28T00:01:00Z');
  });

  it('mapTaskStep maps the agent StepTarget variant', () => {
    const step = mapTaskStep({
      stepId: 's-2',
      target: { type: 'agent', skill: 'chat', lobeId: 'lobe-1', prompt: 'hi' },
    });

    expect(step.target?.type).toBe('agent');
    expect(step.target).toMatchObject({
      type: 'agent',
      skill: 'chat',
      lobe_id: 'lobe-1',
      prompt: 'hi',
    });
  });

  it('mapTaskStep maps the tool StepTarget variant', () => {
    const step = mapTaskStep({
      stepId: 's-3',
      target: { type: 'tool', toolName: 'websearch', timeoutMs: 5000 },
    });

    expect(step.target).toMatchObject({
      type: 'tool',
      tool_name: 'websearch',
      timeout_ms: 5000,
    });
  });

  it('toTaskRecordWire produces the camelCase upsert body', () => {
    const body = toTaskRecordWire(
      {
        task_id: 't-3',
        source: 'local',
        target_agent: 'prefrontal',
        status: 'pending',
        tenant_id: 'default',
        received_at: '2026-10-28T00:00:00Z',
        completed_at: null,
        tags: ['x'],
        steps: [
          {
            step_id: 's-1',
            order: 0,
            status: 'pending',
            target: { type: 'tool', tool_name: 'websearch', timeout_ms: 1000 },
          },
        ],
      },
      'default',
    );

    expect(body.taskId).toBe('t-3');
    expect(body.targetAgent).toBe('prefrontal');
    expect(body.tenantId).toBe('default');
    expect(body.receivedAt).toBe('2026-10-28T00:00:00Z');
    expect(body.completedAt).toBeNull();
    expect(body.tags).toEqual(['x']);
    expect(body.steps).toEqual([
      expect.objectContaining({ stepId: 's-1', dependsOn: [] }),
    ]);
    expect((body.steps as Record<string, unknown>[])[0].target).toMatchObject({
      type: 'tool',
      toolName: 'websearch',
      timeoutMs: 1000,
    });
  });
});

describe('PrefrontalClient task endpoints', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    telencephalonState.connection.baseUrl = 'http://localhost:8085';
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listTasks maps the camelCase response', async () => {
    mockFetch.mockResolvedValue({
      ok: true, status: 200, statusText: 'OK',
      json: async () => [
        { taskId: 't-9', targetAgent: 'prefrontal', status: 'pending' },
      ],
      text: async () => '[]',
    });
    const client = new PrefrontalClient();
    const tasks = await client.listTasks();
    expect(tasks[0].task_id).toBe('t-9');
    expect(tasks[0].target_agent).toBe('prefrontal');
  });

  it('updateTask posts a camelCase upsert body', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({
          taskId: 't-10',
          targetAgent: 'prefrontal',
          status: 'pending',
          receivedAt: '2026-10-28T00:00:00Z',
        }),
        text: async () => '{}',
      })
      .mockResolvedValueOnce({
        ok: true, status: 200, statusText: 'OK',
        json: async () => ({
          taskId: 't-10',
          targetAgent: 'prefrontal',
          status: 'completed',
          receivedAt: '2026-10-28T00:00:00Z',
        }),
        text: async () => '{}',
      });

    const client = new PrefrontalClient();
    const updated = await client.updateTask('default', 't-10', { status: 'completed' });

    const postCall = mockFetch.mock.calls[1];
    expect(postCall[0]).toBe('http://localhost:8085/hippocampus/api/tasks');
    const body = JSON.parse((postCall[1] as { body: string }).body);
    expect(body.taskId).toBe('t-10');
    expect(body.tenantId).toBe('default');
    expect(body.status).toBe('completed');
    expect(updated.task_id).toBe('t-10');
    expect(updated.status).toBe('completed');
  });
});
