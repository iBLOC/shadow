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
 * ⚠️⚠️ **两份实现迟早会漂** ⇒ ⇒ 而漂了之后：
 * · 端脑的闸会**判错门型** ⇒ ⇒ 可能把一条**该关的路由报成「已覆盖」**
 *   （⇒ 「新增路由默认关」这条规矩就废了）⇒ ⇒ 或者反过来报一堆假红。
 * ⇒ ⇒ **各写一份不是问题，「没人判它俩一不一致」才是问题。**
 *
 * ## 怎么判
 *
 * 端脑的 Rust **自己带一份用例表**（`door.rs` 的 `mod tests` 里那些
 * `door_of(path, method) == Door::X` 断言）⇒ ⇒ 那份表就是**语义规格**
 * ⇒ ⇒ 本闸把那 N 条用例**逐条**喂给 JS 镜像 ⇒ ⇒ **不一致就红**。
 *
 * ⚠️ **不许静默跳过**：若 Rust 里的 `door_of(` 调用数 ≠ 抽出的用例数
 * ⇒ ⇒ 说明有调用没抽出来（形状变了）⇒ ⇒ **判不了** ⇒ ⇒ 退出码 2
 * （不许当绿）。
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

/** Rust 的门型名 ⇒ JS 这边的门型名（`resolve()` 派生后不会是 auto）。 */
const DOOR_NAMES = {
  Open: 'open',
  Read: 'read',
  Admin: 'admin',
  Owner: 'owner',
  Closed: 'closed',
};

/**
 * 从 Rust 源码里抽出**它自己的用例表**。
 *
 * @returns {{cases: {path: string, method: string, expect: string, line: number}[], calls: number, missed: number}}
 */
export function extractCases(rustText) {
  // ⚠️ 只看测试模块（权威的用例表在那儿）⇒ ⇒ 别把实现里的调用也算进去。
  const modIdx = rustText.indexOf('mod tests');
  const block = modIdx === -1 ? rustText : rustText.slice(modIdx);
  const cases = [];
  const re = /door_of\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*\)\s*,\s*Door::(\w+)/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    const line = block.slice(0, m.index).split('\n').length;
    cases.push({ path: m[1], method: m[2], expect: m[3], line });
  }
  // ⚠️ **所有** `door_of(` 调用（去掉那个 helper 自己的定义）
  // ⇒ ⇒ 抽出来的条数必须等于它 ⇒ ⇒ 不等 ⇒ 有调用被静默跳过 ⇒ ⇒ 判不了。
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

function selfTest() {
  let failed = 0;
  const check = (name, ok) => {
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

  // 再钉一次**真实文件** —— 上面那组只验逻辑，这里验真表真用例。
  const src = resolve(REPO, '..', 'telencephalon');
  const doorRs = join(src, 'src', 'api', 'door.rs');
  const policyTxt = join(src, 'src', 'api', 'door_policy.txt');
  if (existsSync(doorRs) && existsSync(policyTxt)) {
    const real = extractCases(readFileSync(doorRs, 'utf8'));
    const entries = parsePolicyText(readFileSync(policyTxt, 'utf8')).entries;
    const mism = compareCases(real.cases, entries);
    check('真实用例表：用例数 > 0', real.cases.length > 0, String(real.cases.length));
    check('真实用例表：镜像与权威逐条一致', mism.length === 0, mism.map((m) => m.path + ' ' + m.method).join(', '));
    check('真实用例表：没有抽不出来的调用', real.missed === 0, String(real.missed));
  } else {
    check('读得到真实门型表与 door.rs', false);
  }

  console.log(failed ? '❌ 自检有 ' + failed + ' 条红' : '✅ 自检全过');
  process.exit(failed ? 1 : 0);
}

function main() {
  const argv = process.argv.slice(2);
  let source = resolve(REPO, '..', 'telencephalon');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source') source = resolve(argv[++i]);
    else if (argv[i] === '--self-test') return selfTest();
    else if (argv[i] === '-h' || argv[i] === '--help') {
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

  const { cases, calls, missed } = extractCases(readFileSync(doorRs, 'utf8'));
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

  const mismatches = compareCases(cases, entries);
  for (const m of mismatches) {
    console.log('  ❌ ' + m.method.padEnd(7) + m.path + ' ⇒ 期望 ' + m.want + '，镜像算出 ' + m.got + '（door.rs 第 ' + m.line + ' 行附近）');
  }
  console.log('');
  console.log('  用例 ' + cases.length + ' 条 ⇒ 一致 ' + (cases.length - mismatches.length) + ' / 不一致 ' + mismatches.length);
  if (mismatches.length > 0) {
    console.log('');
    console.log('❌ JS 镜像与 Rust 权威对不上 ⇒ ⇒ 端脑的闸可能判错门型 ⇒ ⇒ 改镜像，别改权威。');
    process.exit(1);
  }
  console.log('');
  console.log('✅ 镜像与权威逐条一致 ⇒ 两边不会各判各的。');
  process.exit(0);
}

main();
