#!/usr/bin/env node
/**
 * 本地模型下载闸 —— 「**手机上真的能把模型下下来、下下来就能用**」这一刀的门面
 * ============================================================================
 *
 * ## 它钉什么
 *
 * 2026-11-18 那一刀修「移动端模型还是下载失败」（用户逐字），四层各钉一格：
 *
 *   · **可写的落点**：Android 进程没有 `$HOME`、工作目录是 `/` ⇒ neuron 默认
 *     模型库 `~/.neuron/models` 在手机上是 `/.neuron/models` ⇒ 下载必死在
 *     建目录那一步。宿主从 `nativeStart` 的 `data_dir` 派生 `<data_dir>/models`
 *     ⇒ 端脑用 `with_model_dirs`（**整体替换**，`Registry::root()` 取第一个）
 *     交给 neuron —— 不为路径另开 JNI 通道（宿主只交「哪个目录可写」）。
 *   · **国内可达的源**：目录里同一个模型有多份仓库时，合并后 **ModelScope 排
 *     第一**（`default_repo` 跟着指魔搭）⇒ 客户端拿 `default_repo` 发起 pull
 *     就落在魔搭上，不撞被墙的 hf.co。
 *   · **断点续传**：ModelScope 源此前把整个文件 `resp.bytes()` 一次性读进内存
 *     再写盘 ⇒ 大模型在断流的链路上永远下不完。共享的
 *     `models::resumable::fetch_file_resumable`（Range ＋ 流式落盘 ＋
 *     `200 + Content-Range` 也能续）两个源共用；失败**不删**落盘现场
 *     （puller 不再 `remove_dir_all`）⇒ 重试从断点接着下。
 *   · **下载完就能用**：boot 自动扫描只跑一次 ⇒ pull 完的模型在盘上却没注册
 *     ⇒ 请求报 `ModelNotRegistered` ⇒ 「重启应用才能用」。`runtime_for` 的
 *     miss 路径懒注册（`try_register_downloaded`）。
 *   · **历史支持模型库**：老模型（qwen2.5 这类被新一代顶掉的）不再推荐、
 *     仍可下载 —— `LEGACY_MODEL_IDS` ⇒ `recommended=false` ⇒ 客户端折叠段。
 *
 * ⚠️ 为什么要有闸：这一刀的每一格都是「**换了名／挪了文件／删了行 ⇒ 编译
 *    照样过**」的形状 ⇒ ⇒ 唯一的证据是**形状**。
 *
 * ## 七条
 *
 *   N1 国内默认源：合并段 `SOURCE_PRIORITY`（modelscope ＜ hf-mirror ＜
 *      huggingface）＋ `default_repo` 跟第一源 ＋ `/v1/models` 露出 `recommended`
 *   N2 历史库：`LEGACY_MODEL_IDS` ＋ `is_legacy_model` ＋ `CatalogEntry.recommended`
 *      ＋ qwen2.5-0.5b 真在清单里（清单打错字 ⇒ 永远不生效 ⇒ 尺子自己骗自己）
 *   N3 共享续传：resumable.rs 有 Range ＋ Content-Range 判读 ＋ 重试预算；
 *      modelscope.rs 调共享实现（**负控**：实现段不许再有 `resp.bytes()`）；
 *      huggingface.rs 委托共享实现（不许再自带一份 —— 同一条规则两份实现
 *      ⇒ 变异只打掉一份 ⇒ 另一份把断言喂饱）
 *   N4 **负控**：puller 失败分支不许删目录（`remove_dir_all` 零命中——
 *      注释不算）
 *   N5 模型目录接线：`with_model_dirs`（整体替换）＋ 端脑带目录入口 ＋
 *      encephalon 传 `data_dir` 派生 ＋ **桌面端显式 `model_dir: None`**
 *      （桌面沿用 `$HOME`，不挪窝）
 *   N6 懒注册：`try_register_downloaded` ＋ runtime_for miss 路径先试它
 *   N7 客户端面：历史库段（ExpansionTile）＋ `recommended`/`engine_impl`/
 *      `source` 解析 ＋ 失败行把服务端错误亮出来（`j.error`）
 *
 * ## 用法
 *
 *   node scripts/check-neuron-model-download.mjs              # 判
 *   node scripts/check-neuron-model-download.mjs --self-test  # 判据自检（N/N）
 *
 * 退出码：**0 绿 / 1 红 / 2 判不了**（源没读全 ⇒ ≠ 没问题）。
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sibling } from './lib/sibling-repo.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const NL = String.fromCharCode(10);

/** 判据条数（自检与「N/N」读数都用它 ⇒ ⇒ 不许手写一个会漂的数）。 */
export const RULE_COUNT = 7;

/** 出现次数（纯字符串计数 ⇒ ⇒ 不引正则 ⇒ ⇒ 不用怕反斜杠被吃）。 */
function hits(src, needle) {
  if (!needle) return 0;
  return src.split(needle).length - 1;
}

/** 去掉注释 ⇒ ⇒ 负控只判**代码**（描述缺陷的注释自己也会撞闸）。 */
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split(NL)
    .map((line) => {
      const idx = line.indexOf('//');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join(NL);
}

function requireAll(src, tokens) {
  return tokens.filter((t) => hits(src, t) === 0);
}

/** 取 `<a>…<b>` 中间那段（判「失败分支」这一小段时用）。 */
function between(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  if (a < 0) return '';
  const from = a + startMarker.length;
  const b = src.indexOf(endMarker, from);
  return b < 0 ? src.slice(from) : src.slice(from, b);
}

/**
 * 纯函数：各源文件的内容 ⇒ ⇒ 结论。
 * ⚠️ **零 I/O** ⇒ ⇒ 自检喂合成夹具 ⇒ ⇒ 自检不会恒绿。
 */
export function evaluate(sources) {
  const findings = [];
  const add = (rule, file, detail) => findings.push({ rule, file, detail });

  const catalog = sources.catalog || '';
  const handlers = sources.handlers || '';
  const resumable = sources.resumable || '';
  const modelscope = stripComments(sources.modelscope || '');
  const huggingface = sources.huggingface || '';
  const pullerCode = stripComments(sources.puller || '');
  const pullerFailBranch = stripComments(
    between(sources.puller || '', 'Err(e) => (JobStatus::Failed', 'jobs.lock().unwrap().get_mut(&id_for_task)'),
  );
  const config = sources.config || '';
  const llmRegistry = sources.llmRegistry || '';
  const teleEmbed = sources.teleEmbed || '';
  const encEmbedded = sources.encEmbedded || '';
  const encMobile = sources.encMobile || '';
  const desktopLib = sources.desktopLib || '';
  const mobileClient = sources.mobileClient || '';
  const mobileSheet = sources.mobileSheet || '';

  // N1 —— 国内默认源（合并段排序 ＋ default_repo 跟第一源 ＋ 露出 recommended）
  {
    const missing = requireAll(catalog, [
      'const SOURCE_PRIORITY',
      '"modelscope", "hf-mirror", "huggingface"',
      'entry.sources.sort_by_key',
      'entry.default_repo = Some(first.reference.clone())',
    ]);
    if (missing.length > 0) {
      add('N1', 'neuron/src/models/catalog.rs',
        '合并段不再把 ModelScope 排第一（缺：' + missing.join('、') + '）⇒ ⇒ 国内用户拿 default_repo 发起 pull 会撞被墙的 hf.co');
    }
    const missingExposure = requireAll(handlers, [
      '"recommended": e.recommended',
    ]);
    if (missingExposure.length > 0) {
      add('N1', 'neuron/src/models/handlers.rs',
        '/v1/models 不再露出 recommended ⇒ ⇒ 客户端分不出推荐档与历史库');
    }
  }

  // N2 —— 历史支持模型库（老模型不推荐、仍可下载）
  {
    const missing = requireAll(catalog, [
      'pub const LEGACY_MODEL_IDS',
      'pub fn is_legacy_model',
      'pub recommended: bool',
      '"qwen2.5-0.5b"',
      'recommended: !is_legacy_model(s.id)',
    ]);
    if (missing.length > 0) {
      add('N2', 'neuron/src/models/catalog.rs',
        '历史库那一层不在了（缺：' + missing.join('、') + '）⇒ ⇒ 老模型要么消失要么重新混进推荐档');
    }
  }

  // N3 —— 共享断点续传（modelscope 不许 one-shot；huggingface 不许自带第二份）
  {
    const missing = requireAll(resumable, [
      'reqwest::header::RANGE',
      'reqwest::header::CONTENT_RANGE',
      'MAX_STALLED_ATTEMPTS',
      'MAX_TOTAL_ATTEMPTS',
      'bytes_stream()',
    ]);
    if (missing.length > 0) {
      add('N3', 'neuron/src/models/resumable.rs',
        '共享续传不在了（缺：' + missing.join('、') + '）⇒ ⇒ 断流一次就从头再来');
    }
    if (hits(modelscope, 'fetch_file_resumable') === 0) {
      add('N3', 'neuron/src/models/modelscope.rs',
        'ModelScope 源不再走共享续传 ⇒ ⇒ 大文件一次性读进内存，断链必死');
    }
    // 负控（只判实现段）：one-shot 的 `resp.bytes()` 不许回来。
    if (hits(modelscope, '.bytes()') > 0) {
      add('N3', 'neuron/src/models/modelscope.rs',
        'ModelScope 源又把整个文件 `resp.bytes()` 读进内存了 ⇒ ⇒ one-shot 回潮');
    }
    const missingDelegate = requireAll(huggingface, [
      'super::resumable::fetch_file_resumable(',
    ]);
    if (missingDelegate.length > 0) {
      add('N3', 'neuron/src/models/huggingface.rs',
        'HuggingFace 源不再委托共享实现 ⇒ ⇒ 同一条续传规则两份实现，变异只打掉一份另一份会把断言喂饱');
    }
  }

  // N4 —— 负控：失败不删落盘现场（断点全靠「盘上还留着上一次的进度」）
  {
    if (hits(pullerCode, 'remove_dir_all') > 0 || hits(pullerFailBranch, 'remove_dir_all') > 0) {
      add('N4', 'neuron/src/models/puller.rs',
        'puller 的失败路径又删起目录了（remove_dir_all 在场）⇒ ⇒ 每一次重试都从字节 0 重新开始');
    }
  }

  // N5 —— 模型目录接线（宿主给可写目录；桌面显式不挪窝）
  {
    const missingCfg = requireAll(config, [
      'pub fn with_model_dirs(',
      'self.model_dirs = dirs;',
    ]);
    if (missingCfg.length > 0) {
      add('N5', 'neuron/src/config.rs',
        'with_model_dirs（整体替换）不在了（缺：' + missingCfg.join('、') + '）⇒ ⇒ 追加的目录永远排在默认目录后面，Registry::root() 看不见');
    }
    const missingTele = requireAll(teleEmbed, [
      'pub async fn start_neuron_router_only_with_model_dir(',
      'with_model_dirs(vec![model_dir])',
    ]);
    if (missingTele.length > 0) {
      add('N5', 'telencephalon/src/neuron_embed.rs',
        '端脑的带目录入口不在了（缺：' + missingTele.join('、') + '）⇒ ⇒ 手机上模型库落回不可写的 /.neuron/models');
    }
    const missingEnc = requireAll(encEmbedded, [
      'pub model_dir: Option<std::path::PathBuf>',
      'start_neuron_router_only_with_model_dir(dir.clone())',
    ]);
    if (missingEnc.length > 0) {
      add('N5', 'encephalon/src/embedded.rs',
        '宿主不再把模型目录递给端脑（缺：' + missingEnc.join('、') + '）');
    }
    const missingMobile = requireAll(encMobile, [
      'model_dir: data_dir.map(',
      'models',
    ]);
    if (missingMobile.length > 0) {
      add('N5', 'encephalon/src/mobile/mod.rs',
        'mobile 启动不再从 data_dir 派生模型目录（缺：' + missingMobile.join('、') + '）');
    }
    // 桌面显式 None —— 桌面沿用 $HOME，已下载的模型库不挪窝。
    if (hits(desktopLib, 'model_dir: None') === 0) {
      add('N5', 'shadow-desktop/src-tauri/src/lib.rs',
        '桌面端没有显式 `model_dir: None` ⇒ ⇒ 谁把桌面默认改成挪窝，历史下载全部「变成没下载」');
    }
  }

  // N6 —— 懒注册（下载完即可用，不必重启应用）
  {
    const missing = requireAll(llmRegistry, [
      'fn try_register_downloaded',
      'if !self.is_registered(model_id)',
      'self.try_register_downloaded(model_id)',
    ]);
    if (missing.length > 0) {
      add('N6', 'neuron/src/llm/registry.rs',
        '懒注册不在了（缺：' + missing.join('、') + '）⇒ ⇒ pull 成功但请求报 ModelNotRegistered，重启应用才能用');
    }
  }

  // N7 —— 客户端面（两段式 ＋ 新字段解析 ＋ 失败说真话）
  {
    const missingParse = requireAll(mobileClient, [
      "json['recommended'] as bool? ?? true",
      "json['engine_impl'] as String? ?? ''",
      "json['source'] as String? ?? ''",
    ]);
    if (missingParse.length > 0) {
      add('N7', 'shadow-mobile/lib/services/telencephalon/telencephalon_client.dart',
        '目录条目新字段不再解析（缺：' + missingParse.join('、') + '）⇒ ⇒ 引擎档／历史库／主源在界面上消失');
    }
    const missingSheet = requireAll(mobileSheet, [
      'providersDownloadLegacy(',
      'ExpansionTile',
      'entry.engineImpl.isNotEmpty',
      // ⚠️ 判「失败行亮真错误」要用**守卫表达式**整体当词元：裸词
      // `j.error` 太钝 —— 渲染处（`j.error!`）还在、守卫被拆掉时，
      // 裸词照样命中 ⇒ 变异绕过去了（2026-11-18 真变异当场逮到过这一钝）。
      "(j.error ?? '').isNotEmpty",
    ]);
    if (missingSheet.length > 0) {
      add('N7', 'shadow-mobile/lib/widgets/models/neuron_download_sheet.dart',
        '下载面板的两段式／引擎档／真错误不在了（缺：' + missingSheet.join('、') + '）⇒ ⇒ 失败只剩「下载失败」四个字，真原因没人看得见');
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// 源读取（真文件；两个布局都认 —— 兄弟仓在 shadow 外或被 checkout 进来）
// ---------------------------------------------------------------------------

function readSource(paths) {
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        return { src: readFileSync(p, 'utf8'), path: p };
      } catch {
        // 读不动 ⇒ 按缺失处理（exit 2）。
      }
    }
  }
  return { src: null, path: paths[0] };
}

function collectSources() {
  const neuron = sibling(REPO_ROOT, 'neuron');
  const telencephalon = sibling(REPO_ROOT, 'telencephalon');
  const encephalon = sibling(REPO_ROOT, 'encephalon');
  const n = (...p) => [join(neuron, ...p), join(REPO_ROOT, 'neuron', ...p)];
  const t = (...p) => [join(telencephalon, ...p), join(REPO_ROOT, 'telencephalon', ...p)];
  const e = (...p) => [join(encephalon, ...p), join(REPO_ROOT, 'encephalon', ...p)];
  const s = (...p) => [join(REPO_ROOT, ...p)];

  return {
    catalog: readSource(n('src', 'models', 'catalog.rs')),
    handlers: readSource(n('src', 'models', 'handlers.rs')),
    resumable: readSource(n('src', 'models', 'resumable.rs')),
    modelscope: readSource(n('src', 'models', 'modelscope.rs')),
    huggingface: readSource(n('src', 'models', 'huggingface.rs')),
    puller: readSource(n('src', 'models', 'puller.rs')),
    config: readSource(n('src', 'config.rs')),
    llmRegistry: readSource(n('src', 'llm', 'registry.rs')),
    teleEmbed: readSource(t('src', 'neuron_embed.rs')),
    encEmbedded: readSource(e('src', 'embedded.rs')),
    encMobile: readSource(e('src', 'mobile', 'mod.rs')),
    desktopLib: readSource(s('shadow-desktop', 'src-tauri', 'src', 'lib.rs')),
    mobileClient: readSource(s('shadow-mobile', 'lib', 'services', 'telencephalon', 'telencephalon_client.dart')),
    mobileSheet: readSource(s('shadow-mobile', 'lib', 'widgets', 'models', 'neuron_download_sheet.dart')),
  };
}

// ---------------------------------------------------------------------------
// 自检（合成夹具 ＋ 逐条变异）
// ---------------------------------------------------------------------------

function compliantFixture() {
  return {
    catalog: [
      'pub const LEGACY_MODEL_IDS: &[&str] = &["qwen2.5-0.5b", "qwen2.5-1.5b"];',
      'pub fn is_legacy_model(id: &str) -> bool { LEGACY_MODEL_IDS.contains(&id) }',
      'pub struct CatalogEntry { pub id: String, pub recommended: bool }',
      'recommended: !is_legacy_model(s.id),',
      'const SOURCE_PRIORITY: &[&str] = &["modelscope", "hf-mirror", "huggingface"];',
      'entry.sources.sort_by_key(|s| position);',
      'entry.default_repo = Some(first.reference.clone());',
    ].join(NL),
    handlers: '"recommended": e.recommended,',
    resumable: [
      'req.header(reqwest::header::RANGE, format!("bytes={offset}-"));',
      'headers().get(reqwest::header::CONTENT_RANGE)',
      'const MAX_STALLED_ATTEMPTS: u32 = 8;',
      'const MAX_TOTAL_ATTEMPTS: u32 = 100;',
      'let mut stream = file_resp.bytes_stream();',
    ].join(NL),
    modelscope: [
      'let written = crate::models::resumable::fetch_file_resumable(&client, &download_url, &dest_path, filename, bytes_downloaded, &progress_tx, "neuron/ms").await?;',
    ].join(NL),
    huggingface: 'super::resumable::fetch_file_resumable(client, url, dest_path, display_name, bytes_before_file, progress_tx, "neuron/hf").await',
    puller: [
      'let (new_status, new_error) = match result {',
      'Ok(()) => (JobStatus::Completed, None),',
      'Err(e) => (JobStatus::Failed, Some(e)),',
      '};',
      'if let Some(j) = jobs.lock().unwrap().get_mut(&id_for_task) {',
      'j.status = new_status;',
    ].join(NL),
    config: [
      'pub fn with_model_dirs(mut self, dirs: Vec<PathBuf>) -> Self {',
      'self.model_dirs = dirs;',
      'self',
      '}',
    ].join(NL),
    llmRegistry: [
      'if !self.is_registered(model_id)',
      '&& let Err(e) = self.try_register_downloaded(model_id) {',
      '}',
      '#[cfg(feature = "candle")]',
      'fn try_register_downloaded(&self, model_id: &str) -> Result<(), String> {',
    ].join(NL),
    teleEmbed: [
      'pub async fn start_neuron_router_only_with_model_dir(model_dir: std::path::PathBuf) -> Result<NeuronEmbed, String> {',
      'with_model_dirs(vec![model_dir]),',
    ].join(NL),
    encEmbedded: [
      'pub model_dir: Option<std::path::PathBuf>,',
      'start_neuron_router_only_with_model_dir(dir.clone())',
    ].join(NL),
    encMobile: 'model_dir: data_dir.map(|d| std::path::PathBuf::from(format!("{d}/models"))),',
    desktopLib: 'model_dir: None,',
    mobileClient: [
      "recommended: json['recommended'] as bool? ?? true,",
      "engineImpl: json['engine_impl'] as String? ?? '',",
      "source: json['source'] as String? ?? '',",
    ].join(NL),
    mobileSheet: [
      "title: Text(l10n.providersDownloadLegacy(legacy.length)),",
      'ExpansionTile(',
      'if (entry.engineImpl.isNotEmpty)',
      'if ((j.error ?? \'\').isNotEmpty)',
    ].join(NL),
  };
}

export function selfTest() {
  const results = [];
  const check = (name, fn) => {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (e) {
      results.push({ name, ok: false, error: e.message });
    }
  };
  const assertEq = (a, b, msg) => {
    if (a !== b) throw new Error(`${msg}：期望 ${b}，实际 ${a}`);
  };
  const rulesOf = (sources) => [...new Set(evaluate(sources).map((f) => f.rule))];

  const base = compliantFixture();

  check('合规夹具全绿', () => {
    assertEq(evaluate(base).length, 0, '合规夹具不该有红');
  });

  const mutations = [
    ['N1', (s) => ({ ...s, catalog: s.catalog.replace('entry.default_repo = Some(first.reference.clone());', '') })],
    ['N1', (s) => ({ ...s, handlers: s.handlers.replace('"recommended": e.recommended,', '') })],
    ['N2', (s) => ({ ...s, catalog: s.catalog.replace('pub const LEGACY_MODEL_IDS', 'pub const LEGACY_IDS') })],
    ['N3', (s) => ({ ...s, modelscope: s.modelscope.replace('crate::models::resumable::fetch_file_resumable(&client', 'other::fetch(&client') })],
    ['N3', (s) => ({ ...s, modelscope: s.modelscope + NL + 'let bytes = resp.bytes().await;' })],
    ['N4', (s) => ({ ...s, puller: s.puller.replace('Err(e) => (JobStatus::Failed, Some(e)),', 'Err(e) => (JobStatus::Failed, Some(e)), let _ = tokio::fs::remove_dir_all(&dest_dir).await;') })],
    ['N5', (s) => ({ ...s, encMobile: s.encMobile.replace('model_dir: data_dir.map(', 'model_dir: None, // data_dir.map') })],
    ['N6', (s) => ({ ...s, llmRegistry: s.llmRegistry.replace('self.try_register_downloaded(model_id)', 'self.try_register_downloaded("x")') })],
    ['N7', (s) => ({ ...s, mobileSheet: s.mobileSheet.replace('j.error', 'jobFailure') })],
  ];
  for (const [rule, mutate] of mutations) {
    check(`变异 → 恰好 ${rule} 一条红`, () => {
      const reds = rulesOf(mutate(base));
      assertEq(reds.length, 1, `变异应当只红一条判据，实际红了：${reds.join('、')}`);
      assertEq(reds[0], rule, '红的判据不对');
    });
  }

  check('判据条数与 RULE_COUNT 一致（尺子自己也要被量）', () => {
    assertEq(RULE_COUNT, 7, 'RULE_COUNT');
    // N1 有两处落点（catalog ＋ handlers）—— 变异覆盖了两者。
    assertEq(mutations.filter(([r]) => r === 'N1').length, 2, 'N1 的变异道数');
  });

  return results;
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

function main() {
  if (process.argv.includes('--self-test')) {
    const results = selfTest();
    const passed = results.filter((r) => r.ok).length;
    for (const r of results) {
      console.log(`${r.ok ? 'ok' : 'FAIL'}  ${r.name}${r.ok ? '' : ' —— ' + r.error}`);
    }
    console.log(`self-test: ${passed}/${results.length}`);
    process.exit(passed === results.length ? 0 : 1);
  }

  const sources = collectSources();
  const unreadable = Object.entries(sources)
    .filter(([, v]) => v.src === null)
    .map(([k, v]) => `${k}(${v.path})`);
  if (unreadable.length > 0) {
    console.log(`UNJUDGEABLE —— 源没读全（≠ 没问题）：${unreadable.join('、')}`);
    process.exit(2);
  }

  const findings = evaluate(
    Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, v.src])),
  );
  if (findings.length === 0) {
    console.log(`neuron-model-download gate: ${RULE_COUNT}/${RULE_COUNT} —— 绿`);
    process.exit(0);
  }
  for (const f of findings) {
    console.log(`[${f.rule}] ${f.file} —— ${f.detail}`);
  }
  console.log(`neuron-model-download gate: ${RULE_COUNT - new Set(findings.map((f) => f.rule)).size}/${RULE_COUNT} —— 红`);
  process.exit(1);
}

main();
