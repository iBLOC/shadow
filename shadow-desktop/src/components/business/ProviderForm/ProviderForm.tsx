import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import { Button, Input } from '../../ui';
import type { ProviderFormProps, ProviderTypeOption } from './types';
import { cn } from '../../../lib/utils';

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
    <div className="flex flex-col gap-4">
      {showProviderName && (
        <Input
          label={t('models.providerName')}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="OpenAI"
          disabled={disabled}
        />
      )}

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-muted-foreground">{t('models.providerType')}</label>
        <div className={cn(
          providerTypes.length > 4 ? 'flex max-h-[200px] flex-col gap-1.5 overflow-y-auto' : 'grid grid-cols-2 gap-2'
        )}>
          {providerTypes.map((type) => (
            <Button
              key={type.id}
              type="button"
              variant={value.provider_type === type.id ? 'default' : 'outline'}
              onClick={() => handleProviderTypeChange(type.id)}
              disabled={disabled}
              className="flex items-center justify-start gap-2"
            >
              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: type.color }} />
              {type.name}
            </Button>
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

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-muted-foreground">{t('models.apiKey')}</label>
        <div className="relative flex items-center">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={value.api_key}
            onChange={(e) => onChange({ ...value, api_key: e.target.value })}
            placeholder="sk-..."
            disabled={disabled}
            className="w-full rounded-md border border-border bg-muted py-2.5 pr-10 pl-3 text-sm text-foreground focus:border-foreground focus:outline-none disabled:opacity-60"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute right-3"
            onClick={() => setShowApiKey(!showApiKey)}
            disabled={disabled}
            aria-label={showApiKey ? t('common.hidePassword') : t('common.showPassword')}
          >
            {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </Button>
        </div>
      </div>
    </div>
  );
}

export type { ProviderFormProps } from './types';
