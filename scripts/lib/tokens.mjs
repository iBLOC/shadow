/**
 * Shadow 设计 token —— 生成器核心
 *
 * 两端（React+Tailwind / Flutter+Material）都不能手写数值，
 * 所以本模块把 design-tokens.json 翻译成两端的落地文件：
 *
 *   shadow-desktop/src/styles/tokens.css       —— CSS 变量 + shadcn 语义投影
 *   shadow-mobile/lib/theme/app_tokens.g.dart  —— Dart 常量
 *
 * 关键约束：**主题色派生算法（deriveAccentTones）在这里只写一次**，
 * 然后同时吐进 CSS 与 Dart，保证两端对同一个 seed 算出同一个色调。
 * 算法一旦分叉，两端的「同一主题色」就是假的。
 *
 * 纯函数，无 IO —— 生成与校验共用。
 */

// ─────────────────────────────────────────────────────────────
// 颜色工具
// ─────────────────────────────────────────────────────────────

/** 解析 #RGB / #RRGGBB / #RRGGBBAA，返回 alpha ∈ [0,1] */
export function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  const a = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
}

export function rgbToHex({ r, g, b, a = 1 }) {
  const to = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  const base = `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
  return a >= 1 ? base : `${base}${to(a * 255)}`;
}

export function rgbToHsl({ r, g, b }) {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
    else if (max === gg) h = ((bb - rr) / d + 2) / 6;
    else h = ((rr - gg) / d + 4) / 6;
  }
  return { h: h * 360, s, l };
}

export function hslToRgb({ h, s, l }) {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p, q, t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hn = (h % 360) / 360;
  return {
    r: hue2rgb(p, q, hn + 1 / 3) * 255,
    g: hue2rgb(p, q, hn) * 255,
    b: hue2rgb(p, q, hn - 1 / 3) * 255,
  };
}

/** CSS 里 `hsl(var(--x))` 用的 "H S% L%" 三元组（带 alpha 时补 `/ A`） */
export function hslTriplet(hex) {
  const { a } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(hexToRgb(hex));
  const hh = Number.isInteger(h) ? h : Math.round(h * 10) / 10;
  const ss = Math.round(s * 1000) / 10;
  const ll = Math.round(l * 1000) / 10;
  const base = `${hh} ${ss}% ${ll}%`;
  return a >= 1 ? base : `${base} / ${Math.round(a * 1000) / 1000}`;
}

/** WCAG 相对亮度 */
export function relativeLuminance({ r, g, b }) {
  const ch = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrastRatio(a, b) {
  const la = relativeLuminance(hexToRgb(a));
  const lb = relativeLuminance(hexToRgb(b));
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** 在近白 / 近黑里挑对比度更高者做前景色 */
export function bestForeground(bgHex) {
  const white = '#FFFFFF';
  const black = '#09090B';
  return contrastRatio(bgHex, white) >= contrastRatio(bgHex, black) ? white : black;
}

/**
 * 主题色派生 —— 两端共用同一套规则。
 *
 * 影子没有颜色，所以默认 seed 是中性色。对中性色我们走「反色」：
 * 暗色模式上是光（近白），亮色模式上是影（近黑）—— 这是 shadcn 现有行为，
 * 也符合 Material 3 「primary 随亮度换色调」的规则。
 *
 * 用户选了有彩色的 seed 时，按同一算法派生两个色调：
 *   暗色模式用亮色调（L=0.80），亮色模式用暗色调（L=0.42），
 *   前景色按 WCAG 对比度在近白/近黑里挑，不是写死。
 */
export function deriveAccentTones(seedHex) {
  const rgb = hexToRgb(seedHex);
  const hsl = rgbToHsl(rgb);
  const achromatic = hsl.s < 0.04;

  let darkTone;
  let lightTone;

  if (achromatic) {
    darkTone = rgbToHex(hslToRgb({ h: hsl.h, s: hsl.s, l: 0.97 }));
    lightTone = rgbToHex(hslToRgb({ h: hsl.h, s: hsl.s, l: 0.055 }));
  } else {
    const s = Math.min(hsl.s, 0.75);
    darkTone = rgbToHex(hslToRgb({ h: hsl.h, s, l: 0.8 }));
    lightTone = rgbToHex(hslToRgb({ h: hsl.h, s, l: 0.42 }));
  }

  const pickFg = (bg) => {
    const white = '#FFFFFF';
    const black = '#09090B';
    return contrastRatio(bg, white) >= contrastRatio(bg, black) ? white : black;
  };

  const normalizedSeed = rgbToHex(rgb);

  return {
    seed: normalizedSeed,
    darkTone,
    lightTone,
    darkToneFg: pickFg(darkTone),
    lightToneFg: pickFg(lightTone),
    fg: pickFg(normalizedSeed),
    soft: rgbToHex({ ...rgb, a: 0.12 }),
    ring: rgbToHex({ ...rgb, a: 0.4 }),
  };
}

/** 把 hex 变成带 alpha 的 rgb() 串 */
export function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

/** 保留 hex 自带 alpha 的 rgb() 串 */
export function rgbaString(hex) {
  const { r, g, b, a } = hexToRgb(hex);
  return `rgb(${r} ${g} ${b} / ${Math.round(a * 1000) / 1000})`;
}

/** Dart 侧的 0xAARRGGBB */
export function dartColor(hex, alpha) {
  const { r, g, b, a } = hexToRgb(hex);
  const finalAlpha = alpha === undefined ? a : alpha;
  const hx = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0').toUpperCase();
  return `0x${hx(finalAlpha * 255)}${hx(r)}${hx(g)}${hx(b)}`;
}

/** CSS 里的 "R G B" 三元组 */
export function rgbTriplet(hex) {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

// ─────────────────────────────────────────────────────────────
// 生成：桌面端 CSS
// ─────────────────────────────────────────────────────────────

export function buildCss(tokens) {
  const c = tokens.color;
  const accent = deriveAccentTones(c.accent.seed);
  const L = [];

  L.push('/* ============================================================');
  L.push(' * Shadow design tokens —— 由 scripts/gen_tokens.mjs 生成');
  L.push(' * 请勿手改。改 design-tokens.json 后重新运行：');
  L.push(' *     node scripts/gen_tokens.mjs');
  L.push(' * ============================================================ */');
  L.push('');
  L.push(':root {');
  L.push('  /* ---- 原始 token ---- */');
  L.push(`  --radius: ${tokens.radius.lg};`);
  L.push(`  --shadow-radius-xs: ${tokens.radius.xs};`);
  L.push(`  --shadow-radius-sm: ${tokens.radius.sm};`);
  L.push(`  --shadow-radius-md: ${tokens.radius.md};`);
  L.push(`  --shadow-radius-lg: ${tokens.radius.lg};`);
  L.push(`  --shadow-radius-xl: ${tokens.radius.xl};`);
  L.push(`  --shadow-radius-pill: ${tokens.radius.pill};`);
  L.push(`  --shadow-glass-blur: ${tokens.glass.blur};`);
  L.push(`  --shadow-glass-saturation: ${tokens.glass.saturation};`);
  L.push(`  --shadow-glass-border-width: ${tokens.glass.borderWidth};`);
  L.push(`  --shadow-accent-seed: ${accent.seed};`);
  L.push(`  --shadow-accent-dark-tone: ${accent.darkTone};`);
  L.push(`  --shadow-accent-light-tone: ${accent.lightTone};`);
  L.push(`  --shadow-accent-soft: ${rgbaString(accent.soft)};`);
  L.push(`  --shadow-accent-ring: ${rgbaString(accent.ring)};`);
  L.push(`  --ambient-glow: ${rgbaString(rgbToHex({ ...hexToRgb(accent.seed), a: 0.12 }))};`);
  L.push(`  --ambient-glow-2: ${rgbaString(rgbToHex({ ...hexToRgb(accent.seed), a: 0.07 }))};`);
  L.push('');
  L.push('  /* ---- shadcn 语义投影（亮色）---- */');
  L.push(...cssSurface(tokens, 'light'));
  L.push(`  --muted: ${hslTriplet(c.surface.light.overlay)};`);
  L.push(`  --muted-foreground: ${hslTriplet(c.text.light.secondary)};`);
  L.push(`  --popover: ${hslTriplet(c.surface.light.base)};`);
  L.push(`  --popover-foreground: ${hslTriplet(c.text.light.primary)};`);
  L.push(`  --card: ${hslTriplet(c.surface.light.raised)};`);
  L.push(`  --card-foreground: ${hslTriplet(c.text.light.primary)};`);
  L.push(`  --border: ${hslTriplet(c.border.light.default)};`);
  L.push(`  --input: ${hslTriplet(c.border.light.default)};`);
  L.push(`  --primary: ${hslTriplet(accent.lightTone)};`);
  L.push(`  --primary-foreground: ${hslTriplet(accent.lightToneFg)};`);
  L.push(`  --secondary: ${hslTriplet(c.surface.light.overlay)};`);
  L.push(`  --secondary-foreground: ${hslTriplet(c.text.light.primary)};`);
  L.push(`  --accent: ${hslTriplet(c.surface.light.overlay)};`);
  L.push(`  --accent-foreground: ${hslTriplet(c.text.light.primary)};`);
  L.push(`  --shadow-accent: ${hslTriplet(accent.seed)};`);
  L.push(`  --shadow-accent-fg: ${hslTriplet(accent.fg)};`);
  L.push(`  --destructive: ${hslTriplet(c.status.error)};`);
  L.push(`  --destructive-foreground: ${hslTriplet(bestForeground(c.status.error))};`);
  L.push(`  --ring: ${hslTriplet(c.border.light.focus)};`);
  L.push(`  --success: ${hslTriplet(c.status.success)};`);
  L.push(`  --warning: ${hslTriplet(c.status.warning)};`);
  L.push(`  --info: ${hslTriplet(c.status.info)};`);
  L.push(`  --glass-surface: ${rgbaString(c.surface.light.glass)};`);
  L.push(`  --glass-border: ${c.border.light.default};`);
  L.push(`  --shadow-elevation-sm: ${tokens.shadow.light.sm};`);
  L.push(`  --shadow-elevation-md: ${tokens.shadow.light.md};`);
  L.push(`  --shadow-elevation-lg: ${tokens.shadow.light.lg};`);
  L.push('}');
  L.push('');
  L.push('.dark {');
  L.push('  /* ---- shadcn 语义投影（暗色）---- */');
  L.push(...cssSurface(tokens, 'dark'));
  L.push(`  --muted: ${hslTriplet(c.surface.dark.overlay)};`);
  L.push(`  --muted-foreground: ${hslTriplet(c.text.dark.secondary)};`);
  L.push(`  --popover: ${hslTriplet(c.surface.dark.raised)};`);
  L.push(`  --popover-foreground: ${hslTriplet(c.text.dark.primary)};`);
  L.push(`  --card: ${hslTriplet(c.surface.dark.raised)};`);
  L.push(`  --card-foreground: ${hslTriplet(c.text.dark.primary)};`);
  L.push(`  --border: ${hslTriplet(c.border.dark.default)};`);
  L.push(`  --input: ${hslTriplet(c.border.dark.default)};`);
  L.push(`  --primary: ${hslTriplet(accent.darkTone)};`);
  L.push(`  --primary-foreground: ${hslTriplet(accent.darkToneFg)};`);
  L.push(`  --secondary: ${hslTriplet(c.surface.dark.overlay)};`);
  L.push(`  --secondary-foreground: ${hslTriplet(c.text.dark.primary)};`);
  L.push(`  --accent: ${hslTriplet(c.surface.dark.overlay)};`);
  L.push(`  --accent-foreground: ${hslTriplet(c.text.dark.primary)};`);
  L.push(`  --shadow-accent: ${hslTriplet(accent.seed)};`);
  L.push(`  --shadow-accent-fg: ${hslTriplet(accent.fg)};`);
  L.push(`  --destructive: ${hslTriplet(c.status.error)};`);
  L.push(`  --destructive-foreground: ${hslTriplet(bestForeground(c.status.error))};`);
  L.push(`  --ring: ${hslTriplet(c.border.dark.focus)};`);
  L.push(`  --success: ${hslTriplet(c.status.success)};`);
  L.push(`  --warning: ${hslTriplet(c.status.warning)};`);
  L.push(`  --info: ${hslTriplet(c.status.info)};`);
  L.push(`  --glass-surface: ${rgbaString(c.surface.dark.glass)};`);
  L.push(`  --glass-border: ${c.border.dark.default};`);
  L.push(`  --shadow-elevation-sm: ${tokens.shadow.dark.sm};`);
  L.push(`  --shadow-elevation-md: ${tokens.shadow.dark.md};`);
  L.push(`  --shadow-elevation-lg: ${tokens.shadow.dark.lg};`);
  L.push(`  --ambient-glow: ${rgbaString(rgbToHex({ ...hexToRgb(accent.seed), a: 0.16 }))};`);
  L.push(`  --ambient-glow-2: ${rgbaString(rgbToHex({ ...hexToRgb(accent.seed), a: 0.08 }))};`);
  L.push('}');
  L.push('');
  L.push('/* 说明：表现层规则（.glass / .shadow-ambient）刻意**不**放在这里 ——');
  L.push('   它们住在 shadow-desktop/src/index.css 的 @layer components 里，');
  L.push('   这样 Tailwind 的工具类（bg-* / border-*）仍然能覆盖它们。');
  L.push('   本文件只负责「数值」。 */');
  L.push('');

  return L.join('\n');
}

function cssSurface(tokens, mode) {
  const s = tokens.color.surface[mode];
  return [
    `  --background: ${hslTriplet(s.base)};`,
    `  --foreground: ${hslTriplet(tokens.color.text[mode].primary)};`,
  ];
}

// ─────────────────────────────────────────────────────────────
// 生成：移动端 Dart
// ─────────────────────────────────────────────────────────────

export function buildDart(tokens) {
  const c = tokens.color;
  const accent = deriveAccentTones(c.accent.seed);
  const L = [];

  L.push('// ============================================================');
  L.push('// Shadow design tokens —— 由 scripts/gen_tokens.mjs 生成');
  L.push('// 请勿手改。改 design-tokens.json 后重新运行：');
  L.push('//     node scripts/gen_tokens.mjs');
  L.push('// ============================================================');
  L.push('');
  L.push("import 'package:flutter/material.dart';");
  L.push('');
  L.push('/// 设计数值的唯一真相源（由仓根 design-tokens.json 生成）。');
  L.push('///');
  L.push('/// 命名约定：`surface` / `text` / `border` / `status` 是模式无关的语义分组，');
  L.push('/// 模式相关的前缀用 `dark` / `light` 标明。');
  L.push('class AppTokens {');
  L.push('  const AppTokens._();');
  L.push('');

  L.push('  // ── 表面（影子的底）──');
  for (const [mode, obj] of Object.entries(c.surface)) {
    if (mode.startsWith('_')) continue;
    const prefix = mode === 'dark' ? 'dark' : 'light';
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('_')) continue;
      L.push(`  static const Color surface${prefix[0].toUpperCase()}${prefix.slice(1)}${cap(k)} = Color(${dartColor(v)});`);
    }
  }
  L.push('');

  L.push('  // ── 文本 ──');
  for (const [mode, obj] of Object.entries(c.text)) {
    if (mode.startsWith('_')) continue;
    const prefix = cap(mode);
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('_')) continue;
      L.push(`  static const Color text${prefix}${cap(k)} = Color(${dartColor(v)});`);
    }
  }
  L.push('');

  L.push('  // ── 边框 ──');
  for (const [mode, obj] of Object.entries(c.border)) {
    if (mode.startsWith('_')) continue;
    const prefix = cap(mode);
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('_')) continue;
      L.push(`  static const Color border${prefix}${cap(k)} = Color(${dartColor(v)});`);
    }
  }
  L.push('');

  L.push('  // ── 主题色槽位（用户可覆盖）──');
  L.push(`  static const Color accentSeed = Color(${dartColor(accent.seed)});`);
  L.push(`  static const Color accentDarkTone = Color(${dartColor(accent.darkTone)});`);
  L.push(`  static const Color accentLightTone = Color(${dartColor(accent.lightTone)});`);
  L.push(`  static const Color accentDarkToneFg = Color(${dartColor(accent.darkToneFg)});`);
  L.push(`  static const Color accentLightToneFg = Color(${dartColor(accent.lightToneFg)});`);
  L.push(`  static const Color accentFg = Color(${dartColor(accent.fg)});`);
  L.push(`  static const Color accentSoft = Color(${dartColor(accent.soft)});`);
  L.push(`  static const Color accentRing = Color(${dartColor(accent.ring)});`);
  L.push('');

  L.push('  // ── 状态色 ──');
  for (const [k, v] of Object.entries(c.status)) {
    if (k.startsWith('_')) continue;
    L.push(`  static const Color status${cap(k)} = Color(${dartColor(v)});`);
  }
  L.push('');

  L.push('  // ── 玻璃（半影层）──');
  L.push(`  static const double glassBlur = ${parseFloat(tokens.glass.blur)};`);
  L.push(`  static const double glassSaturation = ${parseFloat(tokens.glass.saturation)};`);
  L.push(`  static const double glassBorderWidth = ${parseFloat(tokens.glass.borderWidth)};`);
  L.push('');

  L.push('  // ── 间距 / 圆角 / 字号 / 时长 ──');
  L.push('  // 单独导出常量：Map 取值不能当默认参数值（const 上下文要求编译期常量），');
  L.push('  // 而 radius/space 这些正是要当默认值用的。');
  for (const [group, prefix] of [
    ['space', 'space'],
    ['radius', 'radius'],
    ['fontSize', 'fontSize'],
  ]) {
    for (const [k, v] of Object.entries(tokens[group])) {
      if (k.startsWith('_')) continue;
      const name = k.replace(/^(\d)/, 'x$1');
      L.push(`  static const double ${prefix}${cap(name)} = ${parseFloat(v)};`);
    }
  }
  for (const [k, v] of Object.entries(tokens.duration)) {
    if (k.startsWith('_')) continue;
    L.push(`  static const Duration duration${cap(k)} = Duration(milliseconds: ${parseInt(v, 10)});`);
  }
  L.push('');
  L.push('  static const Map<String, double> space = {');
  for (const [k, v] of Object.entries(tokens.space)) {
    if (k.startsWith('_')) continue;
    L.push(`    '${k}': ${parseFloat(v)},`);
  }
  L.push('  };');
  L.push('');
  L.push('  static const Map<String, double> radius = {');
  for (const [k, v] of Object.entries(tokens.radius)) {
    if (k.startsWith('_')) continue;
    L.push(`    '${k}': ${parseFloat(v)},`);
  }
  L.push('  };');
  L.push('');
  L.push('  static const Map<String, double> fontSize = {');
  for (const [k, v] of Object.entries(tokens.fontSize)) {
    if (k.startsWith('_')) continue;
    L.push(`    '${k}': ${parseFloat(v)},`);
  }
  L.push('  };');
  L.push('');
  L.push('  static const Map<String, Duration> duration = {');
  for (const [k, v] of Object.entries(tokens.duration)) {
    if (k.startsWith('_')) continue;
    L.push(`    '${k}': Duration(milliseconds: ${parseInt(v, 10)}),`);
  }
  L.push('  };');
  L.push('');
  L.push('  /// 用户可选主题色预设（与 design-tokens.json 的 color.accent.userSelectable 一一对应）');
  L.push('  /// 显示名走 l10n（appearanceAccent*），不在设计源里写死。');
  L.push('  static const List<({String id, Color color})> accentPresets = [');
  for (const p of c.accent.userSelectable) {
    L.push(`    (id: '${p.id}', color: Color(${dartColor(p.hex)})),`);
  }
  L.push('  ];');
  L.push('');
  L.push('  /// 对话框 / 面板背景的可选值。null = 跟随主题。');
  L.push('  static const List<({String id, Color color})> surfaceOverrides = [');
  for (const o of c.surface.overrides ?? []) {
    L.push(`    (id: '${o.id}', color: Color(${dartColor(o.hex)})),`);
  }
  L.push('  ];');
  L.push('}');
  L.push('');
  L.push('/// 主题色派生 —— 与桌面端 accent.g.ts 同一套规则。');
  L.push('///');
  L.push('/// 影子没有颜色，所以默认 seed 是中性色；对中性色走「反色」——');
  L.push('/// 暗色模式上是光（近白），亮色模式上是影（近黑）。');
  L.push('/// 用户选了有彩色的 seed 时，暗色模式用亮色调（L=0.80），亮色模式用暗色调（L=0.42），');
  L.push('/// 前景色按 WCAG 对比度在近白/近黑里挑，不是写死。');
  L.push('({');
  L.push('  Color darkTone,');
  L.push('  Color lightTone,');
  L.push('  Color darkToneFg,');
  L.push('  Color lightToneFg,');
  L.push('  Color fg,');
  L.push('}) deriveAccentTones(Color seed) {');
  L.push('  final hsl = HSLColor.fromColor(seed);');
  L.push('  final achromatic = hsl.saturation < 0.04;');
  L.push('  final sat = hsl.saturation.clamp(0.0, 0.75).toDouble();');
  L.push('');
  L.push('  final darkTone = achromatic');
  L.push('      ? HSLColor.fromAHSL(seed.a, hsl.hue, hsl.saturation, 0.97).toColor()');
  L.push('      : HSLColor.fromAHSL(seed.a, hsl.hue, sat, 0.80).toColor();');
  L.push('  final lightTone = achromatic');
  L.push('      ? HSLColor.fromAHSL(seed.a, hsl.hue, hsl.saturation, 0.055).toColor()');
  L.push('      : HSLColor.fromAHSL(seed.a, hsl.hue, sat, 0.42).toColor();');
  L.push('');
  L.push('  return (');
  L.push('    darkTone: darkTone,');
  L.push('    lightTone: lightTone,');
  L.push('    darkToneFg: bestForeground(darkTone),');
  L.push('    lightToneFg: bestForeground(lightTone),');
  L.push('    fg: bestForeground(seed),');
  L.push('  );');
  L.push('}');
  L.push('');
  L.push('/// 在近白 / 近黑里挑对比度更高者做前景色（WCAG 2.1）。');
  L.push('Color bestForeground(Color bg) {');
  L.push('  const white = Color(0xFFFFFFFF);');
  L.push('  const black = Color(0xFF09090B);');
  L.push('  double ratio(double a, double b) {');
  L.push('    final hi = a > b ? a : b;');
  L.push('    final lo = a > b ? b : a;');
  L.push('    return (hi + 0.05) / (lo + 0.05);');
  L.push('  }');
  L.push('');
  L.push('  final l = bg.computeLuminance();');
  L.push('  return ratio(l, white.computeLuminance()) >=');
  L.push('          ratio(l, black.computeLuminance())');
  L.push('      ? white');
  L.push('      : black;');
  L.push('}');
  L.push('');

  return L.join('\n');
}

// ─────────────────────────────────────────────────────────────
// 生成：移动端 shadcn 主题适配
// ─────────────────────────────────────────────────────────────

/**
 * design-tokens.json → shadcn `ShadColorScheme` 的投影。
 *
 * 桌面端是真 shadcn（Radix + CVA），CSS 变量由 buildCss 里的
 * 「shadcn 语义投影」提供；移动端用 Flutter ShadcnUI（shadcn_ui），
 * 它要的是一个 `ShadColorScheme` 对象。
 *
 * **两端的映射必须逐项对齐** —— 否则同一个能力在两端是两个颜色。
 * 所以这里的每一项都对应 buildCss 里的同名 CSS 变量，不是另起一套。
 */
export function buildShadScheme(tokens) {
  const c = tokens.color;
  const L = [];

  // design-tokens.json 的路径 → AppTokens 里的常量名
  const tok = (group, mode, key) => {
    const m = mode === 'dark' ? 'Dark' : 'Light';
    return `AppTokens.${group}${m}${cap(key)}`;
  };

  L.push('// ============================================================');
  L.push('// Shadow × shadcn 主题适配 —— 由 scripts/gen_tokens.mjs 生成');
  L.push('// 请勿手改。改 design-tokens.json 后重新运行：');
  L.push('//     node scripts/gen_tokens.mjs');
  L.push('//');
  L.push('// 桌面端是真 shadcn（Radix + CVA），移动端用 Flutter ShadcnUI。');
  L.push('// 两端共用同一份 design-tokens.json，所以这里是**投影**而不是第二套真相源 ——');
  L.push('// 下面每一项都对应 tokens.css 里的同名 shadcn 语义变量。');
  L.push('// ============================================================');
  L.push('');
  L.push("import 'package:flutter/material.dart';");
  L.push("import 'package:shadcn_ui/shadcn_ui.dart';");
  L.push('');
  L.push("import 'app_tokens.g.dart';");
  L.push('');
  L.push('/// design-tokens.json → shadcn [ShadColorScheme] 的投影。');
  L.push('///');
  L.push('/// 主题色是**运行时可变**的（用户可覆盖的槽位），所以这里接 seed，');
  L.push('/// 不直接用 AppTokens 的常量 —— 用户换色后整个 App 跟着变。');
  L.push('class ShadScheme {');
  L.push('  ShadScheme._();');
  L.push('');
  L.push('  /// 按当前亮度 + 当前主题色 seed 构造色板。');
  L.push('  static ShadColorScheme of({');
  L.push('    required Brightness brightness,');
  L.push('    required Color accentSeed,');
  L.push('  }) {');
  L.push('    final tones = deriveAccentTones(accentSeed);');
  L.push('    final soft = accentSeed.withValues(alpha: 0.12);');
  L.push('    return brightness == Brightness.dark');
  L.push('        ? _dark(');
  L.push('            primary: tones.darkTone,');
  L.push('            primaryForeground: tones.darkToneFg,');
  L.push('            soft: soft,');
  L.push('          )');
  L.push('        : _light(');
  L.push('            primary: tones.lightTone,');
  L.push('            primaryForeground: tones.lightToneFg,');
  L.push('            soft: soft,');
  L.push('          );');
  L.push('  }');
  L.push('');

  for (const mode of ['dark', 'light']) {
    const fn = mode === 'dark' ? '_dark' : '_light';
    L.push(`  static ShadColorScheme ${fn}({`);
    L.push('    required Color primary,');
    L.push('    required Color primaryForeground,');
    L.push('    required Color soft,');
    L.push('  }) {');
    L.push('    return ShadColorScheme(');
    // 与 tokens.css 的 shadcn 语义投影逐项对齐
    const rows = [
      ['background', tok('surface', mode, 'base')],
      ['foreground', tok('text', mode, 'primary')],
      ['card', tok('surface', mode, 'raised')],
      ['cardForeground', tok('text', mode, 'primary')],
      ['popover', tok('surface', mode, mode === 'dark' ? 'raised' : 'base')],
      ['popoverForeground', tok('text', mode, 'primary')],
      ['primary', 'primary'],
      ['primaryForeground', 'primaryForeground'],
      ['secondary', tok('surface', mode, 'overlay')],
      ['secondaryForeground', tok('text', mode, 'primary')],
      ['muted', tok('surface', mode, 'overlay')],
      ['mutedForeground', tok('text', mode, 'secondary')],
      ['accent', tok('surface', mode, 'overlay')],
      ['accentForeground', tok('text', mode, 'primary')],
      ['destructive', 'AppTokens.statusError'],
      ['destructiveForeground', 'bestForeground(AppTokens.statusError)'],
      ['border', tok('border', mode, 'default')],
      ['input', tok('border', mode, 'default')],
      ['ring', tok('border', mode, 'focus')],
      ['selection', 'soft'],
    ];
    for (const [field, expr] of rows) {
      L.push(`      ${field}: ${expr},`);
    }
    L.push('    );');
    L.push('  }');
  }

  L.push('}');
  L.push('');

  return L.join('\n');
}

// ─────────────────────────────────────────────────────────────
// 生成：桌面端主题色派生（TS）
// ─────────────────────────────────────────────────────────────

export function buildAccentTs(tokens) {
  const L = [];
  L.push('// ============================================================');
  L.push('// Shadow 主题色派生 —— 由 scripts/gen_tokens.mjs 生成');
  L.push('// 请勿手改。改 design-tokens.json 后重新运行：');
  L.push('//     node scripts/gen_tokens.mjs');
  L.push('//');
  L.push('// 与 shadow-mobile/lib/theme/app_tokens.g.dart 里的 deriveAccentTones');
  L.push('// 是同一套规则 —— 两端对同一个 seed 必须算出同一个色调。');
  L.push('// ============================================================');
  L.push('');
  L.push('export interface AccentTones {');
  L.push('  seed: string;');
  L.push('  darkTone: string;');
  L.push('  lightTone: string;');
  L.push('  darkToneFg: string;');
  L.push('  lightToneFg: string;');
  L.push('  fg: string;');
  L.push('}');
  L.push('');
  L.push('export function hexToRgb(hex: string) {');
  L.push('  const h = hex.replace("#", "");');
  L.push('  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;');
  L.push('  const n = parseInt(full.slice(0, 6), 16);');
  L.push('  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };');
  L.push('}');
  L.push('');
  L.push('function rgbToHsl(r: number, g: number, b: number) {');
  L.push('  const rr = r / 255, gg = g / 255, bb = b / 255;');
  L.push('  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);');
  L.push('  const l = (max + min) / 2;');
  L.push('  let h = 0, s = 0;');
  L.push('  if (max !== min) {');
  L.push('    const d = max - min;');
  L.push('    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);');
  L.push('    if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;');
  L.push('    else if (max === gg) h = ((bb - rr) / d + 2) / 6;');
  L.push('    else h = ((rr - gg) / d + 4) / 6;');
  L.push('  }');
  L.push('  return { h: h * 360, s, l };');
  L.push('}');
  L.push('');
  L.push('function hslToHex(h: number, s: number, l: number) {');
  L.push('  if (s === 0) {');
  L.push('    const v = Math.round(l * 255);');
  L.push('    return `#${[v, v, v].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase()}`;');
  L.push('  }');
  L.push('  const hue2rgb = (p: number, q: number, t: number) => {');
  L.push('    let tt = t;');
  L.push('    if (tt < 0) tt += 1;');
  L.push('    if (tt > 1) tt -= 1;');
  L.push('    if (tt < 1 / 6) return p + (q - p) * 6 * tt;');
  L.push('    if (tt < 1 / 2) return q;');
  L.push('    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;');
  L.push('    return p;');
  L.push('  };');
  L.push('  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;');
  L.push('  const p = 2 * l - q;');
  L.push('  const hn = (((h % 360) + 360) % 360) / 360;');
  L.push('  const to = (x: number) =>');
  L.push('    Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0").toUpperCase();');
  L.push(`  return \`#\${to(hue2rgb(p, q, hn + 1 / 3) * 255)}\${to(hue2rgb(p, q, hn) * 255)}\${to(hue2rgb(p, q, hn - 1 / 3) * 255)}\`;`);
  L.push('}');
  L.push('');
  L.push('function relativeLuminance(hex: string) {');
  L.push('  const { r, g, b } = hexToRgb(hex);');
  L.push('  const ch = (v: number) => {');
  L.push('    const c = v / 255;');
  L.push('    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;');
  L.push('  };');
  L.push('  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);');
  L.push('}');
  L.push('');
  L.push('function contrastRatio(a: string, b: string) {');
  L.push('  const la = relativeLuminance(a), lb = relativeLuminance(b);');
  L.push('  const hi = Math.max(la, lb), lo = Math.min(la, lb);');
  L.push('  return (hi + 0.05) / (lo + 0.05);');
  L.push('}');
  L.push('');
  L.push('/** 在近白 / 近黑里挑对比度更高者做前景色（WCAG 2.1） */');
  L.push('export function bestForeground(bg: string) {');
  L.push('  const white = "#FFFFFF";');
  L.push('  const black = "#09090B";');
  L.push('  return contrastRatio(bg, white) >= contrastRatio(bg, black) ? white : black;');
  L.push('}');
  L.push('');
  L.push('/**');
  L.push(' * 主题色派生 —— 与移动端 deriveAccentTones 同一套规则。');
  L.push(' *');
  L.push(' * 影子没有颜色，所以默认 seed 是中性色；对中性色走「反色」——');
  L.push(' * 暗色模式上是光（近白），亮色模式上是影（近黑）。');
  L.push(' * 用户选了有彩色的 seed 时，暗色模式用亮色调（L=0.80），亮色模式用暗色调（L=0.42），');
  L.push(' * 前景色按 WCAG 对比度在近白/近黑里挑，不是写死。');
  L.push(' */');
  L.push('export function deriveAccentTones(seedHex: string): AccentTones {');
  L.push('  const { r, g, b } = hexToRgb(seedHex);');
  L.push('  const hsl = rgbToHsl(r, g, b);');
  L.push('  const achromatic = hsl.s < 0.04;');
  L.push('  const sat = Math.min(hsl.s, 0.75);');
  L.push('');
  L.push('  const darkTone = achromatic');
  L.push('    ? hslToHex(hsl.h, hsl.s, 0.97)');
  L.push('    : hslToHex(hsl.h, sat, 0.8);');
  L.push('  const lightTone = achromatic');
  L.push('    ? hslToHex(hsl.h, hsl.s, 0.055)');
  L.push('    : hslToHex(hsl.h, sat, 0.42);');
  L.push('');
  L.push('  return {');
  L.push('    seed: seedHex.toUpperCase(),');
  L.push('    darkTone,');
  L.push('    lightTone,');
  L.push('    darkToneFg: bestForeground(darkTone),');
  L.push('    lightToneFg: bestForeground(lightTone),');
  L.push('    fg: bestForeground(seedHex.toUpperCase()),');
  L.push('  };');
  L.push('}');
  L.push('');
  L.push('/** 把 hex 转成 CSS 里 `hsl(var(--x))` 用的 "H S% L%" 三元组 */');
  L.push('export function hslTriplet(hex: string) {');
  L.push('  const { r, g, b } = hexToRgb(hex);');
  L.push('  const { h, s, l } = rgbToHsl(r, g, b);');
  L.push('  return `${Math.round(h * 10) / 10} ${Math.round(s * 1000) / 10}% ${Math.round(l * 1000) / 10}%`;');
  L.push('}');
  L.push('');
  L.push('/** 用户可选主题色预设 —— 显示名走 i18n（appearanceAccent*），不在设计源里写死 */');
  L.push('export const accentPresets: { id: string; hex: string }[] = [');
  for (const p of tokens.color.accent.userSelectable) {
    L.push(`  { id: '${p.id}', hex: '${p.hex.toUpperCase()}' },`);
  }
  L.push('];');
  L.push('');
  L.push('/** 对话框 / 面板背景的可选值 —— null = 跟随主题 */');
  L.push('export const surfaceOverrides: { id: string; hex: string }[] = [');
  for (const o of tokens.color.surface.overrides ?? []) {
    L.push(`  { id: '${o.id}', hex: '${o.hex.toUpperCase()}' },`);
  }
  L.push('];');
  L.push('');
  L.push('/** 玻璃底色的基准 alpha —— 桌面端按玻璃强度缩放它（与移动端 _scaleAlpha 同规则） */');
  L.push('export const glassSurfaceAlpha = {');
  for (const mode of ['light', 'dark']) {
    const hex = tokens.color.surface[mode].glass;
    const { r, g, b, a } = hexToRgb(hex);
    L.push(`  ${mode}: { rgb: [${r}, ${g}, ${b}] as [number, number, number], alpha: ${Math.round(a * 1000) / 1000} },`);
  }
  L.push('};');
  L.push('');
  return L.join('\n');
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
