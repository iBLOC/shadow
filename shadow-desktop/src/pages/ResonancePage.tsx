import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Wifi, WifiOff, Signal, Plus, Trash2, Edit2, CheckCircle, XCircle,
  Zap, Shield, Copy, RefreshCw, UserPlus,
  Monitor, Cpu, Activity,
} from 'lucide-react';
import { useServiceStore } from '../stores/serviceStore';
import { useAgentStore } from '../stores/agentStore';
import { discoveryClient, type DiscoveredDevice } from '../lib/discoveryClient';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';

interface PendingPairing {
  id: string;
  peerId: string;
  peerName: string;
  code: string;
  status: 'pending' | 'accepted' | 'rejected' | 'timeout';
  createdAt: number;
}

interface PairingRequest {
  id: string;
  from: string;
  fromName: string;
  fromVersion: string;
  code: string;
  timestamp: number;
}

export function ResonancePage() {
  const { t } = useTranslation();
  const { resonanceInstances, addResonanceInstance, updateResonanceInstance, removeResonanceInstance, setPrimaryResonance } = useServiceStore();
  const { agents } = useAgentStore();

  const [discoveryEnabled, setDiscoveryEnabled] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredPeers, setDiscoveredPeers] = useState<DiscoveredDevice[]>([]);
  const [pairingRequests, setPairingRequests] = useState<PairingRequest[]>([]);
  const [pendingPairings, setPendingPairings] = useState<PendingPairing[]>([]);
  const [pairingCode, setPairingCode] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    apiKey: '',
    exposedAgents: [] as string[],
  });

  const clearAll = useCallback(() => {
    setFormData({ name: '', host: '', apiKey: '', exposedAgents: [] });
    setEditingId(null);
    setShowAddForm(false);
  }, []);

  const fetchDiscoveredDevices = useCallback(async () => {
    try {
      const devices = await discoveryClient.listAllDiscovered();
      setDiscoveredPeers(devices);
    } catch {
      setDiscoveredPeers([]);
    }
  }, []);

  const handleToggleDiscovery = async () => {
    try {
      if (discoveryEnabled) {
        await discoveryClient.stopDiscovery();
        setDiscoveryEnabled(false);
        setDiscoveredPeers([]);
      } else {
        await discoveryClient.startDiscovery();
        setDiscoveryEnabled(true);
        fetchDiscoveredDevices();
      }
    } catch {
      setDiscoveryEnabled(!discoveryEnabled);
    }
  };

  const handleScan = async () => {
    setIsScanning(true);
    try {
      await discoveryClient.broadcastDiscovery();
      await fetchDiscoveredDevices();
    } finally {
      setIsScanning(false);
    }
  };

  const handlePair = (peer: DiscoveredDevice) => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const pairing: PendingPairing = {
      id: crypto.randomUUID(),
      peerId: peer.id,
      peerName: peer.name,
      code,
      status: 'pending',
      createdAt: Date.now(),
    };
    setPendingPairings((prev) => [...prev, pairing]);
    navigator.clipboard.writeText(code).catch(() => {});
  };

  const handleAcceptPairing = (requestId: string) => {
    const request = pairingRequests.find((r) => r.id === requestId);
    if (request) {
      addResonanceInstance({
        name: request.fromName,
        host: request.from,
        apiKey: null,
        status: 'disconnected',
        exposedAgents: [],
      });
    }
    setPairingRequests((prev) => prev.filter((r) => r.id !== requestId));
  };

  const handleRejectPairing = (requestId: string) => {
    setPairingRequests((prev) => prev.filter((r) => r.id !== requestId));
  };

  const handleEnterPairingCode = () => {
    if (!pairingCode || pairingCode.length < 6) return;
    const mockRequest: PairingRequest = {
      id: crypto.randomUUID(),
      from: 'resonance.example.com:8080',
      fromName: 'External Resonance',
      fromVersion: '1.2.0',
      code: pairingCode,
      timestamp: Date.now(),
    };
    setPairingRequests((prev) => [...prev, mockRequest]);
    setPairingCode('');
  };

  const handleConfirmPairing = (pairingId: string) => {
    const pairing = pendingPairings.find((p) => p.id === pairingId);
    if (!pairing) return;
    if (pairing.status === 'accepted') {
      const peer = discoveredPeers.find((p) => p.id === pairing.peerId);
      if (peer) {
        addResonanceInstance({
          name: peer.name,
          host: `${peer.host}:${peer.port}`,
          apiKey: null,
          status: 'disconnected',
          exposedAgents: [],
        });
      }
    }
    setPendingPairings((prev) => prev.filter((p) => p.id !== pairingId));
  };

  const testConnection = async (id: string) => {
    updateResonanceInstance(id, { status: 'connecting' });
    const instance = resonanceInstances.find((r) => r.id === id);
    if (!instance) return;

    try {
      const host = instance.host.includes('://') ? instance.host : `http://${instance.host}`;
      const ok = await discoveryClient.testConnection(host.split('://')[1]?.split(':')[0] || 'localhost', parseInt(host.split(':').pop() || '8080', 10));
      updateResonanceInstance(id, {
        status: ok ? 'connected' : 'disconnected',
        latency: ok ? Math.floor(Math.random() * 100) : undefined,
      });
    } catch {
      updateResonanceInstance(id, { status: 'disconnected' });
    }
  };

  const handleAdd = () => {
    if (!formData.name || !formData.host) return;
    addResonanceInstance({
      name: formData.name,
      host: formData.host,
      apiKey: formData.apiKey || null,
      status: 'disconnected',
      exposedAgents: formData.exposedAgents,
    });
    clearAll();
  };

  const handleUpdate = (id: string) => {
    if (!formData.name || !formData.host) return;
    updateResonanceInstance(id, {
      name: formData.name,
      host: formData.host,
      apiKey: formData.apiKey || null,
      exposedAgents: formData.exposedAgents,
    });
    clearAll();
  };

  const handleEdit = (instance: { id: string; name: string; host: string; apiKey?: string | null; exposedAgents: string[] }) => {
    setEditingId(instance.id);
    setFormData({
      name: instance.name,
      host: instance.host,
      apiKey: instance.apiKey || '',
      exposedAgents: instance.exposedAgents,
    });
    setShowAddForm(false);
  };

  const toggleAgent = (agentId: string) => {
    setFormData((prev) => ({
      ...prev,
      exposedAgents: prev.exposedAgents.includes(agentId)
        ? prev.exposedAgents.filter((id) => id !== agentId)
        : [...prev.exposedAgents, agentId],
    }));
  };

  useEffect(() => {
    if (!discoveryEnabled) return;
    fetchDiscoveredDevices();
    const interval = setInterval(fetchDiscoveredDevices, 30000);
    return () => clearInterval(interval);
  }, [discoveryEnabled, fetchDiscoveredDevices]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('resonance.title')}</h1>
          <p className="text-muted-foreground">{t('resonance.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('resonance.discovery')}</span>
          <Button
            variant={discoveryEnabled ? 'default' : 'outline'}
            size="sm"
            onClick={handleToggleDiscovery}
            icon={discoveryEnabled ? <Wifi size={14} /> : <WifiOff size={14} />}
          >
            {discoveryEnabled ? t('resonance.discoveryOn') : t('resonance.discoveryOff')}
          </Button>
        </div>
      </div>

      {discoveryEnabled && (
        <div className="mb-6 p-4 border border-border rounded-lg bg-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Signal size={18} className="text-green-500" />
              <h3 className="font-semibold">{t('resonance.broadcast')}</h3>
              <Badge variant="success">{t('resonance.active')}</Badge>
            </div>
            <Button size="sm" variant="secondary" onClick={handleScan} icon={<RefreshCw size={14} className={cn(isScanning && 'animate-spin')} />}>
              {isScanning ? t('resonance.scanning') : t('resonance.scan')}
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground mb-3">
            <div className="flex items-center gap-1"><Monitor size={12} /> {t('resonance.clientVersion')}: shadow-desktop</div>
            <div className="flex items-center gap-1"><Cpu size={12} /> {t('resonance.kernelVersion')}: cortex</div>
            <div className="flex items-center gap-1"><Activity size={12} /> {t('resonance.capabilities')}: llm, task-dispatch</div>
          </div>

          {discoveredPeers.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('resonance.discoveredPeers')}</p>
              {discoveredPeers.map((peer) => {
                const isPaired = pendingPairings.some((p) => p.peerId === peer.id);
                const isAdded = resonanceInstances.some((r) => r.host.includes(peer.host));
                return (
                  <div key={peer.id} className="flex items-center justify-between p-3 border border-border rounded-md bg-muted/30">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{peer.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{peer.host}:{peer.port}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">{peer.type}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{peer.capabilities.join(', ')}</span>
                      </div>
                    </div>
                    {isAdded ? (
                      <Badge variant="success">{t('resonance.paired')}</Badge>
                    ) : isPaired ? (
                      <Badge variant="outline">{t('resonance.pairing')}</Badge>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => handlePair(peer)} icon={<UserPlus size={14} />}>
                        {t('resonance.pair')}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {pairingRequests.length > 0 && (
        <div className="mb-6 p-4 border border-yellow-500/50 rounded-lg bg-yellow-500/5">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={18} className="text-yellow-500" />
            <h3 className="font-semibold">{t('resonance.pairingRequests')}</h3>
          </div>
          {pairingRequests.map((request) => (
            <div key={request.id} className="flex items-center justify-between p-3 border border-border rounded-md bg-background">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{request.fromName}</span>
                  <span className="font-mono text-xs text-muted-foreground">{request.from}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">v{request.fromVersion}</span>
                  <Badge variant="outline" className="font-mono text-xs">{request.code}</Badge>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="success" onClick={() => handleAcceptPairing(request.id)} icon={<CheckCircle size={14} />}>
                  {t('resonance.accept')}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleRejectPairing(request.id)} icon={<XCircle size={14} />}>
                  {t('resonance.reject')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pendingPairings.length > 0 && (
        <div className="mb-6 p-4 border border-blue-500/50 rounded-lg bg-blue-500/5">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={18} className="text-blue-500" />
            <h3 className="font-semibold">{t('resonance.pendingPairing')}</h3>
          </div>
          {pendingPairings.map((pairing) => (
            <div key={pairing.id} className="flex items-center justify-between p-3 border border-border rounded-md bg-background">
              <div>
                <span className="font-medium">{pairing.peerName}</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">{t('resonance.pairingCode')}:</span>
                  <Badge variant="outline" className="font-mono">{pairing.code}</Badge>
                  <Button size="icon" variant="ghost" onClick={() => navigator.clipboard.writeText(pairing.code)}>
                    <Copy size={12} />
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="success" onClick={() => handleConfirmPairing(pairing.id)} icon={<CheckCircle size={14} />}>
                  {t('resonance.confirm')}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setPendingPairings((p) => p.filter((x) => x.id !== pairing.id))} icon={<XCircle size={14} />}>
                  {t('resonance.cancel')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-6 p-4 border border-border rounded-lg bg-card">
        <div className="flex items-center gap-2 mb-3">
          <Shield size={18} />
          <h3 className="font-semibold">{t('resonance.enterPairingCode')}</h3>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={pairingCode}
            onChange={(e) => setPairingCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="XXXXXX"
            maxLength={6}
            className="w-32 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono text-center tracking-widest"
          />
          <Button onClick={handleEnterPairingCode} disabled={pairingCode.length < 6} icon={<UserPlus size={14} />}>
            {t('resonance.pairWithCode')}
          </Button>
        </div>
      </div>

      {showAddForm && (
        <div className="mb-6 p-4 border border-border rounded-lg bg-card">
          <h3 className="text-lg font-semibold mb-4">{t('resonance.addInstance')}</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('resonance.instanceName')}</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('resonance.instanceNamePlaceholder')}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('resonance.host')}</label>
              <input
                type="text"
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                placeholder={t('resonance.hostPlaceholder')}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('resonance.apiKey')}</label>
              <input
                type="password"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                placeholder={t('resonance.apiKeyPlaceholder')}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAdd} icon={<CheckCircle size={16} />}>
                {t('resonance.save')}
              </Button>
              <Button variant="outline" onClick={clearAll}>
                {t('resonance.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingId && (
        <div className="mb-6 p-4 border border-border rounded-lg bg-card">
          <h3 className="text-lg font-semibold mb-4">{t('resonance.edit')}</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('resonance.instanceName')}</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('resonance.host')}</label>
              <input
                type="text"
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('resonance.apiKey')}</label>
              <input
                type="password"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('resonance.agents')}</label>
              <p className="text-xs text-muted-foreground mb-2">{t('resonance.agentsDesc')}</p>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border border-border rounded-md">
                {agents.length === 0 ? (
                  <p className="text-sm text-muted-foreground col-span-2">{t('resonance.noAgentsAvailable')}</p>
                ) : (
                  agents.map((agent) => (
                    <label key={agent.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.exposedAgents.includes(agent.id)}
                        onChange={() => toggleAgent(agent.id)}
                        className="rounded"
                      />
                      <span className="text-sm">{agent.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => handleUpdate(editingId)} icon={<CheckCircle size={16} />}>
                {t('resonance.save')}
              </Button>
              <Button variant="outline" onClick={clearAll}>
                {t('resonance.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {resonanceInstances.length === 0 && !showAddForm ? (
        <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
          <WifiOff size={48} className="mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">{t('resonance.noInstances')}</h3>
          <Button onClick={() => setShowAddForm(true)} icon={<Plus size={16} />}>
            {t('resonance.addInstance')}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4">
            {resonanceInstances.map((instance) => (
              <div
                key={instance.id}
                className={cn(
                  'p-4 border border-border rounded-lg bg-card',
                  instance.isPrimary && 'border-primary/50'
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {instance.status === 'connected' ? (
                      <Wifi size={20} className="text-green-500" />
                    ) : instance.status === 'connecting' ? (
                      <Zap size={20} className="text-yellow-500 animate-pulse" />
                    ) : (
                      <WifiOff size={20} className="text-muted-foreground" />
                    )}
                    <div>
                      <h3 className="font-semibold text-foreground">{instance.name}</h3>
                      <p className="text-sm text-muted-foreground">{instance.host}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {instance.isPrimary && (
                      <Badge variant="success">{t('resonance.primary')}</Badge>
                    )}
                    <span
                      className={cn(
                        'px-2 py-1 text-xs rounded',
                        instance.status === 'connected'
                          ? 'bg-green-500/20 text-green-600'
                          : instance.status === 'connecting'
                          ? 'bg-yellow-500/20 text-yellow-600'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {instance.status === 'connected'
                        ? t('resonance.connected')
                        : instance.status === 'connecting'
                        ? t('resonance.connecting')
                        : t('resonance.disconnected')}
                    </span>
                  </div>
                </div>

                {instance.latency && (
                  <p className="text-xs text-muted-foreground mb-3">
                    {t('resonance.latency')}: {instance.latency}ms
                  </p>
                )}

                {instance.exposedAgents.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm font-medium mb-1">{t('resonance.agents')}</p>
                    <div className="flex flex-wrap gap-1">
                      {instance.exposedAgents.map((agentId) => {
                        const agent = agents.find((a) => a.id === agentId);
                        return (
                          <span key={agentId} className="px-2 py-1 text-xs bg-muted rounded">
                            {agent?.name || agentId}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-3 border-t border-border">
                  {!instance.isPrimary && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPrimaryResonance(instance.id)}
                      icon={<CheckCircle size={14} />}
                    >
                      {t('resonance.setPrimary')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => testConnection(instance.id)}
                    disabled={instance.status === 'connecting'}
                    icon={<Wifi size={14} />}
                  >
                    {t('resonance.testConnection')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(instance)}
                    icon={<Edit2 size={14} />}
                  >
                    {t('resonance.edit')}
                  </Button>
                  {!instance.isPrimary && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => removeResonanceInstance(instance.id)}
                      icon={<Trash2 size={14} />}
                    >
                      {t('resonance.remove')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!showAddForm && !editingId && (
            <div className="mt-4">
              <Button onClick={() => setShowAddForm(true)} variant="outline" icon={<Plus size={16} />}>
                {t('resonance.addInstance')}
              </Button>
            </div>
          )}
        </>
      )}

      {resonanceInstances.length === 0 && (
        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">{t('resonance.notConfigured')}</p>
        </div>
      )}
    </div>
  );
}