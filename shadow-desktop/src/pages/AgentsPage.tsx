import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAgentStore } from '../stores/agentStore';
import { Button, Badge, StatusBadge, Modal, EmptyState } from '../components/ui';
import {
  Bot,
  Plus,
  Trash2,
  Settings,
  Play,
  Square,
  ExternalLink,
  Brain,
  ChevronDown,
  ChevronRight,
  Zap,
  Shield,
  Cpu,
  Terminal,
  RefreshCw,
  Download,
  type LucideIcon,
} from 'lucide-react';
import type { Agent, AgentCategory, BuiltInRole, ExternalAgentType } from '../types';
import { cn } from '../lib/utils';

interface RoleConfig {
  value: string;
  icon: LucideIcon;
  color: string;
  labelKey: string;
}

interface ExternalTypeConfig {
  value: string;
  icon: LucideIcon;
  color: string;
  labelKey: string;
}

export function AgentsPage() {
  const { t } = useTranslation();
  const {
    agents, addAgent, removeAgent, updateAgent,
    opencodeConfig, opencodeInstances, opencodeInstalled, isLoadingOpenCode,
    setOpenCodeConfig, fetchOpenCodeInstances, launchOpenCode, stopOpenCode,
    checkOpenCodeInstalled, installOpenCode
  } = useAgentStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [category, setCategory] = useState<AgentCategory>('external');
  const [expandedSection, setExpandedSection] = useState<string | null>('built-in');
  const [newAgent, setNewAgent] = useState<Partial<Agent>>({
    name: '', category: 'external', externalType: 'custom',
    endpoint: '', description: '', capabilities: [],
  });
  const [launchPort, setLaunchPort] = useState<number>(3000);

  useEffect(() => {
    checkOpenCodeInstalled();
    fetchOpenCodeInstances();
  }, [checkOpenCodeInstalled, fetchOpenCodeInstances]);

  const { builtInAgents, externalAgents } = useMemo(() => ({
    builtInAgents: agents.filter(a => a.category === 'built-in'),
    externalAgents: agents.filter(a => a.category === 'external'),
  }), [agents]);

  const builtInRoles: RoleConfig[] = useMemo(() => [
    { value: 'planner', icon: Brain, color: '#6366f1', labelKey: 'agents.planner' },
    { value: 'coordinator', icon: Zap, color: '#f59e0b', labelKey: 'agents.coordinator' },
    { value: 'executor', icon: Shield, color: '#22c55e', labelKey: 'agents.executor' },
  ], []);

  const externalTypes: ExternalTypeConfig[] = useMemo(() => [
    { value: 'opencode', icon: Bot, color: '#8b5cf6', labelKey: 'agents.openCode' },
    { value: 'openclaw', icon: Bot, color: '#ec4899', labelKey: 'agents.openClaw' },
    { value: 'claude', icon: Bot, color: '#f97316', labelKey: 'agents.claudeAgent' },
    { value: 'mcp', icon: Cpu, color: '#06b6d4', labelKey: 'agents.mcpServer' },
    { value: 'custom', icon: Bot, color: '#64748b', labelKey: 'agents.customAgent' },
  ], []);

  const handleAddAgent = () => {
    if (!newAgent.name) return;
    const agent: Agent = {
      id: crypto.randomUUID(),
      name: newAgent.name,
      category,
      role: category === 'built-in' ? newAgent.role : undefined,
      externalType: category === 'external' ? newAgent.externalType : undefined,
      endpoint: newAgent.endpoint || '',
      status: 'offline',
      description: newAgent.description,
      capabilities: newAgent.capabilities || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    addAgent(agent);
    setShowAddForm(false);
    setNewAgent({ name: '', category: 'external', externalType: 'custom', endpoint: '', description: '', capabilities: [] });
  };

  const handleToggleStatus = (agent: Agent) => {
    updateAgent(agent.id, { status: agent.status === 'online' ? 'offline' : 'online' });
  };

  const getTypeConfig = (agent: Agent) => {
    if (agent.category === 'built-in') return builtInRoles.find(r => r.value === agent.role) || builtInRoles[0];
    return externalTypes.find(t => t.value === agent.externalType) || externalTypes[4];
  };

  const renderAgentCard = (agent: Agent) => {
    const typeConfig = getTypeConfig(agent);
    const TypeIcon = typeConfig.icon;
    return (
      <div key={agent.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/30">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md text-white" style={{ background: typeConfig.color }}>
            <TypeIcon size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="mb-0.5 text-base font-semibold text-foreground">{agent.name}</h3>
            <span className="text-xs font-medium" style={{ color: typeConfig.color }}>{t(typeConfig.labelKey)}</span>
          </div>
          <StatusBadge status={agent.status} />
        </div>
        {agent.description && <p className="text-sm leading-relaxed text-muted-foreground">{agent.description}</p>}
        {agent.endpoint && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ExternalLink size={14} />
            <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">{agent.endpoint}</code>
          </div>
        )}
        {agent.capabilities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {agent.capabilities.slice(0, 3).map((cap) => (
              <span key={cap} className="rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">{cap}</span>
            ))}
            {agent.capabilities.length > 3 && (
              <span className="px-1 text-xs text-muted-foreground">+{agent.capabilities.length - 3}</span>
            )}
          </div>
        )}
        <div className="flex gap-2 border-t border-border pt-3">
          <Button
            variant={agent.status === 'online' ? 'secondary' : 'success'}
            size="sm"
            icon={agent.status === 'online' ? <Square size={14} /> : <Play size={14} />}
            onClick={() => handleToggleStatus(agent)}
          >
            {agent.status === 'online' ? t('agents.stop') : t('agents.start')}
          </Button>
          <Button variant="ghost" size="sm" icon={<Settings size={14} />} />
          <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={() => removeAgent(agent.id)} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1>{t('agents.title')}</h1>
          <p className="subtitle">{t('agents.subtitle')}</p>
        </div>
        <Button variant="primary" icon={<Plus size={18} />} onClick={() => setShowAddForm(true)}>
          {t('agents.addAgent')}
        </Button>
      </header>

      {/* Built-in Agents */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Button
          variant="ghost"
          fullWidth
          className="h-auto justify-start py-4 px-5"
          onClick={() => setExpandedSection(expandedSection === 'built-in' ? null : 'built-in')}
        >
          <div className="flex items-center gap-3 text-foreground">
            <Brain size={20} />
            <h2 className="text-base font-semibold">{t('agents.builtInAgents')}</h2>
            <Badge variant="default">{builtInAgents.length}</Badge>
          </div>
          {expandedSection === 'built-in' ? <ChevronDown size={20} className="ml-auto" /> : <ChevronRight size={20} className="ml-auto" />}
        </Button>
        {expandedSection === 'built-in' && (
          <div className="grid grid-cols-1 gap-4 border-t border-border p-5 md:grid-cols-2 lg:grid-cols-3">
            {builtInAgents.length === 0 ? (
              <EmptyState icon={<Brain size={48} />} title={t('agents.noBuiltIn')} size="sm" />
            ) : (
              builtInAgents.map(renderAgentCard)
            )}
          </div>
        )}
      </div>

      {/* External Agents */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Button
          variant="ghost"
          fullWidth
          className="h-auto justify-start py-4 px-5"
          onClick={() => setExpandedSection(expandedSection === 'external' ? null : 'external')}
        >
          <div className="flex items-center gap-3 text-foreground">
            <Bot size={20} />
            <h2 className="text-base font-semibold">{t('agents.externalAgents')}</h2>
            <Badge variant="default">{externalAgents.length}</Badge>
          </div>
          {expandedSection === 'external' ? <ChevronDown size={20} className="ml-auto" /> : <ChevronRight size={20} className="ml-auto" />}
        </Button>
        {expandedSection === 'external' && (
          <div className="grid grid-cols-1 gap-4 border-t border-border p-5 md:grid-cols-2 lg:grid-cols-3">
            {externalAgents.length === 0 ? (
              <EmptyState icon={<Bot size={48} />} title={t('agents.noExternal')} size="sm" />
            ) : (
              externalAgents.map(renderAgentCard)
            )}
          </div>
        )}
      </div>

      {/* OpenCode Section */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Button
          variant="ghost"
          fullWidth
          className="h-auto justify-start py-4 px-5"
          onClick={() => setExpandedSection(expandedSection === 'opencode' ? null : 'opencode')}
        >
          <div className="flex items-center gap-3 text-foreground">
            <Terminal size={20} />
            <h2 className="text-base font-semibold">{t('agents.openCodeSection')}</h2>
            <Badge variant="default">{opencodeInstances.length}</Badge>
          </div>
          {expandedSection === 'opencode' ? <ChevronDown size={20} className="ml-auto" /> : <ChevronRight size={20} className="ml-auto" />}
        </Button>
        {expandedSection === 'opencode' && (
          <div className="flex flex-col gap-4 border-t border-border p-5">
            <p className="text-sm text-muted-foreground">{t('agents.openCodeSubtitle')}</p>

            {!opencodeInstalled ? (
              <div className="flex items-center gap-4 rounded-md border border-border bg-muted/30 p-4">
                <Badge variant="warning">{t('agents.notInstalled')}</Badge>
                <Button
                  variant="primary"
                  icon={<Download size={16} />}
                  onClick={installOpenCode}
                  disabled={isLoadingOpenCode}
                >
                  {isLoadingOpenCode ? t('agents.installing') : t('agents.installOpenCode')}
                </Button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-muted-foreground">{t('agents.port')}</label>
                    <input
                      type="number" value={launchPort}
                      onChange={(e) => setLaunchPort(parseInt(e.target.value) || 3000)}
                      min={3000} max={3010}
                      className="w-20 rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground focus:border-foreground focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-muted-foreground">{t('agents.autoLaunch')}</label>
                    <input
                      type="checkbox"
                      checked={opencodeConfig.autoLaunch}
                      onChange={(e) => setOpenCodeConfig({ autoLaunch: e.target.checked })}
                      className="h-4 w-4 accent-foreground"
                    />
                  </div>
                  <Button variant="success" size="sm" icon={<Play size={14} />} onClick={() => launchOpenCode(launchPort)} disabled={isLoadingOpenCode}>
                    {t('agents.launchInstance')}
                  </Button>
                  <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={fetchOpenCodeInstances} disabled={isLoadingOpenCode}>
                    {t('agents.refresh')}
                  </Button>
                </div>

                <div>
                  {opencodeInstances.length === 0 ? (
                    <EmptyState icon={<Terminal size={48} />} title={t('agents.noInstances')} description={t('agents.noInstancesHint')} size="sm" />
                  ) : (
                    <div className="flex flex-col gap-2">
                      {opencodeInstances.map((instance) => (
                        <div key={instance.id} className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <Terminal size={20} />
                          </div>
                          <div className="flex flex-1 items-center gap-3">
                            <span className="font-mono text-sm text-foreground">:{instance.port}</span>
                            <StatusBadge
                              status={instance.status === 'running' ? 'online' : instance.status === 'starting' ? 'connecting' : 'offline'}
                              size="sm"
                            />
                          </div>
                          <Button
                            variant="danger"
                            size="sm"
                            icon={<Square size={14} />}
                            onClick={() => stopOpenCode(instance.id)}
                            disabled={instance.status === 'stopped' || isLoadingOpenCode}
                          >
                            {t('agents.stopInstance')}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Add Agent Modal */}
      <Modal isOpen={showAddForm} onClose={() => setShowAddForm(false)} title={t('agents.addAgent')} size="md">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-muted-foreground">{t('agents.category')}</label>
            <div className="flex gap-2 rounded-md border border-border bg-muted p-1">
              <button
                className={cn('flex flex-1 items-center justify-center gap-2 rounded px-3 py-2 text-sm font-medium text-muted-foreground transition-colors',
                  category === 'external' && 'bg-foreground text-background')}
                onClick={() => setCategory('external')}
              >
                <Bot size={16} />
                {t('agents.external')}
              </button>
              <button
                className={cn('flex flex-1 items-center justify-center gap-2 rounded px-3 py-2 text-sm font-medium text-muted-foreground transition-colors',
                  category === 'built-in' && 'bg-foreground text-background')}
                onClick={() => setCategory('built-in')}
              >
                <Brain size={16} />
                {t('agents.builtIn')}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-muted-foreground">{t('agents.type')}</label>
            <div className="grid grid-cols-3 gap-2">
              {(category === 'built-in' ? builtInRoles : externalTypes).map((type) => {
                const Icon = type.icon;
                const isSelected = category === 'built-in'
                  ? newAgent.role === type.value
                  : newAgent.externalType === type.value;
                return (
                  <button
                    key={type.value}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-md border-2 border-border bg-muted p-4 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground',
                      isSelected && 'border-foreground bg-muted text-foreground'
                    )}
                    onClick={() => setNewAgent({
                      ...newAgent,
                      role: category === 'built-in' ? type.value as BuiltInRole : newAgent.role,
                      externalType: category === 'external' ? type.value as ExternalAgentType : newAgent.externalType,
                    })}
                  >
                    <Icon size={20} style={{ color: type.color }} />
                    <span>{t(type.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-muted-foreground">{t('common.name')}</label>
            <input
              type="text"
              value={newAgent.name || ''}
              onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
              placeholder="My Agent"
              className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-foreground focus:outline-none"
            />
          </div>

          {category === 'external' && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-muted-foreground">{t('agents.endpoint')}</label>
              <input
                type="text"
                value={newAgent.endpoint || ''}
                onChange={(e) => setNewAgent({ ...newAgent, endpoint: e.target.value })}
                placeholder="http://localhost:8080"
                className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-foreground focus:outline-none"
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-muted-foreground">{t('common.description')}</label>
            <textarea
              value={newAgent.description || ''}
              onChange={(e) => setNewAgent({ ...newAgent, description: e.target.value })}
              placeholder={t('agents.descriptionPlaceholder')}
              rows={3}
              className="w-full resize-y rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-foreground focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button variant="secondary" onClick={() => setShowAddForm(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={handleAddAgent}>{t('agents.addAgent')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
