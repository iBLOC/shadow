import type { ReactNode } from 'react';
import { Badge } from '../../ui';
import styles from './EntityCard.module.css';

export interface EntityCardProps {
  header?: {
    icon?: ReactNode;
    title: string;
    subtitle?: string;
    badge?: string;
    badgeVariant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  };
  children?: ReactNode;
  actions?: ReactNode;
  onClick?: () => void;
  expanded?: boolean;
  onExpand?: () => void;
}

export function EntityCard({
  header,
  children,
  actions,
  onClick,
  expanded,
  onExpand,
}: EntityCardProps) {
  return (
    <div className={styles.card}>
      {header && (
        <div 
          className={`${styles.header} ${onClick ? styles.clickable : ''}`}
          onClick={onClick}
        >
          <div className={styles.headerMain}>
            {header.icon && <div className={styles.icon}>{header.icon}</div>}
            <div className={styles.info}>
              <div className={styles.titleRow}>
                <h3 className={styles.title}>{header.title}</h3>
                {header.badge && (
                  <Badge variant={header.badgeVariant || 'default'} size="sm">
                    {header.badge}
                  </Badge>
                )}
              </div>
              {header.subtitle && (
                <span className={styles.subtitle}>{header.subtitle}</span>
              )}
            </div>
          </div>
          <div className={styles.headerActions}>
            {actions}
            {onExpand && (
              <button className={styles.expandBtn} onClick={(e) => { e.stopPropagation(); onExpand(); }}>
                {expanded ? '▼' : '▶'}
              </button>
            )}
          </div>
        </div>
      )}
      {expanded && children && (
        <div className={styles.content}>
          {children}
        </div>
      )}
    </div>
  );
}
