import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { telencephalonClient } from '@/lib/telencephalonClient';
import {
  AGENT_CAPABILITY_FALLBACK_LABELS,
  normalizeRequiredCapabilities,
  toggleRequiredCapability,
} from '@/lib/agentCapabilities';

/**
 * 「需要哪些模型能力」的多选 —— **agent 注册时声明自己要用什么类型的模型**。
 *
 * ## 词表从哪来
 *
 * ⚠️ **端脑是单一真源**（`GET /api/telencephalon/lobes/capability-defaults`
 * 把合法能力词一起回来）⇒ ⇒ 端脑加了新能力，这里自动多一项；客户端**不
 * 自己造词**（端脑那边是**严格词表**：不认识的词**整个拒绝**）。
 *
 * ## 为什么要有这一项
 *
 * ⚠️ agent 不声明 ⇒ ⇒ 端脑只能「有什么给什么」⇒ ⇒ 一个只要语音识别的
 * agent 也可能被塞一个对话模型 ⇒ ⇒ **配了但没人用**。
 */
export function AgentCapabilityPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const view = await telencephalonClient.getCapabilityDefaults();
        if (cancelled) return;
        setCapabilities(view.capabilities ?? []);
      } catch (e) {
        // ⚠️ 读不到词表 ⇒ 说真话（端脑没起 / 钥匙不对）⇒ ⇒ 不画成
        // 「没有能力可选」。
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = normalizeRequiredCapabilities(value);

  return (
    <div className="flex flex-col gap-2">
      <label className="block text-sm font-medium">
        {t('agents.fieldRequiredCapabilities')}
      </label>
      <p className="text-xs text-muted-foreground">
        {t('agents.requiredCapabilitiesHint')}
      </p>
      {error && (
        <p className="text-xs text-destructive">
          {t('agents.requiredCapabilitiesUnavailable')}: {error}
        </p>
      )}
      {capabilities.length === 0 && !error && (
        <p className="text-xs text-muted-foreground">
          {t('agents.requiredCapabilitiesEmpty')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {capabilities.map((cap) => {
          const checked = selected.includes(cap);
          return (
            <label
              key={cap}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
                checked
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(toggleRequiredCapability(selected, cap))
                }
              />
              {AGENT_CAPABILITY_FALLBACK_LABELS[cap]
                ? t(
                    `capabilityDefaults.${cap}`,
                    AGENT_CAPABILITY_FALLBACK_LABELS[cap],
                  )
                : t(`capabilityDefaults.${cap}`, cap)}
            </label>
          );
        })}
      </div>
    </div>
  );
}
