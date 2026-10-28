import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTaskBoardStore } from '../stores/taskBoardStore';
import { useAgentStore } from '../stores/agentStore';
import { useResonanceStore } from '../stores/resonanceStore';
import { Button, Badge } from '../components/ui';
import { CortexTaskSection } from '../components/task/CortexTaskSection';
import {
  Plus,
  Trash2,
  Calendar,
  Tag,
  Bot,
  Clock,
  Play,
  CheckCircle,
  X,
  Brain,
  Check,
} from 'lucide-react';
import type { Task } from '../types';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

const PRIORITY_BAR: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-green-500',
};

export function TaskBoardPage() {
  const { t } = useTranslation();
  const {
    columns, tasks, addTask, removeTask, approveTask, rejectTask,
    startPlanningWithLLM
  } = useTaskBoardStore();
  const { agents } = useAgentStore();
  const { pendingTasks, sendTaskResponse } = useResonanceStore();

  const [showAddTask, setShowAddTask] = useState<string | null>(null);
  const [newTask, setNewTask] = useState<Partial<Task>>({
    title: '',
    description: '',
    priority: 'medium',
    tags: [],
    type: 'normal',
    scheduledAt: undefined,
    repeatType: undefined,
    agentId: undefined,
    conversationId: undefined,
  });

  const getColumnTitle = (columnId: string) => {
    const titles: Record<string, string> = {
      backlog: t('tasks.backlog'),
      todo: t('tasks.todo'),
      'in-progress': t('tasks.inProgress'),
      review: t('tasks.review'),
      done: t('tasks.done'),
    };
    return titles[columnId] || columnId;
  };

  const handleAddTask = (columnId: string) => {
    if (!newTask.title) return;

    const columnTasks = tasks.filter(t => t.columnId === columnId);
    const task: Task = {
      id: crypto.randomUUID(),
      title: newTask.title,
      description: newTask.description || '',
      columnId,
      order: columnTasks.length,
      priority: newTask.priority as Task['priority'] || 'medium',
      type: newTask.type as Task['type'] || 'normal',
      tags: newTask.tags || [],
      scheduledAt: newTask.scheduledAt,
      repeatType: newTask.repeatType,
      agentId: newTask.agentId,
      conversationId: newTask.conversationId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    addTask(task);
    setShowAddTask(null);
    setNewTask({
      title: '',
      description: '',
      priority: 'medium',
      tags: [],
      type: 'normal',
      scheduledAt: undefined,
      repeatType: undefined,
      agentId: undefined,
      conversationId: undefined,
    });
  };

  const handleAcceptTask = async (taskId: string, goal: string) => {
    const task: Task = {
      id: taskId,
      title: goal.substring(0, 100),
      description: goal,
      columnId: 'backlog',
      order: tasks.filter(t => t.columnId === 'backlog').length,
      priority: 'medium',
      type: 'normal',
      tags: ['resonance'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    addTask(task);
    await sendTaskResponse(taskId, 'accepted', 'Task accepted by Shadow');
  };

  const handleRejectTask = async (taskId: string, reason?: string) => {
    await sendTaskResponse(taskId, 'rejected', reason || 'Task rejected by user');
  };

  const sortedColumns = [...columns].sort((a, b) => a.order - b.order);

  const pendingCount = pendingTasks.length;
  const runningCount = tasks.filter(t => t.workflowPhase === 'running').length;
  const completedCount = tasks.filter(t => t.workflowPhase === 'done').length;

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col gap-6">
      <header className="flex flex-shrink-0 items-start justify-between gap-4">
        <div>
          <h1>{t('tasks.title')}</h1>
          <p className="subtitle">{t('tasks.subtitle')}</p>
        </div>
        <div className="flex items-center gap-4">
          {pendingCount > 0 && (
            <Badge variant="warning" size="sm">
              {pendingCount} {t('tasks.fromResonance')}
            </Badge>
          )}
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => setShowAddTask('backlog')}
          >
            {t('tasks.addTask')}
          </Button>
        </div>
      </header>

      <div className="grid flex-shrink-0 grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard icon={<Clock size={24} />} value={pendingCount} label={t('tasks.pending')} tone="warning" />
        <MetricCard icon={<Play size={24} />} value={runningCount} label={t('tasks.running')} tone="info" />
        <MetricCard icon={<CheckCircle size={24} />} value={completedCount} label={t('tasks.completedLabel')} tone="success" />
      </div>

      <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
        {sortedColumns.map((column) => (
          <div key={column.id} className="flex min-w-[300px] max-w-[320px] flex-shrink-0 flex-col rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 className="text-sm font-semibold text-foreground">{getColumnTitle(column.id)}</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {tasks.filter(t => t.columnId === column.id).length}
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
              {tasks
                .filter((t) => t.columnId === column.id)
                .sort((a, b) => a.order - b.order)
                .map((task) => (
                  <div
                    key={task.id}
                    className="cursor-grab rounded-md border border-border bg-secondary p-3 transition-colors hover:border-foreground/30 active:cursor-grabbing"
                  >
                    <div className="mb-2 flex items-start gap-2">
                      <div className={cn('mt-0.5 h-5 w-1 flex-shrink-0 rounded', PRIORITY_BAR[task.priority] || 'bg-muted')} />
                      <h4 className="flex-1 text-sm font-medium leading-snug text-foreground">{task.title}</h4>
                      {task.type === 'scheduled' && <Clock size={12} className="mt-0.5 flex-shrink-0 text-muted-foreground" />}
                      {task.workflowPhase === 'planning' && (
                        <Badge variant="warning" size="sm">
                          <Brain size={10} /> {t('tasks.planning')}
                        </Badge>
                      )}
                      {task.workflowPhase === 'running' && (
                        <Badge variant="info" size="sm">
                          <Play size={10} /> {t('tasks.running')}
                        </Badge>
                      )}
                      {task.workflowPhase === 'review' && (
                        <Badge variant="accent" size="sm">
                          <CheckCircle size={10} /> {t('tasks.review')}
                        </Badge>
                      )}
                    </div>

                    {task.description && (
                      <p className="mb-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{task.description}</p>
                    )}

                    {task.plan && task.plan.steps.length > 0 && (
                      <div className="mb-2 flex items-center justify-between gap-2 rounded border border-border bg-muted/30 p-2">
                        <span className="text-xs font-medium text-foreground">{task.plan.steps.length} {t('tasks.steps')}</span>
                        {task.approval?.required && !task.approval?.autoApproved && (
                          <Badge variant="warning" size="sm">{t('tasks.awaitingApproval')}</Badge>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {task.type === 'scheduled' && task.scheduledAt && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar size={12} />
                          {format(new Date(task.scheduledAt), 'MMM d, HH:mm')}
                        </span>
                      )}
                      {task.agentId && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Bot size={12} />
                          {agents.find(a => a.id === task.agentId)?.name}
                        </span>
                      )}
                      {task.dueDate && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar size={12} />
                          {format(new Date(task.dueDate), 'MMM d')}
                        </span>
                      )}
                      {task.tags.length > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Tag size={12} />
                          {task.tags[0]}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 [.task-card:hover_&]:opacity-100">
                      {!task.workflowPhase && (
                        <button
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-yellow-500/15 hover:text-yellow-500"
                          onClick={() => startPlanningWithLLM(task.id, task.title, task.description)}
                          title={t('tasks.startPlanning')}
                        >
                          <Brain size={14} />
                        </button>
                      )}
                      {task.workflowPhase === 'planning' && task.approval?.required && !task.approval?.autoApproved && (
                        <>
                          <button
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-green-500/15 hover:text-green-500"
                            onClick={() => approveTask(task.id)}
                            title={t('tasks.approve')}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-red-500/15 hover:text-red-500"
                            onClick={() => rejectTask(task.id, 'Rejected by user')}
                            title={t('tasks.reject')}
                          >
                            <X size={14} />
                          </button>
                        </>
                      )}
                      <button
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-red-500/15 hover:text-red-500"
                        onClick={() => removeTask(task.id)}
                        title={t('common.delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}

              {showAddTask === column.id && (
                <div className="flex flex-col gap-3 rounded-md border border-foreground/30 bg-card p-3">
                  <input
                    type="text"
                    className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
                    value={newTask.title || ''}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    placeholder={t('tasks.taskTitle')}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddTask(column.id);
                      if (e.key === 'Escape') {
                        setShowAddTask(null);
                        setNewTask({ title: '', description: '', priority: 'medium', tags: [], type: 'normal' });
                      }
                    }}
                  />
                  <input
                    type="text"
                    className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
                    value={newTask.description || ''}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    placeholder={t('tasks.description')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddTask(column.id);
                    }}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setShowAddTask(null);
                        setNewTask({ title: '', description: '', priority: 'medium', tags: [], type: 'normal' });
                      }}
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleAddTask(column.id)}
                      disabled={!newTask.title}
                    >
                      {t('common.add')}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {showAddTask !== column.id && (
              <div className="p-3 pt-0">
                <Button
                  variant="outline"
                  fullWidth
                  icon={<Plus size={16} />}
                  onClick={() => setShowAddTask(column.id)}
                >
                  {t('tasks.addTask')}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {pendingTasks.length > 0 && (
        <div className="flex-shrink-0 rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">{t('tasks.resonanceTasks')}</h3>
          <div className="flex flex-col gap-2">
            {pendingTasks.map((task) => (
              <div key={task.task_id} className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
                <div className="flex-1">
                  <h4 className="mb-2 text-sm font-medium text-foreground">{task.goal.substring(0, 80)}{task.goal.length > 80 ? '...' : ''}</h4>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" size="sm">{task.priority}</Badge>
                    {task.required_capabilities?.preferred_models?.[0] && (
                      <span className="text-xs text-muted-foreground">{task.required_capabilities.preferred_models[0]}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="success"
                    icon={<Check size={14} />}
                    onClick={() => handleAcceptTask(task.task_id, task.goal)}
                  >
                    {t('tasks.accept')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<X size={14} />}
                    onClick={() => handleRejectTask(task.task_id)}
                  >
                    {t('tasks.decline')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <CortexTaskSection />
    </div>
  );
}

function MetricCard({ icon, value, label, tone }: { icon: React.ReactNode; value: number; label: string; tone: 'warning' | 'info' | 'success' }) {
  const toneClass = {
    warning: 'bg-yellow-500/15 text-yellow-500',
    info: 'bg-blue-500/15 text-blue-500',
    success: 'bg-green-500/15 text-green-500',
  }[tone];
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-5 transition-colors hover:border-foreground/30">
      <div className={cn('flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md', toneClass)}>{icon}</div>
      <div className="flex flex-col gap-0.5">
        <span className="text-2xl font-bold leading-none text-foreground">{value}</span>
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
