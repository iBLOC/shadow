# [ADR-0002] shadow-esp32 实施架构 —— 复用 Shadow Desktop/Mobile WebRTC 通路

- **状态**: Accepted (v2,**supersedes v1**)
- **日期**: 2026-08-16(v1 同日;v2 同日修订)
- **决策者**: Shadow 项目所有者(经 Sisyphus 编排)
- **覆盖 / 关系**:
  - **基于** ADR-0001(2026-08-16,调研阶段决策:Zephyr + C + ESP32-S3)。保留 RTOS / 语言 / 芯片选择。
  - **supersedes** v1:用户于同日推翻 v1 的 WebSocket+Opus+`xiaozhi_bridge` 提议,理由是 shadow-desktop 与 shadow-mobile 已用 WebRTC 与 cortex 通信,ESP32 应复用同一通路。
  - **参考**: [`docs/RESEARCH.md`](../RESEARCH.md) §9 调研 / xiaozhi-esp32 项目(state machine 借鉴,wire 不复用)/ esp-claw 项目(IO capability 派发思路) / Shadow `temporal` lobe (`webrtc/real.rs::RealTransport`) / `cortex::webrtc_route` (`/api/webrtc/{modality}/sessions/{id}/ws`)。

## 上下文与问题陈述

ADR-0001 完成"Zephyr vs ESP-IDF / Rust vs C / chip 选择"调研。ADR-0002 v1 提出"用 xiaozhi 的 WebSocket+Opus 协议 + cortex 新增 xiaozhi_bridge 模块对接 temporal lobe"的架构。

**v2 修正触发**(用户 2026-08-16):

> shadow-desktop 与持续对话模式大脑皮层通讯不是 WebRTC 吗,ESP32 项目不能复用这个逻辑吗?

→ 用户指出:**shadow-desktop (`shadow-desktop/src/lib/webrtcCompanion.ts`) 与 shadow-mobile (`shadow-mobile/lib/services/webrtc_companion.dart`) 已用 WebRTC 与 `cortex::webrtc_route` 通信;`temporal::webrtc::real.rs::RealTransport` 已 production 用 webrtc-rs 0.8 + DTLS-SRTP**。ESP32 应复用同一通路,而非引入新协议。

同时用户附带事实确认:**ESP32-Xtensa 没有可用的 WASM runtime**(wasmtime / wasmer / wazero 均无 Xtensa target;wamr Xtensa 后端是 fork 状态),所以所有 agent 逻辑必须在 cortex/temporal 后端,ESP32 是 thin client**。

因此问题变为:**如何在 Zephyr + C 上实现一个 WebRTC client,作为 cortex webrtc_route 的远端 peer,沿用 Shadow-Desktop / Mobile 的同一通路(SDP + ICE + DTLS-SRTP + Opus 媒体),并通过 WebRTC Data Channel 承载 MCP JSON-RPC 完成 IO 控制?**

## 决策驱动因素

- **跨端协议一致性 > 实现便捷**:WebRTC 让 ESP32 / Desktop / Mobile 走同一栈,平台契约统一;短期多 2 周实现成本可接受
- **WASM 在 ESP32-S3 (Xtensa) 上不可用**:验证了 ESP32 是 thin client 的设计,所有 agent 逻辑必须在 server
- **复用现有 Shadow 基础设施**:`cortex::webrtc_route` 与 `temporal::webrtc::real::RealTransport` 已 production,无需新增服务端代码
- **WebRTC Data Channel 天然承载 IO 控制**:SCTP over DTLS,JSON-RPC 2.0 通道,MCP 与 voice 共享单一 peer connection
- **保持对话独立**(来自原始设计约束):Zephyr 多任务 + 优先级保障 `dialog_task` 实时性,IO 不阻塞对话,反之亦然

## 备选方案

### A. Zephyr + WebRTC client(复用 Desktop/Mobile 通路)◀ **CHOSEN**
- ✅ 三端统一 WebRTC,Shadow 平台契约零分叉
- ✅ Cortex 后端零改动,`webrtc_route` 已是 ESP32 的现成终点
- ✅ Temporal lobe 零改动,`WebRtcAnswerSkill` + `WebRtcIceSkill` 已 production
- ✅ WebRTC Data Channel 单连接承载 voice + IO
- ⚠️ ESP32 端 WebRTC stack 自写(mbedtls DTLS + libsrtp + libopus + ICE-lite),估 +2 周
- ⚠️ Cortex 端需要补 SCTP data channel 支持 + MCP-over-data-channel 路由(估 +1-2 周)

### B. Zephyr + WebSocket + Opus + cortex xiaozhi_bridge(v1 原方案,已被推翻)
- ✅ ESP32 端工程量最低(~1 周 dialog_task)
- ❌ 跨端协议分叉(Desktop/Mobile=WebRTC, ESP32=WS)
- ❌ cortex 需新增 800-1500 LOC bridge 模块
- ❌ 长期维护双 transport

### C. Zephyr + 完整 WebRTC(包括 STUN/TURN 服务器)
- ✅ 任意 NAT 环境可用
- ❌ 需独立 TURN 服务器工程,目前 turn-server Phase 1 仅 STUN binding,不可用
- ❌ 单个家庭用户场景过度工程

## 决策

**采用 A:在 Zephyr + C 框架下,实现一个 WebRTC client,与 `cortex::webrtc_route` 建立 peer connection(同 shadow-desktop / shadow-mobile),通过 WebRTC Data Channel 承载 MCP-over-WebRTC 协议完成 IO 控制。**

### 4.1 ESP32 ↔ cortex:单一 WebRTC Peer Connection

```
ESP32 (Zephyr dialog_task)            cortex
┌──────────────────────────┐         ┌──────────────────────────┐
│ RTCPeerConnection        │         │                          │
│ ├─ audio transceiver     │ ◀════▶ │ ModalityRouter           │
││  └ Opus 16kHz / SRTP   │ │ DTLS  │ └─ voice → temporal    │
││                         │ │ SRTP │                          │
││  local: I²S mic → Opus  │ │ over │ temporal lobe            │
││  remote: Opus → I²S out │ │ UDP  │ ├─ NeureAsr/Tts         │
││                         │ │      │ ├─ dialog               │
│└─────────────────────────┘ │      │ └─ hippocamp + prefrontal│
│ └─ data channel "mcp"      │ ◀═══▶ │ cortex::mcp routing       │
│     JSON-RPC 2.0 工具调用  │ │     │ (新增 1-2 周)            │
└──────────────────────────┘         └──────────────────────────┘
       ↕ signaling (WebSocket)
       ↕   GET /api/webrtc/voice/sessions/{id}/ws
       ↕   SDP offer + ICE candidates
```

### 4.2 Zephyr 任务架构

| Task | prio | 职责 | 关键资源 |
|---|---|---|---|
| `dialog_task` | 5 | WebRTC client(SDP/ICE/DTLS-SRTP/Opus/SCTP-data-channel)| mbedtls / libsrtp / libopus / Zephyr BSD sockets |
| `net_task` | 6 | Wi-Fi + mDNS + 重连 + **WebSocket signaling client** | zephyr/net/wifi |
| `io_task` | 7 | GPIO / sensor / PWM + **MCP server over data channel** | Zephyr device drivers |
| `led_task` | 9 | OLED / WS2812 状态 | GPIO / I²C |

通信原语:
- `k_msgq`: dialog ↔ io 事件(对话触发 → LED 闪烁)
- `k_mutex`: Opus encoder 状态保护 + SCTP channel 状态
- `k_work`: 避免 ISR 中跑重活
- **WebRTC data channel** (作为优先通信原语):L4 以上的所有非媒体消息走 data channel

### 4.3 dialog_task 内部状态机(xiaozhi 模型,transport 换 WebRTC)

```
kDeviceStateUnknown
   ├─→ kDeviceStateStarting          (boot)
   ├─→ kDeviceStateWifiConfiguring   (net_task 失败)
   ├─→ kDeviceStateActivating        (与 cortex 配对)
   └─→ kDeviceStateIdle              (空闲)
        ├─→ kDeviceStateConnecting   (wake word / 按钮触发)
        │    ├─→ WebSocket signaling: SDP offer 发至 cortex
        │    ├─→ DTLS 握手 (mbedtls PSK 模式)
        │    ├─→ ICE connectivity check
        │    └─→ kDeviceStateListening  (建立后)
        │         ├─ Audio: Opus mic → SRTP → UDP 发送
        │         ├─ MCP: data channel "mcp" 接收 tool_call
        │         └─ 当收到 cortex tts.start → kDeviceStateSpeaking
        │              ├─ Audio: SRTP recv → Opus decode → I²S
        │              └─ MCP 处理继续
        │              └─ 收到 tts.stop → kDeviceStateListening / Idle
        └─→ kDeviceStateFatalError        (DTLS / 网络失败 → 重连 backoff)
```

### 4.4 IO 控制:WebRTC Data Channel 上的 MCP JSON-RPC 2.0

复用 MCP 协议规范(与 xiaozhi wire 上同名协议),WebWire transport 改为 SCTP over WebRTC:

```
io_task 启动:
    webrtc_data_channel_open("mcp", ordered=true, max_retransmits=0)
    while running:
        if (channel message arrived):
            parse JSON-RPC 2.0 payload
            dispatch to mcp_server_registered_tool(name)
            return tool result via channel.send(jsonrpc_response)

MCP 工具集 v1 范围:
    - self.light.set_rgb / self.light.set_brightness
    - self.servo.set_angle (0–180)
    - self.io.gpio_set / self.io.gpio_get
    - self.sensor.read (I²C 抽象)
    - self.system.reboot (用户专用工具, withUserTools=true)
```

### 4.5 Cortex 端改动(估 1-2 周,新增而非 bridge)

虽然 ESP32 端走了与 Desktop 同样的 WebRTC 通路,但**cortex 端需要补全 Data Channel 支持**:

| 模块 | 工作 | 估时 |
|---|---|---|
| `cortex::webrtc::data_channel` | SCTP over DTLS transport + JSON message routing | 1 周 |
| `cortex::mcp::device_router` | 把 `McpRuntime` 的 tool call 路由到对应 ESP32 device 的 data channel session | 0.5-1 周 |
| `cortex::api::device` | 设备注册/discovery(以 cortex webrtc session 为单位),让 prefrontal 能 list available devices | 0.5 周 |

**改动目的**:让 prefrontal 的 LLM 工具调用走 cortex::mcp → device_router → ESP32 data channel 的统一通路,而不是在 ESP32 端新发明协议。

### 4.6 esp-claw IO 控制模型 → Zephyr device driver 映射

esp-claw 的 capability 派发思路(opaque handle + 注册表 + 板级 peripheral YAML)在 Zephyr 上直接对应 `device` driver 模型:

| esp-claw 原模型 | shadow-esp32 Zephyr 实现 |
|---|---|
| `components/claw_capabilities/*` | Zephyr `device` drivers |
| `claw_mcp::AddTool` | io_task 启动时调 `mcp_server_register_tool()`(JSON-RPC 2.0 over WebRTC data channel) |
| `boards/.../peripheral.yaml` | Zephyr `devicetree` `.overlay` + `board.yaml` |
| Lua 模块 | **不引入**(降低 firmware 体积,ESP32-S3 RAM 紧张) |

## 决策后果

### 正面影响

- **跨端协议统一**:ESP32 / Desktop / Mobile 三端共享 WebRTC 通路,Shadow 平台协议契约无分叉
- **零服务端新代码复用**:`cortex::webrtc_route` 与 `temporal::webrtc::real` 直接服务 ESP32,无需新增 bridge(相比 v1 省 ~1500 LOC)
- **WASM 设计意图强化**:ESP32-Xtensa 无 WASM runtime 已验证,所有 agent 逻辑 server-side,ESP32 是纯 client
- **Data Channel 整合**:voice + IO 共享单连接,DTLS 加密,MCP 命令也受同一加密保护
- **对话独立约束自然达成**:Zephyr 多任务 + 优先级,`dialog_task` 实时音频不被打断
- **未来扩展**:任何新的 shadow-iot 设备(手机、手表、桌面硬件)都可以走同一通路

### 负面影响

- **ESP32 WebRTC client 自写**~1500-2500 LOC C(mbedtls + libsrtp + libopus + ICE-lite + SCTP data channel)
- **Cortex 端需新增**~1000-1500 LOC Rust(数据通道 + 设备路由 + discovery)
- **NAT 限制**:首版用 ICE-lite + PSK DTLS,适合家庭 Wi-Fi;复杂 NAT(企业网/4G)需后续加 TURN(turn-server Phase 1 仅 STUN binding,不可用)
- **首次端到端调试周期长**:DTLS 握手 + SRTP 加解密 + ICE connectivity check 三件套都需要真实硬件验证
- **ESP32 SDK 缺失**:`libsrtp` 与 `libopus` 需 out-of-tree 移植;Zephyr upstream 无 RFC 3711 reference impl

### 中性影响

- **ADR-0001 不 supersede**;RTOS / 语言 / 芯片三选保持。ADR-0002 v1 (WebSocket 提议) superseded by v2
- **xiaozhi-esp32 仍参考价值在**:state machine、MCP 工具列表、错误处理 — 仅 wire protocol 不复用
- **esp-claw 仍参考价值在**:capability 派发思路 — 不引入 Lua runtime

## 后续动作

| # | 动作 | 估时 | 依赖 |
|---|---|---|---|
| 1 | cortex Data Channel 支持 + device_router(`cortex::webrtc::data_channel` + `cortex::mcp::device_router` + `cortex::api::device`)| 1.5-2 周 | — |
| 2 | shadow-esp32 Zephyr scaffold: `app/prj.conf` + `CMakeLists.txt` + `west.yml`,目标 `esp32s3_devkitc` | 1 周 | — |
| 3 | dialog_task: WebSocket signaling + SDP/ICE + DTLS handshake (mbedtls PSK) + SRTP (libsrtp out-of-tree) + Opus codec (libopus out-of-tree) + ICE-lite | 6-7 周 | 1,2 |
| 4 | dialog_task: WebRTC Data Channel (SCTP over DTLS) + MCP JSON-RPC 2.0 handler | 1-2 周(并入 dialog_task 工作) | 1 |
| 5 | io_task: Zephyr device drivers + MCP server over data channel + capability 注册 | 3 周 | 2,4 |
| 6 | net_task + led_task + mDNS `_shadow._tcp` 广播 | 1 周 | 2 |
| 7 | end-to-end demo: ESP32 ↔ cortex webrtc_route ↔ temporal lobe ↔ neure ASR/TTS ↔ prefrontal LLM + LLM tool call via data channel → ESP32 GPIO | 2 周 | 1-6 |
| 8 | CI: twister + QEMU sim 子集 + 板级 sanity build | 1 周 | 3-5 |
| 9 | OTA 镜像 (LittleFS) + user skills 持久化 | 1 周 | 3 |

总估:**5-6 人月**,(以有经验的 embedded C + WebRTC 经验工程师计)。

## 跟进监控

- 每 3 个月重新评估:
  - ESP32 上 DTLS-SRTP 栈是否成熟(决定是否替换为现成 WebRTC client)
  - Zephyr upstream 是否合并 `libopus` / `libsrtp` 集成(决定是否取消 out-of-tree)
  - cortex temporal lobe 是否扩展 camera 能力(决定 dialog_task 是否增加 video transceiver)
  - TURN server 完成度(turn-server Phase 1 仅 STUN binding,用于复杂 NAT 部署)

## 参考

- ADR-0001 调研: [`docs/adr/0001-stack-choice-zephyr-c.md`](0001-stack-choice-zephyr-c.md)
- ADR-0002 v1 (superseded): 此文件 v1 内容已丢弃;核心变化为 wire 从 WebSocket 改为 WebRTC
- 调研报告 §9: [`docs/RESEARCH.md`](../RESEARCH.md)
- Shadow-Desktop 参考实现: [`shadow-desktop/src/lib/webrtcCompanion.ts`](../../../shadow-desktop/src/lib/webrtcCompanion.ts)
- Shadow-Mobile 参考实现: [`shadow-mobile/lib/services/webrtc_companion.dart`](../../../shadow-mobile/lib/services/webrtc_companion.dart)
- Shadow cortex webrtc route: [`cortex/src/api/webrtc_route.rs`](../../../cortex/src/api/webrtc_route.rs)
- Shadow temporal lobe webrtc transport: [`temporal/src/webrtc/real.rs`](../../../temporal/src/webrtc/real.rs) (`webrtc-rs 0.8 + DTLS-SRTP`)
- xiaozhi-esp32 state machine / tools: https://github.com/78/xiaozhi-esp32
- esp-claw capability 模型: https://github.com/espressif/esp-claw
- WASM on Xtensa ESP32 (不可用验证): wasmtime / wasmer / wazero 官方 tier-1 均无 Xtensa target

## 修订

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-08-16 | 2.0 | **supersedes v1**:用户指出 shadow-desktop 已用 WebRTC,ESP32 应复用同一通路。Wire protocol 从 WebSocket+Opus+`xiaozhi_bridge` 改为 WebRTC(同 Desktop/Mobile);cortex 端 `xiaozhi_bridge` 整段撤销,改为新增 data_channel/device_router (~1500 LOC Rust);ESP32 端 dialog_task 改为 WebRTC client 实现(mbedtls DTLS + libsrtp + libopus + ICE-lite + SCTP data channel);MCP IO 控制改为 WebRTC Data Channel。 |
| 2026-08-16 | 1.0 | 初版;WebSocket + Opus + `xiaozhi_bridge` 方案(已由 v2 取代) |