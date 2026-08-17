# shadow-esp32

> **Shadow 在 ESP32-S3 边缘节点上的语音助手 + IO 控制客户端** — 参照 [`78/xiaozhi-esp32`](https://github.com/78/xiaozhi-esp32) 应用层架构,**复用 Shadow Desktop/Mobile 同一套 WebRTC 通路** 与 Shadow cortex 后端通信,后端走 `temporal` lobe;firmware 用 **Zephyr RTOS + C** 多任务实现([ADR-0001](./docs/adr/0001-stack-choice-zephyr-c.md) 调研 + [ADR-0002 v2](./docs/adr/0002-shadow-esp32-implementation-architecture.md) 实施架构)。

| 字段 | 值 |
|---|---|
| **目标平台** | ESP32-S3-DevKitC(首选) / M5Stack CoreS3 / 其它 ESP32-S3-WROOM 模组 |
| **状态** | **0.4 — 实施架构 v2 已定(ADR-0002 v2,2026-08-16,WebRTC 复用)**,待启动 scaffold 替换 |
| **决策栈** | **Zephyr 4.4.x + C + west**(`esp32s3_devkitc` 板级) |
| **架构 ADR** | [`docs/adr/0001-stack-choice-zephyr-c.md`](docs/adr/0001-stack-choice-zephyr-c.md)(调研 RTOS/语言/chip) + [`docs/adr/0002-shadow-esp32-implementation-architecture.md`](docs/adr/0002-shadow-esp32-implementation-architecture.md)(实施架构 v2) |
| **调研文档** | [`docs/RESEARCH.md`](docs/RESEARCH.md) — Zephyr/Rust + xiaozhi/esp-claw/temporal + WASM-on-Xtensa + WebRTC 复用综合调研 |
| **应用架构参考** | [`78/xiaozhi-esp32`](https://github.com/78/xiaozhi-esp32)(state machine + Opus + MCP tools + 板级;28.9k stars / MIT) |
| **IO 控制参考** | [`espressif/esp-claw`](https://github.com/espressif/esp-claw)(capability 派发思路;不引入 Lua) |
| **后端复用** | Shadow `cortex` webrtc_route → `temporal` lobe(webrtc-rs 0.8 + DTLS-SRTP)→ `neure` ASR/TTS;**与 shadow-desktop / shadow-mobile 完全相同** |
| **代码来源(过渡)** | ESP-IDF v6.0.2 `esp_hid_device` 示例(脚手架,即将迁移) |

---

## 这是什么

Shadow 平台的端侧(Layer 4)目前由 **Shadow-Desktop**(Tauri + React)和 **Shadow-Mobile**(Flutter)构成。`shadow-esp32` 是第三条端形态 —— **ESP32-S3 上的低功耗语音助手 + IO 控制节点**,目标场景是低成本边缘硬件上的智能助理:

- **对话能力**:xiaozhi-esp32 风格的 wake word → 流式 ASR → LLM → TTS 闭环,但 **不** 在 ESP32 上跑模型,只跑 Opus codec + WebRTC client
- **后端复用**:**与 shadow-desktop / shadow-mobile 同一套 WebRTC 通路**(SDP / ICE / DTLS-SRTP / Opus 媒体)。Cortex 端 `cortex::webrtc_route` 已经是 ESP32 的现成终点,**无需新增 bridge 模块**;`temporal::webrtc::real::RealTransport` 直接服务 ESP32
- **IO 控制**:esp-claw capability 派发思路,每个 capability 是 Zephyr `device` driver + MCP JSON-RPC 暴露的工具;承载协议是 **WebRTC Data Channel**(SCTP-over-DTLS,JSON-RPC 2.0)
- **对话独立**:Zephyr 多任务架构,`dialog_task`(prio 5,最高)与 `io_task`(prio 7)完全解耦,通过 `k_msgq` 交换轻量事件
- **ESP32 是 thin client**:所有 agent 逻辑跑在 cortex/temporal 后端;Xtensa ESP32 无可用 WASM runtime,验证了 thin client 设计

它**不是** ESP-IDF 上游的 HID 设备 demo —— README 里那些鼠标/键盘示例代码(`main/esp_hid_device_main.c` 等)只是脚手架起点,会被替换为 Shadow Agent 实现。

## 为什么参考 esp-claw(IO 控制派发思路)

[`espressif/esp-claw`](https://github.com/espressif/esp-claw) 是乐鑫官方在 2025–2026 年主推的 IoT-side AI agent framework(2.0k stars, Apache-2.0)。它的 capability 派发思路(opaque handle + 注册表 + 板级 peripheral YAML)在 Zephyr 上直接对应 `device` driver 模型。**只借鉴组织思路,不引入 esp-claw 本身**(esp-claw 是 ESP-IDF + C + FreeRTOS + Lua,**与 Zephyr 不兼容**):

- 借鉴:capability 注册流程(`claw_cap_*` opaque handle 模式 → Zephyr `device` driver)
- 借鉴:板级 peripheral YAML → Zephyr `devicetree` `.overlay`
- **不引入**:Lua runtime(降低 firmware 体积,ESP32-S3 RAM 紧张)、esp-claw 的 cloud LLM 调用(我们走 Shadow 自家 backend)

**关键差异**:esp-claw 是 ESP-IDF + C + FreeRTOS + Lua + cloud LLM,**不是** Zephyr,**也不** 是 WebRTC,**也不** 接 Shadow backend。它给的是 IO 派发的**架构蓝图**,不是代码模板。

## 技术栈(**已选定 D: Zephyr + C,WebRTC 复用**)

> ✅ **2026-08-16 决策**:RTOS / 语言 / 芯片 = D(ADR-0001);wire protocol = WebRTC(复用 shadow-desktop/mobile 通路,ADR-0002 v2)。完整记录见 [`docs/adr/0001-stack-choice-zephyr-c.md`](docs/adr/0001-stack-choice-zephyr-c.md) + [`docs/adr/0002-shadow-esp32-implementation-architecture.md`](docs/adr/0002-shadow-esp32-implementation-architecture.md)。

### 决策栈

| 维度 | 选择 | 备注 |
|---|---|---|
| **RTOS** | Zephyr 4.4.x(≥ 4.4.1) | `esp32s3_devkitc` 板级已 `Maintained` |
| **语言** | C | ESP32 上 Zephyr 一等公民语言 |
| **构建** | west + CMake + Kconfig + devicetree | 标准 Zephyr 工作流 |
| **Wi-Fi 驱动** | Zephyr 自带(原 `hal_espressif` 模块已合 mainline) | — |
| **wire protocol** | **WebRTC**(SDP / ICE / DTLS-SRTP / Opus / SCTP Data Channel)| **同 shadow-desktop / mobile** |
| **DTLS 栈** | Zephyr 自带 **mbedtls**(`CONFIG_MBEDTLS + CONFIG_MBEDTLS_KEY_EXCHANGE_PSK_ENABLED`)| PSK 模式简化首版 |
| **SRTP 栈** | **libsrtp**(out-of-tree 移植,Zephyr 无 upstream)| RFC 3711 加解密 |
| **Opus codec** | **libopus**(out-of-tree 移植)| 60 ms 帧长,16 kHz mono |
| **ICE** | **ICE-lite**(自实现,~500 LOC)| 家庭 Wi-Fi 够用;复杂 NAT 后续加 TURN |
| **IO 控制** | **WebRTC Data Channel "mcp"**(SCTP-over-DTLS,JSON-RPC 2.0)| cortex::mcp → device_router → ESP32 data channel |
| **mDNS** | Zephyr 内置 `zephyr/net/dns_sd.h` 或 sample `net/mdns_responder` | 广播 `_shadow._tcp` 服务 |

### 所有评估过的路径(决策上下文)

#### RTOS / 语言 / 芯片(ADR-0001)

| 路径 | RTOS | 语言 | ESP32-S3 状态 | 决策 |
|---|---|---|---|---|
| A | (no_std / Embassy) | Rust (esp-hal 1.x) | ✅ Production | ❌ 不选(放弃 Zephyr,只取 Rust) |
| B | FreeRTOS (ESP-IDF) | C | ✅ Production | ❌ 不选(可 fork esp-claw 但与现代 RTOS 模型不契合) |
| C | FreeRTOS (ESP-IDF) | Rust (esp-idf-sys) | ✅ Production | ❌ 不选(esp-idf-sys 标为"community supported") |
| **D ◀ CHOSEN** | **Zephyr** | **C** | ✅ Production | ✅ **采纳** |
| E | Zephyr | Rust | ❌ **平台不支持(Xtensa 缺位)** | ❌ 不可行;**唯一可走 Zephyr+Rust 的方式是换芯片到 RISC-V** |
| F | (no-op) | — | — | ❌ 不前 |

#### Wire protocol(ADR-0002 v2)

| 路径 | Wire | Cortex 后端 | 跨端一致 | 决策 |
|---|---|---|---|---|
| **A ◀ CHOSEN** | **WebRTC**(同 desktop / mobile)| **0 改动**(`webrtc_route` 现成)| ✅ 三端统一 | ✅ **采纳** |
| B(已推翻 v1)| WebSocket + Opus + `xiaozhi_bridge`(v1 原案)| 新增 800-1500 LOC bridge | ❌ 分叉 | ❌ 被用户推翻 |

### 调研结论(摘要 — 决策依据)

针对用户原始问题"是否 Zephyr + Rust 在 ESP32-S3 上可行":

- **Zephyr 本身** 在 ESP32-S3 上 production-ready(v4.4.x,4.4.1 在 2026-06 修了多个 S3-specific 问题)。
- **Zephyr 的 Rust 语言支持**(`zephyrproject-rtos/zephyr-lang-rust`)当前平台白名单只有 8 个,**且唯一 ESP 平台是 `esp32c3_supermini/esp32c3`(RISC-V)—— ESP32-S3 不在白名单**。
- 这意味着 Zephyr + Rust on Xtensa 需要自行维护 LLVM/Rust fork + Zephyr out-of-tree patches,工程风险极大,本项目不采纳。
- **Rust on ESP32-S3 在 2026-08 实际可行的栈** 是 `esp-hal 1.x`(已 vendor-backed by Espressif;v1.0.0 stable 2025-10,v1.1.2 在 2026-08)+ Embassy 异步 Runtime + `esp-radio`(Wi-Fi + BLE)。但**它失去 Zephyr**。
- **WASM on Xtensa ESP32 不可用**:wasmtime / wasmer / wazero 官方 tier-1 均无 Xtensa target;WAMR Xtensa 后端是 fork 状态。验证了 **ESP32 是 thin client** 设计 —— 所有 agent 逻辑必须在 server。
- **Wire protocol 选择**:shadow-desktop / mobile 已用 WebRTC 与 cortex 通信,ESP32 **复用**同一通路 → 跨端协议一致,不引入新协议。
- **决策接受的语言代价**:shadow-esp32 将是 Shadow 平台**唯一**的非 Rust 端(其它全 Rust)。

完整论述、引用、版本号、外设覆盖矩阵、风险点:见 [`docs/RESEARCH.md`](docs/RESEARCH.md);决策与后果:见 [`docs/adr/0001-stack-choice-zephyr-c.md`](docs/adr/0001-stack-choice-zephyr-c.md) + [`docs/adr/0002-shadow-esp32-implementation-architecture.md`](docs/adr/0002-shadow-esp32-implementation-architecture.md)。

## 当前代码结构(2026-08-16,ADR-0002 v2 §后续动作 #2 已落地)

```
shadow-esp32/
├── west.yml                  # workspace manifest → Zephyr v4.4.1
├── CMakeLists.txt            # 顶层,引用 Zephyr SDK + add_subdirectory(app)
├── prj.conf                  # 顶层 workspace 默认 Kconfig
├── app/                      # Zephyr 应用
│   ├── CMakeLists.txt        # 列出 5 个 task 源文件 + zephyr_library
│   ├── prj.conf              # 应用 Kconfig(Wi-Fi / DTLS / mDNS / mbedTLS / 多线程)
│   └── src/
│       ├── include/shadow_esp32/
│       │   └── tasks.h        # task 公共 API(栈大小 + 优先级常量)
│       ├── main.c            # 启动 → 4 个 task `*_task_start()`
│       ├── dialog_task.c     # ADR-0002 v2 §4.3 位置,WebRTC client 占位心跳
│       ├── io_task.c         # ADR-0002 v2 §4.6 位置,MCP server 占位心跳
│       ├── net_task.c        # ADR-0002 v2 §4.6 位置,Wi-Fi/mDNS/signaling 占位
│       └── led_task.c        # ADR-0002 v2 §4.3 状态指示器
├── .devcontainer/            # Zephyr 镜像(`zephyrprojectrtos/zephyr-build`)
│   ├── Dockerfile
│   └── devcontainer.json     # postCreateCommand: west init + update + pip
├── .legacy-esp-idf/          # 历史: ESP-IDF v6.0.2 HID demo scaffold(冻结,不再开发)
├── docs/
│   ├── RESEARCH.md
│   ├── adr/
│   │   ├── 0001-stack-choice-zephyr-c.md
│   │   └── 0002-shadow-esp32-implementation-architecture.md
│   └── implementation-notes/
│       └── 2026-08-16-cortex-data-channel-device-router.md
├── README.md                 # 本文件
└── .gitignore                # Zephyr + ESP-IDF 双重 ignore
```

## 编译(Zephyr + west)

```bash
# 一次性准备(在 devcontainer 或本机装了 Zephyr SDK 的环境)
cd shadow-esp32
west init -l .            # 用 west.yml 初始化 workspace
west update              # 拉 Zephyr v4.4.1
west packages pip --install

# 构建
west build -b esp32s3_devkitc app

# 烧写(板级直连)
west flash

# 串口监控
west debug
```

构建产物:
- `app/build/zephyr/zephyr.elf` — 固件 ELF
- `app/build/zephyr/zephyr.bin` — 烧写镜像
- `app/build/twister-out/` — 测试报告

**`west build` 必须有 Zephyr SDK + xtensa-espressif_esp32s3 工具链**。devcontainer (`zephyrprojectrtos/zephyr-build:0.16-3`) 自带。本机无 SDK 时的轻量选择:用 devcontainer 或在 CI 里跑 `west build`。

`.legacy-esp-idf/` 子目录保留了 ESP-IDF scaffold 的 snapshot — **不再开发**,作为 ADR-0001 调研阶段的 git 历史证据。

## 协议握手(目标 — WebRTC 复用 Desktop/Mobile 通路)

```
┌──────────────────────┐                                         ┌──────────────────────────────────┐
│ shadow-esp32         │                                         │ cortex                            │
│ (Zephyr dialog_task) │                                         │                                  │
│                      │                                         │  ┌────────────────────────────┐  │
│  mDNS _shadow._tcp ──┼── mDNS query (net_task) ───────────────▶│  │ mds_discovery               │  │
│                      │  ◀──── instance_name + port ─────────── │  └─────────────┬──────────────┘  │
│                      │                                         │                ▼                  │
│ ┌──────────────────┐ │  ─── WebSocket signaling ────────────▶ │  ┌────────────────────────────┐  │
│ │ RTCPeerConnection │ │   GET /api/webrtc/voice/sessions/{id}/ws│ │ cortex::webrtc_route (现成) │  │
│ │  ├─ audio Opus/SRTP│ │   SDP offer/answer + ICE candidates    │ │  ModalityRouter → temporal   │  │
│ │  └─ DC "mcp"      │ │                                         │ │  rtp_relay (per-dir SRTP)    │  │
│ └──────────────────┘ │  ◀═══ DTLS-SRTP over UDP ════════════   │ └─────────────┬──────────────┘  │
│           ▲           │  (audio: Opus 60ms frames;             │               ▼ A2A              │
│           │           │   data: SCTP-over-DTLS JSON-RPC)        │  ┌────────────────────────────┐  │
│  ┌────────┴────────┐  │                                         │  │ temporal lobe (现成)        │  │
│  │  mbedtls DTLS + │  │                                         │  │  WebRtcAnswerSkill          │  │
│  │  libsrtp +      │  │                                         │  │  WebRtcIceSkill             │  │
│  │  libopus + ICE  │  │                                         │  │  NeureAsr / NeureTts        │  │
│  └─────────────────┘  │                                         │  │  dialog / hippocamp / prefrontal│  │
│  (Zephyr BSD sockets)  │                                         │  └────────────────────────────┘  │
└──────────────────────┘                                         └──────────────────────────────────┘
```

**Wire protocol**:WebRTC(同 shadow-desktop `webrtcCompanion.ts` + shadow-mobile `webrtc_companion.dart`)。**Audio transceiver**:Opus/SRTP/DTLS。**Data channel "mcp"**:SCTP-over-DTLS,承载 MCP JSON-RPC 2.0(esp32 ↔ cortex::mcp device_router,新增 ~1500 LOC Rust)。

> 完整 wire format + 5 个 dialog 状态机 + 4 个 Zephyr task 优先级 + 9 项后续动作见 [`docs/adr/0002-shadow-esp32-implementation-architecture.md`](docs/adr/0002-shadow-esp32-implementation-architecture.md)。

## Roadmap(已锚定路径 D + ADR-0002 v2 实施架构)

完整任务分解见 ADR-0002 §"后续动作"9 项。当前进度:

1. ✅ 路径 D 调研 / ✅ ADR-0001(调研) / ✅ ADR-0002 v1(superseded)/ ✅ ADR-0002 v2(WebRTC 复用)
2. ✅ **cortex Data Channel + device_router + api::device**(Rust,~600 LOC)— 2026-08-16 落地;`POST /invoke` 暂返 501 + `InvokeUnimplemented`(详见 `docs/implementation-notes/2026-08-16-cortex-data-channel-device-router.md`)
3. ✅ **shadow-esp32 Zephyr scaffold**(west.yml + 顶层 CMakeLists/prj.conf + app/ + 4 task 占位 + devcontainer)— 2026-08-16 落地
4. ⏳ **dialog_task**:WebSocket signaling + SDP/ICE + DTLS PSK + SRTP + Opus + ICE-lite — 6-7 周
5. ⏳ **dialog_task** WebRTC Data Channel (SCTP over DTLS) + MCP JSON-RPC 2.0 handler — 1-2 周(并入 #4)
6. ⏳ **io_task**:Zephyr device drivers + MCP server over data channel + capability 注册 — 3 周
7. 🟡 **net_task Wi-Fi + reconnect** + mDNS `_shadow._tcp` 广播(v1 落地)— 2026-08-16;WebSocket signaling 客户端属于 #3(`dialog_task`)
7a. ⏳ **led_task** — 与 #3 合并落地
8. ⏳ **end-to-end demo**:ESP32 ↔ cortex webrtc_route ↔ temporal lobe ↔ neure ASR/TTS ↔ prefrontal LLM + LLM tool call via data channel → ESP32 GPIO — 2 周
9. ⏳ **CI**:twister + QEMU sim 子集 + 板级 sanity build — 1 周
10. ⏳ **OTA 镜像**(LittleFS)与 user skills 持久化 — 1 周

剩余 **5-6 人月**(以有经验的 embedded C + WebRTC 经验工程师计)。详细每个动作的内容 + 依赖关系见 ADR-0002 v2。

## 引用 / See also

### 项目内
- [`docs/RESEARCH.md`](docs/RESEARCH.md) — 2026-08-16 调研 + §9 xiaozhi/esp-claw/temporal/WASM-on-Xtensa 整合分析
- [`docs/adr/0001-stack-choice-zephyr-c.md`](docs/adr/0001-stack-choice-zephyr-c.md) — **调研阶段 ADR**:采用 Zephyr + C (accepted)
- [`docs/adr/0002-shadow-esp32-implementation-architecture.md`](docs/adr/0002-shadow-esp32-implementation-architecture.md) — **实施架构 ADR v2**:Zephyr 多任务 + WebRTC(同 desktop/mobile)+ Shadow temporal backend (accepted)
- `Shadow` 根文档:[`/home/ibloc/Projects/shadow/AGENTS.md`](../AGENTS.md)
- Shadow `temporal` lobe:[`/home/ibloc/Projects/temporal/`](../temporal/)
- Shadow `cortex` webrtc route:[`/home/ibloc/Projects/cortex/src/api/webrtc_route.rs`](../cortex/src/api/webrtc_route.rs)
- Shadow-Desktop WebRTC companion 参考:[`/home/ibloc/Projects/shadow/shadow-desktop/src/lib/webrtcCompanion.ts`](../shadow-desktop/src/lib/webrtcCompanion.ts)
- Shadow-Mobile WebRTC companion 参考:[`/home/ibloc/Projects/shadow/shadow-mobile/lib/services/webrtc_companion.dart`](../shadow-mobile/lib/services/webrtc_companion.dart)

### 外部资料
- [`78/xiaozhi-esp32`](https://github.com/78/xiaozhi-esp32) — 应用层架构参考(state machine + Opus + MCP server;28.9k stars / MIT)
- [`78/xiaozhi-esp32/blob/main/docs/mcp-protocol.md`](https://github.com/78/xiaozhi-esp32/blob/main/docs/mcp-protocol.md) — MCP JSON-RPC 2.0 envelope 定义(协议名沿用,transport 由 WS → SCTP over WebRTC)
- [`espressif/esp-claw`](https://github.com/espressif/esp-claw) — IO control capability 派发参考(借鉴组织思路,不引入 Lua)
- [Zephyr Project — Espressif boards](https://docs.zephyrproject.org/latest/boards/espressif/index.html) — Zephyr 板列表
- [Zephyr Project — esp32s3_devkitc board](https://docs.zephyrproject.org/latest/boards/espressif/esp32s3_devkitc/doc/index.html) — 本项目目标板
- [Zephyr Project — mbedtls](https://docs.zephyrproject.org/latest/services/security/mbedtls.html) — DTLS 基础
- [Zephyr Support Status (Espressif Developer Portal)](https://developer.espressif.com/software/zephyr-support-status/) — Espressif 官方对 Zephyr 状态的公告
- [RFC 5245 (ICE)](https://datatracker.ietf.org/doc/html/rfc5245) / [RFC 5764 (DTLS-SRTP)](https://datatracker.ietf.org/doc/html/rfc5764) / [RFC 3711 (SRTP)](https://datatracker.ietf.org/doc/html/rfc3711) / [RFC 7587 (Opus RTP)](https://datatracker.ietf.org/doc/html/rfc7587) — WebRTC 协议族

## 修订

| 日期 | 版本 | 修订 |
|---|---|---|
| 2026-08-16 | 0.6 | net_task v1 实现:Wi-Fi PSK connect + 事件回调 + 5s 重连 + mDNS responder;`shadow_net_wifi_up` 信号暴露给 dialog_task;Roadmap #7 标部分完成 |
| 2026-08-16 | 0.5 | Zephyr scaffold:写 west.yml + 顶层 CMakeLists/prj.conf + `app/` 5 个 task 占位 + devcontainer 切到 `zephyrprojectrtos/zephyr-build:0.16-3`;`.legacy-esp-idf/` 冻结;Roadmap #3 标完成;章节"当前代码"重写为新目录结构 |
| 2026-08-16 | 0.4 | **架构升级到 v2**:WebRTC + data channel + 跨端统一(用户推翻 v1 WebSocket 提议);重写"这是什么"/"协议握手"/Roadmap;ADR-0002 v1 → v2 标记 superseded;加入 shadow-desktop / shadow-mobile WebRTC companion 文件路径链接 |
| 2026-08-16 | 0.3 | 实施架构:加入 ADR-0002 链接;重写"这是什么"/"协议握手"/"Roadmap";架构升级为 Zephyr 多任务 + xiaozhi wire + Shadow temporal 后端;引用更新 |
| 2026-08-16 | 0.2 | 标记决策已定(D: Zephyr + C);加入 ADR-0001 链接;Roadmap 锚定 Zephyr scaffold 替换;更新引用与版本表 |
| 2026-08-16 | 0.1 | 初版 — 替换 ESP-IDF `esp_hid_device` 上游 README,落到 Shadow-esp32 项目实际身份;附 [`docs/RESEARCH.md`](docs/RESEARCH.md) 调研报告 |