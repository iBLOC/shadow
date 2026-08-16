import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus, Trash2, Settings, Play, Square, Brain,
  ChevronDown, ChevronRight, Terminal, RefreshCw, Download,
  AlertCircle, Server, Sparkles, Boxes, Search,
  ScanLine, Link2, Unlink, Wand2,
} from 'lucide-react';
import { Button, Badge, EmptyState, Modal } from '../components/ui';
import { useAgentStore } from '../stores/agentStore';
import { useOpenCodeStore } from '../stores/opencodeStore';
import { useCortexStore } from '../stores/cortexStore';
import { cortexClient, type ScanResult, type InstalledWasmList, type AgentSearchResponse, type McpAgentBinding, type McpServerRecord, type ModelProvider } from '../lib/cortexClient';
import { cn } from '../lib/utils';

type AgentSection = 'internal' | 'custom' | 'wasm' | 'external';

export function AgentsPage() {
  const { t } = useTranslation();
  const {
    agents, addAgent, removeAgent, updateAgent,
  } = useAgentStore();
  const {
    config: opencodeConfig, instances: opencodeInstances, installed: opencodeInstalled, isLoading: isLoadingOpenCode,
    setConfig: setOpenCodeConfig, fetchInstances: fetchOpenCodeInstances, launch: launchOpenCode, stop: stopOpenCode,
    checkInstalled: checkOpenCodeInstalled, install: installOpenCode,
  } = useOpenCodeStore();
  const cortexStatus = useCortexStore((s) => s.status);
  const cortexError = useCortexStore((s) => s.error);
  const cortexBaseUrl = useCortexStore((s) => s.connection.baseUrl);
  const cortexLobes = useCortexStore((s) => s.lobes);
  const refreshStatus = useCortexStore((s) => s.refreshStatus);
  const refreshLobes = useCortexStore((s) => s.refreshLobes);

  const isRunning = cortexStatus === 'running';

  const [expanded, setExpanded] = useState<Record<AgentSection, boolean>>({
    internal: true,
    custom: true,
    wasm: true,
    external: true,
  });
  const [showCreatePrompt, setShowCreatePrompt] = useState(false);
  const [scannedAgents, setScannedAgents] = useState<ScanResult['detected']>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [installedWasm, setInstalledWasm] = useState<InstalledWasmList | null>(null);
  const [loadingWasm, setLoadingWasm] = useState(false);
  const [wasmError, setWasmError] = useState<string | null>(null);
  const [uninstallingWasm, setUninstallingWasm] = useState<string | null>(null);
  const [providers, setProviders] = useState<ModelProvider[]>([]);

  const fetchProviders = useCallback(async () => {
    try {
      const result = await cortexClient.listProviders();
      setProviders(result);
    } catch {
      setProviders([]);
    }
  }, []);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

  useEffect(() => {
    checkOpenCodeInstalled();
    fetchOpenCodeInstances();
  }, [checkOpenCodeInstalled, fetchOpenCodeInstances]);

  const refreshCortex = useCallback(async () => {
    await refreshStatus();
    await refreshLobes();
  }, [refreshStatus, refreshLobes]);

  useEffect(() => {
    void refreshCortex();
    const id = setInterval(refreshCortex, 5000);
    return () => clearInterval(id);
  }, [refreshCortex]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setScanError(null);
    try {
      const result = await cortexClient.scanExternalAgents();
      setScannedAgents(result.detected);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e));
      setScannedAgents([]);
    } finally {
      setScanning(false);
    }
  }, []);

  const handleSyncOne = useCallback(async (providerId: string) => {
    setSyncingId(providerId);
    try {
      await cortexClient.syncExternalAgent(providerId);
      await refreshCortex();
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncingId(null);
    }
  }, [refreshCortex]);

  const loadInstalledWasm = useCallback(async () => {
    setLoadingWasm(true);
    setWasmError(null);
    try {
      const result = await cortexClient.listInstalledWasm();
      setInstalledWasm(result);
    } catch (e) {
      setWasmError(e instanceof Error ? e.message : String(e));
      setInstalledWasm({ count: 0, entries: [] });
    } finally {
      setLoadingWasm(false);
    }
  }, []);

  const handleModelChange = useCallback(async (agentName: string, modelId: string) => {
    try {
      await cortexClient.updateLobeConfig(agentName, { model_id: modelId });
      await refreshCortex();
    } catch (e) {
      console.error('Failed to update model config:', e);
    }
  }, [refreshCortex]);

  const [searchInput, setSearchInput] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [searchResults, setSearchResults] = useState<AgentSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const runAgentSearch = useCallback(async () => {
    const skill = skillInput.trim();
    const q = searchInput.trim();
    if (!skill && !q) {
      setSearchResults(null);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const resp = await cortexClient.searchAgents({ skill, q });
      setSearchResults(resp);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : String(e));
      setSearchResults(null);
    } finally {
      setSearching(false);
    }
  }, [searchInput, skillInput]);

  const handleUninstallWasm = useCallback(async (name: string, version: string) => {
    const key = `${name}@${version}`;
    setUninstallingWasm(key);
    try {
      await cortexClient.deleteWasm(name, version);
      await Promise.all([loadInstalledWasm(), refreshCortex()]);
    } catch (e) {
      setWasmError(e instanceof Error ? e.message : String(e));
    } finally {
      setUninstallingWasm(null);
    }
  }, [loadInstalledWasm, refreshCortex]);

  useEffect(() => {
    if (isRunning) {
      void loadInstalledWasm();
    }
  }, [isRunning, loadInstalledWasm]);


  const internalLobes = useMemo(() => cortexLobes.filter((l) => l.kind === 'native' || l.kind === 'wasm'), [cortexLobes]);
  const externalLobes = useMemo(() => cortexLobes.filter((l) => l.kind === 'external'), [cortexLobes]);
  const [mcpBindingsByAgent, setMcpBindingsByAgent] = useState<Record<string, McpAgentBinding[]>>({});
  const [mcpBindError, setMcpBindError] = useState<string | null>(null);
  const [bindModalAgent, setBindModalAgent] = useState<string | null>(null);
  const [availableMcpServers, setAvailableMcpServers] = useState<McpServerRecord[]>([]);
  const [bindSubmitting, setBindSubmitting] = useState(false);

  const loadMcpBindings = useCallback(async () => {
    if (!isRunning) {
      setMcpBindingsByAgent({});
      return;
    }
    const agents = [...internalLobes, ...externalLobes];
    const entries = await Promise.all(
      agents.map(async (a) => {
        try {
          const resp = await cortexClient.listMcpServersForAgent(a.name);
          return [a.name, resp.bindings] as const;
        } catch {
          return [a.name, []] as const;
        }
      })
    );
    setMcpBindingsByAgent(Object.fromEntries(entries));
  }, [isRunning, internalLobes, externalLobes]);
  useEffect(() => {
    void loadMcpBindings();
  }, [loadMcpBindings]);
  const handleUnbindMcp = useCallback(
    async (agentName: string, serverId: string) => {
      try {
        await cortexClient.unbindMcpServerFromAgent(agentName, serverId);
      } catch (e) {
        setMcpBindError(e instanceof Error ? e.message : String(e));
      } finally {
        await loadMcpBindings();
      }
    },
    [loadMcpBindings]
  );

  const openBindModal = useCallback(
    async (agentName: string) => {
      setBindModalAgent(agentName);
      setMcpBindError(null);
      try {
        const list = await cortexClient.listMcpServers();
        const bound = (mcpBindingsByAgent[agentName] ?? []).map((b) => b.server_id);
        setAvailableMcpServers(
          list.servers.filter((s) => s.state === 'running' && !bound.includes(s.id))
        );
      } catch (e) {
        setMcpBindError(e instanceof Error ? e.message : String(e));
        setAvailableMcpServers([]);
      }
    },
    [mcpBindingsByAgent]
  );

  const submitBind = useCallback(
    async (serverId: string) => {
      if (!bindModalAgent) return;
      setBindSubmitting(true);
      setMcpBindError(null);
      try {
        await cortexClient.bindMcpServerToAgent(bindModalAgent, serverId);
        await loadMcpBindings();
        setBindModalAgent(null);
      } catch (e) {
        setMcpBindError(e instanceof Error ? e.message : String(e));
      } finally {
        setBindSubmitting(false);
      }
    },
    [bindModalAgent, loadMcpBindings]
  );

  const toggle = (k: AgentSection) => setExpanded((prev) => ({ ...prev, [k]: !prev[k] }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1>{t('agents.title')}</h1>
          <p className="subtitle">{t('agents.subtitle')}</p>
        </div>
      </header>

      <CortexStatusBar
        isRunning={isRunning}
        error={cortexError}
        baseUrl={cortexBaseUrl}
        onRefresh={refreshCortex}
      />

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Search size={16} className="text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">{t('agents.searchTitle')}</h3>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-xs text-muted-foreground">{t('agents.searchQueryLabel')}</label>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runAgentSearch();
              }}
              placeholder={t('agents.searchQueryPlaceholder')}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="w-44">
            <label className="mb-1 block text-xs text-muted-foreground">{t('agents.searchSkillLabel')}</label>
            <input
              type="text"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runAgentSearch();
              }}
              placeholder={t('agents.searchSkillPlaceholder')}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <Button variant="primary" onClick={runAgentSearch} loading={searching} disabled={!isRunning}>
            {t('agents.search')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setSearchInput('');
              setSkillInput('');
              setSearchResults(null);
              setSearchError(null);
            }}
          >
            {t('common.cancel')}
          </Button>
        </div>
        {searchError && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-500">
            <AlertCircle size={14} />
            <span>{searchError}</span>
          </div>
        )}
        {searchResults && (
          <div className="mt-3">
            <p className="mb-2 text-xs text-muted-foreground">
              {t('agents.searchResultsCount', { count: searchResults.count })}
            </p>
            {searchResults.agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('agents.searchResultsEmpty')}</p>
            ) : (
              <div className="space-y-2">
                {searchResults.agents.map((a) => (
                  <div key={a.name} className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{a.name}</span>
                      <Badge variant="outline" size="sm">{a.kind}</Badge>
                      <Badge variant="default" size="sm">v{a.version}</Badge>
                      {!a.enabled && <Badge variant="warning" size="sm">{t('agents.disabled')}</Badge>}
                    </div>
                    {a.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{a.description}</p>
                    )}
                    {a.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {a.skills.map((s) => (
                          <Badge key={s} variant="outline" size="sm">{s}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <SectionCard
        title={t('agents.internalAgents')}
        icon={<Brain size={20} />}
        count={internalLobes.length}
        isOpen={expanded.internal}
        onToggle={() => toggle('internal')}
      >
        {isRunning ? (
          internalLobes.length === 0 ? (
            <EmptyState icon={<Brain size={48} />} title={t('agents.noInternal')} size="sm" />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {internalLobes.map((l) => (
                <InternalAgentCard
                  key={l.name}
                  lobe={l}
                  mcpBindings={mcpBindingsByAgent[l.name]}
                  onUnbindMcp={(sid) => handleUnbindMcp(l.name, sid)}
                  onOpenMcpBind={openBindModal}
                  onModelChange={handleModelChange}
                  providers={providers}
                />
              ))}
            </div>
          )
        ) : (
          <EmptyState icon={<Server size={48} />} title={t('agents.startCortexHint')} size="sm" />
        )}
      </SectionCard>

      <SectionCard
        title={t('agents.customAgents')}
        icon={<Wand2 size={20} />}
        count={agents.length}
        isOpen={expanded.custom}
        onToggle={() => toggle('custom')}
        action={
          <Button variant="primary" size="sm" icon={<Plus size={16} />} onClick={() => setShowCreatePrompt(true)}>
            {t('agents.newCustomAgent')}
          </Button>
        }
      >
        {agents.length === 0 ? (
          <EmptyState
            icon={<Wand2 size={48} />}
            title={t('agents.noCustomAgents')}
            description={t('agents.noCustomAgentsDesc')}
            action={{ label: t('agents.newCustomAgent'), onClick: () => setShowCreatePrompt(true) }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((a) => (
              <CustomAgentCard
                key={a.id}
                agent={a}
                onDelete={() => removeAgent(a.id)}
                onToggleStatus={() => updateAgent(a.id, { status: a.status === 'online' ? 'offline' : 'online' })}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={t('agents.wasmAgents')}
        icon={<Boxes size={20} />}
        count={installedWasm?.count ?? 0}
        isOpen={expanded.wasm}
        onToggle={() => toggle('wasm')}
        action={
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={14} />}
            loading={loadingWasm}
            onClick={loadInstalledWasm}
            disabled={!isRunning}
          >
            {t('agents.refresh')}
          </Button>
        }
      >
        {!isRunning ? (
          <EmptyState icon={<Server size={48} />} title={t('agents.startCortexHint')} size="sm" />
        ) : wasmError ? (
          <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-500">
            <AlertCircle size={14} />
            <span>{wasmError}</span>
          </div>
        ) : installedWasm && installedWasm.entries.length === 0 ? (
          <EmptyState
            icon={<Boxes size={48} />}
            title={t('agents.noInstalledWasm')}
            description={t('agents.noInstalledWasmDesc')}
          />
        ) : (
          <div className="space-y-2">
            {installedWasm?.entries.map((entry) => {
              const key = `${entry.name}@${entry.version}`;
              return (
                <div key={key} className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{entry.name}</span>
                      <Badge variant="outline" size="sm">v{entry.version}</Badge>
                      <Badge variant="default" size="sm">{entry.source}</Badge>
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {(entry.size_bytes / 1024).toFixed(1)} KiB · sha256:{entry.sha256.slice(0, 12)}…
                    </div>
                    {entry.source_url && (
                      <div className="font-mono text-xs text-muted-foreground">{entry.source_url}</div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<Trash2 size={14} />}
                    loading={uninstallingWasm === key}
                    onClick={() => handleUninstallWasm(entry.name, entry.version)}
                  >
                    {t('agents.uninstall')}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={t('agents.externalAgents')}
        icon={<Boxes size={20} />}
        count={externalLobes.length}
        isOpen={expanded.external}
        onToggle={() => toggle('external')}
        action={
          <Button
            variant="secondary"
            size="sm"
            icon={<ScanLine size={16} className={cn(scanning && 'animate-spin')} />}
            loading={scanning}
            onClick={handleScan}
          >
            {t('agents.scanExternal')}
          </Button>
        }
      >
        {scanError && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-500">
            <AlertCircle size={14} />
            <span>{scanError}</span>
          </div>
        )}

        {scannedAgents.length > 0 && (
          <div className="mb-4 rounded-md border border-border bg-muted/30 p-4">
            <p className="mb-3 text-sm font-medium text-foreground">{t('agents.scannedAgents')}</p>
            <div className="space-y-2">
              {scannedAgents.map((p) => {
                const already = externalLobes.some((l) => l.name === p.provider_id);
                return (
                  <div key={p.provider_id} className="flex items-center justify-between rounded-md border border-border bg-background p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{p.provider_label}</span>
                        {already && <Badge variant="success" size="sm">{t('agents.synced')}</Badge>}
                        {!p.reachable && p.endpoint && <Badge variant="warning" size="sm">{t('agents.unreachable')}</Badge>}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {p.detected_path}
                        {p.version ? ` · ${p.version}` : ''}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={already ? 'outline' : 'primary'}
                      icon={<Link2 size={14} />}
                      loading={syncingId === p.provider_id}
                      disabled={already}
                      onClick={() => handleSyncOne(p.provider_id)}
                    >
                      {already ? t('agents.synced') : t('agents.sync')}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {externalLobes.length === 0 ? (
          <EmptyState
            icon={<Boxes size={48} />}
            title={t('agents.noExternalAgents')}
            description={t('agents.noExternalAgentsDesc')}
            action={{ label: t('agents.scanExternal'), onClick: handleScan }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {externalLobes.map((lobe) => (
              <InternalAgentCard
                key={lobe.name}
                lobe={lobe}
                showUnlink
                mcpBindings={mcpBindingsByAgent[lobe.name]}
                onUnbindMcp={(sid) => handleUnbindMcp(lobe.name, sid)}
                onOpenMcpBind={openBindModal}
                onModelChange={handleModelChange}
                providers={providers}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={t('agents.openCodeSection')}
        icon={<Terminal size={20} />}
        count={opencodeInstances.length}
        isOpen={expanded.custom}
        onToggle={() => toggle('custom')}
      >
        <p className="text-sm text-muted-foreground">{t('agents.openCodeSubtitle')}</p>
        {!opencodeInstalled ? (
          <div className="mt-3 flex items-center gap-4 rounded-md border border-border bg-muted/30 p-4">
            <Badge variant="warning">{t('agents.notInstalled')}</Badge>
            <Button variant="primary" icon={<Download size={16} />} onClick={installOpenCode} disabled={isLoadingOpenCode}>
              {isLoadingOpenCode ? t('agents.installing') : t('agents.installOpenCode')}
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="success" size="sm" icon={<Play size={14} />} onClick={() => launchOpenCode(opencodeConfig.port ?? 3000)} disabled={isLoadingOpenCode}>
                {t('agents.launchInstance')}
              </Button>
              <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} onClick={fetchOpenCodeInstances} disabled={isLoadingOpenCode}>
                {t('agents.refresh')}
              </Button>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={opencodeConfig.autoLaunch}
                  onChange={(e) => setOpenCodeConfig({ autoLaunch: e.target.checked })}
                  className="h-4 w-4"
                />
                {t('agents.autoLaunch')}
              </label>
            </div>
            {opencodeInstances.length === 0 ? (
              <EmptyState icon={<Terminal size={48} />} title={t('agents.noInstances')} description={t('agents.noInstancesHint')} size="sm" />
            ) : (
              <div className="space-y-2">
                {opencodeInstances.map((inst) => (
                  <div key={inst.id} className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
                    <div className="flex items-center gap-3">
                      <Terminal size={18} />
                      <span className="font-mono text-sm">:{inst.port}</span>
                      <Badge variant={inst.status === 'running' ? 'success' : 'outline'}>{inst.status}</Badge>
                    </div>
                    <Button size="sm" variant="danger" icon={<Square size={14} />} onClick={() => stopOpenCode(inst.id)} disabled={inst.status === 'stopped'}>
                      {t('agents.stopInstance')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {showCreatePrompt && (
        <CreateCustomAgentModal
          onClose={() => setShowCreatePrompt(false)}
          onCreated={(created) => {
            setShowCreatePrompt(false);
            addAgent({
              id: crypto.randomUUID(),
              name: created.name,
              category: 'built-in',
              role: 'executor',
              status: 'online',
              capabilities: created.skills,
              description: created.description ?? '',
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }}
        />
      )}
      {bindModalAgent && (
        <McpBindModal
          agentName={bindModalAgent}
          servers={availableMcpServers}
          onClose={() => setBindModalAgent(null)}
          onBind={submitBind}
          submitting={bindSubmitting}
          error={mcpBindError}
        />
      )}
    </div>
  );
}

function CortexStatusBar({
  isRunning, error, baseUrl, onRefresh,
}: {
  isRunning: boolean;
  error: string | null;
  baseUrl: string;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        <Server size={20} />
        <div>
          <p className="text-sm font-semibold">{t('agents.cortexStatus')}</p>
          <p className="font-mono text-xs text-muted-foreground">{baseUrl}</p>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={isRunning ? 'success' : 'outline'}>{isRunning ? t('agents.cortexRunning') : t('agents.cortexStopped')}</Badge>
        <Button size="icon" variant="ghost" onClick={onRefresh}>
          <RefreshCw size={16} />
        </Button>
      </div>
    </div>
  );
}

function SectionCard({
  title, icon, count, isOpen, onToggle, action, children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3 px-5 py-4">
        <button onClick={onToggle} className="flex flex-1 items-center gap-3 text-left">
          {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          {icon}
          <h2 className="text-base font-semibold">{title}</h2>
          <Badge variant="default">{count}</Badge>
        </button>
        {action}
      </div>
      {isOpen && <div className="border-t border-border p-5">{children}</div>}
    </div>
  );
}

function McpBindingsPanel({
  bindings,
  onUnbind,
}: {
  bindings: McpAgentBinding[];
  onUnbind: (serverId: string) => void;
}) {
  const { t } = useTranslation();
  if (bindings.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">{t('mcpAgentBindings')}: 0</p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">
        {t('mcpAgentBindings')} ({bindings.length})
      </p>
      <div className="flex flex-wrap gap-1">
        {bindings.map((b) => (
          <Badge
            key={b.server_id}
            variant="outline"
            size="sm"
            className="cursor-pointer"
            onClick={() => onUnbind(b.server_id)}
            title={`server: ${b.server_id.slice(0, 8)}…`}
          >
            <span className="font-mono text-xs">{b.server_id.slice(0, 8)}…</span>
          </Badge>
        ))}
      </div>
    </div>
  );
}

function McpBindModal({
  agentName,
  servers,
  onClose,
  onBind,
  submitting,
  error,
}: {
  agentName: string;
  servers: McpServerRecord[];
  onClose: () => void;
  onBind: (serverId: string) => void;
  submitting: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('mcpBindTitle', { agent: agentName })}
      size="md"
    >
      {servers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('mcpBindNoEligible')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {servers.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3"
            >
              <div>
                <span className="text-sm font-medium">{s.name}</span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {s.wasm.name}@{s.wasm.version}
                </span>
              </div>
              <Button
                size="sm"
                variant="primary"
                loading={submitting}
                onClick={() => onBind(s.id)}
              >
                {t('mcpBind')}
              </Button>
            </div>
          ))}
        </div>
      )}
      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-500">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}
    </Modal>
  );
}

function InternalAgentCard({
  lobe, showUnlink, mcpBindings, onUnbindMcp, onOpenMcpBind, onModelChange, providers,
}: {
  lobe: import('../lib/cortexClient').LobeInfo;
  showUnlink?: boolean;
  mcpBindings?: McpAgentBinding[];
  onUnbindMcp?: (serverId: string) => void;
  onOpenMcpBind?: (agentName: string) => void;
  onModelChange?: (agentName: string, modelId: string) => void;
  providers?: import('../lib/cortexClient').ModelProvider[];
}) {
  const { t } = useTranslation();
  const healthy = lobe.health_status === 'healthy';
  const config = lobe.config as Record<string, unknown> | undefined;
  const requiredCaps = (config?.required_capabilities as string[]) || [];
  const matchedModels = (config?.matched_models as Record<string, { model_id: string }>) || {};

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Brain size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{lobe.agent_card.name}</h3>
          <p className="text-xs text-muted-foreground">{lobe.kind} · {lobe.agent_card.metadata.input_modalities.join(', ') || 'text'}</p>
        </div>
        <Badge variant={healthy ? 'success' : 'outline'}>{lobe.health_status}</Badge>
      </div>
      {lobe.agent_card.description && (
        <p className="text-xs text-muted-foreground line-clamp-3">{lobe.agent_card.description}</p>
      )}
      <div className="flex flex-wrap gap-1">
        {lobe.skills.slice(0, 5).map((s) => (
          <Badge key={s} variant="outline" size="sm">{s}</Badge>
        ))}
      </div>
      {requiredCaps.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{t('agents.requiredCapabilities')}:</span>
          <div className="flex flex-wrap gap-1">
            {requiredCaps.map((cap) => (
              <Badge key={cap} variant="secondary" size="sm">{cap}</Badge>
            ))}
          </div>
        </div>
      )}
      {Object.keys(matchedModels).length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{t('agents.matchedModels')}:</span>
          <div className="space-y-1">
            {Object.entries(matchedModels).map(([cap, model]) => (
              <div key={cap} className="flex items-center gap-2 text-xs">
                <Badge variant="outline" size="sm">{cap}</Badge>
                <span className="text-muted-foreground">→</span>
                <span className="font-mono">{model.model_id}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {onModelChange && providers && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('agents.defaultModel')}:</span>
          <select
            className="flex-1 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground"
            value={config?.model_id as string || ''}
            onChange={(e) => onModelChange(lobe.name, e.target.value)}
          >
            <option value="">{t('agents.noDefaultModel')}</option>
            {providers.map((p) => (
              <optgroup key={p.id} label={p.name}>
                {p.models.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}
      {mcpBindings && onUnbindMcp && onOpenMcpBind ? (
        <McpBindingsPanel
          bindings={mcpBindings}
          onUnbind={onUnbindMcp}
        />
      ) : null}
      <div className="flex items-center justify-between border-t border-border pt-2">
        {onOpenMcpBind ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onOpenMcpBind(lobe.name)}
            icon={<Link2 size={12} />}
          >
            {t('mcp.bind')}
          </Button>
        ) : <span />}
        {showUnlink ? (
          <Button size="sm" variant="ghost" icon={<Unlink size={14} />}>
            {t('agents.unlink')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function CustomAgentCard({
  agent, onDelete, onToggleStatus,
}: {
  agent: import('../types').Agent;
  onDelete: () => void;
  onToggleStatus: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-violet-500 text-white">
          <Wand2 size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{agent.name}</h3>
          <span className="text-xs text-muted-foreground">{t('agents.customAgentKind')}</span>
        </div>
        <Badge variant={agent.status === 'online' ? 'success' : 'outline'}>{agent.status}</Badge>
      </div>
      {agent.description && <p className="text-xs text-muted-foreground line-clamp-3">{agent.description}</p>}
      {agent.capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agent.capabilities.slice(0, 5).map((c) => (
            <Badge key={c} variant="outline" size="sm">{c}</Badge>
          ))}
        </div>
      )}
      <div className="flex gap-2 border-t border-border pt-2">
        <Button size="sm" variant="outline" icon={<Play size={12} />} onClick={onToggleStatus}>
          {t('agents.start')}
        </Button>
        <Button size="sm" variant="ghost" icon={<Settings size={12} />} />
        <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={onDelete} />
      </div>
    </div>
  );
}

function CreateCustomAgentModal({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: (created: { name: string; description: string | null; skills: string[] }) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [skills, setSkills] = useState('');
  const [description, setDescription] = useState('');
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [generateDescError, setGenerateDescError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGenerateDescription = useCallback(async () => {
    if (!systemPrompt.trim()) return;
    setGeneratingDesc(true);
    try {
      const result = await cortexClient.generateAgentDescription(systemPrompt);
      setDescription(result.description.trim());
    } catch (e) {
      setGenerateDescError(e instanceof Error ? e.message : String(e));
    } finally {
      setGeneratingDesc(false);
    }
  }, [systemPrompt]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !systemPrompt.trim()) return;
    setIsSubmitting(true);
    try {
      const skillList = skills.split(',').map((s) => s.trim()).filter(Boolean);
      const result = await cortexClient.createPromptAgent({
        name: name.trim(),
        system_prompt: systemPrompt,
        description: description.trim() || undefined,
        skills: skillList,
      });
      onCreated({ name: result.name, description: result.description, skills: result.skills });
    } catch {
    } finally {
      setIsSubmitting(false);
    }
  }, [name, systemPrompt, description, skills, onCreated]);

  return (
    <Modal isOpen onClose={onClose} title={t('agents.newCustomAgent')} size="lg">
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium">{t('agents.fieldName')}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="my-coding-assistant"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{t('agents.fieldSystemPrompt')}</label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={8}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
            placeholder={t('agents.fieldSystemPromptPlaceholder')}
          />
        </div>
        <div className="flex items-end gap-2">
          <button
            type="button"
            disabled={!systemPrompt.trim() || generatingDesc}
            onClick={handleGenerateDescription}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-3 py-1.5 text-xs hover:bg-muted/70 disabled:opacity-50"
          >
            <Sparkles size={12} className={cn(generatingDesc && 'animate-spin')} />
            {generatingDesc ? t('agents.generating') : t('agents.generateDescription')}
          </button>
        </div>
        {generateDescError && (
          <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-500">
            <AlertCircle size={12} />
            <span>{generateDescError}</span>
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium">{t('agents.fieldDescription')}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder={t('agents.fieldDescriptionPlaceholder')}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{t('agents.fieldSkills')}</label>
          <input
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            placeholder={t('agents.fieldSkillsPlaceholder')}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleSubmit} loading={isSubmitting} disabled={!name.trim() || !systemPrompt.trim()}>
            {t('agents.create')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
