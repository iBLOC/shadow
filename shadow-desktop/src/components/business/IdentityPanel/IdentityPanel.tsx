import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Download, Upload, User } from 'lucide-react';

import { Button } from '../../ui';
import { safeInvoke } from '../../../lib/tauriSafe';
import { useIdentityStore } from '../../../stores/identityStore';
import { useTelencephalonStore } from '../../../stores/telencephalonStore';

/**
 * 「当前是谁」—— 以及**把这台设备变成另一个人**。
 *
 * ## 这一块在干什么
 *
 * 端脑持有**账号级身份**：账号密钥派生出 principal（人）与默认人格
 * （记忆的隔离单元）⇒ 两台设备导入同一个账号之后，它们是**同一个人**、
 * 写进**同一份记忆**。
 *
 * 这一块给出搬运这个账号的两条路：
 *
 * - **导出** —— 把账号密钥拿出来，拿到另一台设备导入；
 * - **导入** —— 把另一台设备导出的码贴进来，这台设备从此是那个人。
 *
 * ## ⚠️ 导出的是身份本身
 *
 * 账号密钥像密码管理器的恢复码：**持有它的人就是那个人**（记忆也归
 * 那个人）。所以：
 *
 * - 导出**不走端脑的 HTTP 面** —— 那张面在 loopback 上，能连上它就
 *   意味着「本机任意进程」，把账号密钥放到那儿等于把身份发出去 ⇒
 *   走 Tauri 命令（进程内，不上线）；
 * - 导出的码**默认不显示**，要用户点了才亮出来 —— 它不该出现在截屏、
 *   录屏或者别人的肩膀后面。
 */
export function IdentityPanel() {
  const { t } = useTranslation();
  const principal = useIdentityStore((s) => s.principal);
  const persona = useIdentityStore((s) => s.persona);
  const device = useIdentityStore((s) => s.device);
  const identified = useIdentityStore((s) => s.identified);
  const tenantId = useIdentityStore((s) => s.tenantId);
  const resolve = useIdentityStore((s) => s.resolve);
  const shadowKey = useTelencephalonStore((s) => s.connection.apiKey);

  const [exportedCode, setExportedCode] = useState<string | null>(null);
  const [importCode, setImportCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    // ⚠️ 走 Tauri 命令，不走 HTTP —— 账号密钥不该上网络面。
    const code = await safeInvoke<string>('identity_export');
    setBusy(false);
    if (code) {
      setExportedCode(code);
    } else {
      setMessage(t('identity.exportFailed'));
    }
  }, [t]);

  const handleImport = useCallback(async () => {
    const code = importCode.trim();
    if (!code) return;
    setBusy(true);
    setMessage(null);
    const result = await safeInvoke<{ persona?: string | null }>(
      'identity_import',
      { code, shadowKey },
    );
    setBusy(false);
    if (!result) {
      setMessage(t('identity.importFailed'));
      return;
    }
    // 导入换了人 ⇒ 人格变了 ⇒ 租户也得跟着变 ⇒ **强制重问端脑**。
    await resolve({ force: true });
    setImportCode('');
    setExportedCode(null);
    setMessage(t('identity.importDone'));
  }, [importCode, resolve, shadowKey, t]);

  const handleCopy = useCallback(async () => {
    if (!exportedCode) return;
    try {
      await navigator.clipboard.writeText(exportedCode);
      setMessage(t('identity.copied'));
    } catch {
      setMessage(t('identity.copyFailed'));
    }
  }, [exportedCode, t]);

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="text-muted-foreground">
          <User size={20} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground">
            {t('identity.currentTitle')}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('identity.currentDesc')}
          </p>
        </div>
      </div>

      <div className="space-y-3 p-5">
        <InfoRow label={t('identity.principal')} value={principal ?? t('identity.nobody')} />
        <InfoRow label={t('identity.persona')} value={persona ?? t('identity.nobody')} />
        <InfoRow label={t('identity.device')} value={device ?? t('identity.nobody')} />
        <InfoRow label={t('identity.tenant')} value={tenantId} />
        {!identified && (
          <p className="text-xs text-muted-foreground">{t('identity.nobodyHint')}</p>
        )}
      </div>

      <div className="border-t border-border p-5">
        <h4 className="text-sm font-medium text-foreground">
          {t('identity.exportTitle')}
        </h4>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t('identity.exportDesc')}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void handleExport()}>
            <Download size={14} />
            {t('identity.exportAction')}
          </Button>
          {exportedCode && (
            <>
              <Button size="sm" variant="ghost" onClick={() => void handleCopy()}>
                <Copy size={14} />
                {t('identity.copy')}
              </Button>
              <code className="max-w-full truncate rounded bg-muted/40 px-2 py-1 font-mono text-xs text-foreground">
                {exportedCode}
              </code>
            </>
          )}
        </div>
      </div>

      <div className="border-t border-border p-5">
        <h4 className="text-sm font-medium text-foreground">
          {t('identity.importTitle')}
        </h4>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t('identity.importDesc')}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={importCode}
            onChange={(e) => setImportCode(e.target.value)}
            placeholder={t('identity.importPlaceholder')}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
            spellCheck={false}
            autoComplete="off"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !importCode.trim()}
            onClick={() => void handleImport()}
          >
            <Upload size={14} />
            {t('identity.importAction')}
          </Button>
        </div>
      </div>

      {message && (
        <div className="border-t border-border bg-muted/30 px-5 py-3">
          <span className="text-xs text-muted-foreground">{message}</span>
        </div>
      )}
    </div>
  );
}

/** 一行「标签 —— 值」。 */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-xs text-foreground">{value}</span>
    </div>
  );
}
