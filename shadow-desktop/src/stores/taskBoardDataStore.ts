import { create } from 'zustand';
import { prefrontalClient } from '../lib/prefrontalClient';
import type { Task } from '../lib/prefrontalClient';

export type TaskDetailTab = 'overview' | 'subtasks' | 'logs' | 'history';

interface TaskDetailState {
  taskId: string | null;
  activeTab: TaskDetailTab;
}

interface TaskBoardDataState {
  cortexTasks: Task[];
  isLoadingCortex: boolean;
  cortexError: string | null;

  detail: TaskDetailState;

  fetchCortexTasks: () => Promise<void>;
  refreshCortexTask: (taskId: string) => Promise<void>;
  updateCortexTask: (
    taskId: string,
    updates: Partial<
      Pick<
        Task,
        | 'status'
        | 'tags'
        | 'title'
        | 'description'
        | 'priority'
        | 'metadata'
      >
    >,
  ) => Promise<void>;
  deleteCortexTask: (taskId: string) => Promise<void>;

  openTaskDetail: (taskId: string, tab?: TaskDetailTab) => void;
  closeTaskDetail: () => void;
  setDetailTab: (tab: TaskDetailTab) => void;

  computeSubtaskProgress: (task: Task) => {
    completed: number;
    total: number;
    ratio: number;
  };
}

const DEFAULT_TENANT = 'default';

export const useTaskBoardDataStore = create<TaskBoardDataState>((set, get) => ({
  cortexTasks: [],
  isLoadingCortex: false,
  cortexError: null,

  detail: { taskId: null, activeTab: 'overview' },

  async fetchCortexTasks() {
    set({ isLoadingCortex: true, cortexError: null });
    try {
      const tasks = await prefrontalClient.listTasks(DEFAULT_TENANT);
      set({ cortexTasks: tasks, isLoadingCortex: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ cortexError: msg, isLoadingCortex: false });
    }
  },

  async refreshCortexTask(taskId: string) {
    try {
      const updated = await prefrontalClient.getTask(DEFAULT_TENANT, taskId);
      set((state) => ({
        cortexTasks: state.cortexTasks.map((t) => (t.task_id === taskId ? updated : t)),
      }));
    } catch (e) {
      console.warn(`[taskBoard] refreshCortexTask(${taskId}) failed:`, e);
    }
  },

  async updateCortexTask(taskId, updates) {
    const optimistic = get().cortexTasks.find((t) => t.task_id === taskId);
    if (!optimistic) {
      throw new Error(`Task ${taskId} not found in cortex cache`);
    }
    try {
      const updated = await prefrontalClient.updateTask(DEFAULT_TENANT, taskId, updates);
      set((state) => ({
        cortexTasks: state.cortexTasks.map((t) => (t.task_id === taskId ? updated : t)),
      }));
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  },

  async deleteCortexTask(taskId: string) {
    await prefrontalClient.deleteTask(DEFAULT_TENANT, taskId);
    set((state) => ({
      cortexTasks: state.cortexTasks.filter((t) => t.task_id !== taskId),
      detail:
        state.detail.taskId === taskId
          ? { taskId: null, activeTab: 'overview' }
          : state.detail,
    }));
  },

  openTaskDetail(taskId: string, tab: TaskDetailTab = 'overview') {
    set({ detail: { taskId, activeTab: tab } });
  },

  closeTaskDetail() {
    set({ detail: { taskId: null, activeTab: 'overview' } });
  },

  setDetailTab(tab: TaskDetailTab) {
    set((state) => ({ detail: { ...state.detail, activeTab: tab } }));
  },

  computeSubtaskProgress(task: Task) {
    const steps = task.steps ?? [];
    const total = steps.length;
    const completed = steps.filter((s) => s.status === 'completed').length;
    const ratio = total > 0 ? completed / total : 0;
    return { completed, total, ratio };
  },
}));
