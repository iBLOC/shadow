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

export function runSelfTest() {
  // ⚠️ **夹具目录必须每次唯一**（mkdtemp）⇒ ⇒ 否则两个并发进程会互相删对方的仓
  //   ⇒ ⇒ 自检随机失败 ⇒ ⇒ 治理闸把它读成「闸自己坏了」⇒ ⇒ 假红。
  // ⚠️ 也**不许硬编码绝对路径**：旧写法写死本机目录 ⇒ ⇒ Linux CI 上会造出
  //   一个字面量 `C:` 目录污染 checkout ⇒ ⇒ 一律走系统临时目录。
  const dir = mkdtempSync(join(tmpdir(), 'commit-revert-selftest-'));
  try {
    return runSelfTestIn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runSelfTestIn(TMP) {
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

  const passed = cases.filter((c) => c.ok).length;
  return { passed, total: cases.length, cases };
}