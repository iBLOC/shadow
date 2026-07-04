import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Play, Square, Settings, Trash2, ExternalLink } from 'lucide-react';
import { Button, StatusBadge } from '../../ui';
import type { AgentCardProps } from './types';

const BUILT_IN_ROLES = [
  { value: 'planner', icon: '🧠', color: '#6366f1', labelKey: 'agents.planner' },
  { value: 'coordinator', icon: '⚡', color: '#f59e0b', labelKey: 'agents.coordinator' },
  { value: 'executor', icon: '🛡️', color: '#22c55e', labelKey: 'agents.executor' },
];

const EXTERNAL_TYPES = [
  { value: 'opencode', color: '#8b5cf6', labelKey: 'agents.openCode' },
  { value: 'openclaw', color: '#ec4899', labelKey: 'agents.openClaw' },
  { value: 'claude', color: '#f97316', labelKey: 'agents.claudeAgent' },
  { value: 'mcp', color: '#06b6d4', labelKey: 'agents.mcpServer' },
  { value: 'custom', color: '#64748b', labelKey: 'agents.customAgent' },
];

function mapAgentStatus(status: 'online' | 'offline' | 'busy'): 'online' | 'offline' | 'connecting' | 'error' | 'running' | 'stopped' | 'busy' {
  switch (status) {
    case 'online': return 'online';
    case 'offline': return 'offline';
    case 'busy': return 'busy';
    default: return 'offline';
  }
}

export function AgentCard({ agent, onEdit, onDelete, onInvoke }: AgentCardProps) {
  const { t } = useTranslation();

  const typeConfig = useMemo(() => {
    if (agent.category === 'built-in') {
      return BUILT_IN_ROLES.find(r => r.value === agent.role) || BUILT_IN_ROLES[0];
    }
    return EXTERNAL_TYPES.find(t => t.value === agent.externalType) || EXTERNAL_TYPES[4];
  }, [agent]);

  const color = typeConfig.color;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md text-white" style={{ background: color }}>
          <Bot size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-foreground">{agent.name}</h3>
          <span className="text-xs font-medium" style={{ color }}>
            {t(typeConfig.labelKey)}
          </span>
        </div>
        <StatusBadge status={mapAgentStatus(agent.status)} />
      </div>

      {agent.description && (
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{agent.description}</p>
      )}

      {agent.endpoint && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ExternalLink size={14} />
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{agent.endpoint}</code>
        </div>
      )}

      {agent.capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {agent.capabilities.slice(0, 3).map((cap) => (
            <span key={cap} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">{cap}</span>
          ))}
          {agent.capabilities.length > 3 && (
            <span className="px-1 text-xs text-muted-foreground">+{agent.capabilities.length - 3}</span>
          )}
        </div>
      )}

      <div className="mt-1 flex gap-2">
        <Button
          variant={agent.status === 'online' ? 'secondary' : 'success'}
          size="sm"
          icon={agent.status === 'online' ? <Square size={14} /> : <Play size={14} />}
          onClick={() => onInvoke?.(agent)}
        >
          {agent.status === 'online' ? t('agents.stop') : t('agents.start')}
        </Button>
        <Button variant="ghost" size="sm" icon={<Settings size={14} />} onClick={() => onEdit?.(agent)} />
        <Button
          variant="ghost"
          size="sm"
          icon={<Trash2 size={14} />}
          onClick={() => onDelete?.(agent.id)}
        />
      </div>
    </div>
  );
}

export type { AgentCardProps } from './types';
