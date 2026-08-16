import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Copy,
  Trash2,
  Plus,
  Users,
  KeyRound,
  Clock,
  CheckCircle2,
  Server,
  ExternalLink,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Input,
  Badge,
  Separator,
} from '../components/ui';
import { useGroupStore, type OutgoingPairing } from '../stores/groupStore';

function CopyButton({ value, label }: { value: string; label?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (_err) {
      void _err;
    }
  };
  return (
    <Button size="sm" variant="outline" icon={copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={handle}>
      {copied ? t('common.copied') : label ?? t('common.copy')}
    </Button>
  );
}

function PairingPanel({ pairing, onCancel }: { pairing: OutgoingPairing; onCancel: () => void }) {
  const { t } = useTranslation();
  const remainingMs = Math.max(0, pairing.expiresAt - Date.now());
  const mins = Math.floor(remainingMs / 60080);
  const secs = Math.floor((remainingMs % 60080) / 1000);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> {t('group.pairingActiveTitle')}
        </CardTitle>
        <CardDescription>{t('group.pairingActiveDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-6 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('group.shareCode')}
          </p>
          <p
            className="mt-2 font-mono text-5xl font-bold tracking-widest text-primary"
            aria-label="pairing-code"
          >
            {pairing.code.slice(0, 3)} {pairing.code.slice(3)}
          </p>
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>
              {t('group.expiresIn')} {mins}:{secs.toString().padStart(2, '0')}
            </span>
          </div>
        </div>

        <div className="flex justify-center gap-2">
          <CopyButton value={pairing.code} label={t('group.copyCode')} />
          <Button variant="ghost" icon={<XCircle className="h-4 w-4" />} onClick={onCancel}>
            {t('group.cancel')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function JoinPanel() {
  const { t } = useTranslation();
  const joinPairing = useGroupStore((s) => s.joinPairing);
  const error = useGroupStore((s) => s.error);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!/^\d{6}$/.test(code)) return;
    setBusy(true);
    await joinPairing(code);
    setBusy(false);
    setCode('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-4 w-4" /> {t('group.joinTitle')}
        </CardTitle>
        <CardDescription>{t('group.joinDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            maxLength={6}
            className="font-mono text-center text-lg tracking-widest"
            aria-label={t('group.enterCode')}
          />
          <Button onClick={submit} disabled={busy || !/^\d{6}$/.test(code)}>
            {busy ? t('common.loading') : t('group.join')}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function PeerCard({ id }: { id: string }) {
  const { t } = useTranslation();
  const peer = useGroupStore((s) => s.peers.find((p) => p.id === id));
  const remove = useGroupStore((s) => s.removePeer);
  if (!peer) return null;
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 shrink-0" />
            <p className="font-medium truncate">{peer.name}</p>
            {peer.lastSeen && <Badge variant="success">{t('group.online')}</Badge>}
          </div>
          <p className="mt-1 text-xs font-mono text-muted-foreground truncate">{peer.endpoint}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {peer.capabilities.map((c) => (
              <Badge key={c} variant="outline">
                {c}
              </Badge>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t('group.fingerprint')}: <span className="font-mono">{peer.fingerprint}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {t('group.pairedAt')}: {new Date(peer.pairedAt).toLocaleString()}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          icon={<Trash2 className="h-4 w-4" />}
          onClick={() => remove(peer.id)}
          aria-label={t('common.delete')}
        />
      </CardContent>
    </Card>
  );
}

export function GroupPage() {
  const { t } = useTranslation();
  const peers = useGroupStore((s) => s.peers);
  const outgoing = useGroupStore((s) => s.outgoing);
  const machineId = useGroupStore((s) => s.machineId);
  const fingerprint = useGroupStore((s) => s.fingerprint);
  const initFromTauri = useGroupStore((s) => s.initFromTauri);
  const startPairing = useGroupStore((s) => s.startPairing);
  const cancelPairing = useGroupStore((s) => s.cancelPairing);

  useEffect(() => {
    void initFromTauri();
  }, [initFromTauri]);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="flex items-center gap-2">
            <Users className="h-5 w-5" /> {t('group.title')}
          </h1>
          <p className="subtitle">{t('group.subtitle')}</p>
        </div>
        {!outgoing && (
          <Button onClick={() => void startPairing()} icon={<Plus className="h-4 w-4" />}>
            {t('group.createPairing')}
          </Button>
        )}
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {outgoing && (
          <PairingPanel pairing={outgoing} onCancel={cancelPairing} />
        )}
        <JoinPanel />
      </div>

      <Separator className="my-6" />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          {t('group.peers')} ({peers.length})
          <Link to="/discovery" className="ml-auto text-sm font-normal text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
            {t('group.discoverMore')} <ExternalLink className="h-3 w-3" />
          </Link>
        </h2>
        {peers.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              <Users className="mx-auto mb-2 h-8 w-8 opacity-40" />
              {t('group.noPeers')}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {peers.map((p) => (
              <PeerCard key={p.id} id={p.id} />
            ))}
          </div>
        )}
      </section>

      <Separator className="my-6" />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> {t('group.thisDevice')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">{t('group.machineId')}</span>
            <code className="font-mono text-xs">{machineId ?? '—'}</code>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">{t('group.fingerprint')}</span>
            <code className="font-mono text-xs">{fingerprint ?? '—'}</code>
          </div>
          <p className="text-xs text-muted-foreground pt-2 border-t">
            {t('group.fullMtlshint')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
