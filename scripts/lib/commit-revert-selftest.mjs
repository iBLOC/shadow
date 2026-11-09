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

  const passed = cases.filter((c) => c.ok).length;
  return { passed, total: cases.length, cases };
}