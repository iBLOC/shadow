import { useTranslation } from 'react-i18next';
import { Camera } from 'lucide-react';
import { Button } from '../ui';
import type { VisualQaClarification } from '../../types';

export interface VisualQaClarificationChipProps {
  clarification: VisualQaClarification;
  onPick: (candidate: VisualQaClarification['candidates'][number]) => void;
}

export function VisualQaClarificationChip({
  clarification,
  onPick,
}: VisualQaClarificationChipProps) {
  const { t } = useTranslation();
  return (
    <div
      data-testid="visual-qa-clarification-chip"
      className="flex max-w-full flex-col gap-2 rounded-lg border border-border bg-card p-3"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Camera size={16} aria-hidden="true" />
        <span>{t('conversation.visualQa.pickSource', { defaultValue: '请选择摄像头' })}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {clarification.candidates.map((c) => (
          <Button
            key={c.sourceId}
            variant="outline"
            size="sm"
            data-testid={`visual-qa-candidate-${c.sourceId}`}
            onClick={() => onPick(c)}
          >
            {c.deviceLabel}
            {c.hostLabel ? ` · ${c.hostLabel}` : ''}
          </Button>
        ))}
      </div>
    </div>
  );
}