// 「提交面回退」扫描层 —— git 调用在这里，纯判定在 commit-revert.mjs。

import { classifyRevert, classifyEntryRevert, quickKind, emptyBlobHash } from './commit-revert.mjs';
import { LEDGER_PATHS } from './ledger-entries.mjs';

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

  // ⚠️ **空 blob 的哈希**（按仓的对象格式）⇒ ⇒ 判「被抹空」不用多打一次 git。
  const fmtRes = git(['rev-parse', '--show-object-format']);
  const empty = emptyBlobHash(fmtRes.ok ? fmtRes.out.trim() : 'sha1');

  // ⚠️ **blob 正文缓存** —— 条目级那一档要读**三个版本**的台账正文（AGENTS.md 有 3.4 MB）
  //   ⇒ ⇒ 同一个 blob 会被多笔事件重复用到 ⇒ ⇒ 缓存 ⇒ ⇒ 不重复读。
  const blobTextCache = new Map();
  const blobText = (sha) => {
    if (!sha) return null;
    if (blobTextCache.has(sha)) return blobTextCache.get(sha);
    const r = git(['cat-file', 'blob', sha]);
    const text = r.ok ? r.out : null;
    blobTextCache.set(sha, text);
    return text;
  };

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
      // ⚠️ **不用 diff 就能判的两类**（完全回退 ＋ 抹空）⇒ ⇒ 先分流，
      //   省掉其余情形下大量 diff 调用（实测全历史扫描的成本大头就在这里）。
      const quick = quickKind({ aBefore, aAfter, bBefore, bAfter, empty });
      if (quick) {
        events.push({ kind: quick, commit: b, reverted: a, file: f, lines: [], message: messages.get(b) || '' });
        continue;
      }
      {
        const aDiff = git(['diff', aParent, a, '--', f]).out;
        const bDiff = git(['diff', b + '^', b, '--', f]).out;
        const hit = classifyRevert({ blobs: { aBefore, aAfter, bBefore, bAfter, empty }, aDiff, bDiff });
        if (!hit) continue;
        // ⚠️ **条目级那一档**（只在 'partial' 上「升级」）⇒ ⇒ 文件级三档仍然优先。
        //   ⇒ ⇒ 「把某一条台账条目退回旧版」那一族，文件级三档都看不见 ⇒ ⇒ 靠这一档兜住。
        let kind = hit.kind;
        let symbols = null;
        if (kind === 'partial' && LEDGER_PATHS.includes(f)) {
          const ent = classifyEntryRevert({
            file: f,
            aBeforeText: blobText(aBefore),
            aAfterText: blobText(aAfter),
            bAfterText: blobText(bAfter),
          });
          if (ent) {
            kind = ent.kind;
            symbols = ent.symbols;
          }
        }
        events.push({ kind, commit: b, reverted: a, file: f, lines: hit.lines, symbols, message: messages.get(b) || '' });
        continue;
      }
    }
  }
  return { commits, events, total, notes };
}