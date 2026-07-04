import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, TestTube, Settings, ChevronDown, ChevronRight } from 'lucide-react';
import { Button, Badge, StatusBadge } from '../../ui';
import type { ProviderCardProps } from './types';

const PROVIDER_LOGOS: Record<string, { bg: string; text: string }> = {
  openai: { bg: '#10a37f', text: 'AI' },
  anthropic: { bg: '#d4a574', text: 'AN' },
  github_copilot: { bg: '#6e5494', text: 'GH' },
  google: { bg: '#4285f4', text: 'GO' },
  openrouter: { bg: '#7c3aed', text: 'OR' },
  vercel: { bg: '#000000', text: 'VC' },
  minimax: { bg: '#00d2d3', text: 'MM' },
  minimax_cn: { bg: '#00d2d3', text: 'MM' },
  moonshot: { bg: '#8b5cf6', text: 'MS' },
  moonshot_cn: { bg: '#8b5cf6', text: 'MS' },
  zhipu: { bg: '#7c3aed', text: 'ZP' },
  deepseek: { bg: '#6366f1', text: 'DS' },
  grok: { bg: '#f97316', text: 'GR' },
  ollama: { bg: '#6e5494', text: 'OL' },
  custom: { bg: '#64748b', text: 'CS' },
};

export function ProviderCard({ provider, onEdit, onDelete, onTest }: ProviderCardProps) {
  const { t } = useTranslation();
  const logo = PROVIDER_LOGOS[provider.provider_type] || PROVIDER_LOGOS.custom;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex cursor-pointer items-center gap-3 px-4 py-3" onClick={() => setExpanded(!expanded)}>
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white" style={{ background: logo.bg }}>
          {logo.text}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold text-foreground">{provider.name}</h3>
            <Badge variant={provider.enabled ? 'success' : 'default'} size="sm">
              {provider.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">{provider.provider_type}</span>
        </div>
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" icon={<TestTube size={14} />} onClick={() => onTest?.(provider.id)} aria-label={t('models.test')} />
          <Button variant="ghost" size="sm" icon={<Settings size={14} />} onClick={() => onEdit?.(provider)} aria-label={t('common.edit')} />
          <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={() => onDelete?.(provider.id)} aria-label={t('common.delete')} />
        </div>
        <Button size="icon" variant="ghost" aria-label={expanded ? t('common.collapse') : t('common.expand')}>
          {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </Button>
      </div>

      {expanded && provider.models.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-[13px] font-medium text-muted-foreground">
            <span>{t('models.models')}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{provider.models.length}</span>
          </div>
          <div className="flex flex-col gap-2">
            {provider.models.map((model) => (
              <div key={model.id} className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{model.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{model.model_id}</span>
                </div>
                <StatusBadge status={model.enabled ? 'online' : 'offline'} size="sm" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export type { ProviderCardProps } from './types';
