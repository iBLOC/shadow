#!/usr/bin/env node
/**
 * 「E2E trace 里的凭据取证」判定闸 —— 端脑那扇门在 CI 上到底**有没有**收到凭据。
 * ============================================================================
 *
 * ## 守什么
 *
 * Playwright 的 trace（`0-trace.network`）逐行记着每个请求的**方法 ＋ URL ＋
 * 状态码 ＋ 请求头** ⇒ ⇒ 它是**请求级取证通道** ⇒ ⇒ 「门有没有收到凭据」
 * **不必**等端脑加请求级日志就能判。
 *
 * · **R1（形状）**：打向端脑**凭据面**（`/shadow/v1/*` ＋ `/api/telencephalon/*`）
 *   的请求**必须带** `x-admin-token` 或 `x-shadow-key` ⇒ ⇒ 不带 ⇒ ⇒ 红；
 * · **R2（门）**：那些请求**被答 401** ⇒ ⇒ 红。
 *
 * ## 为什么值得有这道闸（2026-11-05 真机实测）
 *
 * · 真实事故：仓里那份 `playwright.config.ts` 把两个凭据头 **spread 到 `use` 的
 *   顶层** ⇒ ⇒ Playwright **既不报错也不告警** ⇒ ⇒ **一个头都发不出去** ⇒ ⇒ 端脑
 *   一律 401 ⇒ ⇒ CI 上那批红**长得像**鉴权失败，其实是**配置形状错了**；
 * · 代价：那一轮**所有**打向端脑的请求全是 401（trace 实测 **53 条**）⇒ ⇒ 每一
 *   条红都是它的下游 ⇒ ⇒ 各自的真根因**一个都没被走到**；
 * · ⇒ ⇒ 这道闸把「门有没有收到凭据」变成**会红的读数** ⇒ ⇒ 下一次同类形状
 *   漂移**当场变红**，不必再靠人解析 trace 才发现。
 *
 * ## 退出码
 *
 * · `0` —— 全绿（或**没有失败用例** ⇒ ⇒ 没有 trace ⇒ ⇒ 这一格不适用）；
 * · `1` —— 有红；`2` —— 判不了（目标目录都不在 ⇒ ⇒ 连跑没跑都不知道）。
 *
 * ## 用法
 *
 * ```powershell
 * node scripts/check-e2e-trace-credentials.mjs --dir <trace 目录>   # 判定
 * node scripts/check-e2e-trace-credentials.mjs --self-test          # 自检
 * ```
 */
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeNetworkText, violationsOf } from './lib/e2e-trace-credentials.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DEFAULT_DIR = join(REPO, 'shadow-desktop', 'test-results');

function collectNetworkFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  const walk = (d) => {
    let entries = [];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.network')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

export function judgeFiles(files, opts = {}) {
  let considered = 0, credentialed = 0, missing = 0, unauthorized = 0, total = 0;
  const violations = [];
  for (const f of files) {
    const j = judgeNetworkText(readFileSync(f, 'utf8'), opts);
    total += j.total;
    considered += j.considered;
    credentialed += j.credentialed;
    missing += j.missing;
    unauthorized += j.unauthorized;
    for (const v of violationsOf(j)) violations.push({ ...v, file: f });
  }
  return { total, considered, credentialed, missing, unauthorized, violations, files: files.length };
}

function selfTest() {
  let pass = 0, fail = 0;
  const check = (name, cond, detail = '') => {
    if (cond) { pass += 1; console.log(`  [PASS] ${name}`); }
    else { fail += 1; console.log(`  [FAIL] ${name} ${detail}`); }
  };

  // ⚠️⚠️ **夹具必须用「真实面的形状」** —— 真实 trace 里 `request.headers` 是
  //    **数组** `[{name,value},…]`（2026-11-05 真机实测逐字读到）⇒ ⇒ 旧夹具用
  //    **对象**形状 ⇒ ⇒ **夹具形状 ≠ 真实面形状** ⇒ ⇒ 自检绿、真机红（**假红**）
  //    ⇒ ⇒ 这条「形状纪律」本身就是承重判据，不是洁癖。
  const hdrArr = (o) => Object.entries(o).map(([name, value]) => ({ name, value }));
  const snap = (method, url, status, headers) =>
    JSON.stringify({ snapshot: { request: { method, url, headers: hdrArr(headers) }, response: { status } } });
  const BRAIN = 'http://127.0.0.1:60080';
  const KEY = { 'x-admin-token': 'k', 'x-shadow-key': 'k' };

  // ✅ **正控**：真实面形状（数组）＋ 带凭据 ⇒ ⇒ 零违规
  //    （旧闸在这里会红 ⇒ ⇒ 这条夹具**承重**：它能被那道修复证伪）
  // ✅ 兼容：有的工具写**对象** ⇒ ⇒ 也必须认
  const objectShape = JSON.stringify({
    snapshot: { request: { method: 'GET', url: BRAIN + '/shadow/v1/agents', headers: KEY }, response: { status: 200 } },
  });
  // ⚠️ 只带**非凭据**头 ⇒ ⇒ 仍红（「有头」≠「带凭据」）
  const otherHeader = snap('GET', BRAIN + '/shadow/v1/agents', 401, { 'content-type': 'application/json' });

  // ✅ 正确形状：带凭据、答 200
  const good = [
    snap('GET', BRAIN + '/shadow/v1/agents', 200, KEY),
    snap('POST', BRAIN + '/api/telencephalon/agents/temporal/config', 200, KEY),
  ].join('\n');

  // ⚠️ **真实事故夹具** —— 无凭据 + 401（就是旧 run 的形状）
  const accident = [
    snap('GET', BRAIN + '/shadow/v1/agents', 401, {}),
    snap('POST', BRAIN + '/shadow/v1/conversations', 401, {}),
  ].join('\n');

  // 无凭据但状态码没暴露（形状 bug 的另一张脸）
  const silent = snap('GET', BRAIN + '/shadow/v1/agents', 200, {});

  // 带凭据却被答 401 ⇒ ⇒ 钥匙不对 / 门另有规则
  const wrongKey = snap('GET', BRAIN + '/shadow/v1/agents', 401, KEY);

  // 不该算进来的：别的面 ＋ 被 mock 的 401
  const unrelated = [
    snap('GET', 'http://127.0.0.1:4173/api/whatever', 401, {}),
    snap('GET', BRAIN + '/models/providers', 401, {}),
    snap('GET', BRAIN + '/v1/models', 401, {}),
  ].join('\n');

  const g = judgeNetworkText(good);
  const a = judgeNetworkText(accident);
  const s = judgeNetworkText(silent);
  const w = judgeNetworkText(wrongKey);
  const u = judgeNetworkText(unrelated);

  check('正确形状 ⇒ 零违规', violationsOf(g).length === 0, JSON.stringify(violationsOf(g)));
  check('事故夹具 ⇒ 恰好 4 条红（2 无凭据 ＋ 2 个 401）', violationsOf(a).length === 4, String(violationsOf(a).length));
  check('事故夹具 ⇒ 无凭据 2 条 ＋ 401 两条', a.missing === 2 && a.unauthorized === 2, a.missing + '/' + a.unauthorized);
  check('无凭据但 200 ⇒ 仍红（形状 bug 不靠状态码暴露）', violationsOf(s).length === 1, String(violationsOf(s).length));
  check('带凭据却被答 401 ⇒ 仍红（门另有规则）', violationsOf(w).length === 1, String(violationsOf(w).length));
  check('别的面 / 被 mock 的 401 ⇒ 不误报', violationsOf(u).length === 0, JSON.stringify(violationsOf(u)));
  check('正控：真实面形状（数组）＋ 带凭据 ⇒ 零违规', violationsOf(g).length === 0, JSON.stringify(violationsOf(g)));
  check('兼容：对象形状也认', violationsOf(judgeNetworkText(objectShape)).length === 0, JSON.stringify(violationsOf(judgeNetworkText(objectShape))));
  check('只带非凭据头 ⇒ 仍红（缺凭据 ＋ 401）', violationsOf(judgeNetworkText(otherHeader)).length === 2, String(violationsOf(judgeNetworkText(otherHeader)).length));

  console.log(`  判据自检：${pass}/${pass + fail}`);
  return fail === 0;
}

const arg = process.argv[2];
if (arg === '--self-test') { process.exit(selfTest() ? 0 : 1); }

let dir = DEFAULT_DIR;
const di = process.argv.indexOf('--dir');
if (di >= 0 && process.argv[di + 1]) dir = resolve(process.argv[di + 1]);
if (!existsSync(dir)) {
  console.error('❌ trace 目录不在 ⇒ ⇒ 判不了（退出码 2）：' + dir);
  process.exit(2);
}

const files = collectNetworkFiles(dir);
if (files.length === 0) {
  console.log('✅ 零违规（没有 trace ⇒ ⇒ 没有失败用例 ⇒ ⇒ 这一格不适用：0 条请求）');
  process.exit(0);
}

const r = judgeFiles(files);
if (r.violations.length === 0) {
  console.log(`✅ 零违规（端脑凭据面请求 ${r.considered} 条：带凭据 ${r.credentialed} 条、无凭据 ${r.missing} 条、401 ${r.unauthorized} 条；扫了 ${r.files} 个 trace 文件）`);
  process.exit(0);
}
for (const v of r.violations) {
  console.log(`❌ [${v.kind}] ${v.row.method} ${v.row.path} → ${v.row.status}：${v.message}`);
}
console.log(`⚠️ 端脑凭据面请求 ${r.considered} 条：带凭据 ${r.credentialed} 条、**无凭据 ${r.missing} 条**、**401 ${r.unauthorized} 条**（扫了 ${r.files} 个 trace 文件）`);
process.exit(1);