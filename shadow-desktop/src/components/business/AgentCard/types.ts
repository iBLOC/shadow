import type { Agent } from '../../../types';

export type AgentStatus = 'idle' | 'running' | 'error' | 'offline';

export interface AgentCardProps {
  agent: Agent;
  status?: AgentStatus;
  onEdit?: (agent: Agent) => void;
  onDelete?: (id: string) => void;
  onInvoke?: (agent: Agent) => void;
}
