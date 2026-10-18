# Eclipse Zenoh × 丘脑传感器数据面 — 评估（2026-10-15）

用户提议：github.com/eclipse-zenoh/zenoh 适合 ①丘脑与其他传感器设备的数据交换
②作为工具注册到叶区（从丘脑拉数据）。

## 结论：**强契合，建议接入**——接入点已存在（FrameSource URL-scheme 分发）

> **2026-10-16 更新：已实施（推 + 拉双侧）**。实施记录见本文末尾
> 「实施记录」节；评估正文保留原貌。

## 为什么契合（逐条对源码）

1. **Rust 原生**——zenoh 核心是 Rust（与大脑栈同语言），crates.io `zenoh` crate 直接依赖
2. **接入缝已存在**：`telencephalon/src/visual_task/frame_sources.rs` 按 URL scheme 分发
   数据源（http/rtsp/a2a/local 四种已实现）——**加 `zenoh://` → ZenohFrameSource 即可**，
   与 RtspFrameSource 同套路（订阅 key expression，每消息即一帧/一样本）
3. **丘脑角色原生映射**：
   - 传感器设备 → zenoh Publisher（key: `shadow/sensor/bath_temp`）
   - 丘脑 → zenoh Subscriber（喂现有 ring buffer + DataFusion，**下游不变**）
   - 丘脑 → zenoh Queryable（远端 SQL/快照查询）
   - 历史数据 → zenoh storage plugin（与 L2 NVR archive 互补）
4. **治理干净**：Eclipse 基金会（真开源治理，对比 GoRules 私有治理）；License
   Apache-2.0 / EPL-2.0 双许可；有 MQTT/ROS2/DDS bridge（存量 IoT 设备走 MQTT
   bridge 即可接入，不用改设备端）
5. **协议分层正确**：zenoh 是**数据面**（device↔thalamus），在 ACP（认知 bus）和
   A2A（任务协议）**之下**——不与现有两层竞争，是补齐第三层（传感器数据面）

## 用户两个提议的落法

### ① 丘脑 ↔ 传感器设备数据交换（主路径）

```
[传感器设备] ──zenoh pub──▶ key: shadow/sensor/bath_temp
                                │
                    [zenohd router（多设备时）/ p2p]
                                │
[丘脑 ZenohFrameSource] ◀── zenoh sub ──┘
        │ register_sensor + push_sample（现有）
        ▼
[ring buffer + DataFusion]（现有，不变）
        ▼
[ACP bus → 4 叶区]（现有，不变）
```

实现 = `ZenohFrameSource`（~100 行）+ frame_sources.rs 分发注册 + zenoh 依赖。

### ② zenoh 查询工具注册到叶区（拉式补充）

叶区现有推模式（thalamus ACP 推 sensor_event）；加 `zenoh_query` 工具后 lobe
可**按需拉**历史/远端数据（zenoh queryable + get）。走 `get_tools_for_llm()`
注册模式（decision-stub 同款），触发条件更灵活（推=实时流，拉=按需回溯）。
两者互补，不互斥。

## 对比其他方案

| 方案 | Rust 原生 | 查询/存储 | 治理 | 对存量 IoT |
|---|---|---|---|---|
| **zenoh** | ✅ 核心 Rust | ✅ pub/sub+query+storage plugin | Eclipse（真开源） | MQTT/ROS2 bridge |
| MQTT (rumqttc) | ✅ 客户端 | ❌ 无查询/存储概念 | OASIS 标准 | ✅ 原生 |
| NATS | ✅ 客户端 | KV/对象存储 | CNCF | 需桥接 |
| 自研 HTTP 轮询 | ✅ | ❌ | — | 需设备开 HTTP |

## 实施路径（建议 3 步）

1. **ZenohFrameSource**（1-2 天）：diencephalon 加 `zenoh` 依赖（或独立
   `thalamus-zenoh` crate），实现 FrameSource；frame_sources.rs 加 `zenoh://` 分发；
   单测用 zenoh p2p（无 router，同进程 peer 直连即可）
2. **叶区 zenoh_query 工具**（1 天）：`get_tools_for_llm()` 注册，按需拉
3. **zenohd router + storage**（按需）：多设备组网 + 历史持久化——单机 p2p 不需要

## 注意

- zenoh runtime 依赖不小（首次编译/体积），peer-to-peer 模式单机可用无需 router
- key expression 设计要对齐 intent_signature 语义（`shadow/sensor/<name>` 与
  `<agent>:<task>` 是两个平面）
- ACP/A2A/zenoh 三层职责文档化（zenoh=数据面，ACP=认知 bus，A2A=任务协议）

---

## 实施记录（2026-10-16）

### 已落地（diencephalon，192 测全绿）

**推式面 — `diencephalon/src/zenoh_source.rs`**
- `ZenohIngestSource`：实现 `IngestSource` trait（与 `SyntheticSource` 同缝），
  `sensor_specs()` 预注册 + `run()` 每 sensor 一个订阅任务 → 解码 → ring buffer
- payload 解码（`decode_payload`，公共函数）：裸数字 / JSON 数字 /
  JSON `{"value": N}` 三形态；不可解码样本跳过
- 时间戳用**本地到达时间**（不要求设备时钟同步）
- 快捷构造 `with_sensors(vec![(key, name)])`（kind=generic、cap=1024）
- 一站式接线：`diencephalon::init_zenoh_thalamus(sensors)`

**拉式面 — `diencephalon/src/zenoh_sensor.rs` + `mcp.rs`**
- 同一 session 上声明 `shadow/sensor/**` queryable（`run()` 内自动声明，
  推拉共享一条连接）——发现过程：最初只有推到 ring，`zenoh_query` 拉
  测试超时暴露缺口，修复为 ingest 自带应答面
- selector 约定 `shadow/sensor/<name>?limit=N`（默认 64，clamp 1..4096），
  应答 JSON `{name, kind, samples:[[ts_ms, value],...]}`；未知 sensor → reply_err
- `query_sensor(session, name, limit, timeout)`：客户端一次性拉取
- **`zenoh_query` MCP 工具**（`mcp_server` 注册，与叶区 agent 走同一 invoke 面）：
  参数 `sensor` / `limit` / `timeout_ms`；未接 session 时返回明确 wiring 错误
- `ZenohSensorQueryable`（独立句柄版）保留：远端/分区部署可单独声明应答面

**测试（10 个 zenoh 相关）**
- 解码 3 测；selector 解析 3 测
- `zenoh_pubsub_reaches_thalamus_ring`：真实 pub → ring（peer 模式单机）
- `zenoh_push_then_pull_roundtrip`：推 → 拉（ingest 自带 queryable）
- `zenoh_query_tool_roundtrip_over_live_session`：设备 pub → ring →
  **MCP 工具调用** → 快照 JSON 返回（端到端，与叶区调用路径同面）
- `zenoh_query_without_session_reports_wiring_error`：未接线报错清晰

### 依赖与接线

```toml
# diencephalon/Cargo.toml
zenoh = "1.10.1"      # 默认 features（含 transport_tcp/udp + 多播发现）
arc-swap = "1.9"      # Thalamus.zenoh_session 附着句柄（构造后 attach）
```

```rust
// 接线（一份代码同时开推+拉）
let thalamus = diencephalon::init_zenoh_thalamus(vec![
    ("shadow/sensor/bath_temp".into(), "bath_temp".into(), "temperature".into(), 4096),
]).await?;
// 设备端发布（任意 zenoh 客户端 / zenohd 组网）：
//   publisher.put("shadow/sensor/bath_temp", "{\"value\": 24.5}")
```

**跨进程联调实操（2026-10-16 实测）**：

- **单机测试**：两端都用默认 config（多播发现）最简单，已验证跨进程 pub/sub 通
  （`cargo run --example zenoh_publish -- shadow/sensor/bath_temp 41.75` 连续 5 条
  全部落进丘脑 ring，`zenoh_query`/SQL 均可见）。
- **显式 endpoint**（多播不可用的环境）：`ZENOH_ENDPOINT=tcp/127.0.0.1:7447`——
  收方 `init_zenoh_thalamus_at` 侧 listen，发方 `zenoh_publish` 侧 connect。
  注意 zenoh 配置 key 用**斜杠路径**（`connect/endpoints`，值是 JSON 数组字符串
  `["tcp/..."]`；`insert_json5` 是 in-place 修改不返回新 config）。
- **排查陷阱**：ingest 的 `run()` 以 `cancel` oneshot 结束——**如果持有发送端
  的 Thalamus 被 drop，接收循环立即 abort**。`Thalamus::new` 内部持有 `tx`
  （正常路径安全）；自建 `run()` 直调（测试/调试脚手架）必须同样保活 tx，否则
  表现为"订阅了但永远收不到"。
- **并行测试陷阱**：同进程多个真实 zenoh session 落在同一多播域会互相串扰，
  网络测试用 `NET_LOCK`（`zenoh_source::tests`）串行化。3 连跑稳定
  （11 zenoh 测，193 总测全绿）。

### 未做（明确 deferred）

- `telencephalon` FrameSource 的 `zenoh://` scheme 分发——视频/视觉帧走
  zenoh 是独立需求（当前主线是数值传感器遥测，已由 IngestSource 覆盖）；
  需要时按 `RtspFrameSource` 同套路加 ~100 行
- zenohd router + storage plugin 组网部署（单机 peer 模式已验证够用）
- 叶区 lobe 侧再注册一个 agent 工具——`zenoh_query` 已在 MCP invoke 面上，
  叶区 agent 直接用该面即可，无需重复造工具

### 现有依赖链影响

diencephalon 新增 zenoh 会传导到依赖它的 crate（telencephalon / prefrontal /
移动端 Cargo 图）。已验证：telencephalon 编译通过；首次全量编译约 +7 分钟。
若后续需要「无 zenoh 构建」，建议加 feature 门（zenoh 相关模块均独立，门控可行）。

### 部署验证 2026-10-16 (v2)

`mcp_http_server` + `zenoh_publish` 独立进程，5 个温度值 ×5 轮共 25 次发布：

| 模式 | 投递率 | 备注 |
| --- | --- | --- |
| 多播发现（默认 config） | 12/25 = 48% | 跨进程 multicast 不稳定（同进程 tests 100%） |
| 显式 endpoint `tcp/127.0.0.1:7448` | **25/25 = 100%** | 推荐生产模式 |

**端到端 5 测一验证路径**：
- `publisher.put(ambient_temp, 18.0)` ×25 → **ring buffer 25 entries**（avg 20.8 = (18+19.5+21+22+23.5)*5/25 ✓）
- MCP `zenoh_query` 返回 `(name=ambient_temp, kind=generic, samples=25)` JSON
- MCP `sensor_stats` 返回 `{length: 25, capacity: 1024, ...}`
- MCP `query` (DataFusion SQL) 返回 `MIN=18, AVG=20.8, MAX=23.5, N=25`
- `sensor_tail` 返回最后 N 个 `(ts_ms, value)` 对

生产推荐：`ZENOH_ENDPOINT` env 显式给两侧（丘脑 listen / 设备 connect），
避免依赖多播。设备组网时 `zenohd` 中转（单机 peer 不需要）。

**跨夜验证 2026-10-17**：5 温度值 ×5 轮 = 25 次发布，5 个进程重启
(新端口 7802/7449) → **25/25 (100%)**，SQL 算术一致（avg 25.5）。
prefrontal v13 (39 sessions) + telencephalon v6 (6 lobes) 跨夜运行
不需重启——zenoh 数据面 + A2A 协议栈两端独立存活。

**规则事件多进程 wire 化 2026-10-18**：rule fire 现在双出口——
1. in-process `broadcast::Sender<RuleEvent>`（temporal 同 binary 时）
2. zenoh pub `shadow/rule-event/<rule_id>`（temporal 独立进程时）
   payload = `synapse::notifications::RuleEvent` JSON（跨进程 schema
   契约定义在 synapse，字段漂移不可能）。

temporal 端 `spawn_wire_subscriber(buf, endpoint)` 订阅
`shadow/rule-event/**` → 反序列化 → 同一 NotificationBuffer（与
in-process 路径共用 dialog 管线）。部署形态二选一：
- **同进程**（shadow-desktop Tauri）：走 broadcast，零网络开销
- **跨进程**（temporal 独立服务）：走 wire，需要 zenohd 组网或同
  网段多播（`scripts/zenohd/start-router.sh`）

对应 commits：diencephalon `22ae77b`（pub 出口）+ temporal
`f59d16e`（wire consumer）。`iBLOC/rule-engine` 共享仓方案**取消**
（用户定调：不需要独立建仓，trait 稳定 + 各仓 impl 即可）。
