import { useTranslation } from 'react-i18next';
import { Trash2, TestTube, Settings, ChevronDown, ChevronRight } from 'lucide-react';
import { Button, Badge, StatusBadge } from '../../ui';
import type { ProviderCardProps } from './types';
import styles from './ProviderCard.module.css';

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
    <div className={styles.card}>
      <div className={styles.header} onClick={() => setExpanded(!expanded)}>
        <div className={styles.logo} style={{ background: logo.bg }}>
          {logo.text}
        </div>
        <div className={styles.info}>
          <div className={styles.nameRow}>
            <h3 className={styles.name}>{provider.name}</h3>
            <Badge variant={provider.enabled ? 'success' : 'default'} size="sm">
              {provider.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
          <span className={styles.type}>{provider.provider_type}</span>
        </div>
        <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" icon={<TestTube size={14} />} onClick={() => onTest?.(provider.id)} />
          <Button variant="ghost" size="sm" icon={<Settings size={14} />} onClick={() => onEdit?.(provider)} />
          <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={() => onDelete?.(provider.id)} />
        </div>
        <button className={styles.expandBtn}>
          {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </button>
      </div>
      
      {expanded && provider.models.length > 0 && (
        <div className={styles.models}>
          <div className={styles.modelsHeader}>
            <span>{t('models.models')}</span>
            <span className={styles.modelCount}>{provider.models.length}</span>
          </div>
          <div className={styles.modelList}>
            {provider.models.map((model) => (
              <div key={model.id} className={styles.modelItem}>
                <div className={styles.modelInfo}>
                  <span className={styles.modelName}>{model.name}</span>
                  <span className={styles.modelId}>{model.model_id}</span>
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

import { useState } from 'react';
export type { ProviderCardProps } from './types';
