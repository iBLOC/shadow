import { Loader2 } from 'lucide-react';
import styles from './Loading.module.css';

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  fullScreen?: boolean;
}

export function Loading({ size = 'md', text, fullScreen = false }: LoadingProps) {
  const sizeMap = { sm: 16, md: 24, lg: 32 };
  const spinnerSize = sizeMap[size];

  if (fullScreen) {
    return (
      <div className={styles.fullScreen}>
        <div className={styles.spinnerWrapper}>
          <Loader2 size={spinnerSize} className={styles.spinner} />
          <div className={styles.spinnerGlow} />
        </div>
        {text && <p className={styles.text}>{text}</p>}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.spinnerWrapper}>
        <Loader2 size={spinnerSize} className={styles.spinner} />
        <div className={styles.spinnerGlow} />
      </div>
      {text && <p className={styles.text}>{text}</p>}
    </div>
  );
}

export function Skeleton({
  width,
  height = 20,
  borderRadius = 'md',
  className = '',
}: {
  width?: string | number;
  height?: number;
  borderRadius?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
}) {
  const radiusMap = { sm: '4px', md: '8px', lg: '12px', full: '9999px' };

  return (
    <div
      className={`${styles.skeleton} ${className}`}
      style={{
        width: width ?? '100%',
        height,
        borderRadius: radiusMap[borderRadius],
      }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className={`${styles.skeletonCard} ${styles.animate}`}>
      <div className={styles.skeletonHeader}>
        <Skeleton width={40} height={40} borderRadius="lg" />
        <div className={styles.skeletonText}>
          <Skeleton width="60%" height={16} />
          <Skeleton width="40%" height={12} />
        </div>
      </div>
      <Skeleton width="100%" height={60} borderRadius="md" />
      <div className={styles.skeletonFooter}>
        <Skeleton width={80} height={24} borderRadius="full" />
        <Skeleton width={60} height={24} borderRadius="full" />
      </div>
    </div>
  );
}
