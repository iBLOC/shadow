# [ADR-0001] 在 ESP32-S3 上使用 **Zephyr RTOS + C** 作为 shadow-esp32 的核心技术栈

- **状态**: Accepted (调研阶段决策;**实施架构见 [ADR-0002 v2](0002-shadow-esp32-implementation-architecture.md)** — supersedes ADR-0002 v1)
- **日期**: 2026-08-16
- **决策者**: shadow 项目所有者(经 Sisyphus 编排)
- **关联文档**: [`../RESEARCH.md`](../RESEARCH.md) (调研报告), [`../../README.md`](../../README.md) (项目 README), [`0002-shadow-esp32-implementation-architecture.md`](0002-shadow-esp32-implementation-architecture.md) (实施架构 ADR v2,WebRTC 复用)

## 此 ADR 的范围

本 ADR 仅锁定三项底层选型:**RTOS / 语言 / 芯片**(结论:Zephyr + C + ESP32-S3)。

**wire protocol / 应用层架构 / 任务分配 / 后端集成**等实施层决策在 [ADR-0002 v2](0002-shadow-esp32-implementation-architecture.md) 中,**该 ADR v2 是当前权威**。本 ADR-0001 v1 在实施阶段被用户推翻后的变更记录:

| 实施关注 | ADR-0001 v1 立场 | 后续修正 | 见 |
|---|---|---|---|
| Wire protocol | (未决,留待 ADR-0002) | **WebRTC**(复用 shadow-desktop / mobile 通路,用户于 2026-08-16 推翻 v1 的 WebSocket 提议) | [ADR-0002 v2](0002-shadow-esp32-implementation-architecture.md) §4.1 |
| Cortex bridge 中间层 | (未决) | **不需要**(`cortex::webrtc_route` 现成即可) | ADR-0002 v2 §4.5 |
| IO 控制 transport | (未决) | **WebRTC Data Channel**(SCTP-over-DTLS + MCP JSON-RPC 2.0) | ADR-0002 v2 §4.4 |
| 应用层状态机 | (未决) | 借鉴 xiaozhi-esp32(state machine + Opus codec) | ADR-0002 v2 §4.3 |
| ESP32 thin client | (未决) | 验证:Xtensa ESP32 无可用 WASM runtime → 所有 agent 逻辑必须在 server | [RESEARCH.md §9.5](../RESEARCH.md) |

## 上下文与问题陈述

`shadow-esp32`(`https://github.com/iBLOC/shadow/shadow-esp32`)是 Shadow 平台考察中的第三条端形态 —— 把 Shadow Agent 的最小执行环境搬上 ESP32-S3-DevKitC,作为低成本边缘测试节点。

原始偏好(来自用户的初始请求)是 **"Zephyr + Rust"**,理由是 Zephyr 比 ESP-IDF 内置的 FreeRTOS 现代化、有更好的驱动模型,且 Rust 优于 C 的内存安全保证。但需要确认该组合在 ESP32-S3 (Xtensa 架构) 上 2026-08 时的实际可行性。

调研结论摘要(详见 RESEARCH §0–§4):

1. **当前项目脚手架** 是 ESP-IDF v6.0.2 上的 `esp_hid_device` 示例(BT/BLE HID 鼠标/键盘/媒体控制器),**不是 Shadow 业务代码**。
2. **esp-claw**(`espressif/esp-claw`,乐鑫官方,2026-08 时 753 commits / 2.0k stars)是"Chat Coding" IoT AI agent 框架 —— **纯 C + ESP-IDF**,**不是 Zephyr,也不是 Rust**。
3. **Zephyr 本身 on ESP32-S3** 已经 production-ready(v4.4.x,esp32s3_devkitc 是 `Maintained`)。
4. **Zephyr 的 Rust 语言模块**(`zephyrproject-rtos/zephyr-lang-rust`)当前 `etc/platforms.txt` 只支持 8 个平台,**唯一 ESP 平台是 `esp32c3_supermini/esp32c3`(RISC-V)** —— **Xtensa 系 ESP32-S3 不在白名单**。
5. **esp-hal 1.x**(`esp-rs/esp-hal`,v1.0.0 stable 在 2025-10,v1.1.2 在 2026-08)是 Espressif vendor-backed 的 ESP32-S3 Rust HAL,生产案例丰富(telenkov88 / ro011110ot / Espressif Developer Portal 多篇 demo)。

需要在硬件约束(ESP32-S3)下,选出**语言 + RTOS** 的组合,并接受与原始偏好的偏离。

## 决策驱动因素

- **硬件固定**: 已在用户手中的 ESP32-S3-DevKitC(M5Stack CoreS3 等同系列变种);想用 ESP32-C3/C6 必须重新采购。
- **生态系统成熟**: 不愿采纳实验性栈;希望用 2026 年"production-ready"的组合。
- **与 Shadow 主项目的关系**: Shadow 其余组件全 Rust(Prefrontal / Cortex / Hippocampus / neuron / synapse)。语言一致性是次要但真实的工程成本。
- **参考对象 esp-claw** 提供了 ESP32 AI agent 的实操模板,可借鉴但不可直接 fork。
- **可逆性**: 任何决策都不是终局的;几年后可重新评估。

## 备选方案

### A. esp-hal 1.x + Embassy + Rust(no_std / async)

- ✅ Rust on ESP32-S3 已 production-ready;Embassy 异步模型与 Shadow 平台其他 tokio 化的服务心智模型一致。
- ✅ 工具链统一(全 Shadow 仓库都是 Cargo workspace);分享 cortex 的 A2A 类型 crate 容易。
- ⚠️ Wi-Fi/BLE/AES/SHA 等外设仍要 `--features unstable` 才稳定。
- ⚠️ 当前脚手架完全废掉,从 ESP-IDF CMake 体系切到 Cargo 体系。

### B. ESP-IDF (FreeRTOS) + C

- ✅ 短期最快:可以 fork esp-claw 的 `application/edge_agent/` 直接改 Shadow 适配。
- ✅ 工具链心智与 Shadow 其余部分隔离,但反而意味着不会冲突。
- ⚠️ 语言 C,失去 cargo / LSP / clippy / Rust 类型系统。

### C. ESP-IDF (FreeRTOS) + Rust (esp-idf-sys)

- ✅ 在 ESP-IDF 上写 Rust。
- ⚠️ esp-idf-sys / esp-idf-hal / esp-idf-svc 是社区项目(Espressif 在 esp-hal 1.0 公告里标记为 "community supported")。
- ⚠️ 混合 FFI 复杂度。

### **D. Zephyr (4.4.x) + C** ◀ **CHOSEN**

- ✅ Zephyr on ESP32-S3 是 `Maintained`,完整外围支持(ADC / BLE HCI / Wi-Fi / GPIO / I2C / SPI / UART / USB OTG / PSRAM 等)。
- ✅ 现代 RTOS:devicetree 描述硬件、sysbuild 多固件编排、native_sim 测试可在主机跑;长期可扩展性强。
- ✅ 与原始偏好的"Zephyr"部分吻合,只放弃"Zephyr + Rust"的 Rust 部分。
- ⚠️ C 工程体验比 Rust 慢,工具链心智与 Shadow 其他 Rust 组件隔离。
- ⚠️ Zephyr 4.4.x 对 ESP32-S3 仍有已知 PSRAM / Wi-Fi SPIRAM / MIC failure 等活跃 bug(详见 RESEARCH §3.2),需要测试选定的 DevKitC 是否绕过。

### E. 换芯片到 ESP32-C3 / ESP32-C6 (RISC-V)

- ✅ 是唯一能走 Zephyr + Rust 的硬件路径。
- ⚠️ 放弃 ESP32-S3 的 USB OTG / 较大 RAM / AI 加速向量指令特性。
- ⚠️ 需要重新采购开发板。

### F. 不选定路径,先跑通当前 esp_hid_device demo

- ✅ 零风险;验证工具链 OK。
- ❌ 不是 Shadow 业务代码,不前进。

## 决策

**采用 D:Zephyr RTOS + C,目标是 `esp32s3_devkitc` / `esp32s3_box3`(M5Stack CoreS3)板级。**

理由:

1. **保留 Zephyr 的现代 RTOS 架构** —— 这是用户原始偏好的核心部分,而且在 ESP32-S3 上 2026-08 production-ready。
2. **接受"丢掉 Rust"的代价** —— Zephyr Rust 模块对 Xtensa 缺位是一个上游阻塞,我们不打算自己维护 LLVM/Rust fork + Zephyr Xtensa Rust patch。改用 Zephyr 官方 C 路径。
3. **esp-claw 是 C,借鉴但不被它绑架** —— esp-claw 给了"事件路由 + agent core + memory + capabilities"的能力分层思路;由于语言一致,直接 fork 不会造成双源问题;但 Shadow 在 cortex 端用的是 synapse + A2A 协议,而非 esp-claw 的 Lua/IM/MCP,所以能力模型仍需重新设计,**不直接 fork 代码**。
4. **不换芯片** —— 已有 ESP32-S3,不重新采购。
5. **决策可逆** —— 如果未来 Zephyr 上游合并 Xtensa Rust 平台,或 esp-rs esp-hal 的 `esp-radio` / Embassy 在 S3 上 extreme 稳定,我们再考虑路径 A 的迁移。

## 决策后果

### 正面影响

- 拥有清晰的 Zephyr + C 上路路径:west 拉 Zephyr 4.4.x + `hal_espressif` extra module,在 `app/` 下用纯 C 写 Shadow agent bootstrap。
- 借鉴 esp-claw 的事件路由 / capability 分层思路,但用 A2A(对齐 cortex/prefrontal,而不是 esp-claw 的 IM/Lua/MCP)。
- Zephyr 的 devicetree / sysbuild 模块化适合将来扩展到多块 Espressif 板级(C3 / C6 / P4)。
- Zephyr 的 `native_sim` 板级允许 host 端 CI 测试 C 代码的算法路径(慢但对纯逻辑路径有帮助)。

### 负面影响

- **语言不一致**: shadow-esp32 将是 Shadow 平台里**唯一**的非 Rust 端(其它全是 Rust)。意味着我们要把 Shadow 协议契约(A2A 的 schema、Shadow agent loop 的状态机)在脑里维护"两套实现":一套 Rust(cortex / prefrontal),一套 C(esp32)。
- **没有 cargo**: C 工程体验比 Rust 慢,且没有 clippy / rust-analyzer 等价开箱即用工具(可以用 `clangd` + `cppcheck`,但心智负担不同)。
- **Zephyr on ESP32-S3 已知 bug**:
  - `soc/espressif/esp32s3: undefined reference to 'log_const_soc' when CONFIG_PM=y`
  - `ESP32S3 PSRAM is not working properly: only work in octal+40M`
  - `Bluetooth: ESP32-S3 + iOS: HCI 0x3D MIC failure on every reconnect after LE SC pair`
  - `ESP32 S3 doesn't boot if CONFIG_ESP32_WIFI_NET_ALLOC_SPIRAM is combined with CONFIG_SPI`
  - `espressif: esp32c5/esp32s3: fix PSRAM + Wi-Fi heap mapping and linker segment sizing bugs` (fixed in 4.4.1)

  → 选定 Zephyr 版本需 ≥ 4.4.1,且 SPEC 测试需走 esp32s3_devkitc + 实际 PSRAM 模组验证。

- **无法直接复用 cortex / prefrontal 的 Rust crate**: 要在 C 端重新定义协议边界(用 JSON 序列化 + `cJSON` 或类似库),不能 `use synapse::*` 共享类型。
- **CI 独立**: shadow-esp32 不能挂在 Shadow 平台的 Cargo workspace CI 上;需要单独的 Zephyr CI(可参考 esp-claw 的 GitLab CI 配置作为模板)。

### 中性影响

- esp-claw 是 C,B 和 D 都是 C,API 心智相似;但 D 因 Zephyr 而有更好的驱动模型(devicetree + power_domain),长期看更优。
- 招聘/学习曲线:贡献者需要了解 Zephyr 的 west / devicetree / Kconfig。这是合理的工程门槛,但要与 Shadow 主项目社区沟通清楚。

## 后续动作

按优先级:

| 序 | 动作 | 状态 |
|---|---|---|
| 1 | **脚手架替换** —— 把 `main/esp_hid_device_main.c` / `esp_hid_gap.c` 移入 `.legacy-esp-idf/`(备份);新建 `app/src/main.c` + `app/prj.conf` + `app/CMakeLists.txt` + `app/west.yml`(在仓库 root 或 `app/` 下) | 待办 |
| 2 | **west 集成** —— 写 `west.yml` 拉 Zephyr v4.4.1 + `hal_espressif` 模块 + `zephyr-lang-rust` 留作后续实验(可选);在 CI 中跑 `west update && west build -b esp32s3_devkitc app` | 待办 |
| 3 | **Kconfig 迁移** —— 把当前 `sdkconfig.defaults.esp32s3` 的 `CONFIG_BT_*` / `CONFIG_BT_HID_*` 翻译为 Zephyr 的 `CONFIG_BT=y` / `CONFIG_BT_PERIPHERAL=y` / `CONFIG_BT_HIDS=y`;删除 HID demo 配(Shadow 不需要 HID 角色) | 待办 |
| 4 | **A2A C 客户端** —— 实现 Shadow-A2A C 客户端:`json-c` 或 `cJSON` 序列化为 cortex 的 `/api/a2a/tasks/send` JSON-RPC envelope;走 mDNS(`_shadow._tcp`)发现 cortex | 待办 |
| 5 | **mDNS 广播** —— Zephyr 提供 `zephyr/net/dns_sd.h` 或使用 apps 中的 `mdns responder` sample;广播 SHADOW 实例 | 待办 |
| 6 | **LLM 调用路径** —— 沿用 shadow 的 LLM 调度语义(Edge 上仅做简单事实查询 + 把长上下文卸载回 prefrontal);不尝试本地推理(ESP32-S3 PSRAM 8 MiB 仅够做 ASR/CV 的小模型,LLM 推理放到本地 prefrontal 或 cortex) | 待办 |
| 7 | **板级测试** —— DevKitC 上烧写示例走通 mDNS + A2A hello/world;补 `prj.conf` 的 4.4.1 PSRAM 修复已包含,然后 `west build -t run` 跑单元测试 | 待办 |
| 8 | **未来迁移评估** —— 监控 Zephyr Xtensa Rust / esp-hal `esp-radio` 稳定化;每 6 个月重新评估路径 A 是否变得可行 | 持续 |

## 参考

- 调研报告: [`docs/RESEARCH.md`](../RESEARCH.md)
- Zephyr ESP32-S3-DevKitC 板文档: https://docs.zephyrproject.org/latest/boards/espressif/esp32s3_devkitc/doc/index.html
- Zephyr Espressif 支持状态: https://developer.espressif.com/software/zephyr-support-status/
- Zephyr Rust 模块平台白名单: https://github.com/zephyrproject-rtos/zephyr-lang-rust/blob/main/etc/platforms.txt
- esp-claw 参考: https://github.com/espressif/esp-claw
- esp-hal 参考: https://github.com/esp-rs/esp-hal

## 修订

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-08-16 | 1.0 | 初版;由 RESEARCH §5 推荐路径 A + 用户决策 D 出发,固化采用 D |
