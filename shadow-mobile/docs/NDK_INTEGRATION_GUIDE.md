# NDK 集成指南（移动端嵌入的是**大脑**）

> ⚠️ **这份文档在 2026-11-02 重写过。**
> 旧版整篇讲的是**嵌入式 Prefrontal**（`libprefrontal_core_lib.so` +
> `PrefrontalRuntimeService` + `com.ibloc.shadow/prefrontal_runtime` 通道）。
> 那条支线是**上一个架构时代**的东西，已**整条退役** —— 代码、通道、Manifest
> 声明、`.so`、管理页、路由、l10n 文案**全部删除**。
> 本文说的是**现在**的那条：移动端嵌的是**大脑**。

---

## 1. 现在嵌的是什么

| | 旧（已退役） | 现在 |
|---|---|---|
| 原生库 | `libprefrontal_core_lib.so`（27.9 MB） | `libencephalon.so`（151.7 MB） |
| 源码仓 | `iBLOC/prefrontal`（Layer-3 独立引擎，端口 18083） | `iBLOC/encephalon`（**大脑**：间脑 + 端脑 + 海马体 + ACP 总线 + 唯一 neuron） |
| 通道 | `com.ibloc.shadow/prefrontal_runtime` | `com.ibloc.shadow/encephalon_runtime` |
| 推理怎么走 | 进程内 mini HTTP server（axum）⇒ **绕 socket** | **进程内 adapter 管线**（不绕 socket、没有 CORS） |
| 端脑面 | 没有 | 有（`127.0.0.1:<随机端口>`，**每次启动都变**） |
| 管理页 | `/settings/prefrontal`（已删） | `/settings/encephalon` |

### ⚠️ 为什么旧的那套必须退役

它跑的是「**只有 lobe、没有大脑**」的那代架构 ⇒ ⇒ 它**绕开了**
「端脑 → 叶区 → neuron」这条 canonical 链路 ⇒ ⇒ 绕过去是**静默失效**：
收不到 `tool_call`、人格/记忆无处落地、对话退化成**无状态单轮**
（详见 `docs/superpowers/architecture/2026-10-29-brain-chain.md`）。

⚠️ 它还**冻结**在 2026-10-29 的产物上（mtime 2026-10-29 01:40）⇒ ⇒ 就算
留着也是「上一个架构时代」的那份 ⇒ ⇒ 不是「还没接完」，是**该退役**。

---

## 2. 架构（现在的）

```
Flutter UI (Dart)
   │  MethodChannel: com.ibloc.shadow/encephalon_runtime
   ▼
MainActivity (Kotlin) ── EncephalonRuntime.kt
   │  JNI（11 个入口，见 encephalon/src/mobile/jni.rs）
   ▼
libencephalon.so (Rust, cdylib)
   └─ Embedded（进程内）
        ├─ diencephalon（间脑 / 数据网关）
        ├─ telencephalon（端脑 / 智能体编排）+ ACP 总线
        ├─ hippocampus（海马体）—— ⚠️ mobile profile **不编**
        │    （Lance 靠 fs::hard_link 发布，Android 的 SELinux 不允许 ⇒
        │     端脑直接起不来 ⇒ 移动端改用**文件版**会话存储）
        └─ neuron（**唯一**推理实例）
```

⚠️ **桌面端与移动端同源**：桌面 `shadow-desktop/src-tauri/src/lib.rs` 里是
`encephalon::Embedded::boot(EmbeddedConfig { neuron_port: 8085 })` ⇒ ⇒ 两端是
**同一套大脑、同一份代码**。

---

## 3. 怎么编（权威脚本在 encephalon 仓）

```powershell
# 交叉编译 libencephalon.so，并拷进 shadow-mobile 的 jniLibs
pwsh -File C:\Projects\iBLOC\encephalon\scripts\build-android.ps1
pwsh -File C:\Projects\iBLOC\encephalon\scripts\build-android.ps1 -Target x86_64-linux-android
```

| 项 | 值 |
|---|---|
| NDK | `30.0.14904198`（与 `shadow-mobile/android/app/build.gradle.kts` 钉死的版本一致） |
| 产物 | `target-android/<target>/release/libencephalon.so` ⇒ 拷到 `shadow-mobile/android/app/src/main/jniLibs/<ABI>/` |
| 支持的 ABI | `arm64-v8a`（唯一入库存的）、`x86_64`（可编，但**不入库**） |
| armeabi-v7a | ❌ **编不出来**（cranelift-codegen 的 `no supported isa found for arch 'armv7'`） |

📌 权威细节看 **`iBLOC/encephalon` 仓的 `scripts/README.md`**（它还写了
JIT/链接那一堆坑与体积数字）。**别在本仓抄一份** —— 那是最容易漂的地方。

---

## 4. JNI 入口（11 个）

全部在 `iBLOC/encephalon` 仓的 `src/mobile/jni.rs`（Rust 侧）⇒ Kotlin 侧在
`shadow-mobile/android/app/src/main/kotlin/com/ibloc/shadow/EncephalonRuntime.kt`
⇒ Dart 侧在 `shadow-mobile/lib/services/encephalon/encephalon_mobile_service.dart`。

**三处必须一致** ⇒ 父仓的闸 `scripts/check-jni-surface.mjs` 逐字比对
（Rust 的符号清单 vs Kotlin 的调用点 vs `.so` 里真的导出）⇒ ⇒ 端脑新增入口
时闸自动跟着变，**不要手抄常量**。

---

## 5. Dart 侧接线

```
lib/services/encephalon/encephalon_mobile_service.dart   ← MethodChannel + JNI 壳
lib/services/encephalon/encephalon_mobile_provider.dart  ← 状态机（启停 / 接管）
lib/services/encephalon/encephalon_mobile_page.dart      ← 设置 → 嵌入式大脑
```

**顺序铁律**：Kotlin 侧 **先 `setShadowApiKey` 再 `start`**（Rust 是在 start
的时候读那个槽位的）；Dart 侧 **先 `setApiKey` 再 `setBaseUrl`** ⇒ ⇒ 反了就
有一个「指着新地址、却还没带钥匙」的窗口 ⇒ ⇒ 那个窗口里的请求 **401**，而
**401 比 connection refused 难查得多**。

---

## 6. 闸

| 闸 | 管什么 |
|---|---|
| `scripts/check-jni-surface.mjs`（父仓） | JNI 入口两边逐字对齐 + 每个 ABI 的 `.so` 符号与依赖 |
| `scripts/check-cortex-residue.mjs`（本仓） | 旧嵌入式 Prefrontal 运行时**不许回来**（标识符级 + `.so` 存在性），带 `--self-test` |

---

## 7. 已退役的旧方案（留个记录）

被删的东西（**都别再找回来**）：

- `shadow-mobile/lib/services/prefrontal/`（service / provider / cluster_page / README）
- `shadow-mobile/android/.../PrefrontalRuntime.kt`、`PrefrontalRuntimeService.kt`
- `MainActivity.kt` 里的 `setupPrefrontalRuntimeChannel` 与 `prefrontal_runtime` 通道
- `AndroidManifest.xml` 里的 `<service PrefrontalRuntimeService>` 声明
- `jniLibs/arm64-v8a/libprefrontal_core_lib.so`（27.9 MB，构建产物，gitignore）
- 路由 `/settings/prefrontal` + 设置页「遗留运行时」折叠区
- 移动端**全部** `prefrontal*` 文案键（l10n）
- 日志面板那条 SSE 路（`/api/logs/stream`）—— 那条路**只有**旧运行时有
  ⇒ ⇒ `LogSource.prefrontal` 改名成 `LogSource.client`（它现在装的是**客户端
  错误**，见 `global_error_listener.dart`）⇒ ⇒ 界面上那个筛选项从「后端」改成
  「客户端」

⚠️ **刻意保留**（它们**不是**旧运行时）：

| 名字 | 是什么 |
|---|---|
| `lib/services/prefrontal_client.dart` | **客户端面**（记忆 / 任务 / 人格，走**带海马体**的那台端脑）—— 十几个页面在用 |
| `PrefrontalMNN.kt` / `mnn_bridge.cpp` | MNN 本地推理桥 |
| `PrefrontalAccessibilityService.kt` | 无障碍服务（UI 自动化） |
| 叶区名 `prefrontal` | 四个 native 叶区之一（parietal / prefrontal / temporal / occipital） |

⇒ ⇒ 这几个名字里带 "Prefrontal"，但它们**与旧运行时无关** ⇒ ⇒ 闸的判据名单
**故意不含**它们 ⇒ ⇒ 改名是**另一个决定**，别顺手做。
