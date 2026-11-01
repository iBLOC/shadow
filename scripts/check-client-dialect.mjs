/**
 * 客户端方言闸 —— 「客户端期望的响应形状」×「端脑这一面的实际形状」。
 *
 * ## 它盯的是什么
 *
 * 桌面端有**两个** client 打**同一台端脑**（`lib/platform.ts` 自己写着：
 * `prefrontalUrl()` 其实是端脑的地址）：
 *   - `lib/telencephalonClient.ts` —— **端脑方言**：裸体；
 *   - `lib/prefrontalClient.ts`    —— **prefrontal 独立仓方言**：`{success,data}` 信封。
 * ⇒ ⇒ 「路径对得上、方法对得上」**不等于**「响应形状对得上」。
 *
 * 端脑这一面**压根没有信封**（机器可判的前提 ⇒ `scripts/lib/response-shape.mjs`）
 * ⇒ ⇒ 所以「客户端硬要信封 ＋ 打的确实是端脑面上真实存在的那条路由」⇒ ⇒ **必炸**
 * （`env.success` 是 undefined ⇒ 抛错）⇒ ⇒ 那是真缺陷 ⇒ ⇒ 红。
 *
 * ## 退出码
 *
 *   0 —— 没有「硬要信封却打端脑真实路由」的调用点
 *   1 —— 有（**真缺陷**：客户端解析必炸）
 *   2 —— **判不了**（端脑源码不在 ⇒ 前提算不出来 ⇒ 宁可不判，也不猜）
 *
 * ## 两条纪律
 *
 * ⚠️ **保守方向**：宁可漏报，不误报 —— 前提（端脑面有没有信封）判错 ⇒ ⇒ 假红
 * ⇒ ⇒ 而「红」比漏报更坑（会让人去改已经改对的代码 ⇒ ⇒ 引入新 bug）。
 * ⚠️ **路径先于形状**：路径对不上 ⇒ ⇒ **先 404** ⇒ ⇒ 形状轮不到 ⇒ ⇒ 那些
 * 只**报告**（它们归对照表管：missing / outer）。
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { surfaceRoutes } from './lib/telencephalon-routes.mjs';
import {
  clientShapeSites,
  samePath,
  envelopePremiseInTexts,
  telencephalonEnvelopePremise,
} from './lib/response-shape.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

/** 客户端源码（测试文件不算调用点）。 */
function clientFiles() {
  const out = [];
  walk(join(REPO, 'shadow-desktop', 'src'), out, (f) =>
    /\.tsx?$/.test(f) && !/[\\/]__tests__[\\/]/.test(f) && !/\.test\.tsx?$/.test(f));
  walk(join(REPO, 'shadow-mobile', 'lib'), out, (f) =>
    f.endsWith('.dart') && !f.endsWith('_test.dart'));
  return out;
}

function walk(dir, out, keep) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out, keep);
    else if (keep(full)) out.push(full);
  }
  return out;
}

/**
 * 判定（**纯函数** ⇒ 自检能逐条钉住它）。
 *
 * @param sites       客户端「每一发期望什么形状」
 * @param routes      端脑面上真实存在的路由（路径 + 方法）
 * @param hasEnvelope 端脑这一面有没有 `{success,data}` 信封（**前提**）
 */
export function judge(sites, routes, hasEnvelope) {
  const reds = [];
  const reports = [];
  for (const s of sites) {
    if (!s.strict || s.tolerant) continue;
    const hit = routes.find((r) => r.method === s.method && samePath(r.path, s.path));
    if (!hit) {
      reports.push({ ...s, why: '端脑没有这条路由 ⇒ 先 404 ⇒ 形状轮不到（归对照表管）' });
      continue;
    }
    if (hasEnvelope) {
      reports.push({ ...s, why: '端脑面有信封 ⇒ 这一发解析得通' });
      continue;
    }
    reds.push({ ...s, serverPath: hit.path });
  }
  return { reds: reds, reports: reports };
}

function rel(f) {
  return relative(REPO, f).split('\\').join('/');
}

function dumpOne(file) {
  const full = resolve(REPO, file);
  if (!existsSync(full)) {
    console.error('文件不在：' + file);
    return 2;
  }
  const kind = full.endsWith('.dart') ? 'dart' : 'ts';
  const sites = clientShapeSites(readFileSync(full, 'utf8'), kind);
  console.log(file + ' —— ' + sites.length + ' 个调用点');
  for (const s of sites) {
    console.log('  ' + s.method + ' ' + s.path + '  形状=' +
      (s.tolerant ? '两种都认' : s.strict ? '硬要信封' : '裸体') + '  行 ' + s.line);
  }
  return 0;
}

function main(argv) {
  const opts = { source: resolve(REPO, '..', 'telencephalon') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source') opts.source = resolve(argv[++i]);
    else if (argv[i] === '--self-test') opts.selfTest = true;
    else if (argv[i] === '--dump') opts.dump = argv[++i];
  }
  if (opts.selfTest) return selfTest();
  if (opts.dump) return dumpOne(opts.dump);

  if (!existsSync(join(opts.source, 'src'))) {
    console.error('判不了：端脑源码不在 ' + opts.source + '（用 --source 指定）');
    return 2;
  }

  const premise = telencephalonEnvelopePremise(opts.source);
  const routes = surfaceRoutes(opts.source).map((r) => ({ path: r.path, method: r.method }));
  const sites = [];
  for (const f of clientFiles()) {
    const kind = f.endsWith('.dart') ? 'dart' : 'ts';
    const text = readFileSync(f, 'utf8');
    for (const s of clientShapeSites(text, kind)) sites.push({ ...s, file: rel(f) });
  }

  const verdict = judge(sites, routes, premise.hasEnvelope);

  console.log('客户端方言闸 —— 「客户端期望的响应形状」×「端脑这一面的实际形状」');
  console.log('  端脑路由 ' + routes.length + ' 条 · 客户端调用点 ' + sites.length + ' 个');
  console.log('  前提：端脑这一面' + (premise.hasEnvelope
    ? '**有** `{success,data}` 信封 ⇒ 客户端要信封不算错'
    : '**没有** `{success,data}` 信封 ⇒ 客户端硬要信封 ⇒ 必炸'));
  if (premise.hasEnvelope) {
    for (const e of premise.envelopes) {
      console.log('        · ' + e.kind + ' ' + (e.name || '') + '  ' + rel(e.file));
    }
  }
  console.log('  ⇒ 红 ' + verdict.reds.length + ' / 报告 ' + verdict.reports.length);
  for (const r of verdict.reds) {
    console.log('  🔴 ' + r.file + ':' + r.line + '  ' + r.method + ' ' + r.path +
      '  —— 端脑的 ' + r.serverPath + ' 返裸体，而这一发硬要信封 ⇒ 解析必炸');
  }
  for (const r of verdict.reports) {
    console.log('  ⚪ ' + r.file + ':' + r.line + '  ' + r.method + ' ' + r.path + '  —— ' + r.why);
  }
  return verdict.reds.length > 0 ? 1 : 0;
}

function selfTest() {
  let fail = 0;
  let total = 0;
  const ok = (name, cond) => {
    total++;
    if (cond) console.log('  ✓ ' + name);
    else { console.log('  ✗ ' + name); fail++; }
  };

  const tsStrict = [
    'async listSessions(): Promise<X[]> {',
    "  const env = await this.request<ApiEnvelope<X[]>>('/api/sessions');",
    "  if (!env.success) throw new Error(env.error || 'boom');",
    '  return env.data!;',
    '}',
  ].join('\n');
  const s1 = clientShapeSites(tsStrict, 'ts');
  ok('TS：ApiEnvelope 泛型 ⇒ 硬要信封', s1.length === 1 && s1[0].strict === true &&
    s1[0].path === '/api/sessions' && s1[0].method === 'GET');

  const tsTolerant = [
    'async listSessions() {',
    "  const body = await this.request<X[]>('/api/sessions');",
    "  return unwrapEnvelope<X[]>(body, 'boom');",
    '}',
  ].join('\n');
  const s2 = clientShapeSites(tsTolerant, 'ts');
  ok('TS：unwrapEnvelope ⇒ 两种都认', s2.length === 1 && s2[0].tolerant === true && s2[0].strict === false);

  const s3 = clientShapeSites("const r = await this.request<X>('/api/sessions');", 'ts');
  ok('TS：裸体 ⇒ 不算硬要信封', s3.length === 1 && s3[0].strict === false);

  const dartStrict = [
    "final data = await _request<Map<String, dynamic>>('GET', '/api/soul/\$agentId');",
    "if (data['success'] == true && data['data'] != null) {",
    "  return SoulResponse.fromJson(data['data']);",
    '}',
  ].join('\n');
  const s4 = clientShapeSites(dartStrict, 'dart');
  ok("Dart：data['success'] ⇒ 硬要信封 ＋ 路径归一化", s4.length === 1 && s4[0].strict === true &&
    s4[0].path === '/api/soul/{param}' && s4[0].method === 'GET');

  ok('同形：{id} ≡ {session_id}', samePath('/api/sessions/{param}', '/api/sessions/{session_id}'));
  ok('不同形：{id} ≢ /api/sessions', !samePath('/api/sessions/{param}', '/api/sessions'));

  const p1 = envelopePremiseInTexts([{ file: 'x.rs', text: 'struct Env { success: bool, data: String }' }]);
  ok('前提：struct 带 success+data ⇒ 判成「有信封」', p1.hasEnvelope === true);
  const p2 = envelopePremiseInTexts([{ file: 'y.rs', text: 'struct R { success: bool, requires_restart: bool }' }]);
  ok('前提：success 是业务字段 ⇒ 判成「没有信封」', p2.hasEnvelope === false);

  const routes = [
    { path: '/api/sessions', method: 'GET' },
    { path: '/api/sessions/{session_id}', method: 'GET' },
  ];
  const strictSite = { method: 'GET', path: '/api/sessions', strict: true, tolerant: false };
  ok('判定：硬要信封 + 打的是端脑真实路由 + 端脑无信封 ⇒ 红',
    judge([strictSite], routes, false).reds.length === 1);
  ok('判定：端脑面有信封 ⇒ 只报告', judge([strictSite], routes, true).reds.length === 0);
  ok('判定：端脑没这条路由 ⇒ 只报告（404 先发生）',
    judge([{ method: 'GET', path: '/api/soul/{param}', strict: true, tolerant: false }], routes, false).reds.length === 0);
  ok('判定：两种都认 ⇒ 不红',
    judge([{ method: 'GET', path: '/api/sessions', strict: true, tolerant: true }], routes, false).reds.length === 0);
  ok('判定：裸体 ⇒ 不红',
    judge([{ method: 'GET', path: '/api/sessions', strict: false, tolerant: false }], routes, false).reds.length === 0);

  console.log(fail === 0 ? '自检全绿（' + total + ' 条）' : '自检红 ' + fail + ' 条');
  return fail === 0 ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));