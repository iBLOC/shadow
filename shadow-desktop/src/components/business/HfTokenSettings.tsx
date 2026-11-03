import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, CheckCircle, AlertCircle, Loader2, ExternalLink, RefreshCw } from 'lucide-react';
import { safeInvoke } from '../../lib/tauriSafe';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { SettingsCard } from './SettingsCard';

interface HfTokenInfo {
  configured: boolean;
  length?: number;
  preview?: string;
  running?: boolean;
}

/**
 * Lets the user enter (or clear) the HuggingFace auth token used
 * by the neuron runtime for gated-model downloads. The token is
 * forwarded as `HF_TOKEN` to the telencephalon on its next start;
 * the manager signals `running: true` if the telencephalon is already up so
 * the UI can offer a one-click restart.
 */
export function HfTokenSettings({ onSaved }: { onSaved?: () => void }) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<HfTokenInfo | null>(null);
  const [draft, setDraft] = useState('');
  const [showDraft, setShowDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const refresh = async () => {
    try {
      const data = await safeInvoke<HfTokenInfo>('get_hf_token');
      if (data) setInfo(data);
    } catch { /* silent */ }
  };

  useEffect(() => { void refresh(); }, []);

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const result = await safeInvoke<HfTokenInfo>('set_hf_token', { token: draft });
      if (result) {
        setInfo(result);
        setDraft('');
        setShowDraft(false);
        setFeedback({ kind: 'ok', msg: t('settings.hfToken.saved') });
        onSaved?.();
      }
    } catch (e) {
      setFeedback({ kind: 'err', msg: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const result = await safeInvoke<HfTokenInfo>('set_hf_token', { token: '' });
      if (result) {
        setInfo(result);
        setFeedback({ kind: 'ok', msg: t('settings.hfToken.cleared') });
      }
    } catch (e) {
      setFeedback({ kind: 'err', msg: String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard
      icon={<KeyRound size={20} />}
      title={t('settings.hfToken.title')}
      description={t('settings.hfToken.description')}
    >
      <div className="flex flex-col gap-3">
        {/* Status row */}
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          {info?.configured ? (
            <>
              <CheckCircle size={16} className="text-green-500" />
              <span className="text-foreground">
                {t('settings.hfToken.configured', {
                  preview: info.preview,
                  length: info.length,
                })}
              </span>
            </>
          ) : (
            <>
              <AlertCircle size={16} className="text-yellow-500" />
              <span className="text-muted-foreground">{t('settings.hfToken.notConfigured')}</span>
            </>
          )}
          <button
            onClick={refresh}
            className="ml-auto text-muted-foreground hover:text-foreground"
            title={t('common.refresh')}
            aria-label={t('common.refresh')}
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showDraft ? 'text' : 'password'}
              value={draft}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
              placeholder={t('settings.hfToken.placeholder')}
              className="pr-20"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => setShowDraft(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            >
              {showDraft ? t('settings.hfToken.hide') : t('settings.hfToken.show')}
            </button>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving || draft.trim().length === 0}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {t('common.save')}
          </Button>
          {info?.configured && (
            <Button variant="outline" onClick={handleClear} disabled={saving}>
              {t('settings.hfToken.clear')}
            </Button>
          )}
        </div>

        {/* Feedback */}
        {feedback && (
          <div
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
              feedback.kind === 'ok'
                ? 'border-green-500/30 bg-green-500/5 text-green-600 dark:text-green-300'
                : 'border-red-500/30 bg-red-500/5 text-red-500'
            }`}
          >
            {feedback.kind === 'ok' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            <span>{feedback.msg}</span>
          </div>
        )}

        {/* Help link */}
        <a
          href="https://huggingface.co/settings/tokens"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ExternalLink size={12} />
          {t('settings.hfToken.getTokenLink')}
        </a>
      </div>
    </SettingsCard>
  );
}
