import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './zh-CN.json';
import enUS from './en-US.json';

const resources = {
  'zh-CN': { translation: zhCN },
  'en-US': { translation: enUS },
};

const missingKeys: string[] = [];

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'zh-CN',
    fallbackLng: 'en-US',
    interpolation: {
      escapeValue: false,
    },
    missingKeyHandler: (lng, ns, key) => {
      const fullKey = `${ns}:${key}`;
      if (!missingKeys.includes(fullKey)) {
        missingKeys.push(fullKey);
        console.error(`[i18next] Missing translation key: "${key}" (language: ${lng})`);
      }
    },
  });

export function getMissingTranslationKeys(): string[] {
  return [...missingKeys];
}

export function clearMissingTranslationKeys(): void {
  missingKeys.length = 0;
}

export default i18n;
