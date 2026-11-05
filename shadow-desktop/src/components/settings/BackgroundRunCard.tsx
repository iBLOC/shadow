/**
 * 「后台常驻」卡片 —— 自启动 ＋ 托盘常驻说明的设置面。
 *
 * ## 它回答用户什么问题
 *
 * 「我关了窗口 / 重启了电脑，Shadow 还在吗？」—— 托盘常驻（关窗隐藏）
 * 是既有行为；这张卡补**开机自启**开关。卡片顺带把「后台期间发生了
 * 什么会通知我」说清楚，不然用户以为藏进托盘 = 失联。
 *
 * ## ⚠️ 判不了 ≠ 未开启
 *
 * web 构建拿不到自启能力 ⇒ 状态是 **null** —— 开关禁用 ＋ 明说
 * 「仅桌面应用可用」，**不许**显示成「未开启」（那是撒谎）。
 *
 * ## ⚠️ 保存失败要说出来
 *
 * enable/disable 失败（权限/平台拒绝）⇒ 错误行显示，开关回弹到
 * 真实状态 —— 不许「点了没反应」也不许「显示成功其实没成」。
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Power } from 'lucide-react';
import { Badge } from '../ui';
import { isAutostartEnabled, setAutostartEnabled } from '../../lib/backgroundRun';

export function BackgroundRunCard() {
  const { t } = useTranslation();
  // null = 判不了（web 构建）⇒ 开关禁用 ＋ 出提示，不出「未开启」徽章。
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    isAutostartEnabled().then((v) => {
      if (!cancelled) setEnabled(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = useCallback(
    async (next: boolean) => {
      setBusy(true);
      setError(null);
      try {
        await setAutostartEnabled(next);
        setEnabled(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        // 回弹到真实状态 —— 失败不许把开关留在「看起来成了」的位置。
        setEnabled(await isAutostartEnabled());
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const undeterminable = enabled === null;

  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid="background-run-card">
      <div className="mb-2 flex items-center gap-2">
        <Power size={16} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">
          {t('settings.backgroundRun.title')}
        </h3>
        {enabled !== null && (
          <Badge
            variant={enabled ? 'success' : 'secondary'}
            size="sm"
            data-testid="background-run-badge"
          >
            {enabled
              ? t('settings.backgroundRun.badgeOn')
              : t('settings.backgroundRun.badgeOff')}
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {t('settings.backgroundRun.desc')}
      </p>

      <div className="mt-3 flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            data-testid="background-run-enabled"
            checked={enabled === true}
            disabled={undeterminable || busy}
            onChange={(e) => void handleToggle(e.target.checked)}
          />
          {t('settings.backgroundRun.enable')}
        </label>
      </div>

      {undeterminable && (
        <p className="mt-2 text-xs text-muted-foreground" data-testid="background-run-web-hint">
          {t('settings.backgroundRun.webHint')}
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-destructive" data-testid="background-run-error">
          {error}
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {t('settings.backgroundRun.notifyHint')}
      </p>
    </div>
  );
}
