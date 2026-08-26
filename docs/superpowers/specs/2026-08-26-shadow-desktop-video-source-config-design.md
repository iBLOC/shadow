# Shadow-Desktop 视频源配置设计

**状态**: 草案 → 评审中
**日期**: 2026-08-26
**项目**: shadow-desktop (Layer 4 — Interaction)
**关联 Spec**:
- Spec #1（本文件）：发现 + 选择 + 同步本机 cortex
- Spec #2（后续 cycle）：cortext 路由（颞叶识别视觉问答 → A2A 调对端枕叶）
- Spec #3（后续 cycle）：枕叶 A2A skill（抓帧 → mage_vl 推理）

## 目标

让 shadow-desktop 用户能配置本机的 UVC 摄像头作为「视觉问答」输入源，
并把配置同步到本机 sidecar cortex，让本机的颞叶/枕叶知晓可用源。
该 spec 是分布式视觉问答链路的第一段——其他设备上的 cortex
可通过 A2A 调用本机枕叶完成视觉问答。

非目标：
- 不实现 cortex 路由（Spec #2）
- 不实现 A2A skill 与帧摄取（Spec #3）
- 不支持非 UVC 源（接口预留）
- 不支持移动端（flutter 走 MNN/Android Camera2，独立栈）

## 架构

```
┌──────────────────────────────────────────────────────────────┐
│ shadow-desktop (Tauri + React)                                │
│                                                              │
│  React: SettingsPage                                         │
│   └─ VideoSourcesCard (新增 shadcn Card)                     │
│        ├─ useEffect: enumerate_uvc                            │
│        ├─ useEffect: GET /api/cortex/video-sources            │
│        └─ actions: Add / Make active / Remove / Re-scan      │
│                                                              │
│  src-tauri/src/video_source.rs (新增)                       │
│   ├─ #[tauri::command] enumerate_uvc()                       │
│   ├─ #[tauri::command] probe_capabilities(device_id)          │
│   ├─ #[tauri::command] push_to_cortex(snapshot)               │
│   └─ #[tauri::command] sync_health()                         │
│                                                              │
│  stores/videoSourceStore.ts (新增 zustand)                  │
│   ├─ localStorage: shadow.videoSources.v1                    │
│   ├─ sync state: 'idle' | 'pushing' | 'stale'                │
│   └─ reconcile(localStorage, enumerate_uvc, cortex)          │
└──────────────────────────────────────────────────────────────┘
            │                                            ▲
            │  reqwest + X-Cortex-Admin-Token              │
            ▼                                            │
       ┌────────────────────────────────────────┐
       │ Local cortex :60080                    │
       │  new module: src/api/video_source.rs    │
       │                                        │
       │  GET /api/cortex/video-sources          │
       │  PUT /api/cortex/video-sources          │
       │   (+ reserved 501s for Spec #3 routes)  │
       │                                        │
       │  table: cortex_video_sources            │
       └────────────────────────────────────────┘
```

薄客户端原则（AGENTS.md）：
desktop 不直接处理摄像头像素；它只调用浏览器 `navigator.mediaDevices`
获得 deviceId+label，把这些元数据存进 cortex。**帧摄取是枕叶的工作**，
属于 Spec #3 范畴。

## 数据模型

### Postgres 表（cortex 侧，仅新表）

```sql
CREATE TABLE cortex_video_sources (
    id              TEXT PRIMARY KEY,             -- ULID; e.g. "vsrc_8x3k..."
    device_id       TEXT NOT NULL,                -- browser MediaDeviceInfo.deviceId
    label           TEXT NOT NULL,
    kind            TEXT NOT NULL DEFAULT 'uvc',
    serial          TEXT,                         -- NULL when device doesn't expose one
    transport       TEXT NOT NULL DEFAULT 'browser',
                                                -- 'browser' | 'tauri-rust' (reserved)
    capabilities    JSONB NOT NULL DEFAULT '{}'::jsonb,
    active          BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 任意时刻最多 1 行 active=true
CREATE UNIQUE INDEX cortex_video_sources_one_active
    ON cortex_video_sources (active) WHERE active;
```

部分唯一索引让 N-1 inactive + 1 active 成为不变量；
cortex 在 PUT 时先 SET active=false 后 SET active=true 以规避竞争。

### Wire shape（cortex ↔ desktop）

```json
GET /api/cortex/video-sources → 200
ETag: "v3"
{
  "sources": [
    {
      "id": "vsrc_8x3k...",
      "deviceId": "abcd...",
      "label": "Logitech BRIO",
      "kind": "uvc",
      "serial": "2073A5...",
      "transport": "browser",
      "capabilities": { "widths": [640, 1280, 1920], "frameRates": [30, 60] },
      "active": false,
      "createdAt": "2026-08-24T11:23:14Z",
      "updatedAt": "2026-08-24T11:23:14Z"
    }
  ],
  "activeId": "vsrc_8x3k...",
  "device": {
    "platform": "linux",
    "hostname": "ibloc-desktop",
    "cortexVersion": "0.5.0"
  }
}
```

### zustand store (desktop 侧)

```typescript
interface VideoSource {
  id: string;                   // mirrors cortex id
  deviceId: string;             // browser MediaDeviceInfo.deviceId
  label: string;
  kind: 'uvc';
  serial?: string;
  capabilities: SourceCapabilities;
  createdAt: number;            // epoch ms
  updatedAt: number;
}

interface VideoSourceState {
  catalog: Map<string, VideoSource>;   // keyed by deviceId
  activeId: string | null;
  available: Map<string, RawDevice>;   // keyed by deviceId (not yet added)
  sync: 'idle' | 'pushing' | 'stale';
  lastCortexSnapshot?: CortexVideoSourcesSnapshot;
  lastSyncAt?: number;
}
```

localStorage key: `shadow.videoSources.v1`
存储 `{ catalog, activeId }`（不含 `available` — 每次启动重新枚举）。

## API 表面

### Cortex routes（新增 `src/api/video_source.rs`）

| Method | Path | 用途 | Spec #1 状态 |
|---|---|---|---|
| GET | `/api/cortex/video-sources` | 全量快照（sources + activeId + device） | ✅ 实现 |
| PUT | `/api/cortex/video-sources` | 全量替换快照（If-Match ETag） | ✅ 实现 |
| GET | `/api/cortex/video-sources/{id}` | 单条 | 路由保留 → 501 |
| POST | `/api/cortex/video-sources/{id}/probe` | 触发 capability 探测 | 路由保留 → 501 |
| DELETE | `/api/cortex/video-sources/{id}` | 删除 | 路由保留 → 501 |

鉴权沿用既有 `X-Cortex-Admin-Token`（per `cortex/AGENTS.md`）。

错误码：

```
401  missing/invalid X-Cortex-Admin-Token
412  ETag mismatch — client should re-GET and retry
500  Postgres unreachable
501  route reserved for Spec #3 (not yet wired)
503  cortex is starting up
```

### Tauri commands（新增 `src-tauri/src/video_source.rs`）

```rust
#[derive(Serialize)]
struct RawDeviceInfo {
    device_id: String,
    label: String,
    kind: &'static str,    // "uvc"
    serial: Option<String>,
}

#[derive(Serialize)]
struct SourceCapabilities {
    widths: Vec<u32>,
    heights: Vec<u32>,
    frame_rates: Vec<u32>,
    probed_at: i64,
}

#[tauri::command]
async fn enumerate_uvc() -> Result<Vec<RawDeviceInfo>, CommandError>;

#[tauri::command]
async fn probe_capabilities(device_id: String) -> Result<SourceCapabilities, CommandError>;

#[tauri::command]
async fn push_to_cortex(
    app: AppHandle,
    snapshot: CortexVideoSourcesSnapshot,
) -> Result<CortexVideoSourcesSnapshot, CommandError>;

#[tauri::command]
async fn sync_health() -> Result<SyncHealth, CommandError>;
// SyncHealth = { reachable: bool, drift: 'in-sync' | 'pending' | 'diverged', error?: String }
```

错误码枚举：

```rust
enum CommandErrorCode {
    EnumerateFailed,
    PermissionDenied,
    ProbeFailed,
    CortexUnreachable,
    CortexAuthFailed,
    Cortex412,
    StorageQuota,
    UnsupportedPlatform,
}
```

Tauri 端不引入 `nokhwa`/`v4l2` 等原生捕获库——desktop 是薄客户端。
Tauri webview 复用 `navigator.mediaDevices`（WebKitGTK / WKWebView / WebView2
均提供）。此假设需在 web build 与 3 个 Tauri target 上各验证一次。

### Frontend（`src/lib/cortexClient.ts` 新增）

```typescript
async listVideoSources(): Promise<CortexVideoSourcesSnapshot>
async putVideoSources(
  snap: CortexVideoSourcesSnapshot,
  ifMatch: string,
): Promise<{ snapshot: CortexVideoSourcesSnapshot; etag: string }>
```

12 个 i18n key 加入 `videoSources.*`（zh-CN + en-US）：
`title`, `description`, `emptyNoDevices`, `permissionDenied`,
`cortexUnreachable`, `retrySync`, `makeActive`, `remove`,
`add`, `rescan`, `availableHeader`, `sourcesHeader`, `status`,
`activeBadge`, `serialUnknown`, `missingBadge`, `capabilities`,
`driftInSync`, `driftPending`, `driftDiverged`, `etagMismatch`.

## UX (SettingsPage)

新增 `VideoSourcesCard`，插入 SettingsPage 现有 sections 列表中
（在 Models 与 Network 之间）。所有 UI 元素使用 shadcn/ui
（`Card`, `Table`, `Button`, `Badge`, `Tooltip` per AGENTS.md）。

```
╔══════════════════════════════════════════════════════════════╗
║ Video Sources                                                 ║
║                                                              ║
║   Local video inputs the occipital lobe on this device can    ║
║   read. Other devices can route visual-QA requests here       ║
║   via A2A.                                                   ║
║                                                              ║
║   Status: ● synced with cortex   2 devices · 1 active         ║
║                                                              ║
║   ┌────────────────────────────────────────────────────────┐ ║
║   │ Device                       Capability      Active    │ ║
║   ├────────────────────────────────────────────────────────┤ ║
║   │ ● Logitech BRIO              1920×1080@60fps  ★ active  │ ║
║   │    serial 2073A5                                       │ ║
║   │   [ Make active ]  [ Remove ]                          │ ║
║   ├────────────────────────────────────────────────────────┤ ║
║   │   FaceTime HD Camera         1280×720@30fps             │ ║
║   │   serial unknown                                      │ ║
║   │   [ Make active ]  [ Remove ]                          │ ║
║   └────────────────────────────────────────────────────────┘ ║
║                                                              ║
║   Available but not added:                                    ║
║   • Trust Webcam (20634)                       [ + Add ]      ║
║   • USB2.0 PC Cam                              [ + Add ]      ║
║                                                              ║
║   [ ↻ Re-scan devices ]                                      ║
╚══════════════════════════════════════════════════════════════╝
```

## 错误处理 & 边界情况

| Case | Behavior |
|---|---|
| 浏览器拒绝 `getUserMedia` | 显示 "Grant access" CTA；不自动重试。点击后重枚举。 |
| 设备无 USB serial | `serial: null`；UI 显示 "serial unknown"；deviceId 在浏览器会话内可用（重启后失效）。 |
| 浏览器重启后 `deviceId` 变化 | 同一物出现在 "Available but not added"；用户重新 Add；cortex 老条目保留为 "Missing"（红色 Badge）。 |
| push 时 cortex 不可达 | 本地 state 立即更新；`sync='stale'`；banner "last sync 12 min ago"；自动 30s 重试 + 手动 [ Retry sync ]。 |
| 412 ETag 不匹配 | 弹 diff modal：「cortex 已变 — 重读后重试？」，用户点 Reload 拉新 ETag 后再 PUT（**不做自动合并**）。 |
| 设备使用中（`NotReadableError`） | probe 返回空 capabilities + probe_failed 标记；UI 显示 "busy?" + Retry。 |
| WebKitGTK < 2.40（无 gstreamer） | enumerate_uvc 抛 `UnsupportedPlatform`；banner 提示；不在本 spec 修。 |
| Web SPA build（无 Tauri） | enumerate_uvc 直接走 `navigator.mediaDevices`（Tauri command 在 web build 下是 thin shim）。 |
| localStorage 配额满 | Snackbar 警告；in-memory 继续工作；提示"下次重启会丢"。 |
| 刚启动 cortex，PUT 还没就绪 | cortex 返回 503；Tauri command 返回 `CortexUnreachable`；UI banner。 |
| 5 个源移除到剩 1 个 active | 允许；PUT 提交 1 行的 list + active。 |
| 跨设备共享同一设备 | 不可能——deviceId 是 per-OS session。 |
| cortex 重启丢 cortex_video_sources 表 | desktop localStorage 是权威；下次 sync 时 PUT 重建。 |

## 测试

### Rust (cortex)

```rust
#[cfg(test)]
mod tests {
    // src/api/video_source.rs
    async fn get_returns_empty_on_fresh_db();
    async fn get_returns_seeded_snapshot();
    async fn put_inserts_and_activates_one();
    async fn put_with_stale_etag_returns_412();
    async fn put_without_admin_token_returns_401();
    async fn put_with_concurrent_active_swaps_only_one_active();
    async fn delete_route_returns_501();
    async fn probe_route_returns_501();
    async fn single_get_route_returns_501();
}

#[tokio::test]
async fn e2e_roundtrip() {
    let app = boot_test_cortex().await;
    // GET → empty
    // PUT 2 sources + active one
    // GET → match
    // PUT with stale ETag → 412
    // PUT without token → 401
}
```

### Rust (Tauri command) — 极薄，主要覆盖 client 错误映射

```rust
#[test]
fn push_to_cortex_returns_412_on_etag_mismatch() {
    let mut server = mockito::Server::new();
    // mock PUT → 412, assert returned CommandError::Cortex412
}
```

### React (vitest)

```
src/stores/videoSourceStore.test.ts
  hydrate_from_localStorage_on_init
  merge_avoids_duplicates_with_same_deviceId
  active_pointer_is_atomic_across_make_active_calls

src/lib/cortexClient.putVideoSources.test.ts
  sets_x_cortex_admin_token_from_existing_cortexAdminToken_helper
  sets_if_match_header
  parses_new_etag_from_response
  throws_typed_error_on_401
  throws_cortex_412_error_with_body_for_diff_ui

src/components/business/VideoSourcesCard.test.tsx
  renders_empty_state_when_no_devices
  renders_active_and_inactive_rows_correctly
  make_active_calls_push_to_cortex_with_correct_payload
  412_from_cortex_opens_diff_modal
  rescan_updates_available_list
  localStorage_roundtrip_across_reload
```

### Playwright e2e

```
e2e-tests/video-sources.spec.ts
  --use-fake-ui-for-media-stream
  --use-fake-device-for-media-stream
  /settings → VideoSourcesCard → empty state
  mock enumerate_uvc → 2 fake devices
  click Add → row appears
  mock cortex PUT/GET
  click Make active on the other → only one active; cortex received updated PUT
  reload → state persisted
```

### 跨平台手测（不在 CI）

```
pnpm dev           # vite dev (browser, no Tauri)
pnpm tauri dev     # Tauri native
pnpm build:web && pnpm preview:web
```

每个 build 走通 Add → Make active → Remove → Re-scan 流程；验证
`navigator.mediaDevices` 在该 platform 上不抛 TypeError。

## 范围外但保留扩展点

- **非 UVC 源**：`kind` 字段、`transport` 字段保留枚举扩展位（`screen`、
  `ip-camera`、`file`、`hls`），Spec #3+ 加 adapter 即可，无需改 Spec #1
  的数据模型。
- **Rust 端捕获**：Tauri command 不调用 `nokhwa`/`v4l2`；若未来 OS-level
  capture 需要，`transport='tauri-rust'` 字段已预留。
- **Cap probe deep**：当前 `probe_capabilities` 只读 widths/heights/frameRates；
  未来可加 color format / pan-tilt-zoom / MJPEG / H264 hints。
- **跨用户配置同步**：cortex 当前是 per-device，不做云端同步。若未来需要
  Resonance 跨设备同步，是另一个 spec。

## 风险 & 后续

1. **deviceId 会话作用域**：浏览器权限撤销 / 重启后 deviceId 变化，老条目
   变 "Missing"。Tooltip 必须显式提示用户。
2. **capabilities 探测副作用**：`probe_capabilities` 内部短时打开
   MediaStream 读 track settings 然后立即 stop。某些 Linux 摄像头驱动
   会因此暴露 LED；UI tooltip 提示。
3. **cortex 路由依赖本 spec** 的数据：Spec #2 路由决策会读
   `cortex_video_sources.active` 与 `device` block。如果 Spec #1 字段
   命名变了，Spec #2 需调整——commit 时两者须同步。
4. **OpenZiti 网络**：Spec #2 才涉及；本 spec 仅用 `X-Cortex-Admin-Token`
   与 localhost cortex 通信。
5. **macOS Continuity Camera**：iPhone 透过 macOS 暴露为 UVC 设备时，
   `label` 会变化（"iPhone"），deviceId 也可能变。这是设计接受的边界。
6. **设备权限差异**：iOS Safari 不支持 `enumerateDevices`（必须先
   getUserMedia 一次）。本 spec 仅 Android/desktop 范围。

## 关联 Spec 占位

- **Spec #2 (cortext 视觉问答路由)** — 后续 cycle。
- **Spec #3 (枕叶 A2A skill + mage_vl 帧摄取)** — 后续 cycle。
- **Spec #4 (预留: 非 UVC 源 adapter)** — 进一步后续。
