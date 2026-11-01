/**
 * ⚠️⚠️ **门型的「JS 镜像」—— 权威在端脑的 `src/api/door.rs`**
 *
 * 这个文件是 Rust 那份实现的**逐条镜像**（解析 / 路径匹配 / 谁更具体 / 怎么派生）：
 * `src/api/door.rs` 的 `PolicyEntry::parse` / `matches_path` /
 * `more_specific` / `resolve`。
 *
 * ⚠️ **为什么要有一份镜像**：闸要能在**不编 Rust** 的前提下回答
 * 「这条路由归哪扇门」⇒ ⇒ 但镜像**迟早会漂** ⇒ ⇒
 * `scripts/check-door-policy-parity.mjs` 拿**Rust 自己的用例表**
 * （`door.rs` 里 `door_of(path, method) == Door::X` 那些断言）
 * **逐条**对这份镜像 ⇒ ⇒ 漂了就红。
 *
 * ⇒ ⇒ **两边各写一份是刻意的**（一份运行、份判）⇒ ⇒ 但**一致性必须机器判**。
 *
 * ⚠️ **改这份镜像之前先想清楚**：改坏了 ⇒ ⇒ 端脑的闸（check-door-policy.mjs）
 * 与跨语言一致性闸**一起红** ⇒ ⇒ 那正是它们该做的。
 */

import { readFileSync } from 'node:fs';

export const METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', '*']);
export const DOORS = new Set(['open', 'read', 'admin', 'owner', 'auto']);

/** 解析门型表的**文本** —— 真实表与自检夹具共用这一条路（同一形状）。 */
export function parsePolicyText(raw) {
  const entries = [];
  const errors = [];
  raw.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const parts = t.split(/\s+/);
    if (parts.length !== 3) {
      errors.push('line ' + (i + 1) + ': expected 3 fields, got ' + parts.length + ' :: ' + t);
      return;
    }
    const pattern = parts[0];
    const method = parts[1];
    const door = parts[2];
    if (!METHODS.has(method)) {
      errors.push('line ' + (i + 1) + ': unknown method ' + method);
      return;
    }
    if (!DOORS.has(door)) {
      errors.push('line ' + (i + 1) + ': unknown door ' + door);
      return;
    }
    const segments = pattern.split('/').filter(Boolean);
    if (segments.length === 0) {
      errors.push('line ' + (i + 1) + ': empty path pattern');
      return;
    }
    entries.push({
      segments,
      tailWildcard: segments[segments.length - 1] === '*',
      method: method === '*' ? null : method,
      door,
      line: i + 1,
    });
  });
  return { entries, errors };
}

export function parsePolicy(policyPath) {
  return parsePolicyText(readFileSync(policyPath, 'utf8'));
}

export function matchesPath(e, segs) {
  if (e.tailWildcard) {
    const prefix = e.segments.slice(0, -1);
    if (segs.length < prefix.length) return false;
    return prefix.every((p, i) => p === '*' || p === segs[i]);
  }
  if (segs.length !== e.segments.length) return false;
  return e.segments.every((p, i) => p === '*' || p === segs[i]);
}

/** 与端脑 src/api/door.rs 的 more_specific **逐条对齐**。 */
export function moreSpecific(c, cur) {
  const cl = c.segments.filter((s) => s !== '*').length;
  const rl = cur.segments.filter((s) => s !== '*').length;
  if (cl !== rl) return cl > rl;
  const cw = c.segments.length - cl;
  const rw = cur.segments.length - rl;
  if (cw !== rw) return cw < rw;
  const cm = c.method !== null;
  const rm = cur.method !== null;
  if (cm !== rm) return cm;
  if (c.segments.length !== cur.segments.length) return c.segments.length > cur.segments.length;
  return c.line < cur.line;
}

export function resolveDoor(path, method, entries) {
  const segs = path.split('/').filter(Boolean);
  let best = null;
  for (const e of entries) {
    if (e.method !== null && e.method !== method) continue;
    if (!matchesPath(e, segs)) continue;
    if (!best || moreSpecific(e, best)) best = e;
  }
  if (!best) return { door: 'closed', line: null };
  let door = best.door;
  if (door === 'auto') {
    door = method === 'GET' || method === 'HEAD' ? 'read' : 'admin';
  }
  return { door, line: best.line };
}
