#!/usr/bin/env node
/**
 * 跨端一致性校验（阶段 0）
 *
 * 桌面端与移动端是同一个 agent 的两个终端。这一脚本守住这个前提不被悄悄破坏：
 *
 *   1. design-tokens.json 是设计数值的唯一真相源 —— 校验两端没有各写各的。
 *   2. agent-surface.json 是能力清单 —— 校验清单里的每条路由在两端真实存在，
 *      且两端的每条真实路由都在清单里登记过（不许悄悄出现/消失）。
 *   3. 两端的文案 key 体系在 capability 接入后应当一致（surface.*）。
 *   4. 导航结构只有一份定义（agent-surface.json 的 navigation 段）——
 *      两端导航都是生成物，校验它们没漂移。
 *
 * 用法：node scripts/check-agent-surface.mjs
 * 退出码 0 = 通过；1 = 有阻断问题。
 *
 * 注意：阶段 0 只建源、不改两端现有视觉，所以「两端文案 key 还没统一」这类
 * 尚未推进的项按 warning 报出，不阻断 CI。
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildCss,
  buildDart,
  buildAccentTs,
  buildShadScheme,
} from './lib/tokens.mjs';
import { normalizeEol } from './lib/eol.mjs';
import {
  buildDesktopNav,
  buildMobileNav,
  collectLabelKeys,
  toArbKey,
} from './lib/nav.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ⚠️ 自检**必须抢在「读文件」的分支之前** ⇒ ⇒ 否则它一进来就撞上读源失败。
if (process.argv.includes('--self-test')) {
  selfTest();
}

/**
 * 生成物清单 —— 与 scripts/gen_tokens.mjs / scripts/gen_nav.mjs 保持一致。
 *
 * 生成器核心（deriveAccentTones 等）在 lib/tokens.mjs 里只写一次，
 * 写入与校验共用，所以「校验」用的就是「生成」用的那份代码。
 */
const GENERATED = [
  {
    path: 'shadow-desktop/src/styles/tokens.css',
    build: buildCss,
  },
  {
    path: 'shadow-desktop/src/styles/accent.g.ts',
    build: (t) => buildAccentTs(t),
  },
  {
    path: 'shadow-mobile/lib/theme/app_tokens.g.dart',
    build: buildDart,
  },
  {
    path: 'shadow-mobile/lib/theme/shad_scheme.g.dart',
    build: buildShadScheme,
  },
];

/**
 * 导航生成物 —— 导航结构只有一份定义（agent-surface.json 的 navigation 段），
 * 两端各生成一份。清单改了却忘了重跑生成器 = 两端导航悄悄分叉。
 */
const NAV_GENERATED = [
  {
    path: 'shadow-desktop/src/navigation/nav.g.ts',
    build: buildDesktopNav,
  },
  {
    path: 'shadow-mobile/lib/navigation/nav.g.dart',
    build: buildMobileNav,
  },
];

function checkGeneratedFiles(entries, arg, fixHint) {
  const errors = [];
  const warnings = [];
  let stale = 0;

  for (const target of entries) {
    const abs = join(ROOT, target.path);
    if (!existsSync(abs)) {
      errors.push(`生成物缺失：${target.path} —— 跑 ${fixHint}`);
      stale += 1;
      continue;
    }
    // 比对时归一化行尾：Windows 工作树是 CRLF（autocrlf 检出），CI 是 LF，
    // 两者都应判「同步」—— 详见 scripts/lib/eol.mjs。
    const expected = normalizeEol(target.build(arg));
    const current = normalizeEol(readFileSync(abs, 'utf8'));
    if (current !== expected) {
      errors.push(
        `生成物与共享源不同步：${target.path} —— 跑 ${fixHint}`,
      );
      stale += 1;
    }
  }

  return { checked: entries.length, stale, errors, warnings };
}

const errors = [];
const warnings = [];
const infos = [];

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const readText = (rel) => readFileSync(join(ROOT, rel), 'utf8');

// ─────────────────────────────────────────────────────────────
// 判据纯函数 + 判据自检（合成夹具 ⇒ ⇒ **不需要两端仓在位**）
// ─────────────────────────────────────────────────────────────

/**
 * 判据源在不在位 —— **不在 ⇒ ⇒ 判不了**（不是「没问题」）。
 *
 * ⚠️ 以前这些文件是直接 readFileSync 读的 ⇒ ⇒ 缺一个就**抛异常**
 * ⇒ ⇒ Node 崩掉的退出码是 1 ⇒ ⇒ 与「闸判红」**逐字同形**
 * ⇒ ⇒ 「源没读全」被写成「真有问题」⇒ ⇒ 现在先查在不在位。
 */
function judgeSources(paths) {
  const missing = (paths || []).filter((p) => !existsSync(join(ROOT, p)));
  return { missing, verdict: missing.length === 0 ? 'ok' : 'cannot-judge' };
}

// ─────────────────────────────────────────────────────────────
// 判据自检 —— 喂合成夹具 ⇒ ⇒ **不需要两端仓在位**
// ─────────────────────────────────────────────────────────────
function selfTest() {
  const cases = [];
  const add = (name, run) => cases.push({ name, run });

  const surfaceOf = (caps, extra) =>
    Object.assign({ _meta: { groups: { core: {} } }, capabilities: caps }, extra || {});

  add('清单与两端代码一致 ⇒ ⇒ 零 error', () => {
    const surface = surfaceOf([
      { id: 'chat', group: 'core', desktop: { route: '/chat' }, mobile: { route: '/chat' } },
    ]);
    const v = judgeSurface(surface, new Set(['/chat']), new Set(['/chat']));
    return v.errors.length === 0;
  });

  add('清单声明的桌面路由在代码里不存在 ⇒ ⇒ 恰好 1 条 error 且点名', () => {
    const surface = surfaceOf([{ id: 'chat', group: 'core', desktop: { route: '/chat' } }]);
    const v = judgeSurface(surface, new Set(['/other']), new Set([]));
    return v.errors.length === 1 && v.errors[0].includes('/chat');
  });

  add('孪生：代码里有路由但清单没登记 ⇒ ⇒ warning（不是 error）', () => {
    const surface = surfaceOf([]);
    const v = judgeSurface(surface, new Set(['/drift']), new Set([]));
    return v.errors.length === 0 && v.warnings.length === 1 && v.warnings[0].includes('/drift');
  });

  add('容器路由不在移动端路由表 ⇒ ⇒ error', () => {
    const surface = surfaceOf([], { _containers: { mobile: [{ route: '/hub' }] } });
    const v = judgeSurface(surface, new Set([]), new Set([]));
    return v.errors.length === 1 && v.errors[0].includes('/hub');
  });

  add('legacy 重定向不在移动端路由表 ⇒ ⇒ error', () => {
    const surface = surfaceOf([], { _legacyRoutes: { mobile: ['/old'] } });
    const v = judgeSurface(surface, new Set([]), new Set([]));
    return v.errors.length === 1 && v.errors[0].includes('/old');
  });

  add('能力 id 重复 ⇒ ⇒ error', () => {
    const surface = surfaceOf([
      { id: 'chat', group: 'core' },
      { id: 'chat', group: 'core' },
    ]);
    const v = judgeSurface(surface, new Set([]), new Set([]));
    return v.errors.some((e) => e.includes('id 重复'));
  });

  add('能力缺 id ⇒ ⇒ error', () => {
    const surface = surfaceOf([{ group: 'core' }]);
    const v = judgeSurface(surface, new Set([]), new Set([]));
    return v.errors.some((e) => e.includes('缺 id'));
  });

  add('group 不在 _meta.groups 里 ⇒ ⇒ error', () => {
    const surface = surfaceOf([{ id: 'chat', group: 'nope' }]);
    const v = judgeSurface(surface, new Set([]), new Set([]));
    return v.errors.some((e) => e.includes('_meta.groups'));
  });

  add('移动端声明的路由不存在 ⇒ ⇒ error', () => {
    const surface = surfaceOf([{ id: 'chat', group: 'core', mobile: { route: '/m' } }]);
    const v = judgeSurface(surface, new Set([]), new Set([]));
    return v.errors.length === 1 && v.errors[0].includes('/m');
  });

  add('桌面端别名不存在 ⇒ ⇒ error（别名也算「已登记」）', () => {
    const surface = surfaceOf([{ id: 'chat', group: 'core', desktop: { aliases: ['/alias'] } }]);
    const v = judgeSurface(surface, new Set([]), new Set([]));
    return v.errors.length === 1 && v.errors[0].includes('/alias');
  });

  add('桌面端路由抽取：无前导斜杠的子路由要补成 /xxx', () => {
    const out = extractDesktopRoutes('<Route path="chat" />\n<Route path="/settings" />');
    return out.size === 2 && out.has('/chat') && out.has('/settings');
  });

  add('移动端路由抽取：从 app_router.dart 里抽常量', () => {
    const out = extractMobileRoutes(
      "static const String chat = '/chat';\nstatic const String me = '/me';",
    );
    return out.size === 2 && out.has('/chat') && out.has('/me');
  });

  add('hasJsonPath：命中与未命中', () => {
    const obj = { surface: { chat: 'x' } };
    return hasJsonPath(obj, 'surface.chat') === true && hasJsonPath(obj, 'surface.nope') === false;
  });

  add('判据源读不到 ⇒ ⇒ 判不了（不是「没问题」）', () => {
    return judgeSources(['__不存在的路径__.json']).verdict === 'cannot-judge';
  });

  add('孪生：判据源都在 ⇒ ⇒ 判得了', () => {
    return judgeSources(['AGENTS.md']).verdict === 'ok';
  });

  let bad = 0;
  for (const c of cases) {
    let ok = false;
    try {
      ok = c.run() === true;
    } catch (err) {
      ok = false;
    }
    console.log((ok ? '  [PASS] ' : '  [FAIL] ') + c.name);
    if (!ok) bad += 1;
  }
  console.log('  判据自检：' + (cases.length - bad) + '/' + cases.length);
  if (bad > 0) {
    console.error('❌ 自检没过 ⇒ 闸门自己不可信');
    process.exit(1);
  }
  console.log('✅ 自检通过');
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────
// 1. 两份共享源本身必须是合法且结构对的
// ─────────────────────────────────────────────────────────────
const REQUIRED_SOURCES = [
  'design-tokens.json',
  'agent-surface.json',
  'shadow-desktop/src/App.tsx',
  'shadow-desktop/src/index.css',
  'shadow-desktop/src/i18n/en-US.json',
  'shadow-desktop/src/i18n/zh-CN.json',
  'shadow-mobile/lib/router/app_router.dart',
  'shadow-mobile/lib/l10n/app_en.arb',
  'shadow-mobile/lib/l10n/app_zh.arb',
  'shadow-mobile/lib/widgets/glass_card.dart',
];

const sourceVerdict = judgeSources(REQUIRED_SOURCES);
if (sourceVerdict.verdict === 'cannot-judge') {
  console.error('❌ 判不了：判据源读不到 ⇒ ⇒ 这一格**没验成**（不是「没问题」）');
  for (const p of sourceVerdict.missing) console.error('   找不到：' + p);
  process.exit(2);
}

let tokens;
let surface;
try {
  tokens = readJson('design-tokens.json');
} catch (e) {
  errors.push(`design-tokens.json 解析失败：${e.message}`);
  tokens = null;
}
try {
  surface = readJson('agent-surface.json');
} catch (e) {
  errors.push(`agent-surface.json 解析失败：${e.message}`);
  surface = null;
}

if (!tokens || !surface) {
  // ⚠️ 共享源读不到/解析失败 ⇒ ⇒ **判不了**（不是「有问题」）⇒ ⇒ 退出码 2。
  console.error('❌ 判不了：共享源读不到或解析失败 ⇒ ⇒ 这一格**没验成**。');
  for (const e of errors) console.error('   ' + e);
  report(2);
}

// ─────────────────────────────────────────────────────────────
// 2. 抽两端真实的路由表
// ─────────────────────────────────────────────────────────────
/** 桌面端：App.tsx 里 `<Route path="x" ...>`（含无前导斜杠的子路由）—— 纯函数。 */
function extractDesktopRoutes(src) {
  const out = new Set();
  const re = /<Route\s+path="([^"]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    let p = m[1];
    if (!p.startsWith('/')) p = `/${p}`; // 桌面端子路由是相对 Layout 的
    out.add(p);
  }
  return out;
}

/** 移动端：app_router.dart 里 `AppRoutes.xxx = '/path'` 的常量表 —— 纯函数。 */
function extractMobileRoutes(src) {
  const out = new Set();
  const re = /static const String\s+\w+\s*=\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) out.add(m[1]);
  return out;
}

const dRoutes = extractDesktopRoutes(readText('shadow-desktop/src/App.tsx'));
const mRoutes = extractMobileRoutes(readText('shadow-mobile/lib/router/app_router.dart'));

infos.push(
  `桌面端路由 ${dRoutes.size} 条，移动端路由 ${mRoutes.size} 条，清单能力 ${surface.capabilities.length} 条`,
);

// ─────────────────────────────────────────────────────────────
// 3. 清单 ↔ 两端路由 交叉校验
// ─────────────────────────────────────────────────────────────
function judgeSurface(surface, dRoutes, mRoutes) {
  const errors = [];
  const warnings = [];
  const declaredDesktop = new Set();
  const declaredMobile = new Set();
  const ids = new Set();

  for (const cap of surface.capabilities) {
    if (!cap.id) {
      errors.push('能力清单里有条目缺 id');
      continue;
    }
    if (ids.has(cap.id)) errors.push(`能力清单里 id 重复：${cap.id}`);
    ids.add(cap.id);

    if (!surface._meta?.groups?.[cap.group]) {
      errors.push(`能力 ${cap.id} 的 group "${cap.group}" 不在 _meta.groups 里`);
    }

    const d = cap.desktop?.route;
    const m = cap.mobile?.route;
    if (d) {
      declaredDesktop.add(d);
      if (!dRoutes.has(d)) {
        errors.push(`能力 ${cap.id} 声明的桌面端路由 "${d}" 在 shadow-desktop/src/App.tsx 里不存在`);
      }
    }
    for (const alias of cap.desktop?.aliases ?? []) {
      declaredDesktop.add(alias);
      if (!dRoutes.has(alias)) {
        errors.push(`能力 ${cap.id} 声明的桌面端别名 "${alias}" 在 shadow-desktop/src/App.tsx 里不存在`);
      }
    }
    if (m) {
      declaredMobile.add(m);
      if (!mRoutes.has(m)) {
        errors.push(`能力 ${cap.id} 声明的移动端路由 "${m}" 在 shadow-mobile/lib/router/app_router.dart 里不存在`);
      }
    }
  }

  // 容器路由（聚合多个能力的入口）与 legacy 重定向也算「已登记」
  for (const c of surface._containers?.mobile ?? []) {
    declaredMobile.add(c.route);
    if (!mRoutes.has(c.route)) {
      errors.push(`容器路由 "${c.route}" 在移动端路由表里不存在`);
    }
  }
  for (const r of surface._legacyRoutes?.mobile ?? []) {
    declaredMobile.add(r);
    if (!mRoutes.has(r)) {
      errors.push(`legacy 重定向 "${r}" 在移动端路由表里不存在`);
    }
  }

  // 反向：两端有、清单没登记
  for (const r of dRoutes) {
    if (!declaredDesktop.has(r)) {
      warnings.push(`桌面端路由 "${r}" 没有在 agent-surface.json 里登记（能力清单与代码漂移）`);
    }
  }
  for (const r of mRoutes) {
    if (!declaredMobile.has(r)) {
      warnings.push(`移动端路由 "${r}" 没有在 agent-surface.json 里登记（能力清单与代码漂移）`);
    }
  }


  return { errors, warnings };
}

// 主流程：走纯函数 ⇒ ⇒ 主流程与自检**共用同一份判据**
const surfaceVerdict = judgeSurface(surface, dRoutes, mRoutes);
for (const e of surfaceVerdict.errors) errors.push(e);
for (const w of surfaceVerdict.warnings) warnings.push(w);

// ─────────────────────────────────────────────────────────────
// 4. token ↔ 两端落地文件：既查数值，也查「生成物有没有漂移」
// ─────────────────────────────────────────────────────────────
if (tokens) {
  // 4.1 生成物必须与 design-tokens.json 同步。
  //     数值改了却忘了重跑生成器 = 两端悄悄分叉，这是最该被拦住的。
  const drift = checkGeneratedFiles(
    GENERATED,
    tokens,
    'node scripts/gen_tokens.mjs',
  );
  for (const d of drift.errors) errors.push(d);
  for (const d of drift.warnings) warnings.push(d);
  infos.push(
    `生成物同步：${drift.checked} 个目标，${drift.stale} 个过期`,
  );

  // 4.2 移动端的颜色必须来自 token，不能再自己写死。
  //     AppColors / glass_theme 里出现 Color(0x...) 就说明有人绕过了设计源。
  const MOBILE_TOKEN_SOURCES = [
    'shadow-mobile/lib/theme/app_colors.dart',
    'shadow-mobile/lib/theme/glass_theme.dart',
    'shadow-mobile/lib/widgets/glass_card.dart',
  ];
  for (const rel of MOBILE_TOKEN_SOURCES) {
    if (!existsSync(join(ROOT, rel))) continue;
    const src = stripLineComments(readText(rel));
    const literals = src.match(/Color\(0x[0-9A-Fa-f]{8}\)/g) ?? [];
    if (literals.length > 0) {
      errors.push(
        `${rel} 里出现手写色值 ${[...new Set(literals)].join(' ')} —— 颜色必须来自 design-tokens.json`,
      );
    }
  }

  // 4.3 桌面端 index.css 只能引用变量，不能自己写色值。
  const desktopCss = readText('shadow-desktop/src/index.css');
  const rawHex = stripBlockComments(desktopCss).match(/#[0-9A-Fa-f]{6}\b/g) ?? [];
  if (rawHex.length > 0) {
    errors.push(
      `shadow-desktop/src/index.css 里出现裸色值 ${[...new Set(rawHex)].join(' ')} —— 数值由 tokens.css 提供，这里只做投影`,
    );
  }

  // 4.4 两端都要有玻璃（半影层）这一层，且强度可调。
  const desktopHasGlass = desktopCss.includes('.glass');
  const mobileHasGlass = readText('shadow-mobile/lib/widgets/glass_card.dart').includes('BackdropFilter');
  if (!desktopHasGlass) {
    errors.push('桌面端 index.css 缺少 .glass（半影层）—— 两端的玻璃语义必须对等');
  }
  if (!mobileHasGlass) {
    errors.push('移动端 GlassCard 缺少 BackdropFilter（半影层）');
  }
}

// ─────────────────────────────────────────────────────────────
// 4.5 导航生成物：导航结构只有一份定义，两端各生成一份
// ─────────────────────────────────────────────────────────────
if (surface) {
  const navDrift = checkGeneratedFiles(
    NAV_GENERATED,
    surface,
    'node scripts/gen_nav.mjs',
  );
  for (const d of navDrift.errors) errors.push(d);
  for (const d of navDrift.warnings) warnings.push(d);
  infos.push(
    `导航生成物同步：${navDrift.checked} 个目标，${navDrift.stale} 个过期`,
  );
}

// ─────────────────────────────────────────────────────────────
// 5. 两端文案 key：能力清单用了 surface.* key，两端都应当有
//
// 两端的 key 形态不同，这是**已知且必要**的差异：
//   桌面端 i18next  → 嵌套 JSON，`surface.chat`
//   移动端 Flutter ARB → 平铺 camelCase，`surfaceChat`
//     （ARB 不支持带点的 key —— 实测解析直接抛 FormatException）
// 所以这里按各自真实结构查，不能拿同一个子串去找两边。
// ─────────────────────────────────────────────────────────────
if (surface) {
  const surfaceKeys = collectLabelKeys(surface);

  const mobileEn = readJson('shadow-mobile/lib/l10n/app_en.arb');
  const mobileZh = readJson('shadow-mobile/lib/l10n/app_zh.arb');
  const desktopEn = readJson('shadow-desktop/src/i18n/en-US.json');
  const desktopZh = readJson('shadow-desktop/src/i18n/zh-CN.json');

  for (const key of surfaceKeys) {
    const flat = toArbKey(key);

    if (!(flat in mobileEn) || !(flat in mobileZh)) {
      warnings.push(
        `移动端 ARB 里还没有 ${key} 的文案（平铺 key "${flat}"，阶段 2 接入能力清单时补）`,
      );
    }
    if (!hasJsonPath(desktopEn, key) || !hasJsonPath(desktopZh, key)) {
      warnings.push(
        `桌面端 i18n 里还没有 ${key} 的文案（阶段 2 接入能力清单时补）`,
      );
    }
  }
}

/** 嵌套 JSON 里有没有这条路径（`surface.chat` → obj.surface.chat）。 */
function hasJsonPath(obj, dotted) {
  return dotted
    .split('.')
    .reduce(
      (acc, k) =>
        acc && typeof acc === 'object' && k in acc ? acc[k] : undefined,
      obj,
    ) !== undefined;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** 去掉 Dart 的行注释 —— 注释里提到色值不算「硬编码」。 */
function stripLineComments(src) {
  return src.replace(/^\s*\/\/.*$/gm, '');
}

/** 去掉 CSS 的块注释。 */
function stripBlockComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '');
}

// ─────────────────────────────────────────────────────────────
report();

function report(exitCode) {
  const line = '─'.repeat(72);
  console.log(line);
  console.log('跨端一致性校验 —— design-tokens.json / agent-surface.json');
  console.log(line);

  for (const i of infos) console.log(`  ·  ${i}`);
  for (const w of warnings) console.log(`  !  ${w}`);
  for (const e of errors) console.error(`  ✗  ${e}`);

  console.log(line);
  console.log(
    `阻断 ${errors.length} 项 / 提示 ${warnings.length} 项 / 信息 ${infos.length} 项`,
  );
  console.log(line);

  process.exit(exitCode !== undefined ? exitCode : errors.length > 0 ? 1 : 0);
}
