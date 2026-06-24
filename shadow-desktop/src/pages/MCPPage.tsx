import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMCPStore } from '../stores/mcpStore';
import { Button, Modal, Input, StatusBadge, EmptyState } from '../components/ui';
import { 
  Server, 
  Plus, 
  Play, 
  Square, 
  Trash2, 
  AlertCircle,
  Terminal,
  ChevronDown,
  ChevronRight,
  FileCode,
} from 'lucide-react';
import type { MCPServer } from '../types';
import './MCPPage.css';

export function MCPPage() {
  const { t } = useTranslation();
  const { servers, addServer, removeServer, updateServer } = useMCPStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [newServer, setNewServer] = useState<Partial<MCPServer>>({
    name: '',
    command: '',
    args: [],
    env: {},
  });

  const handleAddServer = () => {
    if (!newServer.name || !newServer.command) return;

    const server: MCPServer = {
      id: crypto.randomUUID(),
      name: newServer.name,
      command: newServer.command,
      args: newServer.args || [],
      env: newServer.env || {},
      status: 'stopped',
    };

    try {
      addServer(server);
      setShowAddForm(false);
      setNewServer({ name: '', command: '', args: [], env: {} });
    } catch (err) {
      console.error('Failed to add MCP server:', err);
    }
  };

  const handleToggleServer = (server: MCPServer) => {
    if (server.status === 'running') {
      updateServer(server.id, { status: 'stopped' });
    } else {
      updateServer(server.id, { status: 'running', lastError: undefined });
    }
  };

  return (
    <div className="mcp-page">
      <header className="page-header">
        <div className="header-left">
          <h1>{t('mcp.title')}</h1>
          <p className="subtitle">{t('mcp.subtitle')}</p>
        </div>
        <Button 
          variant="primary"
          icon={<Plus size={18} />}
          onClick={() => setShowAddForm(true)}
        >
          {t('mcp.addServer')}
        </Button>
      </header>

      <div className="server-list">
        {servers.length === 0 ? (
          <EmptyState
            icon={<Server size={48} />}
            title={t('mcp.noServers')}
            description={t('mcp.noServersHint')}
            action={{ label: t('mcp.addServer'), onClick: () => setShowAddForm(true) }}
          />
        ) : (
          servers.map((server) => {
            const isExpanded = expandedServer === server.id;
            
            return (
              <div key={server.id} className={`server-card ${server.status}`}>
                <div 
                  className="server-header"
                  onClick={() => setExpandedServer(isExpanded ? null : server.id)}
                >
                  <div className="server-icon">
                    <Server size={20} />
                    {server.status === 'running' && <span className="pulse-dot" />}
                  </div>
                  <div className="server-info">
                    <h3>{server.name}</h3>
                    <span className="server-type">{server.command}</span>
                  </div>
                  <StatusBadge status={server.status} />
                  <div className="expand-icon">
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="server-details">
                    <div className="command-block">
                      <div className="command-header">
                        <Terminal size={14} />
                        <span>{t('mcp.command')}</span>
                      </div>
                      <code className="command-code">
                        {server.command} {server.args?.join(' ')}
                      </code>
                    </div>

                    {server.lastError && (
                      <div className="error-block">
                        <AlertCircle size={16} />
                        <div>
                          <strong>{t('common.error')}:</strong>
                          <p>{server.lastError}</p>
                        </div>
                      </div>
                    )}

                    <div className="server-actions">
                      <Button
                        variant={server.status === 'running' ? 'secondary' : 'success'}
                        size="sm"
                        icon={server.status === 'running' ? <Square size={14} /> : <Play size={14} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleServer(server);
                        }}
                      >
                        {server.status === 'running' ? t('mcp.stop') : t('mcp.start')}
                      </Button>
                      <Button 
                        variant="danger"
                        size="sm"
                        icon={<Trash2 size={14} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeServer(server.id);
                        }}
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <Modal
        isOpen={showAddForm}
        onClose={() => setShowAddForm(false)}
        title={t('mcp.addServer')}
        size="md"
      >
        <div className="add-form">
          <Input
            label={t('common.name')}
            value={newServer.name || ''}
            onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
            placeholder="My MCP Server"
          />
          
          <div className="form-section">
            <label className="form-label">{t('mcp.command')}</label>
            <div className="command-input">
              <FileCode size={16} className="input-icon" />
              <input
                type="text"
                value={newServer.command || ''}
                onChange={(e) => setNewServer({ ...newServer, command: e.target.value })}
                placeholder="npx"
                className="form-input"
              />
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">{t('mcp.arguments')}</label>
            <input
              type="text"
              value={newServer.args?.join(', ') || ''}
              onChange={(e) => setNewServer({ 
                ...newServer, 
                args: e.target.value.split(',').map(s => s.trim()).filter(Boolean) 
              })}
              placeholder="-y, @modelcontextprotocol/server-filesystem"
              className="form-input"
            />
            <span className="form-hint">{t('mcp.separateArgsWithCommas')}</span>
          </div>

          <div className="form-actions">
            <Button variant="secondary" onClick={() => setShowAddForm(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleAddServer}>
              {t('mcp.addServer')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
