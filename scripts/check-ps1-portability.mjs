#!/usr/bin/env node
/**
 * .ps1 可移植性闸 —— 抓「带中文的 .ps1 在 Windows PowerShell 5.1 下根本跑不起来」
 *
 * ## 病（2026-11-01 实测）
 *
 * 本仓的 `.ps1` 几乎都带中文注释，而它们是**无 BOM 的 UTF-8**。
 * Windows PowerShell 5.1（`powershell.exe`，Windows 的默认 shell）**不认无 BOM 的 UTF-8**
 * ⇒ ⇒ 它按 **ANSI** 读（中文机器 = cp936/GBK）⇒ ⇒ **双字节解码把 0x0A 当成尾字节吃掉**
 * ⇒ ⇒ **换行消失**（实测：386 行 → 352 行，**丢了 34 个换行**）
 * ⇒ ⇒ 注释行与**下一行合并** ⇒ ⇒ `#` 把真正的代码吞掉 ⇒ ⇒ 括号配对坏掉
 * ⇒ ⇒ **解析期就报错**（实测 `prove-a2ui-failure-on-device.ps1` 在 5.1 下 **62 个解析错误**）
 * ⇒ ⇒ 脚本**连跑都跑不起来**，而报错是乱码 ⇒ 看着像「脚本自己写错了」。
 *
 * ⚠️ **这不是「脚本写得不对」** —— 同样的字节在 **pwsh 7** 下**零错误**。
 * ⇒ ⇒ 判据必须是**宿主**的解析器，不是「文件长得对不对」。
 *
 * ## 修法
 *
 * 加 **UTF-8 BOM**（`EF BB BF`）⇒ 5.1 认出 UTF-8 ⇒ 零解析错误；
 * pwsh 7 也照样能跑（BOM 对它合法）⇒ ⇒ **内容一个字都不用改**。
 *
 * ## 闸门抓什么
 *
 * 每个 `.ps1`（被跟踪的 + 未跟踪未忽略的）：
 * - 在 **5.1** 下解析 ⇒ 有错 ⇒ **红**；
 * - 再在 **pwsh 7** 下解析 ⇒ 也有错 ⇒ 说明**脚本本身坏了**（不是编码问题）
 *   ⇒ 同样红，但**话要说对**（两种病两种修法）。
 *
 * ## 逃生阀
 *
 * 脚本改成**纯 ASCII**（注释里不写中文）⇒ 不需要 BOM ⇒ 闸门也判绿。
 *
 * ## 自检
 *
 * `--self-test` 用**与真实输入同形**的三个夹具：无 BOM 的中文脚本（5.1 必炸）、
 * 同一份加 BOM（5.1 必绿）、纯 ASCII（必绿）⇒ ⇒ 闸门必须**自己能抓到**这个坑。
 *
 * 退出码：0 绿 / 1 有红 / 2 判不了（闸门自己坏了 ⇒ 不许当绿）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** 探针脚本：只用 ASCII 写（它自己也要能在 5.1 下解析）。 */
const PROBE = [
  'foreach ($p in $args) {',
  '  $errs = $null',
  '  [System.Management.Automation.Language.Parser]::ParseFile($p, [ref]$null, [ref]$errs) | Out-Null',
  '  $n = if ($errs) { $errs.Count } else { 0 }',
  "  $m = if ($errs -and $errs.Count -gt 0) { ($errs[0].Message -replace '[\\r\\n]+', ' ') } else { '' }",
  '  Write-Output ($p + [char]9 + $n + [char]9 + $m)',
  '}',
].join('\r\n');

/** 用某个宿主的解析器读一批文件 ⇒ Map<绝对路径, {errors, message}>。宿主不存在 ⇒ null。 */
function parseWith(host, absFiles) {
  if (absFiles.length === 0) return new Map();
  const probeDir = mkdtempSync(join(tmpdir(), 'ps1probe-'));
  const probePath = join(probeDir, 'probe.ps1');
  writeFileSync(probePath, PROBE, 'ascii');
  const res = spawnSync(
    host,
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', probePath, ...absFiles],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  if (res.error) return null;
  const out = new Map();
  for (const line of String(res.stdout || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    out.set(parts[0], {
      errors: Number(parts[1]) || 0,
      message: (parts[2] || '').trim(),
    });
  }
  return out;
}

/** 仓库里所有 `.ps1`（被跟踪的 + 未跟踪但未忽略的）。 */
function listPs1() {
  const out = new Set();
  const invocations = [
    ['-z', '--', '*.ps1'],
    ['-z', '--others', '--exclude-standard', '--', '*.ps1'],
  ];
  for (const args of invocations) {
    const res = spawnSync('git', ['ls-files', ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    if (res.status !== 0) continue;
    for (const p of String(res.stdout || '').split('\0')) {
      if (p && existsSync(join(REPO_ROOT, p))) out.add(p);
    }
  }
  return [...out].sort();
}

function hasUtf8Bom(absPath) {
  const b = readFileSync(absPath);
  return b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf;
}

function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), 'ps1selftest-'));
  // ⚠️ 必须与真实输入**同形**：无 BOM 的 UTF-8 + 中文注释 + 注释行以中文收尾
  // ⇒ cp936 解码会吃掉那一行的换行 ⇒ 下一行被 `#` 吞掉 ⇒ 括号不配对 ⇒ 5.1 报错。
  const broken =
    "Write-Output (\n" +
    "# 这一行以中文收尾 —— 时\n" +
    "  'ok')\n";
  const ascii = "Write-Output (\n# ascii only comment\n  'ok')\n";
  writeFileSync(join(dir, 'broken.ps1'), Buffer.from(broken, 'utf8'));
  writeFileSync(
    join(dir, 'bom.ps1'),
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(broken, 'utf8')]),
  );
  writeFileSync(join(dir, 'ascii.ps1'), Buffer.from(ascii, 'utf8'));

  const files = ['broken.ps1', 'bom.ps1', 'ascii.ps1'].map((f) => join(dir, f));
  const p51 = parseWith('powershell.exe', files);
  if (!p51) {
    console.error('❌ 本机没有 powershell.exe ⇒ 自检无法运行（判不了 ≠ 没问题）');
    process.exit(2);
  }
  const pwsh = parseWith('pwsh', files);
  const err = (m, f) => (m ? m.get(f)?.errors ?? 0 : 0);
  const checks = [
    ['无 BOM 的中文脚本在 5.1 下必炸', err(p51, files[0]) > 0],
    ['同一份加 BOM 后在 5.1 下必绿', err(p51, files[1]) === 0],
    ['纯 ASCII 在 5.1 下必绿', err(p51, files[2]) === 0],
    [
      '夹具本身在 pwsh 7 下是好的（坏的只是宿主的解码）',
      pwsh ? err(pwsh, files[0]) === 0 : true,
    ],
  ];
  let bad = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? '  [PASS]' : '  [FAIL]'} ${name}`);
    if (!ok) bad++;
  }
  if (bad > 0) {
    console.error('❌ 自检没过 ⇒ 闸门自己不可信');
    process.exit(1);
  }
  console.log('✅ 自检通过');
  process.exit(0);
}

function check() {
  const files = listPs1();
  if (files.length === 0) {
    console.error('❌ 一个 .ps1 都没找到 ⇒ 闸门自己坏了（路径写错 / 仓库挪了家）');
    process.exit(2);
  }
  const abs = files.map((f) => join(REPO_ROOT, f));
  const p51 = parseWith('powershell.exe', abs);
  if (!p51) {
    console.error('❌ 本机没有 powershell.exe ⇒ 判不了');
    console.error('   （本闸的判据是 **Windows PowerShell 5.1 的解析器** —— 它只在 Windows 上有）');
    process.exit(2);
  }
  const pwsh = parseWith('pwsh', abs);

  // ⚠️ **防假绿**：探针必须**每个文件都读到一行**。
  //   （第一版探针忘了遍历 $args ⇒ 每个文件都读到 0 错 ⇒ 一片假绿 ——
  //     这个坑是 `--self-test` 抓出来的，不是眼睛看出来的。）
  if (p51.size !== files.length) {
    console.error(`❌ 探针只读回 ${p51.size} 行，却要判 ${files.length} 个文件 ⇒ 判不了`);
    console.error('   （闸门自己坏了 —— 这不是「没问题」）');
    process.exit(2);
  }

  const offenders = [];
  for (const f of files) {
    const absPath = join(REPO_ROOT, f);
    const a = p51.get(absPath) || { errors: 0, message: '' };
    if (a.errors === 0) continue;
    const b = pwsh ? pwsh.get(absPath) || { errors: 0 } : null;
    offenders.push({
      file: f,
      errors: a.errors,
      message: a.message,
      alsoFailsInPwsh: b ? b.errors > 0 : null,
      bom: hasUtf8Bom(absPath),
    });
  }

  if (offenders.length === 0) {
    console.log(`✅ .ps1 在 Windows PowerShell 5.1 下都能解析（${files.length} 个文件）`);
    console.log('   5.1 是 Windows 的默认 shell —— 它读不动的脚本，别人就跑不动。');
    process.exit(0);
  }

  console.error(`❌ ${offenders.length} 个 .ps1 在 Windows PowerShell 5.1 下解析失败（扫了 ${files.length} 个）：`);
  for (const o of offenders) {
    console.error(`   ${o.file}  （${o.errors} 个解析错误${o.bom ? '' : '，无 BOM'}）`);
    console.error(`      ${o.message}`);
    if (o.alsoFailsInPwsh === false) {
      console.error('      ⇒ pwsh 7 下是好的 ⇒ **纯编码问题**（5.1 按 ANSI 读，吃掉了换行）');
      console.error('      ⇒ 修法：给这个文件加 **UTF-8 BOM**（EF BB BF），内容一个字都不用改');
    } else if (o.alsoFailsInPwsh === true) {
      console.error('      ⇒ pwsh 7 下**也**解析失败 ⇒ 这不是编码问题，是**脚本本身坏了**');
    }
  }
  console.error('');
  console.error('   要么给文件加 UTF-8 BOM，要么把脚本改成纯 ASCII（注释里不写中文）。');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) selfTest();
else check();
