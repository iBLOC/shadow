// Markdown preview surface — renders a fetched markdown body inside the
// right-side preview pane. Used when an inline preview has
// `kind: 'markdown'` (vs. `kind: 'web'` which is rendered by a native
// Tauri child webview instead).
//
// Safety:
// - `react-markdown` parses only CommonMark + `remark-gfm` syntax. Raw HTML
//   in the source is dropped, not rendered. If we later need embedded
//   HTML, layer `rehype-raw` and a sanitizer on top — don't do it here.
// - Links open in the OS default browser via `target="_blank" rel="noopener"`.
// - Code blocks render as plain text; syntax highlighting is intentionally
//   out of scope (would pull in `react-syntax-highlighter`).

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface MarkdownPreviewProps {
  /** Markdown source body. May be empty — `react-markdown` handles that. */
  content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return (
    <div
      className="h-full overflow-auto px-4 py-3 text-sm leading-relaxed text-foreground"
      data-testid="markdown-preview"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Render plain `<a target="_blank">` so external links escape
          // the Tauri webview context. `rel="noopener noreferrer"`
          // blocks window.opener hijacking + Referer leakage.
          a: ({ href, children, ...rest }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-2 hover:underline"
              {...rest}
            >
              {children}
            </a>
          ),
          code: ({ className, children, ...rest }) => (
            <code
              className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
              {...rest}
            >
              {children}
            </code>
          ),
          pre: ({ children, ...rest }) => (
            <pre
              className="my-2 overflow-auto rounded-md bg-muted px-3 py-2 font-mono text-[0.85em] leading-snug"
              {...rest}
            >
              {children}
            </pre>
          ),
          h1: ({ children, ...rest }) => (
            <h1 className="mt-3 mb-2 text-lg font-semibold" {...rest}>
              {children}
            </h1>
          ),
          h2: ({ children, ...rest }) => (
            <h2 className="mt-3 mb-1.5 text-base font-semibold" {...rest}>
              {children}
            </h2>
          ),
          h3: ({ children, ...rest }) => (
            <h3 className="mt-2 mb-1 text-sm font-semibold" {...rest}>
              {children}
            </h3>
          ),
          ul: ({ children, ...rest }) => (
            <ul className="my-1.5 ml-5 list-disc space-y-0.5" {...rest}>
              {children}
            </ul>
          ),
          ol: ({ children, ...rest }) => (
            <ol className="my-1.5 ml-5 list-decimal space-y-0.5" {...rest}>
              {children}
            </ol>
          ),
          blockquote: ({ children, ...rest }) => (
            <blockquote
              className="my-2 border-l-2 border-border pl-3 text-muted-foreground italic"
              {...rest}
            >
              {children}
            </blockquote>
          ),
          table: ({ children, ...rest }) => (
            <table className="my-2 w-full border-collapse text-xs" {...rest}>
              {children}
            </table>
          ),
          th: ({ children, ...rest }) => (
            <th
              className="border border-border bg-muted px-2 py-1 text-left font-semibold"
              {...rest}
            >
              {children}
            </th>
          ),
          td: ({ children, ...rest }) => (
            <td className="border border-border px-2 py-1 align-top" {...rest}>
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}