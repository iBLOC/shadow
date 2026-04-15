import { Outlet, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Brain, 
  Wrench, 
  LayoutGrid, 
  Database, 
  MessageSquare,
  Bot,
  Settings,
  Cpu,
} from 'lucide-react';
import { useResonanceStore } from '../stores/resonanceStore';
import './Layout.css';

const navItems = [
  { path: '/tasks', icon: LayoutGrid, labelKey: 'nav.tasks', showBadge: true },
  { path: '/conversation', icon: MessageSquare, labelKey: 'nav.chat' },
  { path: '/agents', icon: Bot, labelKey: 'nav.agents' },
  { path: '/models', icon: Cpu, labelKey: 'nav.models' },
  { path: '/mcp', icon: Wrench, labelKey: 'nav.mcp' },
  { path: '/skills', icon: Brain, labelKey: 'nav.skills' },
  { path: '/memory', icon: Database, labelKey: 'nav.memory' },
];

export function Layout() {
  const { t } = useTranslation();
  const { pendingTasks, connectionStatus } = useResonanceStore();

  const getConnectionLabel = () => {
    switch (connectionStatus) {
      case 'connected':
        return t('common.status.connected');
      case 'connecting':
        return t('common.status.connecting');
      default:
        return t('common.status.disconnected');
    }
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-container">
            <div className="logo-icon">
              <Brain size={24} />
            </div>
            <div className="logo-text-container">
              <span className="logo-text">{t('layout.brandName')}</span>
              <span className="logo-subtitle">{t('layout.brandSubtitle')}</span>
            </div>
          </div>
        </div>

        <nav className="nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isInbox = item.path === '/tasks/inbox';
            const badgeCount = isInbox ? pendingTasks.length : 0;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => 
                  `nav-item ${isActive ? 'active' : ''}`
                }
              >
                <Icon size={20} />
                <span className="nav-label">{t(item.labelKey)}</span>
                {item.showBadge && badgeCount > 0 && (
                  <span className="nav-badge">{badgeCount}</span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="connection-indicator">
            <div className={`connection-dot ${connectionStatus}`} />
            <span className="connection-label">{getConnectionLabel()}</span>
          </div>
          
          <NavLink
            to="/settings"
            className={({ isActive }) => 
              `nav-item ${isActive ? 'active' : ''}`
            }
          >
            <Settings size={20} />
            <span className="nav-label">{t('nav.settings')}</span>
          </NavLink>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
