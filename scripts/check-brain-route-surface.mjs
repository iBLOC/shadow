#!/usr/bin/env node
/**
 * 端脑 **HTTP 路由面**的产物级一致性守卫。
 *
 * ## 为什么要有这个
 *
 * ⚠️ **2026-11-11 真产物取证**（本机实测，iBLOC/shadow）：
 *
 *   - 端脑源码（兄弟仓 telencephalon，src/api/lobe_manifest.rs）**有**
 *     「GET/PUT /api/telencephalon/lobes/capability-defaults」；
 *   - 手机里那份 NDK 内嵌大脑
 *     （shadow-mobile/android/app/src/main/jniLibs/arm64-v8a/libencephalon.so，
 *     **11-06 16:06** 构建）**没有**这条路由 ——
 *     字节扫描：**capability-defaults ⇒ 0 次**，而同一份里的
 *     「lobes/capabilities ⇒ 1 次」（⇒ ⇒ 扫描方法本身有效，不是扫不出来）；
 *   - ⇒ ⇒ **端脑源码里有 ≠ 你编出来的大脑里有** ⇒ ⇒ 真机上「按能力分档的
 *     默认模型」整块 404（界面只显示一条原始错误）⇒ ⇒ **失败长得像成功**。
 *
 * ⚠️ **既有那道闸盖不住这一族**：
 *   scripts/check-jni-surface.mjs 查的是 **JNI 函数符号**面 ⇒ ⇒
 *   JNI 符号是稳定的 ⇒ ⇒ 一份旧 .so 的符号可能**全对**、而 HTTP 路由
 *   少了一堆（2026-10-31 那次真机事故抓的是符号面 ⇒ ⇒ 这次是**路由面**）。
 *   ⇒ ⇒ **符号面与路由面是两族，各有各的破坏形态**。
 *
 * ## 它查什么（三段都要是真的）
 *
 *   1. **客户端依赖**（从代码里**提取**，不手抄）—— 移动端 Dart 里对端脑的
 *      路径字面量（注释里的、中文散文里的**不算**）。
 *   2. **端脑源码面**（归因的真相面）—— 兄弟仓 ../telencephalon/src/api 下
 *      全部 .rs 里 .route("…") 的声明。
 *   3. **产物面**（**被测物**）—— jniLibs 下**逐 ABI** 的 libencephalon.so。
 *
 * ## 判红条件（按**破坏形态**列）
 *
 *   **客户端依赖 ∧ 端脑源码有 ∧ 产物里查不到那条完整字面量**
 *   ⇒ ⇒ 「端脑确实有这条路由，但你编出来的大脑里没有」
 *   ⇒ ⇒ 真机上这条功能**根本不存在**（404）⇒ ⇒ 界面只会显示一条原始错误
 *   ⇒ ⇒ **失败长得像成功**。
 *
 * ⚠️ **端脑源码缺失 ⇒ 只报不判红**：没有归因的真相面，就分不清
 *   「端脑从来没有这条路由（客户端错了）」与「你编出来的大脑旧了」。
 * ⚠️ **产物缺失 ⇒ 只报不判红**：干净 checkout 没有 .so（它被 gitignore）
 *   ⇒ ⇒ 判红就是「构造出来的红」。
 *
 * ## 用法
 *
 *   node scripts/check-brain-route-surface.mjs             查本机的产物
 *   node scripts/check-brain-route-surface.mjs --self-test  判据自检（造夹具）
 *   node scripts/check-brain-route-surface.mjs --artifacts <dir>   指定产物目录
 *   node scripts/check-brain-route-surface.mjs --server-dir <dir>  指定端脑源码目录
 *   node scripts/check-brain-route-surface.mjs --client-dir <dir>  指定客户端源码目录
 *
 * 退出码 0 = 通过；1 = 有阻断问题；**2 = 判不了**（缺端脑源码或缺产物
 * ⇒ ⇒ 拿「构造出来的零」冒充验证是不行的 ⇒ ⇒ 所以另给一个码）。
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 移动端 Dart 源码根 —— 客户端依赖从这儿提取。 */
const MOBILE_LIB = join(ROOT, 'shadow-mobile', 'lib');

/** 端脑源码（兄弟仓）—— 归因的真相面。 */
const SIBLING_TEL = resolve(ROOT, '..', 'telencephalon', 'src', 'api');

/** 手机里那份 NDK 内嵌大脑 —— **被测物**。 */
const JNI_LIBS = join(ROOT, 'shadow-mobile', 'android', 'app', 'src', 'main', 'jniLibs');
const SO_NAME = 'libencephalon.so';

const line = '='.repeat(72);

// ────────────────────────────────────────────────────────────────────────────
// 纯逻辑（自检用得上 ⇒ 不碰文件系统）
// ────────────────────────────────────────────────────────────────────────────

/** 中文标点/汉字 —— 出现在路径**前面** ⇒ 这是句子，不是路由。 */
const CJK = /[\u3000-\u9fff\uff00-\uffef]/;

/** 把一条路径归一成**骨架**：路径参数一律换成 *。 */
export function toSkeleton(path) {
  return String(path ?? '')
    .split('?')[0]
    .replace(/\$\{[^}]*\}/g, '*')
    .replace(/\{[^}]*\}/g, '*')
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '*')
    .replace(/\*+/g, '*')
    .replace(/\/+$/, '');
}

/** 一行里的字符串字面量（单引号 / 双引号 / 反引号）。 */
export function stringLiterals(line) {
  const out = [];
  const re = /'([^'\n]*)'|"([^"\n]*)"|\`([^\`\n]*)\`/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3] ?? '');
  return out;
}

/**
 * 从**代码文本**里提取客户端对端脑的路由依赖。
 *
 * ⚠️ **注释行不算**（// /// * /*）—— 注释里写「这条路由是……」不是依赖。
 * ⚠️ **中文散文里的路径不算** —— 「端脑没有『删除叶区』这张面（DELETE
 *   /api/telencephalon/agents/$id 不存在）」是一句话，不是路由。
 */
export function extractClientRoutesFromText(text, site = '<内存>') {
  const out = new Map();
  text.split(/\r?\n/).forEach((raw, i) => {
    const trimmed = raw.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    for (const lit of stringLiterals(raw)) {
      const at = lit.indexOf('/api/telencephalon/');
      if (at < 0) continue;
      const prefix = lit.slice(0, at);
      if (CJK.test(prefix)) continue; // 散文
      const skel = toSkeleton(lit.slice(at));
      if (!skel || skel === '/api/telencephalon') continue;
      if (!out.has(skel)) out.set(skel, { skeleton: skel, literals: new Set(), sites: [] });
      const rec = out.get(skel);
      rec.literals.add(lit);
      rec.sites.push(site + ':' + (i + 1));
    }
  });
  return out;
}

/**
 * 从端脑源码**文本**里提取 .route("…") 声明。
 *
 * ⚠️ 只认 .route( 形态 —— 注释里提到的路径不算声明。
 */
export function extractServerRoutesFromText(text, site = '<内存>') {
  const out = new Map();
  const re = /\.route\(\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(text))) {
    const lit = m[1];
    const skel = toSkeleton(lit);
    if (!out.has(skel)) out.set(skel, { skeleton: skel, literals: new Set(), sites: [] });
    const rec = out.get(skel);
    rec.literals.add(lit);
    rec.sites.push(site);
  }
  return out;
}

/**
 * 核心判据（纯函数 ⇒ 自检直接喂内存夹具）。
 *
 * @param client  客户端依赖（Map<skeleton, rec>）
 * @param server  端脑源码声明（Map<skeleton, rec>）
 * @param has     (literal) => boolean —— 产物里有没有这段字节
 */
export function findRouteGaps({ client, server, has }) {
  const missing = [];
  const unresolved = [];
  let matched = 0;
  for (const [skel, c] of client) {
    const s = server.get(skel);
    if (!s) {
      unresolved.push({ skeleton: skel, client: c, why: '端脑源码里没有同骨架的声明' });
      continue;
    }
    // ⚠️ 端脑源码里的**完整字面量**才是产物里该有的那段字节。
    const full = [...s.literals].filter((l) => l.startsWith('/api/'));
    if (full.length === 0) {
      unresolved.push({
        skeleton: skel,
        client: c,
        why: '端脑源码里是嵌套子路径（拼不出完整字面量）',
      });
      continue;
    }
    const literal = full[0];
    if (has(literal)) {
      matched++;
      continue;
    }
    missing.push({ skeleton: skel, literal, client: c, server: s });
  }
  return { missing, unresolved, matched };
}

// ────────────────────────────────────────────────────────────────────────────
// 文件系统那几层
// ────────────────────────────────────────────────────────────────────────────

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** 客户端依赖（移动端 Dart 全部文件）。 */
export function collectClientRoutes(dir = MOBILE_LIB) {
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const file of walk(dir)) {
    if (!file.endsWith('.dart')) continue;
    const part = extractClientRoutesFromText(readFileSync(file, 'utf8'), relative(ROOT, file));
    for (const [k, v] of part) {
      if (!out.has(k)) out.set(k, { skeleton: k, literals: new Set(), sites: [] });
      const rec = out.get(k);
      for (const l of v.literals) rec.literals.add(l);
      rec.sites.push(...v.sites);
    }
  }
  return out;
}

/** 端脑源码声明（兄弟仓）。 */
export function collectServerRoutes(dir = SIBLING_TEL) {
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const file of walk(dir)) {
    if (!file.endsWith('.rs')) continue;
    const part = extractServerRoutesFromText(readFileSync(file, 'utf8'), relative(ROOT, file));
    for (const [k, v] of part) {
      if (!out.has(k)) out.set(k, { skeleton: k, literals: new Set(), sites: [] });
      const rec = out.get(k);
      for (const l of v.literals) rec.literals.add(l);
      rec.sites.push(...v.sites);
    }
  }
  return out;
}

/** 产物：jniLibs 下**逐 ABI** 的 .so。 */
export function collectArtifacts(dir = JNI_LIBS) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const abi of readdirSync(dir, { withFileTypes: true })) {
    if (!abi.isDirectory()) continue;
    const so = join(dir, abi.name, SO_NAME);
    if (!existsSync(so)) continue;
    out.push({ abi: abi.name, path: so, bytes: statSync(so).size });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// 主流程
// ────────────────────────────────────────────────────────────────────────────

/** 命令行参数（可覆盖路径 ⇒ 反向验证要能换产物）。 */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--artifacts') out.artifacts = argv[++i];
    else if (a === '--server-dir') out.serverDir = argv[++i];
    else if (a === '--client-dir') out.clientDir = argv[++i];
  }
  return out;
}

function main(argv) {
  const args = parseArgs(argv);
  const clientDir = args.clientDir ? resolve(args.clientDir) : MOBILE_LIB;
  const serverDir = args.serverDir ? resolve(args.serverDir) : SIBLING_TEL;
  const artifactsDir = args.artifacts ? resolve(args.artifacts) : JNI_LIBS;

  console.log(line);
  console.log('端脑 HTTP 路由面 —— 产物级一致性校验');
  console.log(line);

  const client = collectClientRoutes(clientDir);
  const server = collectServerRoutes(serverDir);
  const artifacts = collectArtifacts(artifactsDir);

  const haveServer = existsSync(serverDir);
  console.log('客户端依赖（' + relative(ROOT, clientDir) + ' 里提取）: ' + client.size + ' 条');
  console.log('端脑源码声明（' + relative(ROOT, serverDir) + '）: ' + (haveServer ? server.size + ' 条' : '**不在**'));
  console.log('产物（' + relative(ROOT, artifactsDir) + ' 逐 ABI）: ' + artifacts.length + ' 份');
  for (const a of artifacts) {
    console.log('  · ' + a.abi + '  ' + (a.bytes / 1024 / 1024).toFixed(1) + 'MB  ' + a.path);
  }
  console.log('');

  let failed = 0;

  // ⚠️ **判不了 ≠ 通过** —— 没有端脑源码就归不了因（分不清「端脑从来没有这条
  //   路由」与「你编出来的大脑旧了」）；没有产物就没得比。
  //   ⇒ ⇒ 两种都缺 ⇒ **退出码 2** ⇒ 绝不拿「构造出来的零」冒充验证。
  if (!haveServer || artifacts.length === 0) {
    if (!haveServer) {
      console.log('  ! 端脑源码不在 ⇒ **无法归因**（分不清「端脑从来没有这条」' +
        '与「你编出来的大脑旧了」）⇒ ⇒ 修法：把 ../telencephalon 放回同级目录。');
    }
    if (artifacts.length === 0) {
      console.log('  ! 产物（libencephalon.so）不在 ⇒ 判不了（它被 gitignore，' +
        '干净 checkout 没有）⇒ ⇒ 修法：先编出手机端那份大脑（build-android.ps1）。');
    }
    console.log('');
    console.log('⇒ **判不了**（退出码 2）—— 这一格不能算「通过」。');
    return 2;
  }

  for (const a of artifacts) {
    const buf = readFileSync(a.path);
    const has = (literal) => buf.indexOf(literal, 0, 'latin1') !== -1;
    const { missing, unresolved, matched } = findRouteGaps({ client, server, has });
    console.log('── ABI ' + a.abi + ' ──');
    console.log('  端脑源码里有、产物里也有: ' + matched + ' 条');
    console.log('  端脑源码里有、**产物里没有**: ' + missing.length + ' 条');
    console.log('  查不到归因（端脑源码里没有同骨架）: ' + unresolved.length + ' 条');
    for (const m of missing) {
      console.error('  ✗ ' + m.skeleton);
      console.error('      端脑源码: ' + [...m.server.sites].join(', ') +
        '   字面量: ' + m.literal);
      console.error('      客户端: ' + [...m.client.sites].join(', '));
      console.error('      ⇒ 这条功能在真机上**根本不存在**（404）⇒ ⇒ 界面只会显示' +
        '一条原始错误 ⇒ ⇒ **失败长得像成功**。');
      console.error('      ⇒ 修法：重新编出手机端那份大脑（这份 .so 是旧的）。');
    }
    failed += missing.length;
  }

  console.log('');
  if (failed > 0) {
    console.error('✗ 端脑路由面校验未通过（' + failed + ' 条阻断）。');
    return 1;
  }
  console.log('✓ 端脑路由面校验通过。');
  return 0;
}

// ────────────────────────────────────────────────────────────────────────────
// 判据自检（造夹具 ⇒ 证明这把闸**有牙**）
// ────────────────────────────────────────────────────────────────────────────

function selfTest() {
  const cases = [];
  const check = (name, fn) => {
    try {
      fn();
      cases.push({ name, ok: true });
    } catch (e) {
      cases.push({ name, ok: false, err: e.message });
    }
  };

  const CLIENT = "final r = await _get('/api/telencephalon/lobes/capability-defaults');";
  const SERVER = '.route("/api/telencephalon/lobes/capability-defaults", get(get_defaults))';

  check('① 客户端依赖：从代码里提取得到', () => {
    const c = extractClientRoutesFromText(CLIENT);
    if (c.size !== 1) throw new Error('期望 1 条，实际 ' + c.size);
  });

  check('② 注释里的路径**不算**依赖', () => {
    const c = extractClientRoutesFromText('// GET /api/telencephalon/lobes/capability-defaults');
    if (c.size !== 0) throw new Error('注释被算成依赖了：' + c.size);
  });

  check('③ 中文散文里的路径**不算**依赖', () => {
    const c = extractClientRoutesFromText(
      "const msg = '端脑没有这张面（DELETE /api/telencephalon/agents/$id 不存在）';",
    );
    if (c.size !== 0) throw new Error('散文被算成依赖了：' + c.size);
  });

  check('④ 路径参数归一成同一骨架', () => {
    const a = toSkeleton('/api/telencephalon/agents/{name}/config');
    const b = toSkeleton('/api/telencephalon/agents/' + '$' + '{x}/config');
    if (a !== b) throw new Error('骨架不一致：' + a + ' vs ' + b);
  });

  check('⑤ 端脑源码有、产物没有 ⇒ **恰好 1 红**', () => {
    const c = extractClientRoutesFromText(CLIENT);
    const s = extractServerRoutesFromText(SERVER);
    const g = findRouteGaps({ client: c, server: s, has: () => false });
    if (g.missing.length !== 1) throw new Error('期望恰好 1 条红，实际 ' + g.missing.length);
    if (g.missing[0].literal !== '/api/telencephalon/lobes/capability-defaults') {
      throw new Error('字面量不对：' + g.missing[0].literal);
    }
  });

  check('⑥ 产物里有 ⇒ 0 红', () => {
    const c = extractClientRoutesFromText(CLIENT);
    const s = extractServerRoutesFromText(SERVER);
    const g = findRouteGaps({
      client: c,
      server: s,
      has: (l) => l === '/api/telencephalon/lobes/capability-defaults',
    });
    if (g.missing.length !== 0) throw new Error('期望 0 条红，实际 ' + g.missing.length);
    if (g.matched !== 1) throw new Error('期望命中 1 条，实际 ' + g.matched);
  });

  check('⑦ 端脑源码里没有 ⇒ **不判红**（只列未归因）', () => {
    const c = extractClientRoutesFromText(CLIENT);
    const s = extractServerRoutesFromText('');
    const g = findRouteGaps({ client: c, server: s, has: () => false });
    if (g.missing.length !== 0) throw new Error('不该判红，却红了 ' + g.missing.length);
    if (g.unresolved.length !== 1) throw new Error('期望 1 条未归因，实际 ' + g.unresolved.length);
  });

  let bad = 0;
  console.log(line);
  console.log('判据自检 —— 端脑路由面闸');
  console.log(line);
  for (const c of cases) {
    if (c.ok) console.log('  ✓ ' + c.name);
    else {
      console.error('  ✗ ' + c.name + ' :: ' + c.err);
      bad++;
    }
  }
  console.log('');
  if (bad > 0) {
    console.error('✗ 自检 ' + (cases.length - bad) + '/' + cases.length + '（' + bad + ' 条红）。');
    return 1;
  }
  console.log('✓ 自检 ' + cases.length + '/' + cases.length + '。');
  return 0;
}

// ⚠️ 只在**被直接执行**时才跑 ⇒ ⇒ 反向验证脚本可以 import 本模块的纯函数。
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  process.exit(
    process.argv.includes('--self-test') ? selfTest() : main(process.argv.slice(2)),
  );
}
