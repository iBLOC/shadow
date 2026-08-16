import type { ReactNode } from 'react';
import { Button } from '../../ui';

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
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-4 text-base font-semibold text-foreground">{title}</h3>
      <div className="flex flex-col gap-4">{children}</div>
      {(onCancel || onSubmit) && (
        <div className="mt-2 flex justify-end gap-2 border-t border-border pt-4">
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
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-muted-foreground">{label}</label>}
      {children}
    </div>
  );
}

export interface FormRowProps {
  children: ReactNode;
}

export function FormRow({ children }: FormRowProps) {
  return <div className="flex gap-4">{children}</div>;
}
