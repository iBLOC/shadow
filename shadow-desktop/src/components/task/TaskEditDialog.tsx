import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button, Input, Label, Textarea } from '../ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import type { Task } from '../../lib/prefrontalClient';

interface TaskEditDialogProps {
  open: boolean;
  task: Task | null;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  /**
   * Restrict the form to the fields the backend actually persists.
   *
   * hippocampus `TaskRecord` has no title / description / priority
   * columns — the upsert drops them. Editing them would look like it
   * worked and then vanish on the next reload, so the fields are hidden
   * instead and the values are passed through unchanged.
   */
  backendFieldsOnly?: boolean;
  onSubmit: (updates: {
    title: string;
    description: string;
    priority: 'urgent' | 'high' | 'medium' | 'low';
    status: Task['status'];
    tags: string[];
  }) => Promise<void>;
}

const PRIORITY_OPTIONS: Array<{
  value: 'urgent' | 'high' | 'medium' | 'low';
  label: string;
}> = [
  { value: 'urgent', label: '紧急' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
];

const STATUS_OPTIONS: Array<Task['status']> = [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
];

export function TaskEditDialog({
  open,
  task,
  isSubmitting,
  error,
  onClose,
  backendFieldsOnly = false,
  onSubmit,
}: TaskEditDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'urgent' | 'high' | 'medium' | 'low'>('medium');
  const [status, setStatus] = useState<Task['status']>('pending');
  const [tagsInput, setTagsInput] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (task && open) {
      setTitle(task.title ?? '');
      setDescription(task.description ?? '');
      setPriority(task.priority ?? 'medium');
      setStatus(task.status);
      setTagsInput((task.tags ?? []).join(', '));
      setLocalError(null);
    }
  }, [task, open]);

  const handleSubmit = async () => {
    if (!backendFieldsOnly && !title.trim()) {
      setLocalError('标题不能为空');
      return;
    }
    setLocalError(null);
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    await onSubmit({
      title: backendFieldsOnly ? (task?.title ?? '') : title,
      description: backendFieldsOnly ? (task?.description ?? '') : description,
      priority: backendFieldsOnly ? (task?.priority ?? 'medium') : priority,
      status,
      tags,
    });
  };

  const displayError = localError ?? error;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('tasks.edit.title', '编辑任务')}</DialogTitle>
          <DialogDescription>
            {backendFieldsOnly
              ? t(
                  'tasks.edit.descriptionBackendOnly',
                  '修改任务的持久化字段。子任务和执行历史请在详情面板查看。'
                )
              : t(
                  'tasks.edit.description',
                  '修改任务的元数据。子任务和状态变更请在详情面板操作。'
                )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {backendFieldsOnly && (
            <p className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
              {t(
                'tasks.edit.backendFieldsOnly',
                '该后端只持久化状态与标签，标题/描述/优先级不会保存。'
              )}
            </p>
          )}

          {!backendFieldsOnly && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-edit-title">
                {t('tasks.edit.titleField', '标题')}
              </Label>
              <Input
                id="task-edit-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('tasks.edit.titlePlaceholder', '任务标题')}
                disabled={isSubmitting}
              />
            </div>
          )}

          {!backendFieldsOnly && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-edit-description">
                {t('tasks.edit.descriptionField', '描述')}
              </Label>
              <Textarea
                id="task-edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('tasks.edit.descriptionPlaceholder', '详细描述...')}
                rows={3}
                disabled={isSubmitting}
              />
            </div>
          )}

          <div
            className={
              backendFieldsOnly
                ? 'grid grid-cols-1 gap-3'
                : 'grid grid-cols-2 gap-3'
            }
          >
            {!backendFieldsOnly && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="task-edit-priority">
                  {t('tasks.edit.priorityField', '优先级')}
                </Label>
                <select
                  id="task-edit-priority"
                  value={priority}
                  onChange={(e) =>
                    setPriority(e.target.value as 'urgent' | 'high' | 'medium' | 'low')
                  }
                  disabled={isSubmitting}
                  className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {PRIORITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-edit-status">
                {t('tasks.edit.statusField', '状态')}
              </Label>
              <select
                id="task-edit-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as Task['status'])}
                disabled={isSubmitting}
                className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-edit-tags">
              {t('tasks.edit.tagsField', '标签 (逗号分隔)')}
            </Label>
            <Input
              id="task-edit-tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="urgent, frontend, refactor"
              disabled={isSubmitting}
            />
          </div>

          {displayError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
              {displayError}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            {t('common.cancel', '取消')}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isSubmitting}
            icon={
              isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined
            }
          >
            {t('common.save', '保存')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
