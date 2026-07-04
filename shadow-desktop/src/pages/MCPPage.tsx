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
import { cn } from '../lib/utils';

export function MCPPage() {
  const { t } = useTranslation();
  const { servers, addServer, removeServer, updateServer } = useMCPStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [newServer, setNewServer] = useState<Partial<MCPServer>>({
    name: '', command: '', args: [], env: {},
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
    if (server.status === 'running') updateServer(server.id, { status: 'stopped' });
    else updateServer(server.id, { status: 'running', lastError: undefined });
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1>{t('mcp.title')}</h1>
          <p className="subtitle">{t('mcp.subtitle')}</p>
        </div>
        <Button variant="primary" icon={<Plus size={18} />} onClick={() => setShowAddForm(true)}>
          {t('mcp.addServer')}
        </Button>
      </header>

      <div className="flex flex-col gap-3">
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
              <div key={server.id} className={cn(
                'overflow-hidden rounded-lg border border-border bg-card transition-colors',
                server.status === 'running' && 'border-l-4 border-l-foreground'
              )}>
                <div
                  className="flex cursor-pointer items-center gap-3 p-4"
                  onClick={() => setExpandedServer(isExpanded ? null : server.id)}
                >
                  <div className="relative flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                    <Server size={20} />
                    {server.status === 'running' && (
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-foreground">{server.name}</h3>
                    <span className="font-mono text-xs text-muted-foreground">{server.command}</span>
                  </div>
                  <StatusBadge status={server.status} />
                  {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </div>

                {isExpanded && (
                  <div className="flex flex-col gap-4 border-t border-border bg-muted/30 p-4">
                    <div className="overflow-hidden rounded-md border border-border bg-card">
                      <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                        <Terminal size={14} />
                        <span>{t('mcp.command')}</span>
                      </div>
                      <code className="block whitespace-pre-wrap break-all p-3 font-mono text-sm text-foreground">
                        {server.command} {server.args?.join(' ')}
                      </code>
                    </div>

                    {server.lastError && (
                      <div className="flex gap-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-red-500">
                        <AlertCircle size={16} className="flex-shrink-0" />
                        <div>
                          <strong className="font-semibold">{t('common.error')}:</strong>
                          <p className="mt-1 text-sm">{server.lastError}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant={server.status === 'running' ? 'secondary' : 'success'}
                        size="sm"
                        icon={server.status === 'running' ? <Square size={14} /> : <Play size={14} />}
                        onClick={(e) => { e.stopPropagation(); handleToggleServer(server); }}
                      >
                        {server.status === 'running' ? t('mcp.stop') : t('mcp.start')}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<Trash2 size={14} />}
                        onClick={(e) => { e.stopPropagation(); removeServer(server.id); }}
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

      <Modal isOpen={showAddForm} onClose={() => setShowAddForm(false)} title={t('mcp.addServer')} size="md">
        <div className="flex flex-col gap-4">
          <Input
            label={t('common.name')}
            value={newServer.name || ''}
            onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
            placeholder="My MCP Server"
          />

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-muted-foreground">{t('mcp.command')}</label>
            <div className="relative flex items-center">
              <FileCode size={16} className="pointer-events-none absolute left-3 text-muted-foreground" />
              <input
                type="text"
                value={newServer.command || ''}
                onChange={(e) => setNewServer({ ...newServer, command: e.target.value })}
                placeholder="npx"
                className="w-full rounded-md border border-border bg-muted py-2 pl-10 pr-3 text-sm text-foreground focus:border-foreground focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-muted-foreground">{t('mcp.arguments')}</label>
            <input
              type="text"
              value={newServer.args?.join(', ') || ''}
              onChange={(e) => setNewServer({
                ...newServer,
                args: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
              })}
              placeholder="-y, @modelcontextprotocol/server-filesystem"
              className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-foreground focus:outline-none"
            />
            <span className="text-xs text-muted-foreground">{t('mcp.separateArgsWithCommas')}</span>
          </div>

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button variant="secondary" onClick={() => setShowAddForm(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={handleAddServer}>{t('mcp.addServer')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
