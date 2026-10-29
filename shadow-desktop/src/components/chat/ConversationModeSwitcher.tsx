import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { desktopNav } from '../../navigation/nav.g';
import { cn } from '../../lib/utils';

/**
 * 对话形态切换器。
 *
 * 同一个 agent 的不同**表达形态**是对话的方式，不是并列的导航入口 ——
 * 所以它们不进侧栏，而是由对话页自己切换。
 *
 * 形态清单来自 agent-surface.json（scripts/gen_nav.mjs 生成）。
 */
export function ConversationModeSwitcher() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const modes = desktopNav.conversationModes;

  // 只有一种形态时不显示切换器（桌面端目前是「对话 / 语音」）
  if (modes.length <= 1) return null;

  return (
    <div
      role="tablist"
      aria-label={t('nav.section.converse')}
      className="flex flex-shrink-0 items-center gap-1 border-b border-border bg-card/50 px-3 py-2"
    >
      {modes.map((mode) => {
        const active = location.pathname === mode.route;
        const Icon = mode.icon;
        return (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => navigate(mode.route)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-primary/10 text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon size={15} className="flex-shrink-0" />
            {t(mode.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
