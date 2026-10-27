import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import {
  Calendar,
  Tag,
  Bot,
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  StopCircle,
  Trash2,
  Pencil,
  RefreshCw,
  ListTodo,
  Info,
  Terminal,
  History,
} from 'lucide-react';
import { PreviewButton } from '../preview/PreviewButton';
import { Button, Badge } from '../ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import { useTaskBoardDataStore } from '../../stores/taskBoardDataStore';
import type { Task, TaskStep } from '../../lib/prefrontalClient';

interface TaskDetailDialogProps {
  open: boolean;
  task: Task | null;
  onClose: () => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => Promise<void> | void;
}

const STEP_STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Circle className="h-4 w-4 text-muted-foreground" />,
  running: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
  completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  failed: <AlertCircle className="h-4 w-4 text-red-500" />,
  cancelled: <StopCircle className="h-4 w-4 text-yellow-500" />,
};

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'completed'
      ? 'success'
      : status === 'failed'
        ? 'destructive'
        : status === 'running'
          ? 'info'
          : status === 'cancelled'
            ? 'warning'
            : 'default';
  return <Badge variant={variant as 'success' | 'destructive' | 'info' | 'warning' | 'default'} size="sm">{status}</Badge>;
}

function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority) return null;
  const colors: Record<string, string> = {
    urgent: 'bg-red-500/15 text-red-500',
    high: 'bg-orange-500/15 text-orange-500',
    medium: 'bg-yellow-500/15 text-yellow-500',
    low: 'bg-green-500/15 text-green-500',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        colors[priority] || 'bg-muted text-muted-foreground',
      )}
    >
      {priority}
    </span>
  );
}

function stepLabel(target: TaskStep['target'], stepId: string): string {
  if (!target) return stepId;
  if (target.type === 'agent' && target.skill) return `${target.skill}`;
  if (target.type === 'tool' && target.tool_name) return target.tool_name ?? stepId;
  return stepId;
}

function SubtaskRow({ step }: { step: TaskStep }) {
  const t = step.target;
  const startedAt = step.started_at ? new Date(step.started_at) : null;
  const completedAt = step.completed_at ? new Date(step.completed_at) : null;
  const duration =
    startedAt && completedAt
      ? Math.round((completedAt.getTime() - startedAt.getTime()) / 1000)
      : null;

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-secondary/30 p-3">
      <div className="flex items-center gap-2">
        {STEP_STATUS_ICON[step.status] ?? <Circle className="h-4 w-4" />}
        <span className="text-sm font-medium text-foreground">
          #{step.order} {stepLabel(t, step.step_id)}
        </span>
        <StatusBadge status={step.status} />
        {step.depends_on && step.depends_on.length > 0 && (
          <span className="text-xs text-muted-foreground">
            依赖: {step.depends_on.join(', ')}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {startedAt && (
          <span>开始: {format(startedAt, 'MMM d HH:mm:ss')}</span>
        )}
        {completedAt && (
          <span>完成: {format(completedAt, 'MMM d HH:mm:ss')}</span>
        )}
        {duration !== null && <span>耗时: {duration}s</span>}
      </div>
      {step.error && (
        <div className="mt-1 rounded bg-red-500/10 p-2 text-xs text-red-500">
          {step.error}
        </div>
      )}
    </div>
  );
}

function ProgressBar({ ratio, completed, total }: { ratio: number; completed: number; total: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">子任务进度</span>
        <span className="font-medium text-foreground">
          {completed} / {total} ({Math.round(ratio * 100)}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full transition-all duration-300',
            ratio === 1 ? 'bg-green-500' : ratio > 0 ? 'bg-blue-500' : 'bg-muted',
          )}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}

function HistoryTab({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const [commits, setCommits] = useState<
    Array<{ id: string; shortId: string; author: string; timestamp: number; message: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void invoke<typeof commits>('result_history', { taskId, limit: 50 })
      .then((rows) => {
        if (!cancelled) setCommits(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // commit to deps so re-runs when taskId changes; the cast is
    // so the `typeof commits` empty-array literal type tracks the
    // shape without an explicit interface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  if (loading) {
    return (
      <p className="text-xs text-muted-foreground">
        {t('tasks.detail.historyLoading')}
      </p>
    );
  }
  if (error) {
    return (
      <p className="text-xs text-destructive font-mono" role="alert">
        {error}
      </p>
    );
  }
  if (commits.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t('tasks.detail.historyEmpty')}
      </p>
    );
  }
  return (
    <ol className="flex flex-col divide-y divide-border rounded-md border border-border bg-secondary/20">
      {commits.map((c) => (
        <li
          key={c.id}
          className="flex flex-col gap-1 px-3 py-2 text-xs"
          data-testid={`history-row-${c.shortId}`}
        >
          <div className="flex items-center gap-2">
            <code className="font-mono text-muted-foreground">{c.shortId}</code>
            <span className="text-muted-foreground">·</span>
            <span className="truncate font-medium">{c.message}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{c.author}</span>
            <span>·</span>
            <span className="font-mono">
              {new Date(c.timestamp * 1000).toISOString()}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function TaskDetailDialog({
  open,
  task,
  onClose,
  onEdit,
  onDelete,
}: TaskDetailDialogProps) {
  const { t } = useTranslation();
  const activeTab = useTaskBoardDataStore((s) => s.detail.activeTab);
  const setDetailTab = useTaskBoardDataStore((s) => s.setDetailTab);
  const refreshCortexTask = useTaskBoardDataStore((s) => s.refreshCortexTask);
  const computeSubtaskProgress = useTaskBoardDataStore(
    (s) => s.computeSubtaskProgress,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (open && task?.task_id) {
      void refreshCortexTask(task.task_id);
    }
  }, [open, task?.task_id, refreshCortexTask]);

  if (!task) return null;

  const steps = task.steps ?? [];
  const progress = computeSubtaskProgress(task);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshCortexTask(task.task_id);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`确认删除任务 "${task.title ?? task.task_id}"?`)) return;
    await onDelete(task);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <DialogTitle className="flex items-center gap-2">
                <ListTodo className="h-5 w-5 text-primary" />
                {task.title ?? task.task_id}
              </DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-2">
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
                <span className="font-mono text-xs">{task.task_id}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setDetailTab(v as 'overview' | 'subtasks' | 'logs' | 'history')}
        >
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">
              <Info className="mr-1 h-4 w-4" />
              {t('tasks.detail.overview', '概览')}
            </TabsTrigger>
            <TabsTrigger value="subtasks">
              <ListTodo className="mr-1 h-4 w-4" />
              {t('tasks.detail.subtasks', '子任务')} ({steps.length})
            </TabsTrigger>
            <TabsTrigger value="logs">
              <Terminal className="mr-1 h-4 w-4" />
              {t('tasks.detail.logs', '日志')}
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="mr-1 h-4 w-4" />
              {t('tasks.detail.history', '历史')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex flex-col gap-4">
            {task.description && (
              <div className="rounded-md border border-border bg-secondary/30 p-3 text-sm text-foreground">
                {task.description}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field
                icon={<Bot className="h-4 w-4" />}
                label={t('tasks.detail.targetAgent', '目标 Agent')}
                value={task.target_agent || '—'}
              />
              <Field
                icon={<Calendar className="h-4 w-4" />}
                label={t('tasks.detail.receivedAt', '创建时间')}
                value={format(new Date(task.received_at), 'yyyy-MM-dd HH:mm:ss')}
              />
              <Field
                icon={<Calendar className="h-4 w-4" />}
                label={t('tasks.detail.completedAt', '完成时间')}
                value={
                  task.completed_at
                    ? format(new Date(task.completed_at), 'yyyy-MM-dd HH:mm:ss')
                    : '—'
                }
              />
              <Field
                icon={<Tag className="h-4 w-4" />}
                label={t('tasks.detail.source', '来源')}
                value={task.source ?? '—'}
              />
            </div>

            {task.tags && task.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Tags:</span>
                {task.tags.map((tag) => (
                  <Badge key={tag} size="sm" variant="default">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">
                {t('tasks.detail.actions', 'Actions')}:
              </span>
              <PreviewButton taskId={task.task_id} />
            </div>

            {steps.length > 0 && (
              <ProgressBar
                ratio={progress.ratio}
                completed={progress.completed}
                total={progress.total}
              />
            )}

            {task.error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
                {task.error}
              </div>
            )}
          </TabsContent>

          <TabsContent value="subtasks" className="flex flex-col gap-3">
            {steps.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-secondary/20 p-6 text-center text-sm text-muted-foreground">
                {t('tasks.detail.noSubtasks', '此任务暂无子任务')}
              </div>
            ) : (
              <>
                <ProgressBar
                  ratio={progress.ratio}
                  completed={progress.completed}
                  total={progress.total}
                />
                <div className="flex flex-col gap-2">
                  {steps
                    .slice()
                    .sort((a, b) => a.order - b.order)
                    .map((step) => (
                      <SubtaskRow key={step.step_id} step={step} />
                    ))}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="logs" className="flex flex-col gap-3">
            <pre className="max-h-80 overflow-auto rounded-md border border-border bg-secondary/40 p-3 font-mono text-xs text-foreground">
              {JSON.stringify(
                {
                  task_id: task.task_id,
                  status: task.status,
                  title: task.title,
                  description: task.description,
                  priority: task.priority,
                  tags: task.tags,
                  target_agent: task.target_agent,
                  received_at: task.received_at,
                  completed_at: task.completed_at,
                  error: task.error,
                  result: task.result,
                  steps: steps.map((s) => ({
                    step_id: s.step_id,
                    order: s.order,
                    status: s.status,
                    started_at: s.started_at,
                    completed_at: s.completed_at,
                    error: s.error,
                  })),
                },
                null,
                2,
              )}
            </pre>
          </TabsContent>

          <TabsContent value="history" className="flex flex-col gap-3">
            <HistoryTab taskId={task.task_id} />
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {t('common.refresh', '刷新')}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={handleDelete}
            >
              {t('common.delete', '删除')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Pencil className="h-4 w-4" />}
              onClick={() => onEdit(task)}
            >
              {t('common.edit', '编辑')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-secondary/20 p-2">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}
