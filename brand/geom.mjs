/**
 * brand/geom.mjs —— Shadow logo 的**唯一真相源**：调色板 + 几何 + 四套方案。
 *
 * 这里不写任何文件，只描述「logo 是什么」。产物由：
 *
 * - `brand/gen-logo.mjs` —— 品牌 SVG（`logo/*.svg`）+ 对照页 + 对照图
 * - `brand/gen-icons.mjs` —— 平台资源（Tauri 图标 / PWA 图标 / Android 自适应图标）
 *
 * 两者共用本文件的几何，所以 **SVG 产物与位图产物不可能走样**。
 *
 * ## 配色原则
 *
 * **影子本身没有颜色** → 影一律中性色（ink），只有「光」吃主题色槽位
 * （accent，默认 `#71717A`，用户可覆盖）。
 *
 * 层级规则：**光永远比影亮**。
 * - 亮底：影 = 近黑（`#09090B`），光 = 主题色原色。
 * - 暗底：影 = zinc-600（`#52525B`，暗但可辨），光 = 主题色的提亮版。
 *
 * ## 四套方案
 *
 * - **蚀 (eclipse)** —— 日月相蚀。左「月」在前（圆满），右「日」在后
 *   （被遮盖，只剩一道月牙）。**白天黑夜只换两笔颜色角色**：白天日亮月暗
 *   （后面那道月牙吃主题色），黑夜月亮日暗（前面亮起来，后面退成暗影）。
 *   单色版在影与光之间留一道缝，否则会糊成一块。
 * - **隙 (gap)** —— 两个交叠的实心圆，交集透镜缝吃主题色。
 * - **环核 (core)** —— 粗环 + 偏离中心的实心核。记忆是环，灵魂是核。
 * - **弧 (arc)** —— 一弯月牙本体（影）+ 内缘一道焦散亮带（光）。
 */

import { fileURLToPath } from 'node:url';

/* ── 调色板 ──────────────────────────────────────────────────────────────── */

export const INK_LIGHT = '#09090B'; // 亮底上的影色：近黑
export const INK_DARK = '#52525B'; // 暗底上的影色：zinc-600
export const INK_TILE = '#09090B'; // 图标底板
export const ACCENT = '#71717A'; // 主题色槽位默认值（zinc-500）
export const ACCENT_DEMO = '#8B7CF6'; // 对照页里演示「用户换色」用
export const BG_DARK = '#0A0A0B';
export const BG_LIGHT = '#FFFFFF';
export const TILE_LIGHT = '#F4F4F5'; // 图标底板（亮）
export const TILE_RADIUS = 112; // 图标底板圆角（512 的 22%）

export const VIEWBOX = [0, 0, 512, 512];

/** 把颜色朝白色提亮 —— 暗底上的主题色槽位要提亮，否则「光」比「影」还暗。 */
export function lighten(hex, mix) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(v + (255 - v) * mix)
  );
  return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** SVG 里 `--logo-accent` 的兜底值：暗底要用提亮过的主题色。 */
export const accentFallback = (mode) => (mode === 'night' ? lighten(ACCENT, 0.3) : ACCENT);

/* ── 几何工具 ────────────────────────────────────────────────────────────── */

const TAU = Math.PI * 2;
const ang = (c, p) => Math.atan2(p[1] - c[1], p[0] - c[0]);
const norm = (a) => ((a % TAU) + TAU) % TAU;
const unit = (a, b) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d = Math.hypot(dx, dy) || 1;
  return [dx / d, dy / d];
};

const r2 = (n) => Math.round(n * 100) / 100;
const pt = (x, y) => `${r2(x)} ${r2(y)}`;

/** 两个圆的交点（无交点返回 null）。 */
export function circleIntersect(c1, r1, c2, r2_) {
  const dx = c2[0] - c1[0];
  const dy = c2[1] - c1[1];
  const d = Math.hypot(dx, dy);
  if (d === 0 || d > r1 + r2_ || d < Math.abs(r1 - r2_)) return null;
  const a = (r1 * r1 - r2_ * r2_ + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const xm = c1[0] + (a * dx) / d;
  const ym = c1[1] + (a * dy) / d;
  const rx = (-dy * h) / d;
  const ry = (dx * h) / d;
  return [
    [xm + rx, ym + ry],
    [xm - rx, ym - ry],
  ];
}

/**
 * 一段圆弧的完整描述：从 p1 到 p2，且必须经过 midPoint。
 *
 * 角度约定与 SVG 一致：y 轴朝下，角度递增 = 屏幕顺时针 = sweep-flag 1。
 */
export function arcSpec(c, r, p1, p2, midPoint) {
  const a1 = ang(c, p1);
  const a2 = ang(c, p2);
  const am = ang(c, midPoint);
  const fwd = norm(a2 - a1);
  const sweep = norm(am - a1) <= fwd + 1e-9 ? 1 : 0;
  const span = sweep === 1 ? fwd : norm(a1 - a2);
  const large = span > Math.PI ? 1 : 0;
  return {
    c,
    r,
    p1,
    p2,
    a1,
    a2,
    sweep,
    span,
    large,
    seg: `A ${r} ${r} 0 ${large} ${sweep} ${pt(p2[0], p2[1])}`,
    d: `M ${pt(p1[0], p1[1])} A ${r} ${r} 0 ${large} ${sweep} ${pt(p2[0], p2[1])}`,
  };
}

/** 圆 A 上离圆 B 最远的轴点。 */
const awayFrom = (A, rA, B) => {
  const u = unit(A, B);
  return [A[0] - u[0] * rA, A[1] - u[1] * rA];
};
/** 圆 A 上朝向圆 B 的轴点。 */
const towardTo = (A, rA, B) => {
  const u = unit(A, B);
  return [A[0] + u[0] * rA, A[1] + u[1] * rA];
};

/**
 * A 减 B 的月牙（A 的圆弧 + B 的圆弧围成）。
 *
 * 注意：`fill-rule="evenodd"` 画两个交叠圆得到的是**对称差**（两片月牙），
 * 不是「A 减 B」。要单片月牙必须显式用两段弧接成闭合路径。
 */
export function crescentPath(A, rA, B, rB) {
  const ip = circleIntersect(A, rA, B, rB);
  if (!ip) throw new Error('crescent: 两圆必须相交');
  const [p1, p2] = ip;
  const outer = arcSpec(A, rA, p1, p2, awayFrom(A, rA, B));
  const inner = arcSpec(B, rB, p2, p1, towardTo(B, rB, A));
  return { d: `M ${pt(p1[0], p1[1])} ${outer.seg} ${inner.seg} Z`, outer, inner };
}

/** A 交 B 的透镜。 */
export function lensPath(A, rA, B, rB) {
  const ip = circleIntersect(A, rA, B, rB);
  if (!ip) throw new Error('lens: 两圆必须相交');
  const [p1, p2] = ip;
  const a = arcSpec(A, rA, p1, p2, towardTo(A, rA, B));
  const b = arcSpec(B, rB, p2, p1, towardTo(B, rB, A));
  return { d: `M ${pt(p1[0], p1[1])} ${a.seg} ${b.seg} Z`, a, b };
}

/** 圆 A 上落在 B 之内的那段弧。 */
export function innerArc(A, rA, B, rB) {
  const ip = circleIntersect(A, rA, B, rB);
  if (!ip) throw new Error('innerArc: 两圆必须相交');
  const [p1, p2] = ip;
  return arcSpec(A, rA, p1, p2, towardTo(A, rA, B));
}

export const circlePath = (c, r) =>
  `M ${pt(c[0] - r, c[1])} A ${r} ${r} 0 1 1 ${pt(c[0] + r, c[1])} A ${r} ${r} 0 1 1 ${pt(c[0] - r, c[1])} Z`;

/* ── 蚀方案的几何常量 ────────────────────────────────────────────────────── */

/**
 * 前盘（月）在左，后盘（日）在右。
 *
 * 两个圆**靠得很近**（圆心距 46 / 半径 150）：日轮退成一道细月牙挂在月盘
 * 右缘 —— 这才是日食的样子，也是上一版的观感：**主体压暗，光只占一条边**。
 * 圆心距拉到接近直径时，两轮平分秋色，主体就散了。
 */
export const ECLIPSE = {
  front: [233, 256], // 月：前景，圆满
  frontR: 150,
  back: [279, 256], // 日：后景，被遮盖，只剩一道细月牙
  backR: 150,
  /** 单色版里影与光之间的缝（512 单位）。16px 上约 0.6px。 */
  gap: 20,
};

/** 焦散亮带的宽度（沿咬痕圆的径向）。 */
export const BAND_W = 34;

/* ── 方案 ────────────────────────────────────────────────────────────────── */

export const CONCEPTS = [
  {
    id: 'eclipse',
    name: '蚀',
    idea:
      '日月相蚀。左「月」在前（圆满），右「日」在后（被遮盖，只剩月牙）。白天日亮月暗、黑夜月亮日暗 —— 同一份几何只换两笔颜色角色，影子形态不变，观者自己读出昼夜。',
    tags: ['模式响应', '昼夜反转'],
    bbox: [83, 106, 429, 406],
    layers(mode) {
      const { front, frontR, back, backR, gap } = ECLIPSE;
      if (mode === 'mono') {
        // 单色：影与光之间切一道缝，否则两轮咬合会糊成一块
        return [
          { color: 'current', shapes: [{ type: 'disc', c: front, r: frontR }] },
          {
            color: 'current',
            shapes: [{ type: 'crescent', c1: back, r1: backR, c2: front, r2: frontR + gap }],
          },
        ];
      }
      const frontDisc = { type: 'disc', c: front, r: frontR };
      const backCrescent = { type: 'crescent', c1: back, r1: backR, c2: front, r2: frontR };
      if (mode === 'night') {
        // 月亮日暗：前面的月盘亮（主题色），后面的日轮退成暗影
        return [
          { color: 'accent', shapes: [frontDisc] },
          { color: 'ink', shapes: [backCrescent] },
        ];
      }
      // 白天日亮月暗：后面的月牙亮（主题色），前面的月盘是中性影色
      return [
        { color: 'ink', shapes: [frontDisc] },
        { color: 'accent', shapes: [backCrescent] },
      ];
    },
    svg(mode) {
      const { front, frontR, back, backR, gap } = ECLIPSE;
      if (mode === 'mono') {
        const disc = `<circle cx="${front[0]}" cy="${front[1]}" r="${frontR}" fill="currentColor"/>`;
        const crescent = `<path d="${crescentPath(back, backR, front, frontR + gap).d}" fill="currentColor"/>`;
        return `${disc}\n  ${crescent}`;
      }
      const fillFront =
        mode === 'night'
          ? 'var(--logo-accent, ' + accentFallback(mode) + ')'
          : 'var(--logo-ink, ' + INK_LIGHT + ')';
      const fillBack =
        mode === 'night'
          ? 'var(--logo-ink, ' + INK_DARK + ')'
          : 'var(--logo-accent, ' + ACCENT + ')';
      const frontEl = `<circle cx="${front[0]}" cy="${front[1]}" r="${frontR}" fill="${fillFront}"/>`;
      const backEl = `<path d="${crescentPath(back, backR, front, frontR).d}" fill="${fillBack}"/>`;
      return `${frontEl}\n  ${backEl}`;
    },
  },

  {
    id: 'gap',
    name: '隙',
    idea: '两个交叠的实心圆，交集那条透镜缝吃主题色。你和你的影子共享的那部分，是亮的。',
    tags: ['共享'],
    bbox: [54, 54, 458, 458],
    layers(mode) {
      const c1 = [182, 182];
      const c2 = [330, 330];
      const ink = { type: 'union', c1, r1: 128, c2, r2: 128 };
      const lens = { type: 'lens', c1, r1: 128, c2, r2: 128 };
      if (mode === 'mono') return [{ color: 'current', shapes: [ink] }];
      return [
        { color: 'ink', shapes: [ink] },
        { color: 'accent', shapes: [lens] },
      ];
    },
    svg(mode) {
      const c1 = [182, 182];
      const c2 = [330, 330];
      const shells = `${circlePath(c1, 128)} ${circlePath(c2, 128)}`;
      const head = `<path d="${shells}" fill="var(--logo-ink, ${INK_LIGHT})"/>`;
      if (mode === 'mono') return head;
      return `${head}\n  <path d="${lensPath(c1, 128, c2, 128).d}" fill="var(--logo-accent, ${accentFallback(mode)})"/>`;
    },
  },

  {
    id: 'core',
    name: '环核',
    idea: '一个粗环里悬着偏离中心的实心核。记忆是环，灵魂是核 —— 核是偏的：它不完全受宿主支配。',
    tags: ['记忆 × 灵魂'],
    bbox: [96, 96, 416, 416],
    layers(mode) {
      const ring = { type: 'ring', c: [256, 256], rOuter: 160, rInner: 104 };
      const core = { type: 'disc', c: [230, 236], r: 44 };
      if (mode === 'mono') return [{ color: 'current', shapes: [ring, core] }];
      return [
        { color: 'ink', shapes: [ring] },
        { color: 'accent', shapes: [core] },
      ];
    },
    svg(mode) {
      const outer = circlePath([256, 256], 160);
      const inner = circlePath([256, 256], 104);
      const head = `<path d="${outer} ${inner}" fill-rule="evenodd" fill="var(--logo-ink, ${INK_LIGHT})"/>`;
      const core = `<circle cx="230" cy="236" r="44" fill="var(--logo-accent, ${accentFallback(mode)})"/>`;
      if (mode === 'mono')
        return `${head}\n  ${core.replace('var(--logo-accent, ' + accentFallback(mode) + ')', 'currentColor')}`;
      return `${head}\n  ${core}`;
    },
  },

  {
    id: 'arc',
    name: '弧',
    idea: '一弯月牙本体是影，内缘那道焦散亮带是光。最接近传统月亮图标，16px 最稳。',
    tags: ['最省', '焦散'],
    bbox: [88, 88, 424, 424],
    layers(mode) {
      const disc = [256, 256];
      const bite = [345.5, 345.5];
      const ink = { type: 'crescent', c1: disc, r1: 168, c2: bite, r2: 150 };
      // 焦散亮带 = 咬痕圆的环带 ∩ 圆盘（贴着影的内缘，不是浮在外面的线）
      const band = {
        type: 'annulus',
        c: bite,
        rIn: 150,
        rOut: 150 + BAND_W,
        clip: { type: 'disc', c: disc, r: 168 },
      };
      if (mode === 'mono') return [{ color: 'current', shapes: [ink] }];
      return [
        { color: 'ink', shapes: [ink] },
        { color: 'accent', shapes: [band] },
      ];
    },
    svg(mode) {
      const disc = [256, 256];
      const bite = [345.5, 345.5];
      const crescent = crescentPath(disc, 168, bite, 150).d;
      const head = `<path d="${crescent}" fill="var(--logo-ink, ${INK_LIGHT})"/>`;
      if (mode === 'mono') return head;
      const annulus = `${circlePath(bite, 150 + BAND_W)} ${circlePath(bite, 150)}`;
      return (
        `${head}\n  <defs><clipPath id="arc-band"><circle cx="256" cy="256" r="168"/></clipPath></defs>\n` +
        `  <path d="${annulus}" fill-rule="evenodd" clip-path="url(#arc-band)"` +
        ` fill="var(--logo-accent, ${accentFallback(mode)})"/>`
      );
    },
  },
];

/** 定稿采用的方案。 */
export const CHOSEN = 'eclipse';

export const conceptById = (id) => CONCEPTS.find((c) => c.id === id);

/**
 * 蚀方案的两条路径（应用内标记 / 图标源图都用它）。
 * `gap` = true 时给单色版用：影与光之间留一道缝。
 */
export function eclipsePaths({ gap = false } = {}) {
  const { front, frontR, back, backR } = ECLIPSE;
  return {
    front: circlePath(front, frontR),
    back: crescentPath(back, backR, front, gap ? frontR + ECLIPSE.gap : frontR).d,
  };
}
