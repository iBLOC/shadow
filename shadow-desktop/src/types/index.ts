// ====================
// Agent Types - Extended
// ====================

// Agent Category: Built-in vs External
export type AgentCategory = 'built-in' | 'external';

// Built-in Agent roles
export type BuiltInRole = 'planner' | 'coordinator' | 'executor';

// External Agent types
export type ExternalAgentType = 'opencode' | 'openclaw' | 'claude' | 'custom' | 'mcp';

// Communication protocol
export type AgentProtocol = 'a2a' | 'opencode' | 'openclaw' | 'mcp';

// Agent Interface
export interface Agent {
  id: string;
  name: string;
  category: AgentCategory;
  // Built-in specific
  role?: BuiltInRole;
  planLogic?: string;
  // External specific
  externalType?: ExternalAgentType;
  protocol?: AgentProtocol;
  endpoint?: string;
  apiKey?: string;
  // Model configuration
  modelConfig?: AgentModelConfig;
  // Common
  status: 'online' | 'offline' | 'busy';
  description?: string;
  capabilities: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Legacy alias for backward compatibility
export interface LegacyAgent {
  id: string;
  name: string;
  type: 'opencode' | 'openclaw' | 'claude' | 'custom';
  endpoint?: string;
  apiKey?: string;
  status: 'online' | 'offline' | 'busy';
  description?: string;
  capabilities: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ====================
// A2A Protocol Types
// ====================

export type A2AMessageType = 'request' | 'response' | 'notification';

export interface A2AMessage {
  id: string;
  type: A2AMessageType;
  method: string;
  params: Record<string, unknown>;
  from: string;  // agent ID
  to: string;    // agent ID
  correlationId?: string;
  timestamp: string;
}

// Task delegation
export interface TaskDelegate {
  id: string;
  taskId: string;
  goal: string;
  context: Record<string, unknown>;
  fileLinks: FileLink[];
  deadline?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

// Task result
export interface TaskResult {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
  fileLinks: FileLink[];
  completedAt?: string;
}

// ====================
// File Link Types (Active Authorization)
// ====================

export type FileLinkPermission = 'read' | 'write' | 'read-write';

export interface FileLink {
  id: string;
  path: string;
  permission: FileLinkPermission;
  expiresAt: string;
  token: string;
  createdBy: string;
}

export interface FileLinkRequest {
  paths: string[];
  permission: FileLinkPermission;
  expiresIn: number;  // seconds
}

// ====================
// Storage Types (neon + S3)
// ====================

export type StorageBackend = 's3' | 'oss' | 'minio' | 'local';

export interface StorageConfig {
  backend: StorageBackend;
  // S3/OSS config
  bucket?: string;
  endpoint?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  // Local config
  basePath?: string;
}

export interface FileMetadata {
  key: string;
  size: number;
  contentType: string;
  lastModified: string;
  etag: string;
}

export interface UploadResult {
  path: string;
  etag: string;
  size: number;
}

export interface AgentTask {
  id: string;
  agentId: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

// Conversation Types
export interface Conversation {
  id: string;
  agentId?: string;
  sessionId?: string;  // Prefrontal session ID
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  attachments?: Attachment[];
  /** ChatBI structured payload (if the assistant response is a chart query result). */
  chatbi?: import('../lib/chatbi/guards').ChatBiPayload;
  /** visual_qa clarification chip (when the user must pick a source). */
  visual_qa_clarification?: VisualQaClarification;
  /** Feishu share card (DOC-03). Surfaced when a task's workbook
   *  has just been published to Feishu via document_publish_feishu. */
  feishu_published?: FeishuPublished;
}

export interface FeishuPublished {
  taskId: string;
  title: string;
  /** The Feishu share URL (spreadsheet_token-derived). */
  url: string;
}

export interface VisualQaClarification {
  kind: string;
  candidates: Array<{
    deviceId?: string;
    deviceLabel: string;
    sourceId: string;
    hostLabel?: string;
  }>;
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  url?: string;
}

// Skill Types
export interface Skill {
  id: string;
  name: string;
  description: string;
  category: 'built-in' | 'custom' | 'installed';
  enabled: boolean;
  config?: Record<string, unknown>;
  icon?: string;
}

export interface SkillExecution {
  id: string;
  skillId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input: Record<string, unknown>;
  output?: unknown;
  startedAt: Date;
  completedAt?: Date;
}

// Task Board Types
export interface TaskBoardColumn {
  id: string;
  title: string;
  order: number;
}

export type AgentType = 'planner' | 'coordinator' | 'executor' | 'reviewer' | 'opencode';

export interface AgentModelConfig {
  provider: string;
  modelId: string;
  apiBase?: string;
  apiKey?: string;
}

export interface OpenCodeConfig {
  endpoint?: string;
  port?: number;
  autoLaunch?: boolean;
  autoInstall?: boolean;
}

export type WorkflowPhase = 'backlog' | 'planning' | 'running' | 'review' | 'done';

export interface PlanStep {
  order: number;
  description: string;
  agentType: AgentType;
  targetFile?: string;
}

export interface TaskContext {
  taskId: string;
  worktreePath: string;
  sessionId?: string;
  branchName: string;
  baseBranch: string;
}

export interface TaskApproval {
  required: boolean;
  approvedAt?: Date;
  approvedBy?: string;
  autoApproved: boolean;
  rejectReason?: string;
}

export interface FileDiff {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  diff: string;
}

export interface AgentExecutionResult {
  diff: FileDiff[];
  summary?: string;
  reviewComments?: string[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  columnId: string;
  order: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  type: 'normal' | 'scheduled';
  tags: string[];
  assignee?: string;
  dueDate?: Date;
  scheduledAt?: Date;
  cronExpression?: string;
  repeatType?: 'once' | 'daily' | 'weekly' | 'monthly';
  agentId?: string;
  conversationId?: string;
  createdAt: Date;
  updatedAt: Date;
  memories?: string[];
  workflowPhase?: WorkflowPhase;
  plan?: {
    steps: PlanStep[];
    estimatedTime?: string;
    requiredAgents: string[];
  };
  context?: TaskContext;
  approval?: TaskApproval;
  result?: TaskResult;
  completedAt?: Date;
}

export interface OpenCodeInstance {
  id: string;
  port: number;
  status: 'starting' | 'running' | 'stopped' | 'error';
  processId?: number;
  error?: string;
}

export interface ScheduledTask extends Task {
  type: 'scheduled';
  scheduledAt: Date;
  cronExpression?: string;
  repeatType: 'once' | 'daily' | 'weekly' | 'monthly';
  lastRunAt?: Date;
  nextRunAt?: Date;
  enabled: boolean;
}

// Memory Types (from hippocampus)
export interface Memory {
  id: string;
  uri: string;
  content: string;
  dimension: 'User' | 'Agent' | 'Session' | 'Resources';
  layer: 'L0' | 'L1' | 'L2';
  sessionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchResult {
  memory: Memory;
  score: number;
  source: 'Keyword' | 'Vector' | 'Graph';
}
