/**
 * i18n 的 **React 那一侧** —— app 启动时 `import "./i18n"` 走的就是这里。
 *
 * ⚠️ **为什么 React 绑定在这、而内核在 `core.ts`**：见 `core.ts` 的文件头
 * （一句话：lib 层要用 i18n，但**不该**被 React 绑住）。
 *
 * ⚠️ **顺序**：`use()` 必须在 `init()` **之前** —— i18next v24 的 `use()`
 * 只是把模块塞进队列，**真正调 `module.init()` 的是 `init()`**
 * ⇒ 顺序反了 ⇒ `useTranslation()` 拿不到实例
 * ⇒ 界面全是 key，**而且不报错**。
 */
import i18n, { ensureI18n } from './core';
import { initReactI18next } from 'react-i18next';

i18n.use(initReactI18next);
ensureI18n();

export {
  getMissingTranslationKeys,
  clearMissingTranslationKeys,
  resources,
  i18nOptions,
} from './core';
export default i18n;
