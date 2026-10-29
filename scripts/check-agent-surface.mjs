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
import {
  buildDesktopNav,
  buildMobileNav,
  collectLabelKeys,
  toArbKey,
} from './lib/nav.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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
    eol: '\n',
  },
  {
    path: 'shadow-desktop/src/styles/accent.g.ts',
    build: (t) => buildAccentTs(t),
    eol: '\n',
  },
  {
    path: 'shadow-mobile/lib/theme/app_tokens.g.dart',
    build: buildDart,
    eol: '\r\n',
  },
  {
    path: 'shadow-mobile/lib/theme/shad_scheme.g.dart',
    build: buildShadScheme,
    eol: '\r\n',
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
    eol: '\n',
  },
  {
    path: 'shadow-mobile/lib/navigation/nav.g.dart',
    build: buildMobileNav,
    eol: '\r\n',
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
    const expected = target.build(arg).split('\n').join(target.eol);
    const current = readFileSync(abs, 'utf8');
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
// 1. 两份共享源本身必须是合法且结构对的
// ─────────────────────────────────────────────────────────────
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
  report();
}

// ─────────────────────────────────────────────────────────────
// 2. 抽两端真实的路由表
// ─────────────────────────────────────────────────────────────
/** 桌面端：App.tsx 里 `<Route path="x" ...>`（含无前导斜杠的子路由） */
function desktopRoutes() {
  const src = readText('shadow-desktop/src/App.tsx');
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

/** 移动端：app_router.dart 里 `AppRoutes.xxx = '/path'` 的常量表 */
function mobileRoutes() {
  const src = readText('shadow-mobile/lib/router/app_router.dart');
  const out = new Set();
  const re = /static const String\s+\w+\s*=\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) out.add(m[1]);
  return out;
}

const dRoutes = desktopRoutes();
const mRoutes = mobileRoutes();

infos.push(
  `桌面端路由 ${dRoutes.size} 条，移动端路由 ${mRoutes.size} 条，清单能力 ${surface.capabilities.length} 条`,
);

// ─────────────────────────────────────────────────────────────
// 3. 清单 ↔ 两端路由 交叉校验
// ─────────────────────────────────────────────────────────────
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

function report() {
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

  process.exit(errors.length > 0 ? 1 : 0);
}
