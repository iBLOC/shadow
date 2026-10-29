/**
 * brand/raster.mjs —— 极简光栅化器 + PNG 编码器。
 *
 * ## 为什么自己写
 *
 * logo 的几何只有圆、圆弧、环、透镜这几种**解析形状**。直接按解析式判定
 * 「这个采样点在不在形状里」比拉一个 SVG 渲染器更可控，也让 **SVG 产物和
 * PNG 产物来自同一份几何参数** —— 不会出现「预览好看、出图走样」。
 *
 * 后面出 Tauri / Android 图标（PNG、ICO、ICNS）也复用这一套。
 *
 * ## 无第三方依赖
 *
 * PNG 用 `node:zlib` 手写（IHDR / IDAT / IEND + CRC32）。
 */

import zlib from 'node:zlib';

/* ── PNG 编码 ────────────────────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

/** canvas → PNG 字节流（RGBA 8bit）。 */
export function encodePng(canvas) {
  const { w, h, rgba } = canvas;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    // node:zlib 的 deflateSync 输出的就是 zlib 流（RFC 1950，自带 2 字节
    // header 与 adler32 尾部），IDAT 直接收它，不要再手动包一层。
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── 颜色 ────────────────────────────────────────────────────────────────── */

/** '#rrggbb' / '#rgb' → [r,g,b] */
export function parseColor(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) throw new Error(`parseColor: 不是 hex 颜色 → ${hex}`);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/* ── 画布 ────────────────────────────────────────────────────────────────── */

export function createCanvas(w, h, bg = null) {
  const rgba = Buffer.alloc(w * h * 4, 0);
  if (bg) {
    const [r, g, b] = parseColor(bg);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = r;
      rgba[i * 4 + 1] = g;
      rgba[i * 4 + 2] = b;
      rgba[i * 4 + 3] = 255;
    }
  }
  return { w, h, rgba };
}

/** 不透明矩形（用于铺底 / 分隔）。 */
export function fillRect(canvas, x, y, w, h, color) {
  const [r, g, b] = parseColor(color);
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(canvas.w, Math.round(x + w));
  const y1 = Math.min(canvas.h, Math.round(y + h));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (py * canvas.w + px) * 4;
      canvas.rgba[i] = r;
      canvas.rgba[i + 1] = g;
      canvas.rgba[i + 2] = b;
      canvas.rgba[i + 3] = 255;
    }
  }
}

/* ── 形状判定 ────────────────────────────────────────────────────────────── */

const dist2 = (px, py, c) => (px - c[0]) ** 2 + (py - c[1]) ** 2;
const inCircle = (px, py, c, r) => dist2(px, py, c) <= r * r;

const TAU = Math.PI * 2;
const norm = (a) => ((a % TAU) + TAU) % TAU;

/**
 * 点是否落在弧线上（含 round cap 的两个圆头）。
 * 角度约定与 SVG 一致：y 轴朝下，角度递增 = 屏幕顺时针 = sweep-flag 1。
 */
function inArc(px, py, s) {
  const dx = px - s.c[0];
  const dy = py - s.c[1];
  const d = Math.hypot(dx, dy);
  if (Math.abs(d - s.r) > s.width / 2) return false;
  const a = Math.atan2(dy, dx);
  if (s.sweep === 1) {
    if (norm(a - s.a1) <= s.span + 1e-9) return true;
  } else if (norm(s.a1 - a) <= s.span + 1e-9) return true;
  // round cap：靠近端点就算在笔画上
  return (
    Math.hypot(px - s.p1[0], py - s.p1[1]) <= s.width / 2 ||
    Math.hypot(px - s.p2[0], py - s.p2[1]) <= s.width / 2
  );
}

/**
 * 单一形状的命中判定。shapes 里任一命中即算命中（union）。
 *
 * 形状可带 `clip`（另一个形状）：命中它还必须落在 clip 里。
 */
function inShape(s, px, py) {
  let hit = false;
  switch (s.type) {
    case 'disc':
    case 'circle':
      hit = inCircle(px, py, s.c, s.r);
      break;
    case 'ring':
      hit = inCircle(px, py, s.c, s.rOuter) && !inCircle(px, py, s.c, s.rInner);
      break;
    case 'annulus':
      hit = inCircle(px, py, s.c, s.rOut) && !inCircle(px, py, s.c, s.rIn);
      break;
    case 'rrect': {
      // 圆角矩形
      const { x, y, w, h, r } = s;
      const x1 = x + w;
      const y1 = y + h;
      if (px < x || px > x1 || py < y || py > y1) {
        hit = false;
        break;
      }
      const cx = px < x + r ? x + r : px > x1 - r ? x1 - r : px;
      const cy = py < y + r ? y + r : py > y1 - r ? y1 - r : py;
      hit = (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
      break;
    }
    case 'crescent':
      // A 减 B
      hit = inCircle(px, py, s.c1, s.r1) && !inCircle(px, py, s.c2, s.r2);
      break;
    case 'union':
      hit = inCircle(px, py, s.c1, s.r1) || inCircle(px, py, s.c2, s.r2);
      break;
    case 'lens':
      hit = inCircle(px, py, s.c1, s.r1) && inCircle(px, py, s.c2, s.r2);
      break;
    case 'arcStroke':
      hit = inArc(px, py, s);
      break;
    default:
      throw new Error(`raster: 未知形状 ${s.type}`);
  }
  if (!hit) return false;
  if (s.clip) return inShape(s.clip, px, py);
  return true;
}

function hitAny(shapes, px, py) {
  for (const s of shapes) {
    if (inShape(s, px, py)) return true;
  }
  return false;
}

/* ── 绘制 ────────────────────────────────────────────────────────────────── */

/**
 * 把一组形状画到画布上。
 *
 * @param vb      形状所在的坐标系（viewBox）[x0,y0,w,h]
 * @param dest    画到画布的哪个矩形 [x,y,w,h]
 * @param ss      每轴超采样数（默认 4×4 = 16 采样/像素）
 */
export function drawShapes(canvas, { vb, dest, shapes, color, ss = 4, alpha = 1 }) {
  if (!shapes || shapes.length === 0) return;
  const [vx0, vy0, vw, vh] = vb;
  const scaleX = dest[2] / vw;
  const scaleY = dest[3] / vh;
  const [r, g, b] = parseColor(color);
  const x0 = Math.max(0, Math.round(dest[0]));
  const y0 = Math.max(0, Math.round(dest[1]));
  const x1 = Math.min(canvas.w, Math.round(dest[0] + dest[2]));
  const y1 = Math.min(canvas.h, Math.round(dest[1] + dest[3]));

  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      let hits = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const cxp = px + (sx + 0.5) / ss;
          const cyp = py + (sy + 0.5) / ss;
          const vx = vx0 + (cxp - dest[0]) / scaleX;
          const vy = vy0 + (cyp - dest[1]) / scaleY;
          if (hitAny(shapes, vx, vy)) {
            hits++;
            break;
          }
        }
      }
      if (!hits) continue;
      const a = (hits / ss) * alpha;
      const i = (py * canvas.w + px) * 4;
      const da = canvas.rgba[i + 3] / 255;
      const oa = a + da * (1 - a);
      if (oa <= 0) continue;
      canvas.rgba[i] = Math.round((r * a + canvas.rgba[i] * da * (1 - a)) / oa);
      canvas.rgba[i + 1] = Math.round((g * a + canvas.rgba[i + 1] * da * (1 - a)) / oa);
      canvas.rgba[i + 2] = Math.round((b * a + canvas.rgba[i + 2] * da * (1 - a)) / oa);
      canvas.rgba[i + 3] = Math.round(oa * 255);
    }
  }
}
