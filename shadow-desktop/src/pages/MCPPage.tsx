import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Server, Plus, Play, Square, Trash2, AlertCircle,
  Terminal, Globe, FileCode, ChevronDown, ChevronRight,
} from 'lucide-react';
import { Button, Modal, Input, EmptyState } from '../components/ui';
import {
  telencephalonClient,
  type McpServerRecord,
  type McpToolSummary,
} from '../lib/telencephalonClient';
import { cn } from '../lib/utils';
import { useTelencephalonStore } from '../stores/telencephalonStore';

interface FormState {
  name: string;
  description: string;
  // stdio
  command: string;
  args: string;
  env: string;
  // http
  url: string;
  bearer: string;
  // wasm
  wasm_name: string;
  wasm_version: string;
  wasm_sha256: string;
}

const EMPTY_FORM: FormState = {
  name: '', description: '',
  command: '', args: '', env: '',
  url: '', bearer: '',
  wasm_name: '', wasm_version: '', wasm_sha256: '',
};

export function MCPPage() {
  const { t } = useTranslation();
  const cortexStatus = useTelencephalonStore((s) => s.status);
  const [servers, setServers] = useState<McpServerRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyServer, setBusyServer] = useState<string | null>(null);
  const [toolsCache, setToolsCache] = useState<Record<string, McpToolSummary[]>>({});
  // Transport-aware add-server form (stdio | http | wasm). Introduced in
  // commit `1c0c3ec`; the useState declaration was missing so the page
  // threw `ReferenceError: form is not defined` whenever the modal opened.
  type Transport = 'stdio' | 'http' | 'wasm';
  interface ServerForm {
    name: string;
    description: string;
    transport: Transport;
    command: string;
    args: string;
    env: string;
    url: string;
    bearer: string;
    wasm_name: string;
    wasm_version: string;
    wasm_sha256: string;
  }
  const emptyForm = (): ServerForm => ({
    name: '',
    description: '',
    transport: 'stdio',
    command: '',
    args: '',
    env: '',
    url: '',
    bearer: '',
    wasm_name: '',
    wasm_version: '',
    wasm_sha256: '',
  });
  const [form, setForm] = useState<ServerForm>(emptyForm);

  const loadServers = async () => {
    if (cortexStatus !== 'running') { setServers([]); return; }
    setLoading(true); setError(null);
    try {
      const list = await telencephalonClient.listMcpServers();
      setServers(list.servers);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setServers([]);
    } finally { setLoading(false); }
  };

  const loadTools = async (id: string) => {
    try {
      const tools = await telencephalonClient.getMcpServerTools(id);
      setToolsCache((m) => ({ ...m, [id]: tools }));
    } catch { setToolsCache((m) => ({ ...m, [id]: [] })); }
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
          <Button variant="ghost" icon={<Terminal size={18} />} loading={loading}
            onClick={loadServers} disabled={!isRunning}>
            {t('common.refresh')}
          </Button>
          <Button variant="primary" icon={<Plus size={18} />}
            onClick={() => setShowAddForm(true)} disabled={!isRunning}>
            {t('mcp.addServer')}
          </Button>
        </div>
      </header>

      {!isRunning ? (
        <EmptyState icon={<Server size={48} />}
          title={t('agents.startCortexHint') || t('mcp.noServers')} size="sm" />
      ) : error ? (
        <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-500">
          <AlertCircle size={14} /><span>{error}</span>
        </div>
      ) : servers === null ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}...</p>
      ) : servers.length === 0 ? (
        <EmptyState icon={<Server size={48} />} title={t('mcp.noServers')}
          description={t('mcp.noServersDesc')}
          action={{ label: t('mcp.addServer'), onClick: () => setShowAddForm(true) }} />
      ) : (
        <div className="flex flex-col gap-3">
          {servers.map((server) => {
            const isExpanded = expandedServer === server.id;
            const tools = toolsCache[server.id];
            return (
              <div key={server.id}
                className={cn('overflow-hidden rounded-lg border border-border bg-card transition-colors',
                  server.state === 'running' && 'border-l-4 border-l-green-500')}>
                <div className="flex cursor-pointer items-center gap-3 p-4"
                  onClick={() => { setExpandedServer(isExpanded ? null : server.id); if (!isExpanded && tools === undefined) void loadTools(server.id); }}>
                  <div className="relative flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                    <Server size={20} />
                    {server.state === 'running' && (
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-green-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold">{server.name}</h3>
                    {server.transport ? (
                      <span className="text-xs text-muted-foreground">
                        {server.transport.kind === 'stdio' ? `stdio: ${server.transport.command}` :
                         server.transport.kind === 'http' ? `http: ${server.transport.url}` :
                         `wasm: ${server.wasm?.name ?? '—'}`}
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground">
                        {server.wasm?.name ?? '—'}@{server.wasm?.version ?? '—'}
                      </span>
                    )}
                  </div>
                  <StatusBadge state={server.state === 'running' ? 'running' : server.state === 'error' ? 'error' : 'stopped'} />
                  {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </div>

                {isExpanded && (
                  <div className="flex flex-col gap-4 border-t border-border bg-muted/30 p-4">
                    <div className="flex gap-2">
                      <Button variant={server.state === 'running' ? 'secondary' : 'success'} size="sm"
                        icon={server.state === 'running' ? <Square size={14} /> : <Play size={14} />}
                        loading={busyServer === server.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          const fn = server.state === 'running'
                            ? telencephalonClient.stopMcpServer(server.id)
                            : telencephalonClient.startMcpServer(server.id);
                          setBusyServer(server.id); setError(null);
                          fn.then(loadServers).catch((err) => setError(err instanceof Error ? err.message : String(err))).finally(() => setBusyServer(null));
                        }}>
                        {server.state === 'running' ? t('mcp.stop') : t('mcp.start')}
                      </Button>
                      <Button variant="danger" size="sm" icon={<Trash2 size={14} />}
                        loading={busyServer === server.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!confirm(t('common.confirm') + '?')) return;
                          setBusyServer(server.id); setError(null);
                          telencephalonClient.deleteMcpServer(server.id).then(loadServers)
                            .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                            .finally(() => setBusyServer(null));
                        }}>
                        {t('common.delete')}
                      </Button>
                    </div>
                    {server.last_error && (
                      <div className="flex gap-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-red-500">
                        <AlertCircle size={16} className="flex-shrink-0" />
                        <div><strong className="font-semibold">{t('common.error')}:</strong>
                          <p className="mt-1 text-sm">{server.last_error}</p></div>
                      </div>
                    )}
                    {tools && tools.length > 0 && (
                      <div className="overflow-hidden rounded-md border border-border bg-card">
                        <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                          <FileCode size={14} /><span>{t('mcp.tools')}</span>
                        </div>
                        <ul className="divide-y divide-border text-xs">
                          {tools.map((tool) => (
                            <li key={tool.name} className="px-3 py-2">
                              <code className="font-mono text-foreground">{tool.name}</code>
                              {tool.description && <p className="mt-0.5 text-muted-foreground">{tool.description}</p>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={showAddForm} onClose={() => setShowAddForm(false)}
        title={t('mcp.addServer')} size="md">
        <div className="flex flex-col gap-4">
          <Input label={t('mcp.fieldName')} value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="my-mcp-server" />
          <Input label={t('mcp.fieldDescription')} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} />

          {/* transport selector */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
              {t('mcp.transportType')}
            </label>
            <div className="flex gap-2">
              {(['stdio', 'http', 'wasm'] as const).map((tp) => (
                <button key={tp}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                    form.transport === tp
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-foreground/30',
                  )}
                  onClick={() => setForm({ ...form, transport: tp })}
                >
                  {tp === 'stdio' && <Terminal size={12} />}
                  {tp === 'http' && <Globe size={12} />}
                  {tp === 'wasm' && <FileCode size={12} />}
                  {tp.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {form.transport === 'stdio' && (
            <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-3">
              <Input label="Command" value={form.command}
                onChange={(e) => setForm({ ...form, command: e.target.value })}
                placeholder="npx -y @modelcontextprotocol/server-filesystem /path" />
              <Input label="Args (space-separated)" value={form.args}
                onChange={(e) => setForm({ ...form, args: e.target.value })}
                placeholder="--readonly --verbose" />
              <Input label="Env (KEY=VAL, space-separated)" value={form.env}
                onChange={(e) => setForm({ ...form, env: e.target.value })}
                placeholder="API_KEY=xxx DEBUG=1" />
            </div>
          )}

          {form.transport === 'http' && (
            <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-3">
              <Input label="URL" value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="http://localhost:3000/mcp" />
              <Input label="Bearer Token (optional)" value={form.bearer}
                onChange={(e) => setForm({ ...form, bearer: e.target.value })}
                placeholder="token (optional)" />
            </div>
          )}

          {form.transport === 'wasm' && (
            <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-3">
              <Input label="WASM Name" value={form.wasm_name}
                onChange={(e) => setForm({ ...form, wasm_name: e.target.value })} placeholder="fs" />
              <Input label="WASM Version" value={form.wasm_version}
                onChange={(e) => setForm({ ...form, wasm_version: e.target.value })} placeholder="0.1.0" />
              <Input label="WASM SHA256" value={form.wasm_sha256}
                onChange={(e) => setForm({ ...form, wasm_sha256: e.target.value })} />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-500">
              <AlertCircle size={14} /><span>{error}</span>
            </div>
          )}
          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button variant="secondary" onClick={() => setShowAddForm(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" loading={submitting}
              disabled={!form.name?.trim()}
              onClick={() => {
                setSubmitting(true); setError(null);
                telencephalonClient.createMcpServer({
                  name: form.name.trim(),
                  ...(form.description.trim() && { description: form.description.trim() }),
                  ...(form.transport === 'stdio' && {
                    transport: {
                      kind: 'stdio' as const,
                      command: form.command.trim(),
                      args: form.args.trim() ? form.args.trim().split(/\s+/) : [],
                      ...(form.env.trim() && {
                        env: Object.fromEntries(
                          form.env.trim().split(/\s+/).map((pair) => {
                            const eq = pair.indexOf('=');
                            return eq > 0 ? [pair.slice(0, eq), pair.slice(eq + 1)] : [pair, ''];
                          }),
                        ),
                      }),
                    },
                  }),
                  ...(form.transport === 'http' && {
                    transport: {
                      kind: 'http' as const,
                      url: form.url.trim(),
                      ...(form.bearer.trim() && { bearer: form.bearer.trim() }),
                    },
                  }),
                  ...(form.transport === 'wasm' && {
                    wasm: {
                      name: form.wasm_name.trim(),
                      version: form.wasm_version.trim(),
                      sha256: form.wasm_sha256.trim() || 'PLACEHOLDER',
                    },
                  }),
                })
                  .then(() => { setShowAddForm(false); Object.assign(form, EMPTY_FORM); loadServers(); })
                  .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                  .finally(() => setSubmitting(false));
              }}>
              {t('mcp.addServer')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StatusBadge({ state }: { state: string }) {
  const colorMap: Record<string, string> = {
    running: 'bg-green-500/20 text-green-600 border-green-500/30',
    error: 'bg-red-500/20 text-red-600 border-red-500/30',
    stopped: 'bg-gray-500/20 text-gray-600 border-gray-500/30',
  };
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium', colorMap[state] ?? colorMap.stopped)}>
      {state}
    </span>
  );
}