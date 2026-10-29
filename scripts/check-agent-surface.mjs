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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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
// 4. token ↔ 移动端 AppColors 一致性
// ─────────────────────────────────────────────────────────────
if (tokens) {
  const colors = readText('shadow-mobile/lib/theme/app_colors.dart');
  const flat = {
    'color.brand.primary': tokens.color.brand.primary,
    'color.brand.secondary': tokens.color.brand.secondary,
    'color.bg.dark': tokens.color.bg.dark,
    'color.bg.darkSurface': tokens.color.bg.darkSurface,
    'color.bg.light': tokens.color.bg.light,
    'color.bg.lightSurface': tokens.color.bg.lightSurface,
    'color.text.darkPrimary': tokens.color.text.darkPrimary,
    'color.text.darkSecondary': tokens.color.text.darkSecondary,
    'color.text.lightPrimary': tokens.color.text.lightPrimary,
    'color.text.lightSecondary': tokens.color.text.lightSecondary,
    'color.status.success': tokens.color.status.success,
    'color.status.warning': tokens.color.status.warning,
    'color.status.error': tokens.color.status.error,
  };
  for (const [path, hex] of Object.entries(flat)) {
    const bare = hex.replace(/^#/, '').toUpperCase();
    if (!colors.toUpperCase().includes(bare)) {
      errors.push(
        `design-tokens.json 的 ${path} = ${hex} 在移动端 AppColors 里找不到（两端数值已漂移）`,
      );
    }
  }

  // 桌面端接入前，--primary 必然与 token 不同 —— 这是待办而不是错误
  const css = readText('shadow-desktop/src/index.css');
  const brandBare = tokens.color.brand.primary.replace(/^#/, '').toUpperCase();
  const brandRgb = hexToRgb(tokens.color.brand.primary);
  const desktopHasBrand =
    css.toUpperCase().includes(brandBare) || css.includes(brandRgb);
  if (!desktopHasBrand) {
    warnings.push(
      `桌面端 index.css 里还没有品牌色 ${tokens.color.brand.primary} —— 阶段 1「token 接入」尚未做`,
    );
  }
}

// ─────────────────────────────────────────────────────────────
// 5. 两端文案 key：能力清单用了 surface.* key，两端都应当有
// ─────────────────────────────────────────────────────────────
if (surface) {
  const surfaceKeys = surface.capabilities.map((c) => c.labelKey);
  const en = readText('shadow-mobile/lib/l10n/app_en.arb');
  const desktopEn = readText('shadow-desktop/src/i18n/en-US.json');
  for (const key of surfaceKeys) {
    const leaf = key.split('.').pop();
    if (!en.includes(`"${leaf}"`)) {
      warnings.push(`移动端 ARB 里还没有 ${key} 的文案（阶段 2 接入能力清单时补）`);
    }
    if (!desktopEn.includes(`"${leaf}"`)) {
      warnings.push(`桌面端 en-US.json 里还没有 ${key} 的文案（阶段 2 接入能力清单时补）`);
    }
  }
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
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
