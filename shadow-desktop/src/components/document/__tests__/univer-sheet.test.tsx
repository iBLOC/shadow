// @vitest-environment jsdom
// UniverSheet 组件逻辑的夹具级验证：真组件代码 ＋ 假 Univer ＋ 假 invoke。
// 真浏览器（真 Univer 挂载）由 scripts/prove-univer-sheet-mount.mjs 负责，
// 两级各管各的面 —— 夹具会过 ≠ 真机挂载成功，别拿低级读数冒充高级读数。
//
// ⚠️ vi.mock 会被提升到文件顶部 ⇒ 工厂里引用顶层 const 会
// ReferenceError ⇒ 共享句柄一律走 vi.hoisted（同 components.test.tsx 家法）。
const handles = vi.hoisted(() => {
  return {
    mockInvoke: vi.fn(),
    createWorkbookMock: vi.fn(),
    addEventMock: vi.fn((..._args: unknown[]) => ({ dispose: vi.fn() })),
    getActiveWorkbookMock: vi.fn((): unknown => null),
    univerDisposeMock: vi.fn(),
  };
});
const { mockInvoke, createWorkbookMock, addEventMock, getActiveWorkbookMock, univerDisposeMock } = handles;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: handles.mockInvoke,
  convertFileSrc: vi.fn((p: string) => p),
}));
vi.mock('@univerjs/presets', () => ({
  // 组件 import { defaultTheme }（theme 必传，见组件内注释）；
  // mock 模块上缺这个导出会让组件挂进 mountFailed（Vitest 对缺失导出抛错）。
  defaultTheme: { primaryColor: '#000000', colorWhite: '#ffffff' },
  createUniver: vi.fn(() => ({
    univer: { dispose: handles.univerDisposeMock },
    univerAPI: {
      createWorkbook: handles.createWorkbookMock,
      addEvent: handles.addEventMock,
      getActiveWorkbook: handles.getActiveWorkbookMock,
      Event: { CommandExecuted: 'CommandExecuted' },
    },
  })),
}));
vi.mock('@univerjs/presets/preset-sheets-core', () => ({
  UniverSheetsCorePreset: () => ({ plugins: [] }),
}));
vi.mock('@univerjs/presets/preset-sheets-core/locales/en-US', () => ({ default: {} }));
vi.mock('@univerjs/presets/preset-sheets-core/locales/zh-CN', () => ({ default: {} }));
vi.mock('@univerjs/core', () => ({
  CommandType: { MUTATION: 2 },
  LocaleType: { ZH_CN: 'zh-CN', EN_US: 'en-US' },
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UniverSheet, sheetsMatrixFromSnapshot } from '../UniverSheet';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.clearAllMocks();
  getActiveWorkbookMock.mockReturnValue(null);
});

function stubInvoke(map: Record<string, (args?: unknown) => unknown>) {
  mockInvoke.mockImplementation((cmd: string, args?: unknown) => {
    const h = map[cmd];
    if (!h) return Promise.reject(new Error('unexpected invoke: ' + String(cmd)));
    const r = h(args);
    return r instanceof Promise ? r : Promise.resolve(r);
  });
}

function lastInvokeCall(cmd: string): unknown[] | undefined {
  const calls = mockInvoke.mock.calls.filter((c) => c[0] === cmd);
  return calls[calls.length - 1];
}

const SNAP = { sheets: { s1: { name: "Sheet1", cellData: { 0: { 0: { v: "hello" }, 1: { v: 42 } } } } }, sheetOrder: ["s1"] };

describe('UniverSheet', () => {
  it('mounts a workbook from the snapshot bytes', async () => {
    stubInvoke({
      document_load_snapshot: () => Array.from(new TextEncoder().encode(JSON.stringify(SNAP))),
      document_feishu_enabled: () => true,
    });
    render(<UniverSheet taskId="task-1" />);
    await waitFor(() => {
      expect(createWorkbookMock).toHaveBeenCalledTimes(1);
    });
    expect(createWorkbookMock.mock.calls[0][0]).toMatchObject({ sheets: { s1: { cellData: { 0: { 0: { v: "hello" } } } } } });
    expect(screen.getByTestId('univer-container')).toBeDefined();
  });

  it("starts an empty workbook when no snapshot exists yet (Ok(None) is NOT an error)", async () => {
    stubInvoke({
      document_load_snapshot: () => null,
      document_feishu_enabled: () => true,
    });
    render(<UniverSheet taskId="task-2" />);
    await waitFor(() => {
      expect(createWorkbookMock).toHaveBeenCalledTimes(1);
    });
    const arg = createWorkbookMock.mock.calls[0][0] as { name?: string };
    expect(String(arg.name)).toContain('task-2');
    expect(screen.queryByText('documentEditor.loadFailed')).toBeNull();
  });

  it("says READ-FAILED with the raw reason instead of faking an empty workbook", async () => {
    stubInvoke({
      document_load_snapshot: () => Promise.reject(new Error('read ...: permission denied')),
      document_feishu_enabled: () => Promise.reject(new Error('offline')),
    });
    render(<UniverSheet taskId="task-3" />);
    expect(await screen.findByText('documentEditor.loadFailed')).toBeDefined();
    expect(screen.getByText(/permission denied/)).toBeDefined();
    expect(createWorkbookMock).not.toHaveBeenCalled();
  });

  it("debounces MUTATION changes into document_save_snapshot", async () => {
    stubInvoke({
      document_load_snapshot: () => Array.from(new TextEncoder().encode(JSON.stringify(SNAP))),
      document_feishu_enabled: () => true,
      document_save_snapshot: () => null,
    });
    getActiveWorkbookMock.mockReturnValue({ save: () => SNAP, getName: () => "summary task-4" });
    render(<UniverSheet taskId="task-4" />);
    await waitFor(() => {
      expect(addEventMock).toHaveBeenCalled();
    });
    vi.useFakeTimers();
    const callback = addEventMock.mock.calls[0][1] as (e: { type: number }) => void;
    callback({ type: 2 }); // CommandType.MUTATION
    await vi.advanceTimersByTimeAsync(1000);
    expect(lastInvokeCall('document_save_snapshot')).toBeUndefined(); // 防抖窗口内不许已发出
    await vi.advanceTimersByTimeAsync(1200);
    const call = lastInvokeCall('document_save_snapshot');
    expect(call).toBeDefined();
    expect(call?.[1]).toMatchObject({ taskId: 'task-4' });
  });

  it("publishes the sheets matrix, fires the share event and renders the URL", async () => {
    const seen: CustomEvent[] = [];
    const onEvent = (e: Event) => seen.push(e as CustomEvent);
    window.addEventListener("shadow:feishu-published", onEvent);
    stubInvoke({
      document_load_snapshot: () => Array.from(new TextEncoder().encode(JSON.stringify(SNAP))),
      document_feishu_enabled: () => true,
      document_publish_feishu: () => ({ spreadsheet_token: "tok", url: "https://example.feishu.cn/sheets/abc" }),
    });
    getActiveWorkbookMock.mockReturnValue({ save: () => SNAP, getName: () => "summary task-5" });
    render(<UniverSheet taskId="task-5" />);
    const button = await screen.findByRole('button', { name: 'documentEditor.publish' });
    await userEvent.click(button);
    const call = await waitFor(() => {
      const c = lastInvokeCall('document_publish_feishu');
      expect(c).toBeDefined();
      return c;
    });
    // ⚠️ sheets 是三层数组：每个 sheet 一张 string[][] 矩阵（对齐 Rust 侧 Vec<Vec<Vec<String>>>，lib.rs document_publish_feishu）。
    expect(call?.[1]).toMatchObject({ taskId: 'task-5', title: 'summary task-5', folderToken: null, sheets: [[['hello', '42']]] });
    await waitFor(() => {
      expect(seen.length).toBe(1);
    });
    expect(seen[0].detail).toMatchObject({ taskId: 'task-5', url: 'https://example.feishu.cn/sheets/abc' });
    expect(await screen.findByText(/example/)).toBeDefined();
    window.removeEventListener("shadow:feishu-published", onEvent);
  });

  it("keeps the publish failure reason on the page (backend already rolled back)", async () => {
    stubInvoke({
      document_load_snapshot: () => Array.from(new TextEncoder().encode(JSON.stringify(SNAP))),
      document_feishu_enabled: () => true,
      document_publish_feishu: () => Promise.reject(new Error("feishu disabled (FEISHU_ENABLED=0)")),
    });
    getActiveWorkbookMock.mockReturnValue({ save: () => SNAP, getName: () => "summary task-6" });
    render(<UniverSheet taskId="task-6" />);
    const button = await screen.findByRole('button', { name: 'documentEditor.publish' });
    await userEvent.click(button);
    expect(await screen.findByText('documentEditor.publishFailed')).toBeDefined();
    expect(screen.getByText(/FEISHU_ENABLED=0/)).toBeDefined();
  });

  it("disables publish when the DOC-05 toggle is off, keeps it usable when the toggle is unreadable", async () => {
    stubInvoke({
      document_load_snapshot: () => Array.from(new TextEncoder().encode(JSON.stringify(SNAP))),
      document_feishu_enabled: () => false,
    });
    const { unmount } = render(<UniverSheet taskId="task-7" />);
    const button = await screen.findByRole('button', { name: 'documentEditor.publish' });
    await waitFor(() => {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });
    expect(screen.getByText('documentEditor.feishuOff')).toBeDefined();
    unmount();
    // 读不到开关 ⇒ 不许装作已关 ⇒ 按钮仍可用（后端是权威闸）。
    stubInvoke({
      document_load_snapshot: () => null,
      document_feishu_enabled: () => Promise.reject(new Error('offline')),
    });
    render(<UniverSheet taskId="task-8" />);
    const button2 = await screen.findByRole('button', { name: 'documentEditor.publish' });
    await waitFor(() => {
      expect((button2 as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it("disposes the Univer instance on unmount (lifecycle = component lifetime)", async () => {
    stubInvoke({
      document_load_snapshot: () => null,
      document_feishu_enabled: () => true,
    });
    const { unmount } = render(<UniverSheet taskId="task-9" />);
    await waitFor(() => {
      expect(createWorkbookMock).toHaveBeenCalled();
    });
    unmount();
    expect(univerDisposeMock).toHaveBeenCalled();
  });
});

describe('sheetsMatrixFromSnapshot', () => {
  it("builds one string matrix per sheet, empty cells as empty strings", () => {
    const snap = {
      sheets: {
        a: { name: 'A', cellData: { 0: { 0: { v: 'x' } }, 2: { 1: { v: 'y' } } } },
        b: { name: 'B', cellData: {} },
      },
      sheetOrder: ["a", "b"],
    } as never;
    const m = sheetsMatrixFromSnapshot(snap);
    expect(m.length).toBe(2);
    expect(m[0]).toEqual([["x", ""], ["", ""], ["", "y"]]);
    expect(m[1]).toEqual([]);
  });
  it("follows sheetOrder and falls back to object key order when it is missing", () => {
    const snap = {
      sheets: { b: { cellData: { 0: { 0: { v: "second" } } } }, a: { cellData: { 0: { 0: { v: "first" } } } } },
      sheetOrder: ["a", "b"],
    } as never;
    const m = sheetsMatrixFromSnapshot(snap);
    expect(m[0][0][0]).toBe('first');
    expect(m[1][0][0]).toBe('second');
  });
});