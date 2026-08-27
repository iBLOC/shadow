import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '../../ui';
import type { RawDevice } from '../../../stores/videoSourceStore';

interface AvailableDeviceRowProps {
  device: RawDevice;
  onAdd: () => void;
}

export function AvailableDeviceRow({ device, onAdd }: AvailableDeviceRowProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between rounded-md border p-2">
      <span className="text-sm">
        {device.label}
        {device.serial ? ` · serial ${device.serial}` : ''}
      </span>
      <Button variant="ghost" size="sm" onClick={onAdd}>
        <Plus className="h-4 w-4 mr-1" />
        {t('videoSources.add')}
      </Button>
    </div>
  );
}
