import { useTranslation } from 'react-i18next';
import { CheckCircle2, Trash2, Radio } from 'lucide-react';
import { Button, Badge } from '../../ui';
import type { VideoSource } from '../../../stores/videoSourceStore';
import { cn } from '../../../lib/utils';

interface SourceRowProps {
  source: VideoSource;
  isActive: boolean;
  onMakeActive: () => void;
  onRemove: () => void;
}

export function SourceRow({ source, isActive, onMakeActive, onRemove }: SourceRowProps) {
  const { t } = useTranslation();
  const caps = source.capabilities as Record<string, unknown>;
  const width = (caps?.widths as number[])?.[0] ?? 0;
  const height = (caps?.heights as number[])?.[0] ?? 0;
  const fps = (caps?.frameRates as number[])?.[0] ?? 0;

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-md border p-3',
        isActive && 'border-primary bg-primary/5',
      )}
    >
      <div className="flex items-center gap-3">
        {isActive ? (
          <CheckCircle2 className="h-4 w-4 text-primary" />
        ) : (
          <Radio className="h-4 w-4 text-muted-foreground" />
        )}
        <div>
          <div className="font-medium">{source.label}</div>
          <div className="text-xs text-muted-foreground">
            {width > 0
              ? `${width}x${height} @ ${fps}fps`
              : t('videoSources.capabilitiesUnknown')}
            {source.serial
              ? ` · serial ${source.serial}`
              : ` · ${t('videoSources.serialUnknown')}`}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isActive && (
          <Badge variant="default" className="text-xs">
            {t('videoSources.activeBadge')}
          </Badge>
        )}
        {!isActive && (
          <Button variant="ghost" size="sm" onClick={onMakeActive}>
            {t('videoSources.makeActive')}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
