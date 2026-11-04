/**
 * 「切到远端大脑」卡片 —— 零信任**客户端**模式的设置面。
 *
 * ## 它回答用户什么问题
 *
 * 「这台桌面现在到底在跟哪台大脑说话？」—— 开着 ⇒ 经零信任网打
 * **远端**大脑（60080 上是代理）；关着（默认）⇒ 打**本地** sidecar。
 *
 * ## ⚠️ 保存 ≠ 生效（必须在界面上说清）
 *
 * 60080 上坐谁是**启动时**定死的 ⇒⇒ 保存只落盘，**重启后生效**。
 * 不写这条 ⇒ 「开了开关却没反应」会被当成坏了。
 *
 * ## ⚠️ 凭据不在这里填
 *
 * shadow key / admin token 仍走环境变量（`ZITI_CLIENT_SHADOW_KEY` /
 * `ZITI_CLIENT_ADMIN_TOKEN`）⇒⇒ 这份配置**不含秘密**（落盘被拷走
 * 也换不来门）。界面要说清，否则用户会在这里找填钥匙的框。
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { Badge, Button, Input, Label } from '../ui';
import {
  getZitiClientConfig,
  setZitiClientConfig,
  type ZitiClientConfig as ZitiClientConfigValue,
} from '../../lib/zitiClientConfig';

export function ZitiClientCard() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<ZitiClientConfigValue>({
    enabled: false,
    identityPath: '',
    service: '',
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getZitiClientConfig()
      .then((cfg) => {
        if (!cancelled) {
          setConfig(cfg);
          setLoaded(true);
        }
      })
      .catch((e) => {
        // 非 Tauri 环境（web 预览）拿不到命令 ⇒ 明确说「不可用」，
        // 不把表渲染成「可交互但永远存不上」的样子。
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await setZitiClientConfig(config);
      setConfig(next);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [config]);

  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid="ziti-client-card">
      <div className="mb-2 flex items-center gap-2">
        <Globe size={16} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{t('settings.zitiClient.title')}</h3>
        <Badge variant={config.enabled ? 'success' : 'secondary'} size="sm">
          {config.enabled
            ? t('settings.zitiClient.badgeOn')
            : t('settings.zitiClient.badgeOff')}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{t('settings.zitiClient.desc')}</p>

      {error ? (
        <p className="mt-2 text-xs text-destructive" data-testid="ziti-client-error">{error}</p>
      ) : (
        loaded && (
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                data-testid="ziti-client-enabled"
                checked={config.enabled}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, enabled: e.target.checked }))
                }
              />
              {t('settings.zitiClient.enable')}
            </label>
            <div className="space-y-1">
              <Label htmlFor="ziti-identity-path">{t('settings.zitiClient.identityPath')}</Label>
              <Input
                id="ziti-identity-path"
                data-testid="ziti-identity-path"
                value={config.identityPath}
                disabled={!config.enabled}
                placeholder={t('settings.zitiClient.identityPathPlaceholder')}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, identityPath: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ziti-service">{t('settings.zitiClient.service')}</Label>
              <Input
                id="ziti-service"
                data-testid="ziti-service"
                value={config.service}
                disabled={!config.enabled}
                placeholder={t('settings.zitiClient.servicePlaceholder')}
                onChange={(e) => setConfig((c) => ({ ...c, service: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={handleSave} disabled={saving} data-testid="ziti-client-save">
                {t('settings.saveChanges')}
              </Button>
              {saved && (
                <span className="text-xs text-muted-foreground" data-testid="ziti-client-saved">
                  {t('settings.zitiClient.savedHint')}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.zitiClient.secretsHint')}
            </p>
          </div>
        )
      )}
    </div>
  );
}
