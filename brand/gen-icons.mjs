/**
 * brand/gen-icons.mjs —— 平台图标产物生成器。
 *
 * 几何来自 `brand/geom.mjs`（唯一真相源），光栅化来自 `brand/raster.mjs`。
 * 桌面端与移动端的图标因此来自同一份几何，不可能走样。
 *
 * ## 统一处理
 *
 * **浅色圆角方块底板 + 蚀标记（白天配色）**：近黑的月盘 + 主题色的日轮月牙。
 * 影要落在**被照亮的表面上**才看得见 —— 这是旧桌面端图标已经在用的处理
 * （浅底 + 彩色标记），沿用同一套。
 *
 * ## 输出
 *
 * 桌面端（shadow-desktop）：
 * - `public/pwa-icon.svg` —— favicon（底板版，任何标签栏上都看得见）
 * - `public/pwa-192.png` / `pwa-512.png` —— PWA 图标（标记在 maskable 安全区内）
 * - `public/pwa-512-monochrome.png` —— 单色版（浏览器主题化图标用）
 * - `src-tauri/icons/app-icon.png` —— Tauri `tauri icon` 的 1024 源图
 *
 * 移动端（shadow-mobile）：
 * - `android/.../mipmap-<dpi>/ic_launcher.png` —— 传统启动图标
 * - `android/.../mipmap-<dpi>/ic_launcher_foreground.png` —— 自适应图标前景
 * - `android/.../drawable/ic_launcher_background.xml` —— 自适应图标底色
 *
 * 用法：
 *   node brand/gen-icons.mjs           # 写入
 *   node brand/gen-icons.mjs --check   # 只校验是否同步（CI 用，漂移则 exit 1）
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, drawShapes, encodePng } from './raster.mjs';
import { normalizeEol } from '../scripts/lib/eol.mjs';
import {
  ACCENT,
  INK_LIGHT,
  TILE_LIGHT,
  TILE_RADIUS,
  VIEWBOX,
  conceptById,
  eclipsePaths,
} from './geom.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DESKTOP = join(ROOT, 'shadow-desktop');
const MOBILE = join(ROOT, 'shadow-mobile');
const ANDROID_RES = join(MOBILE, 'android', 'app', 'src', 'main', 'res');

const MARK = conceptById('eclipse');

/** --check：只校验生成物是否与几何同步（CI 用，漂移则 exit 1）。 */
const CHECK = process.argv.includes('--check');
let drift = 0;

/** 标记在底板里的占比（按对角线算，保证任何遮罩都切不到）。 */
const MARK_FILL = 0.8;

/** 画一个圆角方块底板。 */
function drawTile(canvas, size, color) {
  drawShapes(canvas, {
    vb: VIEWBOX,
    dest: [0, 0, size, size],
    shapes: [{ type: 'rrect', x: 0, y: 0, w: 512, h: 512, r: TILE_RADIUS }],
    color,
  });
}

/**
 * 把标记按对角线缩放并居中画到 dest 上。
 * `fill` 是标记占据的对角线比例。
 */
function drawMark(canvas, mode, size, fill, colors) {
  const [x0, y0, x1, y1] = MARK.bbox;
  const diag = Math.hypot(x1 - x0, y1 - y0);
  const k = (size * fill) / diag;
  const w = (x1 - x0) * k;
  const h = (y1 - y0) * k;
  const dest = [
    size / 2 - w / 2 - x0 * k,
    size / 2 - h / 2 - y0 * k,
    512 * k,
    512 * k,
  ];
  for (const layer of MARK.layers(mode)) {
    const color =
      layer.color === 'current' ? colors.ink : layer.color === 'ink' ? colors.ink : colors.accent;
    drawShapes(canvas, { vb: VIEWBOX, dest, shapes: layer.shapes, color });
  }
}

/** 应用图标：底板 + 标记。 */
function appIconPng(size) {
  const canvas = createCanvas(size, size, null);
  drawTile(canvas, size, TILE_LIGHT);
  drawMark(canvas, 'day', size, MARK_FILL, { ink: INK_LIGHT, accent: ACCENT });
  return encodePng(canvas);
}

/** 单色标记（透明底）：浏览器主题化图标 / favicon 备选。 */
function monoMarkPng(size, color = INK_LIGHT) {
  const canvas = createCanvas(size, size, null);
  drawMark(canvas, 'mono', size, 0.92, { ink: color, accent: color });
  return encodePng(canvas);
}

/** 自适应图标的前景：只有标记，透明底，缩到安全区内。 */
function adaptiveForegroundPng(size) {
  const canvas = createCanvas(size, size, null);
  // 前景层只有 108dp 的中央 72dp 是安全区（会被各种遮罩裁）
  drawMark(canvas, 'day', size, 0.62, { ink: INK_LIGHT, accent: ACCENT });
  return encodePng(canvas);
}

/**
 * 写一个产物；`--check` 模式下不写，只报漂移。
 *
 * 文本产物与二进制产物**比对方式不同**：
 *   - 文本（TSX / SVG）：统一 LF 落盘，比对时归一化行尾。Windows 工作树
 *     是 CRLF（autocrlf 检出）、CI checkout 是 LF —— 硬编码 CRLF 会变成
 *     「本地绿 / CI 红」的坑，详见 `scripts/lib/eol.mjs`。
 *   - 二进制（PNG）：逐字节比。
 */
function write(path, data) {
  const rel = relative(ROOT, path).replace(/\\/g, '/');
  mkdirSync(dirname(path), { recursive: true });

  const isText = typeof data === 'string';
  const text = isText ? normalizeEol(data) : null;
  const buf = isText ? Buffer.from(text, 'utf8') : data;

  const current = existsSync(path) ? readFileSync(path) : null;
  if (current) {
    const same = isText
      ? normalizeEol(current.toString('utf8')) === text
      : current.equals(buf);
    if (same) return;
  }
  if (CHECK) {
    drift += 1;
    console.error(`  ✗ ${rel} 与 brand/geom.mjs 不同步`);
    console.error('    修复：node brand/gen-icons.mjs');
    return;
  }
  writeFileSync(path, buf);
  console.log('wrote', rel);
}

/* ── 桌面端 ──────────────────────────────────────────────────────────────── */

// 应用内标记组件（React）—— 路径由几何算出，不手抄。
// 明暗两态交换两笔的颜色角色，规则挂在 index.css 的 .shadow-mark 上。
const parts = eclipsePaths();
const shadowMarkTsx = `/**
 * ShadowMark —— 蚀（日月相蚀）logo 的应用内标记。
 *
 * ⚠️ 由 brand/gen-icons.mjs 生成，请勿手改。
 * 几何真相源：仓根 brand/geom.mjs；改几何请改那里再重跑脚本。
 *
 * 明暗两态**交换两笔的颜色角色**：
 * - 白天：日亮月暗 —— 后面的月牙吃主题色，前面的月盘是中性影色
 * - 黑夜：月亮日暗 —— 前面的月盘亮起来，后面的日轮退成暗影
 *
 * 颜色规则在 shadow-desktop/src/index.css 的 \`.shadow-mark\` 上。
 */

export interface ShadowMarkProps {
  /** 边长（px）。 */
  size?: number;
  className?: string;
}

export function ShadowMark({ size = 24, className = '' }: ShadowMarkProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={\`shadow-mark \${className}\`.trim()}
      role="img"
      aria-label="Shadow"
    >
      <path data-part="front" d="${parts.front}" />
      <path data-part="back" d="${parts.back}" />
    </svg>
  );
}
`;
write(
  join(DESKTOP, 'src', 'components', 'brand', 'ShadowMark.tsx'),
  shadowMarkTsx
);

// Tauri 的 1024 源图（`pnpm tauri icon` 的输入）
write(join(HERE, 'icon', 'app-icon.png'), appIconPng(1024));

// favicon：底板版 —— 浅底在浅色/深色标签栏上都看得见
write(
  join(DESKTOP, 'public', 'pwa-icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" fill="none">
  <rect x="0" y="0" width="512" height="512" rx="${TILE_RADIUS}" fill="${TILE_LIGHT}"/>
  ${MARK.svg('day')
    .replace(/var\(--logo-ink, [^)]+\)/, INK_LIGHT)
    .replace(/var\(--logo-accent, [^)]+\)/, ACCENT)}
</svg>
`
);

// PWA 图标（标记在 maskable 安全区内）
write(join(DESKTOP, 'public', 'pwa-192.png'), appIconPng(192));
write(join(DESKTOP, 'public', 'pwa-512.png'), appIconPng(512));
write(join(DESKTOP, 'public', 'pwa-512-monochrome.png'), monoMarkPng(512));

/* ── 移动端（Android）────────────────────────────────────────────────────── */

// 传统启动图标（API < 26）
const MIPMAP = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [dpi, size] of Object.entries(MIPMAP)) {
  write(join(ANDROID_RES, `mipmap-${dpi}`, 'ic_launcher.png'), appIconPng(size));
}

// 自适应图标前景（108dp = 密度 × 1.5；中央 72dp 是安全区）
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
for (const [dpi, size] of Object.entries(FOREGROUND)) {
  write(
    join(ANDROID_RES, `mipmap-${dpi}`, 'ic_launcher_foreground.png'),
    adaptiveForegroundPng(size)
  );
}

// 自适应图标底色 —— 旧的深蓝渐变（#0F0F23/#1A1A3E）换成中性底
write(
  join(ANDROID_RES, 'drawable', 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<!-- 由 brand/gen-icons.mjs 生成，请勿手改 -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="${TILE_LIGHT}"
        android:pathData="M0,0h108v108h-108z" />
</vector>
`
);

// 自适应图标清单：前景改成位图
write(
  join(ANDROID_RES, 'mipmap-anydpi-v26', 'ic_launcher.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<!-- 由 brand/gen-icons.mjs 生成，请勿手改 -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`
);

if (CHECK && drift > 0) {
  console.error(`\n品牌资源漂移 ${drift} 处 —— 生成物必须与几何同步。`);
  process.exit(1);
}
