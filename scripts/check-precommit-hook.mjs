#!/usr/bin/env node
/**
 * **提交前那道闸** —— 「你这一笔把一个非空文件写成了零字节」。
 * ============================================================================
 *
 * ## 它守什么
 *
 * ⚠️ **2026-11-11 真事故**（iBLOC/shadow，本会话自己造成的）：
 *   `git hash-object --stdin` 的 `input` 被误当成环境变量 ⇒ ⇒ stdin 为空
 *   ⇒ ⇒ 提交树面里那个文件是**零字节**（台账 AGENTS.md 2.45 MB ⇒ ⇒ 0）
 *   ⇒ ⇒ master 上的台账整本消失 ⇒ ⇒ **两分钟后**才被发现。
 *
 * ⇒ ⇒ 提交**之后**才跑的那道闸（`check-commit-revert.mjs`）能**照出**它，
 *   但**防不住**它 ⇒ ⇒ 这一刀把同一族的判定搬到**提交前** ⇒ ⇒ 拦在当场。
 *
 * ## 退出码
 *
 *   · 0 —— 绿（没有抹空）；
 *   · 1 —— 红（**有**文件被写成零字节）⇒ ⇒ 钩子据此拦下提交；
 *   · 2 —— **判不了**（git 读不出来 / 没有 HEAD）⇒ ⇒ ⚠️ **判不了时不许拦人**
 *     ⇒ ⇒ 钩子对 2 一律放行（fail-safe：宁可漏，不可卡住别人的提交）。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/check-precommit-hook.mjs              # 查当前仓的暂存面
 * node scripts/check-precommit-hook.mjs --self-test  # 判据自检（临时仓夹具）
 * node scripts/check-precommit-hook.mjs --hook       # 给钩子用（失败才拦）
 * ```
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkStagedWipes, emptyBlobHash } from './lib/precommit-wipe.mjs';

// ⚠️ **不许写死 Windows 绝对路径**（2026-11-11 真 CI 实测）：写死 ⇒ ⇒ Linux CI 上
//   夹具建在字面目录名 `C:` 下，且「用绝对路径调用自己」会找不到模块
//   ⇒ ⇒ 判据自检 0/4 ⇒ ⇒ CI 红了而本地 4/4 绿（平台差异族）。
// ⇒ ⇒ 一律从**脚本自身位置**推路径 ⇒ ⇒ 跨平台同形。
// ⚠️ 但**固定目录名不许留**：并发跑时两个进程会互相 `rmSync` 对方的仓
//   ⇒ ⇒ 自检随机失败 ⇒ ⇒ 治理闸把它读成「闸自己坏了」⇒ ⇒ 假红。
//   ⇒ ⇒ 一律用 mkdtemp 在系统临时目录下开**每次唯一**的夹具目录。
const HERE = fileURLToPath(new URL('.', import.meta.url));

function mkGit(cwd) {
  return (args) => {
    try {
      const out = execFileSync('git', ['-C', cwd, ...args], {
        encoding: 'utf8', maxBuffer: 1e8, stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { ok: true, out };
    } catch (e) {
      return { ok: false, out: (e.stdout || '') + '', err: String(e.stderr || e.message) };
    }
  };
}

/** 取暂存面与 HEAD 两侧的字节数（一次 batch-check 拿全部大小）。 */
export function collectEntries(git, cwd) {
  const list = git(['diff', '--cached', '--name-only', '--diff-filter=AM'], {}).out
    .split('\n').map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return { entries: [], notes: [] };

  const fmt = git(['rev-parse', '--show-object-format'], {}).out.trim();
  const empty = emptyBlobHash(fmt);

  const indexBlob = new Map();
  const ls = git(['ls-files', '-s', '--'], {}).out;
  for (const line of ls.split('\n')) {
    const m = line.match(/^(\d{6}) ([0-9a-f]{40}) \d+\t(.*)$/);
    if (m) indexBlob.set(m[3], m[2]);
  }

  const headBlob = new Map();
  const hl = git(['ls-tree', '-r', 'HEAD'], {}).out;
  for (const line of hl.split('\n')) {
    const m = line.match(/^(\d{6}) blob ([0-9a-f]{40})\t(.*)$/);
    if (m) headBlob.set(m[3], m[2]);
  }

  const paths = [];
  for (const p of list) {
    const ib = indexBlob.get(p) || null;
    const hb = headBlob.get(p) || null;
    if (!ib) continue;
    paths.push({ path: p, indexBlob: ib, headBlob: hb, isEmptyBlob: ib === empty });
  }
  if (paths.length === 0) return { entries: [], notes: [] };

  // ⚠️⚠️ **不查长度** —— 判「零字节」只比**哈希**（空 blob 的哈希是常量）⇒ ⇒
  //   零次额外 git 调用 ⇒ ⇒ 而且**不会踩到「那个空对象不在对象库里」那个坑**
  //   （实测：`git cat-file --batch-check` 对它回的是 **missing**，
  //     而「拿不到长度」在代码里长得很像「长度不是 0」⇒ ⇒ 第一版就是这么漏的）。
  return { entries: paths, notes: [] };
}

/** 在当前仓里查（返回 { wipes, notes }）。 */
export function scan(cwd) {
  const git = mkGit(cwd);
  const hasHead = git(['rev-parse', '--verify', 'HEAD'], {}).ok;
  if (!hasHead) return { wipes: [], notes: ['这个仓还没有 HEAD（第一次提交）⇒ ⇒ 没有「被抹掉」可言'] };
  const { entries, notes } = collectEntries(git, cwd);
  const fmt = git(['rev-parse', '--show-object-format'], {}).out.trim();
  return { wipes: checkStagedWipes(entries, emptyBlobHash(fmt)), notes: notes };
}

function selftest() {
  // ⚠️ **夹具目录必须每次唯一**（mkdtemp）⇒ ⇒ 否则并发跑会互相删对方的仓。
  const dir = mkdtempSync(join(tmpdir(), 'precommit-hook-selftest-'));
  try {
    return selftestIn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function selftestIn(TMP) {
  const git = mkGit(TMP);
  git(['init', '-q'], {});
  git(['config', 'user.email', 't@t.local'], {});
  git(['config', 'user.name', 't'], {});

  const write = (rel, content) => {
    const p = join(TMP, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, content, 'utf8');
  };
  const commit = (msg) => {
    git(['add', '-A'], {});
    git(['commit', '-m', msg], {});
  };
  const runCli = () => {
    try {
      const out = execFileSync('node', [join(HERE, 'check-precommit-hook.mjs')], {
        encoding: 'utf8', cwd: TMP, stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { code: 0, out };
    } catch (e) {
      return { code: e.status === undefined ? 1 : e.status, out: (e.stdout || '') + (e.stderr || '') };
    }
  };

  const results = [];
  const add = (name, ok, detail) => results.push({ name, ok, detail });

  // ① 非空文件被改成零字节 ⇒ ⇒ 必须抓到（退出码 1）
  write('a.txt', 'content A\n');
  commit('base');
  write('a.txt', '');
  git(['add', 'a.txt'], {});
  const r1 = runCli();
  add('非空文件被写成零字节 ⇒ ⇒ **必须拦下**（退出码 1）',
    r1.code === 1 && r1.out.includes('a.txt'),
    '退出码=' + r1.code + ' ｜ 输出首行=' + (r1.out.trim().split('\n')[0] || '').slice(0, 90));

  // ② 正常改动 ⇒ ⇒ 必须放行
  git(['reset', '--hard', 'HEAD'], {});
  write('a.txt', 'content A\nplus a line\n');
  git(['add', 'a.txt'], {});
  const r2 = runCli();
  add('正常改动 ⇒ ⇒ 必须放行（退出码 0）', r2.code === 0, '退出码=' + r2.code);

  // ③ 新增一个**空**文件 ⇒ ⇒ 必须放行（新增空文件是合法动作）
  git(['reset', '--hard', 'HEAD'], {});
  write('brand-new.txt', '');
  git(['add', 'brand-new.txt'], {});
  const r3 = runCli();
  add('新增一个空文件 ⇒ ⇒ 必须放行（那不是抹空）', r3.code === 0, '退出码=' + r3.code);

  // ④ HEAD 里本来就是空的文件 ⇒ ⇒ 必须放行（它一直是空的）
  git(['reset', '--hard', 'HEAD'], {});
  write('empty-always.txt', '');
  commit('add an always-empty file');
  write('empty-always.txt', '');
  git(['add', 'empty-always.txt'], {});
  const r4 = runCli();
  add('HEAD 里本来就是空的文件 ⇒ ⇒ 必须放行', r4.code === 0, '退出码=' + r4.code);

  const ok = results.filter((r) => r.ok).length;
  for (const r of results) console.log((r.ok ? '  ✅ ' : '  ❌ ') + r.name + ' —— ' + r.detail);
  console.log('判据自检：' + ok + '/' + results.length + ' 通过');
  return ok === results.length;
}

function main(argv) {
  if (argv.includes('--self-test')) process.exit(selftest() ? 0 : 1);

  const cwd = process.cwd();
  const isHook = argv.includes('--hook');
  try {
    const { wipes, notes } = scan(cwd);
    for (const n of notes) console.log('::notice::' + n);
    if (wipes.length === 0) {
      console.log('提交前闸：暂存面里没有「非空文件被写成零字节」⇒ ⇒ 放行');
      process.exit(0);
    }
    console.log('');
    console.log('❌ 提交前闸：这一笔把 **' + wipes.length + ' 个非空文件写成了零字节**：');
    for (const w of wipes) {
      console.log('   · ' + w.path + '（HEAD 里的 blob ' + w.headBlob.slice(0, 8) + '… 是非空的 ⇒ ⇒ 暂存面里被写成了**空 blob**）');
    }
    console.log('');
    console.log('⚠️ 这一类事故**真发生过**（2026-11-11：台账 AGENTS.md 被提交成零字节 ⇒ ⇒ master 上整本消失）。');
    console.log('⚠️ 若这是**故意**的（例如要清空一个文件）⇒ ⇒ 请在提交信息里写明「清空 <路径>」，再重新提交。');
    console.log('⚠️ 确实要绕过：git commit --no-verify');
    process.exit(1);
  } catch (e) {
    // ⚠️ **fail-safe**：判不了 ⇒ ⇒ 放行（绝不卡住别人的提交）
    if (isHook) {
      console.log('::warning::提交前闸判不了（' + String(e && e.message ? e.message : e) + '）⇒ ⇒ 放行');
      process.exit(0);
    }
    console.error('❌ 提交前闸判不了：' + String(e && e.message ? e.message : e));
    process.exit(2);
  }
}

main(process.argv.slice(2));
