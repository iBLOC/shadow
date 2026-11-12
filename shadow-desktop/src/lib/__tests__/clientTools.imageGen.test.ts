import { describe, it, expect, vi, afterEach } from 'vitest';

// ⚠️ **stub 的还原纪律**（与 clientTools.a2ui.test.ts 同一条）：vitest 默认
// unstubGlobals: false ⇒ 本文件 stub 出去的东西不会自动还原 ⇒ 泄漏给同一
// worker 的后续文件 ⇒ 失败长得像成功。装在 afterEach（不外泄）。
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureI18n } from '../../i18n/core';
import {
  desktopClientTools,
  imageAttachmentsOf,
  pickReportPayload,
  toOpenAiTools,
} from '../clientTools';
import { telencephalonClient } from '../telencephalonClient';

// ⚠️ **自己确保 i18n 已初始化** —— execute 里的 `t()` 没初始化会退化成返回
// key（界面看着有字，其实全是 `clientTools.imageGenerated` 占位串）。
const i18n = ensureI18n();

/**
 * 仓库里**另一端**的 l10n 文件（移动端的 arb）。
 *
 * ⚠️ **为什么桌面端的测试要读移动端的文件**：`report` 那一句话是
 * **发给模型看的** ⇒ ⇒ 两端必须逐字一致 ⇒ ⇒ 「一致」这件事要**机器可判**
 * ⇒ ⇒ 只能有一处把它读出来比对（与 a2ui 那一族同一手法）。
 */
function mobileArbPath(name: string): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(dir, 'shadow-mobile', 'lib', 'l10n', name);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`mobile arb not found: ${name}`);
}

/** i18next 的插值是 `{{x}}`，arb 是 `{x}` ⇒ 归一后逐字比。 */
function normalizeInterpolation(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, '{$1}');
}

/** generate_image 在注册表里的那条（找不到就直红 —— 工具没注册等于没这功能）。 */
function theTool() {
  const tool = desktopClientTools.lookup('generate_image');
  expect(tool, 'generate_image must be registered in desktopClientTools').toBeTruthy();
  return tool!;
}

describe('generate_image（图片生成客户端工具）', () => {
  it('进了注册表，且导出的参数表带必填 prompt', () => {
    const tool = theTool();
    expect(tool.parameters?.type).toBe('object');
    const props = tool.parameters?.properties as Record<string, { type: string }>;
    expect(props.prompt.type).toBe('string');
    expect(props.size.type).toBe('string');
    expect(props.model.type).toBe('string');
    expect(tool.parameters?.required).toEqual(['prompt']);

    // ⚠️ 发给模型的 tools 数组里必须真的有它（toOpenAiTools 是端脑点名的起点）。
    const openai = toOpenAiTools(desktopClientTools).find((t) => t.function.name === 'generate_image');
    expect(openai).toBeTruthy();
    const schema = openai!.function.parameters as { required?: string[] };
    expect(schema.required).toEqual(['prompt']);
  });

  it('执行成功：调用端脑门面，结果 = { report, images[] }，且 report ≠ 全量', async () => {
    const spy = vi
      .spyOn(telencephalonClient, 'generateImage')
      .mockResolvedValue({
        created: 1,
        data: [{ b64_json: 'QUJD', size: '1024x1024', seed: 42 }],
      });

    const result = (await theTool().execute({ prompt: 'a teal eclipse' }, {})) as {
      report: string;
      images: { b64: string; size: string; mime: string }[];
    };

    // ⚠️ 调的是**端脑门面**（不是绕过去直连供应商/直连 neuron）。
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatchObject({ prompt: 'a teal eclipse' });

    // 图片附件走 `images`（给界面），base64 **不许**混进 report（给模型）。
    expect(result.images).toEqual([{ b64: 'QUJD', size: '1024x1024', mime: 'image/png' }]);
    expect(result.report).not.toContain('QUJD');
    // report 走真 i18n ⇒ 不是占位 key，且带实际读数。
    expect(result.report).not.toContain('clientTools.imageGenerated');
    expect(result.report.length).toBeGreaterThan(0);
    expect(result.report).toContain('1024x1024');
  });

  it('size / model 显式给了才带上（本地默认值不外塞）', async () => {
    const spy = vi
      .spyOn(telencephalonClient, 'generateImage')
      .mockResolvedValue({ created: 1, data: [] });

    await theTool().execute({ prompt: 'x' }, {});
    expect(spy.mock.calls[0][0]).not.toHaveProperty('size');
    expect(spy.mock.calls[0][0]).not.toHaveProperty('model');

    await theTool().execute({ prompt: 'x', size: '512x512', model: 'cogview-4' }, {});
    expect(spy.mock.calls[1][0]).toMatchObject({ size: '512x512', model: 'cogview-4' });
  });

  it('空 prompt ⇒ 明确失败（不默默什么也不做）', async () => {
    const spy = vi.spyOn(telencephalonClient, 'generateImage');
    await expect(theTool().execute({}, {})).rejects.toThrow(/prompt/);
    await expect(theTool().execute({ prompt: '   ' }, {})).rejects.toThrow(/prompt/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('pickReportPayload：模型只拿 report 那一句，base64 不回传端脑', () => {
    const full = {
      report: i18n.t('clientTools.imageGenerated', { count: 1, size: '1024x1024' }),
      images: [{ b64: 'QUJD', size: '1024x1024', mime: 'image/png' }],
    };
    const payload = pickReportPayload(full) as { report?: string };
    expect(payload.report).toBeTruthy();
    expect(JSON.stringify(payload)).not.toContain('QUJD');

    // 没有 report 的结果**原样回传**（不把别人的结果改形状）。
    expect(pickReportPayload({ hello: 1 })).toEqual({ hello: 1 });
  });
});

describe('report 两端同文（桌面 i18n ↔ 移动 arb 互读比对）', () => {
  it('两端归一插值后逐字一致（zh ＋ en）', () => {
    const desktopZh = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../i18n/zh-CN.json'), 'utf-8'),
    );
    const desktopEn = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../i18n/en-US.json'), 'utf-8'),
    );
    const mobileZh = JSON.parse(readFileSync(mobileArbPath('app_zh.arb'), 'utf-8'));
    const mobileEn = JSON.parse(readFileSync(mobileArbPath('app_en.arb'), 'utf-8'));

    const desktopZhText = desktopZh.clientTools.imageGenerated as string;
    const desktopEnText = desktopEn.clientTools.imageGenerated as string;
    const mobileZhText = mobileZh.clientToolsImageGenerated as string;
    const mobileEnText = mobileEn.clientToolsImageGenerated as string;

    expect(normalizeInterpolation(desktopZhText)).toBe(mobileZhText);
    expect(normalizeInterpolation(desktopEnText)).toBe(mobileEnText);

    // 渲染后的那一句（发给模型的）两端一样 ⇒ 模型在两端行为一致。
    const renderedZh = i18n.t('clientTools.imageGenerated', { count: 1, size: '1024x1024' });
    expect(renderedZh).toBe(
      (mobileZh.clientToolsImageGenerated as string)
        .replace('{count}', '1')
        .replace('{size}', '1024x1024'),
    );
  });
});

describe('imageAttachmentsOf（图片附件抽取）', () => {
  it('认 { images: [{b64, size, mime?}] }，mime 缺省 image/png', () => {
    const out = imageAttachmentsOf({
      images: [
        { b64: 'QUJD', size: '512x512' },
        { b64: 'REVG', size: '256x256', mime: 'image/jpeg' },
      ],
    });
    expect(out).toEqual([
      { url: 'data:image/png;base64,QUJD', size: '512x512' },
      { url: 'data:image/jpeg;base64,REVG', size: '256x256' },
    ]);
  });

  it('认不出的条目跳过（一张坏图不把整块结果画崩）', () => {
    expect(
      imageAttachmentsOf({ images: [null, 'junk', { size: 'no-b64' }, { b64: 'QUJD' }] }),
    ).toEqual([{ url: 'data:image/png;base64,QUJD', size: '' }]);
  });

  it('非对象 / 没有 images ⇒ 空数组（不是抛错）', () => {
    expect(imageAttachmentsOf(null)).toEqual([]);
    expect(imageAttachmentsOf('text')).toEqual([]);
    expect(imageAttachmentsOf({})).toEqual([]);
    expect(imageAttachmentsOf({ images: 'nope' })).toEqual([]);
  });
});
