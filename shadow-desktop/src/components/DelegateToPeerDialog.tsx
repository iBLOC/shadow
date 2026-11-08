import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Send, Check, AlertCircle, Loader, Plus, Server } from 'lucide-react';
import { prefrontalClient } from '../lib/prefrontalClient';
import { Button } from './ui';

interface DiscoveredPeer {
  id: string;
  url: string;
  name: string;
  reachable: boolean;
  last_seen_ms: number;
  capabilities: string[];
}

interface DelegateDialogProps {
  open: boolean;
  onClose: () => void;
  prefillUrl?: string;
}

type Phase = 'pick' | 'compose' | 'sending' | 'success' | 'error';

export function DelegateToPeerDialog({ open, onClose, prefillUrl }: DelegateDialogProps) {
  const { t } = useTranslation();
  const [peers, setPeers] = useState<DiscoveredPeer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * 错误**来自哪一步** —— 读列表 / 加节点。
   * ⇒ ⇒ 渲染时补一句上下文（译文）＋ 原因（原文）⇒ ⇒ 两者都在，
   * ⇒ ⇒ 别让用户对着一个裸的 HTTP 404 发呆。
   */
  const [errorContext, setErrorContext] = useState<'list' | 'add' | null>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [selectedPeer, setSelectedPeer] = useState<DiscoveredPeer | null>(null);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [newPeerUrl, setNewPeerUrl] = useState('');
  const [showAddPeer, setShowAddPeer] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setErrorContext(null);
    setPhase('pick');
    setSelectedPeer(null);
    setMessage('');
    setResult(null);
    setShowAddPeer(false);
    setNewPeerUrl('');
    setLoading(true);
    prefrontalClient
      .listA2APeers()
      .then((resp) => {
        const data = (resp.data ?? []) as DiscoveredPeer[];
        const reachable = data.filter((p) => p.reachable);
        const withLlms = reachable.filter((p) => p.capabilities.includes('llm'));
        setPeers(withLlms);
      })
      .catch((e) => {
        // ⚠️ **读不到 ≠ 没有** —— 以前这里 .catch(() => setPeers([]))
        // ⇒ ⇒ 把「列表读失败」伪装成「一个 peer 都没有」
        // ⇒ ⇒ 而端脑这一面**根本没有** peer 列表路由 ⇒ ⇒ 界面天天说谎。
        // ⇒ ⇒ 现在说「读不到」并把原因带出来（失败不能长得像成功）。
        setPeers([]);
        setErrorContext('list');
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open || !prefillUrl || peers.length > 0) return;
    setShowAddPeer(true);
    setNewPeerUrl(prefillUrl);
  }, [open, prefillUrl, peers]);

  const handleAddPeer = async () => {
    if (!newPeerUrl.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const peerId = newPeerUrl.replace(/^https?:\/\//, '').replace(/:/, '-').replace(/\./g, '-');
      // ⚠️ **注册失败就不许进列表** —— 以前这里 .catch(() => {}) 把 404 吞了，
      // 然后**编造**一个 reachable:true 的 peer 加进列表 ⇒ ⇒ 界面说「已添加、可发送」，
      // 而服务端根本没有这个 peer ⇒ ⇒ **失败长得像成功**（最坏的一种）。
      await prefrontalClient.registerA2APeer(peerId, newPeerUrl.trim(), true);
      const newPeer: DiscoveredPeer = {
        id: peerId,
        url: newPeerUrl.trim(),
        name: newPeerUrl.trim(),
        reachable: true,
        last_seen_ms: Date.now(),
        capabilities: ['llm'],
      };
      setPeers((prev) => [...prev, newPeer]);
      setSelectedPeer(newPeer);
      setShowAddPeer(false);
      setPhase('compose');
    } catch (e) {
      setErrorContext('add');
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPeer = (peer: DiscoveredPeer) => {
    setSelectedPeer(peer);
    setPhase('compose');
  };

  const handleSend = async () => {
    if (!selectedPeer || !message.trim()) return;
    setError(null);
    setPhase('sending');
    try {
      const resp = await prefrontalClient.delegateToPeer(selectedPeer.id, message.trim(), true);
      setResult(resp.text);
      setPhase('success');
    } catch (e) {
      setErrorContext(null);
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container move-session-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('common.delegate.title')}
      >
        <div className="modal-header">
          <h2>{t('common.delegate.title')}</h2>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </Button>
        </div>

        <p className="modal-description">{t('common.delegate.description')}</p>

        {loading && (
          <div className="move-session-loading">
            <Loader size={18} className="spin" />
          </div>
        )}

        {/* ⚠️ 列表**读失败**时**不许**显示「一个 peer 都没有」的空态
            —— 「读不到」≠「没有」⇒ ⇒ 空态只在**真的读到了空列表**时出现。 */}
        {!loading && phase === 'pick' && !showAddPeer && peers.length === 0 && errorContext !== 'list' && (
          <div className="move-session-empty">
            <Server size={32} />
            <p>{t('common.delegate.emptyPeers')}</p>
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setShowAddPeer(true)}>
              {t('common.delegate.addPeer')}
            </Button>
          </div>
        )}

        {!loading && phase === 'pick' && showAddPeer && (
          <div className="add-peer-form">
            <p>{t('common.delegate.addPeer')}</p>
            <input
              type="text"
              value={newPeerUrl}
              onChange={(e) => setNewPeerUrl(e.target.value)}
              placeholder="http://192.168.1.100:8082"
            />
            <div className="dialog-actions">
              <Button variant="ghost" onClick={() => setShowAddPeer(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" onClick={handleAddPeer} disabled={!newPeerUrl.trim()}>
                {t('common.add')}
              </Button>
            </div>
          </div>
        )}

        {!loading && phase === 'pick' && peers.length > 0 && (
          <div className="move-session-peers">
            {peers.map((peer) => (
              <button
                key={peer.id}
                className={`move-session-peer-card ${selectedPeer?.id === peer.id ? 'selected' : ''}`}
                onClick={() => handleSelectPeer(peer)}
              >
                <div className="peer-icon">
                  <Server size={20} />
                </div>
                <div className="peer-info">
                  <strong>{peer.name}</strong>
                  <span className="peer-url">{peer.url}</span>
                </div>
                {selectedPeer?.id === peer.id && <Check size={18} />}
              </button>
            ))}
            <Button variant="ghost" icon={<Plus size={16} />} onClick={() => setShowAddPeer(true)}>
              {t('common.delegate.addPeer')}
            </Button>
          </div>
        )}

        {phase === 'compose' && (
          <div className="compose-message">
            <label>{t('common.delegate.message')}</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('common.delegate.placeholder')}
              rows={4}
            />
          </div>
        )}

        {phase === 'sending' && (
          <div className="move-session-progress">
            <Loader size={18} className="spin" />
            <span>{t('common.delegate.sending')}</span>
          </div>
        )}

        {(phase === 'success' || phase === 'error') && result && (
          <div className="delegate-result">
            <Check size={20} />
            <div className="result-text">
              <strong>{t('common.delegate.result')}</strong>
              <p>{result}</p>
            </div>
          </div>
        )}

        {error && phase !== 'success' && (
          <div className="move-session-error">
            <AlertCircle size={18} />
            <span>
              {errorContext === 'list' && t('common.delegate.peerListFailed')}
              {errorContext === 'add' && t('common.delegate.peerAddFailed')}
              {errorContext && ' '}
              {error}
            </span>
          </div>
        )}

        <div className="modal-actions">
          {phase === 'success' ? (
            <Button variant="primary" onClick={onClose}>
              {t('common.confirm')}
            </Button>
          ) : phase !== 'pick' ? (
            <>
              <Button
                variant="ghost"
                onClick={() => setPhase('pick')}
                disabled={phase === 'sending'}
              >
                {t('common.back')}
              </Button>
              <Button variant="secondary" onClick={onClose} disabled={phase === 'sending'}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                icon={phase === 'sending' ? <Loader size={16} className="spin" /> : <Send size={16} />}
                onClick={handleSend}
                disabled={!message.trim() || phase === 'sending'}
              >
                {t('common.delegate.send')}
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}