#!/usr/bin/env node
/**
 * **移动端无障碍通道的契约闸** —— Dart 与 Kotlin 两端必须**逐字对齐**。
 *
 * ## 为什么要有这道闸
 *
 * 移动端的无障碍能力走的是一条**方法通道**（`com.ibloc.shadow/accessibility`）
 * ⇒ ⇒ 两端各写一份「方法名 + 参数名 + 取值字面量」⇒ ⇒ **没有任何编译器**
 * 会告诉你它们对不上 ⇒ ⇒ 而对不上的后果是**静悄悄**的：
 *
 * - 方法名对不上 ⇒ ⇒ 端脑发过去的动作**静悄悄**变成「没实现」；
 * - 参数名对不上 ⇒ ⇒ 坐标读成 0 ⇒ ⇒ **点到了屏幕左上角**（比报错更糟）；
 * - 取值对不上 ⇒ ⇒ 「最近任务」**静悄悄**变成「返回」。
 *
 * ⇒ ⇒ 这三类漂移本仓**真的发生过**（㌇ 条 ⑧：全局动作只认 back/home，
 * 其余**静悄悄**变成「返回」）⇒ ⇒ 所以要有闸。
 *
 * ## 闸抓什么
 *
 * ① **通道名** —— 两端必须同一个字符串（对不上 ⇒ ⇒ 整条能力全废）；
 * ② **方法名** —— Dart 调的每个方法，Kotlin 必须认（认不出 ⇒ ⇒ notImplemented）；
 * ③ **参数名** —— 两端必须**完全一致**（多一个少一个都是默认值 ⇒ ⇒ 静悄悄）；
 * ④ **全局动作取值** —— Dart 的 wire 值集合 == Kotlin 认的集合；
 * ⑤ **截断标记字面量** —— 读屏被截断时两端用同一个标记（Dart 靠它判断
 *    「这一屏没看全」⇒ ⇒ 字面量漂了 ⇒ ⇒ 截断**静悄悄**变成了「看全了」）。
 *
 * ## 防假绿
 *
 * **一个文件都没读到 ⇒ 退出码 2，不是 0** ⇒ ⇒ 「没红」不等于「没问题」。
 * 探测器自己先跑一遍 `--self-test` ⇒ ⇒ 探测器坏了 ⇒ ⇒ 退出码 2。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/check-mobile-a11y-contract.mjs
 * node scripts/check-mobile-a11y-contract.mjs --self-test
 * ```
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

function pathsFor(root) {
  return {
    dartA11y: join(root, 'shadow-mobile', 'lib', 'services', 'accessibility_controller.dart'),
    dartOps: join(root, 'shadow-mobile', 'lib', 'services', 'capabilities', 'accessibility_ops.dart'),
    ktMain: join(
      root,
      'shadow-mobile',
      'android',
      'app',
      'src',
      'main',
      'kotlin',
      'com',
      'ibloc',
      'shadow',
      'MainActivity.kt'
    ),
    ktSvc: join(
      root,
      'shadow-mobile',
      'android',
      'app',
      'src',
      'main',
      'kotlin',
      'com',
      'ibloc',
      'shadow',
      'PrefrontalAccessibilityService.kt'
    ),
  };
}

const PATHS = pathsFor(REPO);

/** 把注释与字符串**内容**挖空（保持长度与位置）⇒ ⇒ 括号配对不受内容干扰。 */
function maskNoise(text) {
  const out = text.split('');
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') { out[i] = ' '; i++; }
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] !== '\n') out[i] = ' ';
        i++;
      }
      if (i < n) {
        out[i] = ' ';
        if (text[i + 1] !== undefined) out[i + 1] = ' ';
        i += 2;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      out[i] = quote;
      i++;
      while (i < n) {
        if (text[i] === '\\') {
          out[i] = ' ';
          if (i + 1 < n) out[i + 1] = ' ';
          i += 2;
          continue;
        }
        if (text[i] === quote) break;
        if (text[i] === '\n') break;
        out[i] = ' ';
        i++;
      }
      i++;
      continue;
    }
    i++;
  }
  return out.join('');
}

/** 从开引号处读一个字符串字面量（不做转义还原，只要字面内容）。 */
function readRawString(raw, i) {
  if (raw[i] !== '"') return null;
  let j = i + 1;
  let value = '';
  while (j < raw.length) {
    if (raw[j] === '\\') {
      value += raw[j + 1] === undefined ? '' : raw[j + 1];
      j += 2;
      continue;
    }
    if (raw[j] === '"') return { value, end: j + 1 };
    value += raw[j];
    j++;
  }
  return null;
}

/** 掩码后的文本里配对大括号 ⇒ ⇒ 返回闭合位置（找不到 ⇒ −1）。 */
function matchBrace(masked, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < masked.length; i++) {
    if (masked[i] === '{') depth++;
    else if (masked[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 抽出 `when (...) { ... }` 里**每个字符串分支**的名字与 body 区间。
 *
 * ⚠️ 名字在**原文**里取（掩码会把内容抹掉）⇒ ⇒ 位置对得上就行。
 */
function whenBranches(masked, raw, blockStart, blockEnd) {
  const out = [];
  let depth = 0;
  let i = blockStart;
  while (i < blockEnd) {
    const c = masked[i];
    if (c === '{') { depth++; i++; continue; }
    if (c === '}') { depth--; i++; continue; }
    // ⚠️ **只看顶层分支** —— 嵌套的 `when (action) { "back" -> ... }`
    //    里的取值**不是**方法名 ⇒ ⇒ 深度不为 0 的一律跳过。
    if (depth === 0 && c === '"') {
      let j = i + 1;
      while (j < blockEnd && masked[j] !== '"') j++;
      if (j < blockEnd) {
        let k = j + 1;
        while (k < blockEnd && (masked[k] === ' ' || masked[k] === '\t')) k++;
        if (masked[k] === '-' && masked[k + 1] === '>') {
          const lit = readRawString(raw, i);
          if (lit) out.push({ name: lit.value, bodyStart: k + 2 });
          i = k + 2;
          continue;
        }
      }
    }
    i++;
  }
  for (let i2 = 0; i2 < out.length; i2++) {
    out[i2].bodyEnd = i2 + 1 < out.length ? out[i2 + 1].bodyStart : blockEnd;
  }
  return out;
}

/** Dart 侧：`invokeMethod('名字', { '键': 值 })` ⇒ 方法名 + 参数键。 */
function parseDartCalls(src) {
  const methods = new Map();
  const re = /invokeMethod(?:<[^>]*>)?\(\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    const keys = new Set();
    let i = m.index + m[0].length;
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src[i] === ',') {
      i++;
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src[i] === '{') {
        const close = matchBrace(src, i);
        const body = src.slice(i, close < 0 ? src.length : close);
        const kre = /'([^']+)'\s*:/g;
        let km;
        while ((km = kre.exec(body)) !== null) keys.add(km[1]);
      }
    }
    const prev = methods.get(name) || new Set();
    for (const k of keys) prev.add(k);
    methods.set(name, prev);
  }
  return methods;
}

/** Kotlin 侧：无障碍通道那个 `when (call.method)` 的分支与参数键。 */
function parseKotlinBranches(src) {
  const masked = maskNoise(src);
  const anchor =
    'MethodChannel(flutterEngine.dartExecutor.binaryMessenger, A11Y_CHANNEL)' +
    '.setMethodCallHandler {';
  const at = masked.indexOf(anchor);
  if (at < 0) return null;
  const bodyStart = at + anchor.length - 1;
  const bodyEnd = matchBrace(masked, bodyStart);
  if (bodyEnd < 0) return null;
  const whenAt = masked.indexOf('when (call.method) {', bodyStart);
  if (whenAt < 0 || whenAt > bodyEnd) return null;
  const whenOpen = whenAt + 'when (call.method) {'.length - 1;
  const whenEnd = matchBrace(masked, whenOpen);
  if (whenEnd < 0) return null;
  const methods = new Map();
  for (const br of whenBranches(masked, src, whenOpen + 1, whenEnd)) {
    const body = src.slice(br.bodyStart, br.bodyEnd);
    const keys = new Set();
    const kre = /call\.argument<[^>]*>\(\s*"([^"]+)"/g;
    let km;
    while ((km = kre.exec(body)) !== null) keys.add(km[1]);
    methods.set(br.name, keys);
  }
  return { methods, body: src.slice(bodyStart + 1, bodyEnd) };
}

/** Dart 的 `GlobalAction` 枚举里每个成员的 wire 值。 */
function parseDartWires(src) {
  const at = src.indexOf('enum GlobalAction');
  if (at < 0) return null;
  const masked = maskNoise(src);
  const open = src.indexOf('{', at);
  if (open < 0) return null;
  const close = matchBrace(masked, open);
  const body = src.slice(open, close < 0 ? src.length : close);
  const wires = new Set();
  const re = /\w+\('([^']+)'\)/g;
  let m;
  while ((m = re.exec(body)) !== null) wires.add(m[1]);
  return wires;
}

/** Kotlin 的 `when (action)` 分支里认的取值（globalAction 那条分支内）。 */
function parseKotlinWires(src, branches) {
  const branch = branches && branches.methods && branches.methods.get('globalAction');
  if (!branch) return null;
  const masked = maskNoise(src);
  const at = masked.indexOf('when (action) {');
  if (at < 0) return null;
  const open = at + 'when (action) {'.length - 1;
  const close = matchBrace(masked, open);
  if (close < 0) return null;
  const wires = new Set();
  for (const br of whenBranches(masked, src, open + 1, close)) wires.add(br.name);
  return wires;
}

function parseChannelDart(src) {
  const m = /MethodChannel\(\s*'([^']+)'[^)]*\)/.exec(src);
  return m ? m[1] : null;
}

function parseChannelKotlin(src) {
  const m = /A11Y_CHANNEL\s*=\s*"([^"]+)"/.exec(src);
  return m ? m[1] : null;
}

function parseMarkerDart(src) {
  const m = /kScreenTruncationMarker\s*=\s*'([^']+)'/.exec(src);
  return m ? m[1] : null;
}

function parseMarkerKotlin(src) {
  const m = /TRUNCATION_MARKER\s*=\s*"([^"]+)"/.exec(src);
  return m ? m[1] : null;
}

/** 把两边解析出来的事实对一遍 ⇒ ⇒ 返回问题清单。 */
function checkFacts(facts) {
  const problems = [];
  const add = (level, msg) => problems.push({ level, msg });

  if (facts.dartChannel !== facts.ktChannel) {
    add(
      'block',
      '通道名对不上：Dart ' +
        String(facts.dartChannel) +
        ' vs Kotlin ' +
        String(facts.ktChannel) +
        ' ⇒ ⇒ 整条无障碍能力会**全部失联**'
    );
  }

  for (const [name, keys] of facts.dartMethods) {
    if (!facts.ktMethods.has(name)) {
      add(
        'block',
        'Dart 调了 Kotlin **不认**的方法 ' +
          name +
          ' ⇒ ⇒ 运行时是 notImplemented（静悄悄失败）'
      );
      continue;
    }
    const ktKeys = facts.ktMethods.get(name);
    for (const k of keys) {
      if (!ktKeys.has(k)) {
        add(
          'block',
          '方法 ' +
            name +
            '：Dart 发了参数 ' +
            k +
            '，Kotlin **没读**它 ⇒ ⇒ 那边拿到默认值 ⇒ ⇒ 静悄悄'
        );
      }
    }
    for (const k of ktKeys) {
      if (!keys.has(k)) {
        add(
          'block',
          '方法 ' +
            name +
            '：Kotlin 读了参数 ' +
            k +
            '，Dart **没发**它 ⇒ ⇒ 那边拿到默认值 ⇒ ⇒ 静悄悄'
        );
      }
    }
  }

  for (const name of facts.ktMethods.keys()) {
    if (!facts.dartMethods.has(name)) {
      add('info', 'Kotlin 认了 Dart 侧没调用的方法 ' + name + '（可能是备用通道）');
    }
  }

  const dw = facts.dartWires || new Set();
  const kw = facts.ktWires || new Set();
  for (const w of dw) {
    if (!kw.has(w)) {
      add(
        'block',
        '全局动作 ' +
          w +
          '：Dart 会发，Kotlin **不认** ⇒ ⇒ 静悄悄变成别的动作'
      );
    }
  }
  for (const w of kw) {
    if (!dw.has(w)) {
      add(
        'block',
        '全局动作 ' +
          w +
          '：Kotlin 认，Dart 侧枚举里**没有** ⇒ ⇒ 两端清单漂了'
      );
    }
  }

  if (facts.dartMarker === null || facts.ktMarker === null) {
    add('block', '截断标记字面量没找到（两端必须都有）');
  } else if (facts.dartMarker !== facts.ktMarker) {
    add(
      'block',
      '截断标记对不上：Dart ' +
        facts.dartMarker +
        ' vs Kotlin ' +
        facts.ktMarker +
        ' ⇒ ⇒ 截断会**静悄悄**变成「看全了」'
    );
  }

  return problems;
}

function parseAll(sources) {
  const dartMethods = parseDartCalls(sources.dartA11y);
  const kt = parseKotlinBranches(sources.ktMain);
  if (!kt) return null;
  return {
    dartChannel: parseChannelDart(sources.dartA11y),
    ktChannel: parseChannelKotlin(sources.ktMain),
    dartMethods,
    ktMethods: kt.methods,
    dartWires: parseDartWires(sources.dartA11y),
    ktWires: parseKotlinWires(sources.ktMain, kt),
    dartMarker: parseMarkerDart(sources.dartOps),
    ktMarker: parseMarkerKotlin(sources.ktSvc),
  };
}

function readSources(paths) {
  const out = {};
  for (const [k, p] of Object.entries(paths)) {
    if (!existsSync(p)) return null;
    out[k] = readFileSync(p, 'utf8');
  }
  return out;
}

const SAMPLE_DART_A11Y = [
  "import 'package:flutter/services.dart';",
  'class C {',
  "  static const MethodChannel _channel = MethodChannel('com.ibloc.shadow/accessibility');",
  '  static Future<bool> tap(double x, double y) async {',
  "    final r = await _channel.invokeMethod<bool>('tap', {'x': x, 'y': y});",
  '    return r ?? false;',
  '  }',
  '  static Future<bool> ga(GlobalAction a) async {',
  "    final r = await _channel.invokeMethod<bool>('globalAction', {'action': a.wire});",
  '    return r ?? false;',
  '  }',
  '}',
  "enum GlobalAction { back('back'), home('home'); }",
].join('\n');

const SAMPLE_DART_OPS = "const String kScreenTruncationMarker = '[truncated]';\n";

const SAMPLE_KT_MAIN = [
  'class A {',
  '    private val A11Y_CHANNEL = "com.ibloc.shadow/accessibility"',
  '    fun setup(flutterEngine: FlutterEngine) {',
  '        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, A11Y_CHANNEL).setMethodCallHandler { call, result ->',
  '            when (call.method) {',
  '                "tap" -> {',
  '                    val x = (call.argument<Number>("x")?.toFloat()) ?: 0f',
  '                    val y = (call.argument<Number>("y")?.toFloat()) ?: 0f',
  '                    result.success(false)',
  '                }',
  '                "globalAction" -> {',
  '                    val action = call.argument<String>("action") ?: "back"',
  '                    val id = when (action) {',
  '                        "back" -> 1',
  '                        "home" -> 2',
  '                        else -> -1',
  '                    }',
  '                    result.success(false)',
  '                }',
  '                else -> result.notImplemented()',
  '            }',
  '        }',
  '    }',
  '}',
].join('\n');

const SAMPLE_KT_SVC = 'const val TRUNCATION_MARKER = "[truncated]"\n';

function selfTest() {
  const base = {
    dartA11y: SAMPLE_DART_A11Y,
    dartOps: SAMPLE_DART_OPS,
    ktMain: SAMPLE_KT_MAIN,
    ktSvc: SAMPLE_KT_SVC,
  };
  const facts = parseAll(base);
  if (!facts) {
    console.error('自检失败：样本解析不出来');
    return 2;
  }
  const clean = checkFacts(facts);
  const blocks = clean.filter((p) => p.level === 'block');
  if (blocks.length !== 0) {
    console.error('自检失败：样本本该是绿的，却报了 ' + blocks.length + ' 条：');
    for (const b of blocks) console.error('  · ' + b.msg);
    return 2;
  }
  const cases = [
    ['方法名漂了', { ...base, dartA11y: base.dartA11y.replace("'tap'", "'tapp'") }],
    ['参数名漂了', { ...base, dartA11y: base.dartA11y.replace("{'x': x, 'y': y}", "{'xx': x, 'y': y}") }],
    ['Kotlin 少认一个方法', { ...base, ktMain: base.ktMain.replace('                "tap" -> {', '                "tapx" -> {') }],
    ['取值漂了', { ...base, dartA11y: base.dartA11y.replace("back('back')", "back('backward')") }],
    ['截断标记漂了', { ...base, ktSvc: 'const val TRUNCATION_MARKER = "[cut]"\n' }],
    ['通道名漂了', { ...base, dartA11y: base.dartA11y.replace('com.ibloc.shadow/accessibility', 'com.ibloc.shadow/a11y') }],
  ];
  for (const [label, mutated] of cases) {
    const f = parseAll(mutated);
    if (!f) {
      console.error('自检失败：' + label + ' 的样本解析不出来');
      return 2;
    }
    const got = checkFacts(f).filter((p) => p.level === 'block');
    if (got.length === 0) {
      console.error('自检失败：' + label + ' 应当被抓到，却没抓到');
      return 2;
    }
    console.log('  ✓ 样本：' + label + ' ⇒ 抓到 ' + got.length + ' 条');
  }
  console.log('自检全过');
  return 0;
}

function main() {
  let root = REPO;
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--root' && process.argv[i + 1]) {
      root = resolve(process.argv[i + 1]);
      i++;
    }
  }
  if (process.argv.includes('--self-test')) {
    const code = selfTest();
    process.exit(code);
  }
  const paths = pathsFor(root);
  const sources = readSources(paths);
  if (!sources) {
    console.error('读不到源文件 ⇒ ⇒ 退出码 2（不是「没问题」）');
    console.error('  期望：' + Object.values(paths).join('\n          '));
    process.exit(2);
  }
  const facts = parseAll(sources);
  if (!facts) {
    console.error('解析不出来（锚点变了？例如通道常量改了名）⇒ ⇒ 退出码 2');
    process.exit(2);
  }
  if (facts.dartMethods.size === 0 || facts.ktMethods.size === 0) {
    console.error('解析出来的方法数是 0 ⇒ ⇒ 退出码 2（防假绿）');
    process.exit(2);
  }
  const problems = checkFacts(facts);
  const blocks = problems.filter((p) => p.level === 'block');
  const infos = problems.filter((p) => p.level === 'info');
  console.log('· 通道名：Dart ' + facts.dartChannel + ' / Kotlin ' + facts.ktChannel);
  console.log('· 方法：Dart ' + facts.dartMethods.size + ' 个 / Kotlin ' + facts.ktMethods.size + ' 个');
  console.log('· 全局动作取值：Dart ' + (facts.dartWires ? facts.dartWires.size : 0) + ' 个');
  console.log('· 截断标记：' + facts.dartMarker);
  if (infos.length) {
    for (const i of infos) console.log('  ! ' + i.msg);
  }
  if (blocks.length) {
    console.error('');
    console.error('✖ 两端契约对不上（' + blocks.length + ' 条）：');
    for (const b of blocks) console.error('  · ' + b.msg);
    process.exit(1);
  }
  console.log('');
  console.log('✔ 无障碍通道的两端契约逐字对齐');
  process.exit(0);
}

main();
