#!/usr/bin/env node
/**
 * 「E2E 的端脑地址」接线闸（2026-11-11 · 刀 Q）。
 *
 * ## 为什么要有这道闸
 *
 * Desktop E2E 那条 job 里，端脑地址**从来没在 workflow 里出现过** ⇒ ⇒ 于是
 * 两边各自去拿**自己的默认值**：
 *
 *   · 前端 bundle —— web 形态没有 sidecar ⇒ ⇒ 靠**构建期**地址
 *     （`src/lib/endpointDefaults.ts` 的 `VITE_PREFRONTAL_URL`）
 *     ⇒ ⇒ CI 不传 ⇒ ⇒ 落回产品里**硬编码**的 `DEFAULT_TELEENCEPHALON_URL`
 *     ＝ `http://127.0.0.1:60080`；
 *   · 端脑 child 进程 —— `tests/e2e-ui/global-setup.ts` 从
 *     `SHADOW_TELENCEPHALON_URL` 取端口，没配就落回**另一个**默认
 *     （同一个文件里的 `'60080'`）。
 *
 * ⇒ ⇒ 于是「能跑通」靠的是**两个各自独立的默认值恰好相等** ⇒ ⇒ **是巧合，
 * 不是接线** ⇒ ⇒ 一旦其中一边改了 ⇒ ⇒ E2E 连不上，而**红在 spec 里**
 * （离原因很远）⇒ ⇒ ⇒ 「跑过了」这件事在接线漂了之后依然成立。
 *
 * ⚠️ 这道闸**不是**判「端脑在不在」 ⇒ ⇒ 它判的是**接线形状**：地址**必须**
 * 由**一个真源**声明、**两处引用**、**构建后当场核对**。
 *
 * ## 判据为什么几乎不用正则
 *
 * ⚠️ **正则会随代码重排而失配** ⇒ ⇒ 而失配的后果是「没判到」⇒ ⇒ 那**长得
 * 像通过**（假绿）⇒ ⇒ 凡是能写成「包含某个字符串」的判据，一律写成字符串
 * 包含（沿用 `check-external-tools.mjs` 的那条纪律）。
 *
 * ## 退出码
 *
 * - 0：绿；
 * - 1：红（有违规）；
 * - 2：**源没读全** ⇒ ⇒ 「没红」不等于「没问题」。
 *
 * ## 用法
 *
 *     node scripts/check-e2e-endbrain-wiring.mjs
 *     node scripts/check-e2e-endbrain-wiring.mjs --self-test
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NL = String.fromCharCode(10);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

/** workflow 里那个**真源**的名字（一处定义 ⇒ ⇒ 判据与自检不会各写一份而漂）。 */
export const SOURCE = 'SHADOW_E2E_ENDBRAIN_URL';

/** 两个半边各自用的环境变量名。 */
export const BUNDLE_ENV = 'VITE_PREFRONTAL_URL';
export const CHILD_ENV = 'SHADOW_TELENCEPHALON_URL';

/** 要读的三份源。 */
export const FILES = {
  workflow: '.github/workflows/desktop-e2e.yml',
  endpointDefaults: 'shadow-desktop/src/lib/endpointDefaults.ts',
  globalSetup: 'shadow-desktop/tests/e2e-ui/global-setup.ts',
};

/** 真源在 workflow 里长什么样（逐字）。 */
export const REF_BUNDLE = BUNDLE_ENV + ': ${{ env.' + SOURCE + ' }}';
export const REF_CHILD = CHILD_ENV + ': ${{ env.' + SOURCE + ' }}';

/** 合法地址：必须是回环 IPv4 + 一个端口。 */
const URL_RE = /^http:\/\/127\.0\.0\.1:(\d{2,5})$/;

/** 从 workflow 文本里抠出真源那一行的值（找不到 ⇒ null）。 */
export function findSourceValue(workflowText) {
  const lines = workflowText.split(NL);
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith(SOURCE + ':')) continue;
    return t.slice(SOURCE.length + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return null;
}

/** 抠出产品硬编码的默认端脑地址（`endpointDefaults.ts` 里那一条）。 */
export function findProductDefault(text) {
  const m = text.match(/DEFAULT_TELEENCEPHALON_URL\s*=\s*'([^']+)'/);
  return m ? m[1] : null;
}

/** 把 workflow 切成一个个 step 块（按 6 空格缩进的 `- name:` 切）。 */
export function splitSteps(workflowText) {
  const lines = workflowText.split(NL);
  const steps = [];
  let cur = null;
  for (const line of lines) {
    if (/^ {6}- name:/.test(line)) {
      if (cur) steps.push(cur.join(NL));
      cur = [line];
    } else if (cur) {
      cur.push(line);
    }
  }
  if (cur) steps.push(cur.join(NL));
  return steps;
}

/** 判据内核：给三份源文本，返回违规清单（空数组 ＝ 绿）。 */
export function judge(sources) {
  const { workflow, endpointDefaults, globalSetup } = sources;
  const v = [];

  // ① 真源必须显式声明，且必须是回环 IPv4。
  const value = findSourceValue(workflow);
  if (value === null) {
    v.push('workflow 里没有 ' + SOURCE + ' ⇒ ⇒ 端脑地址**没有真源** ⇒ ⇒ 两边各拿各的默认 ⇒ ⇒ 靠巧合');
  } else if (!URL_RE.test(value)) {
    v.push(SOURCE + ' 的值不是「http://127.0.0.1:<端口>」⇒ ⇒ 实际是「' + value + '」⇒ ⇒ localhost 在 IPv6 优先的机器上先解析成 ::1 ⇒ ⇒ 打到没人听的地址');
  }

  // ② bundle 那半边必须引用真源（不许写字面量 ⇒ ⇒ 字面量就是第二个真源）。
  if (!workflow.includes(REF_BUNDLE)) {
    v.push('workflow 里没有「' + REF_BUNDLE + '」⇒ ⇒ 前端 bundle 那半边没接真源 ⇒ ⇒ 前端会去拿产品里硬编码的默认 ⇒ ⇒ 与 child 进程可能不是同一台');
  }

  // ③ child 那半边必须引用真源。
  if (!workflow.includes(REF_CHILD)) {
    v.push('workflow 里没有「' + REF_CHILD + '」⇒ ⇒ 端脑 child 进程那半边没接真源 ⇒ ⇒ child 起在哪个口由 global-setup 的默认说了算');
  }

  // ④ 必须有一个**探针构建**步骤：它用一枚**不同于真源**的探针地址再编一次
  //    ⇒ ⇒ 探针地址出现在产物里 ⇒ ⇒ 通道是活的 ⇒ ⇒ 「显式接线」不是空话。
  //    ⚠️ 为什么探针地址必须**不同于**真源 —— 真源的值与产品硬编码默认**恰好
  //    相等**（都是 60080）⇒ ⇒ 若探针也用同一个值 ⇒ ⇒ 「产物里有没有这个
  //    地址」这一问**没有分辨力**（两个默认值相等 ⇒ ⇒ 查不出「环境变量没进到
  //    构建」）⇒ ⇒ 一道永远不会红的检查比没有检查更坏（它给人假的安心）。
  const steps = splitSteps(workflow);
  const probeSteps = steps.filter((s) => s.includes('.probe-dist'));
  if (probeSteps.length === 0) {
    v.push('workflow 里没有「探针构建」那一步 ⇒ ⇒ 「地址写进了 workflow」**不等于**「地址进了构建」⇒ ⇒ Vite 哪天不内联了 ⇒ ⇒ 静默退回硬编码默认 ⇒ ⇒ E2E 照样绿 ⇒ ⇒ 显式接线变成假接线');
  } else {
    const probeStep = probeSteps[0];
    const pm = probeStep.match(/VITE_PREFRONTAL_URL:\s*([^\r\n]+)/);
    const probeValue = pm ? pm[1].trim() : null;
    if (!probeValue || probeValue.includes('${{')) {
      v.push('探针那一步没有写死一个探针地址（VITE_PREFRONTAL_URL: <字面量>）⇒ ⇒ 探针必须用**自己的**地址，否则它和真源一样 ⇒ ⇒ 这一问没有分辨力');
    } else if (value && probeValue === value) {
      v.push('探针地址与真源相同（' + probeValue + '）⇒ ⇒ 这一问**没有分辨力**（两个默认值相等 ⇒ ⇒ 查不出「环境变量没进到构建」）⇒ ⇒ 探针必须用**不同于**真源的地址');
    } else if (!URL_RE.test(probeValue)) {
      v.push('探针地址「' + probeValue + '」不是「http://127.0.0.1:<端口>」⇒ ⇒ 探针必须是一个合法的回环地址');
    }
  }

  // ⑤ 产品侧要真的读那个构建期地址。
  if (!endpointDefaults.includes(BUNDLE_ENV)) {
    v.push('shadow-desktop/src/lib/endpointDefaults.ts 里没有 ' + BUNDLE_ENV + ' ⇒ ⇒ 前端根本不读构建期地址 ⇒ ⇒ 钉了也没用');
  }

  // ⑥ global-setup 要真的从那个环境变量取端口。
  if (!globalSetup.includes(CHILD_ENV)) {
    v.push('shadow-desktop/tests/e2e-ui/global-setup.ts 里没有 ' + CHILD_ENV + ' ⇒ ⇒ child 端口不来自真源');
  }
  if (!globalSetup.includes('new URL(')) {
    v.push('shadow-desktop/tests/e2e-ui/global-setup.ts 里没有「new URL(」⇒ ⇒ 端口不是从那个地址解析出来的 ⇒ ⇒ 地址与端口可能对不上');
  }

  // ⑦ 真源的端口必须与产品硬编码默认**一致** ——
  //    ⚠️ 因为产品里有若干处**写死 60080**（brainFace.ts / resonanceStore.ts /
  //    platform.ts）⇒ ⇒ CI 若把端脑钉到别的口 ⇒ ⇒ 那些路径会打空。
  //    ⇒ ⇒ 这一条不是「不许改端口」，是「**改端口要连着改产品**」——
  //    ⇒ ⇒ 而这正是它该被看见的地方。
  const productDefault = findProductDefault(endpointDefaults);
  if (value && URL_RE.test(value) && productDefault) {
    const m = value.match(URL_RE);
    const pm = productDefault.match(URL_RE);
    if (!pm) {
      v.push('产品硬编码的默认端脑地址「' + productDefault + '」不是「http://127.0.0.1:<端口>」⇒ ⇒ 这一格判不了它与真源是否同口');
    } else if (pm[1] !== m[1]) {
      v.push(
        '真源的口（' + m[1] + '）与产品硬编码默认的口（' + pm[1] + '）不一致 ⇒ ⇒ 产品里有写死 60080 的路径（brainFace / resonanceStore / platform）⇒ ⇒ 那些路径会打空 ⇒ ⇒ 端口要改 ⇒ ⇒ 连着改产品'
      );
    }
  } else if (value && !productDefault) {
    v.push('在 endpointDefaults.ts 里读不到 DEFAULT_TELEENCEPHALON_URL ⇒ ⇒ 这一格判不了「真源与产品默认是否同口」');
  }

  return v;
}

/** 读三份源；读不全 ⇒ ⇒ 退出码 2。 */
export function readSources() {
  const sources = {};
  const missing = [];
  for (const [key, rel] of Object.entries(FILES)) {
    const abs = resolve(REPO, rel);
    if (!existsSync(abs)) {
      missing.push(rel);
      continue;
    }
    sources[key] = readFileSync(abs, 'utf8');
  }
  return { sources, missing };
}

/** 判据自检：9 条（原件必绿 ＋ 8 种漂移各必红）。 */
export function selfTest(base) {
  const results = [];
  const check = (name, ok, why) => results.push({ name, ok, why });

  const mutated = (workflow, endpointDefaults, globalSetup) =>
    judge({
      workflow: workflow ?? base.workflow,
      endpointDefaults: endpointDefaults ?? base.endpointDefaults,
      globalSetup: globalSetup ?? base.globalSetup,
    });

  // 孪生 0：原件必须是绿的（否则后面全是「恒红」）。
  check('原件零违规（否则下面全是恒红，没分辨力）', judge(base).length === 0, JSON.stringify(judge(base)));

  // 孪生 1：把真源那一行删掉 ⇒ ⇒ 必须红。
  const noSource = base.workflow.split(NL).filter((l) => !l.trim().startsWith(SOURCE + ':')).join(NL);
  check('删掉真源那一行 ⇒ ⇒ 必红', mutated(noSource).length > 0, '判了 ' + mutated(noSource).length + ' 条');

  // 孪生 2：真源写成 localhost ⇒ ⇒ 必须红（IPv6 坑）。
  const localhostSource = base.workflow.replace(
    /SHADOW_E2E_ENDBRAIN_URL: http:\/\/127\.0\.0\.1:\d{2,5}/,
    'SHADOW_E2E_ENDBRAIN_URL: http://localhost:60080'
  );
  check('真源写成 localhost ⇒ ⇒ 必红', mutated(localhostSource).length > 0, '判了 ' + mutated(localhostSource).length + ' 条');

  // 孪生 3：真源换成别的口 ⇒ ⇒ 必须红（与产品硬编码默认不一致）。
  const otherPort = base.workflow.replace(
    /SHADOW_E2E_ENDBRAIN_URL: http:\/\/127\.0\.0\.1:\d{2,5}/,
    'SHADOW_E2E_ENDBRAIN_URL: http://127.0.0.1:60195'
  );
  check('真源换成 60195 ⇒ ⇒ 必红（与产品写死的 60080 不同口）', mutated(otherPort).length > 0, '判了 ' + mutated(otherPort).length + ' 条');

  // 孪生 4：bundle 那半边改成字面量 ⇒ ⇒ 必须红。
  const literalBundle = base.workflow.replace(REF_BUNDLE, BUNDLE_ENV + ': http://127.0.0.1:60080');
  check('bundle 半边改成字面量地址 ⇒ ⇒ 必红', mutated(literalBundle).length > 0, '判了 ' + mutated(literalBundle).length + ' 条');

  // 孪生 5：child 那半边改成字面量 ⇒ ⇒ 必须红。
  const literalChild = base.workflow.replace(REF_CHILD, CHILD_ENV + ': http://127.0.0.1:60080');
  check('child 半边改成字面量地址 ⇒ ⇒ 必红', mutated(literalChild).length > 0, '判了 ' + mutated(literalChild).length + ' 条');

  // 孪生 6：把「探针构建」那一步删掉 ⇒ ⇒ 必须红。
  const steps = splitSteps(base.workflow);
  const withoutProbe = steps
    .filter((s) => !s.includes('.probe-dist'))
    .join(NL + '      - name: __SENTINEL__');
  check('删掉「探针构建」那一步 ⇒ ⇒ 必红', mutated(withoutProbe).length > 0, '判了 ' + mutated(withoutProbe).length + ' 条');

  // 孪生 7：探针地址改成与真源相同 ⇒ ⇒ 必须红（那一问没有分辨力）。
  const vacuousProbe = base.workflow.replace(
    /VITE_PREFRONTAL_URL: http:\/\/127\.0\.0\.1:60195/,
    'VITE_PREFRONTAL_URL: ' + (findSourceValue(base.workflow) || '')
  );
  check('探针地址改成与真源相同 ⇒ ⇒ 必红（这一问没有分辨力）', mutated(vacuousProbe).length > 0, '判了 ' + mutated(vacuousProbe).length + ' 条');

  // 孪生 8：产品侧不读构建期地址 ⇒ ⇒ 必须红。
  const noEnvRead = base.endpointDefaults.split(NL).filter((l) => !l.includes(BUNDLE_ENV)).join(NL);
  check('endpointDefaults 不读 ' + BUNDLE_ENV + ' ⇒ ⇒ 必红', mutated(null, noEnvRead).length > 0, '判了 ' + mutated(null, noEnvRead).length + ' 条');

  // 孪生 9：global-setup 不从那个变量取端口 ⇒ ⇒ 必须红。
  const noChildEnv = base.globalSetup.split(NL).filter((l) => !l.includes(CHILD_ENV)).join(NL);
  check('global-setup 不从 ' + CHILD_ENV + ' 取 ⇒ ⇒ 必红', mutated(null, null, noChildEnv).length > 0, '判了 ' + mutated(null, null, noChildEnv).length + ' 条');

  const ok = results.filter((r) => r.ok).length;
  const lines = results.map((r) => (r.ok ? '  ✔ ' : '  ✘ ') + r.name + (r.why ? '  —— ' + r.why : ''));
  console.log(lines.join(NL));
  console.log('自检：' + ok + '/' + results.length + ' 通过');
  return ok === results.length;
}

function main(argv) {
  if (argv.includes('--self-test')) {
    const { sources, missing } = readSources();
    if (missing.length > 0) {
      console.error('❌ 源没读全 ⇒ ⇒ 自检判不了（退出码 2）');
      for (const m of missing) console.error('   读不到：' + m);
      process.exit(2);
    }
    process.exit(selfTest(sources) ? 0 : 1);
  }
  const { sources, missing } = readSources();
  if (missing.length > 0) {
    console.error('❌ 源没读全 ⇒ ⇒ 「没红」不等于「没问题」（退出码 2）');
    for (const m of missing) console.error('   读不到：' + m);
    process.exit(2);
  }
  const v = judge(sources);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ filesRead: Object.keys(FILES).length, violations: v }, null, 2));
  } else {
    console.log('E2E 端脑地址接线闸：读 ' + Object.keys(FILES).length + ' 份源（真源 = ' + SOURCE + '）');
    if (v.length === 0) {
      console.log('✓ 零违规 —— 端脑地址由**一个真源**声明、**两处引用**、**构建后当场核对**');
    } else {
      console.log('✘ ' + v.length + ' 处违规：');
      for (const x of v) console.log('   - ' + x);
    }
  }
  process.exit(v.length === 0 ? 0 : 1);
}

main(process.argv.slice(2));
