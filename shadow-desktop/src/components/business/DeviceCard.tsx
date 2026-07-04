import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bot,
  Cpu,
  Radio,
  CheckCircle2,
  Clock,
  MoreHorizontal,
  Trash2,
  Zap,
  Send,
  type LucideIcon,
} from 'lucide-react';
import { Button, Badge } from '../ui';
import type { DiscoveredDevice } from '../../lib/discoveryClient';
import { discoveryClient } from '../../lib/discoveryClient';
import { cn } from '../../lib/utils';

interface DeviceCardProps {
  device: DiscoveredDevice;
  isActive: boolean;
  onSetActive: () => void;
  onRemove: () => void;
  onDetails: () => void;
  onDelegate?: () => void;
}

const capabilityIcons: Record<string, LucideIcon> = {
  llm: Bot, tts: Radio, asr: Radio, vad: Radio,
};

const typeIcons: Record<string, LucideIcon> = {
  agent: Bot, engine: Cpu, router: Radio,
};

export function DeviceCard({
  device,
  isActive,
  onSetActive,
  onRemove,
  onDetails,
  onDelegate,
}: DeviceCardProps) {
  const { t } = useTranslation();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failed' | null>(null);

  const TypeIcon = typeIcons[device.type] || Bot;

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const success = await discoveryClient.testConnection(device.host, device.port);
    setTestResult(success ? 'success' : 'failed');
    setTesting(false);
  };

  const formatLastSeen = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return t('discovery.justNow');
    if (diffMins < 60) return t('discovery.minutesAgo', { count: diffMins });
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return t('discovery.hoursAgo', { count: diffHours });
    return date.toLocaleDateString();
  };

  return (
    <div className={cn(
      'rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/30',
      isActive && 'border-foreground'
    )}>
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <TypeIcon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-foreground">{device.name}</h3>
          <span className="font-mono text-xs text-muted-foreground">
            {device.host}:{device.port}
          </span>
        </div>
        {isActive && (
          <div className="flex items-center gap-1 rounded bg-foreground px-2 py-0.5 text-xs font-medium text-background">
            <CheckCircle2 size={12} />
            <span>{t('discovery.active')}</span>
          </div>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {device.capabilities.map((cap) => {
          const Icon = capabilityIcons[cap] || Bot;
          return (
            <Badge key={cap} variant="default" className="flex items-center gap-1 text-[11px]">
              <Icon size={11} />
              <span>{t(`discovery.capabilitiesList.${cap}`)}</span>
            </Badge>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">{t('discovery.type')}:</span>
          <span className="font-medium text-foreground">{t(`discovery.types.${device.type}`)}</span>
        </div>
        {device.version && (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">{t('discovery.version')}:</span>
            <span className="font-medium text-foreground">{device.version}</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1 text-muted-foreground">
          <Clock size={12} />
          <span>{formatLastSeen(device.lastSeen)}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button
          variant="ghost"
          size="sm"
          icon={<Zap size={14} />}
          onClick={handleTestConnection}
          disabled={testing}
        >
          {testing
            ? t('discovery.testing')
            : testResult === 'success'
              ? t('discovery.connected')
              : testResult === 'failed'
                ? t('discovery.failed')
                : t('discovery.testConnection')}
        </Button>

        {!isActive && (
          <Button
            variant="primary"
            size="sm"
            icon={<CheckCircle2 size={14} />}
            onClick={onSetActive}
          >
            {t('discovery.setActive')}
          </Button>
        )}

        {device.capabilities.includes('llm') && onDelegate && (
          <Button
            variant="secondary"
            size="sm"
            icon={<Send size={14} />}
            onClick={onDelegate}
          >
            {t('common.delegate.button')}
          </Button>
        )}

        <Button variant="ghost" size="sm" icon={<MoreHorizontal size={14} />} onClick={onDetails} />
        <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={onRemove} />
      </div>
    </div>
  );
}
