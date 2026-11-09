import { describe, expect, it } from 'vitest';
import {
  normalizeTelencephalonBaseUrl,
  ENDPOINT_REJECT_TEXT,
} from '../../src/lib/telencephalonEndpoint';

/**
 * 端脑地址的**校验与规范化** —— 判据钉的是**规则**，不是实现细节。
 *
 * ⚠️ 为什么这层要单独钉：地址一旦写进 store（并持久化）⇒ ⇒ 它就是**所有页面**
 * 的真相源 ⇒ ⇒ 写坏了 ⇒ ⇒ 用户改不回来（那时还没有 UI 能改）⇒ ⇒
 * **写不进 ≠ 写进了**。
 */
describe('normalizeTelencephalonBaseUrl —— 不合格的地址不许进 store', () => {
  it('空串 ⇒ 拒绝（EMPTY）', () => {
    const r = normalizeTelencephalonBaseUrl('');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('EMPTY');
  });

  it('只有空白 ⇒ 拒绝（EMPTY）', () => {
    const r = normalizeTelencephalonBaseUrl('   \t  ');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('EMPTY');
  });

  it('没有协议的地址（127.0.0.1:60080）⇒ 拒绝（NOT_A_URL）', () => {
    const r = normalizeTelencephalonBaseUrl('127.0.0.1:60080');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('NOT_A_URL');
  });

  it('不是 URL 的散文 ⇒ 拒绝（NOT_A_URL）', () => {
    const r = normalizeTelencephalonBaseUrl('我的端脑');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('NOT_A_URL');
  });

  it('非 http/https 协议 ⇒ 拒绝（BAD_PROTOCOL）', () => {
    const r = normalizeTelencephalonBaseUrl('ftp://example.com');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('BAD_PROTOCOL');
    const r2 = normalizeTelencephalonBaseUrl('file:///etc/passwd');
    expect(r2.ok).toBe(false);
  });

  it('两端空白 ⇒ 去掉', () => {
    const r = normalizeTelencephalonBaseUrl('  http://127.0.0.1:60080  ');
    expect(r.ok).toBe(true);
    expect(r.ok === true && r.value).toBe('http://127.0.0.1:60080');
  });

  it('结尾斜杠 ⇒ 去掉（否则拼路径会出双斜杠）', () => {
    const r = normalizeTelencephalonBaseUrl('http://127.0.0.1:60080/');
    expect(r.ok === true && r.value).toBe('http://127.0.0.1:60080');
    const r2 = normalizeTelencephalonBaseUrl('http://127.0.0.1:60080///');
    expect(r2.ok === true && r2.value).toBe('http://127.0.0.1:60080');
  });

  it('路径前缀 ⇒ **保留**（端脑挂在子路径下时它是地址的一部分）', () => {
    const r = normalizeTelencephalonBaseUrl('http://brain.local/brain/');
    expect(r.ok === true && r.value).toBe('http://brain.local/brain');
  });

  it('https 端口保留', () => {
    const r = normalizeTelencephalonBaseUrl('https://brain.example:8443');
    expect(r.ok === true && r.value).toBe('https://brain.example:8443');
  });

  it('每个拒绝理由都有人话（不许出现空文案）', () => {
    const reasons = ['EMPTY', 'NOT_A_URL', 'BAD_PROTOCOL', 'NO_HOST'];
    for (const reason of reasons) {
      expect(ENDPOINT_REJECT_TEXT[reason].length).toBeGreaterThan(0);
    }
  });
});
