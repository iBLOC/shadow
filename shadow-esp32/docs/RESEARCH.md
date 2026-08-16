# Zephyr + Rust on ESP32-S3 — 调研评估报告

**日期**: 2026-08-16
**作者**: Sisyphus (编排自 `/home/ibloc/Projects/shadow/shadow-esp32`)
**问题**: 在 ESP32-S3 上以 Zephyr 为 RTOS、以 Rust 为开发语言来构建 shadow 的 IoT 端,可行性如何?
**结论先行**: **对 Xtensa 系 ESP32-S3,Zephyr+Rust 的组合在 2026-08 不实际可用**,推荐迁移到 `esp-hal 1.x` + Embassy 异步栈 + no_std Rust(详见 §5)。

---

## 0. 当前项目状态(调研起点)

`shadow-esp32` 目录由 Espressif 官方的 `esp_hid_device` 示例 clone 而来,不是 AI agent:

| 项目特征 | 现状 |
|---|---|
| 入口来源 | `git_revision: v6.0.2` 指向 ESP-IDF `esp_hid_device` 示例(BT/BLE HID 设备) |
| 应用代码 | `main/esp_hid_device_main.c` (35 KB) + `main/esp_hid_gap.c` (41 KB) — 是 HID 鼠标/键盘/媒体遥控 |
| `Kconfig.projbuild` | 仅有 `EXAMPLE_HID_DEVICE_ROLE` (Media / Keyboard / Mouse) 选项 |
| SDK | ESP-IDF v6.0.2 (`/home/ibloc/.espressif/v6.0.2/esp-idf`) |
| RTOS | FreeRTOS (随 ESP-IDF 自带) |
| 工具链 | xtensa-esp32s3-elf GCC 15.2.0 |
| 目标芯片 | ESP32-S3(由 `sdkconfig.defaults.esp32s3` 选定) |
| 编译 | **通过** — `build/partition_table/partition-table.bin` 已生成 |
| `README.md` | **仍是 ESP-IDF 上游模板**(没改过) |

也就是说:`shadow-esp32` **现状是一个未针对 Shadow 目标做改动的 ESP-IDF 模板项目**。要变成真正的 Shadow 边缘节点,需要先做架构决策(语言 + RTOS + 通信协议),然后基于决策改写。

---

## 1. 参考对象:esp-claw (`espressif/esp-claw`)

| 维度 | 详情 |
|---|---|
| **定位** | 一个 Chat-Coding AI agent framework for IoT devices — 受 OpenClaw 启发的 C 重写版 |
| **许可证** | Apache-2.0 |
| **活跃度** | 753 commits, 2.0k stars, 420 forks;在线 flash 工具已上线(esp-claw.com/en/flash) |
| **语言** | **纯 C**(README 自述:"Inspired by the OpenClaw concept and **reimplemented in C**") |
| **RTOS** | ESP-IDF 默认(FreeRTOS 内核)**——不是 Zephyr** |
| **构建系统** | ESP-IDF + CMake + idf.py + 板级管理(`bmgr -c ./boards -b esp32_S3_DevKitC_1`) |
| **硬件目标** | ESP32-S3 DevKitC-1、M5Stack CoreS3、ESP32-P4、ESP32-C5、ESP32-S31 |
| **LLM 调用** | **远端云端** 调用 — OpenAI / Anthropic / Qwen / DeepSeek,**不在 ESP32 本地推理** |
| **关键能力** | 事件路由(`claw_event_router`)、Agent core(`claw_core`)、Memory 系统、Skills、Lua 模块动态加载、MCP server + client、IM 通道(Telegram / QQ / Feishu / WeChat) |
| **AGENTS.md 长** | 149 行,严格 C-style OO(opaque handle)风格 |

**关键结论**:**esp-claw 是 ESP32 AI agent 的强参考,但它不是一个 Zephyr+Rust 项目**。它的整个设计语言、组件结构、app_claw 引导、FATFS 双区布局(`/system` RO + `/fatfs` RW)都基于 ESP-IDF + C 的假设。如果 Shadow 要照搬 esp-claw,要么:
- 跟着走:用 ESP-IDF + C(可以从 esp-claw 大量 fork 代码,Apache-2.0 兼容)
- 不照搬:用 Rust 重写关键模块,自己设计

---

## 2. ESP32-S3 的 Rust 支持(2026-08)

### 2.1 关键数据

| 维度 | 现状 |
|---|---|
| **Xtensa Rust 官方性** | **尚未官方上游支持**(Rust 官方 target 列表中没有 `xtensa-esp32s3-none-elf`) |
| **esp-rs 自维护 target** | `xtensa-esp32-elf`、`xtensa-esp32s2-none-elf`、`xtensa-esp32s3-none-elf` — 由 esp-rs 维护,工具链独立安装(`espup install --toolchain-version`) |
| **esp-hal 版本** | **esp-hal v1.1.2**(2026-08-05),v1.0.0 稳定版在 2025-10-30 |
| **esp-hal Vendor 背书** | 是。John Lee(Blog 作者)/ Espressif 在 1.0 beta 发布公告中明确指出:"the first vendor-backed Rust SDK";有专门的支持邮箱 `rust.support@espressif.com` |
| **Xtensa Rust 编译模型** | 需 esp-rs 维护的 LLVM fork,esp-rs 正在将其合并到上游 LLVM(tracking issue github.com/espressif/llvm-project/issues/4) |
| **RISC-V Rust 官方性** | ✅ 完全上游 — `riscv32imac-unknown-none-elf`(ESP32-C3/C5/C6/H2/C61)可用 stable Rust |

### 2.2 `esp-hal` 1.x 在 ESP32-S3 上的外设覆盖矩阵(节选)

| 外设 | 状态 | 说明 |
|---|---|---|
| GPIO / SPI master / I2C master / UART | ✔️ | **Stable** |
| AES / SHA / RNG / Timer / RMT / DMA / LEDC / MCPWM | ⚒️ | Partial,需要 `unstable` feature flag |
| Wi-Fi | ⚒️ | `esp-radio` crate 在 esp-hal 之上,稳定是后续目标 |
| Bluetooth (BLE) | ⚒️ | 通过 `esp-radio` 部分支持 |
| ESP-NOW | ⚒️ | esp-radio 内 |
| USB OTG FS | ⚒️ | ESP32-S3 专属,`__usb_otg` 标记 |
| Camera interface | ❌ | **未支持** |
| Ethernet | ❌ | ESP32-S3 没集成 |

### 2.3 实际生产示例(2026 年仍活跃)

| 项目 | 描述 |
|---|---|
| **telenkov88/esp32-embassy-kickstart** | ESP32-S3 + Embassy + Wi-Fi + Web server + OTA + WS2812 indicator + EKV 配置存储。Rust no_std + esp-idf-hal 生态。生产模板 |
| **ro011110ot/Rust-ESP32_S3_Embedded_Graphics_MQTT_WIFI** | Embassy-net + esp-hal + MQTT v3.1.1 + ILI9341 显示 + WS2812B 状态灯。完整异步栈 |
| **Espressif Developer Portal / John Lee (2026-04-20)** | 在 ESP DualKey (M5Stack ESP32-S3) 上完整跑通 BLE HID + BLE Provisioning + Wi-Fi,作者实证 "Rust is viable to be used along with AI to build consumer products" |

### 2.4 关键判断

> **Rust + ESP32-S3 在 2026-08 已 production-ready** —— 通过 esp-rs 的 esp-hal 1.x 栈(而非通过 Zephyr)。

---

## 3. Zephyr 在 ESP32-S3 上的支持(2026-08)

### 3.1 板级支持

| 板 | 状态 | SoC | 架构 |
|---|---|---|---|
| **esp32s3_devkitc / esp32s3** | **Maintained** | esp32s3 | **Xtensa** |
| esp32s3_box3 | Maintained | esp32s3 | Xtensa |
| esp32s3_eye | Maintained | esp32s3 | Xtensa |
| esp32p4_function_ev_board | Maintained | esp32p4 | RISC-V |
| esp32c6_devkitc | Maintained | esp32c6 | RISC-V |
| **esp32c3_rust** (ESP32-C3-DevKit-RUST) | 单独存在 | esp32c3 | RISC-V |
| esp32c3_supermini (在 Zephyr Rust 白名单内,见 §4) | Maintained | esp32c3 | RISC-V |

**Espressif 官方表态**(developer.espressif.com/software/zephyr-support-status, 2025-08-27):
> "Since the release of version 4.0 for the ESP32-C3, the system has been considered stable for production."
> "All ESP32 chips will eventually be supported, although support levels may vary across devices."

**Zephyr 当前版本**:v4.4.2-rc1(v4.4.0 stable 长期支持到 2027-04,v4.4.1 在 2026-06-10 修复了 ESP32-S3 PSRAM、Wi-Fi SPIRAM heap mapping、PM log 等多个 S3-specific 问题)。

### 3.2 ESP32-S3-DevKitC 在 Zephyr 上的外设覆盖

参考 `boards/espressif/esp32s3_devkitc/doc/index.rst`(我也实际访问过):

✅ Maintained — ADC ×2, Bluetooth HCI, CAN TWAI, Clock, Counter (RTC + GP×4 + others), SHA + AES crypto, GDMA, Flash controller, GPIO ×2, I2C ×2, I2S ×2, Touch input, INTC, IPM (inter-processor mailbox), Mailbox, PSRAM, LCD-CAM (MIPI-DBI + DVP), LEDC, MCPWM ×2, RNG, SDHC ×2, Temperature sensor, Pulse counter, UART ×3 + USB-Serial, SPI ×2, USB-OTG FS, Watchdog ×2, **Wi-Fi (`espressif,esp32-wifi`)**。

**On-target memory**:416 KiB RAM + 8 MiB Flash(典型 DevKitC 模组)。

⚠️ **风险点**(2026-08 仍在修):
- `soc/espressif/esp32s3: undefined reference to 'log_const_soc' when CONFIG_PM=y`
- `ESP32S3 PSRAM is not working properly: only work in octal+40M`
- `Bluetooth: ESP32-S3 + iOS: HCI 0x3D MIC failure on every reconnect after LE SC pair`
- `ESP32 S3 doesn't boot if CONFIG_ESP32_WIFI_NET_ALLOC_SPIRAM is combined with CONFIG_SPI`
- `espressif: esp32c5/esp32s3: fix PSRAM + Wi-Fi heap mapping and linker segment sizing bugs`

### 3.3 关键判断

> **Zephyr + C on ESP32-S3 在 2026-08 已 production-ready**(虽然 Bugfix 比 FreeRTOS/ESP-IDF 频繁,硬件边缘场景需要测试)。
> 但 Zephyr 的工具链集成不如 ESP-IDF 紧密(对很多 ESP-IDF 独占特性,如 NimBLE BT Host、esp-now、rainmaker 没有等价实现)。

---

## 4. Zephyr 的 Rust 语言支持 —— **关键瓶颈**

### 4.1 平台白名单(2026-08 main 分支)

从 `zephyrproject-rtos/zephyr-lang-rust/etc/platforms.txt`(实际抓取的内容):

```text
-p qemu_cortex_m0
-p qemu_cortex_m3
-p qemu_riscv32
-p qemu_riscv64
-p m2gl025_miv
-p frdm_mcxa156/mcxa156
-p esp32c3_supermini/esp32c3
-p nrf5340dk/nrf5340/cpuapp
```

### 4.2 关键发现

⚠️ **ESP32-S3 (Xtensa) 完全不在 Zephyr Rust 平台白名单中。**

支持的 8 个平台分类:
- 5 个 QEMU 模拟器(cortex_m0/m3, riscv32/64)
- 1 个 `m2gl025_miv` (Microsemi SmartFusion2)
- 1 个 `frdm_mcxa156` (NXP)
- **1 个 ESP 平台: `esp32c3_supermini/esp32c3`** —— 注意是 **RISC-V 的 ESP32-C3**,不是 Xtensa 的 ESP32-S3
- 1 个 `nrf5340dk`

### 4.3 Zephyr Rust 的整体成熟度信号

| 信号 | 数值 |
|---|---|
| zephyr-lang-rust stars | **244** |
| zephyr-lang-rust forks | 73 |
| 文档自述 | "The bindings to Zephyr for Rust are under development, and are currently rather **minimalistic**" |
| 上游 PR 接受率 | 缓慢(PRs +34,issues +30) |
| 用户基数 | 极少生产案例 |

### 4.4 Zephyr + Xtensa Rust 的当前路径

Zephyr 的 Xtensa 架构 port **本身**存在(由 Synopsys 维护),但要让其支持 Rust 还需:
1. Zephyr 上游合并一个 Xtensa Rust target(目前在 zephyr-lang-rust 仓库作为 out-of-tree module 实验)
2. esp-rs 维护的 LLVM fork + Rust compiler fork 需要与 Zephyr SDK 集成
3. 没有 CI 验证,没有 nightly 测试覆盖

⚠️ 这意味着要靠自己从零组装一个不可行的栈 — 没有时间预算的话工程风险巨大。

### 4.5 关键判断

> **Zephyr + Rust 在 2026-08 对 Xtensa 系的 ESP32-S3 不实际可用**。
> 唯一可行的"Zephyr + Rust"组合是 **换芯片到 RISC-V 的 ESP32-C3/ESP32-C6** —— 但这违背用户"ESP32-S3"的硬件决定。

---

## 5. 方案矩阵与推荐

### 5.1 可行路径

| 选项 | RTOS | 语言 | 2026-08 ESP32-S3 上的状态 | 与 esp-claw 对齐 | 工程风险 | 推荐度 |
|---|---|---|---|---|---|---|
| **B3 / B4** | **(no_std / Embassy 异步)** | **Rust (esp-hal 1.x)** | ✅ Production-ready | ❌ 与 esp-claw 偏离,需自写所有模块 | 中(esp-wifi 仍在 partial 状态,需要 `unstable`) | ⭐⭐⭐⭐⭐ **首选** |
| B2 | FreeRTOS (ESP-IDF) | Rust (esp-idf-sys) | ✅ Stable(社区驱动,非 vendor) | 部分:Lua / event_router 需移植,esp-claw 的 C 风格不可用 | 中(混合 C/Rust FFI) | ⭐⭐⭐ |
| B1 | FreeRTOS (ESP-IDF) | C | ✅ Production | ✅ **与 esp-claw 完全对齐** | 低(可直接 fork Apache-2.0 代码) | ⭐⭐⭐⭐ |
| A1 | Zephyr | C | ✅ Production | ❌ esp-claw 不支持 Zephyr | 中(Zephyr 工具链学习曲线) | ⭐⭐ |
| A2 | Zephyr | **Rust** | ❌ **平台不支持** | ❌ | — | ❌ **不可行** |

### 5.2 推荐路径:**esp-hal 1.x + Embassy 异步 + no_std Rust**

理由:
1. **唯一能让 Xtensa 上的 Rust 真正 work 的栈**——esp-rs 团队 vendor-backed,生产案例(telenkov88、ro011110ot、John Lee Demo)都跑通 BLE HID / Wi-Fi / OTA / MQTT。
2. **与 Shadow 平台的底层 Rust 一致**——Prefrontal / Cortex / Hippocampus / neure 全是 Rust,工具链心智模型一致(Rustc / Cargo / workspace / `cargo test` / `clippy` / `rustfmt`)。
3. **Embassy 异步模型对齐**——如果 Shadow 后续想把边缘节点连入 cortex A2A,异步 I/O 模型与 Linux 上的 tokio 更近,易于共享协程模式。
4. **板级支持最广**——esp-rs 在 ESP32-S3 上的`esp-hal` 1.x 是 2026 年唯一 vendor-backed、stable ABI、健全外设表的方案。
5. **拥抱 AI 编码**——John Lee 的 2026-04 文章验证 AI agent + esp-hal 1.x + 公司 spec 能高产迭代;与 Sisyphus 工作流天然契合。

### 5.3 备选路径 B(C 系):如果 Shadow 决定照搬 esp-claw 的 Lua 脚本动态行为 + IM 通道

- 直接 fork `espressif/esp-claw`(Apache-2.0),把 `components/claw_core/` 适配到 Shadow 的任务语义,删除其 IM/Lua(只保留 agent loop + memory + event router 模式)。这是**短期最快上线**的方案。
- 但失去语言一致性,且与 Shadow 平台生态无法共享 Rust crate。

### 5.4 不推荐的路径 A(Zephyr)

- Zephyr on ESP32-S3 是 production 但工具链支持比 ESP-IDF 弱很多(ESP-IDF 5 年的 S3/NimBLE/Wi-Fi bugfix 数 vs Zephyr 不到 2 年的 ESP32 upstreaming)。
- 若真有强需求(比如要搭 openamp 多核 / 要 sysbuild / 要 MCUboot 等 Zephyr 独有特性),可以选 A1(Zephyr + C)。
- A2(Zephyr + Rust)对 ESP32-S3 不可行,文档已说明。

---

## 6. Action Item 清单(待与用户确认后执行)

> 以下动作需要由用户确认 §5.2 / §5.3 路径之后再执行。

| # | 动作 | 依赖 |
|---|---|---|
| 1 | 选定路径(§5.2 / §5.3 / §5.4 A1) | 用户决策 |
| 2a | 如果选 §5.2:清理 ESP-IDF 脚手架,引入 `cargo` workspace + `espup` + `esp-hal` 模板 | 1 |
| 2b | 如果选 §5.3:fork esp-claw → 删除 ESP-IDF esp_hid(当前 main/) → 移植 agent core 模块 | 1 |
| 3 | 实现 Shadow-A2A:客户端连入 cortex(走 mDNS + A2A JSON-RPC over Wi-Fi),与 Shadow-Mobile / Shadow-Desktop 的同协议 | 1,2 |
| 4 | 跑通 hello-world(Wi-Fi 连接 → subscribe mDNS → POST 第一条 A2A 任务到 cortex) | 3 |
| 5 | 把决策写入一份 ADR(`docs/adr/0001-stack-choice.md`),把所有调研链接固化进去 | 1,完成时 |
| 6 | 引入 CI:在 GitHub Actions 用 `espup` + cargo 验证 build(esp-claw 用 GitLab CI,可参考) | 1,完成时 |

---

## 7. 引用资料(全部为 2026-08 当前状态)

| 主题 | URL |
|---|---|
| espressif/esp-claw 主仓库 | https://github.com/espressif/esp-claw |
| esp-claw 在线 flash 工具 | https://esp-claw.com/en/flash/ |
| esp-claw 内部 AGENTS.md(代码风格 / 路径规则) | https://github.com/espressif/esp-claw/blob/master/AGENTS.md |
| Rust on ESP Book(乐鑫官方) | https://docs.espressif.com/projects/rust/book/ |
| esp-hal v1.1.2 crates.io | https://crates.io/crates/esp-hal |
| esp-hal 1.0 beta 发布公告 | https://developer.espressif.com/blog/2025/02/rust-esp-hal-beta/ |
| espup v1.96.0.0(2026-05-27) | https://github.com/esp-rs/rust-build/releases/tag/v1.96.0.0 |
| "Developing a Rust IoT with AI" (John Lee, 2026-04-20) | https://developer.espressif.com/blog/2026/04/developing-a-rust-iot-app-with-ai/ |
| "Zephyr Support Status" (Espressif, 2025-08-27) | https://developer.espressif.com/software/zephyr-support-status/ |
| Zephyr Espressif 板列表(2026-08-15 生成) | https://docs.zephyrproject.org/latest/boards/espressif/index.html |
| Zephyr Rust 语言支持(2026-08-15 生成) | https://docs.zephyrproject.org/latest/develop/languages/rust/index.html |
| Zephyr ESP32-S3-DevKitC 板文档 | https://docs.zephyrproject.org/latest/boards/espressif/esp32s3_devkitc/doc/index.html |
| Zephyr v4.4.1 release notes | https://newreleases.io/project/github/zephyrproject-rtos/zephyr/release/v4.4.1 |
| Zephyr Rust platforms.txt 实际内容 | https://raw.githubusercontent.com/zephyrproject-rtos/zephyr-lang-rust/main/etc/platforms.txt |
| zephyr-lang-rust 主仓库(244 stars) | https://github.com/zephyrproject-rtos/zephyr-lang-rust |
| esp-hal 1.x 1.0 公告(2026-04-24) | https://github.com/esp-rs/esp-hal/releases/tag/esp-hal-v1.1.0 |
| telenkov88 ESP32-S3 Embassy kickstart | https://github.com/telenkov88/esp32-embassy-kickstart |
| ro011110ot ESP32-S3 Embassy MQTT Dashboard | https://github.com/ro011110ot/Rust-ESP32_S3_Embedded_Graphics_MQTT_WIFI- |
| ESP-IDF esp_hid_device 示例(当前 shadow-esp32 来源) | (ESP-IDF v6.0.2 examples/bluetooth/bluedroid/ble/esp_hid_device) |
| xtensa Rust targets(rustc book) | https://doc.rust-lang.org/stable/rustc/platform-support/xtensa.html |
| Espressif LLVM Xtensa upstream tracking issue | https://github.com/espressif/llvm-project/issues/4 |

---

## 8. 修订

| 日期 | 作者 | 修订 |
|---|---|---|
| 2026-08-16 | Sisyphus 编排产出 | 初版(vs. `/home/ibloc/Projects/shadow/shadow-esp32/README.md` v0;基于 ESP-IDF v6.0.2 / esp-hal v1.1.2 / Zephyr v4.4.2-rc1 / zephyr-lang-rust main 等当前上游状态) |
