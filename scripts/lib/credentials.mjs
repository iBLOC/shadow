/**
 * 客户端凭据判定 —— **共享判据**（providers 闸与 A/B 面闸用同一份 ⇒ 免得两个闸各说各话）。
 *
 * ## 这份判据解决的是什么坑
 *
 * 「这一发带没带凭据」**看不出来**的三个写法，第三版才认全：
 *   ① `headers: await adminHeaders()` —— 带值；
 *   ② `headers: { ...(await adminHeaders()) }` —— **展开**；
 *   ③ `{ headers }` —— **简写属性**（值是同名变量）⇒ ⇒ 值可能来自**别处的赋值**。
 *
 * ⚠️⚠️ **「红」比「漏报」更坑**：「红」会让人去改**已经改对了**的代码 ⇒ ⇒ 会引入新 bug。
 * ⇒ ⇒ 所以这里宁可**追变量**（`findAssignment`）也不轻易判红。
 *
 * ⚠️ 取 `headers:` 的值时**不能按第一个逗号截断** ⇒ ⇒ 对象字面量按**括号配平**取整个
 * （展开写法 `...(await adminHeaders())` 会被切掉 ⇒ 明明带了凭据却被误报成红）。
 */

export const ADMIN_HEADER = 'X-Admin-Token';
export const ADMIN_GETTER = 'adminHeaders';
export const SHADOW_HEADER = 'X-Shadow-Key';
export const SHADOW_GETTER = 'shadowHeaders|getApiKey|shadowKey';

/**
 * ⚠️⚠️ **读门的「钥匙构建器」** —— 客户端把「影子锁 ∪ admin token」收进
 * **一处共享实现**（`readDoorHeaders` / client 的 `readHeaders()`）。
 *
 * ⇒ ⇒ 它**同时**递两把（各一把，**拿不到就不带那个头** ⇒ 绝不塞空串）
 * ⇒ ⇒ 判据上 admin 与 shadow **都算「递了」**
 * ⇒ ⇒ **拿不拿得到由「可达性」那一半决定**
 * （Tauri：admin 恒有 ⇒ 绿；web：用户自备 ⇒ 条件绿；桌面影子锁：无处可配 ⇒ 拿不到）。
 *
 * ⚠️⚠️ **为什么必须认它**（这条是「假红」的根源）：
 * 客户端把凭据收进**一处共享实现**之后 ⇒ ⇒ 那一发的文本里
 * **不再出现** `adminHeaders` / `X-Admin-Token` ⇒ ⇒ 判据若只认旧形状
 * ⇒ ⇒ **假红**（明明递了两把钥匙却报「必 401」）
 * ⇒ ⇒ 而「红」比漏报**更坑**：会让人去改**已经改对了**的代码 ⇒ ⇒ 引入新 bug。
 */
export const READ_DOOR_BUILDERS = 'readDoorHeaders|readHeaders';

/**
 * 这一段文本里有没有「读门钥匙构建器」的**调用**？
 *
 * ⚠️ 要求带**左括号** ⇒ ⇒ 只认「调用它」⇒ ⇒ 不会把一个**同名变量**
 * 误判成「递了凭据」。
 */
export function hasReadDoorBuilder(text) {
  if (!text) return false;
  return new RegExp('\\b(' + READ_DOOR_BUILDERS + ')\\s*\\(').test(text);
}

/** 在文件里找 `const|let|var <name> = <rhs>` 的 rhs 文本。 */
export function findAssignment(code, name) {
  // ⚠️ 允许**类型注解**：`const headers: Record<string, string> = {...}`
  //    （TypeScript 客户端全是这种写法 ⇒ 不允许的话赋值根本找不到 ⇒ 误报成红）
  const re = new RegExp(
    '\\b(?:const|let|var)\\s+' + name.replace(/[$]/g, '\\$') + '\\s*(?::[^=;\\n]+)?=\\s*',
    'g',
  );
  const m = re.exec(code);
  if (!m) return null;
  let i = m.index + m[0].length;
  let depth = 0;
  let inStr = null;
  while (i < code.length) {
    const ch = code[i];
    if (inStr) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; i++; continue; }
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') {
      if (depth === 0) break;
      depth--;
    } else if (ch === ';' && depth === 0) break;
    else if (ch === '\n' && depth === 0) break;
    i++;
  }
  return code.slice(m.index + m[0].length, i);
}

/**
 * `headers:` 后面那个值的**完整文本**。
 * ⚠️ **别在第一个逗号处截断**（第一版的错在这儿 ⇒ 展开写法被切掉 ⇒ 误报成红）。
 */
export function headerValue(callText) {
  const m = /\bheaders\s*:\s*/.exec(callText);
  if (!m) return null;
  const start = m.index + m[0].length;
  let i = start;
  while (i < callText.length && /\s/.test(callText[i])) i++;

  if (callText[i] === '{') {
    // 括号配平 ⇒ 取整个对象字面量（含展开）。
    let depth = 0;
    for (let j = i; j < callText.length; j++) {
    const ch = callText[j];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return callText.slice(start, j + 1);
    }
    }
    return callText.slice(start);
  }

  let depth = 0;
  for (let j = i; j < callText.length; j++) {
    const ch = callText[j];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) return callText.slice(start, j);
      depth--;
    } else if (ch === ',' && depth === 0) return callText.slice(start, j);
  }
  return callText.slice(start);
}

/**
 * 这个请求带没带**某一种**凭据？
 * @param {string} code 整个文件（用来追变量的赋值）
 * @param {string} callText 那一发的完整文本
 * @param {'admin'|'shadow'} kind
 */
/**
 * 这个变量**后来**被塞过凭据吗？
 *
 * ⚠️ 真实形状（桌面端 SSE 那条）：
 *   const headers: Record<string, string> = { 'Content-Type': 'application/json' };
 *   if (this.apiKey) headers['X-Shadow-Key'] = this.apiKey;
 *   await fetch(url, { headers, body });
 * ⇒ ⇒ 凭据**不在初始化表达式里** ⇒ ⇒ 只看赋值 ⇒ 看不见 ⇒ ⇒ 会误报成红。
 */
export function credentialViaMutation(code, name, kind) {
  const CRED =
    kind === 'admin'
      ? new RegExp('\\b(' + ADMIN_GETTER + '|' + ADMIN_HEADER + ')\\b')
      : new RegExp('\\b(' + SHADOW_GETTER + '|' + SHADOW_HEADER + ')\\b');
  const esc = name.replace(/[$]/g, '\\$');
  // name['X-Shadow-Key'] = …  /  name.X = …
  const reProp = new RegExp('\\b' + esc + '\\s*(\\[[^\\]]*\\]|\\.[A-Za-z_$][\\w$]*)\\s*=\\s*([^;\\n]*)', 'g');
  let m;
  while ((m = reProp.exec(code)) !== null) {
    if (CRED.test(m[1]) || CRED.test(m[2])) return true;
  }
  // name = …（重新赋值）
  const reAssign = new RegExp('\\b' + esc + '\\s*=\\s*([^;\\n]*)', 'g');
  while ((m = reAssign.exec(code)) !== null) {
    if (CRED.test(m[1])) return true;
  }
  return false;
}

/**
 * 这一发是不是**走读门钥匙构建器**（⇒ ⇒ **两把都递**）？
 *
 * ⚠️ 三种写法都要认（与 `credentialIn` 的三种形状**同形**）：
 *   ① `headers: await readDoorHeaders(k)` —— 直接调用；
 *   ② `headers`（简写）⇒ 值来自 `const headers = await this.readHeaders()`；
 *   ③ `headers: { ...(await readDoorHeaders(k)) }` —— 展开。
 *
 * ⚠️⚠️ **为什么这条要单独判、而不是塞进那个正则**：
 * 客户端把凭据收进**一处共享实现**之后 ⇒ ⇒ 那一发的文本里
 * **不再出现** `adminHeaders` / `X-Admin-Token` ⇒ ⇒ 只认旧形状的判据
 * ⇒ ⇒ **假红**（明明递了两把钥匙却报「必 401」）
 * ⇒ ⇒ 而「红」比漏报**更坑**：会让人去改**已经改对了**的代码。
 */
export function readDoorBuilderIn(code, callText) {
  const value = headerValue(callText);
  if (value !== null) {
    if (hasReadDoorBuilder(value)) return true;
    const ident = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*$/.exec(value);
    if (ident) {
      const rhs = findAssignment(code, ident[1]);
      if (rhs && hasReadDoorBuilder(rhs)) return true;
    }
    return false;
  }
  const shorthand = /[{,]\s*headers\s*[,}]/.test(callText);
  if (shorthand) {
    const rhs = findAssignment(code, 'headers');
    if (rhs && hasReadDoorBuilder(rhs)) return true;
  }
  return false;
}

export function credentialIn(code, callText, kind) {
  // ⚠️⚠️ **读门钥匙构建器 ⇒ 两把都递** ⇒ ⇒ admin 与 shadow **都算「递了」**
  // ⇒ ⇒ 「拿不拿得到」由**可达性**那一半决定（Tauri 恒有 / web 用户自备 /
  // ⇒ ⇒ ⇒ 桌面影子锁无处可配），**不由**这一发决定。
  if (readDoorBuilderIn(code, callText)) {
    return { ok: true, how: '走**读门钥匙构建器**（影子锁 ∪ admin token ⇒ 两把都递）' };
  }
  const CRED =
    kind === 'admin'
      ? new RegExp('\\b(' + ADMIN_GETTER + '|' + ADMIN_HEADER + ')\\b')
      : new RegExp('\\b(' + SHADOW_GETTER + '|' + SHADOW_HEADER + ')\\b');

  // ① / ② `headers: <表达式或对象字面量>`
  const value = headerValue(callText);
  if (value !== null) {
    if (CRED.test(value)) return { ok: true, how: '直接带 ' + kind + ' 凭据' };
    // 值是一个裸标识符 ⇒ 追它的赋值。
    const ident = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*$/.exec(value);
    if (ident) {
      const rhs = findAssignment(code, ident[1]);
      if (rhs && CRED.test(rhs)) {
        return { ok: true, how: 'headers = ' + ident[1] + '（它来自 ' + kind + ' 凭据）' };
      }
      // ⚠️ 凭据可能在**赋值之后**才被塞进去（SSE 那条就是这样）⇒ ⇒ 追「变异」。
      if (credentialViaMutation(code, ident[1], kind)) {
        return { ok: true, how: 'headers = ' + ident[1] + '（它后来被塞过 ' + kind + ' 凭据）' };
      }
      return { ok: false, how: 'headers = ' + ident[1] + '，但它不带 ' + kind + ' 凭据' };
    }
    return { ok: false, how: '有 headers，但不是 ' + kind + ' 凭据' };
  }

  // ③ `{ headers }` —— 简写属性 ⇒ 值是同名变量。
  const shorthand = /[{,]\s*headers\s*[,}]/.test(callText);
  if (shorthand) {
    const rhs = findAssignment(code, 'headers');
    if (rhs && CRED.test(rhs)) {
      return { ok: true, how: 'headers（简写）—— 它来自 ' + kind + ' 凭据' };
    }
    if (credentialViaMutation(code, 'headers', kind)) {
      return { ok: true, how: 'headers（简写）—— 它后来被塞过 ' + kind + ' 凭据' };
    }
    return { ok: false, how: 'headers（简写）—— 但它不带 ' + kind + ' 凭据' };
  }

  return { ok: false, how: '这个请求**根本没带 headers**' };
}

/**
 * 这一发**能不能过**这道门？
 *
 * ⚠️ 门认**好几把**钥匙时（读门 = shadow **或** admin）⇒ 有**任意一把**就行。
 * @param {string[]} accepts 这道门认的钥匙（`shadow` / `admin` / `internal`）
 */
export function canPassDoor(code, callText, accepts) {
  const clientCanHold = accepts.filter((k) => k !== 'internal');
  if (clientCanHold.length === 0) {
    return {
      ok: false,
      how: '这道门只认端脑进程内的内部凭据 ⇒ 客户端根本过不了（也不该过）',
    };
  }
  const tried = [];
  for (const kind of clientCanHold) {
    const r = credentialIn(code, callText, kind);
    if (r.ok) return { ok: true, how: r.how + '（这道门认 ' + clientCanHold.join(' 或 ') + '）' };
    tried.push(kind + '：' + r.how);
  }
  return { ok: false, how: '没有这道门认的凭据 —— ' + tried.join('；') };
}
