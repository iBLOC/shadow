import { create } from 'zustand';
import { safeInvoke } from '../lib/tauriSafe';
import { persist } from 'zustand/middleware';
import type { Task, TaskBoardColumn, WorkflowPhase, PlanStep } from '../types';

interface WorkflowPlan {
  steps: { order: number; description: string; agent_type: string; target_file?: string }[];
  estimated_time?: string;
  required_agents: string[];
}

interface TaskBoardState {
  columns: TaskBoardColumn[];
  tasks: Task[];
  autoApprove: boolean;
  addColumn: (column: TaskBoardColumn) => void;
  removeColumn: (id: string) => void;
  updateColumn: (id: string, updates: Partial<TaskBoardColumn>) => void;
  addTask: (task: Task) => void;
  removeTask: (id: string) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  moveTask: (taskId: string, targetColumnId: string, order: number) => void;
  getScheduledTasks: () => Task[];
  setAutoApprove: (enabled: boolean) => void;
  startPlanning: (taskId: string, plan: { steps: PlanStep[]; estimatedTime?: string; requiredAgents: string[] }) => void;
  startPlanningWithLLM: (taskId: string, taskTitle: string, taskDescription: string) => Promise<void>;
  approveTask: (taskId: string) => void;
  rejectTask: (taskId: string, reason: string) => void;
  advanceWorkflow: (taskId: string, toPhase: WorkflowPhase) => void;
}

export const useTaskBoardStore = create<TaskBoardState>()(
  persist(
    (set, get) => ({
      columns: [
        { id: 'backlog', title: 'Backlog', order: 0 },
        { id: 'todo', title: 'To Do', order: 1 },
        { id: 'in-progress', title: 'In Progress', order: 2 },
        { id: 'review', title: 'Review', order: 3 },
        { id: 'done', title: 'Done', order: 4 },
      ],
      tasks: [],
      autoApprove: false,
      addColumn: (column) => set((state) => ({ 
        columns: [...state.columns, column] 
      })),
      removeColumn: (id) => set((state) => ({ 
        columns: state.columns.filter(c => c.id !== id) 
      })),
      updateColumn: (id, updates) => set((state) => ({
        columns: state.columns.map(c => 
          c.id === id ? { ...c, ...updates } : c
        )
      })),
      addTask: (task) => set((state) => ({ 
        tasks: [...state.tasks, task] 
      })),
      removeTask: (id) => set((state) => ({ 
        tasks: state.tasks.filter(t => t.id !== id) 
      })),
      updateTask: (id, updates) => set((state) => ({
        tasks: state.tasks.map(t => 
          t.id === id ? { ...t, ...updates, updatedAt: new Date() } : t
        )
      })),
      moveTask: (taskId, targetColumnId, order) => set((state) => ({
        tasks: state.tasks.map(t => 
          t.id === taskId 
            ? { ...t, columnId: targetColumnId, order, updatedAt: new Date() }
            : t
        )
      })),
      getScheduledTasks: () => {
        const { tasks } = get();
        return tasks.filter(t => t.type === 'scheduled');
      },
      setAutoApprove: (enabled) => set({ autoApprove: enabled }),
      startPlanningWithLLM: async (taskId, taskTitle, taskDescription) => {
        try {
          const plan = await safeInvoke<WorkflowPlan>('workflow_start_planning', {
            taskId,
            taskTitle,
            taskDescription,
          });
          if (!plan) throw new Error('workflow_start_planning returned null');
          const steps: PlanStep[] = plan.steps.map((s) => ({
            order: s.order,
            description: s.description,
            agentType: s.agent_type as PlanStep['agentType'],
            targetFile: s.target_file,
          }));
          get().startPlanning(taskId, {
            steps,
            estimatedTime: plan.estimated_time,
            requiredAgents: plan.required_agents,
          });
        } catch (error) {
          console.error('Failed to start planning:', error);
          throw error;
        }
      },
      startPlanning: (taskId, plan) => {
        const { autoApprove } = get();
        set((state) => ({
          tasks: state.tasks.map(t => 
            t.id === taskId 
              ? { 
                  ...t, 
                  workflowPhase: 'planning' as WorkflowPhase,
                  plan,
                  approval: {
                    required: !autoApprove,
                    autoApproved: autoApprove,
                    approvedAt: autoApprove ? new Date() : undefined,
                  },
                  updatedAt: new Date()
                } 
              : t
          )
        }));
      },
      approveTask: (taskId) => set((state) => ({
        tasks: state.tasks.map(t => 
          t.id === taskId 
            ? { 
                ...t, 
                workflowPhase: 'running' as WorkflowPhase,
                approval: { 
                  ...t.approval!, 
                  required: false,
                  approvedAt: new Date(),
                  autoApproved: false,
                },
                updatedAt: new Date()
              } 
            : t
        )
      })),
      rejectTask: (taskId, reason) => set((state) => ({
        tasks: state.tasks.map(t => 
          t.id === taskId 
            ? { 
                ...t, 
                workflowPhase: 'backlog' as WorkflowPhase,
                plan: undefined,
                approval: { 
                  required: true,
                  autoApproved: false,
                  rejectReason: reason,
                },
                updatedAt: new Date()
              } 
            : t
        )
      })),
      advanceWorkflow: (taskId, toPhase) => set((state) => ({
        tasks: state.tasks.map(t => 
          t.id === taskId 
            ? { 
                ...t, 
                workflowPhase: toPhase,
                updatedAt: new Date(),
                completedAt: toPhase === 'done' ? new Date() : t.completedAt,
              } 
            : t
        )
      })),
    }),
    {
      name: 'prefrontal-taskboard-storage',
    }
  )
);
