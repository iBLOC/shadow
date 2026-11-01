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
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergedModules, routesIn, routesInText, surfaceRoutes } from './lib/telencephalon-routes.mjs';
// ⚠️ **门型的解析与判定只有一处** —— JS 这份是**镜像**（权威在端脑的
// `src/api/door.rs`）⇒ ⇒ 镜像与权威还对不对得上，由
// `scripts/check-door-policy-parity.mjs` 拿 **Rust 自己的用例表**逐条判。
import { parsePolicy, parsePolicyText, resolveDoor } from './lib/door-policy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

// ⚠️ 方法表与门型名表在 `scripts/lib/door-policy.mjs`（**一处实现** ⇒ 别再各抄一份）。

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

function selfTest(sourceRoot) {
  let failed = 0;
  const check = (name, ok) => {
    if (!ok) failed++;
    console.log('  ' + (ok ? '✅' : '❌') + ' ' + name);
  };
  console.log('判据自检：');

  // ⚠️ 夹具**就是一张门型表文本** ⇒ 与真实表**同形**（都过 parsePolicy）
  // ⇒ ⇒ 断言钉的是真实请求会走的那条路。
  //
  // ⚠️ 旧版的夹具是**手搓的字面量**（method: '*'）⇒ 而 parsePolicy 把 '*'
  // 归一成 null（= 任何方法）⇒ ⇒ 两边**形状不同** ⇒ 那条 '*' 门型在
  // resolveDoor 里**永远匹配不上**（拿 '*' 跟 'POST' 比）⇒ ⇒
  // ⇒ /api/flows/abc/validate 落到族规则 ⇒ admin ≠ open ⇒
  // ⇒ **这条自检从写出来那天起就是红的**（2026-11-01 实测：HEAD 原版
  // --self-test exit=1）⇒ ⇒ 没人跑它 ⇒ ⇒ 它守的东西没被守。
  const fixture = [
    '/api/flows POST admin',
    '/api/flows/* * auto',
    '/api/flows/*/validate * open',
    '/api/telencephalon/agents GET read',
    '/api/telencephalon/agents/* * auto',
  ].join('\n');
  const { entries: E, errors: fixtureErrors } = parsePolicyText(fixture);
  check('夹具本身解析零错', fixtureErrors.length === 0);

  check('精确路径赢过前缀', resolveDoor('/api/flows', 'POST', E).door === 'admin');
  check('validate（更具体）赢过族', resolveDoor('/api/flows/abc/validate', 'POST', E).door === 'open');
  check('族里的写 ⇒ admin（auto 派生）', resolveDoor('/api/flows/abc/run', 'POST', E).door === 'admin');
  check('族里的读 ⇒ read（auto 派生）', resolveDoor('/api/flows/abc', 'GET', E).door === 'read');
  check('精确的 GET 赢过族', resolveDoor('/api/telencephalon/agents', 'GET', E).door === 'read');
  check('没进门型表 ⇒ closed', resolveDoor('/nope', 'GET', E).door === 'closed');
  check('tail 通配也匹配零段', resolveDoor('/api/flows', 'GET', E).door === 'read');

  // 判据：**注释掉的** .route 不算「这条路由存在」⇒ ⇒ 否则有人把一段路由
  // 注释掉，闸还会以为它在 ⇒ ⇒ 门型表就多了一条「源码里没有的路由」。
  const commented = routesInText(
    [
      'fn r() -> Router {',
      '    Router::new()',
      '        .route("/api/live", get(h))',
      '        // .route("/api/dead", get(h2))',
      '}',
    ].join('\n'),
    '<selftest>',
  );
  check('注释掉的 .route 不算路由', commented.length === 1 && commented[0].path === '/api/live');

  // 再钉一次**真实表** —— 上面那组只验逻辑，这里验表本身没写歪。
  const policyPath = join(sourceRoot, 'src', 'api', 'door_policy.txt');
  if (existsSync(policyPath)) {
    const { entries: real, errors: realErrors } = parsePolicy(policyPath);
    check('真实表解析零错', realErrors.length === 0);
    check(
      '真实表：/api/flows/{id}/validate ⇒ open（表里显式开口的那条）',
      resolveDoor('/api/flows/abc/validate', 'POST', real).door === 'open',
    );
  } else {
    check('读得到真实门型表', false);
  }

  console.log(failed ? '❌ 自检有 ' + failed + ' 条红' : '✅ 自检全过');
  process.exit(failed ? 1 : 0);
}

const opts = parseArgs(process.argv.slice(2));
if (opts.selfTest) {
  selfTest(opts.source);
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
