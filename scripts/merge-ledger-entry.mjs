#!/usr/bin/env node
// 合并「HEAD ＋ 我这一条台账条目」⇒ ⇒ 产出一个可交给 `git hash-object` 的
// 合并文件。
//
// ⚠️⚠️ **为什么要有这个脚本（别手搓）** —— 2026-11-16 踩过一次：
// 手搓的合并脚本取「工作树里**第一个** `**Updated**:` **之前**的内容」当
// 「我的条目」⇒ ⇒ 而**我的条目本身就是那个 `**Updated**:` 行** ⇒ ⇒ 条目
// 被自己切掉 ⇒ ⇒ 父仓变成「HEAD 原样」（条目丢了）＋ **移动端账本被截断成
// 35 行**（原本 1183 行）⇒ ⇒ 那笔提交差点把一整本账本写没了。
// ⇒ ⇒ 修法：取 **[第一个 Updated, 第二个 Updated)** —— 那**正是**我那一条
// 所在的那一段。
//
// 用法：
//   node scripts/merge-ledger-entry.mjs \
//     --work <工作树里的账本路径> --repo <仓根> --rel <仓内相对路径> \
//     --out <合并文件输出路径>
//   （可重复给多组 `--work/--repo/--rel/--out`）
//
// ⚠️ **防截断**：合并结果的行数必须 **≥** HEAD 版的行数 ⇒ ⇒ 少了就**报错退出**
// ⇒ ⇒ 宁可不产出，也不产出一个被截断的账本。

import fs from 'fs';
import { execSync } from 'child_process';

const MARK = '**Updated**: ';

function parseArgs(argv) {
  const jobs = [];
  let cur = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--work') cur = { work: argv[++i] };
    else if (a === '--repo') cur = { ...(cur || {}), repo: argv[++i] };
    else if (a === '--rel') cur = { ...(cur || {}), rel: argv[++i] };
    else if (a === '--out') {
      cur = { ...(cur || {}), out: argv[++i] };
      jobs.push(cur);
      cur = null;
    } else {
      throw new Error(`unknown argument: ${a}`);
    }
  }
  for (const j of jobs) {
    for (const k of ['work', 'repo', 'rel', 'out']) {
      if (!j[k]) throw new Error(`missing --${k}`);
    }
  }
  return jobs;
}

function gitShow(repo, rel) {
  return execSync(`git -C "${repo}" show HEAD:${rel}`, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function mergeOne(job) {
  const workLines = fs.readFileSync(job.work, 'utf8').split('\n');
  const marks = [];
  workLines.forEach((l, i) => { if (l.startsWith(MARK)) marks.push(i); });
  if (marks.length < 2) {
    throw new Error(
      `${job.work}: need >=2 "${MARK}" markers (mine + the next one), got ${marks.length}`,
    );
  }
  // ⚠️ **我的条目** ＝ [第一个, 第二个) —— 第一个**就是**我那条
  const mine = workLines.slice(marks[0], marks[1]).join('\n');
  const mineHead = workLines[marks[0]];

  const headLines = gitShow(job.repo, job.rel).split('\n');
  const headMark = headLines.findIndex(l => l.startsWith(MARK));
  if (headMark < 0) throw new Error(`no "${MARK}" marker in HEAD:${job.rel}`);
  const preamble = headLines.slice(0, headMark).join('\n');
  const rest = headLines.slice(headMark).join('\n');

  // ⚠️ **防重复插入**：HEAD 里**已经有**我这一条了 ⇒ ⇒ 再合并一次就是
  // **同一条出现两次** ⇒ ⇒ 圈码闸会判「码位被占两次」⇒ ⇒ 拦住 ⇒ ⇒
  // （实测：这个脚本第二次跑就会命中 ⇒ ⇒ 所以要先查再合）
  if (rest.split('\n').some(l => l === mineHead)) {
    throw new Error(
      `REFUSING: HEAD already contains this entry ` +
      `("${mineHead.slice(0, 60)}…") — merging again would duplicate it`,
    );
  }

  const merged = (preamble ? preamble + '\n' : '') + mine + '\n' + rest;
  const mergedLines = merged.split('\n');

  // ⚠️ **防截断**：合并结果必须不比 HEAD 少 ⇒ ⇒ 少了就**报错**（宁可不产出）
  if (mergedLines.length < headLines.length) {
    throw new Error(
      `REFUSING: merged ledger is shorter than HEAD ` +
      `(${mergedLines.length} < ${headLines.length}) — that is the truncation bug`,
    );
  }
  fs.writeFileSync(job.out, merged, 'utf8');
  console.log(
    `${job.rel} ⇒ ${mergedLines.length} 行 ` +
    `(我的 ${marks[1] - marks[0]} ＋ HEAD ${headLines.length - headMark} ＋ 前言 ${headMark}) ` +
    `⇒ ${job.out}`,
  );
  console.log(`   首条: ${mergedLines.find(l => l.startsWith(MARK)).slice(0, 70)}`);
}

for (const job of parseArgs(process.argv.slice(2))) {
  mergeOne(job);
}
