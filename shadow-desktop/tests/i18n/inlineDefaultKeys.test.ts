import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

/**
 * **词表不许再漏键** —— 英文界面里那些「暂显中文」的行，从哪来。
 *
 * ## 这条契约为什么存在
 *
 * 桌面端有一批 `t('key', '中文默认')` 的写法（**内联默认**）⇒ ⇒ 词表里**没有**
 * 这个键时，i18next 就用那句中文兜底 ⇒ ⇒ **英文界面直接显示中文**。
 *
 * ⚠️ **实测（2026-11-09 取证，按本文件同口径复测）**：扫 **277** 个源文件 ⇒
 * **71** 个带内联默认的键里，**23 个两份词表都没有**
 * ⇒ ⇒ 英文界面那几行「端脑任务」「读不到端脑任务：」「影子锁」全是中文；
 * 另有 **4 个键只在中文词表里** ⇒ ⇒ 英文界面会显示**裸键**
 * （`settings.common.save/cancel/edit` ＋ `settings.subsystem.common.refreshAll`）。
 *
 * ⚠️ **这些数字会漂** —— 插前那次量到的是「**72** 个键 / **24** 个两份都没有 /
 * **3** 个只在中文」，收尾复测变成「**71 / 23 / 4**」⇒ ⇒ 差在**并行会话同时在改
 * 源码与词表**（`tasks.priority` 那处内联默认调用在源码里不见了）⇒ ⇒
 * ⇒ **写进仓的读数必须是复测那一刻的**，不是插前那一刻的。
 *
 * ## 现在钉的是什么（**只承重这一族**）
 *
 * ① **每个内联默认的键，两份词表都必须有**（且值非空）⇒ ⇒ 兜底永远轮不到。
 * ② **这些键在英文词表里的值不许含中文** ⇒ ⇒ 兜底不是「翻译成中文」。
 * ③ **英文词表里除允许清单外不许出现中文** ⇒ ⇒ 清单之外的漏网中文也会红。
 *
 * ⚠️ **为什么只有三条**：**「键集完全一致 / 某个被引用的键缺不缺」那一族不归我管** ——
 * 那正是 `scripts/check-i18n-key-completeness.mjs`（并行会话那条「i18n 键完备」闸，
 * 已进 `.github/workflows/i18n-key-completeness.yml`）的活 ⇒ ⇒ 它抓「**被引用**的键
 * 在词表里有没有」⇒ ⇒ 本文件抓「**带内联默认**的键，英文译文对不对」⇒ ⇒
 * 两把尺子**并排但不同源**（别把两套揉成一套）⇒ ⇒ 同一族被两把尺子重复量，
 * 读数就不再是「两个独立的证据」。
 *
 * ⚠️ **正因如此，本文件的红绿只由这一族决定** —— 别的族红不红，去看那把闸。
 *
 * ⚠️ **允许清单是逐条写明理由的** —— 不是「扫到中文就放过」。
 *
 * ## ⚠️⚠️ 一条自用的纪律：expect 必须挂 matcher
 *
 * 本文件第一版有三条断言写成了 `expect(x, [], 'msg');`（**没挂 matcher**）⇒ ⇒
 * Vitest 里裸 `expect(value)` **什么都不断言** ⇒ ⇒ 那三条是**空断言** ⇒ ⇒
 * 反向验证（把英文词表里的一个键删掉）**照样绿** ⇒ ⇒ ⇒ **尺子没有牙，而它看起来是绿的**。
 * ⇒ ⇒ 判据写完必须先做一次**反向验证**：故意弄坏 ⇒ ⇒ 看它到底红不红。
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC_ROOT = join(REPO_ROOT, 'shadow-desktop', 'src');
const I18N_DIR = join(SRC_ROOT, 'i18n');

/**
 * **故意**留在英文词表里的中文 ⇒ ⇒ 逐条写明理由。
 *
 * - `layout.brandSubtitle` —— 品牌副标题就是「影」＝**产品名本身**（英文名是 Shadow，
 *   副标题是中文产品名 ⇒ 这是设计，不是漏译）。
 * - `conversation.companion.listeningForWakeWord` —— 唤醒词里**「你好影」是产品真有的**
 *   唤醒词（不是漏译成中文，而是把真有的唤醒词写出来）。
 * - `settings.zh-CN` —— 语言选项名（「中文」）要让人一眼认出。
 */
const ALLOWED_CJK_IN_EN = new Set([
  'layout.brandSubtitle',
  'conversation.companion.listeningForWakeWord',
  'settings.zh-CN',
]);

/**
 * 内联默认的形状：`t('key', '中文默认')`。
 *
 * ⚠️ **前面那个负向断言是有原因的**：朴素的 `/t\(/` 会把
 * `params.set('include_archived', 'true')` 这种**方法调用**也当成翻译调用
 * ⇒ ⇒ 判据会去词表里找一个叫 `include_archived` 的键 ⇒ ⇒ **假红**。
 */
const INLINE_DEFAULT_RE = /(?<![\w.])t\(\s*'([^']+)'\s*,\s*'([^']*)'/g;

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...collectSourceFiles(p));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

function flatten(obj: Record<string, unknown>, prefix = '', out: Record<string, string> = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? prefix + '.' + key : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value as Record<string, unknown>, path, out);
    } else {
      out[path] = String(value ?? '');
    }
  }
  return out;
}

function loadBundle(name: string): Record<string, string> {
  const raw = readFileSync(join(I18N_DIR, name + '.json'), 'utf8');
  return flatten(JSON.parse(raw) as Record<string, unknown>);
}

const zh = loadBundle('zh-CN');
const en = loadBundle('en-US');

/** 内联默认 ⇒ 键 → 默认值（＋ 出处文件）。 */
const inlineDefaults = new Map<string, { def: string; files: Set<string> }>();
for (const file of collectSourceFiles(SRC_ROOT)) {
  const text = readFileSync(file, 'utf8');
  INLINE_DEFAULT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_DEFAULT_RE.exec(text)) !== null) {
    const key = m[1];
    if (!inlineDefaults.has(key)) {
      inlineDefaults.set(key, { def: m[2], files: new Set<string>() });
    }
    inlineDefaults.get(key)!.files.add(relative(SRC_ROOT, file));
  }
}

const CJK = /[\u4e00-\u9fff]/;

describe('词表不许再漏键（英文界面那几行中文是从哪来的）', () => {
  it('每个内联中文默认的键 ⇒ 两份词表都必须有，且值非空', () => {
    const missing: string[] = [];
    const empty: string[] = [];
    for (const [key, info] of inlineDefaults) {
      const z = zh[key];
      const e = en[key];
      if (z === undefined || e === undefined) {
        missing.push(key + '（' + [...info.files].join(', ') + '）');
        continue;
      }
      if (z.trim() === '' || e.trim() === '') empty.push(key);
    }
    expect(
      missing,
      '这些键带着内联中文默认 ⇒ 词表里没有 ⇒ 英文界面显示中文兜底：\n' +
        missing.join('\n'),
    ).toEqual([]);
    expect(
      empty,
      '词表里的值不许是空串（空串＝界面上什么都不显示）：\n' + empty.join('\n'),
    ).toEqual([]);
  });

  it('这些键在英文词表里的值不许含中文（兜底不许是「翻译成中文」）', () => {
    const bad: string[] = [];
    for (const key of inlineDefaults.keys()) {
      const value = en[key];
      if (value !== undefined && CJK.test(value)) bad.push(key + ' ⇒ ' + value);
    }
    expect(
      bad,
      '英文词表里这几处还是中文：\n' + bad.join('\n'),
    ).toEqual([]);
  });

  it('英文词表里除允许清单外不许出现中文', () => {
    const bad = Object.keys(en).filter(
      (k) => CJK.test(en[k]) && !ALLOWED_CJK_IN_EN.has(k),
    );
    expect(
      bad,
      '英文词表里的漏网中文（不在允许清单里）：\n' +
        bad.map((k) => k + ' ⇒ ' + en[k]).join('\n'),
    ).toEqual([]);
  });
});
