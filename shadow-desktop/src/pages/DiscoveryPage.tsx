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
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { DeviceCard } from '../components/business/DeviceCard';
import { useDiscoveryStore } from '../stores/discoveryStore';
import type { DiscoveredDevice, DeviceCapability } from '../lib/discoveryClient';
import './DiscoveryPage.css';

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
    refreshDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setManualHost('');
    setManualPort('8082');
    setManualName('');
    setManualType('agent');
    setManualCapabilities(['llm']);
    setManualVersion('');
  };

  const toggleCapability = (cap: DeviceCapability) => {
    setManualCapabilities((prev) => 
      prev.includes(cap)
        ? prev.filter((c) => c !== cap)
        : [...prev, cap]
    );
  };

  return (
    <div className="discovery-page">
      <header className="discovery-header">
        <div className="header-content">
          <div className="header-icon">
            <Radar size={32} />
          </div>
          <div className="headerText">
            <h1>{t('discovery.title')}</h1>
            <p>{t('discovery.subtitle')}</p>
          </div>
        </div>
        <div className="header-actions">
          <Button
            variant="ghost"
            icon={<Plus size={16} />}
            onClick={() => setShowAddDialog(true)}
          >
            {t('discovery.manualAdd')}
          </Button>
          <Button
            variant="primary"
            icon={isScanning ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            onClick={handleStartScan}
            disabled={isScanning}
          >
            {isScanning ? t('discovery.scanning') : t('discovery.startScan')}
          </Button>
        </div>
      </header>

      {error && (
        <div className="discovery-error">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={clearError}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="discovery-content">
        {devices.length === 0 ? (
<div className="empty-state-container">
            <EmptyState
              icon={<Wifi size={48} />}
              title={t('discovery.noNodes')}
              description={t('discovery.noNodesHint')}
            />
            <Button
              variant="primary"
              icon={<Radar size={18} />}
              onClick={handleStartScan}
              className="empty-action"
            >
              {t('discovery.startScan')}
            </Button>
          </div>
        ) : (
          <div className="devices-grid">
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
        <div className="discovery-footer">
          <span className="last-scan">
            {t('discovery.lastScan')}: {lastScan.toLocaleTimeString()}
          </span>
          <span className="device-count">
            {t('discovery.deviceCount', { count: devices.length })}
          </span>
        </div>
      )}

      <Modal
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        title={t('discovery.addNode')}
      >
        <div className="add-dialog-form">
          <Input
            label={t('discovery.host')}
            value={manualHost}
            onChange={(e) => setManualHost(e.target.value)}
            placeholder="192.168.1.100"
          />
          <Input
            label={t('discovery.port')}
            value={manualPort}
            onChange={(e) => setManualPort(e.target.value)}
            placeholder="8082"
            type="number"
          />
          <Input
            label={t('discovery.name')}
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            placeholder="My Shadow Node"
          />
          
          <div className="form-group">
            <label>{t('discovery.type')}</label>
            <div className="type-selector">
              <button
                className={`type-btn ${manualType === 'agent' ? 'active' : ''}`}
                onClick={() => setManualType('agent')}
              >
                {t('discovery.types.agent')}
              </button>
              <button
                className={`type-btn ${manualType === 'engine' ? 'active' : ''}`}
                onClick={() => setManualType('engine')}
              >
                {t('discovery.types.engine')}
              </button>
              <button
                className={`type-btn ${manualType === 'router' ? 'active' : ''}`}
                onClick={() => setManualType('router')}
              >
                {t('discovery.types.router')}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>{t('discovery.capabilities')}</label>
            <div className="capability-selector">
              {(['llm', 'tts', 'asr', 'vad'] as const).map((cap) => (
                <button
                  key={cap}
                  className={`cap-btn ${manualCapabilities.includes(cap) ? 'active' : ''}`}
                  onClick={() => toggleCapability(cap)}
                >
                  {t(`discovery.capabilities.${cap}`)}
                </button>
              ))}
            </div>
          </div>

          <Input
            label={t('discovery.version')}
            value={manualVersion}
            onChange={(e) => setManualVersion(e.target.value)}
            placeholder="v0.1.0"
          />

          <div className="dialog-actions">
            <Button variant="ghost" onClick={() => setShowAddDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleAddManual}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title={selectedDevice?.name || ''}
      >
        {selectedDevice && (
          <div className="detail-modal">
            <div className="detail-section">
              <h4>{t('discovery.endpoint')}</h4>
              <code className="endpoint-url">
                {'http://' + selectedDevice.host + ':' + selectedDevice.port}
              </code>
            </div>
            
            <div className="detail-section">
              <h4>{t('discovery.capabilities')}</h4>
              <div className="capability-chips">
                {selectedDevice.capabilities.map((cap) => (
                  <span key={cap} className="chip">
                    {t(`discovery.capabilities.${cap}`)}
                  </span>
                ))}
              </div>
            </div>

            <div className="detail-section">
              <h4>{t('discovery.status')}</h4>
              <div className={`status-indicator ${activeNode?.id === selectedDevice.id ? 'active' : ''}`}>
                {activeNode?.id === selectedDevice.id ? (
                  <>
                    <CheckCircle2 size={14} />
                    <span>{t('discovery.active')}</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={14} />
                    <span>{t('discovery.inactive')}</span>
                  </>
                )}
              </div>
            </div>

            <div className="dialog-actions">
              <Button variant="ghost" onClick={() => setShowDetailModal(false)}>
                {t('common.close')}
              </Button>
              {activeNode?.id !== selectedDevice.id && (
                <Button
                  variant="primary"
                  onClick={() => {
                    setActiveNode(selectedDevice);
                    setShowDetailModal(false);
                  }}
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