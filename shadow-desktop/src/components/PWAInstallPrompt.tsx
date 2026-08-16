import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, X } from 'lucide-react';
import { isWeb, isTauri } from '../lib/platform';
import { Button } from './ui';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'shadow.pwa.install.dismissed';
const DISMISS_DAYS = 7;

export function PWAInstallPrompt() {
  const { t } = useTranslation();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isTauri()) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }

    const lastDismiss = localStorage.getItem(DISMISS_KEY);
    if (lastDismiss) {
      const days = (Date.now() - Number(lastDismiss)) / 86400000;
      if (days < DISMISS_DAYS) return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setShow(false);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!show || installed || !isWeb()) return null;

  const accept = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setShow(false);
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  };

  return (
    <div className="pwa-install-prompt" role="dialog" aria-label={t('pwa.installTitle')}>
      <div className="pwa-install-content">
        <Download size={20} />
        <div className="pwa-install-text">
          <strong>{t('pwa.installTitle')}</strong>
          <span>{t('pwa.installDesc')}</span>
        </div>
        <Button onClick={accept}>
          {t('pwa.install')}
        </Button>
        <Button size="icon" variant="ghost" onClick={dismiss} aria-label={t('common.close')}>
          <X size={16} />
        </Button>
      </div>
    </div>
  );
}
