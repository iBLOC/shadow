/**
 * 「用户偏好撤销通道」判据 —— **纯函数**（零 IO ⇒ ⇒ 自检可以喂退化副本）。
 *
 * ## 它回答的问题
 *
 * 「用户说的那条偏好，被撤回之后**真的不生效了吗**？」
 *
 * 依据 arXiv:2606.30306《Always-On Agents》§2.5：这类失败叫 **authority lapse**
 * —— 用户说了一个偏好、后来撤回，agent 仍照做。那篇的实测：435 项工作的编码里
 * retrieve 269 / write 200，但 **authority 只有 72**（六轴里最稀有的）⇒ ⇒
 * 「谁授权的」与「授权还生效吗」几乎没人管。
 *
 * ## 三件套（我们自己的落法）
 *
 *   ① **撤销账本**（state/revocation-ledger.json）—— 论文 §9.6 说的
 *      deletion ledger：每次撤回留一条可审计的记录（授权 / 来源 / 时点 / 理由）；
 *   ② **撤回声明**（用户记忆面里的一条独立条目）——
 *      「### 撤回声明：偏好名（rev-0001）」
 *      ⇒ ⇒ 这是**注入到未来会话的那份文本**里能被看见的形状；
 *   ③ **这道闸** —— **双向**检查：
 *      撤了必须生效（防 lapse）＋ 生效了必须有来源（防幽灵撤销）。
 *
 * ## ⚠️ 为什么撤回是「一条声明」而不是「改掉原条目」
 *
 * **实测（2026-11-05）**：运行时的记忆工具对 user 面**只支持 append** ——
 * user:edit 与 user:write 均返回 INVALID_OPERATION ⇒ ⇒ 原条目**改不掉**。
 * ⇒ ⇒ 所以撤销的表达只能是**追加一条撤回声明**（原条目保留，由声明覆盖）。
 * ⇒ ⇒ 这也是**诚实**的：原条目还在文件里 ⇒ ⇒ 「模型会不会仍照做」那一环
 *    **不是**机械保证 ⇒ ⇒ 只能靠真机行为测试（见文档）。
 *
 * ## 判据为什么认「形状」不认「关键词」
 *
 * 撤回的形状是**标题行**的「撤回声明：偏好名（rev-id）」；偏好条目自己的
 * 「—— 已撤回（日期，rev-id）」也是形状之一（两种都认 ⇒ ⇒ 将来运行时支持
 * 原地改写时不必改判据）。
 * ⇒ ⇒ 正文里写一句「已撤回」**不算**撤回（**假绿**的来源）。
 *
 * ## 覆盖边界（如实标注）
 *
 * - 判得了：撤销**记了没有**、**生效了没有**、**来源在不在**、**派生副本传播了没有**、
 *   **谁授权的**、**目标指得准不准**。
 * - 判不了：① 「agent 读到撤回声明之后**真的不照做**」—— 那是模型遵守约定，
 *   不是机械强制（这一环只能靠真机行为测试）；
 *   ② 跨设备同步来的撤销记录；
 *   ③ 用户记忆面在 CI 里**不存在** ⇒ ⇒ 那几条规则在 CI 上**明确报「本轮未覆盖」**。
 */
import { ENVELOPE_KEYS, AUTHORITIES, SCOPES, STATUSES, splitEntries } from './state-surface.mjs';

/** 允许的撤销动作。 */
export const REVOCATION_ACTIONS = ['revoke', 'restore'];

/** 只有**用户本人**能撤回用户偏好（论文 §2.5 authority 的语义）。 */
export const REVOCATION_AUTHORITY = 'user';

/** 撤销账本的文件形状。 */
export const LEDGER_SCHEMA = 'ibloc/revocation-ledger@1';

/** rev-id 的形状：字母/数字开头，可含 - _。 */
const RE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * **撤回声明的形状** —— 标题行「撤回声明：偏好名（rev-id）」。
 *
 * ⚠️⚠️ **必须锚在标题行**（不是全文）⇒ ⇒ 正文里提一句「撤回声明」**不算**。
 */
const RE_TOMBSTONE = /^撤回声明：(.+)（(\d{4}-\d{2}-\d{2})，([A-Za-z0-9][A-Za-z0-9_-]*)）\s*$/u;

/**
 * **偏好条目自带的撤销形态** —— 标题行**末尾**的「—— 已撤回（日期，rev-id）」。
 *
 * ⚠️ 必须锚在行尾（$）⇒ ⇒ 正文里出现「已撤回」三个字**不算**撤回。
 */
const RE_REVOKED_SHAPE =
  /\s*——\s*已撤回\s*[（(]\s*(\d{4}-\d{2}-\d{2})\s*[，,]\s*([A-Za-z0-9][A-Za-z0-9_-]*)\s*[）)]\s*$/u;

/** 标题末尾的「（日期）」。 */
const RE_DATE_PAREN = /\s*[（(]\s*\d{4}-\d{2}-\d{2}\s*[）)]\s*$/u;

/** 标题末尾的「—— 已撤回（……）」。 */
const RE_REVOKED_SUFFIX = /\s*——\s*已撤回\s*[（(][^）)]*[）)]\s*$/u;

/** 撤销形态 —— 标题行末尾那串。 */
export function revocationShape(head) {
  const m = RE_REVOKED_SHAPE.exec(String(head || ''));
  if (!m) return null;
  return { date: m[1], id: m[2] };
}

/**
 * 偏好键 —— 标题去掉「撤销形态」与「（日期）」后的稳定名字。
 *
 * ⚠️ 必须**先剥撤销形态再剥日期**（撤销形态里自带一个日期括号）。
 */
export function preferenceKey(head) {
  let t = String(head || '').replace(/^#{1,6}\s+/, '').trim();
  t = t.replace(RE_REVOKED_SUFFIX, '').trim();
  t = t.replace(RE_DATE_PAREN, '').trim();
  t = t.replace(/^「(.+)」$/u, '$1').trim();
  return t;
}

/**
 * 条目标题 —— 取「」里的那句话（那才是条目的名字）；没有就取整行（**不截断**）。
 *
 * ⚠️ 不复用 state-surface 的 titleOf —— 它 slice(0,60) 会把**行尾的 rev-id 截掉**。
 */
export function entryTitle(head) {
  const quoted = String(head || '').match(/「([^」]{1,200})」/);
  if (quoted) return quoted[1];
  return String(head || '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\*\*Updated:?\*{1,2}:?\s*/, '')
    .trim();
}

/**
 * 用户记忆面 ⇒ ⇒ {prefs, tombstones}。
 *
 * ⚠️ **撤回声明不是偏好** ⇒ ⇒ 必须先把它挑出去，否则它自己会被当成一条
 *    「名为『撤回声明：X（rev-0001）』的偏好」⇒ ⇒ 键与状态全乱。
 */
export function analyzeUserSurface(text) {
  const entries = splitEntries(text, 'md-heading');
  const prefs = [];
  const tombstones = [];
  for (const e of entries) {
    const bare = String(e.head || '').replace(/^###\s+/, '').trim();
    const t = RE_TOMBSTONE.exec(bare);
    if (t) {
      tombstones.push({
        index: e.index,
        line: e.line,
        head: e.head,
        key: t[1].trim(),
        revDate: t[2],
        revId: t[3],
        body: e.body,
      });
      continue;
    }
    const shape = revocationShape(e.head);
    prefs.push({
      index: e.index,
      line: e.line,
      head: e.head,
      title: entryTitle(e.head),
      key: preferenceKey(e.head),
      revoked: !!shape,
      revDate: shape ? shape.date : null,
      revId: shape ? shape.id : null,
      body: e.body,
    });
  }
  return { prefs, tombstones };
}

/** 只要偏好清单（不含撤回声明）。 */
export function analyzePreferences(text) {
  return analyzeUserSurface(text).prefs;
}

/** 派生面 ⇒ ⇒ 条目清单（按 kind 切）。 */
export function analyzeDependents(text, kind) {
  const entries = splitEntries(text, kind);
  return entries.map((e) => ({
    index: e.index,
    line: e.line,
    head: e.head,
    title: entryTitle(e.head),
    body: e.body,
  }));
}

/** 撤销账本 ⇒ ⇒ 条目清单（逐字段摊平，缺字段就是缺字段）。 */
export function analyzeLedger(obj) {
  const raw = obj && Array.isArray(obj.entries) ? obj.entries : [];
  return raw.map((e, i) => ({
    index: i,
    id: e && typeof e.id === 'string' ? e.id : '',
    key: e && e.target && typeof e.target.key === 'string' ? e.target.key : '',
    action: e && typeof e.action === 'string' ? e.action : '',
    epoch: e && e.epoch != null ? String(e.epoch) : '',
    authority: e && e.authority != null ? String(e.authority) : '',
    scope: e && e.scope != null ? String(e.scope) : '',
    source: e && e.source != null ? String(e.source) : '',
    status: e && e.status != null ? String(e.status) : '',
    supersedes: e && e.supersedes != null ? String(e.supersedes) : 'none',
    reason: e && e.reason != null ? String(e.reason) : '',
    raw: e || {},
  }));
}

/** 每个偏好的生效态 —— 账本里同一个 key 的**最后一条**说了算。 */
export function effectiveByKey(ledger) {
  const map = new Map();
  for (const e of ledger || []) {
    if (!e.key) continue;
    map.set(e.key, e);
  }
  return map;
}

/** 给偏好条目盖上（或摘掉）撤销形态。 */
export function setRevocationShape(text, key, date, revId) {
  const prefs = analyzePreferences(text);
  const hit = prefs.filter((p) => p.key === key);
  if (hit.length !== 1) return null;
  const lines = String(text).split(/\r?\n/);
  const i = hit[0].line - 1;
  const bare = lines[i].replace(RE_REVOKED_SUFFIX, '');
  lines[i] = revId ? bare + '—— 已撤回（' + date + '，' + revId + '）' : bare;
  return lines.join('\n');
}

/** 追加一条撤回声明（运行时只支持 append ⇒ ⇒ 这是当前**唯一**可写的撤销形态）。 */
export function appendTombstone(text, key, date, revId) {
  const block = [
    '### 撤回声明：' + key + '（' + date + '，' + revId + '）',
    '> 信封：epoch=' + date + ' | authority=user | scope=user | source=撤销账本 ' + revId + ' | status=active | supersedes=none',
    '',
    '偏好「' + key + '」已于 ' + date + ' 被撤回（' + revId + '）⇒ ⇒ **上文那条关于它的描述作废，不得再作为偏好执行**。',
    '',
  ].join('\n');
  return String(text).replace(/\s*$/, '\n') + block;
}

/** 给派生副本的标题盖上 rev-id ⇒ ⇒ 传播标记。 */
export function markDependentTitle(text, kind, key, revId) {
  const entries = analyzeDependents(text, kind);
  const hit = entries.filter((e) => e.title.includes(key));
  if (hit.length !== 1) return null;
  const lines = String(text).split(/\r?\n/);
  const i = hit[0].line - 1;
  lines[i] = lines[i].replace(key, key + '（已撤回 ' + revId + '）');
  return lines.join('\n');
}

/**
 * 判据 —— **纯函数**：吃「偏好面 ＋ 账本 ＋ 派生面」⇒ ⇒ 返回违规清单。
 *
 *   V1 账本信封 —— 每条撤销必须带全六字段；
 *   V2 撤销权限 —— 只有用户本人能撤回用户偏好；
 *   V3 目标可解析 —— target.key 必须命中偏好或撤回声明，且偏好不得重复；
 *   V4 正向（防 lapse）—— 撤了**必须**在偏好面上真的生效；
 *   V5 反向（防幽灵撤销）—— 生效的撤销**必须**有账本来源；
 *   V6 传播 —— 派生副本**必须**带 rev-id；
 *   V7 一致性 —— rev-id 不许重复、restore 必须配对 revoke、恢复后不许还挂着撤销标记。
 *
 * @param {object} input
 *   prefs/tombstones —— analyzeUserSurface 的两半
 *   ledger           —— analyzeLedger 的产物
 *   dependents       —— [{id, label, kind, entries}]
 *   skipUserRules    —— 用户面读不到时为 true（⇒ ⇒ 跳过 V3/V4/V5/V6）
 */
export function judgeRevocation(input) {
  const prefs = input.prefs || [];
  const tombstones = input.tombstones || [];
  const ledger = input.ledger || [];
  const dependents = input.dependents || [];
  const v = [];
  const details = { lapse: [], ghost: [], propagation: [], ledger: [], target: [] };
  const skipUser = !!input.skipUserRules;

  const ids = new Map();
  for (const e of ledger) {
    const label = e.id || '第 ' + (e.index + 1) + ' 条';
    if (!e.id || !RE_ID.test(e.id)) {
      v.push({
        rule: 'V1',
        msg: '撤销账本 ' + label + '：id「' + e.id + '」不是合法标识符（字母/数字开头，可含 - _）',
      });
    } else {
      ids.set(e.id, (ids.get(e.id) || 0) + 1);
    }
    for (const k of ENVELOPE_KEYS) {
      if (!e[k] || String(e[k]).trim() === '') {
        v.push({
          rule: 'V1',
          msg: '撤销账本 ' + label + '：信封缺字段 ' + k + ' ⇒ ⇒ 这次撤销没有完整的授权/来源 ⇒ ⇒ 不可审计',
        });
      }
    }
    if (e.epoch && !/^\d{4}-\d{2}-\d{2}$/.test(e.epoch) && !/^v\d/.test(e.epoch)) {
      v.push({
        rule: 'V1',
        msg: '撤销账本 ' + label + '：epoch「' + e.epoch + '」不是日期 ⇒ ⇒ 撤销的时点不可判定',
      });
    }
    if (e.authority && AUTHORITIES.indexOf(e.authority) < 0) {
      v.push({
        rule: 'V1',
        msg: '撤销账本 ' + label + '：authority「' + e.authority + '」不在允许集合（' + AUTHORITIES.join(' / ') + '）',
      });
    }
    if (e.scope && SCOPES.indexOf(e.scope) < 0) {
      v.push({
        rule: 'V1',
        msg: '撤销账本 ' + label + '：scope「' + e.scope + '」不在允许集合（' + SCOPES.join(' / ') + '）',
      });
    }
    if (e.status && STATUSES.indexOf(e.status) < 0) {
      v.push({
        rule: 'V1',
        msg: '撤销账本 ' + label + '：status「' + e.status + '」不在允许集合（' + STATUSES.join(' / ') + '）',
      });
    }
    if (e.action && REVOCATION_ACTIONS.indexOf(e.action) < 0) {
      v.push({
        rule: 'V1',
        msg:
          '撤销账本 ' + label + '：action「' + e.action + '」不是允许的动作（' + REVOCATION_ACTIONS.join(' / ') + '）',
      });
    }
    if (e.supersedes && e.supersedes !== 'none') {
      if (!ledger.some((x) => x.id === e.supersedes)) {
        v.push({
          rule: 'V1',
          msg: '撤销账本 ' + label + '：取代链指向「' + e.supersedes + '」⇒ ⇒ 解析不到 ⇒ ⇒ 取代链是断的',
        });
      }
    }
    if (e.authority && e.authority !== REVOCATION_AUTHORITY) {
      v.push({
        rule: 'V2',
        msg:
          '撤销账本 ' +
          label +
          '：authority 是「' +
          e.authority +
          '」⇒ ⇒ 只有用户本人能撤回用户偏好（论文 §2.5 authority）⇒ ⇒ 闸红',
      });
    }
  }

  for (const [id, n] of ids) {
    if (n > 1) {
      v.push({ rule: 'V7', msg: '撤销账本里 ' + id + ' 出现了 **' + n + ' 次** ⇒ ⇒ 撤销标记会指错' });
    }
  }

  // V3 —— 目标可解析
  for (const e of (skipUser ? [] : ledger)) {
    const label = e.id || '第 ' + (e.index + 1) + ' 条';
    if (!e.key) {
      v.push({ rule: 'V3', msg: '撤销账本 ' + label + '：没有 target.key ⇒ ⇒ 不知道撤的是哪一条' });
      continue;
    }
    const prefHits = prefs.filter((p) => p.key === e.key);
    const tombHits = tombstones.filter((t) => t.key === e.key);
    if (prefHits.length + tombHits.length === 0) {
      v.push({
        rule: 'V3',
        msg:
          '撤销账本 ' +
          label +
          '：目标偏好「' +
          e.key +
          '」在用户记忆面里**既没有条目也没有撤回声明** ⇒ ⇒ 这次撤销是空的 ⇒ ⇒ 撤了个不存在的东西',
      });
    } else if (prefHits.length > 1) {
      v.push({
        rule: 'V3',
        msg:
          '撤销账本 ' +
          label +
          '：目标偏好「' +
          e.key +
          '」在用户记忆面里命中 **' +
          prefHits.length +
          ' 条**偏好条目 ⇒ ⇒ 目标歧义 ⇒ ⇒ 不知道撤的是哪一条',
      });
    }
  }

  const eff = effectiveByKey(ledger);

  // V4 / V5 / V7 —— 每个偏好的**生效态**必须与账本一致
  for (const [key, e] of (skipUser ? [] : eff)) {
    const pref = prefs.filter((p) => p.key === key);
    const tomb = tombstones.filter((t) => t.key === key);
    // ⛔ 目标在偏好面里**根本不存在**（V3 已报）⇒ ⇒ 这里不再报 V4（否则一个错误报两次）。
    if (pref.length + tomb.length === 0) continue;
    const expectRevoked = e.action === 'revoke';
    if (expectRevoked) {
      const prefRevoked = pref.length === 1 && pref[0].revoked;
      const tombRevoked = tomb.length > 0;
      if (!prefRevoked && !tombRevoked) {
        v.push({
          rule: 'V4',
          msg:
            '用户撤了偏好「' +
            key +
            '」（' +
            e.id +
            '）⇒ ⇒ 但偏好面里它**仍是生效形态**（既没有「已撤回」标记，也没有撤回声明）⇒ ⇒ 这就是论文说的 **authority lapse**（撤回后仍被执行）',
        });
        details.lapse.push({ key: key, revId: e.id });
      } else if (prefRevoked && pref[0].revId !== e.id) {
        v.push({
          rule: 'V4',
          msg:
            '用户撤了偏好「' +
            key +
            '」（账本 ' +
            e.id +
            '）⇒ ⇒ 但偏好面里挂的是 **' +
            pref[0].revId +
            '** ⇒ ⇒ 撤销标记与账本对不上',
        });
      } else if (tombRevoked && tomb[0].revId !== e.id) {
        v.push({
          rule: 'V5',
          msg:
            '用户记忆面里的撤回声明「' +
            key +
            '」（' +
            tomb[0].revId +
            '）⇒ ⇒ 但账本里撤它的是 **' +
            e.id +
            '** ⇒ ⇒ 撤回声明与账本对不上',
        });
      }
    } else {
      // restore ⇒ ⇒ 偏好面不许还挂着撤销标记 / 撤回声明
      const prefRevoked = pref.length === 1 && pref[0].revoked;
      if (prefRevoked || tomb.length > 0) {
        v.push({
          rule: 'V7',
          msg:
            '账本说偏好「' +
            key +
            '」已被 restore（' +
            e.id +
            '）⇒ ⇒ 但偏好面里还挂着撤销标记/撤回声明（' +
            (prefRevoked ? pref[0].revId : tomb[0].revId) +
            '）⇒ ⇒ 两边对不上',
        });
      }
      const hasRevoke = ledger.some((x) => x.action === 'revoke' && x.key === key);
      if (!hasRevoke) {
        v.push({
          rule: 'V7',
          msg:
            '撤销账本 ' +
            e.id +
            ' 是 restore ⇒ ⇒ 但账本里没有针对偏好「' +
            key +
            '」的 revoke ⇒ ⇒ 恢复了一个没被撤过的东西',
        });
      }
    }
  }

  // V5 —— 生效的撤销**必须有账本来源**
  for (const p of (skipUser ? [] : prefs)) {
    if (!p.revoked) continue;
    const src = ledger.find((x) => x.id === p.revId);
    if (!src) {
      v.push({
        rule: 'V5',
        msg:
          '用户记忆面里偏好「' +
          p.key +
          '」标着「已撤回（' +
          p.revId +
          '）」⇒ ⇒ 但撤销账本里**没有** ' +
          p.revId +
          ' ⇒ ⇒ 这次撤销没有来源（论文：a memory that drops its source ⇒ ⇒ strictly worse than empty）',
      });
      details.ghost.push({ key: p.key, revId: p.revId });
      continue;
    }
    if (src.key !== p.key) {
      v.push({
        rule: 'V5',
        msg:
          '用户记忆面里偏好「' +
          p.key +
          '」标着「已撤回（' +
          p.revId +
          '）」⇒ ⇒ 但账本里 ' +
          p.revId +
          ' 撤的是「' +
          src.key +
          '」⇒ ⇒ 撤销标记与账本指向的不是同一条',
      });
    }
  }
  for (const t of (skipUser ? [] : tombstones)) {
    const src = ledger.find((x) => x.id === t.revId);
    if (!src) {
      v.push({
        rule: 'V5',
        msg:
          '用户记忆面里的撤回声明「' +
          t.key +
          '」（' +
          t.revId +
          '）⇒ ⇒ 但撤销账本里**没有** ' +
          t.revId +
          ' ⇒ ⇒ 这次撤销没有来源（论文：a memory that drops its source ⇒ ⇒ strictly worse than empty）',
      });
      details.ghost.push({ key: t.key, revId: t.revId });
      continue;
    }
    if (src.key !== t.key) {
      v.push({
        rule: 'V5',
        msg:
          '用户记忆面里的撤回声明「' +
          t.key +
          '」（' +
          t.revId +
          '）⇒ ⇒ 但账本里 ' +
          t.revId +
          ' 撤的是「' +
          src.key +
          '」⇒ ⇒ 撤回声明与账本指向的不是同一条',
      });
    }
  }

  // V6 —— 传播
  const revokedKeys = [];
  for (const p of (skipUser ? [] : prefs)) {
    if (p.revoked) revokedKeys.push({ key: p.key, revId: p.revId });
  }
  for (const t of (skipUser ? [] : tombstones)) {
    revokedKeys.push({ key: t.key, revId: t.revId });
  }
  for (const r of revokedKeys) {
    for (const d of dependents) {
      for (const e2 of d.entries || []) {
        if (!e2.title.includes(r.key)) continue;
        if (e2.title.includes(r.revId)) continue;
        v.push({
          rule: 'V6',
          msg:
            '被撤回的偏好「' +
            r.key +
            '」（' +
            r.revId +
            '）在派生面「' +
            d.id +
            '」的条目「' +
            e2.title.slice(0, 40) +
            '」里仍然**照旧生效**（标题里没有 ' +
            r.revId +
            '）⇒ ⇒ 未来会话读到它仍会照做 ⇒ ⇒ 撤销没传播',
        });
        details.propagation.push({ surface: d.id, title: e2.title, revId: r.revId });
      }
    }
  }

  return { violations: v, details: details };
}
