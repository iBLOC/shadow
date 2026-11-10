// 「提交面回退闸」的判据自检 —— 在**临时 git 仓**里造真形状，跑同一段扫描代码。

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { scanReverts } from './commit-revert-scan.mjs';
import { declaresRevert, shouldFail } from './commit-revert.mjs';

function mkGit(cwd) {
  const run = (args) => {
    try {
      const out = execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 1e8, stdio: ['ignore', 'pipe', 'pipe'] });
      return { ok: true, out };
    } catch (e) {
      return { ok: false, out: (e.stdout || '') + '', err: String(e.stderr || e.message) };
    }
  };
  return run;
}

function commit(git, msg) {
  git(['add', '-A']);
  git(['-c', 'user.email=t@t.local', '-c', 'user.name=t', 'commit', '-m', msg]);
  return git(['rev-parse', 'HEAD']).out.trim();
}

function write(repo, rel, content) {
  const p = join(repo, rel);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, content, 'utf8');
}

/**
 * **独立小仓** —— 条目级那几格各用一个只有 3 笔提交的仓。
 *
 * ⚠️ **为什么要另开仓**（两条理由，缺一不可）：
 *   ① **形状**：条目级那一档只在「**文件级三档都判不了**」时独立可见
 *      ⇒ ⇒ 夹具必须造出「A 改了**两条以上**条目、B 只把其中一条退回旧版」的形状
 *      ⇒ ⇒ 若 A 只改一条，B 退回它时文件级的「倒回（inverted）」会**先**命中
 *      ⇒ ⇒ ⇒ 那一档就永远没机会上场（**这是实测出来的，不是推的**）。
 *   ② **耗时**：主夹具仓随用例增长到 20+ 笔提交 ⇒ ⇒ 每格都全量扫一遍 ⇒ ⇒ O(n²)
 *      ⇒ ⇒ 小仓只有 3 笔 ⇒ ⇒ 每格只扫 3 笔 ⇒ ⇒ 自检从「分钟级」回到「秒级」。
 *
 * ⚠️ **小仓必须放在主夹具仓之外**（另开一个 mkdtemp）⇒ ⇒ 否则主仓的
 *   `git add -A` 会把小仓的内容也吸进去 ⇒ ⇒ 主仓的读数被污染。
 */
function mkRepo(base, name) {
  const dir = join(base, name);
  mkdirSync(dir, { recursive: true });
  const git = mkGit(dir);
  git(['init', '-q']);
  git(['config', 'user.email', 't@t.local']);
  git(['config', 'user.name', 't']);
  git(['-c', 'user.email=t@t.local', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init']);
  const commitIn = (msg) => commit(git, msg);
  return { dir, git, commit: commitIn };
}

export function runSelfTest() {
  // ⚠️ **夹具目录必须每次唯一**（mkdtemp）⇒ ⇒ 否则两个并发进程会互相删对方的仓
  //   ⇒ ⇒ 自检随机失败 ⇒ ⇒ 治理闸把它读成「闸自己坏了」⇒ ⇒ 假红。
  // ⚠️ 也**不许硬编码绝对路径**：旧写法写死本机目录 ⇒ ⇒ Linux CI 上会造出
  //   一个字面量 `C:` 目录污染 checkout ⇒ ⇒ 一律走系统临时目录。
  const dir = mkdtempSync(join(tmpdir(), 'commit-revert-selftest-'));
  const miniBase = mkdtempSync(join(tmpdir(), 'commit-revert-mini-'));
  try {
    return runSelfTestIn(dir, miniBase);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(miniBase, { recursive: true, force: true });
  }
}

function runSelfTestIn(TMP, MINI) {
  const git = mkGit(TMP);
  git(['init', '-q']);
  // ⚠️ **仓级身份**（不是每条命令带 -c）—— 否则 git revert 这类**会自己造提交**
  //   的命令会因「Author identity unknown」失败 ⇒ ⇒ 夹具就造不出「有意的 revert」。
  git(['config', 'user.email', 't@t.local']);
  git(['config', 'user.name', 't']);
  git(['-c', 'user.email=t@t.local', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init']);

  const cases = [];
  const add = (name, ok, detail) => cases.push({ name, ok, detail });

  // ① 完全回退：B 把 A 对同一文件的增量整个退掉
  write(TMP, 'f.txt', 'x\n');
  commit(git, 'base');
  write(TMP, 'f.txt', 'x\nAAA\n');
  const aFull = commit(git, 'A adds AAA');
  write(TMP, 'f.txt', 'x\n');
  const bFull = commit(git, 'B silently drops AAA');
  const r1 = scanReverts(git, { rev: 'HEAD', limit: 20 });
  const fullHit = r1.events.find((e) => e.kind === 'full' && e.file === 'f.txt');
  add('完全回退 ⇒ 必须抓到 ⇒ 且（没有声明）⇒ **必须判红**',
    !!fullHit && fullHit.commit === bFull && fullHit.reverted === aFull && shouldFail(fullHit),
    fullHit ? '抓到 ' + fullHit.commit.slice(0, 7) + ' ｜ 判红=' + shouldFail(fullHit) : '没抓到');

  // ② 部分回退：B 删掉了 A 刚加上的那一行
  write(TMP, 'p.txt', 'p0\n');
  commit(git, 'p base');
  write(TMP, 'p.txt', 'p0\nPARTIAL_LINE\nkeep\n');
  const aPart = commit(git, 'A adds PARTIAL_LINE');
  write(TMP, 'p.txt', 'p0\nkeep\n');
  const bPart = commit(git, 'B removes PARTIAL_LINE only');
  const r2 = scanReverts(git, { rev: 'HEAD', limit: 20 });
  const partHit = r2.events.find((e) => e.kind === 'partial' && e.file === 'p.txt');
  add('部分回退 ⇒ 必须抓到', !!partHit && partHit.commit === bPart && partHit.reverted === aPart,
    partHit ? '抓到 ' + partHit.commit.slice(0, 7) + ' 行=' + JSON.stringify(partHit.lines) : '没抓到');

  // ③ 不相干的提交（改别的文件）⇒ 不许抓
  write(TMP, 'q.txt', 'q0\n');
  commit(git, 'q base');
  write(TMP, 'q.txt', 'q0\nq1\n');
  commit(git, 'Q touches q only');
  const r3 = scanReverts(git, { rev: 'HEAD', limit: 20 });
  const falseHits = r3.events.filter((e) => e.file === 'q.txt');
  add('不相干的提交 ⇒ 不许抓', falseHits.length === 0, '误抓 ' + falseHits.length + ' 处');

  // ④ 有意的 revert ⇒ 消息能被认出 ⇒ ⇒ 且**那一笔会被放行**（不是「抓不到」）
  //   ⇒ ⇒ 注意：revert 一个**已被别人回退过**的提交会冲突 ⇒ ⇒ 夹具要自己造一个干净的。
  write(TMP, 's.txt', 's0\n');
  commit(git, 'S base');
  write(TMP, 's.txt', 's0\nS1\n');
  const sCommit = commit(git, 'S adds S1');
  git(['revert', '--no-edit', sCommit]);
  const msg = git(['show', '-s', '--format=%B', 'HEAD']).out;
  const r4 = scanReverts(git, { rev: 'HEAD', limit: 20 });
  const sHit = r4.events.find((e) => e.file === 's.txt');
  add('有意 revert ⇒ 消息能认出 ⇒ 且那笔被放行',
    declaresRevert(msg) && !!sHit && declaresRevert(sHit.message) && !shouldFail(sHit),
    'msg 首行=' + JSON.stringify((msg || '').split('\n')[0]) + ' ｜ 该笔=' + (sHit ? sHit.kind : '没抓到'));

  // ⑤ 新增文件后又删掉 ⇒ 不许抓（「新增即删」不是悄悄回退）
  write(TMP, 'n.txt', 'n0\n');
  const aNew = commit(git, 'N adds n.txt');
  git(['rm', '-q', 'n.txt']);
  const bNew = commit(git, 'N removes n.txt again');
  const r5 = scanReverts(git, { rev: 'HEAD', limit: 20 });
  const newHits = r5.events.filter((e) => e.file === 'n.txt');
  add('新增即删 ⇒ 不许抓', newHits.length === 0, '误抓 ' + newHits.length + ' 处');

  // ⑥ 登记在册 ⇒ 放行（且**没有**登记时必须判红）
  // ⚠️ 登记的是**退人的那一笔**（B）—— 判红的事件是「B 退掉了 A」⇒ ⇒ 登记项的 commit 是 B。
  const reg = [{ commit: bFull, file: 'f.txt', why: '夹具登记' }];
  add('登记在册 ⇒ 放行 ｜ 没登记 ⇒ 判红',
    !!fullHit && shouldFail(fullHit, reg) === false && shouldFail(fullHit, []) === true,
    '登记后=' + shouldFail(fullHit, reg) + ' ｜ 未登记=' + shouldFail(fullHit, []));

  // ⑦ 抹空：B 把一个**非空**文件写成**零字节** ⇒ ⇒ 必须抓到 ⇒ 且必须判红
  //    ⚠️ 这一类的真样本是 2026-11-11 本会话自己造成的事故（5c85035 把台账写成空）。
  write(TMP, 'w.txt', 'w0\n');
  commit(git, 'w base');
  write(TMP, 'w.txt', 'w0\nW1\n');
  const aWipe = commit(git, 'A adds W1');
  write(TMP, 'w.txt', '');
  const bWipe = commit(git, 'B wipes the file to zero bytes');
  const r7 = scanReverts(git, { rev: 'HEAD', limit: 20 });
  const wipeHit = r7.events.find((e) => e.kind === 'wiped' && e.file === 'w.txt');
  add('抹空 ⇒ 必须抓到 ⇒ 且（没有声明）⇒ **必须判红**',
    !!wipeHit && wipeHit.commit === bWipe && wipeHit.reverted === aWipe && shouldFail(wipeHit),
    wipeHit ? '抓到 ' + wipeHit.commit.slice(0, 7) + ' kind=' + wipeHit.kind + ' ｜ 判红=' + shouldFail(wipeHit) : '没抓到');

  // ⑧ 抹空但**有声明** ⇒ ⇒ 放行（声明机制对这一类同样生效）
  const declaredWipe = Object.assign({}, wipeHit || {}, { message: 'Revert "A adds W1"' });
  add('抹空但有声明 ⇒ 放行', !!wipeHit && shouldFail(declaredWipe) === false,
    '判红=' + shouldFail(declaredWipe));

  // ⑨ 抹空但**登记在册** ⇒ ⇒ 放行（且**没有**登记时必须判红）
  const regW = [{ commit: bWipe, file: 'w.txt', why: '夹具登记' }];
  add('抹空但登记在册 ⇒ 放行 ｜ 没登记 ⇒ 判红',
    !!wipeHit && shouldFail(wipeHit, regW) === false && shouldFail(wipeHit, []) === true,
    '登记后=' + shouldFail(wipeHit, regW) + ' ｜ 未登记=' + shouldFail(wipeHit, []));

  // ⑩ ⚠️ **倒回（inverted）** —— B 把 A 的**整个增量**原样倒回（A 加的行全删、A 删的行原字加回），
  //    且 B **夹带自己的改动** ⇒ ⇒ 文件**没有**回到 A 之前 ⇒ ⇒ 'full' 抓不到它
  //    ⇒ ⇒ 必须单设一档 ⇒ ⇒ 且（没有声明）⇒ ⇒ **必须判红**。
  //    ⚠️ 真形状取自真历史：`c62f500` 把 `639a556` 的 5 行原样倒回并夹带自己的 5 行。
  write(TMP, 'i.txt', 'i0\nOLD\n');
  commit(git, 'i base');
  write(TMP, 'i.txt', 'i0\nNEW1\nNEW2\n');
  const aInv = commit(git, 'A rewrites OLD into NEW1/NEW2');
  write(TMP, 'i.txt', 'i0\nOLD\nB_OWN\n');
  const bInv = commit(git, 'B inverts A and adds its own line');
  const r10 = scanReverts(git, { rev: 'HEAD', limit: 40 });
  const invHit = r10.events.find((e) => e.kind === 'inverted' && e.file === 'i.txt' && e.commit === bInv);
  add('倒回 ⇒ 必须抓到 kind=inverted ⇒ 且（没有声明）⇒ **必须判红**',
    !!invHit && invHit.reverted === aInv && shouldFail(invHit),
    invHit ? '抓到 ' + invHit.commit.slice(0, 7) + ' kind=' + invHit.kind + ' ｜ 判红=' + shouldFail(invHit) : '没抓到');

  // ⑪ **负控**：A 加了 2 行、删了 1 行；B **只删了其中 1 行**（也没把 A 删的行加回来）
  //    ⇒ ⇒ hit ⊊ aAdd ⇒ ⇒ **不许**落 'inverted'（仍是 'partial'）⇒ ⇒ 闸不许见风就是红。
  write(TMP, 'j.txt', 'j0\nJOLD\n');
  commit(git, 'j base');
  write(TMP, 'j.txt', 'j0\nJNEW1\nJNEW2\n');
  const aJ = commit(git, 'A rewrites JOLD into JNEW1/JNEW2');
  write(TMP, 'j.txt', 'j0\nJNEW2\n');
  const bJ = commit(git, 'B removes only one of the two added lines');
  const r11 = scanReverts(git, { rev: 'HEAD', limit: 40 });
  const jHit = r11.events.find((e) => e.file === 'j.txt' && e.commit === bJ);
  add('负控（只删一部分）⇒ **不许**落 inverted ⇒ 仍是 partial',
    !!jHit && jHit.kind === 'partial' && jHit.reverted === aJ && !shouldFail(jHit),
    jHit ? 'kind=' + jHit.kind + ' ｜ 判红=' + shouldFail(jHit) : '没抓到');

  // ⑫ **两档不许重叠**：A **只加不删**、B 把 A 加的行全删 ⇒ ⇒ 文件整个回到 A 之前
  //    ⇒ ⇒ 那是 **'full'** 那一档（不是 'inverted'）⇒ ⇒ 证明 `removedByA.size > 0` 那条守卫的用处。
  write(TMP, 'k.txt', 'k0\n');
  commit(git, 'k base');
  write(TMP, 'k.txt', 'k0\nK1\n');
  const aK = commit(git, 'A only adds K1');
  write(TMP, 'k.txt', 'k0\n');
  const bK = commit(git, 'B removes K1 entirely');
  const r12 = scanReverts(git, { rev: 'HEAD', limit: 40 });
  const kHit = r12.events.find((e) => e.file === 'k.txt' && e.commit === bK);
  add('A 只加不删、B 全删 ⇒ 落 **full**（不是 inverted）⇒ 两档不许重叠',
    !!kHit && kHit.kind === 'full' && kHit.reverted === aK,
    kHit ? 'kind=' + kHit.kind : '没抓到');

  // ⑬ **划界**（这一格是**故意收窄**的地方，不是漏网）：A **只加不删**、B 把 A 加的行全删
  //    **并夹带自己的改动** ⇒ ⇒ 「原样倒回」**无字可原样加回** ⇒ ⇒ 与「改写重写」不可区分
  //    ⇒ ⇒ 刻意留在 'partial'（只提示）⇒ ⇒ 改写是正常演进里最常见的一类 ⇒ ⇒ 不许判红。
  write(TMP, 'm.txt', 'm0\n');
  commit(git, 'm base');
  write(TMP, 'm.txt', 'm0\nM1\n');
  const aM = commit(git, 'A only adds M1');
  write(TMP, 'm.txt', 'm0\nM2\n');
  const bM = commit(git, 'B replaces M1 with M2');
  const r13 = scanReverts(git, { rev: 'HEAD', limit: 40 });
  const mHit = r13.events.find((e) => e.file === 'm.txt' && e.commit === bM);
  add('划界（A 只加不删 ＋ 夹带改动）⇒ **不许**落 inverted ⇒ 留在 partial',
    !!mHit && mHit.kind === 'partial' && !shouldFail(mHit),
    mHit ? 'kind=' + mHit.kind + ' ｜ 判红=' + shouldFail(mHit) : '没抓到');

  // ⑭ 倒回但**有声明** ⇒ ⇒ 放行（声明机制对第三档同样生效）
  const declaredInv = Object.assign({}, invHit || {}, { message: 'Revert "A rewrites OLD into NEW1/NEW2"' });
  add('倒回但有声明 ⇒ 放行', !!invHit && shouldFail(declaredInv) === false,
    '判红=' + shouldFail(declaredInv));

  // ⑮ 倒回但**登记在册** ⇒ ⇒ 放行（且**没有**登记时必须判红）
  const regI = [{ commit: bInv, file: 'i.txt', why: '夹具登记' }];
  add('倒回但登记在册 ⇒ 放行 ｜ 没登记 ⇒ 判红',
    !!invHit && shouldFail(invHit, regI) === false && shouldFail(invHit, []) === true,
    '登记后=' + shouldFail(invHit, regI) + ' ｜ 未登记=' + shouldFail(invHit, []));

  // ─────────────────────────────────────────────────────────────────────
  // 条目级那几格（'entry-reverted'）—— ⚠️ **各自用独立小仓**（见 mkRepo 的注释）。
  // ─────────────────────────────────────────────────────────────────────
  const G1 = String.fromCodePoint(0x32ff);
  const G2 = String.fromCodePoint(0x3340);
  const G3 = String.fromCodePoint(0x3341);
  const G4 = String.fromCodePoint(0x3342);
  const PARENT = '**Updated**:';
  const MOBILE = '**Updated:**';
  const e1 = (shape, v) => shape + ' 2026-01-01 (' + G1 + ' **条目一** —— 本条占 U+32FF。)\n' + v;
  const e2 = (shape, v) => shape + ' 2026-01-01 (' + G2 + ' **条目二** —— 本条占 U+3340。)\n' + v;
  const e3 = (shape) => shape + ' 2026-01-02 (' + G3 + ' **条目三** —— 本条占 U+3341。)\n③ 正文三。';
  const e4 = (shape) => shape + ' 2026-01-03 (' + G4 + ' **条目四** —— 本条占 U+3342。)\n④ 正文四。';

  // ⑯ **正例（条目级回退）** —— B 把 A 改过的那一条台账条目，退回成 A 之前的那个版本
  //    （**逐字相同**）⇒ ⇒ 文件级三档都看不见（整文件不是旧版 ＋ 增量没被整个倒回）
  //    ⇒ ⇒ 必须单设一档 ⇒ ⇒ 且（没有声明）⇒ ⇒ **必须判红**。
  //    ⚠️ **形状的关键**：A 必须改**两条以上**条目、B 只把其中一条退回旧版
  //    ⇒ ⇒ 否则「整个增量被逐行倒回」那一档（'inverted'）会**先**命中
  //    ⇒ ⇒ ⇒ **这一档只在「A 动的不止一条条目」时才独立可见**（实测，见 ⑳）。
  //    ⚠️ 真形状：**并发「旧基拼提交面」** —— B 用落后于 A 的基线写台账 ⇒ ⇒
  //    ⇒ ⇒ B 的台账里那一条**逐字等于 A 之前的版本** ⇒ ⇒ 而 B 还夹带了自己的新条目。
  const M1 = mkRepo(MINI, 'ent-positive');
  write(M1.dir, 'AGENTS.md', e1(PARENT, '① 正文一。') + '\n' + e2(PARENT, '② 正文二。') + '\n');
  M1.commit('ledger base');
  write(M1.dir, 'AGENTS.md', e1(PARENT, '① 正文一（A 改过）。') + '\n' + e2(PARENT, '② 正文二（A 改过）。') + '\n');
  const aEnt = M1.commit('A rewrites two ledger entries');
  write(M1.dir, 'AGENTS.md', e1(PARENT, '① 正文一。') + '\n' + e2(PARENT, '② 正文二（A 改过）。') + '\n' + e3(PARENT) + '\n');
  const bEnt = M1.commit('B restores entry one verbatim and keeps entry two');
  const r16 = scanReverts(M1.git, { rev: 'HEAD', limit: 10 });
  const entHit = r16.events.find((e) => e.kind === 'entry-reverted' && e.file === 'AGENTS.md' && e.commit === bEnt);
  add('条目退回旧版 ⇒ 必须抓到 kind=entry-reverted ⇒ 且（没有声明）⇒ **必须判红**',
    !!entHit && entHit.reverted === aEnt && shouldFail(entHit),
    entHit ? '抓到 ' + entHit.commit.slice(0, 7) + ' kind=' + entHit.kind + ' 符号=' + JSON.stringify(entHit.symbols) + ' ｜ 判红=' + shouldFail(entHit) : '没抓到');

  // ⑰ **负控①**：B 把那一条改写成**全新**内容（不是旧版）⇒ ⇒ 不许落这一档（分界线＝逐字等于旧版）
  //    ⚠️ 这一格顺带证明**移动端那种标题形状**（冒号在加粗**内**）也切得出来。
  const M2 = mkRepo(MINI, 'ent-newtext');
  write(M2.dir, 'shadow-mobile/AGENTS.md', e1(MOBILE, '① 正文一。') + '\n' + e2(MOBILE, '② 正文二。') + '\n');
  M2.commit('mobile ledger base');
  write(M2.dir, 'shadow-mobile/AGENTS.md', e1(MOBILE, '① 正文一（A 改过）。') + '\n' + e2(MOBILE, '② 正文二（A 改过）。') + '\n');
  const aMob = M2.commit('A rewrites two mobile entries');
  write(M2.dir, 'shadow-mobile/AGENTS.md', e1(MOBILE, '① 正文一（全新重写）。') + '\n' + e2(MOBILE, '② 正文二（A 改过）。') + '\n' + e3(MOBILE) + '\n');
  const bMob = M2.commit('B rewrites entry one with brand new content');
  const r17 = scanReverts(M2.git, { rev: 'HEAD', limit: 10 });
  const mobHit = r17.events.find((e) => e.file === 'shadow-mobile/AGENTS.md' && e.commit === bMob);
  add('负控（把那条改写成**全新**内容）⇒ 不许落 entry-reverted ⇒ 留在 partial',
    !!mobHit && mobHit.kind === 'partial' && mobHit.reverted === aMob && !shouldFail(mobHit),
    mobHit ? 'kind=' + mobHit.kind : '没抓到');

  // ⑱ **负控②（划界）**：B 把那一条**删掉** ⇒ ⇒ 那是「**条目退役**」（正常演进）⇒ ⇒ 不许判红
  const M3 = mkRepo(MINI, 'ent-retired');
  write(M3.dir, 'shadow-desktop/AGENTS.md', e1(PARENT, '① 正文一。') + '\n' + e2(PARENT, '② 正文二。') + '\n');
  M3.commit('desktop ledger base');
  write(M3.dir, 'shadow-desktop/AGENTS.md', e1(PARENT, '① 正文一（A 改过）。') + '\n' + e2(PARENT, '② 正文二（A 改过）。') + '\n');
  const aDesk = M3.commit('A rewrites two desktop entries');
  write(M3.dir, 'shadow-desktop/AGENTS.md', e2(PARENT, '② 正文二（A 改过）。') + '\n' + e3(PARENT) + '\n');
  const bDesk = M3.commit('B retires desktop entry one');
  const r18 = scanReverts(M3.git, { rev: 'HEAD', limit: 10 });
  const deskHit = r18.events.find((e) => e.file === 'shadow-desktop/AGENTS.md' && e.commit === bDesk);
  add('负控（条目**退役**＝被删掉）⇒ 不许落 entry-reverted ⇒ 留在 partial（划界）',
    !!deskHit && deskHit.kind === 'partial' && deskHit.reverted === aDesk && !shouldFail(deskHit),
    deskHit ? 'kind=' + deskHit.kind : '没抓到');

  // ⑲ **负控③**：**非台账文件**上的同一形状 ⇒ ⇒ 这一档只对台账生效 ⇒ ⇒ 不许落
  const M4 = mkRepo(MINI, 'ent-nonledger');
  write(M4.dir, 'notes.md', e1(PARENT, '① 正文一。') + '\n' + e2(PARENT, '② 正文二。') + '\n');
  M4.commit('notes base');
  write(M4.dir, 'notes.md', e1(PARENT, '① 正文一（A 改过）。') + '\n' + e2(PARENT, '② 正文二（A 改过）。') + '\n');
  const aNotes = M4.commit('A rewrites two notes entries');
  write(M4.dir, 'notes.md', e1(PARENT, '① 正文一。') + '\n' + e2(PARENT, '② 正文二（A 改过）。') + '\n' + e3(PARENT) + '\n');
  const bNotes = M4.commit('B restores notes entry one verbatim');
  const r19 = scanReverts(M4.git, { rev: 'HEAD', limit: 10 });
  const notesHit = r19.events.find((e) => e.file === 'notes.md' && e.commit === bNotes);
  add('负控（**非台账文件**的同一形状）⇒ 不许落 entry-reverted ⇒ 留在 partial',
    !!notesHit && notesHit.kind === 'partial' && notesHit.reverted === aNotes && !shouldFail(notesHit),
    notesHit ? 'kind=' + notesHit.kind : '没抓到');

  // ⑳ **负控④（真历史实测出来的假阳性族）** —— 「**合法去重**」：A 把同一段**重复插了两份**，
  //    B 删掉其中一份 ⇒ ⇒ 这一条的正文**逐字**变回 A 之前的版本
  //    ⇒ ⇒ 「逐字等于旧版」**单独**会误判红 ⇒ ⇒ 而那一笔**一行新内容都没引入**
  //    ⇒ ⇒ ⇒ **判据要问「A 到底有没有引入新东西」** ⇒ ⇒ 这一格锁住那条分界线。
  const M5 = mkRepo(MINI, 'ent-dedup');
  write(M5.dir, 'AGENTS.md', e1(PARENT, '① 正文一。\n② 第二段。') + '\n' + e2(PARENT) + '\n');
  M5.commit('ledger base');
  write(M5.dir, 'AGENTS.md', e1(PARENT, '① 正文一。\n② 第二段。\n② 第二段。') + '\n' + e2(PARENT) + '\n' + e4(PARENT) + '\n');
  const aDedup = M5.commit('A duplicates that paragraph by mistake and adds an entry');
  write(M5.dir, 'AGENTS.md', e1(PARENT, '① 正文一。\n② 第二段。') + '\n' + e2(PARENT) + '\n' + e4(PARENT) + '\n');
  const bDedup = M5.commit('B removes the duplicated paragraph and keeps the new entry');
  const r20 = scanReverts(M5.git, { rev: 'HEAD', limit: 10 });
  const dedupHit = r20.events.find((e) => e.file === 'AGENTS.md' && e.commit === bDedup);
  add('负控（**合法去重**）⇒ 不许落 entry-reverted ⇒ 留在 partial',
    !!dedupHit && dedupHit.kind === 'partial' && dedupHit.reverted === aDedup && !shouldFail(dedupHit),
    dedupHit ? 'kind=' + dedupHit.kind : '没抓到');

  // ㉑ **两档不许重叠（这一格是实测出来的边界）** —— A 只改**一条**条目、B 把它退回旧版
  //    ⇒ ⇒ B 的 diff 就是 A 的 diff 的逐行逆 ⇒ ⇒ 文件级的「倒回（inverted）」**先**命中
  //    ⇒ ⇒ ⇒ 这一档**只在「A 动的不止一条条目」时才独立可见** ⇒ ⇒ 两档不许重叠、不许双计。
  const M6 = mkRepo(MINI, 'ent-overlap');
  write(M6.dir, 'AGENTS.md', e1(PARENT, '① 正文一。') + '\n' + e2(PARENT, '② 正文二。') + '\n');
  M6.commit('ledger base');
  write(M6.dir, 'AGENTS.md', e1(PARENT, '① 正文一（A 改过）。') + '\n' + e2(PARENT, '② 正文二。') + '\n' + e4(PARENT) + '\n');
  const aOv = M6.commit('A rewrites one ledger entry and adds another');
  write(M6.dir, 'AGENTS.md', e1(PARENT, '① 正文一。') + '\n' + e2(PARENT, '② 正文二。') + '\n' + e3(PARENT) + '\n');
  const bOv = M6.commit('B restores that one entry verbatim and adds its own');
  const r21 = scanReverts(M6.git, { rev: 'HEAD', limit: 10 });
  const ovHit = r21.events.find((e) => e.file === 'AGENTS.md' && e.commit === bOv);
  add('两档不许重叠（A 只改一条 ⇒ 文件级倒回先命中）⇒ 落 inverted 而非 entry-reverted',
    !!ovHit && ovHit.kind === 'inverted' && ovHit.reverted === aOv && shouldFail(ovHit),
    ovHit ? 'kind=' + ovHit.kind : '没抓到');

  // ㉒ **逃逸口**：条目退回旧版但**有声明** ⇒ ⇒ 放行（声明机制对第四档同样生效）
  const declaredEnt = Object.assign({}, entHit || {}, { message: 'Revert "A rewrites two ledger entries"' });
  add('条目退回旧版但有声明 ⇒ 放行', !!entHit && shouldFail(declaredEnt) === false,
    '判红=' + shouldFail(declaredEnt));

  const passed = cases.filter((c) => c.ok).length;
  return { passed, total: cases.length, cases };
}
