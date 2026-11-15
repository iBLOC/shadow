// DOC-01..DOC-05 — 任务工作簿编辑器面（Univer，OSS core preset）。
//
// v1 数据面：**Univer 原生快照 JSON**（~/.shadow/results/<taskId>/summary.univer.json）。
// 为什么不是 xlsx：Univer 0.6.10 的 xlsx 导入/导出（importXlsxToUnit /
// exportUnitToXlsx）声明在 pro 的 exchange-client（授权闸）里，OSS core
// preset 没有这条路 ⇒ 本组件不依赖 pro 包。xlsx 字节面（document_load /
// document_save）原样保留在后端，留给后续（授权 or Rust 侧转换）再接。
//
// ⚠️ **「读不到」≠「还没有」** —— document_load_snapshot 把这两格分开：
//   Ok(None)  ＝ 这个任务还没有快照 ⇒ 合法开一个**空工作簿**；
//   Err(原文) ＝ 真读失败 ⇒ 明确说「读不到」＋原因，**不装作没有**。
//
// 本组件只做四件事（重活在 Tauri 后端）：
//   1. 挂载 Univer 实例（组件生命周期 ＝ 实例生命周期，卸载即 dispose）；
//   2. document_load_snapshot → createWorkbook（快照 or 空簿）；
//   3. CommandExecuted(MUTATION) → 2s 防抖 → save() → document_save_snapshot；
//   4. 「发布到飞书」按钮 → document_publish_feishu →
//      window 'shadow:feishu-published' CustomEvent（ConversationPage 监听）
//      ＋ 页内直链。发布失败把**原文原因**留在页面上（后端已做 DOC-04 回滚）。

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { createUniver, defaultTheme } from '@univerjs/presets';
import { CommandType, LocaleType } from '@univerjs/core';
import type { IWorkbookData } from '@univerjs/core';
import { UniverSheetsCorePreset } from '@univerjs/presets/preset-sheets-core';
import UniverPresetSheetsCoreEn from '@univerjs/presets/preset-sheets-core/locales/en-US';
import UniverPresetSheetsCoreZh from '@univerjs/presets/preset-sheets-core/locales/zh-CN';
import '@univerjs/presets/lib/styles/preset-sheets-core.css';

export interface UniverSheetProps {
  taskId: string;
}

const SAVE_DEBOUNCE_MS = 2000;

interface PublishResult {
  spreadsheet_token: string;
  url: string;
}

/** createWorkbook / addEvent 由 @univerjs/sheets facade mixin 提供（模块扩充）。 */
interface UniverSheetApi {
  createWorkbook(data?: Partial<IWorkbookData>): unknown;
  addEvent(event: string, callback: (e: { type: unknown }) => void): { dispose(): void };
  getActiveWorkbook(): { save(): IWorkbookData; getName(): string } | null;
  Event: { CommandExecuted: string };
}

/** 快照 → 发布矩阵：每个 sheet 一张 string[][]（cellData 里出现过的行才算）。 */
export function sheetsMatrixFromSnapshot(snap: IWorkbookData): string[][][] {
  const sheets = snap.sheets ?? {};
  const order =
    snap.sheetOrder && snap.sheetOrder.length > 0
      ? snap.sheetOrder
      : Object.keys(sheets);
  return order
    .filter((id) => sheets[id] != null)
    .map((id) => {
      const cellData = sheets[id].cellData ?? {};
      const rowKeys = Object.keys(cellData);
      let maxRow = -1;
      let maxCol = -1;
      for (const r of rowKeys) {
        maxRow = Math.max(maxRow, Number(r));
        const rowCells = cellData[Number(r)] ?? {};
        for (const c of Object.keys(rowCells)) {
          maxCol = Math.max(maxCol, Number(c));
        }
      }
      const matrix: string[][] = [];
      for (let r = 0; r <= maxRow; r++) {
        const rowData = cellData[r] ?? {};
        const row: string[] = [];
        for (let c = 0; c <= maxCol; c++) {
          const v = rowData[c]?.v;
          row.push(v == null ? '' : String(v));
        }
        matrix.push(row);
      }
      return matrix;
    });
}

/** 空簿的合法起点（任务还没有快照 ⇒ 不是错误）。 */
function emptyWorkbookData(taskId: string): Partial<IWorkbookData> {
  return {
    name: 'summary ' + taskId,
    sheets: {
      'sheet-0001': {
        id: 'sheet-0001',
        name: 'Sheet1',
        rowCount: 60,
        columnCount: 20,
        cellData: {},
      },
    },
    sheetOrder: ['sheet-0001'],
  };
}

export function UniverSheet({ taskId }: UniverSheetProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const univerRef = useRef<{ dispose(): void } | null>(null);
  const apiRef = useRef<UniverSheetApi | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const rerunRef = useRef(false);

  // 容器 id：taskId 里可能混进 selector 特殊字符 ⇒ 清洗成纯 id 片段。
  const containerId = 'univer-editor-' + taskId.replace(/[^a-zA-Z0-9_-]/g, '_');

  /** status: loading（读快照）→ preparing（容器已渲染，正在构造 Univer）→ ready / error */
  const [status, setStatus] = useState<'loading' | 'preparing' | 'ready' | 'error'>('loading');
  const [snapshot, setSnapshot] = useState<Partial<IWorkbookData> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mountError, setMountError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  /** DOC-05：null ＝ 开关状态读不到 ⇒ 按钮保持可用（后端才是权威闸），**不装作已关**。 */
  const [feishuEnabled, setFeishuEnabled] = useState<boolean | null>(null);

  const doSave = useCallback(async () => {
    if (savingRef.current) {
      rerunRef.current = true;
      return;
    }
    const wb = apiRef.current?.getActiveWorkbook();
    if (!wb) return;
    savingRef.current = true;
    try {
      const json = JSON.stringify(wb.save());
      await invoke('document_save_snapshot', {
        taskId,
        snapshot: Array.from(new TextEncoder().encode(json)),
      });
      setSavedAt(new Date());
      setSaveError(null);
    } catch (e: unknown) {
      // ⚠️ 保存失败不许吞：原文原因留在页面上（DOC-02 纪律）。
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      savingRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        void doSave();
      }
    }
  }, [taskId]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void doSave();
    }, SAVE_DEBOUNCE_MS);
  }, [doSave]);

  // 阶段一：读快照字节（读不到 ≠ 还没有，两格分开说）。
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setLoadError(null);
    setMountError(null);
    setSnapshot(null);
    setSavedAt(null);
    setSaveError(null);
    setPublishError(null);
    setPublishedUrl(null);
    invoke<number[] | null>('document_load_snapshot', { taskId })
      .then((bytes) => {
        if (cancelled) return;
        if (bytes == null) {
          // 还没有快照 ⇒ 合法空工作簿（不是错误）。
          setSnapshot(emptyWorkbookData(taskId));
        } else {
          setSnapshot(
            JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as Partial<IWorkbookData>,
          );
        }
        setStatus('preparing');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      });
    // DOC-05 开关：读不到就保持 null（按钮可用，后端权威）。
    invoke<boolean>('document_feishu_enabled')
      .then((v) => {
        if (!cancelled) setFeishuEnabled(v);
      })
      .catch(() => {
        if (!cancelled) setFeishuEnabled(null);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  // 阶段二：容器已在 DOM ⇒ 构造 Univer ＋ 建工作簿 ＋ 挂防抖自动保存。
  useEffect(() => {
    // ⚠️ status 只作初始门控、刻意不进依赖：若把 status 放进依赖，
    // preparing→ready 的 setStatus 会在实例刚挂好时触发 cleanup
    // （dispose ＋ apiRef=null ＋ 清容器）——挂载读数看着正常，
    // 保存/发布那一面全死（失败长得像成功）。
    if (status !== 'preparing') return;
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let eventDisposable: { dispose(): void } | null = null;
    try {
      const { univer, univerAPI } = createUniver({
        // ⚠️ theme 必传：core 构造函数里「theme 不传 ⇒ 永不 setTheme」（无默认值），
        // sheets-ui 渲染层一取色（getCurrentTheme）就抛
        // 「[ThemeService]: current theme is not set!」⇒ canvas 永远出不来。
        // 真浏览器实测钉死；vitest 的 mock 抓不到 ⇒ 夹具绿冒充不了真面绿。
        // defaultTheme 从 presets 桶里来（它 re-export @univerjs/design）⇒ 零新依赖。
        theme: defaultTheme,
        locale: LocaleType.ZH_CN,
        locales: {
          [LocaleType.ZH_CN]: UniverPresetSheetsCoreZh,
          [LocaleType.EN_US]: UniverPresetSheetsCoreEn,
        },
        presets: [UniverSheetsCorePreset({ container: containerId })],
      });
      univerRef.current = univer;
      apiRef.current = univerAPI as unknown as UniverSheetApi;
      univerAPI.createWorkbook((snapshot ?? emptyWorkbookData(taskId)) as IWorkbookData);
      // 只有真数据变更（MUTATION）才触发防抖保存；纯 UI 命令不算。
      eventDisposable = univerAPI.addEvent(univerAPI.Event.CommandExecuted, (e) => {
        if (e.type === CommandType.MUTATION) scheduleSave();
      });
      if (disposed) {
        eventDisposable.dispose();
        univer.dispose();
        return;
      }
      setStatus('ready');
    } catch (e: unknown) {
      if (disposed) return;
      setMountError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
    return () => {
      disposed = true;
      eventDisposable?.dispose();
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      univerRef.current?.dispose();
      univerRef.current = null;
      apiRef.current = null;
      // StrictMode 双挂载的兜底：dispose 后容器里不许留残骸。
      // （用闭包里这一次渲染的 container，不回读 ref。）
      container.innerHTML = '';
    };
    // ⚠️ status 刻意不进 deps（初始门控）：放进去了，preparing→ready 的
    // setStatus 会在实例刚挂好时触发本 effect 的 cleanup（dispose ＋ 清容器）
    // ——挂载读数看着正常，保存/发布那一面全死。eslint 的提醒已知且有意。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, taskId, containerId, scheduleSave]);

  const handlePublish = useCallback(async () => {
    const wb = apiRef.current?.getActiveWorkbook();
    if (!wb || publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const snap = wb.save();
      const title = wb.getName() || taskId;
      const sheets = sheetsMatrixFromSnapshot(snap);
      const res = await invoke<PublishResult>('document_publish_feishu', {
        taskId,
        title,
        folderToken: null,
        sheets,
      });
      setPublishedUrl(res.url);
      // DOC-03：分享链路 — ConversationPage 监听这个事件并把卡片插进会话。
      window.dispatchEvent(
        new CustomEvent('shadow:feishu-published', {
          detail: { taskId, url: res.url, title },
        }),
      );
    } catch (e: unknown) {
      // 后端已做 DOC-04 回滚；这里把原文原因说出口。
      setPublishError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishing(false);
    }
  }, [taskId, publishing]);

  if (status === 'error') {
    return (
      <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" data-testid="univer-sheet">
        <div className="font-medium text-destructive">
          {loadError != null ? t('documentEditor.loadFailed') : t('documentEditor.mountFailed')}
        </div>
        <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
          {loadError ?? mountError}
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border" data-testid="univer-sheet">
      <header className="flex flex-wrap items-center gap-2 px-3 pt-2">
        <span className="text-sm font-medium">{t("documentEditor.title")}</span>
        {status !== 'ready' && (
          <span className="text-xs text-muted-foreground">{t("documentEditor.mounting")}</span>
        )}
        {savedAt && (
          <span className="text-xs text-muted-foreground">
            {t("documentEditor.savedAt", { time: savedAt.toLocaleTimeString() })}
          </span>
        )}
        {saveError && (
          <span className="break-all text-xs text-destructive">
            {t("documentEditor.saveFailed")}: {saveError}
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          disabled={feishuEnabled === false || publishing || status !== 'ready'}
          title={feishuEnabled === false ? t("documentEditor.feishuOff") : undefined}
          onClick={() => {
            void handlePublish();
          }}
        >
          {publishing ? t("documentEditor.publishing") : t("documentEditor.publish")}
        </button>
      </header>
      {feishuEnabled === false && (
        <p className="px-3 text-xs text-muted-foreground">{t("documentEditor.feishuOff")}</p>
      )}
      {publishError && (
        <p className="px-3 text-xs">
          <span className="text-destructive">{t("documentEditor.publishFailed")}</span>
          <span className="ml-1 break-all text-destructive">: {publishError}</span>
        </p>
      )}
      {publishedUrl && (
        <p className="px-3 text-xs">
          <span className="mr-1 text-muted-foreground">{t("documentEditor.publishedTitle")}:</span>
          <a href={publishedUrl} target="_blank" rel="noreferrer" className="font-mono text-primary underline">
            {publishedUrl}
          </a>
        </p>
      )}
      {/* 容器常驻真实尺寸：Univer 构造时容器若是 0 高（h-0），canvas 就按 0×0
          建出来，之后容器变大也不会自动重算 ⇒ 永不可见（真浏览器实测钉死）。 */}
      <div
        ref={containerRef}
        id={containerId}
        className="h-[420px] w-full"
        data-testid="univer-container"
      />
    </section>
  );
}