import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../ui';
import type { SettingsCardProps } from './types';
import styles from './SettingsCard.module.css';

export function SettingsCard({ title, description, icon, children, actions, variant = 'default' }: SettingsCardProps) {
  return (
    <Card variant="elevated" padding="none" className={`${styles.card} ${variant === 'glass' ? styles.glass : ''}`}>
      <CardHeader className={styles.header}>
        {icon && <div className={styles.icon}>{icon}</div>}
        <div className={styles.titles}>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
      </CardHeader>
      <CardContent className={styles.content}>{children}</CardContent>
      {actions && <CardFooter className={styles.footer}>{actions}</CardFooter>}
    </Card>
  );
}

export type { SettingsCardProps } from './types';
