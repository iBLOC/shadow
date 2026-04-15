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
} from 'lucide-react';
import type { Agent, AgentCategory, BuiltInRole, ExternalAgentType } from '../types';
import './AgentsPage.css';

interface RoleConfig {
  value: string;
  icon: typeof Brain;
  color: string;
  labelKey: string;
}

interface ExternalTypeConfig {
  value: string;
  icon: typeof Cpu;
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
    name: '',
    category: 'external',
    externalType: 'custom',
    endpoint: '',
    description: '',
    capabilities: [],
  });
  const [launchPort, setLaunchPort] = useState<number>(3000);

  useEffect(() => {
    checkOpenCodeInstalled();
    fetchOpenCodeInstances();
  }, [checkOpenCodeInstalled, fetchOpenCodeInstances]);

  const { builtInAgents, externalAgents } = useMemo(() => {
    return {
      builtInAgents: agents.filter(a => a.category === 'built-in'),
      externalAgents: agents.filter(a => a.category === 'external'),
    };
  }, [agents]);

  // i18n-ready config functions
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
      category: category,
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
    if (agent.status === 'online') {
      updateAgent(agent.id, { status: 'offline' });
    } else {
      updateAgent(agent.id, { status: 'online' });
    }
  };

  const getTypeConfig = (agent: Agent) => {
    if (agent.category === 'built-in') {
      return builtInRoles.find(r => r.value === agent.role) || builtInRoles[0];
    }
    return externalTypes.find(t => t.value === agent.externalType) || externalTypes[4];
  };

  const renderAgentCard = (agent: Agent) => {
    const typeConfig = getTypeConfig(agent);
    const TypeIcon = typeConfig.icon;

    return (
      <div key={agent.id} className="agent-card">
        <div className="agent-header">
          <div 
            className="agent-icon"
            style={{ background: typeConfig.color }}
          >
            <TypeIcon size={24} />
          </div>
          <div className="agent-info">
            <h3>{agent.name}</h3>
            <span className="agent-type" style={{ color: typeConfig.color }}>
              {t(typeConfig.labelKey)}
            </span>
          </div>
          <StatusBadge status={agent.status} />
        </div>
        
        {agent.description && (
          <p className="agent-description">{agent.description}</p>
        )}
        
        {agent.endpoint && (
          <div className="agent-endpoint">
            <ExternalLink size={14} />
            <code>{agent.endpoint}</code>
          </div>
        )}
        
        {agent.capabilities.length > 0 && (
          <div className="agent-capabilities">
            {agent.capabilities.slice(0, 3).map((cap) => (
              <span key={cap} className="capability-tag">{cap}</span>
            ))}
            {agent.capabilities.length > 3 && (
              <span className="capability-more">+{agent.capabilities.length - 3}</span>
            )}
          </div>
        )}
        
        <div className="agent-actions">
          <Button
            variant={agent.status === 'online' ? 'secondary' : 'success'}
            size="sm"
            icon={agent.status === 'online' ? <Square size={14} /> : <Play size={14} />}
            onClick={() => handleToggleStatus(agent)}
          >
            {agent.status === 'online' ? t('agents.stop') : t('agents.start')}
          </Button>
          <Button variant="ghost" size="sm" icon={<Settings size={14} />} />
          <Button 
            variant="ghost" 
            size="sm" 
            icon={<Trash2 size={14} />}
            onClick={() => removeAgent(agent.id)}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="agents-page">
      <header className="page-header">
        <div className="header-left">
          <h1>{t('agents.title')}</h1>
          <p className="subtitle">{t('agents.subtitle')}</p>
        </div>
        <Button 
          variant="primary"
          icon={<Plus size={18} />}
          onClick={() => setShowAddForm(true)}
        >
          {t('agents.addAgent')}
        </Button>
      </header>

      <div className="agents-section">
        <button 
          className="section-header"
          onClick={() => setExpandedSection(expandedSection === 'built-in' ? null : 'built-in')}
        >
          <div className="section-title">
            <Brain size={20} />
            <h2>{t('agents.builtInAgents')}</h2>
            <Badge variant="default">{builtInAgents.length}</Badge>
          </div>
          {expandedSection === 'built-in' ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </button>
        
        {expandedSection === 'built-in' && (
          <div className="agent-grid">
            {builtInAgents.length === 0 ? (
              <EmptyState
                icon={<Brain size={48} />}
                title={t('agents.noBuiltIn')}
                size="sm"
              />
            ) : (
              builtInAgents.map(renderAgentCard)
            )}
          </div>
        )}
      </div>

      <div className="agents-section">
        <button 
          className="section-header"
          onClick={() => setExpandedSection(expandedSection === 'external' ? null : 'external')}
        >
          <div className="section-title">
            <Bot size={20} />
            <h2>{t('agents.externalAgents')}</h2>
            <Badge variant="default">{externalAgents.length}</Badge>
          </div>
          {expandedSection === 'external' ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </button>
        
        {expandedSection === 'external' && (
          <div className="agent-grid">
            {externalAgents.length === 0 ? (
              <EmptyState
                icon={<Bot size={48} />}
                title={t('agents.noExternal')}
                size="sm"
              />
            ) : (
              externalAgents.map(renderAgentCard)
            )}
          </div>
        )}
      </div>

      <div className="agents-section">
        <button 
          className="section-header"
          onClick={() => setExpandedSection(expandedSection === 'opencode' ? null : 'opencode')}
        >
          <div className="section-title">
            <Terminal size={20} />
            <h2>{t('agents.openCodeSection')}</h2>
            <Badge variant="default">{opencodeInstances.length}</Badge>
          </div>
          {expandedSection === 'opencode' ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </button>
        
        {expandedSection === 'opencode' && (
          <div className="opencode-section">
            <p className="section-subtitle">{t('agents.openCodeSubtitle')}</p>
            
            {!opencodeInstalled ? (
              <div className="opencode-not-installed">
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
                <div className="opencode-config">
                  <div className="config-row">
                    <label>{t('agents.port')}</label>
                    <input
                      type="number"
                      value={launchPort}
                      onChange={(e) => setLaunchPort(parseInt(e.target.value) || 3000)}
                      min={3000}
                      max={3010}
                      className="form-input port-input"
                    />
                  </div>
                  <div className="config-row">
                    <label>{t('agents.autoLaunch')}</label>
                    <input
                      type="checkbox"
                      checked={opencodeConfig.autoLaunch}
                      onChange={(e) => setOpenCodeConfig({ autoLaunch: e.target.checked })}
                      className="form-checkbox"
                    />
                  </div>
                  <Button
                    variant="success"
                    size="sm"
                    icon={<Play size={14} />}
                    onClick={() => launchOpenCode(launchPort)}
                    disabled={isLoadingOpenCode}
                  >
                    {t('agents.launchInstance')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<RefreshCw size={14} />}
                    onClick={fetchOpenCodeInstances}
                    disabled={isLoadingOpenCode}
                  >
                    {t('agents.refresh')}
                  </Button>
                </div>

                <div className="opencode-instances">
                  {opencodeInstances.length === 0 ? (
                    <EmptyState
                      icon={<Terminal size={48} />}
                      title={t('agents.noInstances')}
                      description={t('agents.noInstancesHint')}
                      size="sm"
                    />
                  ) : (
                    <div className="instance-list">
                      {opencodeInstances.map((instance) => (
                        <div key={instance.id} className="instance-card">
                          <div className="instance-icon">
                            <Terminal size={20} />
                          </div>
                          <div className="instance-info">
                            <span className="instance-port">:{instance.port}</span>
                            <StatusBadge status={instance.status === 'running' ? 'online' : instance.status === 'starting' ? 'connecting' : 'offline'} size="sm" />
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

      <Modal
        isOpen={showAddForm}
        onClose={() => setShowAddForm(false)}
        title={t('agents.addAgent')}
        size="md"
      >
        <div className="add-form">
          <div className="form-section">
            <label className="form-label">{t('agents.category')}</label>
            <div className="category-toggle">
              <button
                className={`category-btn ${category === 'external' ? 'active' : ''}`}
                onClick={() => setCategory('external')}
              >
                <Bot size={16} />
                {t('agents.external')}
              </button>
              <button
                className={`category-btn ${category === 'built-in' ? 'active' : ''}`}
                onClick={() => setCategory('built-in')}
              >
                <Brain size={16} />
                {t('agents.builtIn')}
              </button>
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">{t('agents.type')}</label>
            <div className="type-grid">
              {(category === 'built-in' ? builtInRoles : externalTypes).map((type) => {
                const Icon = type.icon;
                const isSelected = category === 'built-in' 
                  ? newAgent.role === type.value
                  : newAgent.externalType === type.value;
                return (
                  <button
                    key={type.value}
                    className={`type-btn ${isSelected ? 'selected' : ''}`}
                    onClick={() => setNewAgent({ 
                      ...newAgent, 
                      role: category === 'built-in' ? type.value as BuiltInRole : newAgent.role,
                      externalType: category === 'external' ? type.value as ExternalAgentType : newAgent.externalType
                    })}
                    style={{ '--type-color': type.color } as React.CSSProperties}
                  >
                    <Icon size={20} style={{ color: type.color }} />
                    <span>{t(type.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">{t('common.name')}</label>
            <input
              type="text"
              value={newAgent.name || ''}
              onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
              placeholder="My Agent"
              className="form-input"
            />
          </div>

          {category === 'external' && (
            <div className="form-section">
              <label className="form-label">{t('agents.endpoint')}</label>
              <input
                type="text"
                value={newAgent.endpoint || ''}
                onChange={(e) => setNewAgent({ ...newAgent, endpoint: e.target.value })}
                placeholder="http://localhost:8080"
                className="form-input"
              />
            </div>
          )}

          <div className="form-section">
            <label className="form-label">{t('common.description')}</label>
            <textarea
              value={newAgent.description || ''}
              onChange={(e) => setNewAgent({ ...newAgent, description: e.target.value })}
              placeholder={t('agents.descriptionPlaceholder')}
              className="form-textarea"
              rows={3}
            />
          </div>

          <div className="form-actions">
            <Button variant="secondary" onClick={() => setShowAddForm(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleAddAgent}>
              {t('agents.addAgent')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
