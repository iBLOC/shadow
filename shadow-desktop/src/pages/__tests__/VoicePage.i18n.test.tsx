import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ⚠️ **本文件要用真翻译** —— 全局 setup（tests/setup.ts）把 react-i18next 的
// `t` mock 成「键透传」，对「组件把键字符串当文案直接渲染」这个 bug 恰好
// **没牙**：修前 `entry.label` 原样输出、修后 `t(entry.label)` 经 mock 也原样
// 返回 ⇒ 断言看到的字符串一样 ⇒ 用例永远是绿的（失败长得像成功）。
// 这里在**文件级**把 mock 覆盖回真模块，再 import 真 i18n（zh-CN，同步 init）。
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return { ...actual };
});

import '../../i18n';
import { VoicePage } from '../VoicePage';

describe('VoicePage 状态徽章（真 i18n）', () => {
  it('idle 相显示翻译词「空闲」，不是原始键 voice.status.idle', () => {
    render(<VoicePage />);
    expect(screen.getByText('空闲')).toBeInTheDocument();
    expect(screen.queryByText('voice.status.idle')).not.toBeInTheDocument();
  });
});
