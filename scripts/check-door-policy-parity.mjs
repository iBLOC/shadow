#!/usr/bin/env node
/**
 * 跨语言一致性闸 —— **JS 镜像 vs 端脑 Rust 权威**
 *
 * ## 为什么要有这个闸
 *
 * 端脑的门型判定住在 **Rust**（`src/api/door.rs`：`PolicyEntry::parse` /
 * `matches_path` / `more_specific` / `resolve`）⇒ ⇒ 那是**权威**。
 * 而本仓的闸要能在**不编 Rust** 的前提下回答「这条路由归哪扇门」
 * ⇒ ⇒ 所以有一份 **JS 镜像**（`scripts/lib/door-policy.mjs`）。
 *
 * ⚠️⚠️ **两份实现迟早会漂** ⇒ ⇒ 而漂了之后端脑的闸会**判错门型**
 * （可能把一条**该关的路由**报成「已覆盖」⇒ 「新增路由默认关」这条规矩就废了）。
 * ⇒ ⇒ **各写一份不是问题，「没人判它俩一不一致」才是问题。**
 *
 * ## 两条腿
 *
 * ① **权威用例**（机器抽出来的）：Rust 自己的 `mod tests` 里那些
 *    `door_of(path, method) == Door::X` 断言 ⇒ ⇒ 那是**语义规格**
 *    ⇒ ⇒ 本闸把它们**逐条**喂给 JS 镜像 ⇒ ⇒ 不一致就红。
 * ② **规格用例**（转写 + 带锚点）：⚠️ 权威那 27 条**没覆盖到全部分支**
 *    （实测：削弱「方法写死的更具体」与「尾通配匹配零段」⇒ 那 27 条**一条都不红**
 *    ⇒ ⇒ 也就是说它守不住那两支）⇒ ⇒ 所以补一组**规格用例**：
 *    期望值从权威的**源码/文档**转写 ⇒ ⇒ 每条都带一个 `anchor`
 *    （权威源码里必须**仍然存在**的那段文字/代码）⇒ ⇒ 权威一改
 *    ⇒ ⇒ anchor 对不上 ⇒ ⇒ **判不了** ⇒ ⇒ 逼人重新转写
 *    ⇒ ⇒ 规格用例不会悄悄腐掉。
 *
 * ⚠️ **不许静默跳过**：Rust 里的 `door_of(` 调用数 ≠ 抽出的用例数 ⇒ ⇒
 * **判不了** ⇒ ⇒ 退出码 2（不许当绿）。
 *
 * ## 用法
 *
 *   node scripts/check-door-policy-parity.mjs
 *   node scripts/check-door-policy-parity.mjs --source C:\Projects\iBLOC\telencephalon
 *   node scripts/check-door-policy-parity.mjs --self-test
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePolicyText, resolveDoor } from './lib/door-policy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

/**
 * 端脑仓的位置 —— **两种布局都要认**（2026-11-09 接 CI 时实测）：
 *   · A（本机）：兄弟仓在 shadow 仓**之外**（`../telencephalon`）
 *   · B（CI）：兄弟仓被 checkout 到 shadow 仓根**之下**（`telencephalon/`）
 *
 * ⚠️ 只认 A ⇒ ⇒ CI 上「读不到判据源」⇒ ⇒ 退出码 2「判不了」⇒ ⇒ **CI 恒红**
 *   ⇒ ⇒ 那红的是**布局层**不是判据层（同 check-ziti-face.mjs /
 *   check-secret-plaintext.mjs 的 `sibling()`）。
 */
function sibling(name) {
  const outside = resolve(REPO, '..', name);
  if (existsSync(outside)) return outside;
  return join(REPO, name);
}

/** Rust 的门型名 ⇒ JS 这边的门型名（`resolve()` 派生后不会是 auto）。 */
const DOOR_NAMES = {
  Open: 'open',
  Read: 'read',
  Admin: 'admin',
  Owner: 'owner',
  Closed: 'closed',
};

/**
 * 规格用例 —— **算法**的分支（权威自己那批用例没覆盖到的那些）。
 *
 * ⚠️ `table: null` ⇒ 用**真实表**；给字符串 ⇒ 用这张**合成表**。
 * ⚠️ `anchor` ⇒ 权威源码里必须仍然存在的那段文字/代码
 * ⇒ ⇒ 权威一改 ⇒ ⇒ 对不上 ⇒ ⇒ **判不了** ⇒ ⇒ 逼人重新转写期望值。
 */
const SPEC_CASES = [
  {
    name: '方法写死的规则赢过方法通配的（字面段 / 通配段 / 段数都相同时）',
    table: ['/p GET read', '/p * admin'].join('\n'),
    path: '/p',
    method: 'GET',
    expect: 'read',
    anchor: '方法写死的',
    why: 'door.rs 的 more_specific 文档：顺序 = 字面段多的 ⇒ 通配段少的 ⇒ 方法写死的 ⇒ 段数多的 ⇒ 文件里靠前的',
  },
  {
    name: '尾通配「可以为零段」⇒ /shadow/v1 命中 /shadow/v1/*',
    table: null,
    path: '/shadow/v1',
    method: 'GET',
    expect: 'read',
    anchor: 'if path.len() < prefix.len()',
    why: 'door.rs 的 matches_path：只要求 path.len() >= prefix.len() ⇒ 零段也算命中',
  },
  {
    name: 'auto 派生：GET ⇒ read',
    table: ['/q * auto'].join('\n'),
    path: '/q',
    method: 'GET',
    expect: 'read',
    anchor: 'if method == Method::GET || method == Method::HEAD',
    why: 'door.rs 的 resolve：Auto ⇒ GET/HEAD 给 read，其余给 admin',
  },
  {
    name: 'auto 派生：POST ⇒ admin',
    table: ['/q * auto'].join('\n'),
    path: '/q',
    method: 'POST',
    expect: 'admin',
    anchor: 'if method == Method::GET || method == Method::HEAD',
    why: '同上',
  },
  {
    name: '一条都没匹配上 ⇒ closed',
    table: ['/z * admin'].join('\n'),
    path: '/nope',
    method: 'GET',
    expect: 'closed',
    anchor: 'None => (Door::Closed, None)',
    why: 'door.rs 的 resolve：一条都没匹配上 ⇒ Closed',
  },
];

/**
 * 从 Rust 源码里抽出**它自己的用例表**。
 *
 * @returns {{cases: {path: string, method: string, expect: string, line: number}[], calls: number, missed: number}}
 */
export function extractCases(rustText) {
  const modIdx = rustText.indexOf('mod tests');
  const block = modIdx === -1 ? rustText : rustText.slice(modIdx);
  const cases = [];
  const re = /door_of\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)\s*,\s*Door::(\w+)/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    const line = block.slice(0, m.index).split('\n').length;
    cases.push({ path: m[1], method: m[2], expect: m[3], line });
  }
  const occurrences = [...block.matchAll(/door_of\s*\(/g)];
  const calls = occurrences.filter((o) => {
    const before = block.slice(Math.max(0, o.index - 8), o.index);
    return !/fn\s+$/.test(before);
  }).length;
  return { cases, calls, missed: Math.max(0, calls - cases.length) };
}

/** 逐条比：JS 镜像的判定 vs Rust 用例表里的期望。 */
export function compareCases(cases, entries) {
  const mismatches = [];
  for (const c of cases) {
    const want = DOOR_NAMES[c.expect];
    if (!want) {
      mismatches.push({ ...c, want: '(未知门型 ' + c.expect + ')', got: '-' });
      continue;
    }
    const got = resolveDoor(c.path, c.method, entries).door;
    if (got !== want) mismatches.push({ ...c, want, got });
  }
  return mismatches;
}

/**
 * 规格用例 —— 逐条比 + 逐条查锚点。
 *
 * @returns {{mismatches: object[], missingAnchors: object[]}}
 */
export function checkSpecCases(rustText, realEntries) {
  const mismatches = [];
  const missingAnchors = [];
  for (const spec of SPEC_CASES) {
    if (!rustText.includes(spec.anchor)) {
      missingAnchors.push(spec);
      continue;
    }
    const entries = spec.table === null ? realEntries : parsePolicyText(spec.table).entries;
    const got = resolveDoor(spec.path, spec.method, entries).door;
    if (got !== spec.expect) {
      mismatches.push({ ...spec, want: spec.expect, got });
    }
  }
  return { mismatches, missingAnchors };
}

function selfTest() {
  let failed = 0;
  let total = 0;
  const check = (name, ok) => {
    total++;
    if (!ok) failed++;
    console.log('  ' + (ok ? '✅' : '❌') + ' ' + name);
  };
  console.log('判据自检：');

  // ⚠️ 夹具与**真实输入同形** ⇒ 都是「一段 Rust 源码 + 一张门型表文本」
  // ⇒ ⇒ 断言钉的是真实请求会走的那条路。
  const rustFixture = [
    '#[cfg(test)]',
    'mod tests {',
    '    use super::*;',
    '    fn door_of(path: &str, method: &str) -> Door {',
    '        resolve(path, &Method::GET).0',
    '    }',
    '    #[test]',
    '    fn cases() {',
    '        assert_eq!(door_of("/x", "GET"), Door::Open);',
    '        assert_eq!(door_of("/y/z", "GET"), Door::Read);',
    '        assert_eq!(door_of("/nope", "GET"), Door::Closed);',
    '    }',
    '}',
  ].join('\n');
  const tableOk = ['/x * open', '/y/* * auto'].join('\n');
  const tableBad = ['/x * admin', '/y/* * auto'].join('\n');

  const ex = extractCases(rustFixture);
  check('夹具抽出 3 条用例', ex.cases.length === 3);
  check('夹具的调用数与用例数一致（helper 定义不算）', ex.calls === 3 && ex.missed === 0);

  const okEntries = parsePolicyText(tableOk).entries;
  const badEntries = parsePolicyText(tableBad).entries;
  check('镜像与期望一致 ⇒ 零不一致', compareCases(ex.cases, okEntries).length === 0);
  check(
    '换一张表就报出不一致（证明它真在比，不是恒绿）',
    compareCases(ex.cases, badEntries).length === 1,
  );

  // ⚠️ **静默跳过必须被抓住**：一个**参数不是字面量**的调用 ⇒ 抽不出来。
  const rustWithOpaque = rustFixture.replace(
    'assert_eq!(door_of("/nope", "GET"), Door::Closed);',
    'let p = String::from("/nope");\n        assert_eq!(door_of(&p, "GET"), Door::Closed);',
  );
  const ex2 = extractCases(rustWithOpaque);
  check('抽不出来的调用 ⇒ 判不了（missed > 0）', ex2.missed > 0);

  // 规格用例的机器：锚点缺失 ⇒ 判不了；期望不符 ⇒ 不一致。
  const specWithAnchor = checkSpecCases('方法写死的' + 'if path.len() < prefix.len()' + 'if method == Method::GET || method == Method::HEAD' + 'None => (Door::Closed, None)', realEntriesSelfTest());
  check('规格用例：锚点都在 ⇒ 没有 missingAnchors', specWithAnchor.missingAnchors.length === 0);
  check('规格用例：锚点齐了就不该报不一致', specWithAnchor.mismatches.length === 0, specWithAnchor.mismatches.map((m) => m.name).join(' | '));
  const specMissing = checkSpecCases('方法写死的', realEntriesSelfTest());
  check('规格用例：锚点缺了 ⇒ 判不了（missingAnchors > 0）', specMissing.missingAnchors.length > 0);

  // 再钉一次**真实文件** —— 上面那组只验逻辑，这里验真表真用例。
  const src = sibling('telencephalon');
  const doorRs = join(src, 'src', 'api', 'door.rs');
  const policyTxt = join(src, 'src', 'api', 'door_policy.txt');
  if (existsSync(doorRs) && existsSync(policyTxt)) {
    const rustText = readFileSync(doorRs, 'utf8');
    const { entries, errors } = parsePolicyText(readFileSync(policyTxt, 'utf8'));
    const real = extractCases(rustText);
    const mism = compareCases(real.cases, entries);
    const spec = checkSpecCases(rustText, entries);
    check('真实表解析零错', errors.length === 0);
    check('真实用例表：用例数 > 0', real.cases.length > 0, String(real.cases.length));
    check('真实用例表：镜像与权威逐条一致', mism.length === 0, mism.map((m) => m.path + ' ' + m.method).join(', '));
    check('真实用例表：没有抽不出来的调用', real.missed === 0, String(real.missed));
    check('真实规格用例：锚点都在', spec.missingAnchors.length === 0, spec.missingAnchors.map((s) => s.name).join(' | '));
    check('真实规格用例：逐条一致', spec.mismatches.length === 0, spec.mismatches.map((m) => m.name + ' ⇒ ' + m.got).join(' | '));
  } else {
    check('读得到真实门型表与 door.rs', false);
  }

  // ⚠️ **可数读数**（N/N）—— 纪律闸 D3 要求：接进 CI 的闸，其自检
  // 必须印出「跑了多少条、过了多少条」⇒ ⇒ 否则「读数不可比」。
  console.log('判据自检：' + (total - failed) + '/' + total + ' 条通过');
  console.log(failed ? '❌ 自检有 ' + failed + ' 条红' : '✅ 自检全过');
  process.exit(failed ? 1 : 0);
}

/** 自检里用的「真实表」替身 —— 规格用例里有一条要用真实表（/shadow/v1）。 */
function realEntriesSelfTest() {
  return parsePolicyText(['/shadow/v1/* * read', '/p GET read', '/p * admin', '/q * auto', '/z * admin'].join('\n')).entries;
}

function main() {
  const argv = process.argv.slice(2);
  let source = sibling('telencephalon');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source') source = resolve(argv[++i]);
    else if (argv[i] === '--self-test') return selfTest();
    else if (argv[i] === '-h' || argv[i] == '--help') {
      console.log('用法: node scripts/check-door-policy-parity.mjs [--source <telencephalon 路径>] [--self-test]');
      process.exit(0);
    } else {
      console.error('不认识的参数: ' + argv[i]);
      process.exit(2);
    }
  }

  const doorRs = join(source, 'src', 'api', 'door.rs');
  const policyTxt = join(source, 'src', 'api', 'door_policy.txt');
  if (!existsSync(doorRs) || !existsSync(policyTxt)) {
    console.error('读不到判据源: ' + doorRs + ' 或 ' + policyTxt);
    console.error('   ⇒ 「不知道」不等于「没问题」⇒ 退出码 2。');
    process.exit(2);
  }

  const { entries, errors } = parsePolicyText(readFileSync(policyTxt, 'utf8'));
  if (errors.length > 0) {
    console.error('门型表本身有问题 ⇒ 判不了 ⇒ 退出码 2。');
    for (const e of errors) console.error('  ✘ ' + e);
    process.exit(2);
  }

  const rustText = readFileSync(doorRs, 'utf8');
  const { cases, calls, missed } = extractCases(rustText);
  console.log('跨语言一致性 —— JS 镜像 vs 端脑 Rust 权威');
  console.log('  权威：' + doorRs + '（mod tests 的用例表）');
  console.log('  镜像：scripts/lib/door-policy.mjs');
  console.log('  表  ：' + policyTxt + '（' + entries.length + ' 条规则）');
  console.log('');

  if (cases.length === 0) {
    console.error('⚠️ 从 Rust 的用例表里一条都没抽出来 ⇒ 判不了 ⇒ 退出码 2。');
    console.error('   （多半是 Rust 那边的写法变了 ⇒ 升级抽取器，别当绿）');
    process.exit(2);
  }
  if (missed > 0) {
    console.error('⚠️ Rust 里有 ' + calls + ' 处 door_of 调用，只抽出 ' + cases.length + ' 条 ⇒ 判不了 ⇒ 退出码 2。');
    console.error('   （有调用被静默跳过 ⇒ 升级抽取器，别当绿）');
    process.exit(2);
  }

  const spec = checkSpecCases(rustText, entries);
  if (spec.missingAnchors.length > 0) {
    console.error('⚠️ 规格用例的**锚点**在权威源码里对不上 ⇒ 判不了 ⇒ 退出码 2。');
    console.error('   （权威改了 ⇒ 重新转写期望值，别让规格用例悄悄腐掉）');
    for (const s of spec.missingAnchors) console.error('  ✘ ' + s.name + ' ⇒ 锚点：' + s.anchor);
    process.exit(2);
  }

  const mismatches = compareCases(cases, entries);
  for (const m of mismatches) {
    console.log('  ❌ 权威用例 ' + m.method.padEnd(7) + m.path + ' ⇒ 期望 ' + m.want + '，镜像算出 ' + m.got + '（door.rs 第 ' + m.line + ' 行附近）');
  }
  for (const m of spec.mismatches) {
    console.log('  ❌ 规格用例 ' + m.name + ' ⇒ 期望 ' + m.want + '，镜像算出 ' + m.got);
  }
  console.log('');
  console.log('  权威用例 ' + cases.length + ' 条 ⇒ 一致 ' + (cases.length - mismatches.length) + ' / 不一致 ' + mismatches.length);
  console.log('  规格用例 ' + SPEC_CASES.length + ' 条 ⇒ 一致 ' + (SPEC_CASES.length - spec.mismatches.length) + ' / 不一致 ' + spec.mismatches.length);
  if (mismatches.length > 0 || spec.mismatches.length > 0) {
    console.log('');
    console.log('❌ JS 镜像与 Rust 权威对不上 ⇒ ⇒ 端脑的闸可能判错门型 ⇒ ⇒ 改镜像，别改权威。');
    process.exit(1);
  }
  console.log('');
  console.log('✅ 镜像与权威逐条一致 ⇒ 两边不会各判各的。');
  process.exit(0);
}

main();
