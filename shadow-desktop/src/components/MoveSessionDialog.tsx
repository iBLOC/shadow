import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ArrowRight, Server, Check, AlertCircle, Loader } from 'lucide-react';
import { prefrontalClient } from '../lib/prefrontalClient';

interface DiscoveredPeer {
  id: string;
  url: string;
  name: string;
  reachable: boolean;
  last_seen_ms: number;
  skill_count: number;
  capabilities: string[];
}

interface MoveSessionDialogProps {
  open: boolean;
  sessionId: string | null;
  messageCount: number;
  onClose: () => void;
  onMigrated: (newSessionId: string, peerName: string) => void;
}

export function MoveSessionDialog({
  open,
  sessionId,
  messageCount,
  onClose,
  onMigrated,
}: MoveSessionDialogProps) {
  const { t } = useTranslation();
  const [peers, setPeers] = useState<DiscoveredPeer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'sending' | 'success' | 'failed'>('idle');
  const [selectedPeer, setSelectedPeer] = useState<DiscoveredPeer | null>(null);
  const [payloadSize, setPayloadSize] = useState<number>(0);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPhase('idle');
    setSelectedPeer(null);
    setPayloadSize(0);
    setLoading(true);
    prefrontalClient
      .listA2APeers()
      .then((resp) => {
        const data = (resp.data ?? []) as DiscoveredPeer[];
        const reachable = data.filter((p) => p.reachable);
        setPeers(reachable);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [open]);

  const handleMigrate = async () => {
    if (!sessionId || !selectedPeer) return;
    setError(null);
    setPhase('preparing');
    try {
      const prep = await prefrontalClient.prepareMigration(sessionId);
      setPayloadSize(prep.size_bytes);
      setPhase('sending');
      const summary = (await prefrontalClient.importSession(prep.payload, {
        newId: true,
      })) as { data: { id: string } };
      setPhase('success');
      onMigrated(summary.data.id, selectedPeer.name);
    } catch (e) {
      setError(String(e));
      setPhase('failed');
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container move-session-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('common.migrate.title')}
      >
        <div className="modal-header">
          <h2>{t('common.migrate.title')}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>

        <p className="modal-description">{t('common.migrate.description')}</p>

        {messageCount > 0 && (
          <div className="move-session-summary">
            <span className="badge">
              {t('common.migrate.messageCount', { count: messageCount })}
            </span>
            {payloadSize > 0 && (
              <span className="badge">
                {t('common.migrate.sizeKb', { kb: Math.round(payloadSize / 1024) })}
              </span>
            )}
          </div>
        )}

        {loading && (
          <div className="move-session-loading">
            <Loader size={18} className="spin" />
          </div>
        )}

        {!loading && peers.length === 0 && (
          <div className="move-session-empty">
            <Server size={32} />
            <p>{t('common.migrate.noPeers')}</p>
          </div>
        )}

        {!loading && peers.length > 0 && phase === 'idle' && (
          <div className="move-session-peers">
            {peers.map((peer) => (
              <button
                key={peer.id}
                className={`move-session-peer-card ${selectedPeer?.id === peer.id ? 'selected' : ''}`}
                onClick={() => setSelectedPeer(peer)}
              >
                <div className="peer-icon">
                  <Server size={20} />
                </div>
                <div className="peer-info">
                  <strong>{peer.name}</strong>
                  <span className="peer-url">{peer.url}</span>
                  <div className="peer-caps">
                    {peer.capabilities.map((c) => (
                      <span key={c} className="cap-chip">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
                {selectedPeer?.id === peer.id && <Check size={18} />}
              </button>
            ))}
          </div>
        )}

        {(phase === 'preparing' || phase === 'sending') && (
          <div className="move-session-progress">
            <Loader size={18} className="spin" />
            <span>
              {phase === 'preparing'
                ? t('common.migrate.preparing')
                : t('common.migrate.inProgress', { peer: selectedPeer?.name ?? '' })}
            </span>
          </div>
        )}

        {phase === 'success' && selectedPeer && (
          <div className="move-session-success">
            <Check size={20} />
            <span>
              {t('common.migrate.success', { peer: selectedPeer.name })}
            </span>
          </div>
        )}

        {error && (
          <div className="move-session-error">
            <AlertCircle size={18} />
            <span>
              {phase === 'failed'
                ? t('common.migrate.error', { error })
                : error}
            </span>
          </div>
        )}

        <div className="modal-actions">
          {phase === 'success' ? (
            <button className="btn btn-primary" onClick={onClose}>
              {t('common.confirm')}
            </button>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={onClose}>
                {t('common.cancel')}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleMigrate}
                disabled={!selectedPeer || phase !== 'idle'}
              >
                {phase === 'idle' ? t('common.migrate.confirm') : <ArrowRight size={16} />}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
