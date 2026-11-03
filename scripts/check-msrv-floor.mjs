#!/usr/bin/env node
/**
 * MSRV 地板闸 —— 回答两个问题：
 *   1. 自有 crate 都声明了地板吗？（漏声明 = 地板从此只是"大部分仓"的约定）
 *   2. 依赖图里有没有要求比地板更新的 rustc 的包？（= 地板在某个补丁版上会突然失效）
 *
 * 为什么第 2 条必须查「锁」而不是查 manifest：声明 rust-version = "1.94"
 * 的人管不了 aws-smithy / datafusion / xet 这些传递依赖的 MSRV。
 * 实证：lance 14.0.2 自己的 manifest 写的是 rust-version = "1.94.0"，
 * 但它的闭包经 opendal -> aws-config 拉到 aws-smithy-* 1.94.1、
 * 经 opendal-service-hf -> hf-xet -> xet-runtime 1.8.0 -> sysinfo 0.39.6 拉到 1.95
 * ⇒ "1.94" 这个地板在真实依赖图上随时会碎。
 *
 * 闸的判据（与「1.94 线」语义一致）：
 *   - 地板 = 1.94 ⇒ 允许的最高依赖 MSRV = 1.94.x ⇒ 任何 1.95+ 一律红。
 *   - 自有 crate（path/source 为空）必须声明 rust-version（且等于地板）。
 *
 * 用法：
 *   node scripts/check-msrv-floor.mjs [--manifest-path <Cargo.toml>] [--floor 1.94]
 *   不传 --manifest-path 时，从当前目录向上找 Cargo.toml。
 *
 * 退出码：0 = 通过；1 = 有违规；2 = 自身出错（查不到 manifest / cargo 跑不通）。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function parseArgs(argv) {
  const out = { manifest: null, floor: "1.94" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--manifest-path" && argv[i + 1]) out.manifest = resolve(argv[++i]);
    else if (argv[i] === "--floor" && argv[i + 1]) out.floor = argv[++i];
  }
  return out;
}

function findManifest(start) {
  let dir = start;
  for (let i = 0; i < 40; i++) {
    const p = resolve(dir, "Cargo.toml");
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** 语义化版本比较：缺段当 0。 */
function parseVer(v) {
  if (!v) return null;
  const core = String(v).split("+")[0].split("-")[0];
  const parts = core.split(".").map((n) => parseInt(n, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}
function cmp(a, b) {
  for (let i = 0; i < 3; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}
function fmt(v) {
  return v.join(".");
}

const args = parseArgs(process.argv.slice(2));
const manifest = args.manifest || findManifest(process.cwd());
if (!manifest) {
  console.error("check-msrv-floor: 找不到 Cargo.toml");
  process.exit(2);
}

const floor = parseVer(args.floor);
if (!floor) {
  console.error("check-msrv-floor: --floor 解析失败 :: " + args.floor);
  process.exit(2);
}
// 「1.94 线」= 1.94.x ⇒ 允许上限 = 1.94.99（任何 1.95+ 一律越线）
const allowed = [floor[0], floor[1], 99];

let raw;
try {
  raw = execFileSync("cargo", ["metadata", "--locked", "--format-version", "1", "--manifest-path", manifest], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 512,
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (e) {
  const err = String((e.stderr || "") + (e.message || "")).split("\n").filter((l) => l.trim()).slice(0, 3).join(" | ");
  console.error("check-msrv-floor: cargo metadata --locked 跑不通 :: " + err);
  process.exit(2);
}

let meta;
try {
  meta = JSON.parse(raw);
} catch {
  console.error("check-msrv-floor: cargo metadata 输出不是合法 JSON");
  process.exit(2);
}

const violations = [];
const ownMissing = [];
const ownWrong = [];
let depMax = null;

const vendored = [];
for (const p of meta.packages || []) {
  const isPath = p.source === null || String(p.source).startsWith("path+");
  // vendor/ 下的是第三方代码的 vendored 副本 —— 它的 MSRV 是上游的事，
  // 我们不该去改它的声明（改了就会与上游分叉），也不该拿它当自己的地板。
  const isVendored = isPath && String(p.manifest_path || "").split(/[\\/]/).includes("vendor");
  const isOwn = isPath && !isVendored;
  const rv = parseVer(p.rust_version);
  if (isVendored) {
    if (p.rust_version) vendored.push(p.name + " " + p.version + " -> " + p.rust_version);
    continue;
  }
  if (isOwn) {
    if (!p.rust_version) {
      ownMissing.push(p.name + " " + p.version);
    } else if (cmp(rv, floor) !== 0) {
      ownWrong.push(p.name + " " + p.version + " -> " + p.rust_version);
    }
    continue;
  }
  if (!rv) continue;
  if (!depMax || cmp(rv, parseVer(depMax.rust_version)) > 0) {
    depMax = { name: p.name, version: p.version, rust_version: p.rust_version };
  }
  if (cmp(rv, allowed) > 0) {
    violations.push(p.name + " " + p.version + " -> " + p.rust_version);
  }
}

const label = manifest.replace(/\\/g, "/").split("/").slice(-2).join("/");
console.log("MSRV floor check :: " + label + " :: floor=" + args.floor + " (允许到 " + fmt(allowed) + ")");
console.log("  自有 crate 缺 rust-version 声明 :: " + ownMissing.length);
ownMissing.forEach((v) => console.log("    - " + v));
console.log("  自有 crate 声明 != 地板 :: " + ownWrong.length);
ownWrong.forEach((v) => console.log("    - " + v));
console.log("  vendored 第三方 crate（不计入地板） :: " + vendored.length);
vendored.forEach((v) => console.log("    ~ " + v));
console.log("  依赖要求超出地板的线 :: " + violations.length);
violations.forEach((v) => console.log("    - " + v));
console.log("  依赖图最高 MSRV :: " + (depMax ? depMax.name + " " + depMax.version + " -> " + depMax.rust_version : "<none>"));

const bad = ownMissing.length + ownWrong.length + violations.length;
if (bad > 0) {
  console.error("VERDICT: FAIL (" + bad + " 项)");
  process.exit(1);
}
console.log("VERDICT: PASS");
