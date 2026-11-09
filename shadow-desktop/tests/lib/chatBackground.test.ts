import { describe, it, expect } from 'vitest';
import {
  MAX_BACKGROUND_DATAURL_CHARS,
  fileToBackgroundDataUrl,
  isChatBackgroundDataUrl,
} from '../../src/lib/chatBackground';

describe('isChatBackgroundDataUrl —— store 与渲染两头的共同判据', () => {
  it('认得合法的图片 data URL', () => {
    expect(isChatBackgroundDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(
      true,
    );
    expect(isChatBackgroundDataUrl('data:image/webp;base64,UklGRg==')).toBe(
      true,
    );
  });

  it('拒绝不像背景图的东西', () => {
    expect(isChatBackgroundDataUrl(null)).toBe(false);
    expect(isChatBackgroundDataUrl(undefined)).toBe(false);
    expect(isChatBackgroundDataUrl('')).toBe(false);
    expect(isChatBackgroundDataUrl('/home/user/bg.png')).toBe(false);
    expect(isChatBackgroundDataUrl('data:text/html;base64,PGI+')).toBe(false);
    expect(isChatBackgroundDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(
      false,
    );
  });

  it('超限的 data URL 不算数 —— localStorage 不许被撑爆', () => {
    const huge =
      'data:image/png;base64,' +
      'A'.repeat(MAX_BACKGROUND_DATAURL_CHARS + 1);
    expect(isChatBackgroundDataUrl(huge)).toBe(false);
  });
});

describe('fileToBackgroundDataUrl —— 失败要说得出原因', () => {
  it('非图片文件直接拒绝', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'note.txt', {
      type: 'text/plain',
    });
    await expect(fileToBackgroundDataUrl(file)).rejects.toThrow(/不是图片/);
  });

  it('画布不可用的环境报可读错误，而不是挂死', async () => {
    // jsdom 没有 2d 画布实现（getContext 返回 null）——
    // 正控：真实浏览器里这一步会通过，这里钉的是「失败路径说人话」。
    const file = new File([new Uint8Array([1, 2, 3])], 'bg.png', {
      type: 'image/png',
    });
    await expect(fileToBackgroundDataUrl(file)).rejects.toThrow(/画布|canvas/i);
  });
});
