#!/usr/bin/env node
/**
 * 门型表的完整性闸 —— 「端脑面新增路由默认关」的守卫。
 *
 * ## 为什么要有这个闸
 *
 * 端脑面（telencephalon/src/api/mod.rs 合并出来的那张面）现在有
 * **一层门**（src/api/door.rs）+ **一张机器可读的门型表**
 * （src/api/door_policy.txt）。
 *
 * 表的规矩是：**匹配不到任何一条 ⇒ 关着（403）** ⇒ ⇒ 新增路由**默认关**
 * ⇒ 必须显式开口。
 *
 * ⚠️ 这条规矩只有**机器**盯着才成立 —— 人肉列一定会漏 ⇒ 而漏了不会报错
 * （那条路由只是安安静静地 403 掉 ⇒ 用户看到的是「功能坏了」，
 * 不是「你忘了开口」）。
 *
 * ## 比什么
 *
 * - **源码侧**：解析端脑**实际合并进 router** 的那批文件 —— 不是
 *   src/api 下的全部文件（有一批模块压根没被 merge ⇒ 它们的路由不存在
 *   ⇒ 拿它们当「漏了」是假阳性）。
 * - **表侧**：解析 door_policy.txt。
 *
 * ## 判定
 *
 * - **有路由没进门型表** ⇒ 退出码 1。
 * - 表里有、源码里没有的条目 ⇒ 只报告，不失败（表可以先写后接）。
 * - 表里有一行写得不对（字段数 / 方法名 / 门型名）⇒ 退出码 1。
 *
 * ## 用法
 *
 *   node scripts/check-door-policy.mjs
 *   node scripts/check-door-policy.mjs --source C:\Projects\iBLOC\telencephalon
 *   node scripts/check-door-policy.mjs --self-test
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', '*']);
const DOORS = new Set(['open', 'read', 'admin', 'owner', 'auto']);

function parseArgs(argv) {
  const opts = { source: resolve(REPO, '..', 'telencephalon'), selfTest: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source') opts.source = resolve(argv[++i]);
    else if (argv[i] === '--self-test') opts.selfTest = true;
    else if (argv[i] === '-h' || argv[i] === '--help') {
      console.log('用法: node scripts/check-door-policy.mjs [--source <telencephalon 路径>] [--self-test]');
      process.exit(0);
    } else {
      console.error('不认识的参数: ' + argv[i]);
      process.exit(2);
    }
  }
  return opts;
}

/** Rust 的注释：块注释 + 行注释（引号数为奇数才算真注释）。 */
function stripRustComments(text) {
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
function mergedModules(sourceRoot) {
  const modRs = readFileSync(join(sourceRoot, 'src', 'api', 'mod.rs'), 'utf8');
  const clean = stripRustComments(modRs);
  const mods = new Set();
  const re = /\.merge\(\s*([a-z0-9_]+)::/g;
  let m;
  while ((m = re.exec(clean)) !== null) mods.add(m[1]);
  return [...mods];
}

/** 一批 .rs 里的 .route("…")（路径 + **全部**方法）。 */
function routesIn(file) {
  if (!existsSync(file)) return [];
  const text = readFileSync(file, 'utf8');
  const out = [];
  const re = /\.route\(\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const path = m[1];
    let i = m.index + m[0].length - 1;
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

function surfaceRoutes(sourceRoot) {
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

function parsePolicy(policyPath) {
  const raw = readFileSync(policyPath, 'utf8');
  const entries = [];
  const errors = [];
  raw.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const parts = t.split(/\s+/);
    if (parts.length !== 3) {
      errors.push('line ' + (i + 1) + ': expected 3 fields, got ' + parts.length + ' :: ' + t);
      return;
    }
    const pattern = parts[0];
    const method = parts[1];
    const door = parts[2];
    if (!METHODS.has(method)) {
      errors.push('line ' + (i + 1) + ': unknown method ' + method);
      return;
    }
    if (!DOORS.has(door)) {
      errors.push('line ' + (i + 1) + ': unknown door ' + door);
      return;
    }
    const segments = pattern.split('/').filter(Boolean);
    if (segments.length === 0) {
      errors.push('line ' + (i + 1) + ': empty path pattern');
      return;
    }
    entries.push({
      segments,
      tailWildcard: segments[segments.length - 1] === '*',
      method: method === '*' ? null : method,
      door,
      line: i + 1,
    });
  });
  return { entries, errors };
}

function matchesPath(e, segs) {
  if (e.tailWildcard) {
    const prefix = e.segments.slice(0, -1);
    if (segs.length < prefix.length) return false;
    return prefix.every((p, i) => p === '*' || p === segs[i]);
  }
  if (segs.length !== e.segments.length) return false;
  return e.segments.every((p, i) => p === '*' || p === segs[i]);
}

/** 与端脑 src/api/door.rs 的 more_specific **逐条对齐**。 */
function moreSpecific(c, cur) {
  const cl = c.segments.filter((s) => s !== '*').length;
  const rl = cur.segments.filter((s) => s !== '*').length;
  if (cl !== rl) return cl > rl;
  const cw = c.segments.length - cl;
  const rw = cur.segments.length - rl;
  if (cw !== rw) return cw < rw;
  const cm = c.method !== null;
  const rm = cur.method !== null;
  if (cm !== rm) return cm;
  if (c.segments.length !== cur.segments.length) return c.segments.length > cur.segments.length;
  return c.line < cur.line;
}

function resolveDoor(path, method, entries) {
  const segs = path.split('/').filter(Boolean);
  let best = null;
  for (const e of entries) {
    if (e.method !== null && e.method !== method) continue;
    if (!matchesPath(e, segs)) continue;
    if (!best || moreSpecific(e, best)) best = e;
  }
  if (!best) return { door: 'closed', line: null };
  let door = best.door;
  if (door === 'auto') {
    door = method === 'GET' || method === 'HEAD' ? 'read' : 'admin';
  }
  return { door, line: best.line };
}

function selfTest() {
  let failed = 0;
  const check = (name, ok) => {
    if (!ok) failed++;
    console.log('  ' + (ok ? '✅' : '❌') + ' ' + name);
  };
  console.log('判据自检：');
  const E = [
    { segments: ['api', 'flows'], tailWildcard: false, method: 'POST', door: 'admin', line: 1 },
    { segments: ['api', 'flows', '*'], tailWildcard: true, method: null, door: 'auto', line: 2 },
    { segments: ['api', 'flows', '*', 'validate'], tailWildcard: false, method: '*', door: 'open', line: 3 },
    { segments: ['api', 'telencephalon', 'agents'], tailWildcard: false, method: 'GET', door: 'read', line: 4 },
    { segments: ['api', 'telencephalon', 'agents', '*'], tailWildcard: true, method: null, door: 'auto', line: 5 },
  ];
  check('精确路径赢过前缀', resolveDoor('/api/flows', 'POST', E).door === 'admin');
  check('validate（更具体）赢过族', resolveDoor('/api/flows/abc/validate', 'POST', E).door === 'open');
  check('族里的写 ⇒ admin（auto 派生）', resolveDoor('/api/flows/abc/run', 'POST', E).door === 'admin');
  check('族里的读 ⇒ read（auto 派生）', resolveDoor('/api/flows/abc', 'GET', E).door === 'read');
  check('精确的 GET 赢过族', resolveDoor('/api/telencephalon/agents', 'GET', E).door === 'read');
  check('没进门型表 ⇒ closed', resolveDoor('/nope', 'GET', E).door === 'closed');
  check('tail 通配也匹配零段', resolveDoor('/api/flows', 'GET', E).door === 'read');
  console.log(failed ? '❌ 自检有 ' + failed + ' 条红' : '✅ 自检全过');
  process.exit(failed ? 1 : 0);
}

const opts = parseArgs(process.argv.slice(2));
if (opts.selfTest) {
  selfTest();
} else {
  const policyPath = join(opts.source, 'src', 'api', 'door_policy.txt');
  if (!existsSync(policyPath)) {
    console.error('读不到门型表: ' + policyPath);
    process.exit(2);
  }
  const routes = surfaceRoutes(opts.source);
  if (routes.length === 0) {
    console.error('在 ' + opts.source + ' 里解析出 0 条路由 —— 这不是「表覆盖了」，是解析器坏了。');
    process.exit(2);
  }
  const { entries, errors } = parsePolicy(policyPath);
  if (errors.length > 0) {
    console.log('门型表本身有问题：');
    for (const e of errors) console.log('  ✘ ' + e);
    process.exit(1);
  }
  const uncovered = [];
  const counts = {};
  for (const r of routes) {
    const d = resolveDoor(r.path, r.method, entries);
    counts[d.door] = (counts[d.door] || 0) + 1;
    if (d.door === 'closed') uncovered.push(r);
  }
  console.log('端脑面（合并后的 router）：' + routes.length + ' 条路由');
  console.log('门型表：' + policyPath);
  console.log('  解析出 ' + entries.length + ' 条规则');
  const order = ['open', 'read', 'admin', 'owner', 'closed'];
  console.log('  门型分布：' + order.map((k) => k + ' ' + (counts[k] || 0)).join(' / '));
  if (uncovered.length === 0) {
    console.log('');
    console.log('✔ 每一条路由都进门型表了 ⇒ 没有「静默敞开」也没有「静默关掉」。');
    process.exit(0);
  }
  console.log('');
  console.log('⚠️ ' + uncovered.length + ' 条路由**没有进门型表** ⇒ 它们默认关着（403）：');
  for (const r of uncovered) {
    console.log('  ' + r.method.padEnd(7) + r.path + '    ← ' + r.file);
  }
  console.log('');
  console.log('⇒ ⇒ 在 ' + policyPath + ' 里给它们显式开口（或补一条族规则）。');
  process.exit(1);
}
