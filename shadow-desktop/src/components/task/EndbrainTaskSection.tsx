import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Clock, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Badge, Button, Input } from '../ui';
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
 * ✅ **现在能「读 ＋ 确认 ＋ 改 ＋ 删」**：改标题／优先级／截止时间与删除
 * ⇒ ⇒ 走的是端脑**已经有的**那两面（`POST /api/telencephalon/tasks/{id}/update`
 * 与 `DELETE /api/telencephalon/tasks/{id}`）⇒ ⇒ 与移动端**同一套端点**。
 * ⚠️ 上一刀「只做读＋确认」是因为桌面的端脑客户端**没有**那两个方法 ⇒ ⇒
 * 而补它们要同时动「客户端端点对照表」⇒ ⇒ 那张表当时正被并行会话在飞改
 * ⇒ ⇒ 那一刀**主动降级**；⇒ ⇒ 现在那张表空出来了 ⇒ ⇒ 这一刀把它补齐。
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

  // —— 编辑 / 删除 ——
  const updateTask = useTaskBoardDataStore((s) => s.updateEndbrainTask);
  const deleteTask = useTaskBoardDataStore((s) => s.deleteEndbrainTask);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftPriority, setDraftPriority] = useState<EndbrainTaskPriority>('Medium');
  const [draftDue, setDraftDue] = useState('');

  const openEditor = (task: EndbrainTask) => {
    setEditingId(task.id);
    setDraftTitle(task.title);
    setDraftPriority(task.priority);
    // ⚠️ `datetime-local` 要的是**本地钟点的裸值**（`2026-11-10T15:00`）
    // ⇒ ⇒ 从 RFC3339 还原成本地裸值（不能直接塞 RFC3339 进去）。
    setDraftDue(task.dueTime ? toLocalInputValue(task.dueTime) : '');
  };

  const closeEditor = () => {
    setEditingId(null);
  };

  const handleSave = async (task: EndbrainTask) => {
    setBusyId(task.id);
    try {
      await updateTask(task.id, {
        title: draftTitle.trim() || task.title,
        priority: draftPriority,
        // ⚠️ 本地裸值 ⇒ ⇒ 换成 **RFC3339（UTC）**再发 ⇒ ⇒ 端脑的
        // `parse_due_time` 认得（它认 ISO8601 与中文相对时间）。
        dueTime: draftDue ? new Date(draftDue).toISOString() : undefined,
      });
      closeEditor();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (task: EndbrainTask) => {
    setBusyId(task.id);
    try {
      await deleteTask(task.id);
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

            {/* —— 改 / 删（不是只有「待确认」才有：对话里建的任务随时能改）—— */}
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                icon={<Pencil size={14} />}
                onClick={() => openEditor(task)}
                disabled={busyId === task.id}
                data-testid={`endbrain-task-${task.id}-edit`}
              >
                {t('common.edit')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 size={14} />}
                onClick={() => void handleDelete(task)}
                disabled={busyId === task.id}
                data-testid={`endbrain-task-${task.id}-delete`}
              >
                {t('common.delete')}
              </Button>
            </div>

            {editingId === task.id && (
              <div
                className="mt-2 flex flex-col gap-2 rounded-md border border-border p-2"
                data-testid={`endbrain-task-${task.id}-editor`}
              >
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {t('tasks.edit.titleField', '标题')}
                  <Input
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    data-testid={`endbrain-task-${task.id}-edit-title`}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {t('tasks.priority', '优先级')}
                  {/* ⚠️ **原生 select**（不是 Radix 的）—— ⇒ 判据能用
                      `fireEvent.change` 真的改它 ⇒ ⇒ Radix 在 jsdom 里
                      只能靠指针事件，判据就钉不住了。 */}
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                    value={draftPriority}
                    onChange={(e) =>
                      setDraftPriority(e.target.value as EndbrainTaskPriority)
                    }
                    data-testid={`endbrain-task-${task.id}-edit-priority`}
                  >
                    {(['Low', 'Medium', 'High', 'Urgent'] as EndbrainTaskPriority[]).map(
                      (p) => (
                        <option key={p} value={p}>
                          {t(ENDBRAIN_PRIORITY_LABEL_KEY[p])}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {t('tasks.dueDate')}
                  <Input
                    type="datetime-local"
                    value={draftDue}
                    onChange={(e) => setDraftDue(e.target.value)}
                    data-testid={`endbrain-task-${task.id}-edit-due`}
                  />
                </label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => void handleSave(task)}
                    disabled={busyId === task.id}
                    data-testid={`endbrain-task-${task.id}-edit-save`}
                  >
                    {t('common.save')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={closeEditor}
                    disabled={busyId === task.id}
                    data-testid={`endbrain-task-${task.id}-edit-cancel`}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
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

/**
 * RFC3339 ⇒ `datetime-local` 的**本地裸值**（`2026-11-10T15:00`）。
 *
 * ⚠️ **不能把 RFC3339 直接塞进 `datetime-local`** ⇒ ⇒ 那个输入框只认
 * `YYYY-MM-DDTHH:mm`（**不带时区**）⇒ ⇒ 塞进去会**显示不出来**（或者
 * 显示成一个错的时刻）⇒ ⇒ 编辑框会**空着**，用户以为截止时间没了。
 */
function toLocalInputValue(dueTime: string): string {
  const date = new Date(dueTime);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('');
}
