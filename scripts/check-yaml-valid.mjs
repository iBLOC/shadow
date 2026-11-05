#!/usr/bin/env node
/**
 * YAML 合法性闸 —— 抓「workflow 的 YAML 根本解析不了 ⇒ 整个 workflow 起不来」
 * ============================================================================
 *
 * ## 病（2026-11-05 真机实测）
 *
 * telencephalon 上一轮加 router-only 构建闸时，step 名里带了冒号：
 *
 *     - name: Cargo check (router-only: the brain must build without candle)
 *
 * 冒号 + 空格在 YAML 的纯量里是**硬错** ⇒ ⇒ 解析器直接报
 * 「mapping values are not allowed here」⇒ ⇒ **整个 workflow 起不来**
 * （GitHub Actions 连 job 都进不去）⇒ ⇒ 而那时 CI 因账号额度本来就红
 * ⇒ ⇒ **没人看见** ⇒ ⇒ 修法只是给那个 step 名加引号。
 *
 * ⚠️ **病根不是「那行写错了」，是「CI 的 YAML 从来没有被任何东西解析过」**。
 * ⇒ ⇒ 所以这里落成一道**闸**：每次跑都把 workflow 拿解析器过一遍。
 *
 * ## 闸抓什么
 *
 * 判据分两层（纯函数在 scripts/lib/yaml-valid.mjs）：
 *
 *   · **语法层**：Y1 纯量里的「冒号 + 空格」/ Tab 缩进 / 引号不闭合 /
 *     重复键 / 结构错位 ⇒ ⇒ 对应真解析器的报错。
 *   · **形状层**：workflow 顶层必须有 on 与 jobs；job 必须有 runs-on（或
 *     uses，＝可复用 workflow 调用）；step 必须有且仅有 uses 或 run。
 *     ⇒ ⇒ 这一层**真解析器管不了**（它不认 GitHub 的 schema）。
 *
 * ## 差分交叉验证（闸不许自说自话）
 *
 * 仓内闸的约定是「纯 Node、零依赖」⇒ ⇒ CI runner 不保证有 pip / npm 包。
 * 所以扫描器是**自己写的保守实现** ⇒ ⇒ 但只要环境里**有**真解析器
 * （PyYAML / npm yaml），就把同一批文件再喂给它 ⇒ ⇒
 * 两边结论必须一致 ⇒ ⇒ 不一致就红（differential-mismatch）。
 *
 * ⚠️ 于是有三种结论，不是两种：
 *   · 扫描器说坏 + 真解析器说坏 ⇒ ⇒ 真坏（红）
 *   · 扫描器说好 + 真解析器说好 ⇒ ⇒ 真好（绿）
 *   · 两边不一致 ⇒ ⇒ **扫描器不可信**（红，且要说清是哪边）
 *
 * ## 用法
 *
 *   node scripts/check-yaml-valid.mjs                  扫本仓的 workflow
 *   node scripts/check-yaml-valid.mjs --self-test      判据自检（含真实事故夹具）
 *   node scripts/check-yaml-valid.mjs --drill          在副本上做「绿→红→绿」演练
 *   node scripts/check-yaml-valid.mjs --audit          现状清单
 *   node scripts/check-yaml-valid.mjs --json           机器可读
 *   node scripts/check-yaml-valid.mjs --root=<dir>     追加扫描根（可重复）
 *   node scripts/check-yaml-valid.mjs --file=<path>    直接扫一个文件（演练用）
 *   node scripts/check-yaml-valid.mjs --parser=none     不做真解析器交叉验证
 *   node scripts/check-yaml-valid.mjs --strict-parser   没有真解析器 ⇒ 退出码 2
 *
 * 退出码：0 绿 / 1 红 / 2 判不了（判不了 ≠ 没问题）。
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanYamlText, SYNTAX_KINDS, coverageVerdict } from './lib/yaml-valid.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Python 侧的真解析探针（读文件 → 报 JSON）。 */
const PY_PARSE = [
  'import json, sys',
  'try:',
  '    import yaml',
  'except Exception:',
  '    print(json.dumps({"ok": False, "error": "no-yaml-module"}))',
  '    sys.exit(3)',
  'path = sys.argv[1]',
  'try:',
  '    with open(path, "rb") as fh:',
  '        yaml.safe_load(fh.read().decode("utf-8"))',
  '    print(json.dumps({"ok": True}))',
  'except Exception as exc:',
  '    msg = " | ".join(str(exc).splitlines())',
  '    line = None',
  '    for part in msg.split(" | "):',
  '        t = part.strip()',
  '        if t.startswith("line "):',
  '            try:',
  '                line = int(t.split()[1])',
  '            except Exception:',
  '                pass',
  '    print(json.dumps({"ok": False, "error": msg, "line": line}))',
].join('\n');

function parseArgs(argv) {
  const opts = {
    selfTest: false,
    drill: false,
    audit: false,
    json: false,
    strictParser: false,
    parser: 'auto',
    roots: [],
    files: [],
  };
  for (const arg of argv) {
    if (arg === '--self-test') opts.selfTest = true;
    else if (arg === '--drill') opts.drill = true;
    else if (arg === '--audit') opts.audit = true;
    else if (arg === '--json') opts.json = true;
    else if (arg === '--strict-parser') opts.strictParser = true;
    else if (arg.startsWith('--parser=')) opts.parser = arg.slice('--parser='.length);
    else if (arg.startsWith('--root=')) opts.roots.push(resolve(arg.slice('--root='.length)));
    else if (arg.startsWith('--file=')) opts.files.push(resolve(arg.slice('--file='.length)));
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else {
      console.error('未知参数：' + arg);
      process.exit(2);
    }
  }
  return opts;
}

/** 找出 root 下的 git 仓（root 本身 + 一层子目录里带 .git 的）。 */
function discoverRepos(root) {
  const candidates = [];
  if (existsSync(join(root, '.git'))) candidates.push(root);
  let entries = [];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return candidates;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'target') continue;
    const child = join(root, entry.name);
    if (existsSync(join(child, '.git'))) candidates.push(child);
  }
  return dedupeRepos(candidates);
}

/**
 * 同一个仓的 worktree 与主仓共享 git-common-dir ⇒ ⇒ 只算一次。
 * ⚠️ 不去重的话「分母」会翻倍（实测 shadow 仓里有一个 .verify-wt worktree
 * ⇒ 26 个 workflow 被数成 29 个）⇒ ⇒ 「量异常前先量总数」的前提就没了。
 */
function dedupeRepos(candidates) {
  const seen = new Set();
  const out = [];
  for (const repo of candidates) {
    const res = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: repo,
      encoding: 'utf8',
      timeout: 20000,
    });
    const id = res.status === 0 ? String(res.stdout || '').trim() : repo;
    const key = id || repo;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(repo);
  }
  return out;
}

/** 列出仓里所有 workflow（含未跟踪但未忽略的 —— 新写的坏文件最容易漏）。 */
function listWorkflowFiles(repos) {
  const files = new Map();
  const pathspecs = [
    ':(glob)**/.github/workflows/*.yml',
    ':(glob)**/.github/workflows/*.yaml',
    // ⚠️ composite action 也是 YAML ⇒ ⇒ 写坏了 ⇒ ⇒ 调用它的 job 起不来。
    //    ⇒ ⇒ 必须一起判（否则是「绿灯什么都没查」）。
    ':(glob)**/.github/actions/**/action.yml',
    ':(glob)**/.github/actions/**/action.yaml',
  ];
  for (const repo of repos) {
    const invocations = [
      ['ls-files', '-z', '--', ...pathspecs],
      ['ls-files', '-z', '--others', '--exclude-standard', '--', ...pathspecs],
    ];
    for (const args of invocations) {
      const res = spawnSync('git', args, {
        cwd: repo,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      });
      if (res.status !== 0 || !res.stdout) continue;
      for (const p of String(res.stdout).split('\0')) {
        if (!p) continue;
        files.set(resolve(repo, p), repo);
      }
    }
  }
  return [...files.keys()].sort();
}

/** 探一个真解析器（探不到就返回 null —— 判不了 ≠ 没问题）。 */
function probeParser(mode) {
  if (mode === 'none') return null;
  if (mode === 'auto' || mode === 'python') {
    const candidates = [
      ['python', []],
      ['python3', []],
      ['py', ['-3']],
    ];
    for (const [cmd, extra] of candidates) {
      const probe = spawnSync(cmd, [...extra, '-c', 'import yaml; print(yaml.__version__)'], {
        encoding: 'utf8',
        timeout: 20000,
      });
      if (probe.error || probe.status !== 0) continue;
      const version = String(probe.stdout || '').trim();
      if (!/\d/.test(version)) continue;
      return { kind: 'python', cmd, extra, label: cmd + ' + PyYAML ' + version };
    }
  }
  if (mode === 'auto' || mode === 'npm') {
    const require = createRequire(import.meta.url);
    for (const mod of ['yaml', 'js-yaml']) {
      try {
        require.resolve(mod);
        return { kind: 'npm', module: mod, label: 'npm ' + mod };
      } catch {
        continue;
      }
    }
  }
  return null;
}

/** 让真解析器解析一个文件。 */
function parseWithParser(parser, absPath) {
  if (!parser) return null;
  if (parser.kind === 'python') {
    const res = spawnSync(parser.cmd, [...parser.extra, '-c', PY_PARSE, absPath], {
      encoding: 'utf8',
      timeout: 60000,
    });
    if (res.error) return { ok: false, error: 'parser-crash: ' + res.error.message };
    if (res.status !== 0 && !res.stdout) return { ok: false, error: 'parser-exit-' + res.status };
    try {
      return JSON.parse(String(res.stdout).trim());
    } catch {
      return { ok: false, error: 'parser-bad-output' };
    }
  }
  try {
    const require = createRequire(import.meta.url);
    const text = readFileSync(absPath, 'utf8');
    if (parser.module === 'yaml') require(parser.module).parse(text);
    else require(parser.module).load(text);
    return { ok: true };
  } catch (err) {
    const message = String(err && err.message ? err.message : err).split('\n')[0];
    return { ok: false, error: message };
  }
}

/**
 * 这个 YAML 文件是 **workflow** 还是 **composite action**？
 * ⚠️ **先看路径，再看内容** —— 路径是权威（.github/workflows/ vs
 *    .github/actions/<name>/action.yml）⇒ ⇒ 一个缺了 `on:` 的 workflow
 *    仍然按 workflow 判（否则「缺 on」那条判据会自己失效）。
 * ⚠️ 内容兜底是为了**演练副本**：drill 把文件拷进临时目录（名字叫
 *    workflow.yml）⇒ ⇒ 那时路径已经不能说明身份了。
 */
function fileKind(absPath, text) {
  const norm = String(absPath).replace(/\\/g, '/');
  if (norm.includes('/.github/workflows/')) return 'workflow';
  if (norm.includes('/.github/actions/')) return 'composite';
  if (/^\s*on\s*:/m.test(text) && /^\s*jobs\s*:/m.test(text)) return 'workflow';
  if (/^\s*runs\s*:/m.test(text)) return 'composite';
  return 'workflow';
}

/** 扫一批文件，并与真解析器对账。 */
function checkFiles(files, parser) {
  const perFile = [];
  let total = 0;
  for (const abs of files) {
    const text = readFileSync(abs, 'utf8');
    const kind = fileKind(abs, text);
    const scan = scanYamlText(text, kind === 'composite' ? { composite: true } : { workflow: true });
    const findings = scan.findings.slice();
    const parserResult = parser ? parseWithParser(parser, abs) : null;
    if (parserResult) {
      const hasSyntax = findings.some((f) => SYNTAX_KINDS.has(f.kind));
      if (parserResult.ok === false && !hasSyntax) {
        findings.push({
          kind: 'differential-mismatch',
          line: parserResult.line || 0,
          message: '真解析器说这个文件坏了，但扫描器没抓到：' + (parserResult.error || ''),
        });
      } else if (parserResult.ok === true && hasSyntax) {
        findings.push({
          kind: 'differential-mismatch',
          line: 0,
          message: '扫描器说这个文件坏了，但真解析器说它合法 ⇒ 扫描器可能过严',
        });
      }
    }
    perFile.push({ path: abs, kind, findings, parser: parserResult, stats: scan.stats });
    total += findings.length;
  }
  return { perFile, total };
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const BASE_WORKFLOW = [
  'name: CI',
  'on:',
  '  push:',
  '    branches: [main]',
  'jobs:',
  '  build:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - name: Run',
  '        run: echo hi',
].join('\n');

/** 真实事故的原文（2026-11-05 telencephalon 的 step 名，冒号未加引号）。 */
const REAL_INCIDENT = [
  'name: CI',
  'on:',
  '  push:',
  '    branches: [main]',
  'jobs:',
  '  build:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - name: Cargo check (router-only: the brain must build without candle)',
  '        run: cargo check --manifest-path Cargo.toml',
].join('\n');

function selfTest() {
  const cases = [];
  const add = (name, yaml, expect, opts) => cases.push({ name, yaml, expect, opts });

  add(
    '真实事故形状（step 名带冒号却没加引号）',
    REAL_INCIDENT,
    { must: ['plain-scalar-colon'], clean: false },
  );
  add(
    '孪生：同一个 step 名加引号 ⇒ 必须干净',
    REAL_INCIDENT.replace(
      '- name: Cargo check (router-only: the brain must build without candle)',
      '- name: "Cargo check (router-only: the brain must build without candle)"',
    ),
    { clean: true },
  );
  add('Tab 缩进 ⇒ 必红', BASE_WORKFLOW.replace('    runs-on:', '   \truns-on:'), {
    must: ['tab-indent'],
  });
  add('孪生：空格缩进 ⇒ 必须干净', BASE_WORKFLOW, { clean: true });
  add(
    '重复键 ⇒ 必红',
    BASE_WORKFLOW.replace('    runs-on: ubuntu-latest', '    runs-on: ubuntu-latest\n    runs-on: windows-latest'),
    { must: ['duplicate-key'] },
  );
  add(
    '孪生：键不重复 ⇒ 必须干净',
    BASE_WORKFLOW.replace('    runs-on: ubuntu-latest', '    runs-on: ubuntu-latest\n    timeout-minutes: 10'),
    { clean: true },
  );
  add(
    '表达式不配对 ⇒ 必红',
    BASE_WORKFLOW.replace('run: echo hi', 'run: echo ' + '$' + '{{ matrix.os'),
    { must: ['unbalanced-expression'] },
  );
  add(
    '孪生：表达式配对 ⇒ 必须干净',
    BASE_WORKFLOW.replace('run: echo hi', 'run: echo ' + '$' + '{{ matrix.os }} done'),
    { clean: true },
  );
  add('引号不闭合 ⇒ 必红', BASE_WORKFLOW.replace('run: echo hi', 'run: "echo hi'), {
    must: ['unclosed-quote'],
  });
  add('孪生：引号闭合 ⇒ 必须干净', BASE_WORKFLOW.replace('run: echo hi', 'run: "echo hi"'), {
    clean: true,
  });
  add('缺 on ⇒ 必红', BASE_WORKFLOW.replace('on:\n', 'off:\n'), { must: ['missing-on'] });
  add('孪生：有 on ⇒ 必须干净', BASE_WORKFLOW, { clean: true });
  add(
    'step 同时有 uses 和 run ⇒ 必红',
    BASE_WORKFLOW.replace(
      '      - name: Run\n        run: echo hi',
      '      - name: Run\n        uses: actions/checkout@v7\n        run: echo hi',
    ),
    { must: ['step-both-actions'] },
  );
  add(
    '孪生：step 只有 run ⇒ 必须干净',
    BASE_WORKFLOW,
    { clean: true },
  );
  add(
    'step 两者都没有 ⇒ 必红',
    BASE_WORKFLOW.replace('        run: echo hi', '        shell: bash'),
    { must: ['step-missing-action'] },
  );
  add('job 没有 runs-on ⇒ 必红', BASE_WORKFLOW.replace('    runs-on: ubuntu-latest\n', ''), {
    must: ['job-missing-runs-on'],
  });
  add(
    'job 有 runs-on 没 steps ⇒ 必红',
    BASE_WORKFLOW.replace(
      '    steps:\n      - name: Run\n        run: echo hi',
      '',
    ),
    { must: ['job-missing-steps'] },
  );
  add(
    '块标量里的冒号不算错',
    BASE_WORKFLOW.replace('run: echo hi', 'run: |\n          echo "a: b"\n          echo c'),
    { clean: true },
  );
  add(
    '引号里的冒号不算错',
    BASE_WORKFLOW.replace('run: echo hi', 'run: echo "a: b"'),
    { clean: true },
  );
  add(
    'URL 里的冒号不算错',
    BASE_WORKFLOW.replace('run: echo hi', 'run: curl http://127.0.0.1:8080/health'),
    { clean: true },
  );
  add(
    '别的模板语法里的双花括号不算表达式（docker metadata-action 那种，块标量里）',
    [
      'name: CI',
      'on:',
      '  push:',
      '    branches: [main]',
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: docker/metadata-action@v5',
      '        id: meta',
      '        with:',
      '          images: ' + '$' + '{{ env.API_IMAGE }}',
      '          tags: |',
      '            type=sha,prefix=api-',
      '            type=raw,value=latest,enable={{is_default_branch}}',
    ].join('\n'),
    { clean: true },
  );

  // ⚠️ Y14 的孪生用例：少一个开括号的表达式 ⇒ ⇒ Y4 与真解析器都看不见它
  //    ⇒ ⇒ 必须单独判（2026-11-05 本仓自己踩到过这一行）。
  const BROKEN_EXPR_WORKFLOW = [
    'name: CI',
    'on:',
    '  push:',
    '    branches: [main]',
    'jobs:',
    '  build:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - name: Checkout',
    '        uses: actions/checkout@v7',
    '        with:',
    '          token: $' + '{ secrets.IBLOC_TOKEN }}',
  ].join('\n');
  add('少一个开括号的表达式 ⇒ 必红（Y4 与真解析器都看不见它）', BROKEN_EXPR_WORKFLOW, {
    must: ['malformed-expression'],
  });
  add('孪生：完整的表达式 ⇒ 必须干净', BROKEN_EXPR_WORKFLOW.replace(
    '$' + '{ secrets.IBLOC_TOKEN }}',
    '$' + '{{ secrets.IBLOC_TOKEN }}',
  ), { clean: true });
  add('孪生：**表达式嵌在更长字符串里** ⇒ 必须干净（不许误报）', BROKEN_EXPR_WORKFLOW.replace(
    '$' + '{ secrets.IBLOC_TOKEN }}',
    '$' + '{{ github.workspace }}/encephalon',
  ), { clean: true });
  add('孪生：shell 正文里的 ${VAR} 与 secrets 字样 ⇒ 必须干净', BROKEN_EXPR_WORKFLOW.replace(
    '$' + '{ secrets.IBLOC_TOKEN }}',
    'echo "${HOME} and secrets.X"',
  ), { clean: true });

  // ── composite action 的形状（2026-11-05 加：长任务搬进独立 workflow ⇒ ⇒
  //    顺带引入了 composite action ⇒ ⇒ 它也得被 YAML 闸管着）
  const BASE_COMPOSITE = [
    'name: Checkout the stack',
    'description: >',
    '  检出清单',
    'inputs:',
    '  token:',
    '    required: true',
    'runs:',
    '  using: composite',
    '  steps:',
    '    - name: Checkout one',
    '      uses: actions/checkout@v7',
    '      with:',
    '        repository: iBLOC/neuron',
    '    - name: Say hi',
    '      shell: bash',
    '      run: echo hi',
  ].join('\n');
  add('composite action：形状合法 ⇒ 必须干净', BASE_COMPOSITE, { clean: true }, { composite: true });
  add('孪生：composite 缺 runs ⇒ ⇒ 必红', BASE_COMPOSITE.replace('runs:\n', 'rungs:\n'), { must: ['composite-missing-runs'] }, { composite: true });
  add('孪生：composite 缺 steps ⇒ ⇒ 必红', BASE_COMPOSITE.replace('  steps:\n', '  stepz:\n'), { must: ['composite-missing-steps'] }, { composite: true });
  add('孪生：composite 缺 using ⇒ ⇒ 必红', BASE_COMPOSITE.replace('  using: composite\n', ''), { must: ['composite-missing-using'] }, { composite: true });
  add('孪生：composite 的 run 步缺 shell ⇒ ⇒ 必红', BASE_COMPOSITE.replace('      shell: bash\n', ''), { must: ['composite-run-missing-shell'] }, { composite: true });

  let bad = 0;
  for (const c of cases) {
    const scan = scanYamlText(c.yaml, c.opts || { workflow: true });
    const kinds = scan.findings.map((f) => f.kind);
    let ok = true;
    if (c.expect.clean) {
      ok = kinds.length === 0;
    } else {
      for (const need of c.expect.must || []) {
        if (!kinds.includes(need)) ok = false;
      }
    }
    console.log((ok ? '  [PASS] ' : '  [FAIL] ') + c.name + (ok ? '' : ' ⇒ 实际：' + JSON.stringify(kinds)));
    if (!ok) bad += 1;
  }

  const covCases = [
    ['覆盖面对账：0 个文件 ⇒ ⇒ 必须判「判不了」（不是绿）', coverageVerdict(0).ok === false],
    ['孪生：扫到文件 ⇒ ⇒ 判「可以判」', coverageVerdict(3).ok === true],
  ];
  for (const [name, ok] of covCases) {
    console.log((ok ? '  [PASS] ' : '  [FAIL] ') + name);
    if (!ok) bad += 1;
  }
  // ⚠️ 分母要含**全部**用例（2026-11-05 自查踩到：新增的覆盖面对账用例
  //    没进分母 ⇒ ⇒ 印成 21/21 而实际 23 条 ⇒ ⇒ 「量异常前先量总数」）。
  const total = cases.length + covCases.length;
  console.log('  判据自检：' + (total - bad) + '/' + total);
  if (bad > 0) {
    console.error('❌ 自检没过 ⇒ 闸门自己不可信');
    process.exit(1);
  }
  console.log('✅ 自检通过');
  process.exit(0);
}

/** 在**副本**上做「绿 → 红 → 绿」演练，真文件一个字不动。 */
function drill(files) {
  if (files.length === 0) {
    console.error('❌ 没有可演练的文件（判不了 ≠ 没问题）');
    process.exit(2);
  }
  const target = files[0];
  const original = readFileSync(target, 'utf8');
  const before = sha256(original);

  const dir = mkdtempSync(join(tmpdir(), 'yamldrill-'));
  const copyPath = join(dir, 'workflow.yml');
  writeFileSync(copyPath, original, 'utf8');

  const steps = [];

  const scanCopy = () => {
    const res = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--json', '--file=' + copyPath], {
      encoding: 'utf8',
      timeout: 120000,
    });
    let parsed = null;
    try {
      parsed = JSON.parse(String(res.stdout || '{}'));
    } catch {
      parsed = null;
    }
    return { code: res.status, data: parsed };
  };

  const base = scanCopy();
  steps.push({
    name: '副本原样 ⇒ 必须绿',
    ok: base.code === 0,
    detail: 'exit=' + base.code,
  });

  const brokenText = original.replace(
    /- name: (.+)/,
    '- name: $1 (drill: injected colon: here)',
  );
  writeFileSync(copyPath, brokenText, 'utf8');
  const broken = scanCopy();
  const brokenKinds =
    broken.data && broken.data.perFile
      ? broken.data.perFile.flatMap((f) => f.findings.map((x) => x.kind))
      : [];
  steps.push({
    name: '副本注入冒号 ⇒ 必须红（且抓到 plain-scalar-colon）',
    ok: broken.code === 1 && brokenKinds.includes('plain-scalar-colon'),
    detail: 'exit=' + broken.code + ' kinds=' + JSON.stringify(brokenKinds),
  });

  // ⚠️ 第二段退化：注入「少一个开括号的表达式」（Y14）⇒ ⇒ 必须红。
  //    退化只发生在**副本**里 ⇒ ⇒ 真文件一个字不动（末尾有 SHA256 核对）。
  const exprRe = /\$\{\{[^}]*\}\}/;
  if (exprRe.test(original)) {
    const brokenExprText = original.replace(exprRe, '$' + '{ secrets.IBLOC_TOKEN }}');
    writeFileSync(copyPath, brokenExprText, 'utf8');
    const brokenExpr = scanCopy();
    const brokenExprKinds =
      brokenExpr.data && brokenExpr.data.perFile
        ? brokenExpr.data.perFile.flatMap((f) => f.findings.map((x) => x.kind))
        : [];
    steps.push({
      name: '副本注入少一个开括号的表达式 ⇒ 必须红（且抓到 malformed-expression）',
      ok: brokenExpr.code === 1 && brokenExprKinds.includes('malformed-expression'),
      detail: 'exit=' + brokenExpr.code + ' kinds=' + JSON.stringify(brokenExprKinds),
    });
  } else {
    steps.push({
      name: '副本注入少一个开括号的表达式 ⇒ 这份 workflow 里没有表达式 ⇒ 跳过',
      ok: true,
      detail: 'skipped',
    });
  }

  writeFileSync(copyPath, original, 'utf8');
  const restored = scanCopy();
  steps.push({
    name: '副本还原 ⇒ 必须绿',
    ok: restored.code === 0,
    detail: 'exit=' + restored.code,
  });

  const after = sha256(readFileSync(target, 'utf8'));
  steps.push({
    name: '真文件 SHA256 前后一致（演练不许碰真文件）',
    ok: before === after,
    detail: before.slice(0, 16) + ' vs ' + after.slice(0, 16),
  });

  // ⚠️ 「绿灯但什么都没查」的那一档：空目录 ⇒ ⇒ 必须判「判不了」（退出码 2）
  const emptyDir = mkdtempSync(join(tmpdir(), 'yamldrill-empty-'));
  const emptyRes = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), '--json', '--root=' + emptyDir],
    { encoding: 'utf8', timeout: 120000 },
  );
  steps.push({
    name: '空目录 ⇒ 必须判「判不了」（退出码 2），不是绿',
    ok: emptyRes.status === 2,
    detail: 'exit=' + emptyRes.status,
  });
  rmSync(emptyDir, { recursive: true, force: true });

  rmSync(dir, { recursive: true, force: true });

  let bad = 0;
  for (const s of steps) {
    console.log((s.ok ? '  [PASS] ' : '  [FAIL] ') + s.name + ' ⇒ ' + s.detail);
    if (!s.ok) bad += 1;
  }
  console.log('  演练：' + (steps.length - bad) + '/' + steps.length);
  if (bad > 0) {
    console.error('❌ 演练没过 ⇒ 闸门不能证明自己会红');
    process.exit(1);
  }
  console.log('✅ 演练通过');
  process.exit(0);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(
      [
        '用法：',
        '  node scripts/check-yaml-valid.mjs [--self-test] [--drill] [--audit] [--json]',
        '                              [--root=<dir>] [--parser=auto|python|npm|none]',
        '                              [--strict-parser]',
      ].join('\n'),
    );
    process.exit(0);
  }

  const roots = opts.roots.length > 0 ? opts.roots : [REPO_ROOT];
  const repos = [];
  for (const root of roots) {
    for (const repo of discoverRepos(root)) {
      if (!repos.includes(repo)) repos.push(repo);
    }
  }
  const files = opts.files.length > 0 ? opts.files.slice().sort() : listWorkflowFiles(repos);

  // ⚠️ **零文件 ⇒ ⇒ 退出码 2（判不了），不是绿** ⇒ ⇒ 否则就是
  //    「绿灯但什么都没查」（2026-11-05 同族坑：检出失败 / 路径写错 ⇒ ⇒
  //    闸扫到 0 个文件却报「零违规」）。
  const coverage = coverageVerdict(files.length);
  if (!coverage.ok) {
    console.error('❌ ' + coverage.reason);
    console.error('   扫了 ' + repos.length + ' 个仓、0 个 workflow ⇒ ⇒ 退出码 2');
    process.exit(2);
  }

  if (opts.selfTest) {
    selfTest();
  }

  const parser = probeParser(opts.parser);
  if (!parser && opts.strictParser) {
    console.error('❌ 没有找到真解析器（--strict-parser）⇒ 判不了 ≠ 没问题');
    process.exit(2);
  }

  if (opts.drill) {
    drill(files);
  }

  const result = checkFiles(files, parser);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          roots: roots.map((r) => relative(REPO_ROOT, r) || '.'),
          repos: repos.map((r) => relative(REPO_ROOT, r) || '.'),
          parser: parser ? parser.label : null,
          files: result.perFile.length,
          total: result.total,
          perFile: result.perFile.map((f) => ({
            path: relative(REPO_ROOT, f.path),
            findings: f.findings,
            parser: f.parser,
            stats: f.stats,
          })),
        },
        null,
        2,
      ),
    );
  } else if (opts.audit) {
    console.log('扫描根：' + roots.join(', '));
    console.log(
      '仓：' + repos.length + ' 个 ｜ YAML 文件：' + result.perFile.length + ' 个（workflow ' +
        result.perFile.filter((f) => f.kind !== 'composite').length +
        ' / composite action ' +
        result.perFile.filter((f) => f.kind === 'composite').length +
        '）',
    );
    console.log('真解析器：' + (parser ? parser.label : '无（只跑扫描器，未做差分交叉验证）'));
    console.log('违规合计：' + result.total);
    for (const f of result.perFile) {
      console.log(
        '  ' +
          relative(REPO_ROOT, f.path) +
          ' ｜ 行数 ' +
          f.stats.lines +
          ' ｜ 违规 ' +
          f.findings.length +
          ' ｜ 解析器 ' +
          (f.parser ? (f.parser.ok ? 'ok' : 'ERR ' + (f.parser.error || '')) : 'n/a'),
      );
    }
  } else {
    console.log(
      '扫描 ' +
        repos.length +
        ' 个仓 / ' +
        result.perFile.length +
        ' 个 YAML 文件（workflow + composite action）｜ 真解析器：' +
        (parser ? parser.label : '无（未做差分交叉验证）'),
    );
    for (const f of result.perFile) {
      if (f.findings.length === 0) continue;
      console.log('❌ ' + relative(REPO_ROOT, f.path));
      for (const finding of f.findings) {
        console.log(
          '   - [' +
            finding.kind +
            '] 第 ' +
            finding.line +
            ' 行：' +
            finding.message +
            (finding.value ? ' ⇒ 值：' + finding.value : ''),
        );
      }
    }
    if (result.total === 0) {
      console.log('✅ 零违规（' + result.perFile.length + ' 个 YAML 文件全过）');
    } else {
      console.log('❌ 共 ' + result.total + ' 条违规');
    }
  }

  process.exit(result.total > 0 ? 1 : 0);
}

main();
