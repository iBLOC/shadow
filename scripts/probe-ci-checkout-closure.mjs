#!/usr/bin/env node
/**
 * CI 检出闭包探针 —— 逐 job 算 path 依赖闭包，看检出清单够不够。
 * ===========================================================================
 *
 * ⚠️ **这不是闸** —— 闸是 scripts/check-*.mjs（治理闸只数那个形状）。
 *    这是一道**可复跑的分析**：把「CI 的检出清单够不够」从人工 grep
 *    变成一条命令 ⇒ ⇒ 但它**没有判据、没有自检、没接 CI** ⇒ ⇒
 *    「升级成闸」是登记在册的欠账（AGENTS.md U+3398 条 ⑥②）。
 *
 *   用法：node scripts/probe-ci-checkout-closure.mjs [--workflow=<文件>]
 *   退出码：0 = 没发现破口；1 = 有破口；2 = 判不了（缺仓 / 读不到清单）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL, SHADOW_ROOT } from './lib/ci-cargo.mjs';
import { parseWorkflow, layoutOf, closure } from './lib/ci-workflow.mjs';

const argDir = process.argv.find((a) => a.startsWith('--workflow-dir='));
const WF = argDir ? path.resolve(argDir.split('=')[1]) : path.join(SHADOW_ROOT, '.github', 'workflows');
const argWf = process.argv.find((a) => a.startsWith('--workflow='));

let files = [];
try {
  files = fs.readdirSync(WF).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
} catch {
  console.log('判不了：读不到 ' + WF);
  process.exit(2);
}
if (argWf) files = files.filter((f) => f.endsWith(argWf.split('=')[1]));
if (!files.length) {
  console.log('判不了：没有 workflow 可扫');
  process.exit(2);
}

let holes = 0;
let judged = 0;
for (const f of files) {
  const text = fs.readFileSync(path.join(WF, f), 'utf8');
  for (const job of parseWorkflow(text)) {
    const layout = layoutOf(job);
    const cargo = job.steps.filter((s) => /cargo\s/.test(s.run) && /--manifest-path/.test(s.run));
    if (!cargo.length) continue;
    judged++;
    console.log('=== ' + f + ' :: ' + job.name +
      '  检出: ' + layout.co.map((c) => c.repo + (c.path ? '(' + c.path + ')' : '(root)')).join(', '));
    for (const s of cargo) {
      const wd = s.wd || null;
      let localDir;
      if (wd) {
        const hit = layout.co.find((c) => c.path === wd);
        localDir = hit ? path.join(LOCAL, hit.repo) : path.join(LOCAL, wd);
      } else {
        const rootCo = layout.co.find((c) => !c.path);
        localDir = rootCo ? path.join(LOCAL, rootCo.repo) : LOCAL;
      }
      const mp = (s.run.match(/--manifest-path\s+(\S+)/) || [])[1] || 'Cargo.toml';
      const manifest = path.resolve(localDir, mp);
      console.log('  - ' + s.name + '  [wd=' + (wd || '(root)') + ']');
      if (!fs.existsSync(manifest)) {
        console.log('      ✗ 判不了：本地没有这个 manifest：' + manifest);
        holes++;
        continue;
      }
      const { edges } = closure(manifest, layout);
      const bad = edges.filter((e) => e.status !== 'OK');
      const need = [...new Set(edges.filter((e) => e.status === 'OK' && e.repo).map((e) => e.repo))].sort();
      console.log('      闭包涉及仓: ' + (need.length ? need.join(', ') : '(无跨仓 path 依赖)'));
      if (!bad.length) console.log('      布局检查: 全部指得到 ✓');
      for (const h of bad) {
        console.log('      ✗ ' + h.status + '  ' + path.relative(LOCAL, h.from) +
          '  [' + h.key + '] path="' + h.path + '"  → ' + h.why +
          (h.virtual ? '   [虚=' + h.virtual + ']' : ''));
        holes++;
      }
    }
  }
}
console.log('');
console.log(holes === 0
  ? '✓ 没发现破口（判了 ' + judged + ' 个带 cargo 步骤的 job）'
  : '✗ ' + holes + ' 处破口');
process.exit(holes === 0 ? 0 : 1);
