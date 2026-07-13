import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import {
  cortexClient,
  type McpServerRecord,
  type McpToolSummary,
} from '../lib/cortexClient';
import { cn } from '../lib/utils';
import { useCortexStore } from '../stores/cortexStore';

interface FormState {
  name: string;
  wasm_name: string;
  wasm_version: string;
  wasm_sha256: string;
  description: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  wasm_name: '',
  wasm_version: '',
  wasm_sha256: '',
  description: '',
};

export function MCPPage() {
  const { t } = useTranslation();
  const cortexStatus = useCortexStore((s) => s.status);

  const [servers, setServers] = useState<McpServerRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busyServer, setBusyServer] = useState<string | null>(null);
  const [toolsCache, setToolsCache] = useState<Record<string, McpToolSummary[]>>({});

  const loadServers = async () => {
    if (cortexStatus !== 'running') {
      setServers([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await cortexClient.listMcpServers();
      setServers(list.servers);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setServers([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTools = async (id: string) => {
    try {
      const tools = await cortexClient.getMcpServerTools(id);
      setToolsCache((m) => ({ ...m, [id]: tools }));
    } catch {
      setToolsCache((m) => ({ ...m, [id]: [] }));
    }
  };

  const isRunning = cortexStatus === 'running';

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1>{t('mcp.title')}</h1>
          <p className="subtitle">{t('mcp.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            icon={<Terminal size={18} />}
            loading={loading}
            onClick={loadServers}
            disabled={!isRunning}
          >
            {t('common.refresh')}
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={18} />}
            onClick={() => setShowAddForm(true)}
            disabled={!isRunning}
          >
            {t('mcp.addServer')}
          </Button>
        </div>
      </header>

      {!isRunning ? (
        <EmptyState
          icon={<Server size={48} />}
          title={t('agents.startCortexHint') || t('mcp.noServers')}
          size="sm"
        />
      ) : error ? (
        <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-500">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      ) : servers === null ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>
      ) : servers.length === 0 ? (
        <EmptyState
          icon={<Server size={48} />}
          title={t('mcp.noServers')}
          description={t('mcp.noServersDesc')}
          action={{ label: t('mcp.addServer'), onClick: () => setShowAddForm(true) }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {servers.map((server) => {
            const isExpanded = expandedServer === server.id;
            const tools = toolsCache[server.id];
            return (
              <div
                key={server.id}
                className={cn(
                  'overflow-hidden rounded-lg border border-border bg-card transition-colors',
                  server.state === 'running' && 'border-l-4 border-l-foreground'
                )}
              >
                <div
                  className="flex cursor-pointer items-center gap-3 p-4"
                  onClick={() => {
                    setExpandedServer(isExpanded ? null : server.id);
                    if (!isExpanded && tools === undefined) {
                      void loadTools(server.id);
                    }
                  }}
                >
                  <div className="relative flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                    <Server size={20} />
                    {server.state === 'running' && (
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-foreground">{server.name}</h3>
                    <span className="font-mono text-xs text-muted-foreground">
                      {server.wasm.name}@{server.wasm.version}
                    </span>
                  </div>
                  <ServerStateBadge state={server.state} />
                  {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </div>

                {isExpanded && (
                  <div className="flex flex-col gap-4 border-t border-border bg-muted/30 p-4">
                    <div className="flex gap-2">
                      <Button
                        variant={server.state === 'running' ? 'secondary' : 'success'}
                        size="sm"
                        icon={server.state === 'running' ? <Square size={14} /> : <Play size={14} />}
                        loading={busyServer === server.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          const fn = server.state === 'running'
                            ? cortexClient.stopMcpServer(server.id)
                            : cortexClient.startMcpServer(server.id);
                          setBusyServer(server.id);
                          setError(null);
                          fn.then(loadServers)
                           .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                           .finally(() => setBusyServer(null));
                        }}
                      >
                        {server.state === 'running' ? t('mcp.stop') : t('mcp.start')}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<Trash2 size={14} />}
                        loading={busyServer === server.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!confirm(t('common.confirm') + '?')) return;
                          setBusyServer(server.id);
                          setError(null);
                          cortexClient
                            .deleteMcpServer(server.id)
                            .then(loadServers)
                            .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                            .finally(() => setBusyServer(null));
                        }}
                      >
                        {t('common.delete')}
                      </Button>
                    </div>

                    {server.last_error && (
                      <div className="flex gap-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-red-500">
                        <AlertCircle size={16} className="flex-shrink-0" />
                        <div>
                          <strong className="font-semibold">{t('common.error')}:</strong>
                          <p className="mt-1 text-sm">{server.last_error}</p>
                        </div>
                      </div>
                    )}

                    {tools && tools.length > 0 && (
                      <div className="overflow-hidden rounded-md border border-border bg-card">
                        <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                          <FileCode size={14} />
                          <span>{t('mcpFieldWasmName') === '' ? '' : ''}</span>
                        </div>
                        <ul className="divide-y divide-border text-xs">
                          {tools.map((tool) => (
                            <li key={tool.name} className="px-3 py-2">
                              <code className="font-mono text-foreground">{tool.name}</code>
                              {tool.description && (
                                <p className="mt-0.5 text-muted-foreground">{tool.description}</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="font-mono text-xs text-muted-foreground">
                      sha256: {server.wasm.sha256.slice(0, 12)}…
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={showAddForm}
        onClose={() => setShowAddForm(false)}
        title={t('mcp.addServer')}
        size="md"
      >
        <div className="flex flex-col gap-4">
          <Input
            label={t('mcp.fieldName')}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="filesystem-mcp"
          />
          <Input
            label={t('mcp.fieldWasmName')}
            value={form.wasm_name}
            onChange={(e) => setForm({ ...form, wasm_name: e.target.value })}
            placeholder="fs"
          />
          <Input
            label={t('mcp.fieldWasmVersion')}
            value={form.wasm_version}
            onChange={(e) => setForm({ ...form, wasm_version: e.target.value })}
            placeholder="0.1.0"
          />
          <Input
            label={t('mcp.fieldWasmSha256')}
            value={form.wasm_sha256}
            onChange={(e) => setForm({ ...form, wasm_sha256: e.target.value })}
            placeholder="(留空则使用已上传 wasm 的 sha256)"
          />
          <Input
            label={t('mcp.fieldDescription')}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-500">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}
          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button variant="secondary" onClick={() => setShowAddForm(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={submitting}
              disabled={!form.name || !form.wasm_name || !form.wasm_version}
              onClick={() => {
                setSubmitting(true);
                setError(null);
                const sha = form.wasm_sha256.trim() || 'PLACEHOLDER_WASM_SHA256';
                cortexClient
                  .createMcpServer({
                    name: form.name.trim(),
                    wasm: {
                      name: form.wasm_name.trim(),
                      version: form.wasm_version.trim(),
                      sha256: sha,
                    },
                    ...(form.description.trim() && { description: form.description.trim() }),
                  })
                  .then(() => {
                    setShowAddForm(false);
                    setForm(EMPTY_FORM);
                    loadServers();
                  })
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : String(err))
                  )
                  .finally(() => setSubmitting(false));
              }}
            >
              {t('mcp.addServer')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ServerStateBadge({ state }: { state: McpServerRecord['state'] }) {
  return <StatusBadge status={state === 'running' ? 'running' : state === 'error' ? 'error' : 'stopped'} />;
}
