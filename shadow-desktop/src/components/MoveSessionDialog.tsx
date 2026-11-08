import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ArrowRight, Server, Check, AlertCircle, Loader } from 'lucide-react';
import { prefrontalClient } from '../lib/prefrontalClient';
import { Button } from './ui';

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
      .catch((e) => {
        // ⚠️ **读不到 ≠ 没有** —— 而且端脑这一面**根本没有** peer 列表路由
        // ⇒ ⇒ 以前是把裸的 "Error: HTTP 404: Not Found" 甩给用户
        // ⇒ ⇒ 现在：状态里放**原始原因**（不带多余的 "Error:" 前缀），
        // ⇒ ⇒ 由渲染处补一句「读不到节点列表」的上下文。
        setError(e instanceof Error ? e.message : String(e));
      })
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
          <Button size="icon" variant="ghost" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </Button>
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

        {/* ⚠️ 列表**读失败**时**不许**显示「未发现节点」的空态
            —— 「读不到」≠「没有」⇒ ⇒ 空态只在**真的读到了空列表**时出现。 */}
        {!loading && peers.length === 0 && !error && (
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
              {phase === 'failed' ? (
                t('common.migrate.error', { error })
              ) : (
                <>
                  {t('common.migrate.peerListFailed')}{' '}
                  {error}
                </>
              )}
            </span>
          </div>
        )}

        <div className="modal-actions">
          {phase === 'success' ? (
            <Button onClick={onClose}>
              {t('common.confirm')}
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleMigrate}
                disabled={!selectedPeer || phase !== 'idle'}
                icon={phase === 'idle' ? undefined : <ArrowRight size={16} />}
              >
                {phase === 'idle' ? t('common.migrate.confirm') : ''}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
