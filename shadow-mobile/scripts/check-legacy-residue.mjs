#!/usr/bin/env node
/**
 * 移动端残留闸 —— **两组判据**
 *
 * ⚠️ 判据（算法）不在这里 ⇒ 在 shadow/scripts/lib/legacy-residue.mjs（**一处实现**）
 *    这里只提供**数据**：扫哪些目录 ＋ 哪些 token 属兼容契约、可以豁免。
 *
 * ── 两组判据（**判据不同，范围也不同**）─────────────────────────
 *   ① cortex → telencephalon 改名残留（**词级**）
 *      —— 移动端的「cortex」几乎全是**旧协议回退**与**兼容 shim 名**
 *         ⇒ 不该删，但必须**登记在案** ⇒ 否则哪天有人「顺手改成 telencephalon」
 *         就把旧端脑的回退路径断了（**失败长得像成功**）。
 *
 *   ② 旧「嵌入式 Prefrontal」运行时残留（**代码级**）
 *      —— 那套是上一个架构时代的东西（prefrontal 独立仓的 Layer-3 引擎，
 *         走自己的 mini HTTP server / 旧方言 / 绕开 端脑→叶区→neuron 链路）。
 *         现在端脑是**进程内的大脑**（encephalon ⇒ libencephalon.so），
 *         那条支线**必须**不许回来。
 *      ⚠️ 只扫代码，不扫 docs/ 与 AGENTS.md —— **台账要记得历史**，
 *         历史里出现旧名字是对的；代码里出现才是回归。
 *      ⚠️ 名单**故意不含** PrefrontalClient（客户端面，还在用）、
 *         PrefrontalMNN（MNN 本地推理桥，还在用）、
 *         PrefrontalAccessibilityService（无障碍服务，还在用）。
 *
 * ── 为什么从 .sh 换成 Node ────────────────────────────────────────
 *   ① 旧的 .sh 闸**在 Windows 开发机上根本跑不了**（本机 WSL 无发行版）
 *      ⇒ 「有闸」这件事只能靠人记着。
 *   ② 它**没进 CI** ⇒ 绿不绿没人知道。
 *   ③ 旧的 cortex 判据只看**标识符** ⇒ 用户看得见的那句「启动 Cortex」
 *      根本不在判据里。
 *
 * 用法（从 shadow-mobile 根跑）：
 *   node scripts/check-legacy-residue.mjs             # 主流程
 *   node scripts/check-legacy-residue.mjs --self-test # 自检：判据有没有分辨力
 *
 * 退出码：0 = 干净 / 1 = 有残留 / 2 = 判不了（豁免条目腐烂）
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { runGate, runSelfTest, listTextFiles, scanPatterns } from '../../scripts/lib/legacy-residue.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 兼容契约豁免清单 —— **每条都要写清理由**。
 * ⚠️ 这不是「垃圾桶」：闸会检查每条 token **是否真的还在仓库里出现过**，
 *    没出现 ⇒ 报「豁免条目已腐烂」并以退出码 2 结束。
 */
const ALLOWED = [
  // ⚠️ 2026-11-06 改名刀销账：旧 token check-cortex-residue（闸自己的旧文件名）
  //    —— 闸与引用它的 README 脚本表同步改姓 legacy-residue ⇒ 旧名不再出现
  //    ⇒ 留着就是「登记了却已修好」的腐烂豁免。
  {
    token: "'cortex'",
    reason: "旧端脑的 AgentsResponse 信封旧键：客户端优先读 'telencephalon'，读不到才回退 'cortex'（旧端脑还在跑时要兼容）。",
  },
  {
    token: '"cortex"',
    reason: '同上（旧键的注释里也是双引号写法）。',
  },
  {
    token: 'cortex_router',
    reason: '端脑兼容 shim 模块名 telencephalon::boot::cortex_router —— 是**真模块名**，改了就编不过。',
  },
];

/** 旧嵌入式 Prefrontal 运行时的**标识符**（代码级） */
const PREFRONTAL_PATTERNS = [
  { name: 'prefrontal_runtime', re: /prefrontal_runtime\b/ },
  { name: 'PrefrontalRuntime', re: /PrefrontalRuntime\b/ },
  { name: 'PrefrontalRuntimeService', re: /PrefrontalRuntimeService\b/ },
  { name: 'PrefrontalMobileService', re: /PrefrontalMobileService\b/ },
  { name: 'PrefrontalMobileProvider', re: /PrefrontalMobileProvider\b/ },
  { name: 'PrefrontalMobilePage', re: /PrefrontalMobilePage\b/ },
  { name: 'PrefrontalMobileStatus', re: /PrefrontalMobileStatus\b/ },
  { name: 'prefrontalMobileProvider', re: /prefrontalMobileProvider\b/ },
  { name: 'prefrontalMobilePortProvider', re: /prefrontalMobilePortProvider\b/ },
  { name: 'prefrontalMobileServiceProvider', re: /prefrontalMobileServiceProvider\b/ },
  { name: 'libprefrontal_core_lib', re: /libprefrontal_core_lib/ },
  { name: '/settings/prefrontal', re: /\/settings\/prefrontal/ },
];

const OPTS = {
  root: ROOT,
  label: 'shadow-mobile',
  scanDirs: ['lib', 'test', 'android', 'scripts'],
  scanFiles: ['README.md', 'ARCHITECTURE.md'],
  excludeDirs: [
    '.dart_tool', 'build', '.git', 'Pods', '.gradle',
    'lib/generated/l10n',
    'docs',
    // ⚠️ 构建产物与工具快照目录（**不是活代码**）：
    //   .cxx    —— Android NDK 的 CMake 产物（里面的 --fix-cortex-a53 是 ARM CPU 勘误表，与本项目无关）
    //   .mimosa —— 本地工具（hook-state）留的源码快照
    '.cxx', '.mimosa',
  ],
  excludeFiles: [
    'check-legacy-residue.mjs',  // 闸自己（2026-11-06 改名刀改姓）：它当然知道「cortex」这个词
    'pubspec.lock',
    '.flutter-plugins',
    '.flutter-plugins-dependencies',
    // ⚠️ **显式**排除台账 —— 它当然要记得历史（里面全是旧名）⇒
    //    「台账不扫」这件事必须是**写下来的**，不能靠「它恰好不在扫描范围里」。
    'AGENTS.md',
  ],
  allowed: ALLOWED,
};

/** 第二组判据：旧嵌入式 Prefrontal 运行时（代码级） */
function checkPrefrontal() {
  const files = [];
  for (const d of ['lib', 'android', 'test']) {
    files.push(
      ...listTextFiles(join(ROOT, d), {
        excludeDirs: ['.dart_tool', 'build', '.git', 'Pods', '.gradle', 'lib/generated/l10n', '.cxx', '.mimosa'],
        excludeFiles: ['pubspec.lock', '.flutter-plugins', '.flutter-plugins-dependencies'],
        base: ROOT,
      }),
    );
  }
  const hits = scanPatterns(files, PREFRONTAL_PATTERNS);

  // 旧 .so 回包（构建产物，文本扫不到 ⇒ 单独判存在性）
  const soHits = [];
  const jniDir = join(ROOT, 'android/app/src/main/jniLibs');
  if (existsSync(jniDir)) {
    for (const d of readdirSync(jniDir)) {
      const p = join(jniDir, d, 'libprefrontal_core_lib.so');
      if (existsSync(p)) soHits.push(p);
    }
  }

  const lines = [];
  if (hits.length === 0 && soHits.length === 0) {
    lines.push('✓ 第二组判据：旧嵌入式 Prefrontal 运行时 0 条残留');
    return { code: 0, out: lines.join('\n') };
  }
  lines.push('✗ 第二组判据：旧嵌入式 Prefrontal 运行时 ' + (hits.length + soHits.length) + ' 条残留');
  for (const h of hits) {
    lines.push('  [' + h.pattern + '] ' + h.file.replace(ROOT + '\\', '') + ':' + h.line + '  ' + h.text);
  }
  for (const s of soHits) lines.push('  [旧 .so] ' + s.replace(ROOT + '\\', '') + ' 还在包里');
  return { code: 1, out: lines.join('\n') };
}

/** 第二组判据的自检：造一次残留确认看得见；放仍在用的名字确认不误报 */
function selfTestPrefrontal() {
  const lines = [];
  let fails = 0;
  const bad = 'class PrefrontalRuntime {}';
  const good = 'class PrefrontalClient {}\nclass PrefrontalMNN {}\nclass PrefrontalAccessibilityService {}';
  if (PREFRONTAL_PATTERNS.some((p) => p.re.test(bad))) {
    lines.push('✓ ②a 造出来的旧运行时标识符被抓到了');
  } else {
    lines.push('✗ ②a 造出来的旧运行时标识符没被抓到 ⇒ 这一族是恒绿的');
    fails++;
  }
  if (!PREFRONTAL_PATTERNS.some((p) => p.re.test(good))) {
    lines.push('✓ ②b 仍在用的三个名字没有被误报');
  } else {
    lines.push('✗ ②b 仍在用的三个名字被误报了');
    fails++;
  }
  return { code: fails === 0 ? 0 : 1, out: lines.join('\n') };
}

if (process.argv.includes('--self-test')) {
  const a = runSelfTest({ ...OPTS, label: 'shadow-mobile' });
  const b = selfTestPrefrontal();
  console.log(a.out);
  console.log('');
  console.log(b.out);
  console.log('');
  const code = a.code === 0 && b.code === 0 ? 0 : 1;
  console.log(code === 0 ? '✓ 自检全绿' : '✗ 自检有红');
  process.exit(code);
}

const wordGate = runGate(OPTS);
console.log(wordGate.out);
console.log('');
const pre = checkPrefrontal();
console.log(pre.out);
process.exit(wordGate.code === 0 && pre.code === 0 ? 0 : (wordGate.code === 2 || pre.code === 2 ? 2 : 1));
