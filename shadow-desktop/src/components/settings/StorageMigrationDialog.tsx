import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, RefreshCw, XOctagon } from 'lucide-react';
import { Button, Progress } from '../ui';
import type { StorageMigrationStatus } from '../../lib/telencephalonClient';

/**
 * **迁移中的阻塞弹窗** —— 搬家没完之前不许操作。
 *
 * ## 为什么是「不可关」的
 *
 * 迁移期间大脑已经把 `/hippocampus/*` 与 `/shadow/v1/conversations*` 全部
 * 挡成 503（`storage_migration_in_progress`）⇒ ⇒ 这时让用户回到界面只会
 * 撞上一串「请求失败」⇒ ⇒ **把维护状态画成故障**。所以这个弹窗：
 * 没有关闭钮、点遮罩不关、Esc 不关（`onKeyDown` 拦掉）。
 *
 * ## 三种终局
 *
 * - `done` ⇒ 展示「正在重启应用…」（调用方触发 `restartApp()`）；
 * - `failed` / `aborted` ⇒ 显示**后端原话** ＋ `[重试]` `[放弃并保留原存储]`；
 * - `copying` / `flipping` ⇒ 进度（字节百分比 ＋ 数据集 i/N ＋ 当前数据集名）。
 */
export function StorageMigrationDialog({
  status,
  restarting,
  onRetry,
  onAbort,
}: {
  status: StorageMigrationStatus;
  restarting: boolean;
  onRetry: () => void;
  onAbort: () => void;
}) {
  const { t } = useTranslation();
  const total = status.datasets_total ?? 0;
  const done = status.datasets_done ?? 0;
  const bytesTotal = status.bytes_total ?? 0;
  const bytesDone = status.bytes_done ?? 0;
  // 字节未知（分母 0）⇒ 退回「数据集 i/N」的确定性进度。
  const pct =
    bytesTotal > 0
      ? Math.max(0, Math.min(100, Math.round((bytesDone / bytesTotal) * 100)))
      : total > 0
        ? Math.round((done / total) * 100)
        : 0;

  const phase = status.state;
  const running = phase === 'copying' || phase === 'flipping';
  const failed = phase === 'failed' || phase === 'aborted';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="storage-migration-title"
      // ⚠️ 点遮罩**不关**、Esc **不关** —— 见文件头（维护状态不是故障，
      // 但也不能让用户关掉一个还没结束的迁移）。
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="w-[min(480px,92vw)] rounded-lg border border-border bg-background p-5 shadow-xl">
        <h2 id="storage-migration-title" className="text-base font-semibold">
          {t('settings.memoryStorage.migration.title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {phase === 'done'
            ? t('settings.memoryStorage.migration.doneHint')
            : failed
              ? t('settings.memoryStorage.migration.failedHint')
              : t('settings.memoryStorage.migration.runningHint')}
        </p>

        {running && (
          <div className="mt-4 flex flex-col gap-2">
            <Progress value={pct} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {t('settings.memoryStorage.migration.datasets', {
                  done,
                  total,
                })}
              </span>
              <span>{pct}%</span>
            </div>
            {status.current && (
              <p className="text-xs text-muted-foreground">
                {t('settings.memoryStorage.migration.current', {
                  name: status.current,
                })}
              </p>
            )}
          </div>
        )}

        {status.cleanup_failures && status.cleanup_failures.length > 0 && (
          <div className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 p-2">
            <p className="text-xs font-medium">
              {t('settings.memoryStorage.migration.cleanupWarn')}
            </p>
            <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
              {status.cleanup_failures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}

        {failed && status.error && (
          <div className="mt-3 flex items-start gap-2 rounded border border-destructive/40 bg-destructive/10 p-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-xs break-words">{status.error}</p>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          {failed && (
            <>
              <Button variant="outline" onClick={onAbort}>
                <XOctagon className="mr-1 h-4 w-4" />
                {t('settings.memoryStorage.migration.abort')}
              </Button>
              <Button onClick={onRetry}>
                <RefreshCw className="mr-1 h-4 w-4" />
                {t('settings.memoryStorage.migration.retry')}
              </Button>
            </>
          )}
          {phase === 'done' && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {restarting
                ? t('settings.memoryStorage.migration.restarting')
                : t('settings.memoryStorage.migration.preparingRestart')}
            </span>
          )}
          {running && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('settings.memoryStorage.migration.pleaseWait')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
