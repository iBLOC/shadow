import { describe, it, expect } from 'vitest';
import { pullIdFor } from '../LocalEnginePanel/LocalEnginePanel';

/**
 * `/v1/models/pull` 的 id 形状 —— neuron 落盘 id ＝ `engine/` ＋ 提交的 id
 * （真机证据：`vision/detr-resnet50` 行由裸名 pull 点亮）⇒ pull 必须提交
 * **剥掉引擎前缀、保留命名空间**的 id，catalog 行才会被点亮。
 */
describe('pullIdFor（pull 提交 id 的形状）', () => {
  it('三段式：剥引擎前缀、保留命名空间（llm/Qwen/Qwen3-0.6B ⇒ Qwen/Qwen3-0.6B）', () => {
    expect(pullIdFor({ id: 'llm/Qwen/Qwen3-0.6B', engine: 'llm' })).toBe(
      'Qwen/Qwen3-0.6B',
    );
  });

  it('两段式：与旧行为一致（llm/minicpm5-1b ⇒ minicpm5-1b）', () => {
    expect(pullIdFor({ id: 'llm/minicpm5-1b', engine: 'llm' })).toBe(
      'minicpm5-1b',
    );
    expect(pullIdFor({ id: 'vision/detr-resnet50', engine: 'vision' })).toBe(
      'detr-resnet50',
    );
  });

  it('id 不带引擎前缀 ⇒ 原样透传（不猜）', () => {
    expect(pullIdFor({ id: 'Qwen/Qwen3-0.6B', engine: 'llm' })).toBe(
      'Qwen/Qwen3-0.6B',
    );
    expect(pullIdFor({ id: 'minicpm5-1b', engine: 'llm' })).toBe('minicpm5-1b');
  });

  it('引擎名相同的前缀才剥（engine=llm 不吃 llm-x/ 开头的 id）', () => {
    expect(pullIdFor({ id: 'llm-x/foo', engine: 'llm' })).toBe('llm-x/foo');
  });
});
