import { useTranslation } from 'react-i18next';
import { Camera, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button, Badge, EmptyState } from '../../ui';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { useVideoSourceStore } from '../../../stores/videoSourceStore';
import { SourceRow } from './SourceRow';
import { AvailableDeviceRow } from './AvailableDeviceRow';

export function VideoSourcesCard() {
  const { t } = useTranslation();
  const state = useVideoSourceStore();

  const sources = Array.from(state.catalog.values());
  const available = Array.from(state.available.values());
  const activeId = state.activeId;
  const activeCount = sources.filter((s) => s.active).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-muted-foreground" />
            <CardTitle>{t('videoSources.title')}</CardTitle>
          </div>
          <Badge variant={state.sync === 'idle' ? 'default' : 'destructive'}>
            {state.sync === 'idle'
              ? t('videoSources.statusSynced')
              : t('videoSources.statusStale')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Sync status */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          {state.sync === 'idle' ? (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          ) : (
            <AlertCircle className="h-4 w-4 text-yellow-500" />
          )}
          <span>
            {sources.length} {t('videoSources.sourcesHeader')},{' '}
            {activeCount} {t('videoSources.activeBadge')}
          </span>
        </div>

        {/* Sources list */}
        {sources.length === 0 ? (
          <EmptyState
            icon={<Camera />}
            title={t('videoSources.emptyNoDevices')}
            description={t('videoSources.emptyHint')}
          />
        ) : (
          <div className="space-y-2">
            {sources.map((s) => (
              <SourceRow
                key={s.id}
                source={s}
                isActive={s.id === activeId}
                onMakeActive={() => state.setActive(s.id)}
                onRemove={() => state.remove(s.id)}
              />
            ))}
          </div>
        )}

        {/* Available devices */}
        {available.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium mb-2">{t('videoSources.availableHeader')}</h4>
            <div className="space-y-1">
              {available.map((d) => (
                <AvailableDeviceRow
                  key={d.deviceId}
                  device={d}
                  onAdd={() => state.addFromAvailable(d.deviceId)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Refresh button */}
        <div className="flex justify-end mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => state.refreshFromTelencephalon()}
            disabled={state.sync === 'pushing'}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            {t('videoSources.rescan')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
