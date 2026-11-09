// 「提交面回退」扫描层 —— git 调用在这里，纯判定在 commit-revert.mjs。

import { classifyRevert } from './commit-revert.mjs';

/**
 * 扫描一个提交区间，找「把前一个提交的增量悄悄退掉」的事件。
 *
 * git 是**注入的**执行器（形如 (args) => { ok, out, err }）⇒ ⇒ 自检能用临时仓跑同一段代码。
 * opts: { rev, limit } —— rev 是起点（新到旧），limit 是扫多少个提交。
 */
export function scanReverts(git, opts) {
  const rev = (opts && opts.rev) || 'HEAD';
  const limit = (opts && opts.limit) || 40;

  const logText = git(['log', rev, '--format=%H', '-n', String(limit)]).out;
  const commits = logText.split('\n').map((s) => s.trim()).filter((s) => /^[0-9a-f]{40}$/.test(s));
  if (commits.length === 0) return { commits: [], events: [], total: 0, notes: ['log 读不出提交 ⇒ 这一格**判不了**'] };

  // ⚠️ **历史读全了没有** —— 浅克隆（depth=1）下只能看见 1 个提交
  //   ⇒ ⇒ 「零回退」会是**假象**（根本没得可退）⇒ ⇒ 这一格必须判**不了**。
  const totalRes = git(['rev-list', '--count', rev]);
  const total = Number(totalRes.out.trim()) || 0;
  const notes = [];
  // ⚠️ **浅克隆是明确的「历史不完整」** —— rev-list --count 在浅克隆里也只数得见
  //   可见的那些 ⇒ ⇒ 靠计数**认不出**浅克隆 ⇒ ⇒ 得问 git 自己。
  const shallowRes = git(['rev-parse', '--is-shallow-repository']);
  if (shallowRes.ok && shallowRes.out.trim() === 'true') {
    notes.push('这是**浅克隆**（--depth）⇒ ⇒ 提交历史**不完整** ⇒ ⇒ 「零回退」是假象 ⇒ ⇒ 这一格判不了');
  }
  if (commits.length < Math.min(limit, total)) {
    notes.push('只读到 ' + commits.length + ' 个提交（该 ref 共 ' + total + ' 个）⇒ ⇒ 历史**没读全** ⇒ ⇒ 这一格判不了');
  }

  const messages = new Map();
  for (const c of commits) {
    messages.set(c, git(['show', '-s', '--format=%s%n%b', c]).out);
  }

  const events = [];
  for (const b of commits) {
    const filesText = git(['show', '--name-only', '--format=', b]).out;
    const files = filesText.split('\n').map((s) => s.trim()).filter(Boolean);
    const parentRes = git(['rev-parse', '--verify', b + '^']);
    if (!parentRes.ok) continue;
    for (const f of files) {
      const a = git(['log', '-1', '--format=%H', b + '^', '--', f]).out.trim();
      if (!/^[0-9a-f]{40}$/.test(a)) continue;
      const aParentRes = git(['rev-parse', '--verify', a + '^']);
      if (!aParentRes.ok) continue;
      const aParent = aParentRes.out.trim();
      // ⚠️ **逐个解析**（不能一次传四个）—— 一次传四个时，只要有一个路径不存在，
      //   git 会在**成功解析的那些行之间**插进错误文本 ⇒ ⇒ 解析结果会错位 ⇒ ⇒ 误判。
      const blobOf = (rev) => {
        const r = git(['rev-parse', '--verify', rev + ':' + f]);
        if (!r.ok) return null;
        const h = r.out.trim();
        return /^[0-9a-f]{40}$/.test(h) ? h : null;
      };
      const aBefore = blobOf(aParent);
      if (!aBefore) continue; // A 是**新增**这个文件 ⇒ ⇒ 没有「可被退掉的增量」
      const aAfter = blobOf(a);
      const bBefore = blobOf(b + '^');
      const bAfter = blobOf(b);
      if (!aAfter || !bBefore || !bAfter) continue;
      if (aBefore === aAfter) continue;
      if (bBefore === bAfter) continue;
      const full = bAfter === aBefore && bBefore === aAfter;
      if (!full) {
        const aDiff = git(['diff', aParent, a, '--', f]).out;
        const bDiff = git(['diff', b + '^', b, '--', f]).out;
        const hit = classifyRevert({ blobs: { aBefore, aAfter, bBefore, bAfter }, aDiff, bDiff });
        if (!hit) continue;
        events.push({ kind: hit.kind, commit: b, reverted: a, file: f, lines: hit.lines, message: messages.get(b) || '' });
        continue;
      }
      events.push({ kind: 'full', commit: b, reverted: a, file: f, lines: [], message: messages.get(b) || '' });
    }
  }
  return { commits, events, total, notes };
}