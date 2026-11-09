import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Wifi,
  Radar,
  Plus,
  RefreshCw,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Button, EmptyState, Modal, Input } from '../components/ui';
import { DeviceCard } from '../components/business/DeviceCard';
import { useDiscoveryStore } from '../stores/discoveryStore';
import type { DiscoveredDevice, DeviceCapability } from '../lib/discoveryClient';
import { cn } from '../lib/utils';

export function DiscoveryPage() {
  const { t } = useTranslation();
  const {
    devices,
    activeNode,
    isScanning,
    lastScan,
    error,
    startScan,
    refreshDevices,
    setActiveNode,
    addManualDevice,
    removeDevice,
    clearError,
  } = useDiscoveryStore();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DiscoveredDevice | null>(null);

  const [manualHost, setManualHost] = useState('');
  const [manualPort, setManualPort] = useState('8082');
  const [manualName, setManualName] = useState('');
  const [manualType, setManualType] = useState<'agent' | 'engine' | 'router'>('agent');
  const [manualCapabilities, setManualCapabilities] = useState<DeviceCapability[]>(['llm']);
  const [manualVersion, setManualVersion] = useState('');

  useEffect(() => {
    void refreshDevices();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartScan = async () => {
    await startScan();
    await refreshDevices();
  };

  const handleDetails = (device: DiscoveredDevice) => {
    setSelectedDevice(device);
    setShowDetailModal(true);
  };

  const handleAddManual = () => {
    if (!manualHost.trim()) return;
    addManualDevice({
      name: manualName.trim() || `${manualHost}:${manualPort}`,
      type: manualType,
      capabilities: manualCapabilities,
      host: manualHost.trim(),
      port: parseInt(manualPort, 10) || 8082,
      version: manualVersion.trim() || undefined,
    });
    setShowAddDialog(false);
    setManualHost(''); setManualPort('8082'); setManualName('');
    setManualType('agent'); setManualCapabilities(['llm']); setManualVersion('');
  };

  const toggleCapability = (cap: DeviceCapability) => {
    setManualCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-md bg-foreground text-background">
            <Radar size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{t('discovery.title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('discovery.subtitle')}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="ghost" icon={<Plus size={16} />} onClick={() => setShowAddDialog(true)}>
            {t('discovery.manualAdd')}
          </Button>
          <Button
            variant="primary"
            icon={isScanning ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            onClick={handleStartScan}
            disabled={isScanning}
          >
            {isScanning ? t('discovery.scanning') : t('discovery.startScan')}
          </Button>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
          <AlertCircle size={16} />
          <span>{error}</span>
          <Button size="icon" variant="ghost" className="ml-auto" onClick={clearError} aria-label={t('common.close')}>
            <X size={14} />
          </Button>
        </div>
      )}


      <div className="flex-1 overflow-y-auto">
        {devices.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <EmptyState icon={<Wifi size={48} />} title={t('discovery.noNodes')} description={t('discovery.noNodesHint')} />
            <Button variant="primary" icon={<Radar size={18} />} onClick={handleStartScan}>
              {t('discovery.startScan')}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {devices.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                isActive={activeNode?.id === device.id}
                onSetActive={() => setActiveNode(device)}
                onRemove={() => removeDevice(device.id)}
                onDetails={() => handleDetails(device)}
              />
            ))}
          </div>
        )}
      </div>

      {lastScan && (
        <div className="flex justify-between border-t border-border pt-4 text-xs text-muted-foreground">
          <span>{t('discovery.lastScan')}: {lastScan.toLocaleTimeString()}</span>
          <span>{t('discovery.deviceCount', { count: devices.length })}</span>
        </div>
      )}

      <Modal isOpen={showAddDialog} onClose={() => setShowAddDialog(false)} title={t('discovery.addNode')}>
        <div className="flex flex-col gap-4">
          <Input label={t('discovery.host')} value={manualHost} onChange={(e) => setManualHost(e.target.value)} placeholder="192.168.1.100" />
          <Input label={t('discovery.port')} value={manualPort} onChange={(e) => setManualPort(e.target.value)} placeholder="8082" type="number" />
          <Input label={t('discovery.name')} value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="My Shadow Node" />

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">{t('discovery.type')}</label>
            <div className="flex flex-wrap gap-2">
              {(['agent', 'engine', 'router'] as const).map((tp) => (
                <button
                  key={tp}
                  className={cn(
                    'rounded-md border border-border bg-muted px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-foreground/40',
                    manualType === tp && 'border-foreground bg-foreground text-background'
                  )}
                  onClick={() => setManualType(tp)}
                >
                  {t(`discovery.types.${tp}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">{t('discovery.capabilities')}</label>
            <div className="flex flex-wrap gap-2">
              {(['llm', 'tts', 'asr', 'vad'] as const).map((cap) => (
                <button
                  key={cap}
                  className={cn(
                    'rounded-md border border-border bg-muted px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-foreground/40',
                    manualCapabilities.includes(cap) && 'border-foreground bg-foreground text-background'
                  )}
                  onClick={() => toggleCapability(cap)}
                >
                  {t(`discovery.capabilities.${cap}`)}
                </button>
              ))}
            </div>
          </div>

          <Input label={t('discovery.version')} value={manualVersion} onChange={(e) => setManualVersion(e.target.value)} placeholder="v0.1.0" />

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button variant="ghost" onClick={() => setShowAddDialog(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={handleAddManual}>{t('common.save')}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} title={selectedDevice?.name || ''}>
        {selectedDevice && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('discovery.endpoint')}</h4>
              <code className="rounded-md bg-muted px-3 py-2 font-mono text-sm text-foreground">
                {'http://' + selectedDevice.host + ':' + selectedDevice.port}
              </code>
            </div>

            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('discovery.capabilities')}</h4>
              <div className="flex flex-wrap gap-2">
                {selectedDevice.capabilities.map((cap) => (
                  <span key={cap} className="rounded-full bg-muted px-3 py-1 text-sm text-foreground">
                    {t(`discovery.capabilities.${cap}`)}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('discovery.status')}</h4>
              <div className={cn(
                'flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm',
                activeNode?.id === selectedDevice.id && 'bg-green-500/15 text-green-500'
              )}>
                {activeNode?.id === selectedDevice.id ? (
                  <>
                    <CheckCircle2 size={14} />
                    <span>{t('discovery.active')}</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={14} />
                    <span className="text-muted-foreground">{t('discovery.inactive')}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <Button variant="ghost" onClick={() => setShowDetailModal(false)}>{t('common.close')}</Button>
              {activeNode?.id !== selectedDevice.id && (
                <Button
                  variant="primary"
                  onClick={() => { setActiveNode(selectedDevice); setShowDetailModal(false); }}
                >
                  {t('discovery.setActive')}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
