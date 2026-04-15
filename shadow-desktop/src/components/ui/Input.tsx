import React, { forwardRef } from 'react';
import styles from './Input.module.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, icon, iconPosition = 'left', fullWidth = true, className = '', ...props }, ref) => {
    const wrapperClass = [
      styles.wrapper,
      fullWidth ? styles.fullWidth : '',
      className,
    ].filter(Boolean).join(' ');

    const inputWrapperClass = [
      styles.inputWrapper,
      error ? styles.error : '',
      icon ? styles.hasIcon : '',
      icon && iconPosition === 'right' ? styles.iconRight : '',
    ].filter(Boolean).join(' ');

    return (
      <div className={wrapperClass}>
        {label && <label className={styles.label}>{label}</label>}
        <div className={inputWrapperClass}>
          {icon && iconPosition === 'left' && <span className={styles.icon}>{icon}</span>}
          <input ref={ref} className={styles.input} {...props} />
          {icon && iconPosition === 'right' && <span className={styles.icon}>{icon}</span>}
        </div>
        {error && <span className={styles.errorText}>{error}</span>}
        {hint && !error && <span className={styles.hint}>{hint}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  fullWidth?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, fullWidth = true, className = '', ...props }, ref) => {
    const wrapperClass = [
      styles.wrapper,
      fullWidth ? styles.fullWidth : '',
      className,
    ].filter(Boolean).join(' ');

    const textareaClass = [
      styles.textarea,
      error ? styles.error : '',
    ].filter(Boolean).join(' ');

    return (
      <div className={wrapperClass}>
        {label && <label className={styles.label}>{label}</label>}
        <textarea ref={ref} className={textareaClass} {...props} />
        {error && <span className={styles.errorText}>{error}</span>}
        {hint && !error && <span className={styles.hint}>{hint}</span>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
  fullWidth?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, fullWidth = true, className = '', ...props }, ref) => {
    const wrapperClass = [
      styles.wrapper,
      fullWidth ? styles.fullWidth : '',
      className,
    ].filter(Boolean).join(' ');

    const selectClass = [
      styles.select,
      error ? styles.error : '',
    ].filter(Boolean).join(' ');

    return (
      <div className={wrapperClass}>
        {label && <label className={styles.label}>{label}</label>}
        <select ref={ref} className={selectClass} {...props}>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <span className={styles.errorText}>{error}</span>}
        {hint && !error && <span className={styles.hint}>{hint}</span>}
      </div>
    );
  }
);

Select.displayName = 'Select';
