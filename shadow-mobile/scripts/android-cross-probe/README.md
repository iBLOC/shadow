# Android 交叉编译探针

验证任意 Rust crate 能否交叉编译到 Android（`aarch64-linux-android`）。

## 为什么需要它

2026-10-28 评估「移动端改嵌大脑 `encephalon`」时，需要逐个确认 `encephalon`
的**强制依赖链**能不能编到 Android —— 因为 `encephalon` 自己**没有任何移动端
形态**：没有 `cdylib` crate-type、没有 JNI 层、没有 `android` feature
（见 `C:\Projects\iBLOC\encephalon\Cargo.toml`，只有 `[lib]` + `[[bin]]`）。

实测结论（推翻了一条此前的判断）：**`wasmtime` 硬依赖并不是 Android 交叉编译的
主要风险点**。wasmtime 20 + cranelift 干净编译到 Android，真正吃重量的是
`diencephalon` 带的 `datafusion 55` + `arrow` + `zenoh` + `zen-engine`。

这条脚本把那次探路固化下来 —— 任何 crate 一句话可验。

## 用法

```powershell
# 验一个 crate
./android-cross-probe.ps1 -ManifestPath C:\Projects\iBLOC\synapse\Cargo.toml

# 带 feature
./android-cross-probe.ps1 -ManifestPath C:\Projects\iBLOC\prefrontal\Cargo.toml -Features mobile

# NDK 位置自动探测不到时显式给
./android-cross-probe.ps1 -ManifestPath <...> -NdkRoot C:\src\ndk\30.0.14904198
```

退出码 `0` = 能编到 Android，非 0 = 不能。

## 实测矩阵（2026-10-28，NDK 30.0.14904198 / `aarch64-linux-android` / release）

| crate | 谁强制需要 | 结果 | 备注 |
|---|---|---|---|
| `wasmtime` 20 | `synapse`、`telencephalon` | ✅ PASS | 此前被误判为主要风险点 |
| `synapse` | `encephalon` / `telencephalon` / `diencephalon` | ✅ PASS | 3m21s，`libsynapse.rlib` 25.0 MB |
| `diencephalon` | `encephalon` | ❌ **FAIL** | 见下方「第一个真 blocker」 |
| `neuron` | `telencephalon` | 未验（形态友好） | `Cargo.toml` 已有 `crate-type = ["staticlib","cdylib","rlib"]`，引擎全部 optional。**注意：没有 wgpu** |
| `prefrontal` | `telencephalon` | ✅ PASS | 已产出 arm64-v8a `.so`，6/6 JNI 符号齐全 |
| `hippocampus-storage` | `telencephalon` / `encephalon` | 未验 | 依赖 `lance-graph`（default feature 就开着） |

## 第一个真 blocker：`rquickjs-sys` 没有 Android 绑定

`diencephalon` 编到 90% 时失败：

```
error: couldn't read `.../rquickjs-sys-0.10.0/src/bindings/aarch64-linux-android.rs`:
       系统找不到指定的文件。 (os error 2)
  --> rquickjs-sys-0.10.0/src/lib.rs:19:1
   |
19 | include!(concat!("bindings/", bindings_env!("TARGET"), ".rs"));
warning: rquickjs-sys@0.10.0: rquickjs probably doesn't ship bindings for
         platform `aarch64-linux-android(n/a)`. try the `bindgen` feature instead.
```

`rquickjs-sys` 0.10.0 只为 **14 个平台**提供预生成绑定：

```
aarch64-apple-darwin  aarch64-pc-windows-msvc  aarch64-unknown-linux-gnu
aarch64-unknown-linux-musl  i686-unknown-linux-gnu  loongarch64-unknown-linux-gnu
loongarch64-unknown-linux-musl  wasm32-wasip1  wasm32-wasip2  x86_64-apple-darwin
x86_64-pc-windows-gnu  x86_64-pc-windows-msvc  x86_64-unknown-linux-gnu
x86_64-unknown-linux-musl
```

**没有 Android，也没有 iOS。** 依赖链：
`diencephalon` → `zen-engine 2.1.4` → `rquickjs` → `rquickjs-sys`。

`zen-engine` 是 diencephalon **真在用**的功能（DMN / GoRules JDM 规则引擎，
见 `diencephalon/src/rule_engine.rs`，仓里自己注释「+zen-engine dep tree
(~40 crates; first build ~2 min)」），不是死依赖。

### 三条修法

| 方案 | 代价 | 备注 |
|---|---|---|
| 开 `zen-engine/bindgen` feature | 需要 **libclang**（本机没装：`C:\Program Files` 下无 `libclang.dll`，rustup 也没装 llvm-tools 组件） | 官方逃生舱，但要先装 LLVM（约 2 GB）或 VS 的「C++ Clang tools for Windows」组件 |
| 把 `zen-engine` 改成 optional feature | 改 `diencephalon/Cargo.toml` 一行 | 手机上的 agent 运行时大概率不需要 DMN 规则求值；代价是移动端缺这个能力 |
| 给 `rquickjs-sys` 补 Android 绑定 | fork + 生成绑定 | 最脏，不推荐 |

**这是「改嵌大脑」路线上第一个真正需要改代码的卡点**，而不是 `wasmtime`。


## 踩过的坑（脚本里已经处理）

1. **`cargo build` 不认 Android NDK。** linker 不会自动指向 NDK，必须显式设
   `CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER` / `CC_*` / `CXX_*` / `AR_*`。
   脚本用 `aarch64-linux-android31-clang.cmd`（minSdk 31，与
   `shadow-mobile/android/app/build.gradle.kts` 的 minSdk 对齐）。

2. **绝不能改被测仓的 `Cargo.lock`。** 兄弟仓普遍有他人未提交的 WIP
   （`synapse` 8 个文件、`telencephalon` 84 个、`encephalon` 20 个……），
   一次 `cargo build` 重解析就会把 41+ 个无关新包带进来并覆盖别人的 lockfile。
   脚本第一轮用 `--locked`：cargo 宁可报错也不写 lockfile。

3. **有些仓的 committed `Cargo.lock` 本来就与 `Cargo.toml` 不同步。**
   `diencephalon` 就是 —— `cargo build --locked` 直接拒绝
   （`cannot update the lock file ... because --locked was passed`）。
   脚本第二轮降级为「复制到临时目录再编」，原仓一个字节都不写。

4. **脱离 lock 重新解析会引出版本分裂。** 本项目已记过这条：重解析会把
   `agent-client-protocol`、`synapse-privacy` 带进来并造成 `syn/indexmap` 版本
   分裂。实测在 `synapse` 上表现为 `a2a-lf` 0.3.1 与 0.4.2 同时进图 →
   `SendMessageRequest` 类型不匹配、`?` 无法转换 `A2AError` → 6 个编译错误，
   **与 Android 毫无关系**。`synapse` 自己的 lock 锁的是 `a2a-lf 0.3.0` +
   `a2a-server-lf 0.4.0` + `a2a-client-lf 0.2.0`，一致无分裂。

5. **`ziti-sdk` 不是 C 绑定。** iBLOC 的 `ziti-rust` fork 是**纯 Rust 重写**
   （`src/` 下 0 个 `.c` 文件），OpenZiti 那套 C SDK 交叉编译问题在这里不存在。

## 相关

- 移动端本地开发环境与 Android 打包链路：`../../AGENTS.md`
- 嵌入式前额叶运行时（当前移动端唯一的 `.so` 支线）：
  `../../lib/services/prefrontal/README.md`
