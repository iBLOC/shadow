#!/usr/bin/env node
/**
 * 「外部工具的模型配置」接线闸（2026-11-04）。
 *
 * ## 为什么要有这道闸
 *
 * 这条能力横跨三个仓：桌面端 Rust（读本机文件）、端脑（供应商表的真相）、
 * 桌面端界面（入口）。⇒ ⇒ **三处任何一处漂了，用户看到的就是「按钮在那儿
 * 但点了没反应」** ⇒ ⇒ 而这种失败**长得像成功** ⇒ ⇒ 必须有闸。
 *
 * ⚠️⚠️ **更要紧的是「材料纪律」** —— 这一族能力**经手明文密钥** ⇒ ⇒
 * ⇒ ⇒ 闸要盯的不是「有没有接上」，而是**「材料会不会漏到不该去的地方」**：
 *   ① **扫描结果的返回里不许有材料**（只准有长度）；
 *   ② **材料出口那一路必须走「失败不带原文」的通道** —— 因为那一路的
 *      **响应原文就是材料** ⇒ ⇒ 普通通道解析失败时会把它带进错误串
 *      ⇒ ⇒ 进而进日志 ⇒ ⇒ ⇒ 那就是**材料泄漏**。
 *   ③ **OAuth 令牌槽不许写 api key**（写进去那个工具必然失败）。
 *   ④ **材料出口只在 admin 门** ＋ **有审计日志** ＋ **读面仍然只给掩码**。
 *
 * ## 判据为什么几乎不用正则
 *
 * ⚠️ **正则会随代码重排而失配**（词边界 / 转义 / 空白）⇒ ⇒ 而失配的
 * 后果是**「没判到」** ⇒ ⇒ 那**长得像通过**（假绿）⇒ ⇒ 凡是能写成
 * 「包含某个字符串」的判据，一律写成字符串包含。
 *
 * ## 退出码
 *
 * - 0：绿；
 * - 1：红（有违规）；
 * - 2：**源没读全** ⇒ ⇒ 「没红」不等于「没问题」。
 *
 * ## 用法
 *
 *     node scripts/check-external-tools.mjs
 *     node scripts/check-external-tools.mjs --self-test
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

/** 换行符 —— 显式构造 ⇒ ⇒ 外层模板里不会把它变成真换行。 */
const NL = String.fromCharCode(10);

/** 三个命令名（一处定义 ⇒ ⇒ 判据与自检不会各写一份而漂）。 */
export const CMDS = ['external_tools_scan', 'external_tools_import', 'external_tools_export'];

/** i18n 必须有的词条（两端语言都要有）。 */
export const I18N_KEYS = [
  'externalTools',
  'externalToolsTitle',
  'externalToolsHint',
  'externalToolsEmpty',
  'importFromTool',
  'exportToTool',
  'exportHint',
  'exportPick',
  'exportConfirm',
];

/** 从 marker 起，到下一个「行首 }」为止的那一段（拿函数/结构体的正文）。 */
export function extractBlock(text, marker) {
  const i = text.indexOf(marker);
  if (i < 0) return null;
  const rest = text.slice(i);
  const end = rest.indexOf(NL + '}');
  return end < 0 ? rest : rest.slice(0, end);
}

/** 从 marker 起往后 span 个字符（拿路由那一段上下文）。 */
export function around(text, marker, span) {
  const i = text.indexOf(marker);
  if (i < 0) return '';
  return text.slice(Math.max(0, i - 120), i + span);
}

/**
 * 从 marker 起，到那个**数组字面量结束**为止（拿常量声明那种）。
 *
 * ⚠️⚠️ **不能按「第一个分号」切** ⇒ ⇒ 声明里有 `[&str; 1]` ⇒ ⇒ 那个
 *    分号在**类型**里 ⇒ ⇒ 会把数组切掉 ⇒ ⇒ 判据只读到一半 ⇒ ⇒ **假红**
 *    （2026-11-04 实测：闸第一次跑就红在这儿 ⇒ ⇒ 幸而基线也是红的
 *    ⇒ ⇒ 才看出来 —— 假红与真红混在一起时，先看基线）。
 */
export function extractConstArray(text, marker) {
  const i = text.indexOf(marker);
  if (i < 0) return null;
  const rest = text.slice(i);
  const end = rest.indexOf('];');
  return end < 0 ? rest : rest.slice(0, end + 2);
}

/**
 * 判据 —— **纯函数**（吃源文本 ⇒ ⇒ 自检可以喂退化副本）。
 *
 * @returns {string[]} 违规清单（空 ＝ 绿）
 */
export function judge(sources) {
  const v = [];
  const need = (cond, msg) => {
    if (!cond) v.push(msg);
  };
  const ext = sources.externalTools ?? '';
  const pm = sources.providerManager ?? '';
  const lib = sources.libRs ?? '';
  const page = sources.page ?? '';
  const brain = sources.brain ?? '';
  const zh = sources.zh ?? {};
  const en = sources.en ?? {};

  // ── ⓪ 源读到了没（「没红」不等于「没问题」）──
  for (const k of ['externalTools', 'providerManager', 'libRs', 'page', 'brain']) {
    need(
      typeof sources[k] === 'string' && sources[k].length > 0,
      '读不到源：' + k + ' ⇒ ⇒ 这一段根本没被判定'
    );
  }
  need(zh.providers, '读不到源：中文词条文件');
  need(en.providers, '读不到源：英文词条文件');

  // ── ① 三个命令存在 ＋ 注册进 invoke_handler ──
  for (const cmd of CMDS) {
    need(
      ext.includes('pub fn ' + cmd) || ext.includes('pub async fn ' + cmd),
      '桌面端：命令 ' + cmd + ' 不存在'
    );
    need(
      lib.includes('external_tools::' + cmd + ','),
      '桌面端：' + cmd + ' 没注册进 invoke_handler'
    );
  }

  // ── ② 扫描那一路的返回**不许有材料**（Rust 与界面两处都要查）──
  const preview = extractBlock(ext, 'pub struct ExternalProviderPreview');
  if (preview === null) {
    need(false, '桌面端：没有 ExternalProviderPreview ⇒ ⇒ 扫描结果的形状没定死');
  } else {
    need(!preview.includes('api_key'), '桌面端：扫描结果里出现 api_key ⇒ ⇒ 材料会进界面');
    need(preview.includes('key_len'), '桌面端：扫描结果里没有 key_len ⇒ ⇒ 界面不知道有没有材料');
  }
  const tsPreview = extractBlock(page, 'interface ExternalProviderPreview');
  if (tsPreview === null) {
    need(false, '桌面端界面：没有 ExternalProviderPreview 这个类型 ⇒ ⇒ 扫描结果的形状没定死');
  } else {
    need(
      !tsPreview.includes('api_key'),
      '桌面端界面：扫描结果的类型里有 api_key ⇒ ⇒ 材料会进界面'
    );
    need(
      tsPreview.includes('key_len'),
      '桌面端界面：扫描结果的类型里没有 key_len ⇒ ⇒ 界面不知道有没有材料'
    );
  }

  // ── ③ 材料出口必须走「失败不带原文」的通道 ──
  const exportFn = extractBlock(ext, 'pub async fn external_tools_export');
  if (exportFn === null) {
    need(false, '桌面端：没有 external_tools_export 这个命令');
  } else {
    // ⚠️⚠️ **认「调用形状」而不是关键词** ⇒ ⇒ 源码里那句注释
    //    「这一路必须走 brain_post_secret」**本身**就含这个词 ⇒ ⇒ 认关键词
    //    ⇒ ⇒ 哪怕代码改回普通通道，注释也会把它喂绿（假绿）。
    need(
      exportFn.includes('brain_post_secret('),
      '桌面端：导出那一路没用 brain_post_secret ⇒ ⇒ 解析失败时材料会进错误串'
    );
    need(
      !exportFn.includes('brain_post('),
      '桌面端：导出那一路用了 brain_post ⇒ ⇒ 材料会漏进错误信息（进而进日志）'
    );
    need(
      exportFn.includes('reveal'),
      '桌面端：导出那一路没有走 reveal ⇒ ⇒ 材料没从大脑取回来'
    );
  }
  const secretFn = extractBlock(pm, 'pub(crate) async fn brain_post_secret');
  if (secretFn === null) {
    need(false, '桌面端：没有 brain_post_secret ⇒ ⇒ 材料没有安全通道');
  } else {
    need(
      !secretFn.includes('text.trim()') &&
        !secretFn.includes('{text}') &&
        !secretFn.includes('原话'),
      '桌面端：brain_post_secret 的错误里带了响应原文 ⇒ ⇒ 材料会漏进日志'
    );
  }

  // ── ④ OAuth 令牌槽不许写 api key ──
  const oauthConst = extractConstArray(ext, 'const OAUTH_SLOTS');
  if (oauthConst === null) {
    need(false, '桌面端：没有 OAuth 槽清单 ⇒ ⇒ 会把 api key 写进 OAuth 令牌位（那个工具必然失败）');
  } else {
    need(
      oauthConst.includes('claudeAiOauth.accessToken'),
      '桌面端：OAuth 槽清单里没有 claudeAiOauth.accessToken ⇒ ⇒ 会把 api key 写进 OAuth 令牌位（那个工具必然失败）'
    );
  }
  if (exportFn !== null) {
    need(
      exportFn.includes('OAUTH_SLOTS.contains('),
      '桌面端：导出那一路没有 OAUTH_SLOTS 闸门 ⇒ ⇒ 会把 api key 写进 OAuth 令牌位'
    );
    const gateAt = exportFn.indexOf('OAUTH_SLOTS.contains(');
    const takeAt = exportFn.indexOf('brain_post_secret');
    need(
      gateAt < 0 || takeAt < 0 || gateAt < takeAt,
      '桌面端：OAuth 闸门在取材料**之后** ⇒ ⇒ 白取一趟材料再报错（材料已经出网了）'
    );
  }

  // ── ⑤ 大脑侧：材料出口三条纪律 ＋ 读面仍然只给掩码 ──
  const hasReveal = brain.includes('/models/providers/{id}/reveal');
  need(hasReveal, '端脑：没有 /models/providers/{id}/reveal 路由');
  if (hasReveal) {
    const route = around(brain, '/models/providers/{id}/reveal', 200);
    need(route.includes('admin_door'), '端脑：reveal 路由没挂 admin 门 ⇒ ⇒ 材料出口是敞开的');
  }
  const handler = extractBlock(brain, 'async fn reveal_provider_key');
  if (handler === null) {
    need(false, '端脑：没有 reveal_provider_key 这个处理函数');
  } else {
    need(
      handler.includes('tracing::warn!'),
      '端脑：材料出口没有审计日志 ⇒ ⇒ 谁取走了明文没人知道'
    );
  }
  need(
    brain.includes('the_reveal_route_hands_out_the_key_to_the_admin_only'),
    '端脑：没有「材料出口只给 admin / 读面仍然掩码」那条测试 ⇒ ⇒ 这条纪律没人守'
  );
  const viewImpl = extractBlock(brain, 'impl From<&ModelProvider> for ProviderView');
  if (viewImpl === null) {
    need(false, '端脑：没有 ProviderView 的 From 实现 ⇒ ⇒ 读面的掩码没法定死');
  } else {
    need(
      viewImpl.includes('MASKED_API_KEY'),
      '端脑：读视图没有把 api_key 掩码 ⇒ ⇒ 常规读面会带出明文（导入那一路的普通通道也会把材料带进错误串）'
    );
  }

  // ── ⑥ 界面三个入口 ＋ 三条命令 ──
  const entries = [
    ['扫描面板', 'externalToolsTitle'],
    ['导入按钮', 'importFromTool'],
    ['导出按钮', 'exportToTool'],
  ];
  for (const [label, needle] of entries) {
    need(page.includes(needle), '桌面端界面：没有' + label + '的入口');
  }
  for (const cmd of CMDS) {
    need(page.includes(cmd), '桌面端界面：没有调用 ' + cmd);
  }

  // ── ⑦ 两个语言都要有那批词条 ──
  for (const k of I18N_KEYS) {
    need(zh.providers && k in zh.providers, '中文词条缺 ' + k);
    need(en.providers && k in en.providers, '英文词条缺 ' + k);
  }

  return v;
}

/**
 * 读真实源。
 *
 * ⚠️⚠️ **端脑仓的位置有两种布局，两个都得认**：
 *   ① **本地**：shadow 与 telencephalon 是**兄弟**（各自独立仓）；
 *   ② **CI**：shadow 检出在**工作区根**，而兄弟仓被 actions/checkout 检到
 *      **工作区根之内**（checkout 拒绝工作区之外的路径）⇒ ⇒ 那里是
 *      REPO/telencephalon，**不是** REPO/../telencephalon。
 * ⇒ ⇒ 只认一种 ⇒ ⇒ 在另一种环境里「源读不到」⇒ ⇒ 闸会**假绿**。
 *
 * ⚠️ 而**同时存在两份** ⇒ ⇒ 闸不知道该看哪一份（可能看的是旧的）
 * ⇒ ⇒ 那样也是假绿 ⇒ ⇒ 显式判「不成立」，不许悄悄挑一份。
 */
export function readSources() {
  const brainCandidates = [
    resolve(REPO, '..', 'telencephalon'),
    resolve(REPO, 'telencephalon'),
  ];
  const brainRoots = brainCandidates.filter((p) => existsSync(join(p, 'src', 'api', 'providers.rs')));
  const problems = [];
  let brainRoot = null;
  if (brainRoots.length === 1) {
    brainRoot = brainRoots[0];
  } else if (brainRoots.length === 0) {
    problems.push(
      '端脑仓（telencephalon）没找到 ⇒ ⇒ 试过：' + brainCandidates.join(' / ')
    );
  } else {
    problems.push(
      '端脑仓有**多份**（' + brainRoots.join(' / ') + '）⇒ ⇒ 闸不知道该看哪一份 ⇒ ⇒ 判定不成立'
    );
  }
  const files = {
    externalTools: join(REPO, 'shadow-desktop', 'src-tauri', 'src', 'external_tools.rs'),
    providerManager: join(REPO, 'shadow-desktop', 'src-tauri', 'src', 'provider_manager.rs'),
    libRs: join(REPO, 'shadow-desktop', 'src-tauri', 'src', 'lib.rs'),
    page: join(REPO, 'shadow-desktop', 'src', 'pages', 'ProvidersPage.tsx'),
    brain: join(
      brainRoot || brainCandidates[0],
      'src', 'api', 'providers.rs'
    ),
    zh: join(REPO, 'shadow-desktop', 'src', 'i18n', 'zh-CN.json'),
    en: join(REPO, 'shadow-desktop', 'src', 'i18n', 'en-US.json'),
  };
  const out = {};
  const missing = [];
  let read = 0;
  for (const [k, p] of Object.entries(files)) {
    if (!existsSync(p)) {
      missing.push(k + ' → ' + p);
      continue;
    }
    const raw = readFileSync(p, 'utf8');
    read++;
    out[k] = k === 'zh' || k === 'en' ? JSON.parse(raw) : raw;
  }
  return { sources: out, filesRead: read, files, missing, problems, brainRoot };
}

/** 深拷贝（退化副本 ⇒ 真文件一个字不动）。 */
function cloneSources(s) {
  const out = {};
  for (const [k, val] of Object.entries(s)) {
    out[k] = k === 'zh' || k === 'en' ? JSON.parse(JSON.stringify(val)) : val;
  }
  return out;
}

/** 全部替换（否则同一段文本出现两次 ⇒ 只改到第一处 ⇒ 退化不彻底）。 */
function rep(s, from, to) {
  return s.split(from).join(to);
}

// ---------------------------------------------------------------------------
// 自检 —— **逐条退化**（每一处「关掉哪一处会让它红」）
// ---------------------------------------------------------------------------

export function selfTest() {
  const results = [];
  const check = (name, cond, why) => {
    results.push({ name, ok: !!cond, why: why || '' });
  };

  const { sources, filesRead } = readSources();
  check(
    '读得到源：7 个源文件都读到了（读不到 ⇒ 「没红」不等于「没问题」）',
    filesRead === 7,
    '读到 ' + filesRead + ' 个'
  );

  const base = judge(sources);
  check('基线：真源码零违规', base.length === 0, base.join(' | '));

  /**
   * 逐条退化 ⇒ ⇒ 验收标准是**「关掉哪一处，就只红那一处」**
   * ⇒ ⇒ 真源码退化副本 ⇒ ⇒ 真文件一个字不动。
   */
  const D = (name, expected, mutate) => {
    const s = cloneSources(sources);
    mutate(s);
    const v = judge(s);
    const got = v.slice().sort();
    const want = expected.slice().sort();
    const same = got.length === want.length && got.every((x, i) => x === want[i]);
    check(name, same, same ? '' : '期望 ' + JSON.stringify(want) + '；实际 ' + JSON.stringify(got));
  };

  D(
    '退化①：命令 external_tools_scan 不存在 ⇒ ⇒ 恰好红这一条',
    ['桌面端：命令 external_tools_scan 不存在'],
    (s) => {
      s.externalTools = rep(s.externalTools, 'pub fn external_tools_scan(', 'pub fn scan_external_tools(');
    }
  );

  D(
    '退化②：命令没注册进 invoke_handler ⇒ ⇒ 恰好红这一条',
    ['桌面端：external_tools_scan 没注册进 invoke_handler'],
    (s) => {
      s.libRs = rep(s.libRs, 'external_tools::external_tools_scan,', '');
    }
  );

  D(
    '退化③：扫描结果带上 api_key ⇒ ⇒ 恰好红这一条',
    ['桌面端：扫描结果里出现 api_key ⇒ ⇒ 材料会进界面'],
    (s) => {
      s.externalTools = rep(
        s.externalTools,
        'pub struct ExternalProviderPreview {',
        'pub struct ExternalProviderPreview {' + NL + '    pub api_key: Option<String>,'
      );
    }
  );

  D(
    '退化④：扫描结果不报 key_len ⇒ ⇒ 恰好红这一条',
    ['桌面端：扫描结果里没有 key_len ⇒ ⇒ 界面不知道有没有材料'],
    (s) => {
      s.externalTools = rep(s.externalTools, 'pub key_len: Option<usize>,', 'pub key_present: bool,');
    }
  );

  D(
    '退化⑤：界面那个类型里带 api_key ⇒ ⇒ 恰好红这一条',
    ['桌面端界面：扫描结果的类型里有 api_key ⇒ ⇒ 材料会进界面'],
    (s) => {
      s.page = rep(
        s.page,
        'interface ExternalProviderPreview {',
        'interface ExternalProviderPreview {' + NL + '  api_key: string | null;'
      );
    }
  );

  D(
    '退化⑥：导出那一路不走安全通道 ⇒ ⇒ 恰好红这一条',
    ['桌面端：导出那一路没用 brain_post_secret ⇒ ⇒ 解析失败时材料会进错误串'],
    (s) => {
      s.externalTools = rep(
        s.externalTools,
        'let revealed = brain_post_secret(',
        'let revealed = brain_post_raw('
      );
    }
  );

  D(
    '退化⑦：导出那一路用普通通道 ⇒ ⇒ 恰好红那两条',
    [
      '桌面端：导出那一路没用 brain_post_secret ⇒ ⇒ 解析失败时材料会进错误串',
      '桌面端：导出那一路用了 brain_post ⇒ ⇒ 材料会漏进错误信息（进而进日志）',
    ],
    (s) => {
      s.externalTools = rep(
        s.externalTools,
        'let revealed = brain_post_secret(',
        'let revealed = brain_post('
      );
    }
  );

  D(
    '退化⑧：安全通道自己的错误里带原文 ⇒ ⇒ 恰好红这一条',
    ['桌面端：brain_post_secret 的错误里带了响应原文 ⇒ ⇒ 材料会漏进日志'],
    (s) => {
      s.providerManager = rep(
        s.providerManager,
        'format!("大脑回的形状不对（材料不在错误里）：{e}")',
        'format!("大脑回的形状不对（大脑原话：{}）：{}", e, text.trim())'
      );
    }
  );

  D(
    '退化⑨：OAuth 闸门被拆掉 ⇒ ⇒ 恰好红这一条',
    ['桌面端：导出那一路没有 OAUTH_SLOTS 闸门 ⇒ ⇒ 会把 api key 写进 OAuth 令牌位'],
    (s) => {
      s.externalTools = rep(
        s.externalTools,
        'if OAUTH_SLOTS.contains(&source_id.as_str()) {',
        'if false {'
      );
    }
  );

  D(
    '退化⑩：OAuth 槽清单被删掉 ⇒ ⇒ 恰好红这一条',
    ['桌面端：OAuth 槽清单里没有 claudeAiOauth.accessToken ⇒ ⇒ 会把 api key 写进 OAuth 令牌位（那个工具必然失败）'],
    (s) => {
      s.externalTools = rep(s.externalTools, '["claudeAiOauth.accessToken"]', '[]');
    }
  );

  D(
    '退化⑪：reveal 路由没了 ⇒ ⇒ 恰好红这一条',
    ['端脑：没有 /models/providers/{id}/reveal 路由'],
    (s) => {
      s.brain = rep(s.brain, '/models/providers/{id}/reveal', '/models/providers/{id}/unreveal');
    }
  );

  D(
    '退化⑫：reveal 挂到读门 ⇒ ⇒ 恰好红这一条',
    ['端脑：reveal 路由没挂 admin 门 ⇒ ⇒ 材料出口是敞开的'],
    (s) => {
      s.brain = rep(
        s.brain,
        'post(reveal_provider_key).route_layer(admin_door.clone())',
        'post(reveal_provider_key).route_layer(read_door.clone())'
      );
    }
  );

  D(
    '退化⑬：材料出口没有审计 ⇒ ⇒ 恰好红这一条',
    ['端脑：材料出口没有审计日志 ⇒ ⇒ 谁取走了明文没人知道'],
    (s) => {
      const h = extractBlock(s.brain, 'async fn reveal_provider_key');
      if (h) s.brain = rep(s.brain, h, rep(h, 'tracing::warn!(', 'tracing::info!('));
    }
  );

  D(
    '退化⑭：那条「只给 admin」测试没了 ⇒ ⇒ 恰好红这一条',
    ['端脑：没有「材料出口只给 admin / 读面仍然掩码」那条测试 ⇒ ⇒ 这条纪律没人守'],
    (s) => {
      s.brain = rep(
        s.brain,
        'the_reveal_route_hands_out_the_key_to_the_admin_only',
        'the_reveal_route_removed'
      );
    }
  );

  D(
    '退化⑮：读面不掩码了 ⇒ ⇒ 恰好红这一条',
    ['端脑：读视图没有把 api_key 掩码 ⇒ ⇒ 常规读面会带出明文（导入那一路的普通通道也会把材料带进错误串）'],
    (s) => {
      s.brain = rep(
        s.brain,
        'api_key: p.api_key.as_ref().map(|_| MASKED_API_KEY.to_string()),',
        'api_key: p.api_key.clone(),'
      );
    }
  );

  D(
    '退化⑯：界面入口少一个 ⇒ ⇒ 恰好红这一条',
    ['桌面端界面：没有扫描面板的入口'],
    (s) => {
      s.page = rep(s.page, 'externalToolsTitle', 'extToolsPanelTitle');
    }
  );

  D(
    '退化⑰：界面不调那个命令 ⇒ ⇒ 恰好红这一条',
    ['桌面端界面：没有调用 external_tools_scan'],
    (s) => {
      s.page = rep(s.page, 'external_tools_scan', 'scanExternalTools');
    }
  );

  D(
    '退化⑱：中文词条少一个 ⇒ ⇒ 恰好红这一条',
    ['中文词条缺 exportConfirm'],
    (s) => {
      delete s.zh.providers.exportConfirm;
    }
  );

  D(
    '退化⑲：英文词条少一个 ⇒ ⇒ 恰好红这一条',
    ['英文词条缺 exportToTool'],
    (s) => {
      delete s.en.providers.exportToTool;
    }
  );

  D(
    '退化⑳：源没读到 ⇒ ⇒ 红「读不到源」那条（其余是因为没有源而判不出）',
    [
      '读不到源：externalTools ⇒ ⇒ 这一段根本没被判定',
      '桌面端：命令 external_tools_scan 不存在',
      '桌面端：命令 external_tools_import 不存在',
      '桌面端：命令 external_tools_export 不存在',
      '桌面端：没有 ExternalProviderPreview ⇒ ⇒ 扫描结果的形状没定死',
      '桌面端：没有 external_tools_export 这个命令',
      '桌面端：没有 OAuth 槽清单 ⇒ ⇒ 会把 api key 写进 OAuth 令牌位（那个工具必然失败）',
    ],
    (s) => {
      s.externalTools = '';
    }
  );

  // ── 孪生（证明判据不是「见词就红」）──
  const importFn = extractBlock(sources.externalTools, 'pub async fn external_tools_import');
  check(
    '孪生：导入那一路用**普通**通道（回包是掩码视图）⇒ ⇒ 不判红',
    importFn !== null && importFn.includes('brain_post(') && base.length === 0,
    '导入那一路含 brain_post：' + (importFn !== null && importFn.includes('brain_post('))
  );

  const twin = cloneSources(sources);
  twin.externalTools = rep(
    twin.externalTools,
    'let revealed = brain_post_secret(',
    '// ⚠️ 这里不能用 brain_post（材料会进错误串）' + NL + '    let revealed = brain_post_secret('
  );
  const twinV = judge(twin);
  check(
    '孪生：注释里提到 brain_post ⇒ ⇒ 不判红（判据认的是调用形状，不是关键词）',
    twinV.length === 0,
    JSON.stringify(twinV)
  );

  const ok = results.filter((r) => r.ok).length;
  const lines = results.map((r) => (r.ok ? '  ✔ ' : '  ✘ ') + r.name + (r.why ? '  —— ' + r.why : ''));
  console.log(lines.join(NL));
  console.log('自检：' + ok + '/' + results.length + ' 通过');
  return ok === results.length;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main(argv) {
  if (argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  const { sources, filesRead, missing, problems } = readSources();
  if (filesRead === 0 || missing.length > 0 || problems.length > 0) {
    console.error('❌ 源没读全 ⇒ ⇒ 「没红」不等于「没问题」（退出码 2）');
    for (const p of problems) console.error('   ' + p);
    for (const m of missing) console.error('   读不到：' + m);
    process.exit(2);
  }
  const v = judge(sources);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ filesRead, violations: v }, null, 2));
  } else {
    console.log('外部工具接线闸：读 ' + filesRead + ' 个源文件');
    if (v.length === 0) {
      console.log('✓ 零违规');
    } else {
      console.log('✘ ' + v.length + ' 处违规：');
      for (const x of v) console.log('   - ' + x);
    }
  }
  process.exit(v.length === 0 ? 0 : 1);
}

main(process.argv.slice(2));
