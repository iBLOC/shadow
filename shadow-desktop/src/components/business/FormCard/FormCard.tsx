import type { ReactNode } from 'react';
import { Button } from '../../ui';
import styles from './FormCard.module.css';

export interface FormCardProps {
  title: string;
  children: ReactNode;
  onCancel?: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  disabled?: boolean;
}

export function FormCard({
  title,
  children,
  onCancel,
  onSubmit,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  isSubmitting = false,
  disabled = false,
}: FormCardProps) {
  return (
    <div className={styles.formCard}>
      <h3 className={styles.title}>{title}</h3>
      <div className={styles.content}>
        {children}
      </div>
      {(onCancel || onSubmit) && (
        <div className={styles.actions}>
          {onCancel && (
            <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
              {cancelLabel}
            </Button>
          )}
          {onSubmit && (
            <Button variant="primary" onClick={onSubmit} loading={isSubmitting} disabled={disabled}>
              {submitLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export interface FormGroupProps {
  label?: string;
  children: ReactNode;
}

export function FormGroup({ label, children }: FormGroupProps) {
  return (
    <div className={styles.formGroup}>
      {label && <label>{label}</label>}
      {children}
    </div>
  );
}

export interface FormRowProps {
  children: ReactNode;
}

export function FormRow({ children }: FormRowProps) {
  return <div className={styles.formRow}>{children}</div>;
}
