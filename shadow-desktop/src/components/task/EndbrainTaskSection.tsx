import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { Badge, Button } from '../ui';
import { useTaskBoardDataStore } from '../../stores/taskBoardDataStore';
import {
  ENDBRAIN_PRIORITY_LABEL_KEY,
  ENDBRAIN_STATUS_LABEL_KEY,
  isAwaitingConfirmation,
  type EndbrainTask,
  type EndbrainTaskPriority,
  type EndbrainTaskStatus,
} from '../../lib/endbrainTasks';

type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'destructive'
  | 'success'
  | 'warning'
  | 'info';

const PRIORITY_VARIANT: Record<EndbrainTaskPriority, BadgeVariant> = {
  Low: 'secondary',
  Medium: 'default',
  High: 'warning',
  Urgent: 'destructive',
};

const STATUS_VARIANT: Record<EndbrainTaskStatus, BadgeVariant> = {
  Pending: 'default',
  InProgress: 'info',
  Completed: 'success',
  Cancelled: 'secondary',
  Overdue: 'destructive',
};

/**
 * **端脑任务**分区 —— 对话里建的那些任务。
 *
 * ⚠️ **为什么桌面以前看不见它们**：桌面那块「海马体任务」分区打的是
 * `/hippocampus/api/tasks` ⇒ ⇒ 那是**另一份数据**（agent 运行记录）
 * ⇒ ⇒ 对话里建的任务落在端脑的 `TaskStore` 里 ⇒ ⇒ **两边永远对不上**。
 * ⇒ ⇒ 现在桌面板上**单开这一块**，直读端脑那张面（`/api/telencephalon/tasks`）
 * ⇒ ⇒ 与移动端**同一份数据、同一套字面量**。
 *
 * ⚠️ **只做「读 ＋ 确认」**：改标题／优先级／删除要动桌面的端脑客户端
 * ⇒ ⇒ 那要同时改「客户端端点对照表」⇒ ⇒ 而那张表当时正被并行会话在飞改
 * ⇒ ⇒ **这一刀不碰**（宁可不齐，也不把别人的在飞件卷进来）。
 */
export function EndbrainTaskSection() {
  const { t } = useTranslation();
  const tasks = useTaskBoardDataStore((s) => s.endbrainTasks);
  const isLoading = useTaskBoardDataStore((s) => s.isLoadingEndbrain);
  const error = useTaskBoardDataStore((s) => s.endbrainError);
  const skipped = useTaskBoardDataStore((s) => s.endbrainSkipped);
  const fetchTasks = useTaskBoardDataStore((s) => s.fetchEndbrainTasks);
  const confirmTask = useTaskBoardDataStore((s) => s.confirmEndbrainTask);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const handleConfirm = async (task: EndbrainTask, confirmed: boolean) => {
    setBusyId(task.id);
    try {
      await confirmTask(task.id, confirmed);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      className="flex-shrink-0 rounded-lg border border-border bg-card p-4"
      data-testid="endbrain-task-section"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            {t('tasks.endbrainTasks', '端脑任务')}
          </h3>
          {tasks.length > 0 && (
            <Badge variant="secondary" size="sm">
              {tasks.length}
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon={<RefreshCw size={14} />}
          onClick={() => void fetchTasks()}
          disabled={isLoading}
        >
          {t('common.refresh')}
        </Button>
      </div>

      {error && (
        <p className="mb-2 text-xs text-destructive" role="alert">
          {t('tasks.endbrainTasksError', '读不到端脑任务：')} {error}
        </p>
      )}
      {skipped > 0 && (
        <p className="mb-2 text-xs text-destructive" role="alert">
          {t('tasks.endbrainTasksSkipped', '有 {n} 条任务形状认不得，已跳过。').replace(
            '{n}',
            String(skipped),
          )}
        </p>
      )}

      {tasks.length === 0 && !isLoading && !error && (
        <p className="text-xs text-muted-foreground">{t('tasks.noTasks')}</p>
      )}

      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="rounded-md border border-border p-3"
            data-testid={`endbrain-task-${task.id}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {task.title || task.id}
              </span>
              <Badge variant={PRIORITY_VARIANT[task.priority]} size="sm">
                {t(ENDBRAIN_PRIORITY_LABEL_KEY[task.priority])}
              </Badge>
              <Badge
                variant={STATUS_VARIANT[task.status]}
                size="sm"
                data-testid={`endbrain-task-${task.id}-status`}
              >
                {isAwaitingConfirmation(task)
                  ? t('tasks.endbrainAwaiting', '待确认')
                  : t(ENDBRAIN_STATUS_LABEL_KEY[task.status])}
              </Badge>
            </div>
            {task.description && (
              <p className="mt-1 text-xs text-muted-foreground">{task.description}</p>
            )}
            {task.dueTime && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock size={12} />
                {t('tasks.dueDate')} {formatDue(task.dueTime)}
              </p>
            )}
            {isAwaitingConfirmation(task) && (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => void handleConfirm(task, true)}
                  disabled={busyId === task.id}
                  data-testid={`endbrain-task-${task.id}-confirm`}
                >
                  {t('tasks.endbrainConfirm', '确认')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleConfirm(task, false)}
                  disabled={busyId === task.id}
                  data-testid={`endbrain-task-${task.id}-reject`}
                >
                  {t('tasks.reject')}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** 端脑存的是 **UTC 瞬间** ⇒ ⇒ 显示按**本地钟点**还原（跟移动端同一口径）。 */
function formatDue(dueTime: string): string {
  const date = new Date(dueTime);
  if (Number.isNaN(date.getTime())) return dueTime;
  return format(date, 'yyyy-MM-dd HH:mm');
}
