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
  getZitiClientRuntimeMode,
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
  // ⚠️ 徽章读的是**这次启动实际在用**的模式，不是勾选框 ——
  // 勾选框是「下次启动要什么」，徽章是「现在是什么」；两者不同步时
  // （刚存完未重启 / 环境变量打开的）徽章跟着勾选框变 = 界面在撒谎。
  // null = 判不了（web 构建）⇒ 不出徽章。
  const [runtimeClientMode, setRuntimeClientMode] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  // ⚠️ 加载错与保存错**分开**：加载失败 ⇒ 表没法渲染；保存失败 ⇒ 表必须
  // **留着**让用户改了重试（共用一个状态时，报错会把整张表藏掉）。
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getZitiClientConfig(), getZitiClientRuntimeMode()])
      .then(([cfg, mode]) => {
        if (!cancelled) {
          setConfig(cfg);
          setRuntimeClientMode(mode);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const next = await setZitiClientConfig(config);
      setConfig(next);
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [config]);

  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid="ziti-client-card">
      <div className="mb-2 flex items-center gap-2">
        <Globe size={16} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{t('settings.zitiClient.title')}</h3>
        {runtimeClientMode !== null && (
          <Badge
            variant={runtimeClientMode ? 'success' : 'secondary'}
            size="sm"
            data-testid="ziti-client-runtime-badge"
          >
            {runtimeClientMode
              ? t('settings.zitiClient.badgeOn')
              : t('settings.zitiClient.badgeOff')}
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t('settings.zitiClient.desc')}</p>

      {loadError ? (
        <p className="mt-2 text-xs text-destructive" data-testid="ziti-client-load-error">
          {loadError}
        </p>
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
            {saveError && (
              <p className="text-xs text-destructive" data-testid="ziti-client-error">
                {saveError}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t('settings.zitiClient.secretsHint')}
            </p>
          </div>
        )
      )}
    </div>
  );
}
