import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Database, Globe, Monitor, Sun, Moon, RefreshCw, Server,
  Edit3, Mic, Save, RotateCcw,
  HardDrive, Shield, Bell, Keyboard, ChevronRight,
  Cpu, Trash2, Plus, Brain, ChevronDown,
  AlertCircle, Boxes, Search, ScanLine, Link2, Unlink, Wand2,
  Sparkles, Settings, Play, Camera, PlugZap, Bluetooth,
} from 'lucide-react';
import { safeInvoke, safeInvokeOrThrow } from '../lib/tauriSafe';
import { isTauri } from '../lib/platform';
import { useThemeStore } from '../stores/themeStore';
import { accentPresets, surfaceOverrides } from '../styles/accent.g';
import { useChatDisplayStore } from '../stores/chatDisplayStore';
import { useTelencephalonStore } from '../stores/telencephalonStore';
import { useAgentStore } from '../stores/agentStore';
import { useShortcutStore } from '../stores/shortcutStore';
import { SHORTCUT_ACTION_IDS } from '../lib/shortcutActions';
import { formatChord, isBareTypingChord } from '../lib/shortcutKeys';
import {
  startGlobalKeyCapture,
  stopGlobalKeyCapture,
  onGlobalKeyCapture,
} from '../lib/globalKeysClient';
import { telencephalonClient, type ScanResult, type InstalledWasmList, type AgentSearchResponse, type McpAgentBinding, type McpServerRecord, type ModelProvider } from '../lib/telencephalonClient';
import { providerListState, type ProviderListState } from '../lib/modelConfigProbe';
import { HfTokenSettings } from '../components/business/HfTokenSettings';
import { IdentityPanel } from '../components/business/IdentityPanel';
import { UpdateChecker } from '../components/business/UpdateChecker';
import { VideoSourcesCard } from '../components/business/VideoSourcesCard';
import { SubsystemPanel } from '../components/business/SubsystemPanel/SubsystemPanel';
import { Button, Badge, EmptyState, Modal } from '../components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { cn } from '../lib/utils';

type SettingsSection = 'service' | 'models' | 'video' | 'ui' | 'shortcuts' | 'data' | 'system' | 'subsystem' | 'integrations';
type AgentSection = 'internal' | 'custom' | 'wasm' | 'external';

const SECTIONS: { id: SettingsSection; icon: typeof Server; labelKey: string }[] = [
  { id: 'service', icon: Server, labelKey: 'settings.section.service' },
  { id: 'models', icon: Cpu, labelKey: 'settings.section.models' },
  { id: 'video', icon: Camera, labelKey: 'settings.section.video' },
  { id: 'shortcuts', icon: Keyboard, labelKey: 'settings.section.shortcuts' },
  { id: 'subsystem', icon: Server, labelKey: 'settings.section.subsystem' },
  { id: 'integrations', icon: PlugZap, labelKey: 'settings.section.integrations' },
  { id: 'ui', icon: Monitor, labelKey: 'settings.section.ui' },
  { id: 'data', icon: Database, labelKey: 'settings.section.data' },
  { id: 'system', icon: Shield, labelKey: 'settings.section.system' },
];

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('service');

  return (
    <div className="flex h-full gap-6 p-6">
      <SettingsSidebar activeSection={activeSection} onSelect={setActiveSection} />
      <main className="flex-1 overflow-y-auto pr-2">
        <SettingsHeader />
        {activeSection === 'service' && <ServiceAndAgentsSection />}
        {activeSection === 'models' && <ModelsSection />}
        {activeSection === 'video' && <VideoSourcesCard />}
        {activeSection === 'shortcuts' && <ShortcutsSection />}
        {activeSection === 'subsystem' && <SubsystemPanel />}
        {activeSection === 'integrations' && <IntegrationsSection />}
        {activeSection === 'ui' && <UISection />}
        {activeSection === 'data' && <DataSection />}
        {activeSection === 'system' && <SystemSection />}
      </main>
    </div>
  );
}

function SettingsHeader() {
  const { t } = useTranslation();
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{t('settings.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('settings.subtitle')}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" icon={<RotateCcw size={16} />}>
          {t('settings.resetAll')}
        </Button>
        <Button variant="primary" size="sm" icon={<Save size={16} />}>
          {t('settings.saveChanges')}
        </Button>
      </div>
    </div>
  );
}

function SettingsSidebar({
  activeSection,
  onSelect,
}: {
  activeSection: SettingsSection;
  onSelect: (section: SettingsSection) => void;
}) {
  const { t } = useTranslation();
  return (
    <aside className="w-[240px] flex-shrink-0">
      <nav className="flex flex-col gap-1">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              // ⚠️ **状态可判** ⇒ ⇒ 侧栏按钮也要语言无关的锚点
              // ⇒ ⇒ （文案随语言走 ⇒ ⇒ 用文案定位会脆）
              data-testid={`settings-section-${section.id}`}
              onClick={() => onSelect(section.id)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-foreground/10 text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              <Icon size={18} />
              <span className="flex-1 text-left">{t(section.labelKey)}</span>
              {isActive && <ChevronRight size={14} />}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function SettingsCard({
  title,
  description,
  icon,
  children,
  footer,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-border bg-card">
      {title && (
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          {icon && <div className="text-muted-foreground">{icon}</div>}
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
      )}
      <div className="p-5">{children}</div>
      {footer && (
        <div className="border-t border-border bg-muted/30 px-5 py-3">
          {footer}
        </div>
      )}
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && (
          <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
        )}
      </div>
      <div className="flex items-center gap-2">{children}</div>
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


// ─── Service & Agents Section ──────────────────────────────────────────────────

function ServiceAndAgentsSection() {
  const { t } = useTranslation();
  const {
    agents, addAgent, removeAgent, updateAgent,
  } = useAgentStore();
  const cortexStatus = useTelencephalonStore((s) => s.status);
  const cortexLobes = useTelencephalonStore((s) => s.lobes);
  const refreshStatus = useTelencephalonStore((s) => s.refreshStatus);
  const refreshLobes = useTelencephalonStore((s) => s.refreshLobes);
  const supervisor = useTelencephalonStore((s) => s.supervisor);

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
  // ⚠️ **「读不到」不是「没有」** ⇒ ⇒ 供应商列表读失败时**不许**把它
  // ⇒ ⇒ 显示成空 ⇒ ⇒（以前 `catch { setProviders([]) }` ⇒ ⇒ 界面说
  // ⇒ ⇒ 「一个供应商都没有」⇒ ⇒ 用户于是去**重复配置已经配好的东西**
  // ⇒ ⇒ 而真正的原因（门关着 / 端脑没起）**一个字都没人告诉他**）。
  const [providersState, setProvidersState] = useState<ProviderListState>('ready');

  const fetchProviders = useCallback(async () => {
    try {
      const result = await telencephalonClient.listProviders();
      setProviders(result);
      setProvidersState('ready');
    } catch {
      setProviders([]);
      setProvidersState('unreadable');
    }
  }, []);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

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
      const result = await telencephalonClient.scanExternalAgents();
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
      await telencephalonClient.syncExternalAgent(providerId);
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
      const result = await telencephalonClient.listInstalledWasm();
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
      await telencephalonClient.updateLobeConfig(agentName, { model_id: modelId });
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
      const resp = await telencephalonClient.searchAgents({ skill, q });
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
      await telencephalonClient.deleteWasm(name, version);
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
    const allAgents = [...internalLobes, ...externalLobes];
    const entries = await Promise.all(
      allAgents.map(async (a) => {
        try {
          const resp = await telencephalonClient.listMcpServersForAgent(a.name);
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
        await telencephalonClient.unbindMcpServerFromAgent(agentName, serverId);
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
        const list = await telencephalonClient.listMcpServers();
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
        await telencephalonClient.bindMcpServerToAgent(bindModalAgent, serverId);
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
      {/* Agent Name & Wake Word Settings */}
      <AgentNameSettings />
      <WakeWordSettings />

      {/* Cortex supervisor (auto-restart on crash) */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <Shield size={16} className="text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">{t('services.supervisor')}</h3>
          <Badge variant={supervisor.enabled ? 'success' : 'secondary'} size="sm">
            {supervisor.enabled ? t('services.supervisorEnabled') : t('services.supervisorDisabled')}
          </Badge>
          {supervisor.restartCount > 0 && (
            <Badge variant="warning" size="sm">
              {t('services.restartCount', {
                count: supervisor.restartCount,
                plural: supervisor.restartCount === 1 ? '' : 's',
              })}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t('services.supervisorHelp')}</p>
      </div>

      {/* Agent Search */}
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

      {/* Internal Agents */}
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
                  providersUnreadable={providersState === 'unreadable'}
                />
              ))}
            </div>
          )
        ) : (
          <EmptyState icon={<Server size={48} />} title={t('agents.startCortexHint')} size="sm" />
        )}
      </SectionCard>

      {/* Custom Agents */}
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

      {/* WASM Agents */}
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

      {/* External Agents */}
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
                providersUnreadable={providersState === 'unreadable'}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {/* Modals */}
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

// ─── Agent Sub-components ─────────────────────────────────────────────────────

function AgentNameSettings() {
  const { t } = useTranslation();
  const [agentName, setAgentName] = useState(() => {
    return localStorage.getItem('shadow_agent_name') || 'Shadow';
  });
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState(agentName);

  const handleSave = () => {
    if (tempName.trim()) {
      localStorage.setItem('shadow_agent_name', tempName.trim());
      setAgentName(tempName.trim());
    }
    setIsEditing(false);
  };

  return (
    <SettingsCard
      title={t('settings.agentName')}
      description={t('settings.agentNameDesc')}
      icon={<Edit3 size={20} />}
    >
      <SettingRow label={t('settings.agentNameLabel')}>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="w-[200px] rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
              autoFocus
            />
            <Button size="sm" onClick={handleSave}>{t('common.save')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>{t('common.cancel')}</Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{agentName}</span>
            <Button size="sm" variant="ghost" onClick={() => { setTempName(agentName); setIsEditing(true); }}>
              {t('common.edit')}
            </Button>
          </div>
        )}
      </SettingRow>
      <p className="text-xs text-muted-foreground">{t('settings.agentNameHint')}</p>
    </SettingsCard>
  );
}

function WakeWordSettings() {
  const { t } = useTranslation();
  const [wakeWords, setWakeWords] = useState<string[]>(() => {
    const saved = localStorage.getItem('shadow_wake_words');
    return saved ? JSON.parse(saved) : ['hey shadow', '你好影'];
  });
  const [newWord, setNewWord] = useState('');

  const persistWakeWords = (words: string[]) => {
    setWakeWords(words);
    localStorage.setItem('shadow_wake_words', JSON.stringify(words));
  };

  const addWakeWord = () => {
    const trimmed = newWord.trim();
    if (trimmed && !wakeWords.includes(trimmed)) {
      persistWakeWords([...wakeWords, trimmed]);
      setNewWord('');
    }
  };

  const removeWakeWord = (idx: number) => {
    persistWakeWords(wakeWords.filter((_: string, i: number) => i !== idx));
  };

  return (
    <SettingsCard
      title={t('settings.wakeWords')}
      description={t('settings.wakeWordsDesc')}
      icon={<Mic size={20} />}
    >
      <div className="flex flex-wrap gap-2">
        {wakeWords.map((word: string, idx: number) => (
          <span
            key={idx}
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground/10 px-3 py-1 text-sm font-medium text-foreground"
          >
            "{word}"
            <button
              type="button"
              onClick={() => removeWakeWord(idx)}
              className="ml-1 text-muted-foreground hover:text-foreground"
              aria-label={t('common.delete')}
            >
              ×
            </button>
          </span>
        ))}
        <span className="rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted-foreground">
          {t('settings.wakeWordsCount', { count: wakeWords.length })}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={newWord}
          onChange={(e) => setNewWord(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addWakeWord()}
          placeholder={t('settings.wakeWordsPlaceholder')}
          className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
        />
        <Button size="sm" onClick={addWakeWord} disabled={!newWord.trim()}>
          {t('common.add')}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t('settings.wakeWordsHint')}</p>
    </SettingsCard>
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
  providersUnreadable,
}: {
  lobe: import('../lib/telencephalonClient').LobeInfo;
  showUnlink?: boolean;
  mcpBindings?: McpAgentBinding[];
  onUnbindMcp?: (serverId: string) => void;
  onOpenMcpBind?: (agentName: string) => void;
  onModelChange?: (agentName: string, modelId: string) => void;
  providers?: import('../lib/telencephalonClient').ModelProvider[];
  // ⚠️ **「读不到」不是「没有」** ⇒ ⇒ 供应商列表读失败时 ⇒ ⇒ 这个下拉
  // ⇒ ⇒ 不许只剩下「不设默认模型」一个选项（那等于在告诉用户「你没模型」）
  // ⇒ ⇒ 而真正的原因（门关着 / 端脑没起）一个字都没人告诉他。
  providersUnreadable?: boolean;
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('agents.defaultModel')}:</span>
          <select
            className="flex-1 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground"
            value={config?.model_id as string || ''}
            onChange={(e) => onModelChange(lobe.name, e.target.value)}
            disabled={providersUnreadable}
          >
            {providersUnreadable ? (
              <option value="">{t('agents.providersUnreadable')}</option>
            ) : (
              <>
                <option value="">{t('agents.noDefaultModel')}</option>
                {providers.map((p) => (
                  <optgroup key={p.id} label={p.name}>
                    {p.models.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </optgroup>
                ))}
              </>
            )}
          </select>
          {providersUnreadable && (
            <span className="text-xs text-muted-foreground">{t('agents.providersUnreadableHint')}</span>
          )}
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
      const result = await telencephalonClient.generateAgentDescription(systemPrompt);
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
      const result = await telencephalonClient.createPromptAgent({
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

// ─── Integrations Section ────────────────────────────────────────────────────

function IntegrationsSection() {
  const { t } = useTranslation();
  const [feishuEnabled, setFeishuEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void safeInvoke<boolean>('document_feishu_enabled')
      .then((v) => { if (!cancelled) setFeishuEnabled(v); })
      .catch((e: unknown) => {
        if (!cancelled) {
          setFeishuEnabled(false);
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => { cancelled = true; };
  }, []);

  const toggle = async (next: boolean) => {
    setSaving(true);
    setError(null);
    try {
      await safeInvoke('document_set_feishu_enabled', { on: next });
      setFeishuEnabled(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SettingsCard
        title={t('conversation.integrations.title')}
        description={t('conversation.integrations.description')}
        icon={<PlugZap size={20} />}
      >
        <div className="flex items-center justify-between gap-4 py-1">
          <div className="flex-1">
            <div className="text-sm font-medium text-foreground">
              {t('conversation.integrations.feishu.title')}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('conversation.integrations.feishu.description')}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/80">
              {t('conversation.integrations.feishu.runtimeNote')}
            </p>
          </div>
          <Button
            variant={feishuEnabled ? 'secondary' : 'primary'}
            size="sm"
            disabled={saving || feishuEnabled === null}
            onClick={() => { void toggle(!feishuEnabled); }}
          >
            {saving
              ? '…'
              : feishuEnabled
                ? t('conversation.integrations.feishu.disable')
                : t('conversation.integrations.feishu.enable')}
          </Button>
        </div>
        {error && (
          <p className="mt-2 text-xs text-destructive">{error}</p>
        )}
      </SettingsCard>
    </div>
  );
}

// ─── UI Section ───────────────────────────────────────────────────────────────

function UISection() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme, appearance, setAppearance } = useThemeStore();
  const showTokenStats = useChatDisplayStore((s) => s.showTokenStats);
  const setShowTokenStats = useChatDisplayStore((s) => s.setShowTokenStats);

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  const accentLabel = (id: string): string => {
    switch (id) {
      case 'slate':
        return t('settings.accentSlate');
      case 'indigo':
        return t('settings.accentIndigo');
      case 'cyan':
        return t('settings.accentCyan');
      case 'emerald':
        return t('settings.accentEmerald');
      case 'amber':
        return t('settings.accentAmber');
      case 'rose':
        return t('settings.accentRose');
      default:
        return t('settings.accentNeutral');
    }
  };

  const surfaceLabel = (hex: string | null): string => {
    if (!hex) return t('settings.followTheme');
    switch (hex.toUpperCase()) {
      case '#0A0A0B':
        return t('settings.surfaceInk');
      case '#18181B':
        return t('settings.surfaceDeep');
      case '#F4F4F5':
        return t('settings.surfaceNeutral');
      default:
        return t('settings.surfaceLight');
    }
  };

  return (
    <div>
      <SettingsCard
        title={t('settings.appearance')}
        description={t('settings.appearanceDesc')}
        icon={<Monitor size={20} />}
      >
        <SettingRow label={t('settings.themeLabel')}>
          <div className="flex gap-2">
            <Button
              variant={theme === 'light' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme('light')}
              icon={<Sun size={14} />}
            >
              {t('settings.light')}
            </Button>
            <Button
              variant={theme === 'dark' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme('dark')}
              icon={<Moon size={14} />}
            >
              {t('settings.dark')}
            </Button>
          </div>
        </SettingRow>

        <SettingRow
          label={t('settings.accentColor')}
          description={t('settings.accentColorDesc')}
        >
          <div className="flex flex-wrap gap-2">
            {accentPresets.map((preset) => {
              const selected =
                preset.hex.toUpperCase() === appearance.accentSeed.toUpperCase();
              return (
                <button
                  key={preset.id}
                  type="button"
                  title={accentLabel(preset.id)}
                  aria-label={accentLabel(preset.id)}
                  aria-pressed={selected}
                  onClick={() => setAppearance({ accentSeed: preset.hex })}
                  className={cn(
                    'h-7 w-7 rounded-full border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected
                      ? 'scale-110 border-foreground'
                      : 'border-transparent hover:scale-105',
                  )}
                  style={{ backgroundColor: preset.hex }}
                />
              );
            })}
          </div>
        </SettingRow>

        <SettingRow
          label={t('settings.glassIntensity')}
          description={t('settings.glassIntensityDesc')}
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={appearance.glassIntensity}
              onChange={(e) =>
                setAppearance({ glassIntensity: Number(e.target.value) })
              }
              className="h-1 w-40 cursor-pointer appearance-none rounded-full bg-muted accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('settings.glassIntensity')}
            />
            <span className="w-16 text-right text-xs text-muted-foreground">
              {appearance.glassIntensity <= 0.01
                ? t('settings.glassOff')
                : `${Math.round(appearance.glassIntensity * 100)}%`}
            </span>
          </div>
        </SettingRow>

        <SettingRow
          label={t('settings.dialogBackground')}
          description={t('settings.dialogBackgroundDesc')}
        >
          <div className="flex flex-wrap gap-2">
            <Button
              variant={appearance.surfaceOverride ? 'outline' : 'default'}
              size="sm"
              onClick={() => setAppearance({ surfaceOverride: null })}
            >
              {t('settings.followTheme')}
            </Button>
            {surfaceOverrides.map((option) => (
              <Button
                key={option.id}
                variant={
                  appearance.surfaceOverride?.toUpperCase() === option.hex
                    ? 'default'
                    : 'outline'
                }
                size="sm"
                onClick={() => setAppearance({ surfaceOverride: option.hex })}
              >
                {surfaceLabel(option.hex)}
              </Button>
            ))}
          </div>
        </SettingRow>
      </SettingsCard>

      <SettingsCard
        title={t('settings.tokenStats.title')}
        description={t('settings.tokenStats.desc')}
        icon={<Sparkles size={20} />}
      >
        <SettingRow
          label={t('settings.tokenStats.label')}
          description={t('settings.tokenStats.help')}
        >
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer rounded border-border bg-background accent-primary"
              onChange={(e) => setShowTokenStats(e.target.checked)}
              checked={showTokenStats}
              data-testid="settings-show-token-stats"
            />
            <span className="text-xs text-muted-foreground">
              {showTokenStats ? t('settings.enabled') : t('settings.disabled')}
            </span>
          </label>
        </SettingRow>
      </SettingsCard>

      <SettingsCard
        title={t('settings.language')}
        description={t('settings.languageDesc')}
        icon={<Globe size={20} />}
      >
        <SettingRow label={t('settings.languageLabel')}>
          <Select value={i18n.language} onValueChange={changeLanguage}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zh-CN">{t('settings.zh-CN')}</SelectItem>
              <SelectItem value="en-US">{t('settings.en-US')}</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingsCard>
    </div>
  );
}

// ─── Shortcuts Section ────────────────────────────────────────────────────────

/**
 * Global shortcut bindings — keyboard chords and Mi Bluetooth remote
 * buttons. Binding capture runs through the Rust low-level keyboard
 * hook (gk_start_capture / gk-capture events), so remote media keys and
 * navigation keys are recorded exactly like ordinary chords, with the
 * app focused or not. Escape always cancels; bare typing keys need an
 * explicit confirm because they are swallowed system-wide once bound.
 */
export function ShortcutsSection() {
  const { t, i18n } = useTranslation();
  const bindings = useShortcutStore((s) => s.bindings);
  const setBinding = useShortcutStore((s) => s.setBinding);
  const clearBinding = useShortcutStore((s) => s.clearBinding);
  const [capturingAction, setCapturingAction] = useState<string | null>(null);
  const [pendingRisky, setPendingRisky] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const unlistenCaptureRef = useRef<(() => void) | null>(null);

  const teardownCapture = useCallback(async () => {
    unlistenCaptureRef.current?.();
    unlistenCaptureRef.current = null;
    await stopGlobalKeyCapture();
  }, []);

  const handleCapturedChord = useCallback(
    async (actionId: string, chord: string) => {
      if (chord === 'Escape') {
        await teardownCapture();
        setCapturingAction(null);
        return;
      }
      const current = useShortcutStore.getState().bindings;
      const holder = Object.entries(current).find(
        ([id, c]) => id !== actionId && c === chord,
      );
      if (isBareTypingChord(chord)) {
        // Disarm capture first: otherwise the hook would swallow the
        // Enter/click that confirms this dialog.
        await teardownCapture();
        setPendingRisky(chord);
        return;
      }
      await teardownCapture();
      setCapturingAction(null);
      setBinding(actionId, chord);
      if (holder) {
        setNotice(
          t('shortcuts.stoleNotice', {
            action: t(`shortcuts.actions.${holder[0]}.label`),
          }),
        );
      }
    },
    [setBinding, t, teardownCapture],
  );

  const beginCapture = useCallback(
    async (actionId: string) => {
      setNotice('');
      setPendingRisky(null);
      setCapturingAction(actionId);
      // Register the capture listener before arming the hook so an
      // immediate keypress cannot fall through the gap.
      unlistenCaptureRef.current?.();
      unlistenCaptureRef.current = await onGlobalKeyCapture((chord) => {
        void handleCapturedChord(actionId, chord);
      });
      await startGlobalKeyCapture();
    },
    [handleCapturedChord],
  );

  const confirmRiskyBinding = useCallback(() => {
    if (!capturingAction || !pendingRisky) return;
    setBinding(capturingAction, pendingRisky);
    setNotice(t('shortcuts.riskyBound'));
    setPendingRisky(null);
    setCapturingAction(null);
  }, [capturingAction, pendingRisky, setBinding, t]);

  const handleClear = useCallback(
    (actionId: string) => {
      clearBinding(actionId);
      setNotice('');
    },
    [clearBinding],
  );

  // Unmount mid-capture (section switch): never leave the global hook
  // swallowing every key.
  useEffect(() => {
    return () => {
      unlistenCaptureRef.current?.();
      void stopGlobalKeyCapture();
    };
  }, []);

  return (
    <div>
      <SettingsCard
        title={t('shortcuts.title')}
        description={t('shortcuts.desc')}
        icon={<Keyboard size={20} />}
      >
        <div className="flex flex-col" data-testid="shortcut-list">
          {SHORTCUT_ACTION_IDS.map((id) => {
            const chord = bindings[id] ?? '';
            const isCapturing = capturingAction === id;
            return (
              <div
                key={id}
                className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-b-0"
                data-testid={`shortcut-row-${id}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {t(`shortcuts.actions.${id}.label`)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(`shortcuts.actions.${id}.desc`)}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {chord ? (
                    <span
                      className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs text-foreground"
                      data-testid={`shortcut-chord-${id}`}
                    >
                      {formatChord(chord, i18n.language)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t('shortcuts.unbound')}
                    </span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void beginCapture(id)}
                    disabled={capturingAction !== null && !isCapturing}
                    data-testid={`shortcut-capture-${id}`}
                  >
                    {isCapturing ? t('shortcuts.capturing') : t('shortcuts.capture')}
                  </Button>
                  {chord && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleClear(id)}
                      data-testid={`shortcut-clear-${id}`}
                    >
                      {t('shortcuts.clear')}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {notice && (
          <p className="mt-3 text-xs text-muted-foreground" data-testid="shortcut-notice">
            {notice}
          </p>
        )}
      </SettingsCard>

      <SettingsCard
        title={t('shortcuts.remoteHelpTitle')}
        description={t('shortcuts.remoteHelp')}
        icon={<Bluetooth size={20} />}
      >
        <p className="text-sm text-muted-foreground">{t('shortcuts.remoteHelpHint')}</p>
      </SettingsCard>

      <Modal
        isOpen={capturingAction !== null}
        onClose={() => {
          void teardownCapture();
          setCapturingAction(null);
        }}
        title={t('shortcuts.captureTitle')}
        size="sm"
      >
        <div className="flex flex-col items-center gap-3 py-6">
          <Keyboard size={32} className="text-muted-foreground" />
          <p className="text-sm text-foreground">{t('shortcuts.capturePrompt')}</p>
          <p className="text-xs text-muted-foreground">{t('shortcuts.captureCancelHint')}</p>
        </div>
      </Modal>

      <Modal
        isOpen={pendingRisky !== null}
        onClose={() => {
          setPendingRisky(null);
          setCapturingAction(null);
        }}
        title={t('shortcuts.riskyTitle')}
        size="sm"
      >
        <p className="text-sm text-foreground">
          {t('shortcuts.riskyDesc', {
            chord: pendingRisky ? formatChord(pendingRisky, i18n.language) : '',
          })}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPendingRisky(null);
              setCapturingAction(null);
            }}
            data-testid="shortcut-risky-cancel"
          >
            {t('shortcuts.cancel')}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={confirmRiskyBinding}
            data-testid="shortcut-risky-confirm"
          >
            {t('shortcuts.confirm')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// ─── Data Section ─────────────────────────────────────────────────────────────

function DataSection() {
  return (
    <div>
      <HippocampusStorageCard />

      <HfTokenSettings onSaved={() => {}} />

      <IdentityPanel />
    </div>
  );
}

/**
 * Where the hippocampus (long-term memory) keeps its Lance data.
 *
 * ⚠️ The path shown here is the **real** one — the desktop asks the
 * hippocampus itself (the same rule its storage layer uses) instead of
 * printing a placeholder. The old footer said `~/.hippocampus`, a path
 * that does not exist on any machine: the interface claimed a location
 * nothing wrote to.
 */
type HippocampusStorage = {
  /** What the user picked, if anything. */
  configured: string | null;
  /** Where the memory actually is (or will be, after a restart). */
  effective: string;
  /** The platform default the hippocampus itself resolves to. */
  defaultRoot: string;
  /** Whether that directory is on disk right now. */
  exists: boolean;
  /** The environment points at a non-local store. */
  remote: boolean;
  /** The configured root turned out to be unusable at boot. */
  degraded: boolean;
  /** Why it was unusable (technical detail). */
  degradedReason: string | null;
  /** The setting differs from what this launch is using. */
  pendingRestart: boolean;
};

export function HippocampusStorageCard() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<HippocampusStorage | null>(null);
  const [draft, setDraft] = useState('');
  const [unreadable, setUnreadable] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      // ⚠️ `safeInvoke` swallows the error and returns a fallback — that
      // would turn "cannot read it" into "there is nothing there",
      // which is exactly the shape this card is fixing.
      const res = await safeInvokeOrThrow<HippocampusStorage>(
        'get_hippocampus_storage',
      );
      setInfo(res);
      setDraft(res.configured ?? '');
      setUnreadable(false);
      setError('');
    } catch {
      setUnreadable(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (next: string | null) => {
    setBusy(true);
    try {
      const res = await safeInvokeOrThrow<HippocampusStorage>(
        'set_hippocampus_storage',
        { dir: next },
      );
      setInfo(res);
      setDraft(res.configured ?? '');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const dirty = info
    ? draft.trim() === ''
      ? info.configured !== null
      : draft.trim() !== info.configured
    : false;

  return (
    <SettingsCard
      title={t('settings.memoryIntegration')}
      description={t('settings.memoryIntegrationDesc')}
      icon={<Database size={20} />}
      footer={
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <HardDrive size={12} />
          {unreadable ? (
            <span>{t('settings.hippocampusStorageUnreadable')}</span>
          ) : info ? (
            <span className="break-all font-mono" title={info.effective}>
              {info.effective}
            </span>
          ) : (
            <span>…</span>
          )}
        </div>
      }
    >
      <SettingRow label={t('settings.statusLabel')}>
        <span className="rounded-full bg-green-500/15 px-3 py-0.5 text-xs font-medium text-green-500">
          {t('settings.connected')}
        </span>
      </SettingRow>

      <SettingRow
        label={t('settings.storagePath')}
        description={t('settings.hippocampusStorageHint')}
      >
        <div className="flex w-full items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={info?.defaultRoot ?? ''}
            disabled={unreadable || busy}
            className="font-mono text-xs"
            data-testid="hippocampus-storage-path"
          />
          <Button
            size="sm"
            onClick={() => void save(draft.trim() === '' ? null : draft.trim())}
            disabled={!dirty || busy}
            data-testid="hippocampus-storage-save"
          >
            {t('common.save')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void save(null)}
            disabled={busy || (info?.configured ?? null) === null}
            data-testid="hippocampus-storage-reset"
          >
            {t('settings.reset')}
          </Button>
        </div>
      </SettingRow>
      {info?.degraded && (
        <p
          className="mt-2 text-sm text-destructive"
          data-testid="hippocampus-storage-degraded"
        >
          {t('settings.hippocampusStorageDegraded')}
          {info.degradedReason ? `: ${info.degradedReason}` : ''}
        </p>
      )}
      {info?.pendingRestart && !info.degraded && (
        <p
          className="mt-2 text-xs text-muted-foreground"
          data-testid="hippocampus-storage-pending"
        >
          {t('settings.hippocampusStoragePending')}
        </p>
      )}
      {error && (
        <p
          className="mt-2 text-sm text-destructive"
          data-testid="hippocampus-storage-error"
        >
          {t('common.error')}: {error}
        </p>
      )}
    </SettingsCard>
  );
}

// ─── Models Section ───────────────────────────────────────────────────────────

function ModelsSection() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [loading, setLoading] = useState(false);
  // ⚠️ **「读不到」不是「没有」** ⇒ ⇒ 这一处的 `catch { setProviders([]) }`
  // ⇒ ⇒ 以前把「门关着 / 端脑没起」显示成「暂无模型供应商」⇒ ⇒
  // ⇒ ⇒ 用户看见「没有」⇒ ⇒ 去**重新配一遍** ⇒ ⇒ 而真正的原因没人说。
  const [providersState, setProvidersState] = useState<ProviderListState>('ready');

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const result = await telencephalonClient.listProviders();
      setProviders(result);
      setProvidersState('ready');
    } catch {
      setProviders([]);
      setProvidersState('unreadable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

  // ⚠️ **三态**：读到了（可能为空）/ 读到了但是空的 / 读不到
  // ⇒ ⇒ 「读不到」**不许**落到「暂无模型供应商」那张皮上。
  const listState = providerListState(providers, providersState === 'unreadable');

  return (
    <div>
      <SettingsCard
        title={t('settings.modelProviders')}
        description={t('settings.modelProvidersDesc')}
        icon={<Cpu size={20} />}
        footer={
          <div className="flex items-center justify-between">
            <div
              data-testid="provider-count"
              data-state={providersState === 'unreadable' ? 'unknown' : 'known'}
              className="text-xs text-muted-foreground"
            >
              {providersState === 'unreadable'
                ? t('settings.providersCountUnknown')
                : t('settings.providersCount', { count: providers.length })}
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void fetchProviders()}
              disabled={loading}
              icon={<RefreshCw size={14} className={cn(loading && 'animate-spin')} />}
            >
              {t('settings.refresh')}
            </Button>
          </div>
        }
      >
        {listState === 'unreadable' ? (
          // ⚠️⚠️ **「读不到」不是「没有」** ⇒ ⇒ 这一格**不许**显示
          // ⚠️⚠️ 「暂无模型供应商」⇒ ⇒ 那会让用户去**重复配置已经配好的东西**
          // ⚠️⚠️ ⇒ ⇒ 而真正的原因（门关着 / 端脑没起）**一个字都没人告诉他**。
          // ⚠️ **状态可判**（机器不看文案）⇒ ⇒ data-state 写死**这一档**
          // ⇒ ⇒ 它**不可能**与走出来的分支走偏 ⇒ ⇒ 而文案会随语言变。
          <div
            data-testid="provider-list-state"
            data-state="unreadable"
            className="flex flex-col items-center gap-2 py-8 text-center"
          >
            <AlertCircle size={32} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('settings.providersUnreadable')}</p>
            <p className="text-xs text-muted-foreground">{t('settings.providersUnreadableHint')}</p>
          </div>
        ) : listState === 'empty' ? (
          <div
            data-testid="provider-list-state"
            data-state="empty"
            className="flex flex-col items-center gap-2 py-8 text-center"
          >
            <Cpu size={32} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('settings.noProviders')}</p>
            <p className="text-xs text-muted-foreground">{t('settings.addProviderHint')}</p>
          </div>
        ) : (
          <div
            data-testid="provider-list-state"
            data-state="ready"
            className="grid grid-cols-1 gap-2 md:grid-cols-2"
          >
            {providers.map((provider) => (
              <div
                key={provider.id}
                className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Cpu size={14} className="flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{provider.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{provider.provider_type}</div>
                  </div>
                </div>
                <Badge variant="secondary">
                  {provider.models.length > 0 ? `${provider.models.length} models` : t('settings.disabled')}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        title={t('settings.addProvider')}
        description={t('settings.addProviderDesc')}
        icon={<Plus size={20} />}
      >
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {['openai', 'anthropic', 'deepseek', 'ollama'].map((type) => (
            <Button key={type} variant="outline" size="sm">
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </Button>
          ))}
        </div>
      </SettingsCard>
    </div>
  );
}

// ─── System Section ───────────────────────────────────────────────────────────

function SystemSection() {
  const { t } = useTranslation();
  return (
    <div>
      {isTauri() && <UpdateChecker />}
      {isTauri() && (
        <SettingsCard
          title={t('settings.systemTray')}
          description={t('settings.systemTrayDesc')}
          icon={<Monitor size={20} />}
        >
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" onClick={() => safeInvoke('show_window')} icon={<Monitor size={16} />}>
              {t('settings.showWindow')}
            </Button>
            <Button variant="secondary" onClick={() => safeInvoke('hide_window')} icon={<Bell size={16} />}>
              {t('settings.hideWindow')}
            </Button>
            <Button variant="secondary" onClick={() => safeInvoke('minimize_window')} icon={<Keyboard size={16} />}>
              {t('settings.minimize')}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t('settings.trayHint')}</p>
        </SettingsCard>
      )}

      <SettingsCard
        title={t('settings.dangerZone')}
        description={t('settings.dangerZoneDesc')}
        icon={<Trash2 size={20} />}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-foreground">{t('settings.resetAllSettings')}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{t('settings.resetAllSettingsDesc')}</div>
          </div>
          <Button variant="danger" size="sm" icon={<Trash2 size={14} />}>
            {t('settings.reset')}
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
}
