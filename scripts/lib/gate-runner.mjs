/**
 * 闸的**跑批器**判据库（纯函数 · 零 I/O ⇒ ⇒ 自检能喂合成夹具）
 * ============================================================================
 *
 * ## 它是什么
 *
 * `scripts/run-gate-once.mjs` 的**判据部分**抽到这里 ⇒ ⇒ 于是
 * 「怎么把一道闸跑起来、怎么把它的结论记下来」这件事**可以被自检**。
 *
 * ## 为什么这一刀存在（2026-11-11）
 *
 * ⚠️ **主 CI 那盏灯的分母只有 4 道**（真 CI run 42752869843 逐字读数）：
 *    ⇒ ⇒ 因为**只有走 `run-gate-once` 的那几道闸**才会落判读记录 ⇒ ⇒
 *    而 **ci.yml 里直跑的那些闸**（a11y / provider-parity / legacy-residue /
 *    neuron-ownership / state-surface / failure-masking / …）**一道都没落** ⇒ ⇒
 *    ⇒ ⇒ **「一盏绿灯」的分母是 4，而闸实际有三十几道** ⇒ ⇒
 *    ⇒ ⇒ **那盏灯证明的东西，比它看起来少得多**。
 *
 * ⚠️ **修法的坑（承 U+34CD 条那两条）**：
 *    ① 判读落盘**不能落在仓根** ⇒ ⇒ 顶层对账闸会把「多出来的文件」判红；
 *    ② 落盘路径**不能写在 job 级 `env:` 里用 `${{ runner.temp }}`** ⇒ ⇒
 *       表达式上下文在那里不可用 ⇒ ⇒ **整个 workflow 文件被拒绝加载** ⇒ ⇒
 *       run 零 job 失败 ⇒ ⇒ 平台**不告诉你哪一行错了**。
 *    ⇒ ⇒ 本库只管**判据**；落盘路径由 workflow 用 `RUNNER_TEMP`（默认环境变量）
 *    写进 `$GITHUB_ENV` ⇒ ⇒ **零表达式上下文** ＋ **落在仓外**。
 *
 * ## 三档语义（**不许**被悄悄改掉）
 *
 *   退出码 0 ⇒ ⇒ **绿**（真判通过）
 *   退出码 2 ⇒ ⇒ **判不了**（源没读全：缺工具链／缺兄弟仓／缺产物）
 *   其它     ⇒ ⇒ **红**（真有问题）
 *
 * ⚠️ `--strict` 这一档的含义：**语义不变，只加记录** ⇒ ⇒
 *    闸的退出码**原样透传**（2 仍然阻断）⇒ ⇒
 *    ⇒ ⇒ **把一道「直跑的闸」改走跑批器时，绝不会悄悄把它从「阻断」变成「不阻断」**。
 *    （不传 `--strict` 时，2 被转成「显眼但不阻断」⇒ ⇒ 那是**新接**的闸该用的口径。）
 *
 * 用法：
 *   node scripts/lib/gate-runner.mjs --self-test
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RESULT_PREFIX = 'GATE_RESULT';

/**
 * 解析跑批器的命令行。
 *
 *   --strict       语义不变（退出码原样透传），但仍然落判读记录
 *   --file=<路径>   判读落盘路径（覆盖环境变量 GATE_RESULT_FILE）
 *   --             其后**全部**是闸自己的参数（原样透传）
 *   位置参数        闸脚本路径（相对**调用者 cwd** 解析）
 *
 * @param {string[]} argv
 * @returns {{strict:boolean, target:string|null, args:string[], file:string|null, errors:string[]}}
 */
export function parseRunnerArgs(argv) {
  const out = { strict: false, target: null, args: [], file: null, errors: [] };
  const list = Array.isArray(argv) ? argv.map(String) : [];
  let i = 0;
  for (; i < list.length; i += 1) {
    const a = list[i];
    if (a === '--') {
      out.args = list.slice(i + 1);
      break;
    }
    if (a === '--strict') {
      out.strict = true;
      continue;
    }
    if (a.startsWith('--file=')) {
      out.file = a.slice('--file='.length);
      continue;
    }
    if (a.startsWith('-')) {
      out.errors.push(
        '不认识的跑批器参数：' + a + ' ⇒ ⇒ 闸自己的参数请写在「--」之后' +
          '（例：run-gate-once.mjs --strict scripts/x.mjs -- --check）',
      );
      continue;
    }
    if (out.target === null) {
      out.target = a;
      continue;
    }
    out.errors.push('闸脚本路径只能给一个（多给了：' + a + '）');
  }
  return out;
}

/**
 * 退出码 ⇒ ⇒ 三档 verdict。
 * @param {number} code
 * @returns {'ok'|'cannot-judge'|'red'}
 */
export function verdictFor(code) {
  if (code === 0) return 'ok';
  if (code === 2) return 'cannot-judge';
  return 'red';
}

/**
 * 一行机器可读的判读记录。
 *
 * ⚠️ **四段是底座，五段是加格**（2026-11-11 本刀）：
 *   四段 ＝ GATE_RESULT<TAB>target<TAB>exit<TAB>verdict（**历史读数逐字不变**）
 *   五段 ＝ 上面四段 ＋ <TAB>job（**job 身份** ⇒ ⇒ 「这条结论是哪个 job 交的」）
 *
 * ⚠️ **为什么加的是「job 身份」而不是「step 级跳过原因」** —— 后者**写不出来**：
 *   **被跳过的步根本没跑** ⇒ ⇒ 它**一行记录都写不出来** ⇒ ⇒
 *   ⇒ ⇒ 「我为什么没跑」只能由**别的**证据推出来 ⇒ ⇒ 不能靠它自报。
 *   ⇒ ⇒ 而「job 身份」是**跑着的那一步**知道的（GitHub 给它 GITHUB_JOB）
 *   ⇒ ⇒ 有了它 ⇒ ⇒ 「少跑的那几道属于哪个 job」就是**读出来的**，不是猜的。
 *
 * ⚠️ **没跑在 CI 里 ⇒ ⇒ 仍是四段**（本地没有 GITHUB_JOB）⇒ ⇒
 *   ⇒ ⇒ 本地读数与历史读数**逐字可比**。
 *
 * @param {string} target
 * @param {number} code
 * @param {string} [verdict]
 * @param {string} [job] GitHub 的 job id（GITHUB_JOB）⇒ ⇒ 没有就留空
 * @returns {string}
 */
export function resultLine(target, code, verdict, job) {
  const v = verdict || verdictFor(code);
  const parts = [RESULT_PREFIX, String(target), String(code), v];
  if (job) parts.push(String(job));
  return parts.join('\t') + '\n';
}

/**
 * 闸脚本路径解析：**相对调用者 cwd**（不是相对跑批器所在仓）⇒ ⇒
 * 脑侧那个 job（仓检在 `shadow/` 子目录）也能跑。
 * @param {string} target
 * @param {string} cwd
 * @param {string} repoRoot
 * @returns {string}
 */
export function resolveTarget(target, cwd, repoRoot) {
  const t = String(target || '').trim();
  if (!t) return '';
  if (/^[A-Za-z]:[\\/]/.test(t) || t.startsWith('/')) return resolve(t);
  const fromCwd = resolve(cwd || process.cwd(), t);
  if (existsSync(fromCwd)) return fromCwd;
  const fromRepo = resolve(repoRoot || process.cwd(), t);
  if (existsSync(fromRepo)) return fromRepo;
  return fromCwd;
}

// ---------------------------------------------------------------------------
// 自检 —— 纯夹具 ⇒ ⇒ 不需要任何闸、不需要文件系统（除 resolveTarget 的存在性判断）
// ---------------------------------------------------------------------------
function selfTest() {
  const cases = [];
  const add = (name, run) => cases.push({ name, run });

  add('最基本的用法 ⇒ ⇒ 拿到闸脚本路径', () => {
    const r = parseRunnerArgs(['scripts/check-x.mjs']);
    return r.target === 'scripts/check-x.mjs' && r.strict === false && r.args.length === 0 && r.errors.length === 0;
  });

  add('--strict ⇒ ⇒ 语义不变那一档被认出', () => {
    const r = parseRunnerArgs(['--strict', 'scripts/check-x.mjs']);
    return r.strict === true && r.target === 'scripts/check-x.mjs';
  });

  add('「--」之后的参数**原样**透传（含长选项与带等号的）', () => {
    const r = parseRunnerArgs(['--strict', 'scripts/check-x.mjs', '--', '--check', '--root=$PWD']);
    return r.args.length === 2 && r.args[0] === '--check' && r.args[1] === '--root=$PWD';
  });

  add('孪生：不带「--」时闸参数不会被当成跑批器参数', () => {
    const r = parseRunnerArgs(['scripts/check-x.mjs', '--check']);
    return r.errors.length === 1 && r.args.length === 0;
  });

  add('--file= 覆盖落盘路径', () => {
    const r = parseRunnerArgs(['--file=/tmp/g.ndjson', 'scripts/check-x.mjs']);
    return r.file === '/tmp/g.ndjson';
  });

  add('两个位置参数 ⇒ ⇒ 报错（闸脚本只能一个）', () => {
    const r = parseRunnerArgs(['a.mjs', 'b.mjs']);
    return r.errors.length === 1 && r.errors[0].includes('只能给一个');
  });

  add('退出码 0 ⇒ ⇒ ok', () => {
    return verdictFor(0) === 'ok';
  });

  add('退出码 2 ⇒ ⇒ cannot-judge（**不许**算成 ok）', () => {
    return verdictFor(2) === 'cannot-judge';
  });

  add('退出码 1 / 其它 ⇒ ⇒ red', () => {
    return verdictFor(1) === 'red' && verdictFor(3) === 'red';
  });

  add('记录行的格式 ⇒ ⇒ 与 gate-tally.mjs 的解析一致（制表符分隔四段）', () => {
    const line = resultLine('scripts/check-x.mjs', 2);
    const parts = line.trim().split('\t');
    return parts.length === 4 && parts[0] === 'GATE_RESULT' && parts[1] === 'scripts/check-x.mjs' && parts[2] === '2' && parts[3] === 'cannot-judge';
  });

  add('记录行加「job 身份」⇒ ⇒ 五段（**四段那段逐字不变** ⇒ ⇒ 历史读数仍可比）', () => {
    const line = resultLine('scripts/check-x.mjs', 0, 'ok', 'brain-gates');
    const parts = line.trim().split('\t');
    return parts.length === 5 && parts[0] === 'GATE_RESULT' && parts[4] === 'brain-gates';
  });

  add('**没有 job 身份**（本地没跑在 CI 里）⇒ ⇒ 仍是四段（不许塞空段）', () => {
    const line = resultLine('scripts/check-x.mjs', 0, 'ok', '');
    return line.trim().split('\t').length === 4;
  });

  add('目标路径 ⇒ ⇒ 相对调用者 cwd 解析（脑侧那个 job 的仓在子目录里）', () => {
    const p = resolveTarget('scripts/check-x.mjs', process.cwd(), process.cwd());
    // ⚠️ **不许按平台分隔符写死断言**（Windows 是 \\，POSIX 是 /）⇒ ⇒
    //    断言要认「路径的尾巴」而不是「某个字面串」。
    const parts = p.split(/[\\/]/);
    return parts.slice(-2).join('/') === 'scripts/check-x.mjs' && !p.includes('..');
  });

  let bad = 0;
  for (const c of cases) {
    let ok = false;
    try {
      ok = c.run() === true;
    } catch (err) {
      ok = false;
    }
    console.log((ok ? '  [PASS] ' : '  [FAIL] ') + c.name);
    if (!ok) bad += 1;
  }
  console.log('  判据自检：' + (cases.length - bad) + '/' + cases.length);
  if (bad > 0) {
    console.error('❌ 自检没过 ⇒ 闸门自己不可信');
    process.exit(1);
  }
  console.log('✅ 自检通过');
  process.exit(0);
}

// ⚠️⚠️ **入口守卫** —— 这个文件同时是**判据库**（被 run-gate-once.mjs import）
//    ⇒ ⇒ 若没有守卫 ⇒ ⇒ 一 import 就执行下面的 CLI 块 ⇒ ⇒ **把宿主进程直接带走**
//    ⇒ ⇒ （2026-11-11 实测：run-gate-once 一 import 它就打印「用法」并退出 2 ⇒ ⇒
//    ⇒ ⇒ 闸根本没被跑起来）⇒ ⇒ **「库文件带 CLI 块」必须自己守入口**。
const invokedDirectly = (() => {
  try {
    const here = process.argv[1] ? resolve(process.argv[1]) : '';
    const self = resolve(fileURLToPath(import.meta.url));
    return here === self;
  } catch (err) {
    return false;
  }
})();

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) {
    selfTest();
  } else {
    console.log('用法: node scripts/lib/gate-runner.mjs --self-test');
    process.exit(2);
  }
}
