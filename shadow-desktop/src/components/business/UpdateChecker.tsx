import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { safeInvoke } from '../../lib/tauriSafe';
import { isTauri } from '../../lib/platform';

interface UpdateInfo {
  version: string;
  date: string;
  body?: string;
}

export function UpdateChecker() {
  const { t } = useTranslation();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isUpdated, setIsUpdated] = useState(false);

  const checkForUpdates = async () => {
    if (!isTauri()) return;
    
    setIsChecking(true);
    setError(null);
    try {
      const result = await safeInvoke<{ available: boolean; version?: string; date?: string; body?: string }>('check_for_updates');
      if (result?.available) {
        setUpdateInfo({
          version: result.version || 'unknown',
          date: result.date || '',
          body: result.body,
        });
      } else {
        setUpdateInfo(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to check for updates');
    } finally {
      setIsChecking(false);
    }
  };

  const downloadUpdate = async () => {
    if (!isTauri()) return;
    
    setIsDownloading(true);
    setDownloadProgress(0);
    setError(null);
    try {
      await safeInvoke('download_update', {
        onProgress: (progress: number) => {
          setDownloadProgress(progress);
        },
      });
      setIsUpdated(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to download update');
    } finally {
      setIsDownloading(false);
    }
  };

  const installUpdate = async () => {
    if (!isTauri()) return;
    
    try {
      await safeInvoke('install_update');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to install update');
    }
  };

  useEffect(() => {
    checkForUpdates();
  }, []);

  if (!isTauri()) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Download size={20} />
          <h3 className="font-semibold">{t('update.title')}</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={checkForUpdates}
          disabled={isChecking}
        >
          {isChecking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            t('update.check')
          )}
        </Button>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-600">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {isUpdated && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-600">
          <CheckCircle size={16} />
          {t('update.updated')}
        </div>
      )}

      {updateInfo && !isUpdated && (
        <div className="mt-3">
          <p className="text-sm text-muted-foreground">
            {t('update.available', { version: updateInfo.version })}
          </p>
          {updateInfo.body && (
            <p className="mt-2 text-sm">{updateInfo.body}</p>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={downloadUpdate}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('update.downloading', { progress: downloadProgress })}
                </>
              ) : (
                t('update.download')
              )}
            </Button>
            {downloadProgress === 100 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={installUpdate}
              >
                {t('update.install')}
              </Button>
            )}
          </div>
        </div>
      )}

      {!updateInfo && !error && !isUpdated && !isChecking && (
        <p className="mt-3 text-sm text-muted-foreground">
          {t('update.noUpdates')}
        </p>
      )}
    </div>
  );
}
