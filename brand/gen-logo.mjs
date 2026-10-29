/**
 * brand/gen-logo.mjs —— 品牌产物生成器（只写文件，几何在 brand/geom.mjs）。
 *
 * ## 为什么是脚本生成
 *
 * 仓库的规矩是「设计数值只有一个真相源」：色板在 `design-tokens.json`，
 * 由 `scripts/gen_tokens.mjs` 投影到两端。logo 同理 —— 几何参数在
 * `brand/geom.mjs`，产物是从属的，改参数重跑即可。圆弧交点、透镜形、
 * 月牙这种形状手写路径不准。
 *
 * 光栅化走 `brand/raster.mjs`（解析式判定 + 手写 PNG），所以 **SVG 产物和
 * PNG 产物来自同一份几何参数**，不会出现「预览好看、出图走样」。
 *
 * ## 输出
 *
 * - `logo/<id>.svg` —— 白天版（影=中性、光=主题色）。
 * - `logo/<id>-night.svg` —— 黑夜版（角色互换 / 影退暗影）。
 * - `logo/<id>-mono.svg` —— 单色 `currentColor`。托盘图标 / favicon。
 * - `logo/app-icon.svg` —— 图标底板（浅色圆角方块 + 标记）。
 * - `preview/*.png` —— 光栅对照图。
 * - `preview.html` —— 浏览器对照页。**SVG 内联**（`<img>` 里的 SVG 是隔离
 *   文档，CSS 变量传不进去，颜色会全是回退值）。
 *
 * 用法：`node brand/gen-logo.mjs`
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, drawShapes, encodePng } from './raster.mjs';
import {
  ACCENT,
  ACCENT_DEMO,
  BG_DARK,
  BG_LIGHT,
  CONCEPTS,
  INK_DARK,
  INK_LIGHT,
  TILE_LIGHT,
  TILE_RADIUS,
  VIEWBOX,
  accentFallback,
  conceptById,
  lighten,
} from './geom.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'logo');
const PREVIEW = join(HERE, 'preview');

// ── 写 SVG ──────────────────────────────────────────────────────────────────
const SVG_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" fill="none">';
const SVG_CLOSE = '</svg>';

mkdirSync(OUT, { recursive: true });
mkdirSync(PREVIEW, { recursive: true });

for (const c of CONCEPTS) {
  writeFileSync(join(OUT, `${c.id}.svg`), `${SVG_OPEN}\n  ${c.svg('day')}\n${SVG_CLOSE}\n`, 'utf8');
  writeFileSync(
    join(OUT, `${c.id}-night.svg`),
    `${SVG_OPEN}\n  ${c.svg('night')}\n${SVG_CLOSE}\n`,
    'utf8'
  );
  writeFileSync(
    join(OUT, `${c.id}-mono.svg`),
    `${SVG_OPEN}\n  ${c.svg('mono')}\n${SVG_CLOSE}\n`,
    'utf8'
  );
  console.log(`wrote logo/${c.id}.svg (+night, +mono)`);
}

// ── 图标底板（浅色圆角方块 + 标记）────────────────────────────────────────
// 旧的桌面端图标就是「浅色底 + 彩色标记」，这里沿用同一套处理：
// 影要落在**被照亮的表面上**才看得见。
const chosen = conceptById('eclipse');
const appIcon = `<rect x="0" y="0" width="512" height="512" rx="${TILE_RADIUS}" fill="${TILE_LIGHT}"/>
  ${chosen.svg('day').replace(/var\(--logo-ink, [^)]+\)/, INK_LIGHT).replace(/var\(--logo-accent, [^)]+\)/, ACCENT)}`;
writeFileSync(
  join(OUT, 'app-icon.svg'),
  `${SVG_OPEN}\n  ${appIcon}\n${SVG_CLOSE}\n`,
  'utf8'
);
console.log('wrote logo/app-icon.svg');

// ── 光栅对照图 ──────────────────────────────────────────────────────────────
const MODES = {
  day: { ink: INK_LIGHT, accent: ACCENT, bg: BG_LIGHT },
  night: { ink: INK_DARK, accent: lighten(ACCENT, 0.3), bg: BG_DARK },
  demo: { ink: INK_DARK, accent: lighten(ACCENT_DEMO, 0.3), bg: BG_DARK },
  mono: { ink: '#E4E4E7', accent: '#E4E4E7', bg: BG_DARK },
};

/** 把一套方案在某个模式下的各层画到画布。 */
function drawConcept(canvas, concept, mode, dest) {
  const pal = MODES[mode];
  for (const layer of concept.layers(mode)) {
    const color =
      layer.color === 'current' ? pal.ink : layer.color === 'ink' ? pal.ink : pal.accent;
    drawShapes(canvas, {
      vb: VIEWBOX,
      dest,
      shapes: layer.shapes,
      color,
      alpha: layer.alpha ?? 1,
    });
  }
}

/** 单方案对照图：一排尺寸。 */
function sheetOne(concept, mode, sizes) {
  const pal = MODES[mode];
  const gap = 26;
  const pad = 24;
  const big = sizes[0];
  const width = pad * 2 + sizes.reduce((a, s) => a + s, 0) + gap * (sizes.length - 1);
  const height = pad * 2 + big;
  const canvas = createCanvas(width, height, pal.bg);
  let x = pad;
  for (const s of sizes) {
    drawConcept(canvas, concept, mode, [x, pad, s, s]);
    x += s + gap;
  }
  return encodePng(canvas);
}

/** 四套横排对照图。 */
function sheetCompare(mode, sizes) {
  const pal = MODES[mode];
  const pad = 26;
  const colW = 250;
  const big = sizes[0];
  const width = pad * 2 + CONCEPTS.length * colW;
  const height = pad * 2 + big + 96;
  const canvas = createCanvas(width, height, pal.bg);
  CONCEPTS.forEach((c, i) => {
    const x = pad + i * colW;
    drawConcept(canvas, c, mode, [x + (colW - big) / 2, pad, big, big]);
    let sx = x + (colW - sizes.slice(1).reduce((a, s) => a + s, 0)) / 2 - 12;
    for (const s of sizes.slice(1)) {
      drawConcept(canvas, c, mode, [sx, pad + big + 40, s, s]);
      sx += s + 24;
    }
  });
  return encodePng(canvas);
}

const SIZES = [220, 64, 32, 16];
for (const mode of ['day', 'night', 'demo', 'mono']) {
  for (const c of CONCEPTS) {
    writeFileSync(join(PREVIEW, `${c.id}-${mode}.png`), sheetOne(c, mode, SIZES), 'utf8');
    // 单张大图 —— 查细节用
    const pal = MODES[mode];
    const solo = createCanvas(512, 512, pal.bg);
    drawConcept(solo, c, mode, [0, 0, 512, 512]);
    writeFileSync(join(PREVIEW, `${c.id}-${mode}-big.png`), encodePng(solo), 'utf8');
  }
  writeFileSync(join(PREVIEW, `compare-${mode}.png`), sheetCompare(mode, SIZES), 'utf8');
}
console.log('wrote preview/*.png');

// ── 浏览器对照页 ────────────────────────────────────────────────────────────
function inline(concept, mode, px) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${px}" height="${px}" fill="none">${concept.svg(mode)}</svg>`;
}
function tile(concept, mode, px, tone, cls = '') {
  return `<div class="tile ${tone} ${cls}" style="width:${px}px;height:${px}px">${inline(concept, mode, px)}</div>`;
}
const sizes = [120, 48, 32, 16];

const cards = CONCEPTS.map(
  (c) => `
  <section class="concept">
    <h2>${c.name} <span class="id">${c.id}</span></h2>
    <div class="tags">${c.tags.map((t) => `<span class="tag">${t}</span>`).join('')}</div>
    <p class="idea">${c.idea}</p>
    <div class="panel light">
      <div class="row">
        ${sizes.map((s) => `<div class="col">${tile(c, 'day', s, 'light')}<span class="cap">${s}</span></div>`).join('')}
      </div>
      <div class="cap-label">白天（日亮月暗）</div>
    </div>
    <div class="panel dark">
      <div class="row">
        ${sizes.map((s) => `<div class="col">${tile(c, 'night', s, 'dark')}<span class="cap">${s}</span></div>`).join('')}
      </div>
      <div class="row">
        ${sizes.map((s) => `<div class="col">${tile(c, 'mono', s, 'dark')}<span class="cap">${s}</span></div>`).join('')}
      </div>
      <div class="cap-label">黑夜（月亮日暗）　下：托盘单色</div>
    </div>
    <div class="panel dark accent">
      <div class="row">
        ${[120, 48, 32].map((s) => `<div class="col">${tile(c, 'day', s, 'dark')}<span class="cap">${s}</span></div>`).join('')}
      </div>
      <div class="cap-label">用户换成主题色后（光吃主题色槽位）</div>
    </div>
    <img class="sheet" src="preview/${c.id}-day.png" alt="" onerror="this.style.display='none'" />
  </section>`
).join('\n');

writeFileSync(
  join(HERE, 'preview.html'),
  `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>Shadow · 新 logo 方案对照</title>
<style>
  :root {
    --ink-dark: ${INK_DARK}; --ink-light: ${INK_LIGHT};
    --accent-light: ${ACCENT}; --accent-dark: ${lighten(ACCENT, 0.3)};
    --accent-demo: ${lighten(ACCENT_DEMO, 0.3)};
    --surface-dark: ${BG_DARK}; --surface-light: ${BG_LIGHT};
    --muted: #A1A1AA;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px; background: #161618; color: #FAFAFA;
    font: 13px/1.6 ui-sans-serif, system-ui, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  h1 { font-size: 19px; font-weight: 600; margin: 0 0 4px; }
  .sub { color: var(--muted); margin: 0 0 22px; font-size: 12px; max-width: 980px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; align-items: start; }
  .concept { background: #1c1c1f; border: 1px solid #ffffff14; border-radius: 14px; padding: 14px; }
  h2 { font-size: 15px; font-weight: 600; margin: 0; }
  .id { color: #71717A; font-weight: 400; font-size: 12px; }
  .tags { margin: 6px 0 0; display: flex; gap: 6px; flex-wrap: wrap; }
  .tag { font-size: 10px; color: #A1A1AA; border: 1px solid #ffffff1f; border-radius: 999px; padding: 1px 8px; }
  .idea { color: var(--muted); font-size: 12px; margin: 8px 0 12px; min-height: 96px; }
  .panel { border-radius: 10px; padding: 14px; margin-bottom: 10px; }
  .panel.dark { background: var(--surface-dark); }
  .panel.light { background: var(--surface-light); }
  .panel.accent { --logo-accent: var(--accent-demo); }
  .row { display: flex; gap: 14px; align-items: flex-end; margin-bottom: 12px; }
  .row:last-of-type { margin-bottom: 0; }
  .col { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .cap { font-size: 10px; color: #71717A; }
  .cap-label { font-size: 10px; color: var(--muted); margin-top: 2px; }
  .tile { display: grid; place-items: center; border-radius: 22%; overflow: hidden; }
  .tile.dark { background: #111113; }
  .tile.light { background: #F4F4F5; }
  .dark { --logo-ink: var(--ink-dark); --logo-accent: var(--accent-dark); }
  .light { --logo-ink: var(--ink-light); --logo-accent: var(--accent-light); }
</style>
</head>
<body>
  <h1>Shadow · 新 logo 方案对照</h1>
  <p class="sub">
    基准：<b>影子本身没有颜色</b> → 影一律中性色，只有「光」吃主题色槽位（默认 <code>#71717A</code>，用户可覆盖）。
    <b>光永远比影亮</b>：亮底上影近黑、光中灰；暗底上影退成暗影、光才拿满主题色。
    每套给白天 / 黑夜 / 托盘单色，以及 120 / 48 / 32 / 16 四档（16px 是任务栏与托盘的生死线）。
  </p>
  <div class="grid">${cards}</div>
</body>
</html>
`,
  'utf8'
);
console.log('wrote preview.html');
