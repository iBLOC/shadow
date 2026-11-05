/**
 * E2E trace 里的**凭据取证**判据 —— 纯函数（零依赖 · 零 I/O）。
 * ============================================================================
 *
 * ## 守什么
 *
 * Playwright 的 trace（`0-trace.network`）逐行记着每个请求的**方法 ＋ URL ＋
 * 状态码 ＋ 请求头** ⇒ ⇒ 它是**请求级取证通道** ⇒ ⇒ 于是「端脑那扇门到底
 * 有没有收到凭据」**不必**等端脑加请求级日志就能判。
 *
 * ## 两条判据
 *
 * · **R1（形状）**：打向端脑**凭据面**（`/shadow/v1/*` ＋ `/api/telencephalon/*`）
 *   的请求**必须带** `x-admin-token` 或 `x-shadow-key` ⇒ ⇒ 不带 ⇒ ⇒ 红
 *   （那正是「头压根没发出去」的形状 ⇒ ⇒ 端脑一律 401）。
 * · **R2（门）**：打向端脑凭据面的请求**被答 401** ⇒ ⇒ 红（门把请求关了）。
 *
 * ## 为什么限定「凭据面」那两个前缀
 *
 * · 端脑的门只管那两面（读门认 shadow key 或 admin token，写门认 admin token）；
 * · 而 `/models/providers` 这类路径在 E2E 里可能被 `page.route` **mock** 成 401
 *   （`three-state-providers.spec.ts`）⇒ ⇒ 那不是端脑答的 ⇒ ⇒ 不许算进来。
 */

export const CREDENTIAL_HEADERS = ['x-admin-token', 'x-shadow-key'];

export const CREDENTIALED_PREFIXES = ['/shadow/v1/', '/api/telencephalon/'];

/** 归一化主机:端口 ⇒ 比对时用。 */
export function hostPortOf(url) {
  const m = /^[a-z]+:\/\/([^/]+)/i.exec(String(url || ''));
  return m ? m[1].toLowerCase() : '';
}

/** 请求路径（去掉 query）。 */
export function pathOf(url) {
  const s = String(url || '');
  const i = s.indexOf('?');
  const p = i >= 0 ? s.slice(0, i) : s;
  const m = /^[a-z]+:\/\/[^/]+(\/.*)$/i.exec(p);
  return m ? m[1] : p;
}

/**
 * 凭据头的**名字集合** ⇒ ⇒ 支持**两种** headers 形状。
 *
 * ⚠️⚠️ **这里曾有一个把闸读成「恒红」的 bug（2026-11-05 真机实测）**
 * ⇒ ⇒ 真实 trace 里 `request.headers` 是**数组**：`[{name,value}, …]`
 * ⇒ ⇒ 而旧写法用 `Object.keys(headers)` ⇒ ⇒ 对数组取到的是**下标**
 *      （`'0','1',…`）⇒ ⇒ `x-admin-token` **永远匹配不上**
 * ⇒ ⇒ ⇒ **R1 恒红**（假红）⇒ ⇒ 而自检夹具恰好用了**对象**形状
 *      （`{'x-admin-token':…}`）⇒ ⇒ **夹具形状 ≠ 真实面形状**
 * ⇒ ⇒ ⇒ **自检绿、真机红** ⇒ ⇒ 「闸说绿 ≠ 事情成了」的反面：
 *      **「闸说红」也 ≠「事情没成」** ⇒ ⇒ 夹具必须用**真实面的形状**。
 */
export function credentialHeaderNames(headers) {
  const h = headers || {};
  if (Array.isArray(h)) {
    return h.map((x) => String((x && x.name) || '').toLowerCase());
  }
  return Object.keys(h).map((k) => k.toLowerCase());
}

/** 这条请求**带没带**凭据头。 */
export function hasCredential(headers) {
  const names = credentialHeaderNames(headers);
  return CREDENTIAL_HEADERS.some((n) => names.includes(n));
}

/**
 * @param {string} text `0-trace.network` 的全文（JSONL，每行一个 snapshot）
 * @param {{brainHosts?: string[]}} opts `brainHosts` ＝ 端脑的 host:port 集合
 * @returns {{total:number, considered:number, credentialed:number, missing:number, unauthorized:number, rows:Array<object>}}
 */
export function judgeNetworkText(text, opts = {}) {
  const hosts = (opts.brainHosts || ['127.0.0.1:60080', 'localhost:60080']).map((h) => String(h).toLowerCase());
  const rows = [];
  let total = 0;
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch (e) { continue; }
    const s = o && o.snapshot;
    if (!s || !s.request) continue;
    total += 1;
    const req = s.request;
    const res = s.response || {};
    const host = hostPortOf(req.url);
    if (!hosts.includes(host)) continue;
    const path = pathOf(req.url);
    if (!CREDENTIALED_PREFIXES.some((p) => path.startsWith(p))) continue;
    const cred = hasCredential(req.headers);
    const status = res.status === undefined ? null : res.status;
    rows.push({ method: req.method || '?', path, status, credentialed: cred, url: req.url });
  }
  const credentialed = rows.filter((r) => r.credentialed).length;
  const missing = rows.filter((r) => !r.credentialed).length;
  const unauthorized = rows.filter((r) => r.status === 401).length;
  return { total, considered: rows.length, credentialed, missing, unauthorized, rows };
}

/** 把判据结果翻成违规条目（判据与措辞分离）。 */
export function violationsOf(judged) {
  const out = [];
  for (const r of judged.rows) {
    if (!r.credentialed) {
      out.push({ kind: 'missing-credential', row: r, message: '打向端脑凭据面的请求**没有带** `x-admin-token` / `x-shadow-key` ⇒ ⇒ 端脑会答 401（门把请求关了）' });
    }
    if (r.status === 401) {
      out.push({ kind: 'unauthorized', row: r, message: '打向端脑凭据面的请求被答 **401** ⇒ ⇒ 那扇门把请求关了' });
    }
  }
  return out;
}