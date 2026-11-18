import { A2uiSurface as SdkA2uiSurface, MarkdownComponentContext } from '@a2ui/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';

import {
  hasRenderableContent,
  isStructurallyEmptySurface,
  unknownComponentsOf,
  type A2uiSurface as A2uiSurfaceModel,
} from '../../lib/a2uiProtocol';

/**
 * 渲染一块 A2UI surface —— **官方 SDK 的 React 渲染器**。
 *
 * ## 为什么是官方渲染器
 *
 * ⚠️ 桌面端以前**自己手写**了一套 A2UI 协议栈（v0.8 的 SSE 解码 + 组件目录 +
 * React 渲染器）⇒ ⇒ 那是「协议漂移」的温床：端脑一改措辞，桌面端就白屏。
 * ⇒ ⇒ 现在协议层是官方 SDK（@a2ui/web_core ＋ @a2ui/react 0.15.0），
 * 这一份文件只做三件 SDK 不做的事：
 *
 * ❶ **外壳**：数据属性（surface id / 空不空）—— 判据要用；
 * ❷ **Markdown**：官方基础目录的 Text 用 Markdown 渲染，而 Markdown 渲染器
 *    **由应用提供**（app 级上下文）⇒ ⇒ 这一份给全页统一的那一个；
 * ❸ **占位**：官方渲染器对**不认识的组件类型**不画（也不抛）
 *    ⇒ ⇒ 客户端自己补一个占位 ⇒ 「端脑加了新组件」不会变成「一块空白」。
 *
 * ## ⚠️ 自定义元素的那一行补丁
 *
 * 官方基础目录的组件是 **Lit 自定义元素** ⇒ 它们的 connectedCallback 会调
 * CSSStyleSheet.replaceSync ⇒ **jsdom 没有这个 API** ⇒ 元素一连上就炸
 * ⇒ ⇒ 桌面端的判据（jsdom）里整块界面会是空的。
 * ⇒ ⇒ 这里补一个**只在缺它时**才装的空实现（浏览器里本来就有 ⇒ 装不上）。
 */
function ensureCustomElementStyleApi(): void {
  if (typeof CSSStyleSheet === 'undefined') return;
  if ('replaceSync' in CSSStyleSheet.prototype) return;
  try {
    Object.defineProperty(CSSStyleSheet.prototype, 'replaceSync', {
      value: function replaceSync() {
        /* jsdom 没有 adoptedStyleSheets ⇒ 这里什么都不做 */
      },
      configurable: true,
      writable: true,
    });
  } catch (error) {
    // ⚠️ **不许把失败吞成「什么都没有」** —— 装不上这个垫片 ⇒ 官方基础目录的
    // Lit 自定义元素在 connectedCallback 里调 replaceSync 会炸 ⇒ ⇒ 界面是一块空白
    // ⇒ ⇒ 那正是「失败长得像成功」。⇒ ⇒ 这里**如实出声**，不静默继续。
    console.warn(
      '[a2ui] 官方基础目录的 CSSStyleSheet.replaceSync 垫片装不上 ⇒ 官方自定义元素可能渲染不出来：',
      error,
    );
  }
}

ensureCustomElementStyleApi();

/**
 * 官方基础目录的 Text 用 **Markdown** 渲染
 * （端脑的标题就是 `# Tasks (1)` ⇒ 靠 Markdown 的 `#` 表达标题层级）。
 *
 * ⚠️ 用的是**应用自己的** Markdown 渲染器（react-markdown ＋ remark-gfm，
 * 与对话区同一套）⇒ ⇒ 界面里的文字与聊天里的文字长得一样。
 */
function A2uiMarkdown({ markdown }: { markdown: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>;
}

export interface A2uiSurfaceProps {
  surface: A2uiSurfaceModel;
}

export function A2uiSurface({ surface }: A2uiSurfaceProps) {
  const { t } = useTranslation();
  const unknown = unknownComponentsOf(surface);

  // ⚠️ **没有根组件 ⇒ 画不出来** ⇒ 如实说，不画一块空白。
  if (!hasRenderableContent(surface)) {
    return (
      <div
        className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground"
        data-testid="a2ui-surface-no-root"
      >
        {t('a2ui.missingRoot')}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="a2ui-surface"
      data-surface-id={surface.id}
      // ⚠️ **「空」也是一种状态** —— 端脑把「没有内容」画成一个只有文字的
      // surface ⇒ 客户端必须**分得清**「有内容」与「空」。
      // ⚠️ 界面上两者长得一样 —— 因为**端脑自己已经在空 surface 里说了实话**
      // ⇒ 客户端**不再补一句**自己的概括。
      data-surface-empty={isStructurallyEmptySurface(surface) ? 'true' : 'false'}
    >
      <MarkdownComponentContext.Provider value={A2uiMarkdown}>
        <SdkA2uiSurface surface={surface} />
      </MarkdownComponentContext.Provider>
      {unknown.map((component) => (
        <div
          key={component.id}
          className="rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground"
          data-testid="a2ui-unknown-component"
          data-component-type={component.type}
        >
          {component.type}
        </div>
      ))}
    </div>
  );
}
