import { create } from 'zustand';
import { prefrontalClient } from '../lib/prefrontalClient';
import type { Task } from '../lib/prefrontalClient';
import { useIdentityStore } from './identityStore';

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

/**
 * 看板读写的租户 —— **运行时**决定，不再写死。
 *
 * 以前这里是 `const DEFAULT_TENANT = 'default'`：客户端和端脑各写各的，
 * 于是客户端的任务在 `"default"` 桶、端脑写的记忆在账号人格桶，**两边
 * 根本不在同一个地方**。
 *
 * 现在租户由端脑说了算（`stores/identityStore.ts` 问
 * `GET /shadow/v1/identity`）—— 有账号就是那个人格，没账号才是
 * `"default"`（老部署逐字节不变）。
 */
export const useTaskBoardDataStore = create<TaskBoardDataState>((set, get) => ({
  cortexTasks: [],
  isLoadingCortex: false,
  cortexError: null,

  detail: { taskId: null, activeTab: 'overview' },

  async fetchCortexTasks() {
    set({ isLoadingCortex: true, cortexError: null });
    try {
      // 先把「现在是哪个租户」定下来 —— 身份还没解析出来就读，拿到的是
      // 兜底桶（切桶之后就是空桶），而看板**不会**自己再刷一次。
      const tenant = await useIdentityStore.getState().resolve();
      // `silent`: the task board polls this on mount. An unreachable
      // hippocampus must render an inline hint, not a global modal.
      const tasks = await prefrontalClient.listTasks(tenant, {
        silent: true,
      });
      set({ cortexTasks: tasks, isLoadingCortex: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ cortexError: msg, isLoadingCortex: false });
    }
  },

  async refreshCortexTask(taskId: string) {
    try {
      const tenant = await useIdentityStore.getState().resolve();
      const updated = await prefrontalClient.getTask(tenant, taskId);
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
      const tenant = await useIdentityStore.getState().resolve();
      const saved = await prefrontalClient.updateTask(
        tenant,
        taskId,
        updates
      );
      // hippocampus `TaskRecord` has no title/description/priority/metadata
      // columns, so the upsert drops them and the response never carries
      // them back. Keep the locally submitted values in the cache instead
      // of silently losing the user's edit.
      const updated: Task = {
        ...saved,
        ...(updates.title !== undefined ? { title: updates.title } : {}),
        ...(updates.description !== undefined
          ? { description: updates.description }
          : {}),
        ...(updates.priority !== undefined
          ? { priority: updates.priority }
          : {}),
        ...(updates.metadata !== undefined ? { metadata: updates.metadata } : {}),
      };
      set((state) => ({
        cortexTasks: state.cortexTasks.map((t) => (t.task_id === taskId ? updated : t)),
      }));
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  },

  async deleteCortexTask(taskId: string) {
    const tenant = await useIdentityStore.getState().resolve();
    await prefrontalClient.deleteTask(tenant, taskId);
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
