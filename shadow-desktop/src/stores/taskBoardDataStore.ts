import { create } from 'zustand';
import { prefrontalClient } from '../lib/prefrontalClient';
import type { Task } from '../lib/prefrontalClient';
import { telencephalonClient } from '../lib/telencephalonClient';
import { mapEndbrainTask, type EndbrainTask } from '../lib/endbrainTasks';
import { useIdentityStore } from './identityStore';

export type TaskDetailTab = 'overview' | 'subtasks' | 'logs' | 'history';

interface TaskDetailState {
  taskId: string | null;
  activeTab: TaskDetailTab;
}

interface TaskBoardDataState {
  hippocampusTasks: Task[];
  isLoadingHippocampus: boolean;
  hippocampusError: string | null;

  /** 端脑任务（对话里建的）—— **与海马体那份不是一回事**。 */
  endbrainTasks: EndbrainTask[];
  isLoadingEndbrain: boolean;
  endbrainError: string | null;
  /** 形状认不得、被跳过的条数（**出声**，不许静默丢）。 */
  endbrainSkipped: number;

  detail: TaskDetailState;

  fetchHippocampusTasks: () => Promise<void>;

  /** 读端脑任务（对话里建的）—— 走 `/api/telencephalon/tasks`。 */
  fetchEndbrainTasks: () => Promise<void>;
  /** 确认／拒绝一条端脑任务（端脑只有 `Pending` 的能确认）。 */
  confirmEndbrainTask: (taskId: string, confirmed: boolean) => Promise<void>;
  refreshHippocampusTask: (taskId: string) => Promise<void>;
  updateHippocampusTask: (
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
  deleteHippocampusTask: (taskId: string) => Promise<void>;

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
  hippocampusTasks: [],
  isLoadingHippocampus: false,
  hippocampusError: null,

  endbrainTasks: [],
  isLoadingEndbrain: false,
  endbrainError: null,
  endbrainSkipped: 0,

  detail: { taskId: null, activeTab: 'overview' },

  async fetchHippocampusTasks() {
    set({ isLoadingHippocampus: true, hippocampusError: null });
    try {
      // 先把「现在是哪个租户」定下来 —— 身份还没解析出来就读，拿到的是
      // 兜底桶（切桶之后就是空桶），而看板**不会**自己再刷一次。
      const tenant = await useIdentityStore.getState().resolve();
      // `silent`: the task board polls this on mount. An unreachable
      // hippocampus must render an inline hint, not a global modal.
      const tasks = await prefrontalClient.listTasks(tenant, {
        silent: true,
      });
      set({ hippocampusTasks: tasks, isLoadingHippocampus: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ hippocampusError: msg, isLoadingHippocampus: false });
    }
  },

  /**
   * 读端脑任务 —— 对话里建的那些（**不是**海马体那份）。
   *
   * ⚠️ **形状认不得的那几条 ⇒ 出声**（`endbrainSkipped`）⇒ ⇒ 不静默丢。
   */
  async fetchEndbrainTasks() {
    set({ isLoadingEndbrain: true, endbrainError: null });
    try {
      const raw = await telencephalonClient.getTasks();
      const mapped: EndbrainTask[] = [];
      let skipped = 0;
      for (const item of raw) {
        const task = mapEndbrainTask(item);
        if (task) {
          mapped.push(task);
        } else {
          skipped += 1;
        }
      }
      set({ endbrainTasks: mapped, endbrainSkipped: skipped, isLoadingEndbrain: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ endbrainError: msg, isLoadingEndbrain: false });
    }
  },

  /**
   * 确认／拒绝一条端脑任务。
   *
   * ⚠️ **只有 `Pending` 的能确认**（服务端在别的状态上会回 400）⇒ ⇒ 失败
   * 就**原样抛出去**（界面上要看得见），不假装成功。
   */
  async confirmEndbrainTask(taskId: string, confirmed: boolean) {
    try {
      await telencephalonClient.confirmTask(taskId, confirmed);
      await get().fetchEndbrainTasks();
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  },

  async refreshHippocampusTask(taskId: string) {
    try {
      const tenant = await useIdentityStore.getState().resolve();
      const updated = await prefrontalClient.getTask(tenant, taskId);
      set((state) => ({
        hippocampusTasks: state.hippocampusTasks.map((t) => (t.task_id === taskId ? updated : t)),
      }));
    } catch (e) {
      console.warn(`[taskBoard] refreshHippocampusTask(${taskId}) failed:`, e);
    }
  },

  async updateHippocampusTask(taskId, updates) {
    const optimistic = get().hippocampusTasks.find((t) => t.task_id === taskId);
    if (!optimistic) {
      throw new Error(`Task ${taskId} not found in hippocampus cache`);
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
        hippocampusTasks: state.hippocampusTasks.map((t) => (t.task_id === taskId ? updated : t)),
      }));
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  },

  async deleteHippocampusTask(taskId: string) {
    const tenant = await useIdentityStore.getState().resolve();
    await prefrontalClient.deleteTask(tenant, taskId);
    set((state) => ({
      hippocampusTasks: state.hippocampusTasks.filter((t) => t.task_id !== taskId),
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
