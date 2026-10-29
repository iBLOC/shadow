import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { ShadowMark } from './brand/ShadowMark';
import { useResonanceStore } from '../stores/resonanceStore';
import { useTelencephalonStore } from '../stores/telencephalonStore';
import { desktopNav, type NavItem, type NavSection } from '../navigation/nav.g';
import { cn } from '../lib/utils';

/**
 * 侧栏 —— 导航结构来自 agent-surface.json（由 scripts/gen_nav.mjs 生成）。
 *
 * 为什么分段而不是平铺：对话为主的产品里，12 个平级入口会把「对话」这个
 * 唯一主干稀释掉。现在常驻只留 3 行（对话 / 任务 / 群组），能力收成一块、
 * 低频与运维收进「更多」，默认收起。
 */
export function Layout() {
  const { t } = useTranslation();
  const { pendingTasks } = useResonanceStore();
  const cortexStatus = useTelencephalonStore((s) => s.status);
  const resonanceStatus = useResonanceStore((s) => s.connectionStatus);

  /** 可折叠段默认收起 —— 能力与「更多」是低频，不该占常驻位置 */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const getCortexIndicator = () => {
    if (cortexStatus === 'running' && resonanceStatus === 'connected') {
      return { dot: 'bg-green-500', label: t('common.status.connected') };
    }
    if (cortexStatus === 'running' && resonanceStatus === 'connecting') {
      return { dot: 'bg-yellow-500 animate-pulse', label: t('common.status.connecting') };
    }
    if (cortexStatus === 'starting') {
      return { dot: 'bg-yellow-500 animate-pulse', label: t('common.status.connecting') };
    }
    if (cortexStatus === 'unreachable') {
      return { dot: 'bg-red-500', label: t('common.status.disconnected') };
    }
    return { dot: 'bg-muted-foreground', label: t('common.status.disconnected') };
  };

  return (
    <div className="flex h-screen bg-background text-foreground shadow-ambient">
      <aside className="flex w-[260px] flex-shrink-0 flex-col border-r border-border glass p-4 max-lg:w-20 max-lg:p-3">
        {/* Logo / Header */}
        <div className="mb-6 p-3 max-lg:p-2 max-lg:mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center max-lg:mx-auto">
              <ShadowMark size={28} />
            </div>
            <div className="flex flex-col leading-tight max-lg:hidden">
              <span className="text-lg font-bold tracking-wide">{t('layout.brandName')}</span>
              <span className="text-xs text-muted-foreground tracking-widest uppercase">
                {t('layout.brandSubtitle')}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {desktopNav.sections.map((section) => (
            <NavSectionView
              key={section.id}
              section={section}
              expanded={expanded[section.id] === true}
              onToggle={() => toggle(section.id)}
              badgeFor={(item) =>
                item.id === 'tasks' && pendingTasks.length > 0
                  ? pendingTasks.length
                  : undefined
              }
            />
          ))}
        </nav>

        {/* Footer */}
        <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
          {(() => {
            const indicator = getCortexIndicator();
            return (
              <div className="flex items-center gap-3 rounded-md border border-border bg-muted/50 px-4 py-3 max-lg:hidden">
                <div className={cn('h-2.5 w-2.5 flex-shrink-0 rounded-full', indicator.dot)} />
                <span className="text-xs text-muted-foreground font-medium">
                  {indicator.label}
                </span>
              </div>
            );
          })()}

          {desktopNav.footer.map((item) => (
            <NavEntry key={item.id} item={item} />
          ))}
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}

function NavSectionView({
  section,
  expanded,
  onToggle,
  badgeFor,
}: {
  section: NavSection;
  expanded: boolean;
  onToggle: () => void;
  badgeFor: (item: NavItem) => number | undefined;
}) {
  const { t } = useTranslation();

  if (!section.collapsible) {
    return (
      <div className="space-y-0.5">
        {section.items.map((item) => (
          <NavEntry key={item.id} item={item} badge={badgeFor(item)} />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-2 border-t border-border pt-2 first:mt-0 first:border-t-0 first:pt-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(
          'flex w-full items-center justify-between rounded-md px-4 py-2 text-xs font-semibold uppercase tracking-wider',
          'text-muted-foreground transition-colors hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'max-lg:justify-center max-lg:px-0',
        )}
      >
        <span className="max-lg:hidden">{t(section.labelKey)}</span>
        <ChevronRight
          size={14}
          className={cn(
            'transition-transform duration-200',
            expanded && 'rotate-90',
            'max-lg:hidden',
          )}
        />
      </button>
      {expanded && (
        <div className="mt-1 space-y-0.5">
          {section.items.map((item) => (
            <NavEntry key={item.id} item={item} badge={badgeFor(item)} />
          ))}
        </div>
      )}
    </div>
  );
}

function NavEntry({ item, badge }: { item: NavItem; badge?: number }) {
  const { t } = useTranslation();
  const Icon = item.icon;

  return (
    <NavLink
      to={item.route}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-lg:justify-center max-lg:px-3',
          isActive && 'bg-primary/10 text-foreground',
        )
      }
    >
      <Icon size={20} className="flex-shrink-0" />
      <span className="max-lg:hidden">{t(item.labelKey)}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-[11px] font-semibold text-destructive-foreground min-w-[20px] text-center max-lg:absolute max-lg:top-1 max-lg:right-1 max-lg:min-w-[16px] max-lg:px-1 max-lg:text-[10px]">
          {badge}
        </span>
      )}
    </NavLink>
  );
}
