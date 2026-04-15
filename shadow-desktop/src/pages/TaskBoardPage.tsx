import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTaskBoardStore } from '../stores/taskBoardStore';
import { useAgentStore } from '../stores/agentStore';
import { useResonanceStore } from '../stores/resonanceStore';
import { Button, Badge } from '../components/ui';
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
import './TaskBoardPage.css';

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

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      urgent: 'var(--priority-urgent)',
      high: 'var(--priority-high)',
      medium: 'var(--priority-medium)',
      low: 'var(--priority-low)',
    };
    return colors[priority] || 'var(--text-muted)';
  };

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
  
  const allTasks = [...tasks];
  
  const pendingCount = pendingTasks.length;
  const runningCount = tasks.filter(t => t.workflowPhase === 'running').length;
  const completedCount = tasks.filter(t => t.workflowPhase === 'done').length;

  return (
    <div className="taskboard-page">
      <header className="page-header">
        <div className="header-left">
          <h1 className="font-display">{t('tasks.title')}</h1>
          <p className="subtitle">{t('tasks.subtitle')}</p>
        </div>
        <div className="header-right">
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

      <div className="dashboard-metrics">
        <div className="metric-card">
          <div className="metric-icon pending">
            <Clock size={24} />
          </div>
          <div className="metric-content">
            <span className="metric-value">{pendingCount}</span>
            <span className="metric-label">{t('tasks.pending')}</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon running">
            <Play size={24} />
          </div>
          <div className="metric-content">
            <span className="metric-value">{runningCount}</span>
            <span className="metric-label">{t('tasks.running')}</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon completed">
            <CheckCircle size={24} />
          </div>
          <div className="metric-content">
            <span className="metric-value">{completedCount}</span>
            <span className="metric-label">{t('tasks.completedLabel')}</span>
          </div>
        </div>
      </div>

      <div className="board">
        {sortedColumns.map((column) => (
          <div key={column.id} className="board-column">
            <div className="column-header">
              <h3>{getColumnTitle(column.id)}</h3>
              <span className="task-count">
                {allTasks.filter(t => t.columnId === column.id).length}
              </span>
            </div>
            
            <div className="column-content">
              {allTasks
                .filter((t) => t.columnId === column.id)
                .sort((a, b) => a.order - b.order)
                .map((task) => (
                  <div key={task.id} className="task-card">
                    <div className="task-card-header">
                      <div 
                        className="priority-indicator"
                        style={{ background: getPriorityColor(task.priority) }}
                      />
                      <h4 className="task-title">{task.title}</h4>
                      {task.type === 'scheduled' && (
                        <Clock size={12} className="task-type-icon" />
                      )}
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
                      <p className="task-description">{task.description}</p>
                    )}
                    
                    {task.plan && task.plan.steps.length > 0 && (
                      <div className="plan-preview">
                        <span className="plan-steps-count">{task.plan.steps.length} {t('tasks.steps')}</span>
                        {task.approval?.required && !task.approval?.autoApproved && (
                          <Badge variant="warning" size="sm">{t('tasks.awaitingApproval')}</Badge>
                        )}
                      </div>
                    )}
                    
                    <div className="task-meta">
                      {task.type === 'scheduled' && task.scheduledAt && (
                        <span className="meta-item">
                          <Calendar size={12} />
                          {format(new Date(task.scheduledAt), 'MMM d, HH:mm')}
                        </span>
                      )}
                      {task.agentId && (
                        <span className="meta-item">
                          <Bot size={12} />
                          {agents.find(a => a.id === task.agentId)?.name}
                        </span>
                      )}
                      {task.dueDate && (
                        <span className="meta-item">
                          <Calendar size={12} />
                          {format(new Date(task.dueDate), 'MMM d')}
                        </span>
                      )}
                      {task.tags.length > 0 && (
                        <span className="meta-item">
                          <Tag size={12} />
                          {task.tags[0]}
                        </span>
                      )}
                    </div>
                    
                    <div className="task-actions">
                      {!task.workflowPhase && (
                        <button
                          className="action-btn start-planning"
                          onClick={() => startPlanningWithLLM(task.id, task.title, task.description)}
                          title={t('tasks.startPlanning')}
                        >
                          <Brain size={14} />
                        </button>
                      )}
                      {task.workflowPhase === 'planning' && task.approval?.required && !task.approval?.autoApproved && (
                        <>
                          <button
                            className="action-btn approve"
                            onClick={() => approveTask(task.id)}
                            title={t('tasks.approve')}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            className="action-btn reject"
                            onClick={() => rejectTask(task.id, 'Rejected by user')}
                            title={t('tasks.reject')}
                          >
                            <X size={14} />
                          </button>
                        </>
                      )}
                      <button
                        className="action-btn delete"
                        onClick={() => removeTask(task.id)}
                        title={t('common.delete')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              
              {showAddTask === column.id && (
                <div className="add-task-form">
                  <input
                    type="text"
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
                    value={newTask.description || ''}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    placeholder={t('tasks.description')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddTask(column.id);
                    }}
                  />
                  <div className="add-task-actions">
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
              <button 
                className="add-task-btn"
                onClick={() => setShowAddTask(column.id)}
              >
                <Plus size={16} />
                <span>{t('tasks.addTask')}</span>
              </button>
            )}
          </div>
        ))}
      </div>

      {pendingTasks.length > 0 && (
        <div className="resonance-tasks">
          <h3>{t('tasks.resonanceTasks')}</h3>
          <div className="resonance-task-list">
            {pendingTasks.map((task) => (
              <div key={task.task_id} className="resonance-task-item">
                <div className="resonance-task-content">
                  <h4>{task.goal.substring(0, 80)}{task.goal.length > 80 ? '...' : ''}</h4>
                  <div className="resonance-task-meta">
                    <Badge variant="default" size="sm">{task.priority}</Badge>
                    {task.required_capabilities?.preferred_models?.[0] && (
                      <span className="model-tag">{task.required_capabilities.preferred_models[0]}</span>
                    )}
                  </div>
                </div>
                <div className="resonance-task-actions">
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
    </div>
  );
}
