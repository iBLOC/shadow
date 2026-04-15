import { ReactNode } from 'react';
import { Button } from './Button';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  size?: 'sm' | 'md' | 'lg';
  glass?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'md',
  glass = false,
}: EmptyStateProps) {
  const iconSizeMap = { sm: 32, md: 48, lg: 64 };
  const iconSize = iconSizeMap[size];

  return (
    <div className={`${styles.container} ${styles[size]} ${glass ? styles.glass : ''} ${styles.animate}`}>
      {icon && (
        <div className={styles.iconWrapper} style={{ width: iconSize, height: iconSize }}>
          <div className={styles.icon}>{icon}</div>
          <div className={styles.iconGlow} />
        </div>
      )}
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.description}>{description}</p>}
      {action && (
        <Button onClick={action.onClick} variant="secondary" className={styles.action}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
