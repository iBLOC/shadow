import { Outlet, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Brain,
  Wrench,
  LayoutGrid,
  Database,
  MessageSquare,
  Settings,
  ScrollText,
  Workflow,
  Activity,
  MousePointer,
  GitBranch,
  FileCode,
  MessageSquareQuote,
  type LucideIcon,
} from 'lucide-react';
import { useResonanceStore } from '../stores/resonanceStore';
import { useTelencephalonStore } from '../stores/telencephalonStore';
import { cn } from '../lib/utils';

interface NavItem {
  path: string;
  icon: LucideIcon;
  labelKey: string;
  showBadge?: boolean;
}

const navItems: NavItem[] = [
  { path: '/tasks', icon: LayoutGrid, labelKey: 'nav.tasks', showBadge: true },
  { path: '/conversation', icon: MessageSquare, labelKey: 'nav.chat' },
  { path: '/flows', icon: Workflow, labelKey: 'nav.flows' },
  { path: '/trace', icon: Activity, labelKey: 'nav.trace' },
  { path: '/computer-use', icon: MousePointer, labelKey: 'nav.computerUse' },
  { path: '/workflow-studio', icon: GitBranch, labelKey: 'nav.workflowStudio' },
  { path: '/mcp', icon: Wrench, labelKey: 'nav.mcp' },
  { path: '/jdm-editor', icon: FileCode, labelKey: 'nav.jdmEditor' },
  { path: '/skills', icon: Brain, labelKey: 'nav.skills' },
  { path: '/prompt-settings', icon: MessageSquareQuote, labelKey: 'nav.promptSettings' },
  { path: '/memory', icon: Database, labelKey: 'nav.memory' },
  { path: '/logs', icon: ScrollText, labelKey: 'nav.logs' },
];

export function Layout() {
  const { t } = useTranslation();
  const { pendingTasks } = useResonanceStore();
  const cortexStatus = useTelencephalonStore((s) => s.status);
  const resonanceStatus = useResonanceStore((s) => s.connectionStatus);

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
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground max-lg:mx-auto">
              <Brain size={24} />
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
        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isInbox = item.path === '/tasks/inbox';
            const badgeCount = isInbox ? pendingTasks.length : 0;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-lg:justify-center max-lg:px-3',
                    isActive && 'bg-primary/10 text-foreground'
                  )
                }
              >
                <Icon size={20} className="flex-shrink-0" />
                <span className="max-lg:hidden">{t(item.labelKey)}</span>
                {item.showBadge && badgeCount > 0 && (
                  <span className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-[11px] font-semibold text-destructive-foreground min-w-[20px] text-center max-lg:absolute max-lg:top-1 max-lg:right-1 max-lg:min-w-[16px] max-lg:px-1 max-lg:text-[10px]">
                    {badgeCount}
                  </span>
                )}
              </NavLink>
            );
          })}
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

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground max-lg:justify-center max-lg:px-3',
                isActive && 'bg-primary/10 text-foreground'
              )
            }
          >
            <Settings size={20} className="flex-shrink-0" />
            <span className="max-lg:hidden">{t('nav.settings')}</span>
          </NavLink>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
