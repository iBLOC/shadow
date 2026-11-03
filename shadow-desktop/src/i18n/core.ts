/**
 * i18n 的**内核** —— 与 React 无关的那一半。
 *
 * ## 为什么把它从 `index.ts` 里拆出来
 *
 * `src/i18n/index.ts` 里的 `.use(initReactI18next)` 会让**任何** import 了
 * `src/i18n` 的模块都拖上 `react-i18next` ⇒ ⇒ 而测试里 **35 个文件各自
 * mock 了一份 `react-i18next`**（形状还各不相同：多数**没有**
 * `initReactI18next`）⇒ ⇒ 谁 import 谁炸：
 * 「No "initReactI18next" export is defined on the "react-i18next" mock」。
 *
 * ⇒ 所以：**实例 + 词条 + 配置**住这儿（`src/lib/*` 那些工具要用它，
 * 而它们**不该**被 React 绑住），**React 绑定**留在 `index.ts`
 * （那是 app 启动那一侧的事）。
 *
 * ⚠️ **同一个实例** —— `i18next` 的默认导出就是**单例**
 * ⇒ ⇒ core 与 index 拿到的是**同一个** `i18n` ⇒ ⇒ 不会出现「两份实例漂了」。
 *
 * ⚠️ **顺序**：`use()` 必须在 `init()` **之前** —— i18next v24 的
 * `use()` 只是把模块塞进 `modules.external`（`i18next.js:1954`）；
 * **真正调 `module.init(instance)` 的是 `init()`**（`i18next.js:1834`）
 * ⇒ ⇒ 顺序反了 ⇒ `initReactI18next.init()` 永远不被调
 * ⇒ ⇒ `useTranslation()` 拿不到实例（界面全是 key，**而且不报错**）。
 */
import i18n from 'i18next';
import zhCN from './zh-CN.json';
import enUS from './en-US.json';

/** 词条。 */
export const resources = {
  'zh-CN': { translation: zhCN },
  'en-US': { translation: enUS },
};

const missingKeys: string[] = [];

/** 初始化时发现过的缺词条（诊断用）。 */
export function getMissingTranslationKeys(): string[] {
  return [...missingKeys];
}

export function clearMissingTranslationKeys(): void {
  missingKeys.length = 0;
}

/** i18next 的初始化参数类型（跟着库走，不写死）。 */
type InitOptions = Parameters<typeof i18n.init>[0];

/**
 * 初始化参数 —— **一处**（`index.ts` 与 `ensureI18n()` 都用它）。
 *
 * ⚠️ 用 `InitOptions` 标注 ⇒ ⇒ `missingKeyHandler` 的参数由库来定型
 * ⇒ ⇒ 不会因为手写签名而与库对不上。
 */
export const i18nOptions: InitOptions = {
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
};

/**
 * 确保实例**已初始化**（没初始化才初始化）。
 *
 * ⚠️ **为什么 lib 侧要自己确保**：`src/i18n/index.ts` 的初始化带着
 * **React 绑定** ⇒ ⇒ 而 `src/lib/*` 不能 import 那一侧（见文件头）
 * ⇒ ⇒ lib 这边只能自己确保「词条能用」⇒ ⇒ `t()` 才不会退化成
 * **返回 key**（那是最阴的一种坏：界面看着有字，其实全是
 * `a2ui.surfaceDrawn` 这种占位串）。
 */
export function ensureI18n() {
  if (!i18n.isInitialized) {
    i18n.init(i18nOptions);
  }
  return i18n;
}

export default i18n;
