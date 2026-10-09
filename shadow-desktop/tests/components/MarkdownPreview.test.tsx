import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownPreview } from '../../src/components/preview/MarkdownPreview';

describe('MarkdownPreview', () => {
  it('renders an empty wrapper for empty content without crashing', () => {
    const { container } = render(<MarkdownPreview content="" />);
    expect(container.querySelector('[data-testid="markdown-preview"]')).not.toBeNull();
  });

  it('renders headings, lists, code, and tables via react-markdown + remark-gfm', () => {
    const md = [
      '# Title',
      '',
      'A paragraph with **bold** and *italic*.',
      '',
      '- item one',
      '- item two',
      '',
      '1. ordered',
      '',
      '| a | b |',
      '| - | - |',
      '| 1 | 2 |',
      '',
      '```ts',
      'const x: number = 1;',
      '```',
    ].join('\n');

    const { container } = render(<MarkdownPreview content={md} />);

    expect(container.querySelector('h1')?.textContent).toBe('Title');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('em')?.textContent).toBe('italic');
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelectorAll('ol li')).toHaveLength(1);
    expect(container.querySelector('table tr')).not.toBeNull();
    expect(container.querySelector('pre code')?.textContent).toContain(
      'const x: number = 1;',
    );
  });

  it('opens external links in a new tab with noopener noreferrer', () => {
    const { container } = render(
      <MarkdownPreview content={'[example](https://example.com)'} />,
    );
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://example.com');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer');
  });
});