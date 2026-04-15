import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '../../ui';
import type { ProviderFormProps, ProviderTypeOption } from './types';
import styles from './ProviderForm.module.css';

const DEFAULT_PROVIDER_TYPES: ProviderTypeOption[] = [
  { id: 'openai', name: 'OpenAI', color: '#10a37f' },
  { id: 'anthropic', name: 'Anthropic', color: '#d4a574' },
  { id: 'ollama', name: 'Ollama', color: '#6e5494' },
  { id: 'custom', name: 'Custom', color: '#64748b' },
];

export function ProviderForm({
  value,
  onChange,
  providerTypes = DEFAULT_PROVIDER_TYPES,
  showProviderName = true,
  disabled = false,
}: ProviderFormProps) {
  const { t } = useTranslation();
  const [showApiKey, setShowApiKey] = useState(false);

  const handleProviderTypeChange = (typeId: string) => {
    onChange({ ...value, provider_type: typeId });
  };

  return (
    <div className={styles.form}>
      {showProviderName && (
        <Input
          label={t('models.providerName')}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="OpenAI"
          disabled={disabled}
        />
      )}
      
      <div className={styles.formGroup}>
        <label className={styles.label}>{t('models.providerType')}</label>
        <div className={providerTypes.length > 4 ? styles.typeList : styles.typeGrid}>
          {providerTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              className={`${styles.typeBtn} ${value.provider_type === type.id ? styles.selected : ''}`}
              onClick={() => handleProviderTypeChange(type.id)}
              disabled={disabled}
            >
              <span 
                className={styles.typeDot}
                style={{ background: type.color }}
              />
              {type.name}
            </button>
          ))}
        </div>
      </div>

      <Input
        label={t('models.apiBase')}
        value={value.api_base}
        onChange={(e) => onChange({ ...value, api_base: e.target.value })}
        placeholder="https://api.openai.com/v1"
        disabled={disabled}
      />
      
      <div className={styles.formGroup}>
        <label className={styles.label}>{t('models.apiKey')}</label>
        <div className={styles.apiKeyInput}>
          <input
            type={showApiKey ? 'text' : 'password'}
            value={value.api_key}
            onChange={(e) => onChange({ ...value, api_key: e.target.value })}
            placeholder="sk-..."
            className={styles.input}
            disabled={disabled}
          />
          <button 
            type="button"
            className={styles.toggleVisibility}
            onClick={() => setShowApiKey(!showApiKey)}
            disabled={disabled}
          >
            {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export type { ProviderFormProps } from './types';
