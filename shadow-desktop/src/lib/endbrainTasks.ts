/**
 * 端脑任务（`TaskStore` 里那条）—— **线上形状**。
 *
 * ⚠️ **为什么单独立一个模块**：桌面的看板列是**本地**状态（列、顺序、
 * 智能体…），而端脑任务是**另一份数据**（对话里建的）⇒ ⇒ 两张面不是
 * 一回事 ⇒ ⇒ 端脑任务单开一个分区，跟海马体任务分区并列。
 *
 * ⚠️ **字面量以端脑的 serde 变体名为准**（`Pending` / `InProgress` / …）
 * ⇒ ⇒ 与移动端 `shadow-mobile/lib/screens/task_board_screen.dart` 的
 * `boardColumnOf` **同一套** ⇒ ⇒ 两端不会漂。
 */

export type EndbrainTaskStatus =
  | 'Pending'
  | 'InProgress'
  | 'Completed'
  | 'Cancelled'
  | 'Overdue';

export type EndbrainTaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export interface EndbrainTask {
  /** 端脑分配的任务号（`task-1`…）—— **端脑持有的事实**。 */
  id: string;
  title: string;
  description: string | null;
  status: EndbrainTaskStatus;
  priority: EndbrainTaskPriority;
  /** RFC3339（UTC 瞬间）—— 显示时按**本地钟点**还原。 */
  dueTime: string | null;
  confirmed: boolean;
  createdAt: string | null;
}

function pickString(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return null;
}

/**
 * 端脑状态 → 客户端口径。
 *
 * ⚠️ **认不得 ⇒ 当 `Pending`** —— 与移动端 `boardColumnOf` 的 `default:`
 * **同一口径** ⇒ ⇒ 两端对一条看不懂的任务**落在同一列**（不是各落各的）。
 */
export function normalizeEndbrainStatus(raw: unknown): EndbrainTaskStatus {
  switch (raw) {
    case 'Pending':
      return 'Pending';
    case 'InProgress':
      return 'InProgress';
    case 'Completed':
      return 'Completed';
    case 'Cancelled':
      return 'Cancelled';
    case 'Overdue':
      return 'Overdue';
    default:
      return 'Pending';
  }
}

export function normalizeEndbrainPriority(raw: unknown): EndbrainTaskPriority {
  switch (raw) {
    case 'Low':
      return 'Low';
    case 'Medium':
      return 'Medium';
    case 'High':
      return 'High';
    case 'Urgent':
      return 'Urgent';
    default:
      return 'Medium';
  }
}

/**
 * 一条线上任务 → 客户端形状。
 *
 * ⚠️ **没有任务号 ⇒ 认不得 ⇒ 返回 `null`**（调用方**跳过并出声**，
 * 不是静默丢一条 ⇒ ⇒ 用户看得见「有 N 条形状不对」）。
 */
export function mapEndbrainTask(raw: unknown): EndbrainTask | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = pickString(r, ['task_id', 'taskId', 'id']);
  if (!id) return null;
  return {
    id,
    title: typeof r.title === 'string' ? r.title : '',
    description: typeof r.description === 'string' ? r.description : null,
    status: normalizeEndbrainStatus(r.status),
    priority: normalizeEndbrainPriority(r.priority),
    dueTime: pickString(r, ['due_time', 'dueTime']),
    confirmed: r.confirmed === true,
    createdAt: pickString(r, ['created_at', 'createdAt']),
  };
}

/** 端脑状态 → i18n 键（**看板列**那套，桌面复用它）。 */
export const ENDBRAIN_STATUS_LABEL_KEY: Record<EndbrainTaskStatus, string> = {
  Pending: 'tasks.pending',
  InProgress: 'tasks.inProgress',
  Completed: 'tasks.completed',
  Cancelled: 'tasks.cancelled',
  Overdue: 'tasks.endbrainOverdue',
};

/** 端脑优先级 → i18n 键。 */
export const ENDBRAIN_PRIORITY_LABEL_KEY: Record<EndbrainTaskPriority, string> = {
  Low: 'tasks.low',
  Medium: 'tasks.medium',
  High: 'tasks.high',
  Urgent: 'tasks.urgent',
};

/** 待确认（端脑刚建出来、还没点头）—— **只有这种能确认**。 */
export function isAwaitingConfirmation(task: EndbrainTask): boolean {
  return task.status === 'Pending' && !task.confirmed;
}
