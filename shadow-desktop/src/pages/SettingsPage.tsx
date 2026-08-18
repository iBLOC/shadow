import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Database, Globe, Monitor, Sun, Moon, RefreshCw, Server,
  CheckCircle, XCircle, Edit3, Bot, Mic, Save, RotateCcw,
  HardDrive, Network, Shield, Bell, Keyboard, ChevronRight,
  Cpu, Zap, Trash2,
} from 'lucide-react';
import { safeInvoke } from '../lib/tauriSafe';
import { isTauri } from '../lib/platform';
import { useEffect } from 'react';
import { useThemeStore } from '../stores/themeStore';
import { useCortexStore } from '../stores/cortexStore';
import { HfTokenSettings } from '../components/business/HfTokenSettings';
import { UpdateChecker } from '../components/business/UpdateChecker';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { cn } from '../lib/utils';

type SettingsSection = 'service' | 'agent' | 'ui' | 'data' | 'system';

const SECTIONS: { id: SettingsSection; icon: typeof Server; labelKey: string }[] = [
  { id: 'service', icon: Server, labelKey: 'settings.section.service' },
  { id: 'agent', icon: Bot, labelKey: 'settings.section.agent' },
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
        {activeSection === 'service' && <ServiceSection />}
        {activeSection === 'agent' && <AgentSection />}
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

function ServiceSection() {
  const { t } = useTranslation();
  const cortexStatus = useCortexStore((s) => s.status);
  const cortexLobes = useCortexStore((s) => s.lobes);
  const cortexConnection = useCortexStore((s) => s.connection);
  const refreshStatus = useCortexStore((s) => s.refreshStatus);
  const refreshLobes = useCortexStore((s) => s.refreshLobes);
  const startCortex = useCortexStore((s) => s.startCortex);
  const isRefreshing = cortexStatus === 'starting';
  const healthyLobes = cortexLobes.filter((l) => l.health_status === 'healthy').length;

  useEffect(() => {
    void refreshStatus();
    void refreshLobes();
  }, [refreshStatus, refreshLobes]);

  return (
    <div>
      <SettingsCard
        title={t('settings.cortexStatus')}
        description={t('settings.cortexStatusDesc')}
        icon={<Server size={20} />}
        footer={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{t('settings.lobeCount', { total: cortexLobes.length, healthy: healthyLobes })}</span>
            </div>
            <div className="flex items-center gap-2">
              {cortexStatus !== 'running' && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void startCortex()}
                  icon={<Zap size={14} />}
                >
                  {t('settings.startCortex')}
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => { void refreshStatus(); void refreshLobes(); }}
                disabled={isRefreshing}
              >
                <RefreshCw size={16} className={cn(isRefreshing && 'animate-spin')} />
              </Button>
            </div>
          </div>
        }
      >
        <SettingRow label={t('settings.status')}>
          <div className="flex items-center gap-2 text-xs">
            {cortexStatus === 'running' ? (
              <CheckCircle size={14} className="text-green-500" />
            ) : (
              <XCircle size={14} className="text-red-500" />
            )}
            <span className={cortexStatus === 'running' ? 'text-green-500' : 'text-red-500'}>
              {cortexStatus}
            </span>
          </div>
        </SettingRow>
        <SettingRow label={t('settings.endpoint')} description={t('settings.cortexEndpointDesc')}>
          <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
            {cortexConnection.baseUrl}
          </code>
        </SettingRow>
      </SettingsCard>

      <SettingsCard
        title={t('settings.registeredLobes')}
        description={t('settings.registeredLobesDesc')}
        icon={<Network size={20} />}
      >
        {cortexLobes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Bot size={32} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('settings.noLobes')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {cortexLobes.map((lobe) => (
              <div
                key={lobe.name}
                className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Cpu size={14} className="flex-shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{lobe.agent_card.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{lobe.kind}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {lobe.health_status === 'healthy' ? (
                    <CheckCircle size={12} className="text-green-500" />
                  ) : (
                    <XCircle size={12} className="text-muted-foreground" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>
    </div>
  );
}

function AgentSection() {
  return (
    <div>
      <AgentNameSettings />
      <WakeWordSettings />
    </div>
  );
}

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

function UISection() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useThemeStore();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
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

function DataSection() {
  const { t } = useTranslation();
  return (
    <div>
      <SettingsCard
        title={t('settings.memoryIntegration')}
        description={t('settings.memoryIntegrationDesc')}
        icon={<Database size={20} />}
        footer={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <HardDrive size={12} />
            <span>{t('settings.storagePathDefault')}</span>
          </div>
        }
      >
        <SettingRow label={t('settings.statusLabel')}>
          <span className="rounded-full bg-green-500/15 px-3 py-0.5 text-xs font-medium text-green-500">
            {t('settings.connected')}
          </span>
        </SettingRow>
      </SettingsCard>

      <HfTokenSettings onSaved={() => {}} />
    </div>
  );
}

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
