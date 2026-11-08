import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, CheckCircle, AlertCircle, Loader2, ExternalLink, RefreshCw } from 'lucide-react';
import { safeInvokeOrThrow } from '../../lib/tauriSafe';
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
  /**
   * **读不到 ≠ 没有** —— 读 token 状态的三态：
   * `unknown`（还没读）／`ready`（读到了）／`failed`（**读失败**）。
   * ⚠️ 读失败时**不许**显示成「未配置」⇒ ⇒ 那是在说谎。
   */
  const [readState, setReadState] = useState<'unknown' | 'ready' | 'failed'>('unknown');
  const [readError, setReadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [showDraft, setShowDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const refresh = async () => {
    try {
      // ⚠️ **不能用 `safeInvoke`** —— 它自己把错误吞成 fallback（null）
      // ⇒ ⇒ 连下面的 catch 都进不去 ⇒ ⇒ 原因**根本没机会**被带出来。
      const data = await safeInvokeOrThrow<HfTokenInfo>('get_hf_token');
      setInfo(data);
      setReadState('ready');
      setReadError(null);
    } catch (e) {
      // ⚠️ **读不到 ≠ 没有** —— 以前这里是 `safeInvoke` ＋ `catch { /* silent */ }`
      // ⇒ ⇒ 界面永远显示「未配置」，而真相是：**读失败是常态**
      // （Tauri 命令 `get_hf_token` 早已被删）⇒ ⇒ 现在说「读不到」＋原因（原文）。
      setInfo(null);
      setReadState('failed');
      setReadError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => { void refresh(); }, []);

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const result = await safeInvokeOrThrow<HfTokenInfo>('set_hf_token', { token: draft });
      setInfo(result);
      setDraft('');
      setShowDraft(false);
      setFeedback({ kind: 'ok', msg: t('settings.hfToken.saved') });
      onSaved?.();
    } catch (e) {
      // ⚠️ **上下文（译文）＋ 原因（原文）** —— 以前这里只有裸的 String(e)。
      setFeedback({
        kind: 'err',
        msg: t('settings.hfToken.saveFailed') + ' ' + (e instanceof Error ? e.message : String(e)),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const result = await safeInvokeOrThrow<HfTokenInfo>('set_hf_token', { token: '' });
      setInfo(result);
      setFeedback({ kind: 'ok', msg: t('settings.hfToken.cleared') });
    } catch (e) {
      // ⚠️ **上下文（译文）＋ 原因（原文）** —— 以前这里只有裸的 String(e)。
      setFeedback({
        kind: 'err',
        msg: t('settings.hfToken.clearFailed') + ' ' + (e instanceof Error ? e.message : String(e)),
      });
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
          {readState === 'failed' ? (
            <>
              <AlertCircle size={16} className="text-red-500" />
              {/* ⚠️ **读不到 ≠ 没有** —— 读失败时**不许**显示「未配置」。 */}
              <span className="text-destructive" data-testid="hf-token-read-error">
                {t('settings.hfToken.readFailed')} {readError}
              </span>
            </>
          ) : readState === 'unknown' ? (
            <>
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">{t('settings.hfToken.statusUnknown')}</span>
            </>
          ) : info?.configured ? (
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
