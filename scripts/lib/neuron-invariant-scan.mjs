/**
 * neuron-invariant-scan.mjs —— 「全局唯一 neuron」这条不变量的**两层探针**。
 *
 * # 为什么源码层不够
 *
 * 源码层（谁 new 了 CandleLlmRuntime）只能证明**代码**的归属；
 * 而这条不变量真正的失败形态有两个，源码层看不见：
 *
 * ① **feature 图层**：candle 是 neuron 的后端，海马体也有一个 local-models
 *    feature 能自己嵌 neuron ⇒ ⇒ 谁在脑侧那条链上把它打开了 ⇒ ⇒ **解析后的
 *    feature 图**说了算 ⇒ ⇒ grep 关键词看不见（关键词层 = N5，解析层 = N7）。
 * ② **产物层**：手机上装的是 .so，叶区与脑可能各自静态链了一份运行时 ⇒ ⇒
 *    两个产物都带运行时 ⇒ ⇒ 同一个 app 进程里加载两套 ⇒ ⇒ **二进制**说了算
 *    ⇒ ⇒ 而且产物往往**裁过符号** ⇒ ⇒ 符号表看不见 ⇒ ⇒ 只能扫字节痕迹。
 *
 * # 纯函数
 *
 * · scanFileMarkers(path, markers) —— 流式扫字节（不把几百 MB 读进内存）
 * · parseFeatureTree(text) —— 解析 cargo tree -e features 的输出
 * · evaluateArtifacts(artifacts) —— 产物层判定（纯，可被自检喂夹具）
 */

import {
  openSync,
  readSync,
  closeSync,
  readdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * neuron 运行时的**字节痕迹**。
 *
 * ⚠️ 为什么是这两个：
 * · run_embedded —— neuron 仓里「起一个内嵌运行时」的那个入口
 *   （Rust 的 panic 路径字符串会把它写进二进制）
 * · CandleLlmRuntime —— 进程内的 candle 推理运行时类型名
 * ⚠️ 这两个是**字符串痕迹**，不是实例计数 ⇒ ⇒ 一份产物里出现多次不代表
 * 多个实例 ⇒ ⇒ 判定看的是「**几个产物**带了它」，不是「出现几次」。
 */
export const RUNTIME_MARKERS = ['run_embedded', 'CandleLlmRuntime'];

/** 叶区 ⇒ ⇒ 叶区产物里出现运行时 ⇒ ⇒ 就是第二个宿主。 */
const LOBE_HINTS = [
  'prefrontal',
  'hippocampus',
  'diencephalon',
  'temporal',
  'parietal',
  'amygdala',
  'occipital',
];

/** 大脑（脑面宿主）⇒ ⇒ 运行时只许出现在它身上。 */
const BRAIN_HINTS = ['encephalon', 'brain', 'shadow-desktop'];

/** 产物角色：brain / lobe / other。 */
export function classifyArtifactRole(name) {
  const n = String(name).toLowerCase();
  if (LOBE_HINTS.some((h) => n.includes(h))) return 'lobe';
  if (BRAIN_HINTS.some((h) => n.includes(h))) return 'brain';
  return 'other';
}

/**
 * 流式扫一个文件里各标记的出现次数。
 *
 * ⚠️ 用**分块 + 重叠**读，而不是 readFileSync ⇒ ⇒ 一个 460 MB 的 exe
 * 也不会把内存吃光 ⇒ ⇒ 而且窗口式的重叠保证跨块的匹配不会漏。
 */
export function scanFileMarkers(filePath, markers = RUNTIME_MARKERS, chunkSize = 4 * 1024 * 1024) {
  const needles = markers.map((m) => Buffer.from(m, 'latin1'));
  const counts = new Array(markers.length).fill(0);
  const overlap = Math.max(1, ...needles.map((n) => n.length)) - 1;
  const buf = Buffer.allocUnsafe(chunkSize + overlap);
  const fd = openSync(filePath, 'r');
  try {
    let carry = 0;
    for (;;) {
      const read = readSync(fd, buf, carry, chunkSize, null);
      if (read <= 0) break;
      const total = carry + read;
      const view = buf.subarray(0, total);
      for (let i = 0; i < needles.length; i++) {
        let pos = 0;
        for (;;) {
          const idx = view.indexOf(needles[i], pos);
          if (idx === -1) break;
          counts[i]++;
          pos = idx + 1;
        }
      }
      carry = Math.min(overlap, total);
      if (carry > 0) buf.copy(buf, 0, total - carry, total);
    }
  } finally {
    closeSync(fd);
  }
  const out = {};
  markers.forEach((m, i) => {
    out[m] = counts[i];
  });
  return out;
}

/**
 * 产物层判定（纯函数）。
 *
 * artifacts: [{ group, path, role, counts: { marker: n } }]
 *
 * 两条判据：
 * ① **叶区产物里不许带运行时** ⇒ ⇒ 那就是第二个宿主（同进程两套）。
 * ② **同一组产物里带运行时的只能有一个** ⇒ ⇒ 组 = 一起装进同一个 app 的那批文件。
 */
export function evaluateArtifacts(artifacts, markers = RUNTIME_MARKERS) {
  const findings = [];
  const groups = new Map();
  for (const a of artifacts) {
    const runtime = markers.some((m) => (a.counts || {})[m] > 0);
    if (runtime && a.role === 'lobe') {
      findings.push({
        id: 'N8',
        file: a.path,
        why: '叶区产物里带着 neuron 运行时 ⇒ ⇒ 它自己成了第二个宿主',
      });
    }
    if (!groups.has(a.group)) groups.set(a.group, []);
    groups.get(a.group).push({ ...a, runtime });
  }
  for (const [group, list] of groups) {
    const withRuntime = list.filter((x) => x.runtime);
    if (withRuntime.length > 1) {
      findings.push({
        id: 'N8',
        file: group,
        why:
          '同一组产物里有 ' +
          withRuntime.length +
          ' 个带 neuron 运行时（' +
          withRuntime.map((x) => x.path).join(' ｜ ') +
          '）⇒ ⇒ 同一个进程里会加载两套运行时',
      });
    }
  }
  return findings;
}

/**
 * 剥掉 ANSI 转义序列。
 *
 * ⚠️ **为什么必须有这一层**（实测 2026-11-05，真 CI 上那条红的根因）：
 *   cargo 在 CARGO_TERM_COLOR=always 时会给树线**加颜色** ⇒ ⇒ 输出行长这样：
 *     ESC[2m ESC[0m   ESC[2m ESC[0m   ESC[2mESC[35m├──ESC[0m neuron feature "candle"
 *   ⇒ ⇒ 「行首是空白 ＋ 树前缀」这个前提**不成立** ⇒ ⇒ 正则一条都匹配不上。
 *   ⇒ ⇒ 而 CI 的 workflow **全局**设了 CARGO_TERM_COLOR: always
 *   ⇒ ⇒ 于是本机（无色）解析得对、CI（有色）解析出**空集**。
 *   ⇒ ⇒ 空集 ⇒ ⇒ N9 判「脑侧 neuron 没有 candle」⇒ ⇒ **假红**（挡路的那个红）；
 *   ⇒ ⇒ 同时 N7/N11 的解析层**恒不触发** ⇒ ⇒ **假绿**（更隐蔽：没人看见）。
 *   ⇒ ⇒ 所以「颜色是外观」这句话必须**逐字可证**：剥掉之后与无色输出逐字相同
 *   ⇒ ⇒ （实测确实相同 ⇒ ⇒ 夹具 scripts/cargo-tree-features[.colored].fixture.txt）。
 */
export function stripAnsi(text) {
  return String(text).replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, '');
}

/**
 * 解析 cargo tree -e features -i pkg 的输出。
 *
 * 返回 { pkgFeatures: Map<包名, Set<feature>> }。
 *
 * ⚠️ 语义：输出里每一行 pkg feature "X" 表示**包 pkg 的 feature X 被打开了**
 * ⇒ ⇒ 于是「neuron 带 candle」= 那个包里 candle 这个 feature 是开的。
 *
 * ⚠️ **先剥 ANSI** ⇒ ⇒ 有色输出与无色输出判出同一个结论（见 stripAnsi 的注释）。
 */
export function parseFeatureTree(text) {
  const pkgFeatures = new Map();
  const lines = stripAnsi(text).split(/\r?\n/);
  const addFeature = (pkg, feat) => {
    if (!pkgFeatures.has(pkg)) pkgFeatures.set(pkg, new Set());
    pkgFeatures.get(pkg).add(feat);
  };
  for (const line of lines) {
    const m = line.match(/^\s*(?:├── |└── )(?:.*?\s)?([A-Za-z0-9_.-]+) feature "([^"]+)"/);
    if (m) {
      addFeature(m[1], m[2]);
      continue;
    }
    const p = line.match(/^\s*(?:(?:├── |└── )([A-Za-z0-9_.-]+)\s+v)/);
    if (p) {
      if (!pkgFeatures.has(p[1])) pkgFeatures.set(p[1], new Set());
    }
  }
  return { pkgFeatures };
}

/**
 * 把「一次 cargo tree 的结果」判成「这个包身上开了哪些 feature」。
 *
 * ⚠️ **纯函数** ⇒ ⇒ 自检可以喂夹具 ⇒ ⇒ 不必真跑 cargo 就能判这条判据有没有分辨力。
 *
 * ⚠️ **三态**（不是两态）：
 *   · ok ＋ features    ⇒ ⇒ 判得了
 *   · ok ＋ notInGraph  ⇒ ⇒ 那个包压根不在图里 ⇒ ⇒ 没有这条边
 *   · ✗                 ⇒ ⇒ **判不了**（未覆盖）⇒ ⇒ 不许当成「没问题」
 *
 * ⚠️ **「输出里明明有 feature 行，却一个包都没解析出来」⇒ ⇒ 判不了**
 *   ⇒ ⇒ 绝不能当成「这个包真的没有 feature」⇒ ⇒ 那会让 N9 假红，
 *   ⇒ ⇒ 同时让 N7/N11 的解析层恒不触发（假绿）⇒ ⇒ 两头都在骗人。
 */
export function judgeFeatureParse({ status, stdout = '', stderr = '', pkg }) {
  const err = String(stderr || '').trim();
  if (status === 0) {
    const { pkgFeatures } = parseFeatureTree(stdout);
    // ⚠️ 解析器一个包都没解析出来 ⇒ ⇒ 那不是「没有 feature」，是「没解析出来」
    if (pkgFeatures.size === 0 && /feature "/.test(stripAnsi(stdout))) {
      return {
        ok: false,
        notInGraph: false,
        features: [],
        reason: 'cargo tree 成功，但输出里的 feature 行一个都没解析出来（输出形状变了？）',
        stderr: err,
      };
    }
    const set = pkgFeatures.get(pkg);
    return { ok: true, notInGraph: false, features: set ? [...set] : [], reason: '', stderr: err };
  }
  // 「这个包不在图里」⇒ ⇒ 那就没有这条边 ⇒ ⇒ 谈不上开了什么 feature
  if (/did not match any packages/.test(err)) {
    return { ok: true, notInGraph: true, features: [], reason: '', stderr: err };
  }
  return {
    ok: false,
    notInGraph: false,
    features: [],
    reason: 'cargo tree 退出码 ' + status + '：' + err.split('\n')[0],
    stderr: err,
  };
}

/**
 * 在**不改工作树**的前提下，让 cargo 去解析一次依赖图。
 *
 * ⚠️ 为什么需要这一层：cargo 的 `--locked` 会在「manifest 与锁不一致」时
 * **直接拒绝** ⇒ ⇒ 解析层当场失效（实测：某个仓的 Cargo.lock 缺一个 path 依赖
 * ⇒ ⇒ `cargo tree --locked` 报「cannot update the lock file」⇒ ⇒ 那个仓的
 * feature 图**判不了**）。
 * 而解析层是**唯一**能看见「谁开了 local-models / candle」的那一层 ⇒ ⇒ 不能丢。
 *
 * 做法：先**逐字节**备份锁 ⇒ ⇒ 允许 cargo 最小更新锁（cargo 只补缺失项，
 * 不升级已有项）⇒ ⇒ 立刻**逐字节还原** ⇒ ⇒ 工作树前后**完全一致**。
 *
 * ⚠️ 还原必须逐字节 ⇒ ⇒ 不能用「重新生成」⇒ ⇒ 否则 cargo 可能顺手把
 * 版本号也改了 ⇒ ⇒ 那就不是还原，是改写。
 */
export function withRestoredLock(manifestPath, fn) {
  const lockPath = join(dirname(manifestPath), 'Cargo.lock');
  const hadLock = existsSync(lockPath);
  const backup = hadLock ? readFileSync(lockPath) : null;
  try {
    return fn();
  } finally {
    if (hadLock) {
      writeFileSync(lockPath, backup);
    } else if (existsSync(lockPath)) {
      // 原来没有锁、cargo 建了一个 ⇒ ⇒ 还原 = 把它拿掉
      unlinkSync(lockPath);
    }
  }
}

/** 列一个目录里满足条件的文件（只一层）。 */
export function listFiles(dir, accept) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (!accept(name)) continue;
    out.push({ name, path: dir + '/' + name });
  }
  return out;
}
