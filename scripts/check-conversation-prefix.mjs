#!/usr/bin/env node
/**
 * 端脑会话内容口径 ↔ 客户端处理 ⇒ 一致性闸。
 *
 * ## 为什么要有这个闸
 *
 * 端脑把会话的**人设**存成**第一条**轮次（role=agent + [system] 前缀），
 * 工具结果存成 [tool_result] 前缀的轮次 ⇒ ⇒ 前缀**藏在 text 里**。
 *
 * ⇒ ⇒ 客户端若不认这两个前缀 ⇒ 会把**用户自己的配置原文**
 * 当成大脑发言画出来 ⇒ ⇒ 「串味长得像正常对话」。
 *
 * ## 判据
 *
 * - **服务端**（真相源）：从 telencephalon 源码读出两个前缀的**字面量**。
 * - **客户端**：读出它声明的前缀字面量 + 它有没有「判别 + 剥壳」这两个动作。
 * - 服务端有的前缀、客户端**没有声明** ⇒ 红（客户端认不出）。
 * - 两边字面量**不一致** ⇒ 红（协议漂了）。
 * - 客户端声明了常量但**没有处理动作** ⇒ 红（有常量 ≠ 处理了）。
 *
 * ## 用法
 *
 *   node scripts/check-conversation-prefix.mjs
 *   node scripts/check-conversation-prefix.mjs --source C:\Projects\iBLOC\telencephalon
 *   node scripts/check-conversation-prefix.mjs --self-test
 */
import { sibling } from './lib/sibling-repo.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const SQ = String.fromCharCode(39);
const DQ = String.fromCharCode(34);

/** 服务端前缀：文件 + 常量名（真相源在 telencephalon 仓）。 */
const SERVER_PREFIXES = [
  { file: 'src/api/shadow/conversations.rs', name: 'SYSTEM_TURN_PREFIX' },
  { file: 'src/api/shadow.rs', name: 'TOOL_RESULT_TURN_PREFIX' },
];

/** 客户端：文件 + 前缀常量的本地名字 + 必须存在的处理动作。 */
const CLIENTS = [
  {
    label: '桌面端',
    file: 'shadow-desktop/src/lib/telencephalonClient.ts',
    constNames: ['SYSTEM_TURN_PREFIX', 'TOOL_RESULT_TURN_PREFIX'],
    handlers: ['isSystemTurn', 'isToolResultTurn', 'bodyText'],
  },
  {
    label: '移动端',
    file: 'shadow-mobile/lib/services/telencephalon/telencephalon_client.dart',
    constNames: ['kSystemTurnPrefix', 'kToolResultTurnPrefix'],
    handlers: ['isSystemTurn', 'isToolResultTurn', 'bodyText'],
  },
];

/**
 * 在源码里找 `const [String ]NAME = <引号>VALUE<引号>` ⇒ 返回 VALUE。
 *
 * ⚠️ 为什么要手写而不用正则：判据要**认得带类型注解的声明**
 * （Dart 的 `const String kSystemTurnPrefix`、Rust 的 `pub const X: &str`）
 * ⇒ ⇒ 一律找「最近的 const」+「名字与 const 之间只允许空白或 String」。
 * ⚠️ 引号两种都试（Rust 用双引号、TS/Dart 用单引号）。
 */
function parseConstValue(text, name) {
  let from = 0;
  for (;;) {
    const at = text.indexOf(name, from);
    if (at < 0) return null;
    from = at + name.length;
    const before = text.lastIndexOf('const', at);
    if (before < 0) continue;
    const between = text.slice(before + 5, at).trim();
    if (between !== '' && between !== 'String') continue;
    const after = text.slice(at + name.length);
    const eq = after.indexOf('=');
    if (eq < 0) continue;
    const rest = after.slice(eq + 1);
    let k = 0;
    while (k < rest.length) {
      const c = rest.charCodeAt(k);
      if (c !== 32 && c !== 9) break;
      k++;
    }
    const q = rest[k];
    if (q !== SQ && q !== DQ) continue;
    const q2 = rest.indexOf(q, k + 1);
    if (q2 < 0) continue;
    return rest.slice(k + 1, q2);
  }
}

/** 判据本体：服务端前缀 vs 一个客户端 ⇒ 返回问题清单（空 = 通过）。 */
function evaluate(serverPrefixes, client) {
  const problems = [];
  serverPrefixes.forEach((sp, i) => {
    const cname = client.constNames[i];
    if (!cname) {
      problems.push(client.label + ' 没有为 ' + sp.name + ' 声明对应的常量');
      return;
    }
    const cval = parseConstValue(client.text, cname);
    if (cval === null) {
      problems.push(client.label + ' 没有声明 ' + cname + ' ⇒ 认不出端脑的「' + sp.name + '」');
    } else if (cval !== sp.value) {
      problems.push(client.label + ' 的 ' + cname + ' 是 ' + JSON.stringify(cval)
        + '，端脑是 ' + JSON.stringify(sp.value) + ' ⇒ 协议漂了');
    }
  });
  for (const h of client.handlers) {
    if (!client.text.includes(h)) {
      problems.push(client.label + ' 声明了前缀常量，但没有 ' + h + ' ⇒ 有常量 ≠ 处理了');
    }
  }
  return problems;
}

function parseArgs(argv) {
  const opts = { source: sibling(REPO, 'telencephalon'), selfTest: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source') opts.source = resolve(argv[++i]);
    else if (argv[i] === '--self-test') opts.selfTest = true;
    else if (argv[i] === '-h' || argv[i] === '--help') {
      console.log('用法: node scripts/check-conversation-prefix.mjs [--source <端脑>] [--self-test]');
      process.exit(0);
    } else {
      console.error('不认识的参数: ' + argv[i]);
      process.exit(2);
    }
  }
  return opts;
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

  // ⚠️ 夹具必须与真实输入**同形**（走同一套 parseConstValue）
  const rust = 'pub const SYSTEM_TURN_PREFIX: &str = "[system] ";';
  const ts = "export const SYSTEM_TURN_PREFIX = '[system] ';";
  const dart = "const String kSystemTurnPrefix = '[system] ';";

  check('认得出 Rust 的 &str 常量', parseConstValue(rust, 'SYSTEM_TURN_PREFIX') === '[system] ');
  check('认得出 TS 的 export const', parseConstValue(ts, 'SYSTEM_TURN_PREFIX') === '[system] ');
  check('认得出 Dart 的 const String', parseConstValue(dart, 'kSystemTurnPrefix') === '[system] ');
  check('认不出时不乱猜', parseConstValue('const other = 1;', 'SYSTEM_TURN_PREFIX') === null);
  const rustWithDoc = '/// Marker prefix — see SYSTEM_TURN_PREFIX.' + String.fromCharCode(10) + 'pub const SYSTEM_TURN_PREFIX: &str = "[system] ";';
  check('注释里先提到名字 ⇒ 仍认得出真声明', parseConstValue(rustWithDoc, 'SYSTEM_TURN_PREFIX') === '[system] ');
  const rustReal = 'pub const SYSTEM_TURN_PREFIX: &str = "[system] ";' + String.fromCharCode(10) + String.fromCharCode(10) + "/// The prompt is kept as the conversation's *first* agent turn — see" + String.fromCharCode(10) + 'pub fn system_prompt_of() -> Option<String> { None }';
  check('声明后面还有一大堆文本 ⇒ 仍只取字面量', parseConstValue(rustReal, 'SYSTEM_TURN_PREFIX') === '[system] ');

  const server = [{ name: 'SYSTEM_TURN_PREFIX', value: '[system] ' }];
  const good = {
    label: '假客户端',
    text: ts + ' function isSystemTurn(){} function isToolResultTurn(){} function bodyText(){}',
    constNames: ['SYSTEM_TURN_PREFIX'],
    handlers: ['isSystemTurn', 'isToolResultTurn', 'bodyText'],
  };
  check('一致时无问题', evaluate(server, good).length === 0);

  const drifted = { ...good, text: "export const SYSTEM_TURN_PREFIX = '[sys] '; function isSystemTurn(){} function isToolResultTurn(){} function bodyText(){}" };
  check('字面量漂了 ⇒ 有问题', evaluate(server, drifted).length === 1);

  const noHandler = { ...good, text: ts };
  check('没有处理动作 ⇒ 有问题', evaluate(server, noHandler).length === 3);

  const missing = { ...good, text: 'const unrelated = 1;' };
  check('没有声明前缀 ⇒ 有问题', evaluate(server, missing).length === 4);

  console.log('  自检：' + (total - failed) + '/' + total);
  console.log(failed ? '❌ 自检有 ' + failed + ' 条红' : '✅ 自检全过');
  process.exit(failed ? 1 : 0);
}

const opts = parseArgs(process.argv.slice(2));
if (opts.selfTest) {
  selfTest();
} else {
  const serverPrefixes = [];
  const unreadable = [];
  for (const sp of SERVER_PREFIXES) {
    const full = join(opts.source, sp.file);
    if (!existsSync(full)) { unreadable.push(sp.file + '（文件不存在）'); continue; }
    const value = parseConstValue(readFileSync(full, 'utf8'), sp.name);
    if (value === null) { unreadable.push(sp.file + ' 里读不到 ' + sp.name); continue; }
    serverPrefixes.push({ name: sp.name, value: value });
  }
  if (unreadable.length > 0) {
    console.error('服务端前缀读不出来 ⇒ 判不了（不是「一致」）：');
    for (const u of unreadable) console.error('  ✘ ' + u);
    process.exit(2);
  }

  console.log('服务端前缀（真相源: ' + opts.source + '）：');
  for (const sp of serverPrefixes) console.log('  ' + sp.name + ' = ' + JSON.stringify(sp.value));

  const problems = [];
  for (const c of CLIENTS) {
    const full = join(REPO, c.file);
    if (!existsSync(full)) {
      console.error('客户端文件不存在: ' + c.file);
      process.exit(2);
    }
    const client = { ...c, text: readFileSync(full, 'utf8') };
    const ps = evaluate(serverPrefixes, client);
    for (const p of ps) problems.push(p);
    console.log('  ' + c.label + ' ⇒ ' + (ps.length === 0 ? '一致' : ps.length + ' 条问题'));
  }

  if (problems.length === 0) {
    console.log('✔ 两端认的是同一套会话内容口径 ⇒ 用户自己的配置不会被画成大脑发言。');
    process.exit(0);
  }
  console.log('❌ 会话内容口径不一致：');
  for (const p of problems) console.log('  ' + p);
  console.log('⇒ ⇒ 改客户端（或端脑），别让前缀漂了。');
  process.exit(1);
}