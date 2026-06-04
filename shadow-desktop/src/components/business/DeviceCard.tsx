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
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import type { DiscoveredDevice } from '../../lib/discoveryClient';
import { discoveryClient } from '../../lib/discoveryClient';

import './DeviceCard.css';

interface DeviceCardProps {
  device: DiscoveredDevice;
  isActive: boolean;
  onSetActive: () => void;
  onRemove: () => void;
  onDetails: () => void;
  onDelegate?: () => void;
}

const capabilityIcons: Record<string, React.ComponentType<{ size?: number }>> = {
  llm: Bot,
  tts: Radio,
  asr: Radio,
  vad: Radio,
};

const typeIcons: Record<string, React.ComponentType<{ size?: number }>> = {
  agent: Bot,
  engine: Cpu,
  router: Radio,
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
    <div className={`device-card ${isActive ? 'active' : ''}`}>
      <div className="device-card-header">
        <div className="device-icon">
          <TypeIcon size={20} />
        </div>
        <div className="device-info">
          <h3 className="device-name">{device.name}</h3>
          <span className="device-host">
            {device.host}:{device.port}
          </span>
        </div>
        {isActive && (
          <div className="active-badge">
            <CheckCircle2 size={14} />
            <span>{t('discovery.active')}</span>
          </div>
        )}
      </div>

      <div className="device-capabilities">
        {device.capabilities.map((cap) => {
          const Icon = capabilityIcons[cap] || Bot;
          return (
            <Badge key={cap} variant="default" className="capability-badge">
              <Icon size={12} />
              <span>{t(`discovery.capabilitiesList.${cap}`)}</span>
            </Badge>
          );
        })}
      </div>

      <div className="device-meta">
        <div className="device-type">
          <span className="meta-label">{t('discovery.type')}:</span>
          <span className="meta-value">{t(`discovery.types.${device.type}`)}</span>
        </div>
        {device.version && (
          <div className="device-version">
            <span className="meta-label">{t('discovery.version')}:</span>
            <span className="meta-value">{device.version}</span>
          </div>
        )}
        <div className="device-last-seen">
          <Clock size={12} />
          <span>{formatLastSeen(device.lastSeen)}</span>
        </div>
      </div>

      <div className="device-actions">
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
                : t('discovery.testConnection')
          }
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
        
        <Button
          variant="ghost"
          size="sm"
          icon={<MoreHorizontal size={14} />}
          onClick={onDetails}
        />
        
        <Button
          variant="ghost"
          size="sm"
          icon={<Trash2 size={14} />}
          onClick={onRemove}
        />
      </div>
    </div>
  );
}