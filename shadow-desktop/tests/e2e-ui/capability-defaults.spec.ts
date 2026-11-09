import { test, expect } from '@playwright/test';

/**
 * 「按能力分档的默认模型」—— **界面级**守卫（浏览器里真跑）。
 *
 * ## 这一条在守什么
 *
 * ⚠️ **目录面 ≠ 已注册面** —— 客户端候选来自「能下载的权重清单」（`whisper-base`
 * 那一套），而端脑**真的解析引擎**时用的是「此刻已注册的 id」（`whisper-model`
 * 那一套）⇒ ⇒ 两套只有 `sensevoice-small` 与 `voxcpm2` 恰好同名。
 *
 * ⇒ ⇒ 用户从下拉里挑一个端脑永远解析不到的 id ⇒ ⇒ **存得进去、用不了**。
 * ⇒ ⇒ 所以这一条断言三件事：
 * ① **按引擎 id 解析的档（asr/tts）⇒ 候选只给已注册的那几个**（目录面里
 *    端脑解析不到的 `Whisper Base` / `Whisper Tiny` / `VoxCPM 0.5B` **不许出现**）；
 * ② **不按引擎 id 解析的档（llm）⇒ 候选仍取目录面**（那一档走供应商路由）；
 * ③ **红条点名「哪一档此刻用不了」＋ 那个 id** —— 界面必须说真话。
 *
 * ## 为什么用 mock 而不真端脑
 *
 * ⚠️ 这一条要的是**客户端那一面的行为** ⇒ ⇒ 端脑那两条接口用**真形状**喂进去
 * ⇒ ⇒ 于是「客户端有没有说真话」这件事**不依赖端脑起没起来**（CI 上端脑可能
 * 根本起不来 ⇒ ⇒ 那种情况下这一条仍然必须能跑、仍然必须绿）。
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,PUT,POST,OPTIONS',
};

/** 端脑 `GET /api/telencephalon/lobes/capability-defaults` 的真实形状。 */
const VIEW = {
  defaults: { llm: 'qwen2.5-7b-instruct', asr: 'whisper-base', tts: 'voxcpm2' },
  capabilities: ['llm', 'asr', 'tts'],
  engine_resolved: ['asr', 'tts'],
  registered: { asr: ['sensevoice-small'], tts: ['voxcpm2'] },
};

/** 端脑 `GET /models/providers` 的**目录面**（能下载的权重清单）。 */
const PROVIDERS = [
  {
    id: 'neuron',
    name: '本地大脑',
    provider_type: 'local',
    models: [
      { id: 'qwen2.5-7b-instruct', name: 'Qwen2.5 7B Instruct', capabilities: ['llm'] },
      { id: 'whisper-base', name: 'Whisper Base', capabilities: ['asr'] },
      { id: 'whisper-tiny', name: 'Whisper Tiny', capabilities: ['asr'] },
      { id: 'sensevoice-small', name: 'SenseVoice Small', capabilities: ['asr'] },
      { id: 'voxcpm2', name: 'VoxCPM2', capabilities: ['tts'] },
      { id: 'voxcpm-0.5b', name: 'VoxCPM 0.5B', capabilities: ['tts'] },
    ],
  },
];

test('候选只给「端脑此刻真的解析得到」的 id ＋ 红条点名用不了的那一档', async ({ page }, testInfo) => {
  // ⚠️ **app 自己的 origin 要随 baseURL 走** —— CI 可能走 dev server（5173）
  // ⇒ ⇒ 也可能走构建产物（4173）⇒ ⇒ 写死任何一个都会在另一条路上把**页面
  // 自己的资源**也 mock 掉（⇒ ⇒ 白屏）。
  const appOrigin = new URL(String(testInfo.project.use.baseURL)).origin;

  // ⓪ 除本页面与那两条端脑接口外的一切请求 ⇒ 一律空数组（不许真去敲端脑）
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(appOrigin)) return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: '[]',
    });
  });

  // ① 端脑那两条 ⇒ 真形状
  await page.route('**/api/telencephalon/lobes/capability-defaults*', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify(VIEW),
    });
  });
  await page.route('**/models/providers*', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS,
      body: JSON.stringify(PROVIDERS),
    });
  });

  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('shadow_setup_complete', 'true');
  });
  await page.goto('/models');

  await expect(
    page.getByText('按能力分档的默认模型', { exact: true }).first(),
  ).toBeVisible({ timeout: 30000 });

  const asrSelect = page.locator('label:has(span:text-is("语音识别")) select');
  const ttsSelect = page.locator('label:has(span:text-is("语音合成")) select');
  const llmSelect = page.locator('label:has(span:text-is("文本模型")) select');
  await expect(asrSelect).toBeVisible();

  const asrOptions = (await asrSelect.locator('option').allTextContents()).join(' | ');
  const ttsOptions = (await ttsSelect.locator('option').allTextContents()).join(' | ');
  const llmOptions = (await llmSelect.locator('option').allTextContents()).join(' | ');

  // ❶ 按引擎 id 解析的档 ⇒ 候选**只有已注册的那几个**
  expect(asrOptions).toContain('SenseVoice Small');
  expect(asrOptions).not.toContain('Whisper Base');
  expect(asrOptions).not.toContain('Whisper Tiny');
  expect(ttsOptions).toContain('VoxCPM2');
  expect(ttsOptions).not.toContain('VoxCPM 0.5B');
  // ❷ 不按引擎 id 解析的档（llm）⇒ 候选仍取目录面
  expect(llmOptions).toContain('Qwen2.5 7B Instruct');

  // ❸ 红条：说清「哪一档此刻用不了」＋ 那个 id
  await expect(
    page.getByText('下面这几档指向的模型这台大脑还没注册', { exact: false }).first(),
  ).toBeVisible();
  const item = page.locator('li', { hasText: 'whisper-base' }).first();
  await expect(item).toBeVisible();
  await expect(item).toContainText('语音识别');

  // ❹ 当前默认值「whisper-base」不在候选里 ⇒ 界面仍显示它（不许静默改掉
  //    用户设置）⇒ ⇒ 但红条同时点名它用不了。
  await expect(asrSelect).toHaveValue('whisper-base');

  await page.screenshot({
    path: testInfo.outputPath('capability-defaults.png'),
    fullPage: true,
  });
});