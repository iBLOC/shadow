# shadow-esp32

> **Shadow 在 ESP32-S3 边缘节点上的客户端原型** — 用 **Zephyr RTOS + C**(经 [ADR-0001](./docs/adr/0001-stack-choice-zephyr-c.md) 决策) 在 ESP32-S3 上落地 Shadow 平台互联

| 字段 | 值 |
|---|---|
| **目标平台** | ESP32-S3-DevKitC(首选) / M5Stack CoreS3 / 其它 ESP32-S3-WROOM 模组 |
| **状态** | **0.x — 已选定技术栈(2026-08-16)**,从 ESP-IDF HID demo 模板脚手架过渡到 Zephyr 应用中 |
| **决策栈** | **Zephyr 4.4.x + C + west**(`esp32s3_devkitc` 板级) |
| **决策 ADR** | [`docs/adr/0001-stack-choice-zephyr-c.md`](docs/adr/0001-stack-choice-zephyr-c.md) |
| **调研文档** | [`docs/RESEARCH.md`](docs/RESEARCH.md) — Zephyr/Rust 可行性评估 + 方案矩阵 |
| **代码来源(过渡)** | ESP-IDF v6.0.2 `esp_hid_device` 示例(脚手架,即将迁移) |
| **上游参考** | [`espressif/esp-claw`](https://github.com/espressif/esp-claw) (Apache-2.0),乐鑫官方的 IoT AI agent 框架 |

---

## 这是什么

Shadow 平台的端侧(Layer 4)目前由 **Shadow-Desktop**(Tauri + React)和 **Shadow-Mobile**(Flutter)构成。`shadow-esp32` 是考察中的第三条端形态 —— **把 Shadow Agent 的最小执行环境搬上 ESP32-S3,作为低成本的边缘验证/测试节点**:

- 用 ESP32-S3 上的 Wi-Fi/BLE 接入局域网
- 通过 **mDNS `_shadow._tcp`** 参与 Shadow 平台的服务发现
- 通过 **A2A(OpenClaw JSON-RPC 变体)** 与本地 cortex / prefrontal 通信
- 跑一个 Shadow 兼容的 Agent Loop(LLM 调用本地 prefrontal 而非云端)

它**不是** ESP-IDF 上游的 HID 设备 demo —— README 里那些鼠标/键盘示例代码(`main/esp_hid_device_main.c` 等)只是脚手架起点,会被替换为 Shadow Agent 实现。

## 为什么参考 esp-claw

[`espressif/esp-claw`](https://github.com/espressif/esp-claw) 是乐鑫官方在 2025–2026 年主推的 IoT-side AI agent framework(2.0k stars, Apache-2.0)。它在 ESP32-S3 上已经验证:

- 事件路由机制(`claw_event_router`)—— 把 IM / 定时器 / Lua / sensor 事件分发到 capability 上
- Agent Loop + Cloud LLM provider 插件(OpenAI / Anthropic / Qwen / DeepSeek)
- 结构化 Memory + Session + Skills + MCP(server + client)
- Board manager + Lua 运行时 + `/system` RO + `/fatfs` RW 的 FATFS 双区布局
- 配套的在线 flash 工具 esp-claw.com,降低用户入门门槛

Shadow-esp32 **不打算 fork 它的 C 代码**(详见 [`docs/RESEARCH.md §1`](docs/RESEARCH.md))。但**借鉴**它的能力分层:`event_router → core agent → capabilities → memory`。

**关键差异**:esp-claw 是 ESP-IDF + C + FreeRTOS,**不是** Zephyr,**也不** 是 Rust。它给我们的是**架构蓝图**,不是代码模板。

## 技术栈(**已选定 D: Zephyr + C**)

> ✅ **2026-08-16 决策**:采用路径 D。完整记录见 [`docs/adr/0001-stack-choice-zephyr-c.md`](docs/adr/0001-stack-choice-zephyr-c.md)。所有备选路径的对比见 [`docs/RESEARCH.md §5`](docs/RESEARCH.md)。

### 决策栈

| 维度 | 选择 | 备注 |
|---|---|---|
| **RTOS** | Zephyr 4.4.x(≥ 4.4.1) | `esp32s3_devkitc` 板级已 `Maintained` |
| **语言** | C | ESP32 上 Zephyr 一等公民语言 |
| **构建** | west + CMake + Kconfig + devicetree | 标准 Zephyr 工作流 |
| **Wi-Fi 驱动** | `espressif,esp32-wifi`(`hal_espressif` 模块) | Zephyr 4.4.x 已合 mainline |
| **JSON / RPC** | `cJSON` + 自行实现 A2A envelope(对齐 cortex 的 JSON-RPC 2.0 包装) | 同步路径足够覆盖 Shadow 边缘用例 |
| **mDNS** | Zephyr 内置 `zephyr/net/dns_sd.h` 或 sample `net/mdns_responder` | 广播 `_shadow._tcp` 服务 |

### 所有评估过的路径(决策上下文)

| 路径 | RTOS | 语言 | ESP32-S3 状态 | 决策 |
|---|---|---|---|---|
| A | (no_std / Embassy) | Rust (esp-hal 1.x) | ✅ Production | ❌ 不选(放弃 Zephyr,只取 Rust) |
| B | FreeRTOS (ESP-IDF) | C | ✅ Production | ❌ 不选(可 fork esp-claw 但与现代 RTOS 模型不契合) |
| C | FreeRTOS (ESP-IDF) | Rust (esp-idf-sys) | ✅ Production | ❌ 不选(esp-idf-sys 标为"community supported") |
| **D ◀ CHOSEN** | **Zephyr** | **C** | ✅ Production | ✅ **采纳** |
| E | Zephyr | Rust | ❌ **平台不支持(Xtensa 缺位)** | ❌ 不可行;**唯一可走 Zephyr+Rust 的方式是换芯片到 RISC-V** |
| F | (no-op) | — | — | ❌ 不前 |

### 调研结论(摘要 — 决策依据)

针对用户原始问题"是否 Zephyr + Rust 在 ESP32-S3 上可行":

- **Zephyr 本身** 在 ESP32-S3 上 production-ready(v4.4.x,4.4.1 在 2026-06 修了多个 S3-specific 问题)。
- **Zephyr 的 Rust 语言支持**(`zephyrproject-rtos/zephyr-lang-rust`)当前平台白名单只有 8 个,**且唯一 ESP 平台是 `esp32c3_supermini/esp32c3`(RISC-V)—— ESP32-S3 不在白名单**。
- 这意味着 Zephyr + Rust on Xtensa 需要自行维护 LLVM/Rust fork + Zephyr out-of-tree patches,工程风险极大,本项目不采纳。
- **Rust on ESP32-S3 在 2026-08 实际可行的栈** 是 `esp-hal 1.x`(已 vendor-backed by Espressif;v1.0.0 stable 2025-10,v1.1.2 在 2026-08)+ Embassy 异步 Runtime + `esp-radio`(Wi-Fi + BLE)。但**它失去 Zephyr**。
- **决策接受的语言代价**:shadow-esp32 将是 Shadow 平台**唯一**的非 Rust 端(其它全 Rust)。

完整论述、引用、版本号、外设覆盖矩阵、风险点:见 [`docs/RESEARCH.md`](docs/RESEARCH.md);决策与后果:见 [`docs/adr/0001-stack-choice-zephyr-c.md`](docs/adr/0001-stack-choice-zephyr-c.md)。

## 当前代码(过渡状态)

```
shadow-esp32/
├── CMakeLists.txt            # ESP-IDF project root (project(shadow-esp32))
├── sdkconfig.defaults        # BT/BLE/HID 全开 — 当前是 HID demo 配
├── sdkconfig.defaults.esp32s3
├── sdkconfig                 # 已固化,v6.0.2 输出
├── main/
│   ├── CMakeLists.txt        # idf_component_register(SRCS esp_hid_device_main.c esp_hid_gap.c, REQUIRES esp_hid)
│   ├── Kconfig.projbuild     # EXAMPLE_HID_DEVICE_ROLE: Media/Keyboard/Mouse
│   ├── esp_hid_device_main.c # 35 KB — HID 键鼠逻辑,需替换
│   ├── esp_hid_gap.c         # 41 KB — GAP/HID 协议,需替换
│   └── esp_hid_gap.h
├── .devcontainer/  .vscode/  .clangd  # 已配置但目前指向 C 工具链
├── build/                    # ESP-IDF v6.0.2 编译产物(已成功,过渡)
└── docs/
    ├── RESEARCH.md           # 2026-08-16 调研报告
    └── adr/
        └── 0001-stack-choice-zephyr-c.md   # 决策 ADR:Zephyr + C
```

## 编译(当前可工作)

```bash
# 前置:export IDF_PATH + . $IDF_PATH/export.sh
cd shadow-esp32
idf.py set-target esp32s3
idf.py build
```

输出:

```
Project version: b414802-dirty
Target: esp32s3
Toolchain: xtensa-esp-elf GCC 15.2.0
Binary: build/shadow-esp32.bin (partition-table.bin at 0x8000)
```

但**现在跑的是 HID mouse demo**,不是 Shadow Agent。当前状态:ESP-IDF scaffold 保留以验证工具链,真正 Shadow Agent 在 West/Zephyr scaffold 替换后才动(见 `Roadmap`)。

## Roadmap(已锚定路径 D)

完整任务分解见 [`docs/adr/0001-stack-choice-zephyr-c.md`](docs/adr/0001-stack-choice-zephyr-c.md) §"后续动作"。当前优先级:

1. ✅ **路径选定 D** —— ADR-0001(2026-08-16)
2. ⏳ **脚手架替换**:把 `main/esp_hid_device_main.c` / `esp_hid_gap.c` 移入 `.legacy-esp-idf/`(备份);新建 `app/src/main.c` + `app/prj.conf` + `app/CMakeLists.txt` + 仓库 root `west.yml` 拉 Zephyr 4.4.1 + `hal_espressif` 模块
3. ⏳ **Kconfig 迁移**:把 `sdkconfig.defaults.esp32s3` 的 `CONFIG_BT_*` / `CONFIG_BT_HID_*` 翻译为 Zephyr 的 `CONFIG_BT=y` / `CONFIG_BT_PERIPHERAL=y` / `CONFIG_BT_HIDS=y`(实际上 Shadow Agent 不需要 HID 角色—— 这些翻译后会被删除)
4. ⏳ **A2A C 客户端**:用 `cJSON` 序列化为 cortex 的 `/api/a2a/tasks/send` JSON-RPC envelope
5. ⏳ **mDNS**:Zephyr `dns_sd` API 广播 `_shadow._tcp`
6. ⏳ **板级验证**:`west build -b esp32s3_devkitc app` + 上电后查询 mDNS 看到 `shadow-esp32.local`
7. ⏳ **CI**:GitHub Actions 跑 `west init -l app && west update && west build -b esp32s3_devkitc app`
8. ⏳ **未来迁移**:每 6 个月重新评估 Zephyr Xtensa Rust 上游进度

## 协议握手(目标)

```
┌──────────────┐                                         ┌──────────────┐
│ shadow-esp32 │  ─── mDNS query "_shadow._tcp" ────────▶│ cortex       │
│ (ESP32-S3)   │  ◀───── A: instance_name + port ──────── │ (single-bin) │
│              │                                          │              │
│              │  ─── HTTPS POST /a2a/tasks/send ────────▶│              │
│              │  ◀───── SSE /tasks/stream ──────────────│              │
│              │                                          │              │
│              │  ─── WebSocket /api/sessions/{id}/ws ───▶│              │
└──────────────┘                                          └──────────────┘
```

## 引用 / See also

### 项目内
- [`docs/RESEARCH.md`](docs/RESEARCH.md) — 2026-08-16 Zephyr + Rust on ESP32-S3 调研报告(完整方案矩阵)
- [`docs/adr/0001-stack-choice-zephyr-c.md`](docs/adr/0001-stack-choice-zephyr-c.md) — **决策 ADR:采用 Zephyr + C** (accepted)
- `Shadow` 根文档:[`/home/ibloc/Projects/shadow/AGENTS.md`](../AGENTS.md)

### 外部资料
- [`espressif/esp-claw`](https://github.com/espressif/esp-claw) — 乐鑫官方 IoT AI agent 框架(参考架构,Apache-2.0)
- [`espressif/esp-claw/blob/master/AGENTS.md`](https://github.com/espressif/esp-claw/blob/master/AGENTS.md) — esp-claw 内部的代码风格 / 路径规则
- [Zephyr Project — Espressif boards](https://docs.zephyrproject.org/latest/boards/espressif/index.html) — Zephyr 板列表
- [Zephyr Project — esp32s3_devkitc board](https://docs.zephyrproject.org/latest/boards/espressif/esp32s3_devkitc/doc/index.html) — 本项目目标板
- [Zephyr Project — Rust language support](https://docs.zephyrproject.org/latest/develop/languages/rust/index.html) — Zephyr Rust 集成
- [Zephyr Support Status (Espressif Developer Portal)](https://developer.espressif.com/software/zephyr-support-status/) — Espressif 官方对 Zephyr 状态的公告
- [Rust on ESP Book](https://docs.espressif.com/projects/rust/book/) — 乐鑫官方 Rust 用户手册(本项目不走 Rust 但作为对照)
- [esp-hal](https://github.com/esp-rs/esp-hal) — 2026 主流 ESP32 Rust HAL,v1.x 稳定(备选路径的生态基础)

## 修订

| 日期 | 版本 | 修订 |
|---|---|---|
| 2026-08-16 | 0.2 | 标记决策已定(D: Zephyr + C);加入 ADR-0001 链接;Roadmap 锚定 Zephyr scaffold 替换;更新引用与版本表 |
| 2026-08-16 | 0.1 | 初版 — 替换 ESP-IDF `esp_hid_device` 上游 README,落到 Shadow-esp32 项目实际身份;附 [`docs/RESEARCH.md`](docs/RESEARCH.md) 调研报告 |
