import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModelInputModalities } from '../ModelInputModalities';

// ⚠️ 全局 setup 把 `react-i18next` 的 `t` 做成**键透传** ⇒ 断言里用的是键名。
//
// ⚠️ **为什么这条判据盯「来源」**：只给最终模态、不说来源 ⇒ ⇒「上游真给的」
// 与「我们按官方文档预设的」在界面上长得一样 ⇒ ⇒ 猜错了没人发现。

describe('ModelInputModalities（输入模态 ＋ 来源）', () => {
  it('显示模态，并把来源写进 title', () => {
    render(<ModelInputModalities modalities={['text', 'image']} source="catalog" />);
    const badge = screen.getByText('text / image');
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('title')).toContain('models.inputModalitiesSource');
    expect(badge.getAttribute('title')).toContain('models.inputModalitiesSourceCatalog');
  });

  it('三种来源显示不同的话（上游 / 文档预设 / 默认）', () => {
    const first = render(<ModelInputModalities modalities={['text']} source="upstream" />);
    expect(screen.getByText('text').getAttribute('title')).toContain(
      'models.inputModalitiesSourceUpstream',
    );
    first.unmount();
    render(<ModelInputModalities modalities={['text']} source="default" />);
    expect(screen.getByText('text').getAttribute('title')).toContain(
      'models.inputModalitiesSourceDefault',
    );
  });

  it('没有模态 ⇒ 什么都不画（老数据没这个字段）', () => {
    const { container } = render(<ModelInputModalities />);
    expect(container.textContent).toBe('');
  });
});
