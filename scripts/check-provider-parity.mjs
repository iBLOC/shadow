#!/usr/bin/env node
/**
 * 「两端供应商面**逐项对齐**」闸（2026-11-04）。
 *
 * ## 它盯的是什么
 *
 * 桌面端与移动端**都**把供应商交给大脑（桌面端的 provider_manager.rs
 * 只是一个 HTTP 代理 ⇒ 真相在端脑那一张表）⇒ ⇒ 两端**必须打同一组端点、
 * 发同一组字段**。
 *
 * ⚠️ 这条线**已经漂过一次**（实测 2026-11-04）：
 * 桌面端 provider_add_custom 带 provider_type（用户能选 OpenAI / Claude
 * 标准），而移动端 addProvider **不带** ⇒ ⇒ 端脑对「没给标准」的兜底是
 * OpenAi ⇒ ⇒ **手机上加的自定义供应商一律是 openai 标准** ⇒ ⇒ 加一个
 * Claude 协议的端点 ⇒ ⇒ 端脑按 OpenAI 格式发 ⇒ ⇒ 400/401 ⇒ ⇒ 而读回来的
 * api_standard 也是 "openai" ⇒ ⇒ **界面看不出异常** ⇒ ⇒ **失败长得像成功**。
 *
 * 同一次漂移还带走了三样：
 *   * 「测试并获取模型」的无状态预览（POST /models/providers/preview）
 *   * 拉模型列表（POST /models/providers/{id}/fetch-models）
 *   * 编辑自定义供应商时改定义（名字 / 地址 / 接口标准）
 * ⇒ ⇒ 手机上新加的供应商模型区永远是「—」⇒ ⇒ **同一份数据、两个界面
 * 显示不一样**。
 *
 * ## ⚠️ 判据必须**逐个函数体**看（不能「文件里出现过就算」）
 *
 * 第一版这个闸写成「mobileClient 里出现过 body['provider_type']」⇒ ⇒
 * **反向验证当场把它拆穿**：把 **addProvider** 里的那一行删掉，而
 * **updateProvider** 里那行还在 ⇒ ⇒ 闸**照样绿** ⇒ ⇒ 它测的是「文件里
 * 有这句话」，不是「**每一条路都带了**」⇒ ⇒ 正是它本该拦的那种漂移。
 *
 * ⇒ ⇒ 现在判据改成：**把函数体 / 调用实参抠出来**，逐条判。
 *
 * ## 判据清单
 *
 * | 面 | 必须 | 必须**不** |
 * |---|---|---|
 * | 移动端 addProvider | body['provider_type'] | —— |
 * | 移动端 updateProvider | body['provider_type'] | —— |
 * | 移动端界面 · 自定义新增 | providerType | —— |
 * | 移动端界面 · 预设新增 | —— | providerType（定义由目录给） |
 * | 移动端界面 · 自定义编辑 | providerType | —— |
 * | 桌面端 provider_add_custom | "provider_type": standard.as_str() | —— |
 * | 桌面端 provider_update_custom | "provider_type": standard.as_str() | —— |
 * | 桌面端 provider_add_preset | —— | "provider_type"（同上） |
 * | 两端 | preview ＋ fetch-models 两个端点 | —— |
 * | 两端界面 | 「接口标准」下拉 | —— |
 *
 * ## 退出码
 *
 *   0 —— 全绿；
 *   1 —— **有红**（两端又漂了）；
 *   2 —— **判不了**（判据源不在 ⇒ ⇒ 绝不当「没问题」）。
 *
 * ## 用法
 *
 *   node scripts/check-provider-parity.mjs            # 判定
 *   node scripts/check-provider-parity.mjs --self-test # 探测器自检（含反控）
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = resolve(HERE, '..');

const SOURCES = {
  mobileClient: join(
    REPO,
    'shadow-mobile',
    'lib',
    'services',
    'telencephalon',
    'telencephalon_client.dart',
  ),
  mobileScreen: join(REPO, 'shadow-mobile', 'lib', 'screens', 'providers_screen.dart'),
  desktopRust: join(REPO, 'shadow-desktop', 'src-tauri', 'src', 'provider_manager.rs'),
  desktopUi: join(REPO, 'shadow-desktop', 'src', 'pages', 'ProvidersPage.tsx'),
};

/**
 * 从 anchor 处开始，取**配平括号**的那一段（函数体 / 调用实参）。
 *
 * ⚠️ 为什么要抠出来而不是全文 includes ⇒ ⇒ 「文件里出现过」≠「**每条
 * 路**都带」⇒ ⇒ 那正是第一版闸被反向验证拆穿的地方。
 *
 * @param {string} text
 * @param {string} anchor 锚（要唯一）
 * @returns {string|null} 配平后的那一段（含首尾括号）；找不到 ⇒ null
 */
/**
 * 配平括号**之后**的下标（绝对）；找不到 ⇒ -1。
 *
 * ⚠️ 为什么要单独返回「下标」而不是「那一段」：调用方要**接着往后找**（找
 * ⇒ ⇒ 函数体）⇒ ⇒ 只拿到一段文字就得自己算偏移 ⇒ ⇒ 算错就会**把具名
 * ⇒ ⇒ 参数里的花括号当成函数体**（Dart 的 `addProvider({...})` 就是这个
 * ⇒ ⇒ 形状）⇒ ⇒ 判据会去看参数表 ⇒ ⇒ 假红/假绿。
 *
 * @param {string} text
 * @param {string} anchor
 * @returns {number}
 */
export function balancedEnd(text, anchor) {
  const start = text.indexOf(anchor);
  if (start < 0) return -1;
  const open = text.indexOf('(', start);
  if (open < 0) return -1;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** 取 anchor 处那段配平括号（**相对于传入的 text**）。 */
export function extractBalanced(text, anchor) {
  const end = balancedEnd(text, anchor);
  if (end < 0) return null;
  const open = text.indexOf('(', text.indexOf(anchor));
  return text.slice(open, end);
}

/**
 * 取 anchor 处那个函数的**函数体**（配平花括号）。
 *
 * ⚠️ 为什么要单独一个：配平**圆括号**取到的是**参数表** ⇒ ⇒ 判据会去看
 * 参数表里有没有那个字段 ⇒ ⇒ 判的不是「函数体里带没带」⇒ ⇒ 假绿。
 *
 * @param {string} text
 * @param {string} anchor 锚（**不要**带结尾的左括号）
 * @returns {string|null}
 */
export function extractBody(text, anchor) {
  const end = balancedEnd(text, anchor);
  if (end < 0) return null;
  const braceAt = text.indexOf('{', end);
  if (braceAt < 0) return null;
  let depth = 0;
  for (let i = braceAt; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(braceAt, i + 1);
    }
  }
  return null;
}

/** 取某锚点的**全部**出现（每一段配平括号）。 */
export function extractAllBalanced(text, anchor) {
  const out = [];
  let from = 0;
  for (;;) {
    const at = text.indexOf(anchor, from);
    if (at < 0) break;
    const piece = extractBalanced(text.slice(at), anchor);
    if (piece === null) break;
    out.push(piece);
    from = at + anchor.length;
  }
  return out;
}

/**
 * 判定（**纯函数** ⇒ ⇒ 自检能逐条钉住它 ⇒ ⇒ 判据不会被悄悄放宽）。
 *
 * @param sources 四个源码文件的文本
 * @returns {{reds: string[]}}
 */
export function judge(sources) {
  const { mobileClient, mobileScreen, desktopRust, desktopUi } = sources;
  const reds = [];
  const need = (cond, why) => {
    if (!cond) reds.push(why);
  };

  // ── ① 移动端客户端：**新增**与**修改**两条路**各自**都要带 provider_type ──
  const mAdd = extractBody(mobileClient, 'Future<RegisteredProvider> addProvider');
  const mUpd = extractBody(mobileClient, 'Future<RegisteredProvider> updateProvider');
  need(mAdd !== null, '移动端：找不到 addProvider（判据源变了 ⇒ ⇒ 闸必须红，不许当「没问题」）');
  need(mUpd !== null, '移动端：找不到 updateProvider（判据源变了 ⇒ ⇒ 闸必须红）');
  need(
    mAdd !== null && /body\['provider_type'\]\s*=\s*providerType/.test(mAdd),
    '移动端 addProvider 没带 provider_type ⇒ ⇒ 端脑一律当 openai（加 Claude 端点必坏而界面无感）',
  );
  need(
    mUpd !== null && /body\['provider_type'\]\s*=\s*providerType/.test(mUpd),
    '移动端 updateProvider 没带 provider_type ⇒ ⇒ 「界面说一个标准、盘上是另一个」',
  );

  // ── ② 移动端界面：**自定义**那条路要带，**预设**那条路**不许**带 ──
  const addCalls = extractAllBalanced(mobileScreen, 'notifier.addProvider(');
  const updCalls = extractAllBalanced(mobileScreen, 'notifier.updateProvider(');
  const customAdd = addCalls.find((c) => c.includes('name:'));
  const presetAdd = addCalls.find((c) => c.includes('presetId:'));
  need(
    customAdd !== undefined && customAdd.includes('providerType:'),
    '移动端界面：自定义新增没把 providerType 传下去 ⇒ ⇒ 选的标准是摆设',
  );
  need(
    presetAdd === undefined || !presetAdd.includes('providerType:'),
    '移动端界面：预设新增**不该**带 providerType（定义由大脑的目录给 ⇒ ⇒ 带了就不一致）',
  );
  need(
    updCalls.some((c) => c.includes('providerType:')),
    '移动端界面：自定义编辑没把 providerType 传下去 ⇒ ⇒ 改不了标准',
  );

  // ── ③ 桌面端 Rust：custom 两条路各自要带；**preset 那条不许带** ──
  const dAdd = extractBody(desktopRust, 'pub async fn provider_add_custom');
  const dUpd = extractBody(desktopRust, 'pub async fn provider_update_custom');
  const dPreset = extractBody(desktopRust, 'pub async fn provider_add_preset');
  need(dAdd !== null, '桌面端：找不到 provider_add_custom（判据源变了 ⇒ ⇒ 闸必须红）');
  need(dUpd !== null, '桌面端：找不到 provider_update_custom（判据源变了 ⇒ ⇒ 闸必须红）');
  need(
    dAdd !== null && /"provider_type":\s*standard\.as_str\(\)/.test(dAdd),
    '桌面端 provider_add_custom 没带 provider_type',
  );
  need(
    dUpd !== null && /"provider_type":\s*standard\.as_str\(\)/.test(dUpd),
    '桌面端 provider_update_custom 没带 provider_type',
  );
  need(
    dPreset === null || !dPreset.includes('provider_type'),
    '桌面端 provider_add_preset **不该**带 provider_type（定义由目录给）',
  );

  // ── ④ 模型那三件套（预览 / 落盘拉取）必须两端都在 ──
  need(
    mobileClient.includes("'/models/providers/preview'"),
    '移动端：没有「测试并获取模型」的无状态预览（POST /models/providers/preview）',
  );
  need(
    mobileClient.includes('/fetch-models'),
    '移动端：没有拉模型列表（POST /models/providers/{id}/fetch-models）⇒ ⇒ 模型区永远是「—」',
  );
  need(
    desktopRust.includes('"/models/providers/preview"'),
    '桌面端：没有无状态预览（POST /models/providers/preview）',
  );
  need(
    desktopRust.includes('/fetch-models'),
    '桌面端：没有拉模型列表（POST /models/providers/{id}/fetch-models）',
  );

  // ── ⑤ 界面上的入口（不然「有端点但没人调」＝ 等于没有）──
  need(
    mobileScreen.includes('providersStandard'),
    '移动端：表单里没有「接口标准」下拉 ⇒ ⇒ 用户选不了 Claude 标准',
  );
  need(
    mobileScreen.includes('providersPreviewModels'),
    '移动端：没有「预览模型」入口',
  );
  need(
    mobileScreen.includes('providersRefreshModels'),
    '移动端：没有「刷新模型」入口',
  );
  need(
    desktopUi.includes('providers.standard'),
    '桌面端：表单里没有「接口标准」下拉',
  );

  return { reds };
}

/** 读四个判据源（缺一个 ⇒ ⇒ 判不了 ⇒ ⇒ 退出码 2，绝不当「没问题」）。 */
export function readSources() {
  const out = {};
  for (const [key, path] of Object.entries(SOURCES)) {
    if (!existsSync(path)) return { missing: path };
    out[key] = readFileSync(path, 'utf8');
  }
  return out;
}

/** ── 自检：夹具**与真实输入同形**，且**必须能翻脸** ── */
function selfTest() {
  const good = {
    mobileClient: [
      'Future<RegisteredProvider> addProvider({',
      '  String? providerType,',
      '}) async {',
      "  if (providerType != null) body['provider_type'] = providerType;",
      "  return RegisteredProvider.fromJson(await _post('/models/providers', body));",
      '}',
      '',
      'Future<RegisteredProvider> updateProvider(',
      '  String id, {',
      '  String? providerType,',
      '}) async {',
      "  if (providerType != null) body['provider_type'] = providerType;",
      "  return RegisteredProvider.fromJson(await _put('/models/providers/x', body));",
      '}',
      '',
      "await _post('/models/providers/preview', body);",
      "'/models/providers/' + id + '/fetch-models',",
    ].join('\n'),
    mobileScreen: [
      'notifier.addProvider(name: name, providerType: _apiStandard, apiKey: key);',
      'notifier.addProvider(presetId: _selectedPresetId, apiKey: key);',
      'notifier.updateProvider(id, providerType: _apiStandard, apiKey: key);',
      'l10n.providersStandard',
      'l10n.providersPreviewModels',
      'l10n.providersRefreshModels',
    ].join('\n'),
    desktopRust: [
      'pub async fn provider_add_custom(',
      ') -> Result<ProviderEntry, String> {',
      '  let body = json!({',
      '    "provider_type": standard.as_str(),',
      '  });',
      '}',
      '',
      'pub async fn provider_update_custom(',
      ') -> Result<ProviderEntry, String> {',
      '  let body = json!({',
      '    "provider_type": standard.as_str(),',
      '  });',
      '}',
      '',
      'pub async fn provider_add_preset(',
      ') -> Result<ProviderEntry, String> {',
      '  let body = json!({ "preset_id": preset_id });',
      '}',
      '',
      'brain_post(&brain_base(), "/models/providers/preview", body).await?;',
      '"/models/providers/{}/fetch-models",',
    ].join('\n'),
    desktopUi: "t('providers.standard')",
  };
  const results = [];
  const check = (name, cond) => results.push({ name, ok: !!cond });

  // 正控：完整形态 ⇒ 零红。
  const goodReds = judge(good).reds;
  if (goodReds.length) console.log('  正控红项：' + goodReds.join(' | '));
  check('正控：完整形态 ⇒ 零红', goodReds.length === 0);

  // 反控逐条：**每一处**漂移都必须红（否则闸是摆设）。
  //
  // ⚠️ 变体是**显式写出来**的（不是「把某句话删掉」）⇒ ⇒ 每条反控只动
  // ⇒ ⇒ **一处** ⇒ ⇒ 红了就一定是那一条判据抓的 ⇒ ⇒ 不会「红得莫名其妙」。
  const addGood = [
    'Future<RegisteredProvider> addProvider({',
    '  String? providerType,',
    '}) async {',
    "  if (providerType != null) body['provider_type'] = providerType;",
    "  return RegisteredProvider.fromJson(await _post('/models/providers', body));",
    '}',
  ].join('\n');
  const updGood = [
    'Future<RegisteredProvider> updateProvider(',
    '  String id, {',
    '  String? providerType,',
    '}) async {',
    "  if (providerType != null) body['provider_type'] = providerType;",
    "  return RegisteredProvider.fromJson(await _put('/models/providers/x', body));",
    '}',
  ].join('\n');
  const addNoType = [
    'Future<RegisteredProvider> addProvider({',
    '}) async {',
    "  return RegisteredProvider.fromJson(await _post('/models/providers', body));",
    '}',
  ].join('\n');
  const updNoType = [
    'Future<RegisteredProvider> updateProvider(',
    '  String id, {',
    '}) async {',
    "  return RegisteredProvider.fromJson(await _put('/models/providers/x', body));",
    '}',
  ].join('\n');
  const rustAddGood = [
    'pub async fn provider_add_custom(',
    ') -> Result<ProviderEntry, String> {',
    '  let body = json!({',
    '    "provider_type": standard.as_str(),',
    '  });',
    '}',
  ].join('\n');
  const rustUpdGood = [
    'pub async fn provider_update_custom(',
    ') -> Result<ProviderEntry, String> {',
    '  let body = json!({',
    '    "provider_type": standard.as_str(),',
    '  });',
    '}',
  ].join('\n');
  const rustAddNoType = [
    'pub async fn provider_add_custom(',
    ') -> Result<ProviderEntry, String> {',
    '  let body = json!({',
    '    "name": name,',
    '  });',
    '}',
  ].join('\n');
  const rustUpdNoType = [
    'pub async fn provider_update_custom(',
    ') -> Result<ProviderEntry, String> {',
    '  let body = json!({',
    '    "name": name,',
    '  });',
    '}',
  ].join('\n');
  const rustPresetGood = [
    'pub async fn provider_add_preset(',
    ') -> Result<ProviderEntry, String> {',
    '  let body = json!({ "preset_id": preset_id });',
    '}',
  ].join('\n');
  const rustPresetWithType = [
    'pub async fn provider_add_preset(',
    ') -> Result<ProviderEntry, String> {',
    '  let body = json!({ "preset_id": preset_id, "provider_type": "openai" });',
    '}',
  ].join('\n');
  const screenCustomAdd =
    'notifier.addProvider(name: name, providerType: _apiStandard, apiKey: key);';
  const screenCustomAddNoType =
    'notifier.addProvider(name: name, apiKey: key);';
  const screenPresetAdd =
    'notifier.addProvider(presetId: _selectedPresetId, apiKey: key);';
  const screenPresetAddWithType =
    'notifier.addProvider(presetId: _selectedPresetId, providerType: _apiStandard, apiKey: key);';
  const screenUpd =
    'notifier.updateProvider(id, providerType: _apiStandard, apiKey: key);';
  const screenUpdNoType = 'notifier.updateProvider(id, apiKey: key);';

  /** 把某个源文件里的一段换成另一段（其余不动）。 */
  const swap = (src, from, to) => {
    const out = { ...src };
    for (const key of Object.keys(out)) {
      if (out[key].includes(from)) out[key] = out[key].replace(from, to);
    }
    return out;
  };
  check(
    '反控：移动端**新增**去掉 provider_type ⇒ 红（哪怕修改里还在）',
    judge(swap(good, addGood, addNoType)).reds.length > 0,
  );
  check(
    '反控：移动端**修改**去掉 provider_type ⇒ 红（哪怕新增里还在）',
    judge(swap(good, updGood, updNoType)).reds.length > 0,
  );
  check(
    '反控：移动端界面自定义新增不传 providerType ⇒ 红',
    judge(swap(good, screenCustomAdd, screenCustomAddNoType)).reds.length > 0,
  );
  check(
    '反控：移动端界面**预设**新增多传 providerType ⇒ 红',
    judge(swap(good, screenPresetAdd, screenPresetAddWithType)).reds.length > 0,
  );
  check(
    '反控：桌面端**新增**去掉 provider_type ⇒ 红（哪怕修改里还在）',
    judge(swap(good, rustAddGood, rustAddNoType)).reds.length > 0,
  );
  check(
    '反控：桌面端**修改**去掉 provider_type ⇒ 红（哪怕新增里还在）',
    judge(swap(good, rustUpdGood, rustUpdNoType)).reds.length > 0,
  );
  check(
    '反控：桌面端**预设**新增多带 provider_type ⇒ 红',
    judge(swap(good, rustPresetGood, rustPresetWithType)).reds.length > 0,
  );
  check(
    '反控：移动端去掉 preview 端点 ⇒ 红',
    judge(swap(good, "'/models/providers/preview'", "'/models/providers/gone'")).reds.length > 0,
  );
  check(
    '反控：移动端去掉 fetch-models 端点 ⇒ 红',
    judge(swap(good, '/fetch-models', '/gone-models')).reds.length > 0,
  );
  check(
    '反控：桌面端去掉 preview 端点 ⇒ 红',
    judge(swap(good, '"/models/providers/preview"', '"/models/providers/gone"')).reds.length > 0,
  );
  check(
    '反控：桌面端去掉 fetch-models 端点 ⇒ 红',
    judge(swap(good, '/fetch-models', '/gone-models')).reds.length > 0,
  );
  check(
    '反控：移动端界面去掉「接口标准」⇒ 红',
    judge(swap(good, 'l10n.providersStandard', 'l10n.goneStandard')).reds.length > 0,
  );
  check(
    '反控：移动端界面去掉「预览模型」⇒ 红',
    judge(swap(good, 'l10n.providersPreviewModels', 'l10n.gonePreview')).reds.length > 0,
  );
  check(
    '反控：移动端界面去掉「刷新模型」⇒ 红',
    judge(swap(good, 'l10n.providersRefreshModels', 'l10n.goneRefresh')).reds.length > 0,
  );
  check(
    '反控：桌面端界面去掉「接口标准」⇒ 红',
    judge(swap(good, 'providers.standard', 'providers.goneStandard')).reds.length > 0,
  );

  let bad = 0;
  for (const r of results) {
    if (!r.ok) bad++;
    console.log((r.ok ? '✓ ' : '✗ ') + r.name);
  }
  console.log('自检：' + (results.length - bad) + '/' + results.length + ' 全绿');
  return bad === 0 ? 0 : 1;
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) {
  process.exit(selfTest());
}

const sources = readSources();
if (sources.missing) {
  console.error('✗ 判据源不在：' + sources.missing + ' ⇒ ⇒ 判不了（退出码 2，不当「没问题」）');
  process.exit(2);
}

const { reds } = judge(sources);
if (reds.length === 0) {
  console.log('✓ 两端供应商面逐项对齐：接口标准 ＋ 预览 ＋ 刷新 ＋ 改定义');
  process.exit(0);
}
console.error('✗ 两端供应商面又漂了：');
for (const r of reds) console.error('  · ' + r);
process.exit(1);
