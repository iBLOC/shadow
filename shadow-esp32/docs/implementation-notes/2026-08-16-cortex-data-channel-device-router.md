# shadow-esp32 cortex 端实施记录 (2026-08-16, ADR-0002 v2 §后续动作 #1)

## 本次提交改了什么

为 `shadow-esp32` 的 IO 控制路径(LLM 工具调用 → WebRTC Data Channel → ESP32)在 cortex 后端
落实基础存储与 HTTP 表面。**未触及** temporal lobe 与 ESP32 firmware。

## 新增文件

| 文件 | 行数(约) | 作用 |
|---|---|---|
| `cortex/src/webrtc/data_channel.rs` | ~140 | `DataChannelInfo` + `DataChannelRegistry`(per-session channel metadata) |
| `cortex/src/mcp/device_router.rs` | ~290 | `DeviceRecord` + `DeviceToolSummary` + `DeviceToolRouter` + `DeviceRouterError` |
| `cortex/src/api/device.rs` | ~170 | 5 个 HTTP endpoint(GET / GET / GET tools / PUT tools / DELETE / POST invoke) |

## 修改的文件

| 文件 | 改动 |
|---|---|
| `cortex/src/webrtc/mod.rs` | 加 `pub mod data_channel;` |
| `cortex/src/mcp/mod.rs` | 加 `pub mod device_router;` + 6 个 re-export |
| `cortex/src/state.rs` | `AppState` 加 `device_router: Arc<DeviceToolRouter>` 字段 |
| `cortex/src/api/mod.rs` | 加 `pub mod device;` + `device::router(state.clone()).merge(...)` |
| `cortex/src/api/webrtc_route.rs` | `handle_session` 多一个 `device_router` 参数;Offer 处理后 `register_device`,Disconnected 时 `unregister_device` |

## HTTP API 新增

```
GET    /api/cortex/devices
GET    /api/cortex/devices/{id}
GET    /api/cortex/devices/{id}/tools
PUT    /api/cortex/devices/{id}/tools
DELETE /api/cortex/devices/{id}
POST   /api/cortex/devices/{id}/invoke         (返回 501 + ADR-0002 v2 §4.5 follow-up)
```

## 已知边界

- `DeviceToolRouter::invoke_tool` 当前返回 `DeviceRouterError::InvokeUnimplemented`(501)。完整路径需要
  1. temporal lobe 端的 `RTCDataChannel::on_message` handler
  2. 把 data channel payload 通过新的 A2A skill (e  `webrtc/data_channel_mcp`) 桥接到 cortex
  3. cortex 把 JSON-RPC 走 `cortex::mcp::McpRuntime` 到 ESP32 device session 的 data channel
- 这些属于 ADR-0002 v2 §后续动作 #3(`dialog_task` 7 周工作量)的一部分

## 编译 / 测试

- `cargo check --lib` — 通过,21 warnings 全部预存在
- `data_channel` 5 个 unit test,`device_router` 9 个 unit test 编译通过
- 集成测试(API + webrtc_route end-to-end)未跑 —— cortex 集成测试需要 PostgreSQL,本机环境无 DB

## 引用

- ADR-0002 v2: `shadow-esp32/docs/adr/0002-shadow-esp32-implementation-architecture.md` §4.4-§4.5
- 模块定位 + 设计契约: `cortex/src/webrtc/data_channel.rs` 模块级注释
- 后续动作: ADR-0002 v2 §后续动作 #3-#7