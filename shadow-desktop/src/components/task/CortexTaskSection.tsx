import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { Badge, Button } from '../ui';
import { useTaskBoardDataStore } from '../../stores/taskBoardDataStore';
import type { Task } from '../../lib/prefrontalClient';
import { TaskDetailDialog } from './TaskDetailDialog';
import { TaskEditDialog } from './TaskEditDialog';

const STATUS_VARIANT: Record<
  Task['status'],
  'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'info'
> = {
  pending: 'default',
  running: 'info',
  completed: 'success',
  failed: 'destructive',
  cancelled: 'secondary',
};

/**
 * The hippocampus-backed task list.
 *
 * The board columns on the task page are a local, frontend-only list.
 * These are the tasks the agent runtime actually recorded in
 * hippocampus — they carry the sub-step DAG and the execution history,
 * so the detail dialog is the only place that information is visible.
 *
 * `title` is a presentation-only field: hippocampus `TaskRecord` has no
 * such column, so the server never returns one. The list falls back to
 * the task id rather than rendering a blank row.
 */
export function CortexTaskSection() {
  const { t } = useTranslation();
  const cortexTasks = useTaskBoardDataStore((s) => s.cortexTasks);
  const isLoadingCortex = useTaskBoardDataStore((s) => s.isLoadingCortex);
  const cortexError = useTaskBoardDataStore((s) => s.cortexError);
  const detailTaskId = useTaskBoardDataStore((s) => s.detail.taskId);
  const fetchCortexTasks = useTaskBoardDataStore((s) => s.fetchCortexTasks);
  const openTaskDetail = useTaskBoardDataStore((s) => s.openTaskDetail);
  const closeTaskDetail = useTaskBoardDataStore((s) => s.closeTaskDetail);
  const updateCortexTask = useTaskBoardDataStore((s) => s.updateCortexTask);
  const deleteCortexTask = useTaskBoardDataStore((s) => s.deleteCortexTask);
  const computeSubtaskProgress = useTaskBoardDataStore(
    (s) => s.computeSubtaskProgress
  );

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    void fetchCortexTasks();
  }, [fetchCortexTasks]);

  const selectedTask = detailTaskId
    ? cortexTasks.find((task) => task.task_id === detailTaskId) ?? null
    : null;

  const handleSave = async (updates: {
    title: string;
    description: string;
    priority: 'urgent' | 'high' | 'medium' | 'low';
    status: Task['status'];
    tags: string[];
  }) => {
    if (!editingTask) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateCortexTask(editingTask.task_id, updates);
      setEditingTask(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSaving(false);
    }
  };

  // Nothing to show while the backend is reachable but has no records —
  // the local kanban columns stay the primary board in that case.
  if (!isLoadingCortex && !cortexError && cortexTasks.length === 0) {
    return null;
  }

  return (
    <section
      className="flex-shrink-0 rounded-lg border border-border bg-card p-4"
      data-testid="cortex-task-section"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            {t('tasks.cortexTasks')}
          </h3>
          {cortexTasks.length > 0 && (
            <Badge variant="secondary" size="sm">
              {cortexTasks.length}
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon={<RefreshCw size={14} />}
          onClick={() => void fetchCortexTasks()}
          disabled={isLoadingCortex}
        >
          {t('common.refresh')}
        </Button>
      </div>

      {cortexError && (
        <p className="mb-2 text-xs text-destructive" role="alert">
          {t('tasks.cortexTasksError', '无法读取 hippocampus 任务：')}{' '}
          {cortexError}
        </p>
      )}

      {isLoadingCortex && cortexTasks.length === 0 && (
        <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
      )}

      <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
        {cortexTasks.map((task) => {
          const { completed, total } = computeSubtaskProgress(task);
          return (
            <button
              key={task.task_id}
              type="button"
              onClick={() => openTaskDetail(task.task_id)}
              className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3 text-left transition-colors hover:border-foreground/30"
            >
              <div className="flex-1">
                <h4 className="mb-1 truncate text-sm font-medium text-foreground">
                  {task.title?.trim() || task.task_id}
                </h4>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={STATUS_VARIANT[task.status] ?? 'default'} size="sm">
                    {task.status}
                  </Badge>
                  {total > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {completed}/{total} {t('tasks.steps')}
                    </span>
                  )}
                  {task.target_agent && (
                    <span className="text-xs text-muted-foreground">
                      {task.target_agent}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <TaskDetailDialog
        open={detailTaskId !== null}
        task={selectedTask}
        onClose={closeTaskDetail}
        onEdit={(task) => setEditingTask(task)}
        onDelete={async (task) => {
          await deleteCortexTask(task.task_id);
          closeTaskDetail();
        }}
      />

      <TaskEditDialog
        open={editingTask !== null}
        task={editingTask}
        isSubmitting={isSaving}
        error={saveError}
        backendFieldsOnly
        onClose={() => setEditingTask(null)}
        onSubmit={handleSave}
      />
    </section>
  );
}
