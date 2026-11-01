/**
 * 端脑「实际路由表」的抽取 —— 一处实现，多处调用。
 *
 * ## 为什么抽出来
 *
 * 「端脑面上有哪些路由」这个事实**只有一个出处**：解析端脑**真正 merge 进
 * router** 的那批 .rs 文件（src/api/mod.rs 里 .merge(x::router…) 那一串）
 * ＋ src/flow/api/ 下的文件。
 *
 * ⚠️ **不是** src/api 下的全部文件 —— 有一批模块压根没被 merge（它们的
 * 路由不存在）⇒ 拿它们当「漏了」是假阳性。
 *
 * ⚠️ **解析必须跨行**：端脑里不少写法是
 *
 *     .route(
 *         "/api/telencephalon/providers",
 *         get(list_providers),
 *     )
 *
 * ⇒ ⇒ **按行 grep 会漏掉它们**（providers.rs 的 9 条全漏）⇒ ⇒
 * ⇒ 抽取器读**整个文件**再正则 ⇒ 跨行安全。
 *
 * ## 谁在用
 *
 * - scripts/check-door-policy.mjs —— 门型表完整性（端脑路由 ↔ 门型表）
 * - scripts/check-client-endpoint-map.mjs —— 客户端调用点 ↔ 端脑路由
 *
 * ⚠️ scripts/check-endpoint-matrix.mjs **故意不共用**：它抽的是 src/api 下的
 * **全部** .rs（判定表要覆盖 host 端才有的路由）⇒ 谓词不同 ⇒ 强行合并会把
 * 「假阳性」引进门闸。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Rust 的注释：块注释 + 行注释（引号数为奇数才算真注释）。 */
export function stripRustComments(text) {
  const noBlocks = text.replace(/\/\*[\s\S]*?\*\//g, '');
  return noBlocks
    .split('\n')
    .map((line) => {
      const i = line.indexOf('//');
      if (i === -1) return line;
      const quotes = (line.slice(0, i).match(/"/g) || []).length;
      if (quotes % 2 === 1) return line;
      return line.slice(0, i);
    })
    .join('\n');
}

/** api/mod.rs 里**真正 merge 进来**的模块名。 */
export function mergedModules(sourceRoot) {
  const modRs = readFileSync(join(sourceRoot, 'src', 'api', 'mod.rs'), 'utf8');
  const clean = stripRustComments(modRs);
  const mods = new Set();
  const re = /\.merge\(\s*([a-z0-9_]+)::/g;
  let m;
  while ((m = re.exec(clean)) !== null) mods.add(m[1]);
  return [...mods];
}

/** 一批 .rs 里的 .route("…")（路径 + **全部**方法）。 */
export function routesIn(file) {
  if (!existsSync(file)) return [];
  const text = readFileSync(file, 'utf8');
  const out = [];
  const re = /\.route\(\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const path = m[1];
    // ⚠️ 括号配对**必须从 .route( 的那个左括号开始数** ——
    // ⚠️ 若从路径字符串末尾开始，链式写法（get(h).post(h2)）的**第二个方法**
    // ⚠️ 会落在 span 之外 ⇒ ⇒ 那条路由只被记成 GET ⇒ ⇒ 它的 POST 变体
    // ⚠️ 在门型表里没人查 ⇒ ⇒ 「新增路由默认关」在链式写法上是**漏的**。
    // （2026-11-01 实测：海马体 /api/tasks 的 POST 因此消失；端脑路由数
    //   126 是**少算**的。）
    let i = m.index + '.route'.length;
    let depth = 0;
    let end = text.length;
    for (; i < text.length; i++) {
      const c = text[i];
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    const call = text.slice(m.index, end + 1);
    const methods = new Set();
    const mre = /\b(get|post|put|delete|patch|head)\s*\(/g;
    let x;
    while ((x = mre.exec(call)) !== null) methods.add(x[1].toUpperCase());
    if (methods.size === 0) methods.add('GET');
    for (const method of methods) {
      out.push({ path, method, file: file });
    }
  }
  return out;
}

/** 端脑面上**实际存在**的路由（路径 + 方法 + 出处文件）。 */
export function surfaceRoutes(sourceRoot) {
  const out = [];
  for (const mod of mergedModules(sourceRoot)) {
    out.push(...routesIn(join(sourceRoot, 'src', 'api', mod + '.rs')));
  }
  const flowDir = join(sourceRoot, 'src', 'flow', 'api');
  if (existsSync(flowDir)) {
    for (const e of readdirSync(flowDir)) {
      if (e.endsWith('.rs')) out.push(...routesIn(join(flowDir, e)));
    }
  }
  const seen = new Set();
  return out.filter((r) => {
    const k = r.method + ' ' + r.path;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
