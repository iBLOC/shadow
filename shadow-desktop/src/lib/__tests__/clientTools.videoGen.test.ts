import { describe, it, expect, vi, afterEach } from 'vitest';

// ⚠️ **stub 的还原纪律**（与 clientTools.imageGen.test.ts 同一条）：vitest 默认
// unstubGlobals: false ⇒ 本文件 stub 出去的东西不会自动还原 ⇒ ⇒ 泄漏给同一
// worker 的后续文件 ⇒ ⇒ 失败长得像成功。装在 afterEach（不外泄）。
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureI18n } from '../../i18n/core';
import { desktopClientTools, pickReportPayload, toOpenAiTools } from '../clientTools';
import { telencephalonClient } from '../telencephalonClient';

// ⚠️ **自己确保 i18n 已初始化** —— execute 里的 `t()` 没初始化会退化成返回
// key（界面看着有字，其实全是 `clientTools.videoGenerated` 占位串）。
const i18n = ensureI18n();

/** 仓库里**另一端**的 l10n 文件（移动端的 arb）。 */
function mobileArbPath(name: string): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(dir, 'shadow-mobile', 'lib', 'l10n', name);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('mobile arb not found: ' + name);
}

/** i18next 的插值是 `{{x}}`，arb 是 `{x}` ⇒ 归一后逐字比。 */
function normalizeInterpolation(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, '{$1}');
}

/** generate_video 在注册表里的那条（找不到就直红 —— 工具没注册等于没这功能）。 */
function theTool() {
  const tool = desktopClientTools.lookup('generate_video');
  expect(tool, 'generate_video must be registered in desktopClientTools').toBeTruthy();
  return tool!;
}

describe('generate_video（视频生成客户端工具）', () => {
  it('进了注册表，且导出的参数表带齐那几档', () => {
    const tool = theTool();
    expect(tool.parameters?.type).toBe('object');
    const props = tool.parameters?.properties as Record<string, { type: string; enum?: string[] }>;
    expect(props.prompt.type).toBe('string');
    expect(props.model.type).toBe('string');
    expect(props.duration.type).toBe('integer');
    expect(props.resolution.type).toBe('string');
    expect(props.ratio.type).toBe('string');
    expect(props.task_id.type).toBe('string');
    // ⚠️ **枚举要全** —— 模型能填哪几个值就是契约 ⇒ ⇒ 少一个就是漂移。
    // ⚠️ **顺序不算契约**（模型看的是集合）⇒ ⇒ 用集合比。
    expect(new Set(props.resolution.enum ?? [])).toEqual(new Set(['480P', '768P', '2K']));
    expect(new Set(props.ratio.enum ?? [])).toEqual(
      new Set(['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16']),
    );

    // ⚠️ **prompt 不是必填**（另一个入口是 `task_id`）⇒ ⇒ 两者都不是必填。
    expect(tool.parameters?.required).toBeUndefined();

    // ⚠️ 发给模型的 tools 数组里必须真的有它。
    const openai = toOpenAiTools(desktopClientTools).find((t) => t.function.name === 'generate_video');
    expect(openai).toBeTruthy();
  });

  it('执行成功：创建 ⇒ 轮询 ⇒ 结果 = { report, video }，report 里带产物链接', async () => {
    const create = vi.spyOn(telencephalonClient, 'generateVideo').mockResolvedValue({
      task_id: '424010985738629',
      status: 'queued',
      model: 'MiniMax-H3',
    });
    const query = vi.spyOn(telencephalonClient, 'queryVideo').mockResolvedValue({
      task_id: '424010985738629',
      status: 'succeeded',
      model: 'MiniMax-H3',
      url: 'https://cdn.example.com/out.mp4',
    });

    const result = (await theTool().execute({ prompt: 'a boy shooting hoops' }, {})) as {
      report: string;
      video: { url?: string; status?: string; task_id?: string; model?: string };
    };

    // ⚠️ 调的是**端脑门面**（两步：创建 ⇒ 查询）。
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({ prompt: 'a boy shooting hoops' });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toBe('424010985738629');

    expect(result.video.url).toBe('https://cdn.example.com/out.mp4');
    expect(result.video.status).toBe('succeeded');
    expect(result.video.task_id).toBe('424010985738629');
    // ⚠️ report 走真 i18n ⇒ 不是占位 key，且带**产物链接**（模型要能告诉用户）。
    expect(result.report).not.toContain('clientTools.videoGenerated');
    expect(result.report).toContain('https://cdn.example.com/out.mp4');
  });

  it('轮询用的是**端脑给回来的**模型 id（不是调用方给的那个）', async () => {
    const create = vi.spyOn(telencephalonClient, 'generateVideo').mockResolvedValue({
      task_id: 't1',
      status: 'queued',
      // ⚠️ 端脑按 `video_gen` 分档默认挑了另一个模型 ⇒ ⇒ 工具必须用它
      // 去查（查错供应商 ⇒ ⇒ 查到别人的任务上去）。
      model: 'MiniMax-H3-Highspeed',
    });
    const query = vi.spyOn(telencephalonClient, 'queryVideo').mockResolvedValue({
      task_id: 't1',
      status: 'succeeded',
      url: 'https://cdn.example.com/out.mp4',
    });

    await theTool().execute({ prompt: 'x' }, {});
    expect(create).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toBe('MiniMax-H3-Highspeed');
  });

  it('⚠️ 上游说失败 ⇒ 工具**真的失败**（不许做成一句「生成失败」的报告）', async () => {
    const create = vi.spyOn(telencephalonClient, 'generateVideo').mockResolvedValue({
      task_id: 't2',
      status: 'queued',
      model: 'MiniMax-H3',
    });
    const query = vi.spyOn(telencephalonClient, 'queryVideo').mockResolvedValue({
      task_id: 't2',
      status: 'failed',
      error: 'video description contains sensitive content',
    });

    await expect(theTool().execute({ prompt: 'x' }, {})).rejects.toThrow(/failed/);
    // ⚠️ **替身真的被用上了**（否则这条用例恒绿 ⇒ ⇒ 证明不了任何事）。
    expect(create).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('⚠️ 超时 ⇒ 报「还在生成」＋ 任务 id（**不许**说失败）', async () => {
    vi.useFakeTimers();
    const create = vi.spyOn(telencephalonClient, 'generateVideo').mockResolvedValue({
      task_id: 't3',
      status: 'queued',
      model: 'MiniMax-H3',
    });
    const query = vi.spyOn(telencephalonClient, 'queryVideo').mockResolvedValue({
      task_id: 't3',
      status: 'running',
    });

    const pending = theTool().execute({ prompt: 'x' }, {}) as Promise<{
      report: string;
      video: { status?: string; task_id?: string };
    }>;
    await vi.advanceTimersByTimeAsync(200000);
    const result = await pending;

    expect(create).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalled();
    expect(result.video.status).toBe('processing');
    expect(result.video.task_id).toBe('t3');
    expect(result.report).toContain('t3');
  });

  it('查回上一轮的任务：给了 task_id ⇒ 不新建', async () => {
    const create = vi.spyOn(telencephalonClient, 'generateVideo');
    const query = vi.spyOn(telencephalonClient, 'queryVideo').mockResolvedValue({
      task_id: 't4',
      status: 'succeeded',
      url: 'https://cdn.example.com/out.mp4',
    });

    await theTool().execute({ task_id: 't4', model: 'MiniMax-H3' }, {});
    expect(create).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith('t4', 'MiniMax-H3');
  });

  it('给了 task_id 却没给 model ⇒ 明确失败（端脑不落状态 ⇒ 少了它查不了）', async () => {
    const query = vi.spyOn(telencephalonClient, 'queryVideo');
    await expect(theTool().execute({ task_id: 't5' }, {})).rejects.toThrow(/model/);
    expect(query).not.toHaveBeenCalled();
  });

  it('既没 prompt 也没 task_id ⇒ 明确失败（不默默什么也不做）', async () => {
    const create = vi.spyOn(telencephalonClient, 'generateVideo');
    await expect(theTool().execute({}, {})).rejects.toThrow(/prompt/);
    await expect(theTool().execute({ prompt: '   ' }, {})).rejects.toThrow(/prompt/);
    expect(create).not.toHaveBeenCalled();
  });

  it('可选参数没给 ⇒ 不外塞（不把本地默认值强塞给上游）', async () => {
    const create = vi.spyOn(telencephalonClient, 'generateVideo').mockResolvedValue({
      task_id: 't6',
      status: 'queued',
      model: 'MiniMax-H3',
    });
    const query = vi.spyOn(telencephalonClient, 'queryVideo').mockResolvedValue({
      task_id: 't6',
      status: 'succeeded',
      url: 'https://cdn.example.com/out.mp4',
    });

    await theTool().execute({ prompt: 'x' }, {});
    expect(query).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).not.toHaveProperty('model');
    expect(create.mock.calls[0][0]).not.toHaveProperty('duration');
    expect(create.mock.calls[0][0]).not.toHaveProperty('resolution');
    expect(create.mock.calls[0][0]).not.toHaveProperty('ratio');

    await theTool().execute(
      { prompt: 'x', model: 'm', duration: 6, resolution: '2K', ratio: '9:16' },
      {},
    );
    expect(create.mock.calls[1][0]).toMatchObject({
      model: 'm',
      duration: 6,
      resolution: '2K',
      ratio: '9:16',
    });
  });

  it('pickReportPayload：模型只拿 report 那一句（产物链接不进上下文）', () => {
    const full = {
      report: i18n.t('clientTools.videoGenerated', { url: 'https://cdn.example.com/out.mp4' }),
      video: { url: 'https://cdn.example.com/out.mp4', status: 'succeeded' },
    };
    const payload = pickReportPayload(full) as { report?: string };
    expect(payload.report).toBeTruthy();
    // 没有 report 的结果**原样回传**（不把别人的结果改形状）。
    expect(pickReportPayload({ hello: 1 })).toEqual({ hello: 1 });
  });
});

describe('report 两端同文（桌面 i18n ↔ 移动 arb 互读比对）', () => {
  it('两句都逐字一致（zh ＋ en）', () => {
    const desktopZh = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../i18n/zh-CN.json'), 'utf-8'),
    );
    const desktopEn = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../i18n/en-US.json'), 'utf-8'),
    );
    const mobileZh = JSON.parse(readFileSync(mobileArbPath('app_zh.arb'), 'utf-8'));
    const mobileEn = JSON.parse(readFileSync(mobileArbPath('app_en.arb'), 'utf-8'));

    expect(normalizeInterpolation(desktopZh.clientTools.videoGenerated as string)).toBe(
      mobileZh.clientToolsVideoGenerated as string,
    );
    expect(normalizeInterpolation(desktopEn.clientTools.videoGenerated as string)).toBe(
      mobileEn.clientToolsVideoGenerated as string,
    );
    expect(normalizeInterpolation(desktopZh.clientTools.videoProcessing as string)).toBe(
      mobileZh.clientToolsVideoProcessing as string,
    );
    expect(normalizeInterpolation(desktopEn.clientTools.videoProcessing as string)).toBe(
      mobileEn.clientToolsVideoProcessing as string,
    );
  });
});
