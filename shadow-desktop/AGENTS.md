**Updated:** 2026-11-02 (㋱ **「端脑换实例 ⇒ 桌面端静默重建会话 ⇒ 模型上下文被静默清零」** —— 承父仓㋫ 条里那条**只到读源码**的桌面端同族缺陷（松散子串判错误类型 ⇒ 静默重试 ⇒ 失败长得像成功），本条把它变成**真浏览器里跑出来的读数**：真 React 代码 ＋ 真 HTTP ＋ 真 SSE ＋ 真 localStorage。)
① **⚠️ 病（为什么它是「失败长得像成功」）**：桌面端发送重试（`src/pages/ConversationPage.tsx:578`）用**五个松散子串**判「这是不是会话错误」：`session` / `not found` / `invalid` / `expired` / `conversation` ⇒ 命中且是第一次尝试 ⇒ `setSessionId(id, '')` ⇒ **静默重建** ⇒ `continue` ⇒ ⇒ **第一次失败被吞掉** ⇒ ⇒ 界面**零异常** ⇒ ⇒ 而模型那边已经换了一个**空会话**。
② **✅ 真机读数（浏览器形态，Chromium 151）**：**23 条断言 / 0 红 / EXIT=0**（四模式）—— `live` 6 过（正控：认识会话 ⇒ 不重建，服务端历史轮数 = 3，模型说「记得」）／ `notfound` 8 过（主案：404 ⇒ **换了会话 id**（`stale-session-xyz` → `srv-1`）⇒ **服务端历史轮数 = 0** ⇒ 模型明说「看不到你前面说过的话」⇒ **界面没有报错**）／ `substring` 5 过（反向验证）／ `other` 4 过（同族更坏）。
③ **⭐ 上下文被清零是「界面看得见」的证据，不是推断**：替身端脑给每个会话数轮次，并在 SSE 里回报「服务端这一轮看到的历史轮数」⇒ ⇒ 那句回复**本身就是服务端视角**（界面上写着「（服务端这一轮看到的历史轮数：0）我这边看不到你前面说过的话。」）⇒ ⇒ 同时**旧消息仍在界面上** ⇒ ⇒ 用户以为上下文还在，模型其实已经失忆。
④ **✅ 反向验证（判据有分辨力）**：① **把响应体的 `conversation not found` 换成不含那五个子串的句子** ⇒ ⇒ 读数**翻转**（不重建 ⇒ 界面报错）⇒ ⇒ 说明判据盯的是那个行为，不是恒绿；② **把 `isSessionError` 拆成恒 false**（临时改，**验完按哈希逐字还原**：`C57DE0C1…`）⇒ ⇒ 主案**恰好 5 条红**、正控与反向验证**仍全绿** ⇒ ⇒ 断言承重。
⑤ **⚠️⚠️ 同族更坏的一条**：`other` 模式＝**500 + `conversation service unavailable`**（**根本与会话无关**的故障）⇒ ⇒ 照样命中 `conversation` 子串 ⇒ ⇒ 照样静默重建 ⇒ ⇒ **上下文照样被清**、界面照样零异常 ⇒ ⇒ 「松散子串」不只是「会话失效时误判」，而是**任何提到 conversation 的错误都会清掉模型上下文**。
⑥ **⚠️ 边界（必须说清）**：① **浏览器形态 ≠ Tauri 真机窗口** ⇒ 读数只覆盖「客户端这一侧」，Tauri 那一侧仍未验；② 跑的是 **生产构建**（`vite build --mode web`）⇒ ⇒ 那一次 404 **不会**弹全局错误框（`lib/httpInterceptor.ts` 只在 `import.meta.env.DEV` 或 `?debug=1` 时装）⇒ ⇒ 「界面零异常」在**真实用户形态**成立；③ 替身端脑是**宿主端的假端脑** ⇒ 验的是客户端（路由 → 真 client → 真 HTTP → 真 404 → 真重建 → 真控件树 → 真浏览器屏幕）。
⑦ **📄 复跑办法（已入库）**：`shadow-desktop/scripts/prove-session-loss-silent-reset.mjs --all`（+`scripts/session-loss-stub.mjs` 替身端脑）⇒ ⇒ 每次自己 `vite build` ⇒ ⇒ 跑的是当前代码；产物在 `artifacts/desktop-session-loss/<mode>/`（含界面文字、截图、替身端脑逐条记账）。
⑧ **⚠️ 还欠的（且有三个产品决定未拍板）**：① **修法归产品/同伴**：要不要对用户说「上下文被重置了」？② 「五个松散子串」要不要换成**确切形状**（状态码/错误码）？③ 端脑换实例时**客户端能不能提前知道**（而不是事后靠 404 猜）？⇒ ⇒ 这三条**本轮只取证、没改产品代码**。
⑨ **✅ 顺带量到的一条（2026-11-08 已收口 ⇒ 见父仓 `AGENTS.md` ㏄ 条）**：`lib/prefrontalClient.ts` **曾** 在**模块加载时**就 `new PrefrontalClient(prefrontalUrl())` ⇒ `setBaseUrl` ⇒ ⇒ **它会覆盖掉 localStorage 里用户配的端脑地址**（store 的 `onRehydrateStorage` 随后又同步给 client）⇒ ⇒ 地址的真相源其实有**两处**，而**模块加载顺序**决定谁赢 ⇒ ⇒ 本实验因此**不能**靠 localStorage 预置地址 ⇒ 只能靠 `VITE_PREFRONTAL_URL` 指过去 ⇒ ⇒ **真相源已并成一处**（store 的 `connection.baseUrl`）⇒ ⇒ 现在**可以**靠 localStorage 预置地址了（真浏览器读数：用户配的那台收到全部流量、构建期那台**零请求**；同一脚本只退回那一个文件重跑 ⇒ **读数翻转** ⇒ user=0/build=4 ⇒ ⇒ 断言承重）。

⑩ **✅ 桌面端旧方言清理（2026-11-08 已收口 ⇒ 见父仓 `AGENTS.md` 㐇 条）**：peer 注册失败以前被 `.catch(() => {})` 吞掉、然后**编造**一个 `reachable: true` 的 peer 加进列表（失败长得像成功）⇒ ⇒ 现在失败就失败、**说出来**、**不许**进列表；peer 列表读失败以前显示「未发现节点」的空态（**读不到 ≠ 没有**）⇒ ⇒ 现在说「读不到」＋带出原因，**空态只在真的读到空列表时出现**；错误呈现＝**上下文（译文）＋ 原因（原文）两者都在**（不再把裸 `HTTP 404` 甩给用户）；`agentStore.fetchAgents`（打旧的 `/api/agents`、且会**静默覆盖**用户自建的 custom agents、无调用方）**删掉**，`PrefrontalClient.listAgents/getAgent` 同删 ⇒ ⇒ 端点对照表 **154 → 152 条**（18 differs → 16 differs）；读数：vitest **147 文件 / 1393 passed / 1 failed**（唯一那条红＝**在飞**的 `accent.g.ts` 生成物漂移，不归本刀）、`tsc --noEmit` **EXIT=0**、两个对话框 **44 条全过**（含 4 条新增纪律断言）＋ **反向验证两轮**（退回旧组件 ⇒ 3 红；注入「失败也照样编造 peer」⇒ 那条单独红）⇒ ⇒ 断言承重。

⑪ **✅ 「失败长得像成功 / 读不到 ≠ 没有」第二刀（2026-11-08 已收口 ⇒ 见父仓 `AGENTS.md` 㐉 条）**：`stores/videoSourceStore.ts` 的推送以前是 `.catch(() => {})` ⇒ ⇒ PUT 失败被吞、`sync` 仍是 `'idle'` ⇒ ⇒ `VideoSourcesCard` 的徽章显示**「已同步」**（界面与端脑说的不是一回事）⇒ ⇒ 现在失败 ⇒ ⇒ `sync='stale'` ＋ 记下**原始原因**（新增 `syncError`），成功 ⇒ ⇒ `'idle'` ＋ 时间戳；`pages/DocumentPage.tsx` 以前读失败是 `.catch(() => setEvents([]))` ⇒ ⇒ 渲染成「No events recorded for this session.」（**读不到被说成没有**）⇒ ⇒ 现在**说「读不到」＋原因**，那个「没有事件」的文案只在**真的读到空列表**时出现，报告读失败也有**明确的一行**；读数：vitest **149 文件 / 1398 passed / 1 failed**（唯一那条红＝**在飞**的 `accent.g.ts` 生成物漂移，不归本刀）、`tsc --noEmit` **EXIT=0**、新增 **5 条**测试全过 ＋ **反向验证**（两个源文件退回旧版 ⇒ **3 条纪律断言变红**、**2 条孪生仍绿**）⇒ ⇒ 断言承重。

⑫ **✅ 「失败长得像成功」闸已落地（2026-11-08 ⇒ 见父仓 `AGENTS.md` 㐎 条）**：新增 `scripts/check-failure-masking.mjs` —— 五条**形状**判据（R1 `.catch(() => {})` / R2 吞成标量 / R3 吞成空数组 / R4 读失败⇒渲染成空 / R5 空 catch 块），判据跑在**剥掉注释**的文本上（注释里的字样不算命中）＋ **债务清单 9 条**（每条写清 why / when）＋ **自检 14/14**（每条规则都有正控 ＋ 孪生 ＋ 判定逻辑三条）⇒ ⇒ 读数：扫 **266** 个源文件、落点 **10 处** ⇒ ⇒ **绿**；已接进 CI（「Brain gates」job 两步，YAML 闸 6 文件全过）⇒ ⇒ ⚠️ 落点里 **4 条是真缺陷**（`RecordingPanel` 报告读失败 / `ResonancePage` 复制失败被吞 / `HfTokenSettings` 读 token 失败静默 / `telencephalonStore.refreshFlows` 空 catch）⇒ ⇒ **下一刀逐个修**，每修一处 ⇒ ⇒ 从债务清单**销账**（闸会红着提醒）⇒ ⇒ 清单**只会变短**。

⑬ **✅ 「失败长得像成功」族销账 1/4（2026-11-08 ⇒ 见父仓 `AGENTS.md` 㐏 条）**：`stores/telencephalonStore.ts` 的 `refreshFlows` 以前是 `catch { }` ⇒ ⇒ 读失败 ⇒ 列表空着、**连错误都不记** ⇒ ⇒ 界面说「没有流程」（**读不到被说成没有**）⇒ ⇒ 改成**记错误**（与同 store 的 `refreshLobes`/`checkHealth` 同款）＋ 成功时清空 `error`；新增 **2 条**测试全过 ＋ **反向验证**（退回旧版 ⇒ 两条全红）⇒ ⇒ **闸的销账机制第一次实战跑通**：修好后命中消失 ⇒ ⇒ 闸红 ⇒ ⇒ 从债务清单删掉那一条 ⇒ ⇒ 闸回绿（**9 → 8 条**）⇒ ⇒ 剩下 **3 条**真缺陷（`RecordingPanel` 报告读失败 / `ResonancePage` 复制失败被吞 / `HfTokenSettings` 读 token 失败静默）⇒ ⇒ 下一刀逐个修 ＋ 逐个销账。

# PROJECT KNOWLEDGE BASE

**Updated:** 2026-11-02 (㋰ **「桌面端不再自己管供应商 —— 它管的是大脑真正在用的那份」** —— 承父仓㋰ 条与端脑仓㋯ 条（用户拍板「云端供应商、本地模型、agent、mcp 等等都由大脑直接提供接口，两端保持一致」），本条记**`provider_manager.rs` 整文件改成薄代理**、**旧注册表的一次性导入**、**单测**与**读数**。)
① **✅ `src-tauri/src/provider_manager.rs` 整文件重写为薄代理**（19 KB）：`brain_base()` = `http://{telencephalon_http::DEFAULT_ADDR}`（127.0.0.1:60080）＋ `brain_headers()` 递 `x-admin-token`（**一把** ⇒ 读门与写门都开；⚠️ 绝不塞空串 —— 空串与空串相等 ⇒ 等于把门骗开）＋ `brain_get/post/put/delete`（**错误原样带出**）＋ 纯函数 `entry_from_brain` / `derive_standard` / `entries_from_brain` / `legacy_to_add_body` / `ids_present`（⇒ 单测能直接钉形状）＋ `provider_presets()` **直接读 `synapse::providers::catalog`**（⚠️ `ProviderPreset` 的字段是 `&'static str` ⇒ 只能由那份**静态目录**构造 ⇒ 而大脑那个端点回的**正是同一份** ⇒ ⇒ **一个来源、零漂移**）⇒ ⇒ **12 个命令的名字与返回类型一字未改** ⇒ ⇒ 前端 `ProvidersPage.tsx` **零改动**。
② **✅ 旧本地注册表一次性导入**：条件 = 本机还没导过（标记文件）⇒ ⇒ **逐条幂等**（同 id 跳过）⇒ ⇒ **失败可重试**（标志只在真干完之后才置位）⇒ ⇒ 导完**不删**旧文件 ⇒ ⇒ `new_manager()` 保留（只作旧文件的读取源）⇒ ⇒ **`lib.rs` 一个字节不用动**。
③ **⚠️⚠️ 顺带修掉一处「失败长得像成功」**：大脑回的**不是 JSON** 时，错误原本只有一句「形状不对：expected value at line 1 column 1」⇒ ⇒ 真原因（存储错误 / schema 过期）被换掉了 ⇒ ⇒ 现在错误里**带上大脑的原话**（`大脑回的形状不对：…（大脑原话：…）`）—— 与移动端那次「先读文本 ⇒ 是 JSON 就解析 ⇒ 不是就把服务端那句话原样说出来」是同一条纪律。
④ **✅ 单测（13 条）**：`cargo test --lib provider_manager` ⇒ **13 passed / 0 failed**（9 条纯函数：base_url 别名 / api_base 回落 / api_standard 派生 / 大脑说的赢过派生的 / 旧数据没 enabled ⇒ 默认启用 / 没 key ⇒ None 而不是空串 / 默认模型来自目录 / 旧配置导入带真 key / 列表形状不对 ⇒ 报错而不是空列表；**4 条对着「假大脑」跑真链路**：大脑的原话进错误 / 非 JSON 的回带出大脑原话 / 按预设加**只发 key**（不自己编 base_url 与模型列表）/ 大脑不在要说「连不上大脑」）⇒ ⇒ ⚠️ **反向验证**：把「大脑原话」那段退回原样 ⇒ ⇒ **恰好 1 条红** ⇒ ⇒ 断言承重、不是恒绿。
⑤ **⚠️⚠️ 顺带修掉一处「桌面端单测一直没人跑过」**：`src-tauri/src/config_manager.rs:235`（`684be0f`，今天 00:05）把 `ConfigManager` 的 `update_hippocampus_data_dir` 当成 `AppConfig` 的方法调 ⇒ ⇒ **`cargo test --lib` 整个编不过** ⇒ ⇒ 改 1 行（直接设字段）才跑得出上面这些 ⇒ ⇒ **教训**：仓库里「有测试」不等于「测试跑得起来」。
⑤ **⚠️ 还欠的**：**桌面端那 10 分钟周期刷新仍挂在旧的本地管理器上**（`src-tauri/src/lib.rs:297-302`，**在飞文件** ⇒ ⇒ 本轮没碰）⇒ ⇒ 它刷的是**没人读**的那份 ⇒ ⇒ 周期刷新要搬进端脑；**`ProviderCard.tsx:68` 用 `model.enabled` 判状态，而 `ModelSummary` 没有这个字段** ⇒ ⇒ 徽章恒为 offline（界面在说谎，未处理）；**真机 UI 未验**。

**Updated:** 2026-11-02 (Cortex 清干净 ＋ **收尾**：闸升级成「白名单 ＋ 上下文限定」＋ video-sources 三方归一 —— 见文末「STATE STATUS (2026-11-02, Cortex 清干净的**收尾** —— 闸从「词级白名单」升级成「白名单 ＋ 上下文限定」，顺带修掉 video-sources 的三方三种写法)」)**Project:** shadow-desktop (Layer 4 — Interaction)
**Sprint-2 status:** ✅ MCP management wired through cortex — AgentsPage per-card binding panel + bind modal + 12 new cortexClient methods + 18 i18n keys. 10 AgentsPage + 10 chartbi + 20 lib vitest tests passing. TypeScript clean. **Post-audit-cycle (2026-09-24/25)**: recording mode R1-R4 closed, MCP catalog 5×28 + transport-aware MCPPage, Workflow Studio v1 (R-12/R-13), subsystem management panel client, cortex sidecar replaced with embedded encephalon. Companion E2E assessment: [`../../docs/superpowers/architecture/2026-09-25-e2e-coverage-assessment.md`](../../docs/superpowers/architecture/2026-09-25-e2e-coverage-assessment.md).

## ARCHITECTURAL ROLE

Shadow-Desktop is the **Interaction Layer** (Layer 4) of the Shadow Platform 4-layer architecture. It is a **thin UI client** that talks to:

- **Agent Layer** (Prefrontal) via OpenAI `/v1/*` and A2A protocols
- **Engine Layer** (optional, when bundling local models) via OpenAI `/v1/*`

**Reference**: `/home/ibloc/Projects/docs/superpowers/specs/2026-06-04-shadow-architecture-redesign.md`

## KEY PRINCIPLE: THIN CLIENT

The desktop app should NOT directly know about LLM/TTS/ASR internals. It only:
1. Sends user input to Agent (OpenAI `/v1/chat/completions` or A2A)
2. Receives streamed responses (SSE / WebSocket)
3. Plays TTS (via browser `Audio` element from `/v1/audio/speech` response)
4. Captures mic audio (WebRTC for Companion Mode)
5. Renders UI (React 19 + Tauri 2)

## UI COMPONENTS

**必须优先使用 shadcn/ui 组件**，避免自行实现基础 UI 功能。详见 `UI_COMPONENT_SPEC.md`。

已安装的 shadcn/ui 组件：Button, Input, Textarea, Label, Select, Dialog, AlertDialog, Tabs, Badge, Card, Progress, Skeleton, Separator, Toast (Sonner), Tooltip, Popover, Dropdown Menu, Command, Table, Calendar, DatePicker 等。

## STRUCTURE

```
shadow-desktop/
├── src/                          # TypeScript frontend (React 19)
│   ├── App.tsx                   # Root
│   ├── main.tsx                  # Entry
│   ├── pages/                    # Routes
│   │   ├── ConversationPage.tsx  # Includes CompanionModePanel (WebRTC)
│   │   ├── AgentsPage.tsx
│   │   ├── SettingsPage.tsx      # Models section = provider CRUD + LocalEnginePanel
│   │   ├── SetupPage.tsx
│   │   ├── MCPPage.tsx
│   │   ├── MemoryPage.tsx
│   │   ├── SkillsPage.tsx
│   │   └── TaskBoardPage.tsx
│   ├── components/
│   │   ├── AppInitializer.tsx
│   │   ├── Layout.tsx
│   │   ├── DatabaseSettings.tsx
│   │   ├── business/             # Business components
│   │   └── ui/                   # Reusable UI primitives
│   ├── stores/                   # Zustand stores
│   │   ├── companionModeStore.ts # NEW: WebRTC companion state
│   │   ├── conversationStore.ts
│   │   ├── agentStore.ts
│   │   ├── resonanceStore.ts
│   │   └── ...
│   ├── lib/                      # Utilities
│   │   ├── webrtcCompanion.ts    # NEW: RTCPeerConnection + WebSocket signaling
│   │   ├── prefrontalClient.ts   # OpenAI-style HTTP client
│   │   └── ...
│   ├── i18n/
│   ├── hooks/
│   └── types/
└── src-tauri/                    # Tauri 2 backend (RUST — Layer 3 host)
    ├── src/lib.rs                # Prefrontal embedding + window mgmt
    └── Cargo.toml
```

## INBOUND PROTOCOLS (calls Prefrontal)

All HTTP calls go to standard endpoints. **No custom Tauri invoke for chat!**

```typescript
// LLM Chat (streaming)
POST {host}/v1/chat/completions
  body: { model, messages, stream: true }
  returns: SSE

// TTS
POST {host}/v1/audio/speech
  body: { model: "tts-1", input: "Hello", voice: "alloy", response_format: "mp3" }
  returns: audio/mpeg

// ASR (when needed)
POST {host}/v1/audio/transcriptions
  body: multipart { file, model: "whisper-1" }
  returns: { text }

// Sessions
POST {host}/api/sessions
GET  {host}/api/sessions/{id}

// WebSocket streaming
WS {host}/api/sessions/{id}/ws

// WebRTC (Companion Mode)
POST {host}/api/sessions/{id}/webrtc/offer  → { sdp: answer, ice: ... }

// Agent discovery
GET  {host}/.well-known/agent.json  → A2A AgentCard

## CORTEX-SPECIFIC ENDPOINTS (Sprint 1)

> **DEPRECATED 2026-09-22:** the cortex sidecar has been replaced by the
> embedded `encephalon` crate (at `C:/Projects/iBLOC/encephalon/`) — see
> the rewrite in `src-tauri/` (`Cargo.toml`, `src/lib.rs`, `src/video_source.rs`).
> The Rust backend now boots an in-process `Encephalon` + `diencephalon::Thalamus`
> in `setup()`; the old `cortex_manager.rs` sidecar spawner is deleted.
> This **frontend** cortexClient still hits the listed `/api/cortex/*` HTTP
> endpoints, which **do not currently exist** on the in-process encephalon.
> A follow-up PR must either (a) add an HTTP surface to encephalon mirroring
> these routes, or (b) rewrite cortexClient.ts to call Tauri commands instead.
> Until then the corticalAgent MCP UI is non-functional.

The actual runtime talks to **Cortex**, not Prefrontal. The cortexClient in `src/lib/cortexClient.ts` is the canonical caller for everything except chat/TTS/ASR (which still go through `prefrontalClient.ts` against the cortex `/v1/*` shim).

```typescript
// AgentsPage surface (Sprint 1)
GET    /api/cortex/agents                  → list installed lobes (Native + Wasm + Prompt + External)
POST   /api/cortex/agents/scan            → probe 6 external CLIs (opencode, claude-code, codex, openclaw, aider, continue)
POST   /api/cortex/agents/sync/{provider_id} → promote scan row → LobeKind::External
GET    /api/cortex/agents/discover        → A2A-shaped discovery payload
GET    /api/cortex/agents/search?skill=&q= → lexical agent search (desktop AgentsPage search bar)
GET    /api/cortex/agents/mirror?limit=N  → raw hippocampus Dimension::Agent memory rows

// Admin (requires CORTEX_ADMIN_KEY)
POST   /api/cortex/admin/agents/create         → pure-prompt agent with system_prompt
POST   /api/cortex/admin/agents/install        → base64 / URL WASM upload
GET    /api/cortex/admin/agents/installed      → list installed WASM with sha256 + size
DELETE /api/cortex/admin/agents/{name}/{version} → uninstall WASM (cleans up filesystem mirror)
POST   /api/cortex/admin/agents/generate-description → LLM-backed description generator

// MCP surface (Sprint 2 — wasm-only transport)
GET    /api/cortex/mcp/servers                  → McpServerList (id, name, wasm, state, tools)
GET    /api/cortex/mcp/servers/{id}/tools       → live McpToolSummary[] (lazy fetch)
GET    /api/cortex/mcp/agents/{name}/servers    → bindings for an agent
GET    /api/cortex/mcp/agents/{name}/tools      → flattened tools across all bindings
POST   /api/cortex/admin/mcp/servers            → register (name + wasm ref + sha256)
DELETE /api/cortex/admin/mcp/servers/{id}       → uninstall (cascade bindings)
POST   /api/cortex/admin/mcp/servers/{id}/start → run JSON-RPC initialize + tools/list
POST   /api/cortex/admin/mcp/servers/{id}/stop  → state=Stopped
POST   /api/cortex/admin/mcp/agents/{name}/servers/{id}  → bind
DELETE /api/cortex/admin/mcp/agents/{name}/servers/{id}  → unbind

// Chat stream surface (Sprint 1 ChatBI)
POST   /shadow/v1/conversations/{id}/messages:stream → SSE stream; payload may carry ChartPayload (viz_type + columns[] + rows[][])

// Subsystem management surface (Sprint 3 — 3-tier auth)
cortexClient.thalamus.listSensors()                  → GET /api/cortex/thalamus/preview/sensors
cortexClient.thalamus.getStats(name)                 → GET /api/cortex/thalamus/preview/sensors/{name}/stats
cortexClient.thalamus.tail(name, limit)              → GET /api/cortex/thalamus/preview/sensors/{name}/tail?limit=N
cortexClient.thalamus.query(template, sensor, limit) → POST /api/cortex/thalamus/preview/query
cortexClient.thalamus.register({name, kind, capacity}) → POST /api/cortex/thalamus/manage/sensors
cortexClient.thalamus.deregister(name)              → DELETE /api/cortex/thalamus/manage/sensors/{name}
cortexClient.thalamus.updateConfig(name, {capacity}) → PUT /api/cortex/thalamus/manage/sensors/{name}/config
cortexClient.hippocampus.stats()                    → GET /api/cortex/hippocampus/preview/stats
cortexClient.hippocampus.recent({layer, dimension, limit}) → GET /api/cortex/hippocampus/preview/recent
cortexClient.hippocampus.consolidator()             → GET /api/cortex/hippocampus/preview/consolidator
cortexClient.hippocampus.graphNode(nodeId)          → GET /api/cortex/hippocampus/preview/graph/{node_id}
cortexClient.neuron.models()                         → GET /api/cortex/neuron/preview/models
cortexClient.neuron.stats()                           → GET /api/cortex/neuron/preview/stats
cortexClient.issueSubsystemToken(scopes, ttlSeconds) → POST /api/cortex/admin/token (via Tauri command cortex_issue_subsystem_token)
```

Discovery is centralised in `src/lib/cortexClient.ts`. Stale data in the desktop is *not* modelled — every read goes through cortex with `refreshLobes` on a 5s polling interval. Fetching more than a polled refresh (e.g. after a write) calls the affected method directly.
```

## mDNS SERVICE DISCOVERY

On startup, browser uses WebRTC mDNS or HTTP-based discovery to find nearby Prefrontal instances:

```typescript
// mDNS query for _shadow._tcp services
// then for each found service, GET /.well-known/agent.json
// display in settings UI: "Found Agent: home-server.local:8082"
```

## COMPANION MODE (WebRTC)

The `webrtcCompanion.ts` service uses:
- `RTCPeerConnection` (browser native) for peer connection
- `WebSocket` to `ws://{host}/api/sessions/{id}/ws` for signaling (SDP/ICE)
- Microphone via `navigator.mediaDevices.getUserMedia`
- Opus codec (auto-negotiated)
- Audio playback via `<audio>` element

## CONVENTIONS

- React 19 with TypeScript
- Zustand for state management
- React Router 7
- i18next + react-i18next
- Zod for validation
- NEVER use Tauri invoke for chat — always HTTP
- Tauri only for OS-level (window, tray, notifications, fs)

## MODEL MANAGEMENT CONSOLIDATION (added 2026-08-23)

- **SettingsPage is the only home for model management.** Its Models section (`ModelsSection`) now covers: cloud provider CRUD (per-row Edit/Delete buttons + `AddProviderModal` in add or edit mode via `initialProvider`/`initialType` props), and local engine models via `components/business/LocalEnginePanel` (type tabs, neuron `/v1/models` list, download queue with job polling, install/release, source-repo download dialog — ported verbatim from the deleted ModelsPage).
- **Deleted as deprecated:** `pages/ModelsPage.tsx`, `pages/ProvidersPage.tsx`, `pages/ModelDownloadPage.tsx`, `stores/modelDownloadStore.ts`. Routes `/models`, `/models/download`, `/providers` removed from `App.tsx`.
- **Provider constants live in `src/lib/cloudProviders.ts`** (`CLOUD_PROVIDER_TYPES` + `DEFAULT_API_BASE`), shared by SettingsPage; `AddProviderModal` resolves its base URL via `prefrontalUrl()` (no more hardcoded `:60080`).
- **`AppInitializer.MODEL_SETUP_PATHS = ['/settings', '/setup']`** — `/settings` must stay in this whitelist or users without models loop between `/onboarding` and `/settings` forever. `ModelOnboardingPage` navigates to `/settings`.
- Provider edit/delete backend: cortex `PUT/DELETE /models/providers/{id}`; client methods `cortexClient.updateProvider/deleteProvider`.
- Tests: ModelsPage-exclusive test files deleted; `tests/e2e/setup-lifecycle.test.tsx` platform mock now exports `prefrontalUrl`.

## DEFAULT ROUTE & TTS PLAYBACK (added 2026-08-23)

- **Default entry** is `ConversationPage` (`<Route index element={<ConversationPage />} />` in `App.tsx`). `TaskBoardPage` is reachable via `/tasks` but no longer the index.
- **TTS playback** of agent responses lives in `src/lib/tts.ts` (wraps `openaiClient.speech()` + browser `HTMLAudioElement` + per-text audio cache). Triggered automatically when an assistant message is added (skipped for ChatBI chart payloads to avoid noisy narration). User can disable via the TTS toggle in the conversation header; preference persists in `localStorage` (`shadow.tts.enabled`). Per-message Volume2/VolumeX buttons let the user replay or stop the current playback. Architecture follows the synapse-first standard: TTS request goes through `OpenAIProvider::chat`-style abstraction (`openaiClient.speech` is the wrapped OpenAI client).

## BUILD COMMANDS

```bash
pnpm dev                  # Vite dev (Tauri) on :1420
pnpm dev:web              # Vite dev (web SPA) on :5173
pnpm build                # tsc -b && vite build
pnpm build:web            # Web SPA build → dist-web/
pnpm preview:web          # Serve the built web SPA on :4173
pnpm tauri dev            # Tauri dev with hot reload
pnpm tauri build          # Production native bundle
pnpm test                 # Vitest
pnpm lint                 # ESLint over src/
pnpm test:tauri           # Wdio Tauri E2E (full stack — auto-xvfb on Linux)
pnpm test:tauri:headed    # Wdio Tauri E2E without xvfb (use existing display)
pnpm test:tauri:reuse     # Reuse already-running Tauri + cortex
pnpm test:tauri:spec      # Run a single spec file
```

### Tauri Wdio E2E (full stack)

Runs the actual Tauri WebView shell + cortex sidecar via the W3C
WebDriver protocol exposed by `tauri-plugin-wdio-webdriver` at
port 4445. Use for testing platform-specific features (system tray,
IPC, native dialogs) and the cortex-sidecar launch path.

State reset between specs hits `POST /api/cortex/admin/test/reset`
(see `cortex/src/api/test_reset.rs`). Single worker (`maxInstances:1`)
because of `tauri-plugin-single-instance` — bypass env var
`TAURI_TEST_NO_SINGLE_INSTANCE=1` is set by `global-setup.ts`.

The cortex sidecar receives test-specific env vars via
`SHADOW_CORTEX_CONFIG` (YAML file with `LANCE_URI`, etc.) —
`cortex_manager.rs` loads this file and merges
into the cortex child process env. Production behavior is unchanged
when `SHADOW_CORTEX_CONFIG` is unset.

## BUILD TARGETS

The same `src/` produces **two artefacts**:

| Command | Output | Run-time |
|---|---|---|
| `pnpm build` → `pnpm tauri build` | `src-tauri/target/release/bundle/...` | Native binary (Linux/macOS/Windows) |
| `pnpm build:web` | `dist-web/` | Static SPA — host on Vercel / Netlify / S3 / GitHub Pages |

`src/lib/platform.ts` is the single source of truth for which target is in use. Tauri-only calls go through `src/lib/tauriSafe.ts::safeInvoke()` which returns `null` on the web build.

## STATE STATUS (2026-09-02, post-supervisor)

**Completed** ✅ (since 2026-09-02):
- **Cortex sidecar supervisor** (commit `cd84a71`) — `cortex_manager.rs` now respawns the cortex sidecar on unexpected exit. Backoff schedule is 1s → 2s → 4s → 8s → ... → 30s, capped at 5 consecutive failures before parking the manager in `Error` state. User-initiated `stop()` disables the supervisor so a deliberate shutdown is never undone; toggleable at runtime via `cortex_set_supervision`. Frontend wired in SettingsPage with `supervisor` state on `cortexStore` and 6 new i18n keys (`supervisor` / `supervisorEnabled` / `supervisorDisabled` / `supervisorHelp` / `restartCount`). 4 unit tests on the supervisor lifecycle + 1 unit test on `check_process_alive_when_no_child_is_none`. **45 lib tests pass.**

> **⚠ Sidecar replaced** — `be50b7f` (2026-09-23) removed `cortex_manager.rs` entirely; the Tauri shell now boots an in-process `Encephalon` + `diencephalon::Thalamus` in `setup()`. The supervisor lifecycle block above describes the intermediate state — see the CORTEX-SPECIFIC ENDPOINTS note at line 104+ for the runtime-truth on what the embedded mode actually exposes.

## STATE STATUS (2026-09-25, post-audit-cycle)

**Completed** ✅ (since 2026-09-23 audit; 39+ commits):

### Recording mode R1-R4 (commits `a1e3509` → `afa8d60` → `3600166` → `0390379` → `965bc15` → `ec467b7`)
- `a1e3509` — design spec for 录音/录像记录模式 (recording mode)
- `de0913e` — R1: data model + Tauri commands (`recording_start/stop/status/events/list/report`)
- `8520c31` — lobe ownership rule: 音频 → 颞叶, 视觉 → 枕叶
- `afa8d60` — RecordingPage UI + repair corrupted i18n JSON
- `3600166` / `30d7f59` — temporal-lobe audio pipeline + occipital-lobe video pipeline
- `0390379` / `856621c` — recording summary + LanceGraph edges (R4) + neuron-backed adapters
- `965bc15` / `ec467b7` — 4-lobe split: pipelines moved to lobe repos, deps repointed at real GitHub homes
- **e2e gap**: no Playwright/WDIO test exercises `RecordingPage` or any `recording_*` command (see E2E assessment §2.1)

### MCP catalog 5×28 + transport-aware MCPPage (commits `ccae5ce`, `1c0c3ec`, `5679021`, `f02ba35`)
- 5 built-in servers × 28 tools, runtime registry via `src-tauri/src/mcp_catalog.rs`
- Transport-aware add form: stdio / http / wasm
- Button import fix from UI lib (not lucide-react)
- Duplicate StatusBadge import removed
- **e2e gap**: `tests/e2e-ui/mcp.spec.ts` is page-smoke only; no test for `add_server / remove_server / builtin_servers` runtime

### Workflow Studio v1 — R-12/R-13 closure (commit `4023493`)
- Drag-drop workflow editor; backend lives at `telencephalon/apps/editor` (originally `cerebellum/apps/editor`, commit `b4730e2`; moved to the telencephalon on 2026-10-14, after which the `cerebellum` concept was retired)
- `93f4ef9` — WorkflowStudio syntax + Univer locale/core deps for dev runtime
- **e2e gap**: zero Playwright/WDIO/tauri-driver spec references Workflow Studio

### Computer Use R-10/R-11 (commits `84418a2`, `9c46327`, `c37b163`, `b5743fc`)
- 11 `cu_*` Tauri commands (`cu_screenshot`, `cu_mouse_click/move/scroll`, `cu_keyboard_type/combo`, `cu_set/get_enabled`, `cu_list_ui_elements`, `cu_click_ui_by_name`, `cu_read_ui_text`, `cu_set_ui_value`)
- ComputerUsePage in nav
- Windows UI Automation surface (4 Windows-only cu_* commands)
- Preview-before-commit modal
- **e2e gap**: zero coverage of any `cu_*` command

### Document productization DOC-01..05 (commits `2bb8932`, `90878db`, `00c43fc`, `d7d1466`, `8bbc260`, `2aa0d3b`, `37feb88`, `1cb6ba2`)
- `<UniverSheet>` component + `/document/:taskId` route
- Feishu MCP bridge + open-lark backend + feishu_mcp Tauri module
- FeishuPublishedCard wired into chat
- Feishu Settings toggle
- UniverSheet i18n wired
- Per-task result management with local git
- Scenario doc DOC-01..05

### Browser-use R-08/R-09 (commits `b834d20`, `858f0df`)
- WebviewWindow per-task replaces iframe preview
- PreviewButton in TaskDetailDialog + PreviewsPage in nav

### AudioEventChip R-01 (commit `c08da1d`)
- R-11 SSE schema + UniverSheet i18n — closes UI/UX audit R-01

### History tab R-04/05 (commit `f246c31`)
- TaskDetailDialog History tab — closes R-04/R-05

### Build fixes (commits `cc1b787`, `2fee8eb`, `73b4cda`, `8f01cde`, `89e478b`)
- ziti-sdk patch + dep-graph + API-drift compile fixes
- vitest component tests + smoke script + pre-push checks
- `@univerjs/core` 0.6.10 lock + pnpm lock update
- Univer locale imports → default (CJS interop)

### Recording R1-R4 in detail
- `src-tauri/src/recording/mod.rs` defines `RecordingStore` with `start_session`, `add_event`, `summarize`
- 6 Tauri commands registered in `src-tauri/src/lib.rs`
- `RecordingPage.tsx` mounted under `/recording` route
- Voiceprint enrolment wired into `hippocampus::voiceprint` (server-side, commit `6aea5e1`)

## STATE STATUS (2026-07-13, post-Sprint-2)

**Completed** ✅ (since 2026-07-13):
- **MCP management UI** (commits `0109bad`-precedent, `40ba82e`, `445df73`) — `MCPPage` and AgentsPage's per-card binding panel both read from the cortex admin API (no more browser-local mcpStore for MCP). 12 new methods on `cortexClient` (listMcpServers / create / delete / start / stop / bind / unbind / etc.) plus McpServerRecord / McpToolSummary / McpAgentBinding / McpServerList TS types matching the cortex wire format. AgentsPage now shows a McpBindingsPanel below each InternalAgentCard with truncated server_id chips that unbind on click, plus a 'Bind MCP' button that opens a per-agent modal showing currently-running servers not yet bound. 18 new i18n keys (mcpTitle / mcpStart / mcpStop / mcpBind / etc.) added to both zh-CN and en-US.
- **WASM fs-mirror + agent search bar** (commits `0109bad`) — Already in Sprint 1.

**Completed earlier** ✅:
- **ChatBI frontend** (commits `acc45be`, `f1e8e31` followup) — ConversationPage parses `ChartPayload` from cortex SSE and renders `ChartCard` via `echarts-for-react`; chartRegistry builds ECharts option per `VizType`. `isChatBiPayload` guard at `src/lib/chatbi/guards.ts`. 10 chartbi tests passing.
- **Agent search bar** (commit `0109bad`) — full-width Find-Agent panel above the internal section: skill filter + text query backed by `cortexClient.searchAgents({skill, q})`. Skill filter is exact; text is case-insensitive substring across name / description / skills / url.
- **Generate-description wired through cortex** (commit `b4f1f2c`) — replaced inline `openaiClient.chatCompletions({model:"gpt-4o-mini"})` in CreateCustomAgentModal with `cortexClient.generateAgentDescription(systemPrompt)`. Errors surface in a red banner; 503 → "Cortex LLM not configured".
- **WASM install UI** (commit `82f5494`) — AgentsPage WASM section between Custom and External. Lists installed binaries with size/sha/source badges. Delete per row. Refresh button. Disabled-when-cortex-stopped empty state. Cortex stores these in Lance `cortex_wasm_binaries` and mirrors to `${CORTEX_WASM_DIR or exe_dir}/wasm_modules/`.
- **Sprint 1 backend alignment** — fixed pre-existing flow-agent.rs test compile errors (`FlowContext`/`FlowError` imports) and one agent_management.rs route that used axum 0.7 `:name` syntax (axum 0.8 wants `{name}`).

**Completed earlier** ✅:
- React 19 + Tauri 2 foundation
- Zustand stores for all entities (with Sprint 1 selector-pattern refactor to avoid Maximum-update-depth loop)
- PrefrontalClient (HTTP) with `/v1/*` standard + `/api/*` Prefrontal-specific methods
- New `lib/openaiClient.ts` typed wrapper for OpenAI /v1/* (chatCompletions, speech, transcriptions, listModels)
- ConversationPage with text chat
- **CompanionModePanel (WebRTC)** — `lib/webrtcCompanion.ts` + `stores/companionModeStore.ts` (VAD-driven, barge-in, multi-turn)
- **Discovery page** (`pages/DiscoveryPage.tsx`) — mDNS browser, manual add, active node, localStorage persistence
- i18n (zh-CN + en-US) — 100+ keys across chatbi / install / search / HF token / ngrok URLs etc.
- mDNS service discovery (HTTP-based via Prefrontal `/api/discovery/*`)
- **Tauri invoke migration** — `agentStore.fetchAgents()` now uses `prefrontalClient.listAgents()` over HTTP instead of `invoke('prefrontal_list_agents')`
- A2A-ready: HTTP client can talk to `/api/a2a/peers` for cross-service agent delegation
- **Lance-only storage** — hippocampus now ships with Lance as the single backend (no Postgres / pgsql UI or embedded binary). See commits `b4939e5`–`8e590b8` for the cleanup.
- **FlowsPage i18n** — "Cortex Flows" → "思维定式"
- **ResonancePage** — 独立共鸣管理页面，支持多实例配置、主实例设置、Agent 开放选择
- **AgentsPage unified** — Cortex & Lobe 合并入智能体页面，所有 lobe 视为内部智能体，支持为内部智能体设置模型
- **ModelOnboardingPage** — 应用启动时通过 neuron API 检查模型配置，若无可用模型则跳转引导页。下载由 neuron 后端处理（`POST /v1/models/pull`），用户可在下载期间自由导航

**Planned** 📋:
- Tauri Rust backend → embed Prefrontal core (drop in-process, no separate service)
- Finish SetupPage Tauri invoke migration (needs Rust HTTP endpoints for secure_auth + model_storage)
- Cross-device session transfer
- A2A peer card in Discovery page (promote a discovered node to a delegatable A2A peer)
- 思维定式编辑能力 — 用户可修改已抽象的流程
- Resonance 连接测试 — 实际 HTTP 连接检测 + 延迟测量
- 后端持久化 — lobe 模型绑定保存到 cortex/agent.json

## STATE STATUS (2026-10-30, 客户端工具执行回路)

**Completed** ✅:

- **客户端工具（client tools）—— 端脑让这台设备干的活** ——
  `src/lib/clientTools.ts` + `src/components/chat/ToolCallMessageCard.tsx`。
  端脑的工具分两种：**端脑本地工具**（`telencephalon::tools`，改端脑自己的
  状态）与**客户端工具**（改**用户眼前这台设备**的状态 —— 主题色、明暗、
  窗口、剪贴板、通知）。**两端各有一份注册表** —— **能做什么由设备决定**：
  手机没有窗口可最小化，桌面端没有麦克风权限可申请。
  - `ClientTool`（名字 / 说明 / 要不要用户点头 / `collectsInput` 要不要先收
    输入 / 字段声明 / 真正干活的 `execute`，**抛异常 = 执行失败**）+
    `ClientToolRegistry`（工具名 → 工具）+ `parseToolArgs` + `parseHexColor`；
  - 内置两个工具：`set_theme`（`color` → 换主题色，`dark` → 切明暗）与
    **`ask_user`**（模型反问用户 —— `collectsInput: true`，先渲染
    `ClientToolForm` 收答案再执行）。**`ClientToolForm` 那个骨架终于有消费方
    了**（以前是零消费方）。
  - 主题色的两端色调由 `styles/accent.g.ts` 的 `deriveAccentTones` 派生
    （与移动端 `app_colors.dart` **同一套算法**）—— 两端算出来的明暗两端色调
    必须一致，否则「模型让手机换主题」换出来的颜色和桌面端对不上。
- **执行回路**（`pages/ConversationPage.tsx`）—— 端脑只负责**点名**（工具名 +
  参数），真正干活的是这台设备，干完再把结果回传端脑
  （`telencephalonClient.reportToolResult`）—— 端脑把它喂回模型，模型才知道
  「主题已经换好了」，否则模型会一直等一个不来的结果。端脑点了一个这台设备
  不会的活 ⇒ **明确失败并回传**，不闷着不吭声。
- **⚠️ 认错的代价很具体**（三处都写在代码注释里）：① `args` 线上有两种形态
  （端脑的 `ToolCall.args` 是 `String` ⇒ 序列化出来是 JSON 文本；有些路径传
  的是已经拆好的 map）⇒ 拿到字符串还当对象用 ⇒ 参数全是空的，「把主题换成
  靛蓝」会退化成「换成默认色」，而且**看不出哪里错了**；② 端脑的 `tool_call` 事件**现在带 `tool_call_id`**
  （uuid）⇒ 两端把它回传，端脑按 id 对上号（老端脑没有才自己合成）；③ 工具在本地跑成了 **≠** 端脑知道了 ⇒ 两端要
  分开显示（否则「本地换了主题、端脑那头模型还在等」会被看成成功）。
- **客户端工具的 JSON Schema（2026-10-30 补）** —— `ClientTool.parameters`
  （JSON Schema，独立于 `fields`）+ `toOpenAiTools(registry)` 导出成 OpenAI
  function-calling 数组，随 `SendMessageRequest.tools` 发给端脑。
  - **为什么必须有**：没有它，模型只知道有 `set_theme`，**不知道它要一个
    `color` 还是 `dark`** ⇒ 只能瞎猜，或者干脆不调。
  - **⚠️ `parameters` 与 `fields` 不是一回事**：`fields` 描述**输入框**（UI
    变体），`parameters` 描述**参数**（JSON Schema）⇒ 各管各的。
  - **⚠️ 两端同名工具必须导出同样的内容** ⇒ **两端测试各自断言同一份字面量**
    （桌面 `src/lib/__tests__/clientTools.test.ts` / 移动
    `shadow-mobile/test/unit/client_tool_registry_test.dart`）⇒ **任一端漂移
    则该端测试立刻变红** —— 跨仓没有共享运行时，这是唯一可行的保证方式。
  - **`color` 与 `dark` 都不是必填** —— 给哪个都算一次合法调用；两个都不给时
    工具**明确失败**而不是默默什么也不做。
  - **端脑今天还不认识 `tools` 这个字段** ⇒ serde 默认忽略未知字段 ⇒ **带上
    无害** ⇒ 客户端可以先发，等端脑接上即生效。
  - **⚠️ 两条桌面端的路必须给模型看**同一份工具清单**：`pages/ConversationPage.tsx`
    （现役）与 `lib/aiSdkTelencephalonTransport.ts`（AI SDK 适配器，**今天零消费方**）
    —— 后者原先**不带** `tools` ⇒ 一旦被接上就是「同一个模型、同一个问题，走哪条路
    决定模型能不能调 `set_theme`」，而这个差异在界面上**完全看不出来**。
    现在两条路都是 `toOpenAiTools(desktopClientTools)`（**同一个来源**），
    并由 `src/lib/__tests__/aiSdkTransportClientTools.test.ts`（3 条）锁住。

**修掉一个真 bug**：`parseHexColor` 对 `#AARRGGBB` 取的是**前** 6 位（把 alpha
当成了红通道）⇒ `#FF71717A` 会变成 `#FF7171`（蓝通道错了）。新写的测试把它
逮住了，已改成 `slice(2)`（丢的是 alpha）。

**验证**：`npx tsc --noEmit` **EXIT=0**（TypeScript clean）；`npx vitest run` ⇒
**114 个测试文件 / 1161 passed / 2 skipped / 0 failed**（本轮 **+5** ——
`src/lib/__tests__/clientTools.test.ts` 现有 16 条：参数两种形态、非 JSON 不丢
调用、数组不当参数表、颜色归一化与「不猜」、注册表查找，外加 `toOpenAiTools`
5 条：导出形状 / `set_theme` 的 **schema 字面量（跨端契约）** / 两个都非必填 /
无 schema 时空参数表 / 空注册表）。

**⚠️ 闭环通了一半**：端脑的**接收端路由已经补上** ——
`POST /shadow/v1/conversations/{id}/tool-results`（`telencephalon/src/api/shadow.rs`）
⇒ 结果**记进会话历史**（agent 角色 + `[tool_result] ` 前缀）⇒ 下一轮模型看得见
「我调过这个工具、结果是什么」；`tool_call` 事件**现在带 `tool_call_id`**（端脑
生成的 uuid）⇒ 同一轮里同名工具调两次也分得清。**还差的是叶区 `call_llm` 带
`tools`** —— native 叶区今天既产生不了工具调用、也接不了工具结果 ⇒
「模型自己决定调客户端工具」目前**只对外部 A2A 对端成立**。
⚠️ **客户端这边已经把 `tools` 发过去了（但还是惰性的）** —— 桌面端与移动端
现在都随消息把**这台设备能跑的客户端工具**（含 JSON Schema）发给端脑
（`SendMessageRequest.tools`）⇒ **端脑今天还不认识这个字段**（serde 忽略未知
字段 ⇒ 带上无害）⇒ **端脑那侧接上之前，模型看不见这些工具**。

---

## STATE STATUS (2026-10-31, A2UI 桌面端接入)

**Completed** ✅:

桌面端现在能消费端脑的 A2UI 产出面（`POST {baseUrl}/a2a`）⇒
**两端连的是同一张服务端画出来的界面** ⇒ 跨端契约的 fixture
（`shadow/fixtures/a2ui/`）有了**第三个消费者**。

- **⚠️ 第一件事是把「硬约束」与「我的判断」分开** ——
  能力清单 `agent-surface.json` 的 `a2ui.desktop` 原先写着
  「更划算的是让现有那套渲染（`ToolPartRouter` / `ClientToolForm` /
  `ToolCallMessageCard`）接受 A2UI 的数据模型，而不是再实现一遍协议栈」。
  **本轮没有照做**，而是**在 TypeScript 里另写了一份协议栈**。拆开看：
  - **(a)「再实现一遍协议栈」在桌面端是硬约束** —— `genui` / `genui_a2ui` 是
    **Flutter 包**（Dart），桌面端是 React/TS + Tauri ⇒ **进程里没有 Dart
    运行时** ⇒ 那套栈在桌面端**一行都跑不了**（`package.json` 里也确实没有
    `genui` 依赖）⇒ **不是选择**。
  - **(b)「不复用现有那套渲染」才是我的判断** —— 现有那套吃的是 **AI SDK 的
    `UIMessage` part 形状**、长在**聊天消息列表**里；而 A2UI surface 是
    **另一条链路**（自己的 surface id、自己的组件树、自己的 `POST /a2a`
    请求，**不是一条消息**）⇒ 要复用就得让**消息 store** 学会
    「有一类东西不是消息」⇒ **代价** = 多维护一份协议栈（~250 行 TS），
    **收益** = 两种模型不搅在一起。
  - ⇒ ⚠️ **这一片因此偏离了清单的建议**（清单已改写成如实描述）。
    **若将来 A2UI surface 要内联进对话流**，那时才该合并，
    而不是继续维护两份。

- **落地了什么**（`shadow-desktop/`）：
  - `src/lib/a2uiProtocol.ts`（新）—— **纯协议**：SSE 分帧、A2UI 载荷抽取、
    surface 模型。**不碰网络、不碰 React**（协议能被单独测）。
  - `src/lib/a2uiClient.ts`（新）—— `POST {baseUrl}/a2a` + `X-Shadow-Key` +
    `X-A2A-Extensions` + **流式** SSE 读取。
  - `src/components/chat/A2uiSurface.tsx`（新）—— 只画端脑**实际会发的 4 种**
    组件（`Column` / `Text` / `TaskCard` / `AgentStatusIndicator`）；
    **未知组件类型降级成占位**（新版大脑不能把旧版桌面端白屏）。
  - `src/components/chat/A2uiPanel.tsx`（新）—— 加载 / 空 / 错误 / 就绪 四态
    + 视图切换。
  - `src/pages/ConversationPage.tsx`（改）—— **只改这一个干净文件**
    （一个按钮 + 面板挂载）。
  - `src/i18n/{en-US,zh-CN}.json`（改）—— 新增 `a2ui.*` **4 个** key
    （`i18next/no-literal-string` 是 **error** ⇒ 诊断文案必须进 i18n）。
    ⚠️ **加在文件末尾**而不是 `surface` 段旁边 —— 那两个文件**正被并行会话改着**
    ⇒ 追加在末尾 + 用**唯一锚点**编辑 ⇒ 冲突时是**响亮地失败**而不是静默覆盖。

- **⚠️ 四个「照抄协议，不自作主张」**：
  1. **两段式语义** —— `surfaceUpdate` 只**缓存**、`beginRendering` 才**渲染**
     ⇒ 不会画出「组件还没到齐」的半成品；
  2. **载荷位置** —— `result.status.message.parts[]` 里 `kind === "data"` 的 part；
  3. **扩展声明走请求头** —— `X-A2A-Extensions: https://a2ui.org/a2a-extension/a2ui/v0.8`
     （与移动端自造 transport 时的 `authHeaders` 同一个常量）；
  4. **状态 / 优先级显示协议原值而不翻译** —— 移动端也是这么做的
     ⇒ **两端对同一个 surface 的读法不会分叉**。

- **⚠️ 三个「我的判断」**：
  1. **视图用 `metadata.a2ui.view` 显式指定**，不靠关键词匹配 ——
     关键词会被用户文案带偏（用户说「我的日程」就不命中「任务」）；
  2. **「空」与「失败」分开** —— 端脑对「这次没有可渲染的视图」的回答是
     **一段纯文本**、**不是错误** ⇒ 面板把**大脑的原话**显示出来，
     而不是笼统的「无数据」（那样会把大脑说了什么藏起来）；
  3. **未知组件类型不抛异常**。

- **⚠️ 钥匙没有新开通道** —— 面板的钥匙来自 `telencephalonClient.getApiKey()`
  ⇒ **与桌面端现有的 `/shadow/v1/*` 请求同源同值** ⇒ 不会出现
  「A2UI 带了钥匙、其它请求没带」的分叉。
  ⚠️ **既有缺口（非本片引入）**：桌面端**没有**输入 shadow key 的界面
  （store 有 `connection.apiKey`、会持久化、rehydrate 时会补设，
  `IdentityPanel.tsx:43` 在读它，但**没有设置入口**）⇒ 若端脑配了 key 而
  客户端手里没有 ⇒ 面板 **401**（面板会**明说**）⇒ **这一格对桌面端所有请求
  都一样**，不是本片欠的。

**验证**：

- 新测试 **15 条**（协议 5 + 客户端 3 + 渲染 4 + 面板 3）**全绿**；
- **反向验证四连**（每一条都精确对应一处故意破坏，其余断言仍绿）：
  ① 拆掉 `X-Shadow-Key` 注入 ⇒ **恰好 1 条红**；
  ② 让 `surfaceUpdate` 也能渲染 ⇒ **恰好 1 条红**；
  ③ 把载荷路径改成 `result.message.parts` ⇒ **恰好 6 条红**
  （**4 条不依赖抽取的仍绿**）；
  ④ 把判环守卫退回「全树已见集合」（**忠实复刻旧写法**）⇒ **恰好 1 条红**
  ⇒ ⇒ **断言有分辨力、不是整片红**；
- ⚠️ **第 ④ 处对应一个真缺陷**：第一版的判环用「全树已见集合」
  ⇒ **同一个组件被引用两次时，第二次会整个消失**（用户莫名少一块界面）
  ⇒ **已改成祖先路径**（每层一份拷贝）⇒ 重复引用**照画两次**、
  自引用仍被截断（不会爆栈）⇒ **这条是写测试时才发现的，不是读代码时想到的**；
- 桌面端**全量** `vitest run` ⇒ **120 个测试文件 / 1209 passed / 2 skipped /
  0 failed**（基线 119 文件 / 1194 passed，**+1 文件 / +15 条**）；
- `tsc --noEmit -p tsconfig.json` **EXIT=0**；`eslint`（6 个改动文件）**EXIT=0**；
- `vite build --outDir dist-a2ui-verify` **EXIT=0**（`✓ built in 19.95s`）
  ⇒ 打完已用可恢复删除清掉；
- `node scripts/check-agent-surface.mjs` ⇒ **阻断 0 / 提示 0**（⚠️ 中途**短暂**出现过
  2 条提示 —— 那是**并行会话**新登记的 `a2ui` / `identity` 两个能力的 `labelKey`
  在**移动端 ARB** 里还没补上 ⇒ 已被他们的 `5ebd5a4` 补齐
  ⇒ **不是本片引入**：本片**没新增能力、没动任何 labelKey**）。
- ⚠️ `node scripts/validate-i18n-keys.mjs` **EXIT=1**，但那 **260 条缺失全是
  既有缺口**（`identity` / `computerUse` / `subsystem` / `preview` / `voice` /
  `questionnaire` …）⇒ 本轮用到的 **11 个 key 逐个核对，全部在两份 i18n 里存在**。

⚠️ **还欠的**：

- **桌面端从未对着一个活的端脑跑过** —— 测试喂的是**录下来的**端脑字节
  （`fixtures/a2ui/tasks_sse.txt`）。
  ⚠️ 但「桌面的端脑真的提供 `/a2a`」**可静态证明**：桌面 sidecar 起的是
  `telencephalon::api::build_full_app`（`src-tauri/src/cortex_http.rs:212`）
  ⇒ 包着 `build_with_conversation_store` ⇒ 而 `telencephalon/src/api/mod.rs:99`
  在那张 router 上 merge 了 `a2ui_gateway::router` ⇒ **`/a2a` 与那道 shadow
  key 门都在** ⇒ **还差的是「桌面客户端真的把界面画出来」那段运行时证据**；
- **设备端（ESP32）零 A2UI** ⇒ ⇒ **已定：不是欠账**（ESP32 只是**输入设备**，2026-11-01 用户定）；
- 界面文案本地化（服务端出的 chrome 仍是英文）—— 桌面端这侧**本地化只覆盖了
  诊断文案**，组件内容是服务端给的原文。

## STATE STATUS (2026-10-31, 桌面端 admin 钥匙不再常量)

**这一档**：桌面端递给端脑的 admin token **不再是那个常量**。

- **⚠️ 原来的洞（两条叠起来）**：
  - 端脑有一条后门：`verify_admin_token` 里
    `if expected == "dev-admin-key" { return Ok(()); }` ⇒ expected 恰好是那个
    **源码里的字面量**时，**连请求头都不看**就放行；
  - 而桌面端递进去的 expected **恰好就是** `dev-admin-key`
    （旧的 `desktop_admin_token()` 的默认值）⇒ ⇒ 桌面端的 admin 面
    **任何请求都过**；
  - 再叠加端脑面的 `CorsLayer::permissive()`（任意 origin 可跨域、**能读到
    响应**）⇒ ⇒ **浏览器里任意一个网站**都能往用户的大脑里插一个它自己写的
    叶区（`POST /api/telencephalon/admin/agents/create`）＝ 往模型面前插一条
    自己写的路。
  - 端脑那一刀在 `telencephalon` 仓（`src/security/api_key.rs`）⇒ 本仓是
    **另一半**：得有真钥匙可递。
- **做了什么**：
  - 新增 `src-tauri/src/admin_token.rs` —— **环境变量 → 持久化文件 → 首次生成
    一把随机的**（32 字节 ⇒ hex 64 字符）⇒ 每台安装一把自己的、猜不到的；
    持久化位置 `<配置目录>/shadow/admin.key`；Unix 下 `0600`；
    **绝不打日志**（只报长度与来源）；进程内用 `OnceLock` 缓存 ⇒ sidecar 与
    前端命令拿到的**是同一把**；
  - 新增 Tauri 命令 `get_admin_token` ⇒ 前端拿得到那把钥匙；
  - 新增 `src/lib/adminToken.ts` —— Tauri 走 sidecar，web 走
    `localStorage['shadow-admin-token']` ⇒ **拿不到就 `undefined`**；
  - `telencephalonClient.request()` 统一带上 `X-Admin-Token`；
  - `issueSubsystemToken` 里那个 `?? 'dev-admin-key'` **字面量删掉**
    （它打进前端产物 ⇒ 从来不是秘密 ⇒ 而端脑曾对它「认任何人」）。
- **⚠️ 一条设计取舍**：**没有钥匙就不带那个头**（不塞占位值）⇒ 因为**空的
  `X-Admin-Token` 在旧实现里与空串 `ct_eq` 相等 ⇒ 等于带对了** ⇒ 宁可不带
  （端脑回 401 且说人话）。
- **⚠️ 契约套件跟着改**（`tests/api-contract/*`）：admin token **只从环境变量
  来**（`SHADOW_TEST_ADMIN_TOKEN`）⇒ 没有就**跳过** admin 类探测并说清原因
  ⇒ 以前那个字面量默认值让套件在默认安装下**不带凭据也能过** ⇒ 等于没测。
- **验证**：`cargo check --lib` **EXIT=0**；`tsc --noEmit` **EXIT=0**；
  全量 `vitest run` ⇒ **121 文件 / 1216 passed / 6 skipped / 0 failed**
  （基线 120 / 1209 ⇒ **+1 文件 / +7 条**）；端脑侧 `--lib` **617 passed**、
  端到端 **5 passed**、跨域取证 **2 passed**；项目静态闸
  `scripts/check-auth-backdoors.mjs` ⇒ **4 → 0**。
- **✅ 反向验证**：去掉客户端的 header 注入 ⇒ **恰好 2 条红**（断言「带上了」
  +「两个域」），另 2 条（「没有就不带」）仍绿；端脑放回那条后门 ⇒ **恰好 1 条
  红**（其余 13 条仍绿）；端脑让 providers 的掩码失效 ⇒ **恰好 2 条红**
  （写回那条仍绿 —— 它测的是回写逻辑，本就不依赖掩码）。
- **⚠️ 新测试当场抓到一个真 bug**：JS 里 `'   '` 是 **truthy** ⇒ 「
  `if (adminToken)`」这个判据太松 ⇒ **空白值会被当成一把钥匙发出去** ⇒ ⇒
  改成「trim 之后还剩东西吗」。
- **⚠️ 本机跑不了桌面端的 Rust 单测**（既有环境限制，非本档引入）：
  dev-dependency `neuron` ⇒ `lance` ⇒ `lance-encoding` 的 build script 需要
  **`protoc`**（本机没有）⇒ ⇒ 改用 `rustc --test` **单编那个模块** ⇒
  **4 passed** ⇒ ⇒ 至少证明 `#[cfg(test)]` 那段**编得过、跑得过**。
- **⚠️ 还欠的**：`CorsLayer::permissive()` **没收**（这张面同时是 webview 的
  目标 ⇒ 收它要带 allowlist）；`/models/providers` **仍零鉴权**（端脑仓改成
  掩码了 ⇒ 密钥不再出网，但「删光供应商」仍可做 ⇒ 加门归 router 层那一档）；
  独立端脑服务器现在**默认 admin 面关着**（没配 `TELENCEPHALON_ADMIN_KEY`）
  ⇒ 桌面端若指向它，两边要用**同一个**环境变量。

## STATE STATUS (2026-11-01, A2UI 真机实测 + 叶区状态不许撒谎)

**Completed** ✅:

桌面端这一侧本轮只动了一处，但它是**同一条链上的一块**：

- **✅ 父仓 `shadow/AGENTS.md` ㋊ 条记整条真机链路**（手机第一次真的把 A2UI
  界面画出来 ⇒ `scripts/prove-a2ui-on-device.ps1` ⇒ 7 条机器可判 + 截图）
  ⇒ 端脑那一侧见 `telencephalon/AGENTS.md` ㉝ 条，移动端那一侧见
  `shadow-mobile/AGENTS.md` ㋀ 条 ⇒ **本条只记桌面端这一侧的形状**。
- **⚠️⚠️ 修掉一个「失败长得像成功」**：`AgentStatusIndicator` 的 `status`
  以前**不认识的值一律落回 `idle`**（`A2uiSurface.tsx:255`）⇒ ⇒ 端脑说
  `unknown`（=「我们从没探活过它」）⇒ 桌面端会画成 `idle`；端脑哪天**多说一个词**
  ⇒ 同样落成 `idle` ⇒ ⇒ **又一次「失败长得像成功」**。
  ⇒ **改法**：① `status` 联合类型加 `unknown`；② `AGENT_STATUS_STYLE` 加
  `unknown`（**虚线框** ⇒ 形状上就与 `idle` 分得开，不靠颜色赌）；
  ③ **兜底从 `idle` 改成 `unknown`**；④ **缺 `status` 声明 ⇒ 缺省 `unknown`**
  （「没说」和「没事」是两件事）。
- **✅ 测试 + 反向验证**：`src/components/chat/__tests__/a2ui.test.tsx` 新增一条
  （断言**形状**与 `data-status`：三行分别给 `unknown` / 端脑多说的词 / `idle`，
  外加一行**根本不说 status**）⇒ ⚠️ **反向验证**：把兜底改回 `idle` ⇒
  **恰好 1 红**，其余 15 条仍绿 ⇒ ⇒ **断言有分辨力，不是恒绿**。
  ⇒ 全量 `pnpm exec vitest run` ⇒ **124 文件 / 1230 通过 / 6 跳过 / 0 失败**。
- **⚠️ 还欠的**：**服务端产出的界面文案仍是英文**（`Tasks (1)` / `HIGH` /
  `not probed`）⇒ 桌面端面板现在中英混排；「空 / 失败」在协议层是**三种**状态
  （有内容 / 有 surface 但空 / 纯文本），面板仍并成两种；**桌面端没有 shadow key
  输入入口**（既有缺口）⇒ 端脑配了 key 而桌面端没有 ⇒ 面板 401（面板会明说）。
## STATE STATUS (2026-11-01, 界面文案随用户的语言走)

**Completed** ✅:

- **✅ 父仓 `shadow/AGENTS.md` ㋐ 条记整片**（端脑产的界面文案随用户的语言走 ⇒
  两端界面不再是中英混排）⇒ 端脑那一侧见 `telencephalon/AGENTS.md` ㉟ 条，
  移动端那一侧见 `shadow-mobile/AGENTS.md` ㋁ 条 ⇒ **本条只记桌面端这一侧的形状**。
- **✅ 机制**：面板把 i18next 的 `i18n.language`（`zh-CN` / `en-US`）交给客户端
  ⇒ 客户端发成 `Accept-Language` 头（`src/lib/a2uiClient.ts` 的
  `buildA2uiHeaders(apiKey, locale)`）⇒ 端脑据此产出中文界面
  （真相源在服务端：`telencephalon/src/a2a/a2ui_i18n.rs`）。
  ⚠️ **不碰 `telencephalonClient.ts`**（那个文件此刻被并行会话在飞改动占着）
  ⇒ 沿用面板原来那条独立通道（与 A2UI 接入那片同一个取舍）。
- **✅ 测试 + 反向验证**：`src/components/chat/__tests__/a2ui.test.tsx` 新增 **3** 条
  （① 客户端带 `Accept-Language`；② **没语言时就不带** —— 端脑会落英文，
  与本功能之前**逐字相同** ⇒ 跨端契约 fixture 继续有效、旧客户端不受影响；
  ③ **面板把 i18n 的语言交下去** —— `tests/setup.ts` 把 `react-i18next`
  mock 成 `i18n: { language: 'en' }` ⇒ 断言请求头是 `en`）
  ⇒ `a2ui.test.tsx` **19 passed**；全量 **124 文件 / 1233 通过 / 6 跳过 / 0 失败**；
  `tsc --noEmit` EXIT=0；`eslint`（改动的 3 个文件）EXIT=0。
- **⚠️ 协议值仍在英文**：`TaskCard.status` / `priority` /
  `AgentStatusIndicator.status` 是 **A2UI 目录里的枚举** ⇒ 翻了客户端就解析不出来
  ⇒ `HIGH` / `in_progress` 不翻；⚠️ 但两端**显示**是一致的（桌面端徽标带
  `uppercase` 的 CSS、手机端显式 `toUpperCase()` ⇒ 两边都显示 `HIGH`）。
- **⚠️ 还欠的**：**移动端真机那一截**（设备上的 APK 与内嵌端脑都是旧的 ⇒ 看不到中文界面）；
  **协议值仍是英文**；**「空 / 失败」三态**（`Tasks (0)` 现在被当「成功」）仍未拆；
  **桌面端没有 shadow key 输入入口**（既有缺口）⇒ 端脑配了 key 而桌面端没有 ⇒ 面板 401。
- **⚠️⚠️ 2026-11-02 订正（本机真机实测：这台机器上的端脑**不认** `Accept-Language`）**：
  「端脑据此产出中文界面」这句话**只验到源码与单测**，**没验到运行** ⇒ ⇒
  2026-11-02 从**活着的**端脑上打 `POST http://127.0.0.1:60080/a2a`（带 `Accept-Language: zh-CN`）
  ⇒ ⇒ 端脑**仍回英文**（`Tasks (0)` / `No tasks yet.`）⇒ ⇒ 真因是**本机跑的是旧构建**：
  进程 `encephalon-server.exe`（`iBLOC/encephalon` 这个**宿主仓**编出来的 —— 它用 `../telencephalon`
  作 path 依赖，所以**端脑源码真相源仍是 `telencephalon`**）**构建于 2026-10-31 23:28**
  ⇒ ⇒ 早于「界面文案随语言走」那笔提交（`telencephalon` 的 `c51780c`，**2026-11-01 01:33**）
  ⇒ ⇒ **代码是对的，跑的是旧的** ⇒ ⇒ 本条上面那句「端脑据此产出中文界面」**在本机不成立**
  ⇒ ⇒ （面板显示英文看板 ＋ 中文界面 ⇒ 界面不自洽，而且**没人报错**）。
  ⚠️ **所以「还欠的」要加上本机这一截**：不只移动端，**桌面端本机**也欠 ——
  要把端脑**重新编一遍**（编 `iBLOC/encephalon` ⇒ 它 path 依赖 `../telencephalon`）才能验。
- **✅ 把「真端脑 ↔ 客户端」这条链做成**打包时**自动复验**（新 `tests/api-contract/a2ui-live.test.ts`）：
  `pnpm test:api`（= `pnpm prebuild` 的一部分）⇒ ⇒ 打**活端脑**，而且**用客户端自己的
  `requestA2uiSurface()`** 打（不是在探针里另抄一份）⇒ ⇒ 验的是整条真实链路：
  请求头 ⇒ SSE 解码 ⇒ 协议解析 ⇒ 能不能画出一块界面。
  ⚠️ **硬断言**：协议层问题必须为 0 ＋ 事件非空 ＋ 能建出**可渲染**的 surface
  （端脑改了信封 ⇒ 这里立刻红 ⇒ 而不是界面上静悄悄地变成一块空白）。
  ⚠️ **软断言（只警告，不卡打包）**：① 端脑回的文案**不是中文** ⇒ ⇒ **它在喊「我是旧构建」**
  （本机实测就是它喊的：`title="Tasks (0)"`）；② 活端脑的事件**形状**与冻结的 fixture
  不一致 ⇒ ⇒ fixture 该重新抓了（**不是**客户端的锅 ⇒ 不该卡死打包）。
  ⇒ ⇒ **反向验证：拆掉协议层 ⇒ 恰好 2 红**（形状那条仍绿）⇒ ⇒ 有分辨力。
- **⚠️⚠️ 顺带发现：这台机器上**桌面端打不出包**（不是本轮引入的）**：
  `pnpm prebuild` → `pnpm test:api` ⇒ ⇒ 既有 api-contract 套件对着**这台旧端脑**有 **4 条红**
  （`GET /api/telencephalon/thalamus/preview/sensors` 与 `…/sensors/{name}/stats` 两条 **503**
  ＋ `GET /api/telencephalon/video-sources` ＋ 同一条的 schema 断言）
  ⇒ ⇒ **端脑版本问题**，不是桌面端代码问题 ⇒ ⇒ 要把端脑**重新编一遍**才能打包。
  ⚠️ **顺带确认了两件事**：① 端脑**有** `tools` 透传 ＋ `await_tool_result` 那条路
  （`telencephalon/src/api/shadow.rs:402/470/642/1302`）⇒ ⇒ 桌面端发的 `tools` 能到模型；
  ② ⚠️ 但 `shadow.rs:402` 有个**硬约束**：客户端工具**必须走流式端点**
  （否则端脑直接回 400 `client tools require the streaming endpoint`）
  ⇒ ⇒ 桌面端 `ConversationPage.tsx:398` 走的正是 `telencephalonClient.streamMessage(...)` ⇒ ⇒ 满足。

## STATE STATUS (2026-11-01, 「空 / 失败」三态)

- **✅ 端脑有三种回答，客户端以前并成了两种，还把端脑的原话丢了**
  （父仓 `shadow/AGENTS.md` ㋕ 条记整片；移动端那一侧见 `shadow-mobile/AGENTS.md` ㋂ 条）。
  - **⚠️ 病**：纯文本与「什么都没有」并成 `empty` ⇒ 界面上先压一句**「暂无数据」**
    再显示端脑的原话 ⇒ ⇒ **「端脑明明说了话」被说成「没有数据」**。
  - **✅ 修**：`a2uiProtocol.ts` 新增 `isStructurallyEmptySurface`（**结构规则**：
    除 `Column`/`Text` 之外没有别的组件 ⇒ 空 ⇒ ⚠️ **规则反过来写**，
    端脑加新组件时**不会**把有内容的界面说成空的）；
    `A2uiSurface.tsx` 把「空」标到 DOM（`data-surface-empty="true|false"` ⇒ **机器可判**）；
    `A2uiPanel.tsx` 的 `PanelState` 增 `text` 档 ⇒ **纯文本时只显示端脑的原话**，
    `empty` 档**只**留给「端脑什么都没说」。
  - **⚠️ 一条刻意的决定**：空 surface 与「有内容」的 surface **界面上长得一样** ——
    因为**端脑自己已经在空 surface 里说了实话**（「任务（0）」「还没有任务」）
    ⇒ 客户端**不再补一句**概括 ⇒ 两处文案不打架；⇒ 但**状态可判**（`data-surface-empty`）。
  - **✅ 测试 + 反向验证**：`a2ui.test.tsx` **19 ⇒ 24 passed**（新 5 条）⇒
    全量 **124 文件 / 1238 通过 / 6 跳过 / 0 失败**；`tsc --noEmit` EXIT=0；`eslint` EXIT=0；
    ⚠️ **反向验证**：把「暂无数据」放回纯文本分支（＝**修复前的形状**）⇒ **恰好 1 条红**、
    其余 23 条仍绿 ⇒ 断言有分辨力、不是恒绿。
  - **⚠️ 顺带记一条：上面那个「失败说真话」的洞**只在移动端** ——
    桌面端同一件事**本来是对的**（`requestA2uiSurface` 对非 2xx 抛 `A2uiHttpError`
    ⇒ 面板的 `.catch` 直接进 `phase: 'error'`）；
    ⚠️ 但桌面端那条错误文案是**硬编码中文**（`a2uiClient.ts` 的 `A2uiHttpError`）
    ⇒ **英文界面里也是中文** ⇒ 既有小瑕疵（i18n 文件当时在飞 ⇒ 没动）。
  - **⚠️ 还欠的**：**移动端真机那一截**；**「空」仍是客户端的结构推断**
    （端脑还没显式声明状态）；**桌面端没有 shadow key 输入入口**。

## STATE STATUS (2026-11-01, 「读不到」不许长得像「没有」—— 桌面端三态收进一份实现)

**Completed** ✅:

- **⚠️ 病（三处，同一个病：「问不到」被折成「没有」）**：
  - `pages/SettingsPage.tsx` 两处 `fetchProviders` 的 `catch { setProviders([]) }`
    ⇒ ⇒ 供应商列表**读不到**时界面显示「**暂无模型供应商**」⇒ ⇒ 用户于是去
    **重复配置已经配好的东西**⇒ ⇒ 而真正的原因（门关着 / 端脑没起）
    **一个字都没人告诉他**；
  - 同文件 `InternalAgentCard` 的**模型下拉** ⇒ ⇒ 读不到时只剩「不设默认模型」
    一个选项 ⇒ ⇒ 等于告诉用户「你没模型」；
  - `pages/ModelOnboardingPage.tsx` ⇒ ⇒ 云那半 401（门关着）⇒ ⇒ 这一页说
    「**你没配模型**」⇒ ⇒ 而 `AppInitializer` 那一处**已经修好了**（不踢）
    ⇒ ⇒ **同一个病、两处症状**⇒ ⇒ 而用户看到的恰恰是**没好的那一处**
    （onboarding 页就是「说没配」的那张脸）。
- **✅ 修（一份实现，多处调用）**：新模块 `src/lib/modelConfigProbe.ts`
  ⇒ ⇒ 三态判定（`configured` / `not-configured` / `unknown`）+ 两发探测
  （`probeCloudProviders` / `probeLocalModels`）+ 列表三态
  （`providerListState`：`ready` / `empty` / `unreadable`）
  ⇒ ⇒ **`AppInitializer` 与 `ModelOnboardingPage` 现在共用它**
  ⇒ ⇒（以前各抄一份 ⇒ ⇒ 改了一边忘了另一边 ⇒ ⇒ 一个病两处症状）。
  - ⚠️ **`combineModelConfig` 是「搬运」不是「改判」**：与 `AppInitializer`
    修复前的行为**逐条等价**（云那半问到了才算「没配」；本地那半只在「有」
    时加分 —— 本地读不到 ≠ 用户没配）⇒ ⇒ **Tauri 路径也改走它**（本地那半
    原来自己打 neuron 面，现在也走共享探测 ⇒ ⇒ 「本地模型在哪张面」只写一次）。
  - ⚠️ **唯一一处比旧代码更严**：云那半 **200 但 body 形状不对**（端脑回的是
    `Json<Vec<ProviderView>>` ＝ 数组；拿到别的形状 ⇒ 这一发**没问对**）
    ⇒ ⇒ 旧写法当成「确认空」（＝确认没配）⇒ ⇒ 现在归「**问不到**」
    ⇒ ⇒ 免得一个版本不匹配的部署**把用户踢回向导**。
- **✅ 界面**：onboarding 页新增 `unknown` 分支（「连不上端脑」＋「稍后配置」
  ⇒ ⇒ **不放也不拒**）；设置页供应商列表三态（`unreadable` ⇒ 「读不到供应商
  列表」＋原因提示，**不用**「暂无模型供应商」）＋ 底部计数三态；内部代理卡片
  的模型下拉在读不到时**禁用**并显示读不到的原因（**不许**只剩「不设默认模型」）。
- **⚠️ 一条可复用的工程事实（本轮当场踩到并验掉）**：**模块加载时求值**会引入
  隐性耦合 —— 新模块若在**导入时**就调 `prefrontalUrl()` / `neuronUrl()`
  ⇒ ⇒ 那些对 `platform` 做**部分 mock** 的既有测试（只给 `isTauri` /
  `prefrontalUrl`）**直接加载失败**（vitest：No "neuronUrl" export is defined）
  ⇒ ⇒ ⇒ 改成**函数里惰性求值** ⇒ ⇒ 导入本模块不再碰 `platform` ⇒ ⇒ 老测试照旧
  ⇒ ⇒ **「新模块在加载时碰了谁」是一条要付的税**。
- **⚠️ 另一条：机器闸判不判得了，取决于「形状」**：闸
  `scripts/check-provider-admin-headers.mjs` 要在**同一个文件里**找到
  ① base 的赋值 ② 凭据的来源 ⇒ ⇒ 把 base 做成**形参** ⇒ ⇒ 闸**判不了**
  （判不了 ≠ 没问题 ⇒ ⇒ 闸会报红）⇒ ⇒ ⇒ 所以共享模块**自己拥有**两张面与
  凭据（`adminHeaders()` 只在这一处出现）⇒ ⇒ 闸直接判绿：「headers（简写）
  —— 它来自 admin 凭据」⇒ ⇒ **闸绿 8 / 红 0 / 判不了 0**。
- **✅ 证据**：`tsc --noEmit` EXIT=0；新 `src/lib/__tests__/modelConfigProbe.test.ts`
  **21 条**；`AppInitializer.test.tsx` **6 条**（重构后逐条仍绿 ⇒ 证明等价）；
  `ModelOnboardingPage.test.tsx` **3 ⇒ 6 条**（新 3 条钉「问不到 ≠ 没配」）；
  `tests/e2e/settings-lifecycle.test.tsx` **20 条**（加载失败那条已修）。
  ⚠️ **反向验证**：把 `combineModelConfig` 的「问不到 ⇒ unknown」翻回病灶
  （⇒ `not-configured`）⇒ ⇒ **恰好 6 红**（模块 ③⑤ / onboarding ④⑥ /
  AppInitializer ①①b），其余 25 条纹丝不动；再把「形状不对 ⇒ 问不到」那条
  拆掉 ⇒ ⇒ **恰好 2 红**（模块 ⑥ / onboarding ⑥）⇒ ⇒ 断言钉在真东西上、不是恒绿。
- **⚠️ 全量回归里的 1 条 flaky（既有，非本轮引入）**：
  `tests/e2e/conversation-lifecycle.test.tsx` 的「shows select or create message
  when no active conversation」—— 它 `await` 动态 import 之后**同步**断言
  （**没有 `waitFor`**）⇒ ⇒ 全量并发高负载时 import 还没解析完就断言 ⇒ ⇒
  偶发红；⇒ ⇒ 单跑 **18/18 全绿** ⇒ ⇒ 与本轮改动零交集（`ConversationPage`
  不碰本轮任何文件）。
- **⚠️ 还欠的**：**web 形态 6 处条件 401**（没有 sidecar ⇒ admin token 要用户
  自备 `localStorage`）⇒ ⇒ 「web 放钥匙的入口」是**另一个决定**；
  **桌面端 shadow key 输入入口**仍然欠着（但它**不是**上锁的阻塞项）；
  **真机 UI 未验**（本轮只有单测与机器闸）；**「形状不对」这条更严的判定**
  对 `AppInitializer` 也是新的（以前非数组 ＝「确认空」）⇒ ⇒ 行为**收紧**了
  一点点（方向：宁可说「问不到」，也不说「你没配」）。

## STATE STATUS (2026-11-01, 真浏览器那一发 —— 「看起来对不对」只有眼睛能钉)

- **✅ 上一条欠的「真机 UI 未验」，本轮换成「真浏览器已验」**：新 Playwright spec
  `tests/e2e-ui/three-state-providers.spec.ts`（4 条）⇒ ⇒ 真 Chromium + **构建产物**
  ⇒ ⇒ **4 passed / 10.3 秒** ⇒ ⇒ 三档各钉在 `data-state` 上（`unreadable` /
  `empty` / `ready`），**不钉文案**（文案随语言走 ⇒ ⇒ 默认 zh-CN）。
- **⚠️ 为什么是「构建产物」而不是 dev server**：本机被别人会话的编译占满
  （4 cargo + 4 rustc、load 99%）⇒ ⇒ vite 逐模块 transform 把浏览器**饿死**
  （首屏 `GET /` 实测 **38.4 秒**；`/settings` 的 `load` **180 秒**没等到
  ⇒ ⇒ 失败截图**全白**）⇒ ⇒ ⇒ 改跑**静态预览**（`vite build --config
  vite.config.web.ts` 约 24 秒 ⇒ ⇒ 浏览器只下一个 bundle ⇒ ⇒ 页面**秒开**）
  ⇒ ⇒ ⇒ 为此 `playwright.config.ts` 加了三个环境变量（`SHADOW_E2E_BASE_URL`
  / `SHADOW_E2E_SERVER_URL` / `SHADOW_E2E_SERVER_CMD`）⇒ ⇒ **dev server 与
  构建产物两条路都能跑**（默认仍是 dev server ⇒ ⇒ 不影响既有 spec）。
- **⚠️ 断言要比**决定性字段**：④ 原本比两档的整块 `innerText` ⇒ ⇒ 提示语不同就能
  蒙过去 ⇒ ⇒ 改成比**标题那一行**（`innerText` 的第一行）⇒ ⇒ ⇒ 断言这才钉在「用户
  第一眼看到的那句话」上。
- **✅ 反向验证（在真浏览器里做）**：把「空档」的标题换成「读不到档」的标题 ⇒ ⇒
  **恰好 2 红**（② ④），① ③ 绿 ⇒ ⇒ 还原后 **4/4 再绿** ⇒ ⇒ 断言钉在真东西上、不是恒绿。
- **✅ 其余**：`tsc --noEmit` EXIT=0；定向 vitest **33 条**；全量 vitest __VITEST__；
  **七道闸全 EXIT=0**。
- **⚠️ 还欠的**：**Tauri 真机 UI 仍未验**（本轮是真浏览器 + 构建产物，不是桌面真机）；
  **web 形态 6 处条件 401**（web 版没有 sidecar ⇒ admin token 要用户自备 `localStorage`）
  ⇒ ⇒ 「web 放钥匙的入口」是**另一个决定**；**桌面端 shadow key 输入入口**仍欠（**不是**
  上锁的阻塞项）。

## STATE STATUS (2026-11-01, 探针与列表读的是**同一张面**，却递了**不同的钥匙**)

- **⚠️ 病（自相矛盾）**：客户端有**两发**读 `/models/providers`（读门 = shadow ∪ admin）：
  ① **列表**（`SettingsPage` → `telencephalonClient.listProviders()` → `request()`）
     ⇒ ⇒ **shadow ∪ admin 两把都递**（`telencephalonClient.ts`：`if (this.apiKey) headers['X-Shadow-Key'] = …`
     ＋ `X-Admin-Token`）⇒ ⇒ ⇒ **读门认哪把都能过**；
  ② **探针**（`modelConfigProbe.probeCloudProviders()`）⇒ ⇒ **只递 admin**
     （`adminHeaders()`）⇒ ⇒ ⇒ **shadow key 它拿不到**。
  ⇒ ⇒ 于是在「**独立端脑服务器** + 那台机器**配了 shadow key** + 桌面端**填了 shadow key**」
  这一个形态上（端脑的 admin 面是 **fail-closed** 的 ⇒ 桌面 sidecar 那把 admin token
  **对不上** ⇒ ⇒ 读面只剩 **shadow** 那把）⇒ ⇒ **列表读得到、探针读不到** ⇒ ⇒
  ⇒ ⇒ **`AppInitializer` 与 onboarding 那一格会说「问不到端脑」** ⇒ ⇒ **而设置页那一格
  明明列出了供应商** ⇒ ⇒ ⇒ **同一个客户端、同一个端脑，两处给出互相矛盾的说法**。
- **⚠️ 根因是上一轮那条决策的前提不成立**：探针里写着「**刻意不发 `X-Shadow-Key`**：
  读门认的是 shadow ∪ admin，admin 是另一把钥匙 ⇒ 这一发带 admin 就够」⇒ ⇒
  **「带 admin 就够」只在「客户端手里有 admin token」时成立** ⇒ ⇒ 而独立端脑服务器形态
  **没有**（端脑只认 `TELENCEPHALON_ADMIN_KEY`，且 fail-closed）⇒ ⇒ ⇒ **前提是假的**。
- **✅ 修法（一条规则）**：**客户端读面的凭据集合必须与门形一致** ⇒ ⇒ 读门 = shadow ∪ admin
  ⇒ ⇒ ⇒ 客户端读面就递 **shadow ∪ admin**（**不是**二选一）⇒ ⇒ ⇒ 于是「列表能读、探针读不到」
  这件事**结构上不可能**发生。
- **✅ 那个口子开了（`7e45429` → `8781373`）**：`getApiKey()` 已入库 ⇒ ⇒ store → client
  的同步也入库了 ⇒ ⇒ ⇒ **这个矛盾从那一刻起是「活的」**（在那之前客户端**根本递不出**
  shadow key ⇒ ⇒ 两发都只递 admin ⇒ ⇒ **一致** ⇒ ⇒ 矛盾**不活**）
  ⇒ ⇒ ⇒ 探针那笔修复合入 `8781373`（探针递 **shadow ∪ admin**）⇒ ⇒ ⇒ 已在活仓 HEAD 上复验。
  ⚠️ **订正上一句**：HEAD 上**连 `setApiKey` 都没有**（不只是缺 `getApiKey`）⇒ ⇒
  当时那句「只有私有的 `this.apiKey` 与 `setApiKey`」**不成立** ⇒ ⇒ ⇒ 以本条为准。
- **⚠️ 一条可复用的判据**：**同一个端点、客户端有两发读它** ⇒ ⇒ 先核「两发带的凭据集合
  是不是同一个」⇒ ⇒ **不是的话，先出现的矛盾是「一处说读到了、另一处说读不到」**
  ⇒ ⇒ 而不是「都读不到」⇒ ⇒ ⇒ 而这种矛盾**单测很难发现**（两条路各自都绿）。
## STATE STATUS (2026-11-01, 桌面端那把 shadow key 真的能用了 —— 探针与列表终于递同一套钥匙)

- **✅ 病（一个客户端、同一张面，两处互相矛盾）**：`/models/providers` 这张面在端脑那边是
  **读门（shadow ∪ admin）**，而客户端有**两发**读它：
  - **列表**（`SettingsPage` → `telencephalonClient.listProviders()` → `request()`）⇒ **shadow ∪ admin 两把都递**；
  - **探针**（`modelConfigProbe.probeCloudProviders()` ⇒ 裸 fetch）⇒ 以前**只递 admin**。

  ⇒ ⇒ 于是在「**独立端脑服务器** + 那台机器**配了 shadow key** + 桌面端**填了 shadow key**」
  这一个形态上（端脑的 admin 面 **fail-closed** ⇒ 桌面 sidecar 那把 admin token **对不上**
  ⇒ ⇒ 读面只剩 **shadow** 那把）⇒ ⇒ **列表读得到、探针读不到**
  ⇒ ⇒ ⇒ `AppInitializer` 与 onboarding 那一格说「**问不到端脑**」
  ⇒ ⇒ **而设置页那一格明明列出了供应商** ⇒ ⇒ ⇒ **同一个客户端、同一张面，两处互相矛盾**。
- **⚠️ 根因是一句写进注释的假前提**：「读门认的是 shadow ∪ admin，admin 是**另一把**钥匙
  ⇒ 这一发带 admin 就够 ⇒ 不多递一把」⇒ ⇒ **那个前提只在「客户端手里握有 admin token」时成立**。
- **✅ 修（一条规则）**：**客户端读面的凭据集合必须与门形一致** ⇒ 门认哪几把，客户端就递哪几把
  ⇒ ⇒ 探针现在把 `telencephalonClient.getApiKey()` 那把**一并递上**
  ⇒ ⇒ 拿不到就**不带那个头**（绝不塞空串：空串与空串相等 ⇒ 等于带对了 ⇒ 反而把门骗开）
  ⇒ ⇒ 顺带把「shadow key 的唯一出处」钉成 client（与发请求的那个 client 是**同一把**）
  ⇒ ⇒ 「列表用一把、探针用另一把」结构上不可能。
- **✅ 顺带把「那把 shadow key 真的能用了」补齐（`7e45429`）**：
  - `telencephalonClient` 补 `setApiKey()` / `getApiKey()`（之前**没有 getter** ⇒
    「client 到底有没有拿到 key」**无法从外部观察**，只能靠猜）；
  - `telencephalonStore.setApiKey` 现在**同步给 client**（以前只改 store ⇒ client 永远拿不到 key
    ⇒ 端脑一开 `shadow.api_key` ⇒ 客户端**全量 401**）；
  - `telencephalonStore` 补 `onRehydrateStorage` ⇒ 重启后把 baseUrl 与 apiKey **推回 client**
    （`persist` 只灌 store ⇒ 用户改完地址**重启后又打回默认**，而 store 里看着是对的）；
  - `TelencephalonStatusPage` 不再写死 `localhost:60080`（改读 store），路径前缀从**根本不存在的**
    `/api/cortex/*` 改成 `/api/telencephalon/*`（服务端 `system_status.rs:6-7` ⇒ 那一页以前一直 404）；
  - zh-CN 的 `cortexStatus.connectionHint` 改成插值 `{{url}}` ⇒ 否则中文界面会告诉用户一个**写死的端口**。
- **⚠️⚠️ 一条被实测钉住的读数：「HEAD 编译不过」** —— 在 `7e45429` 之前，
  `ConversationPage.tsx` 调用 `telencephalonClient.getApiKey()`，而 client 类**没有那个方法**
  ⇒ ⇒ **实测**（把旧 client 文件放回去跑 `tsc --noEmit`）⇒ **3 条 TS2339**
  ⇒ ⇒ ⇒ **桌面端在那一版 HEAD 上根本编译不过** ⇒ ⇒ 「getter 还没入库」不只是「少个方法」，
  是**整个桌面端构建是断的** ⇒ ⇒ ⇒ **凡是说「HEAD 缺 X」的读数，都要先问「那 HEAD 编译过吗」**。
- **✅ 证据 + 反向验证**：探针单测 **21 ⇒ 24 passed**（新增 3 条）；store 单测**新增 5 条**；
  `tsc --noEmit` EXIT=0；全量 vitest **1262 ⇒ 1265 passed / 0 failed**；
  闸 `scripts/check-provider-admin-headers.mjs` ⇒ **绿 8 / 红 0 / 判不了 0**、EXIT=0，
  且它现在把探针那一发报成「**直接带 shadow 凭据（这道门认 shadow 或 admin）**」⇒ ⇒ 机器闸看得见两把钥匙了；
  ⚠️ 反向验证：拆掉 shadow key 那一把 ⇒ **恰好 2 红**；拆掉 `setApiKey` 的同步 ⇒ **恰好 2 红**；
  拆掉 `onRehydrateStorage` ⇒ **恰好 2 红**；其余纹丝不动。
- **⚠️ 还欠的**：**桌面端没有「输入 shadow key」的入口** ⇒ ⇒ setter 有、但**没有 UI 调用方**
  ⇒ ⇒ 「配了能生效、但**无处可配**」⇒ ⇒ 那个入口仍欠；
  **en-US.json 没有根级 `cortexStatus`** ⇒ 英文界面落回代码里的默认值（那句默认值是**中文**）；
  **web 形态的 6 处条件 401**（web 没有 sidecar ⇒ admin token 要用户自备）。

## STATE STATUS (2026-11-01, 「同一张面」有**两个字**：**钥匙**与**地址** —— 钥匙已补齐，**地址还在分叉**)

- **⚠️ 病（同一个病，换了个面）**：客户端**两发**读 `/models/providers`（读门 = shadow ∪ admin），
  「同一张面」这件事其实有**两个**条件：**同一个地址** + **同一套钥匙**。
  ⇒ ⇒ **钥匙**那一半已由 `8781373` 补齐（探针递 shadow ∪ admin）⇒ ⇒ **地址**那一半还分叉：
  * **列表**（`telencephalonClient.listProviders()`）⇒ 打 **client 的地址**
    （`store.connection.baseUrl` ⇒ 用户可配 ⇒ 持久化 ⇒ 重启复原 ⇒ `7e45429` 之后才不是写死的）；
  * **探针**（`modelConfigProbe.probeCloudProviders()`）⇒ 以前打 **`prefrontalUrl()`**
    ⇒ ⇒ 那是 platform 里**写死**的 `localhost:60080`（`platform.ts:57-63`）。
  ⇒ ⇒ ⇒ 用户改过端脑地址之后 ⇒ ⇒ **列表打新地址、探针打老地址** ⇒ ⇒
  ⇒ ⇒ ⇒ 「列表读到了、探针说问不到端脑」—— **自相矛盾，只是这次错的是地址**。
  ⇒ ⇒ ⇒ 而**探针那半只在 web 形态跑**（Tauri 形态走 `invoke('provider_list')`）
  ⇒ ⇒ ⇒ ⇒ ⇒ **web 形态下这个分叉是常态**（web 没有 sidecar ⇒ 地址只能用户自己配）
  ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **而 web 形态恰恰是 shadow key 最要紧的那个形态**。
- **✅ 修（一条规则，两件事）**：**两发读同一张面 ⇒ 必须同一个地址、同一套凭据**
  ⇒ ⇒ 探针的 base 改成 `telencephalonClient.getBaseUrl()`（= 列表那一发的地址）
  ⇒ ⇒ ⇒ 「同一张面」从此不是口号，而是**结构上的同一**。
- **⚠️ 一条通用代价：「判不了」必须当红** —— 机器闸 `check-provider-admin-headers.mjs`
  的 `classifySurface()` 原来只认 `prefrontalUrl()` / `store.connection.baseUrl`
  ⇒ ⇒ **新的形状它认不出来** ⇒ ⇒ ⇒ 闸当场报「**判不了**」（红 ⇒ EXIT=1）
  ⇒ ⇒ ⇒ ⇒ 这条规矩又生效了一次：形状变了而闸没跟上 ⇒ **闸报红是对的**
  ⇒ ⇒ ⇒ ⇒ 修法是**升级闸**（不是让它猜）：多认 `telencephalonClient.getBaseUrl()`
  ⇒ ⇒ ⇒ ⇒ + `--self-test` 里加一条钉它 ⇒ ⇒ ⇒ ⇒ 回到 **绿 8 / 红 0 / 判不了 0 / EXIT=0**。
- **✅ 新增证据（运行时，不是「读代码觉得对」）**：新文件
  `shadow-desktop/src/lib/__tests__/readDoorCredentials.test.ts`（**5 条**）
  ⇒ ⇒ **真 client + 真 probe**（只替换传输层 fetch 与两把钥匙的来源 ⇒ ⇒ 路径/请求头/解析全是生产代码在跑）
  ⇒ ⇒ **stub 就是那道门**（读门 = shadow ∪ admin ⇒ 有任一把就放行 ⇒ 一把都没有就 401）
  ⇒ ⇒ ⇒ ① **只有 shadow key** ⇒ 两发都过得去（**这正是曾经坏掉的那个形态**）
  ⇒ ⇒ ⇒ ② 只有 admin token ⇒ 两发也都过得去
  ⇒ ⇒ ⇒ ③ 两把都没有 ⇒ **两发一起失败**，而探针说的是「**问不到**」（`known:false`）不是「没有」
  ⇒ ⇒ ⇒ ④ 两发递的是**同一个钥匙集合**
  ⇒ ⇒ ⇒ ⑤ 两发打的是**同一个地址**
- **✅ 反向验证（断言钉在真东西上、不是恒绿）**：把探针退回「**只递 admin**」⇒ ⇒ **恰好 2 红**（① ④）
  ⇒ ⇒ 退回「**写死地址**」⇒ ⇒ **恰好 1 红**（⑤）⇒ ⇒ ⇒ 还原后 **5/5 再绿**。
- **✅ 其余证据**：`tsc --noEmit` EXIT=0；全量 vitest **127 文件(+1 跳过) / 1271 通过 / 6 跳过 / 0 失败**
  （基线 1265 ⇒ +6：跨会话 5 + 探针地址 1）；真浏览器 E2E **4 passed (8.5s)**（构建产物那条路）；
  **七道闸全 EXIT=0**。
- **⚠️ 还欠的**：**Tauri 真机 UI 仍未验**（本轮是真浏览器 + 构建产物）；
  **web 形态 6 处条件 401**（web 没有 sidecar ⇒ admin token 要用户自备 `localStorage`）
  ⇒ ⇒ 「web 放钥匙的入口」是**另一个决定**（⚠️ 一旦落地 ⇒ ⇒ 钥匙进 store → client
  ⇒ ⇒ ⇒ **两发同时生效** ⇒ ⇒ 因为探针现在也递 shadow ∪ admin）；
  **桌面端 shadow key 输入入口**仍欠（**不是**上锁的阻塞项）。


## STATE STATUS (2026-11-01, 「读面的凭据集合必须与门形一致」—— 桌面端剩下那几处读面递的是**半套钥匙**)

- **⚠️ 病（半套钥匙 ⇒ 同一张面两处互相矛盾）**：桌面端有 **4 处**读面是**裸 fetch**，
  其中 **3 处只递 `X-Admin-Token`**（`TelencephalonStatusPage.tsx` 的 status/logs
  + `telencephalonClient.health()` 的 Tauri 分支）⇒ ⇒ 而门形是**读门 = 影子锁 ∪ admin token**
  ⇒ ⇒ **少递一把** ⇒ ⇒ 在「客户端手里只有影子锁」的形态上（独立端脑服务器 + 那台机器
  配了 shadow key + 桌面 sidecar 那把 admin token 对不上）⇒ ⇒ 那 3 处 **401**
  ⇒ ⇒ 而同一张面的另一发（`telencephalonClient.request()`）**读得到**
  ⇒ ⇒ ⇒ 「列表读得到、状态页读不到」。
- **✅ 修（一条规则、一处实现）**：新模块 `src/lib/readDoorHeaders.ts`
  ⇒ `readDoorHeaders(shadowKey?)` ⇒ **影子锁 ∪ admin token**（各一把，**有就带**；
  **拿不到就不带那个头** ⇒ 绝不塞空串 ⇒ 空串与空串 `ct_eq` 相等 ⇒ 等于把门骗开）
  ⇒ ⇒ client 的 `readHeaders()` / `request()` / `streamMessage()` 与端脑状态页的
  status/logs **都走它** ⇒ ⇒ 不再各抄一份。
- **⚠️⚠️ 一条必须钉住的边界：钥匙只递给它所属的那张面** —— `ModelsPage.tsx` 的读面
  （`GET /models/providers`）**本轮故意没改** ⇒ 因为它打的地址是 `prefrontalUrl()`
  （**构建期口径**）⇒ ⇒ 与 client 那张面（用户可配 ⇒ 持久化）**可能不是同一台**
  ⇒ ⇒ 把 client 的影子锁递过去 = **把一把机器级钥匙递给另一台机器**
  ⇒ ⇒ ⇒ 要统一得先定「web 形态的地址契约」（**另一个决定**）
  ⇒ ⇒ 本轮**只修地址明确同源的那几处**（状态页的地址取自 store ⇒ 而 store 的
  `setBaseUrl`/`setApiKey` **同步给 client** ⇒ ⇒ 那就是 client 那张面）。
- **✅ 证据（运行时，不是「读代码觉得对」）**：新增 **9 条**
  （`src/lib/__tests__/readDoorHeaders.test.ts` 7 + `src/pages/__tests__/TelencephalonStatusPage.test.tsx` **2**
  ⇒ 那一页**真的渲染** ⇒ ⇒ 钉的是「它**实际发出去**的请求头」）
  ⇒ ⇒ `tsc --noEmit` **EXIT=0**；eslint **0 error**（7 条 `any` warning 是既有的）
  ⇒ ⇒ 三道闸（providers / door-policy / client-endpoint-map）**EXIT=0**
  ⇒ ⇒ 全量 vitest **1281 passed / 0 failed**（1271 ⇒ +10）。
- **✅ 反向验证**：把 `readDoorHeaders` 退回「**只递 admin**」⇒ ⇒ **恰好 5 红**
  （① ② ⑥ ⑦ + 页面那条）⇒ ⇒ 其余 4 条仍绿 ⇒ ⇒ 还原后 **9/9 再绿**。
- **⚠️⚠️ 一条从兄弟会话借来的纪律（「读不到」不许长得像「没有」）**：页面那条**不许只钉
  「发出去的头」** ⇒ ⇒ 只钉请求头 ⇒ ⇒ **页面走失败分支也照样绿** ⇒ ⇒ 「因为失败而绿」
  = 恒绿 ⇒ ⇒ 现在它**同时**钉两件事：① 响应被解析并**画出来了**（模型 id 出现在页面上）；
  ⇒ ⇒ ② 读失败时页面**说真话**（显示 `HTTP 401`、且**不**画成有数据）⇒ ⇒
  ⇒ ⇒ 反向验证：把成功路径的响应改成失败 ⇒ ⇒ 页面那条**恰好 1 红**
  ⇒ ⇒ ⇒ 它不再能「因为失败而绿」。
- **⚠️ 还欠的**：**Tauri 真机 UI 仍未验**（本轮是单测 + 真渲染）；**`ModelsPage` 的地址契约**
  （见上）；**web 形态 6 处条件 401**；**桌面端 shadow key 输入入口**仍欠。


## STATE STATUS (2026-11-01, 「海马体存在哪」—— 那句 `~/.hippocampus` 是**假地址**，现在换成**真路径 + 可编辑入口**)

- **⚠️ 病（界面在撒谎）**：设置页「记忆集成」卡片的页脚**写死** `~/.hippocampus`
  （`i18n/*.json` 的 `settings.storagePathDefault`）⇒ ⇒ 而真实落点是 `%APPDATA%\shadow\lance`
  ⇒ ⇒ `~/.hippocampus` **在任何机器上都不存在** ⇒ ⇒ 「界面说一个地方、盘上是另一个地方」。
- **✅ 修（三层）**：
  - **默认根收成一处实现**（海马体仓）：`DatabaseConfig::default_local_root()` ＋
    `local_root()`（从 `file://` URI 反解；远端 URI ⇒ None）＋ server 的
    `default_storage_root()` / `effective_storage_root()` ⇒ ⇒ 桌面端**读海马体自己那套规则**
    （自己算一份 ⇒ 两份实现、迟早漂 ⇒ 漂了 ⇒ 界面报的路径没有任何东西往那儿写）。
  - **配置层**：`AppConfig.hippocampus_data_dir: Option<String>`（**`#[serde(default)]`**
    ⇒ 旧 `config.json` 仍读得了）＋ 两个 Tauri 命令（`get_hippocampus_storage` /
    `set_hippocampus_storage`）⇒ ⇒ 保存时**当场**校验（绝对路径 / 能建 / **能写**）。
  - **端脑那一跳**：`cortex_http::serve(stack, hippocampus_data_dir)` ⇒ ⇒
    `BuildOptions.hippocampus_data_dir` ⇒ ⇒ **显式根赢过** `LANCE_URI` / `HIPPOCAMPUS_DATA_DIR`。
- **⚠️ 诚实性（三条都写进界面）**：**(a) 换存储位置 = 换一批数据，不是迁移**（原来那份留在原处）；
  **(b) 重启桌面端后生效**（端脑在 boot 期建海马体）；**(c)「读不到」不许长得像「没有」**
  ⇒ ⇒ 用 `safeInvokeOrThrow`（`safeInvoke` 吞错返回 fallback ⇒ 会把「读不到」画成「空」）。
- **✅ 证据**：前端 **4 条真渲染测试全绿**（`src/pages/__tests__/HippocampusStorageCard.test.tsx`：
  真路径出现 / 那句假地址**不**出现 / 读不到时说真话 / 保存失败说出来）
  ⇒ ⇒ **反向验证三处各恰好 1 红**（写死假地址 ⇒ 恰好 1 红；吞掉「读不到」⇒ 恰好 1 红；
  吞掉「保存失败」⇒ 恰好 1 红）⇒ ⇒ 还原后 4/4 再绿；`tsc --noEmit` **EXIT=0**；
  桌面 `cargo check` **EXIT=0**（35 个既有 warning）。
- **⚠️ 还欠的**：**桌面 `config.json` 的路径 ⇒ 端脑 `BuildOptions` 那一跳**只有 3 行直白代码、
  **没有自动化断言**；**「打开文件夹」按钮没做**（要 dialog 插件 ⇒ 新依赖 ⇒ 不做）；
  **桌面端真机 UI 未验**（本轮是单测 + 真渲染）；**旧数据要不要迁移**是另一个决定。

## STATE STATUS (2026-11-01, 「配好了不等于能用」—— 路径在下次启动可能已经坏了)

- **⚠️ 病（保存时的校验只管那一刻）**：设置页保存时校验过路径（绝对 / 可建 / 可写）
  ⇒ ⇒ 但**明天**那个盘可能拔了 ⇒ ⇒ 端脑建不出那个根就 **panic** ⇒ ⇒ panic 发生在
  spawn 出去的那张 HTTP 面任务里 ⇒ ⇒ **桌面端进程不死，但端脑面压根没起来**
  ⇒ ⇒ 前端读到「端脑连不上」⇒ ⇒ **真实原因（你配的路径没了）被换成了另一个原因**。
- **✅ 修（启动时先探，并如实降级）**：桌面端启动时先探配置里的根（`probe_storage_root`：
  能建 + 能写）⇒ ⇒ 探不过 ⇒ **不递那个根**（端脑回落默认根 ⇒ 桌面端照常起来）
  ⇒ ⇒ 降级原因记进 `AppState.hippocampus_boot` ⇒ ⇒ 命令把 `degraded` / `degradedReason` /
  `pendingRestart` 报给界面。
- **✅ 一处实现、两个调用方**：保存时的校验与启动时的探针**收成同一个** `probe_storage_root`
  ⇒ ⇒ 两份规则迟早漂（保存时答应能写、启动时不认）。
- **✅ 界面说真话**：**`effective` 是「本次运行真正在用的那个根」**，不是「用户配的那个」
  ⇒ ⇒ 降级时显示默认位置（真正在用的）＋ 红字说明「你配的位置现在不可用：<原因>」
  ⇒ ⇒ `pendingRestart` ⇒ 改了没重启明说「重启后生效」；没改过则**不**显示那条提示。
- **✅ 证据**：前端 **7 条真渲染测试全绿**（新增 3 条）⇒ ⇒ **反向验证两条各恰好 1 红**
  ⇒ ⇒ 还原后 7/7 再绿；`tsc --noEmit` **EXIT=0**。
- **⚠️ 还欠的**：**桌面端真机 UI 未验**；**后端 Rust 单测未跑出绿灯**（本机 cargo 锁被并行会话
  占着、且桌面 lib test 的**链接**阶段极慢 ⇒ 本轮改用 `cargo check` 验证编译 ⇒ 测试随代码提交、
  待 CI 或下一轮跑）；**迁移**是另一个决定。

## STATE STATUS (2026-11-02, 「模型在对话里点名要界面」—— surface 内联在消息里)

- **⚠️ 病（「有事件」不等于「画出来了」）**：客户端工具 `show_a2ui_surface` 执行完要回两样东西 ——
  **给界面**的事件 ＋ **给模型**的一句话 ⇒ ⇒ 判据一开始写成「事件数 > 0」
  ⇒ ⇒ 而端脑**只回纯文本**时**也有事件**（那条 text 事件）⇒ ⇒
  「没画界面」被说成「**已展开**」⇒ ⇒ **失败长得像成功**。
- **✅ 修（判据收进协议层）**：`buildSurfaceFromEvents()`（`src/lib/a2uiProtocol.ts`）
  ⇒ 「有没有收到 `beginRendering`」才是「画出来没有」⇒ ⇒ 与面板那条路**同一套判据**（一处实现）。
- **✅ 界面那一半与模型那一半分开**：`pickReportPayload()` ⇒ 只有 `report` 那一句进模型上下文；
  事件**不进**（组件树进模型上下文 ⇒ 上下文被一堆 JSON 淹了）。
- **✅ 结果卡片不甩原始 JSON**：`ToolOutputCard` 会把对象 `JSON.stringify` 出来 ⇒ ⇒
  把整个结果丢进去 ⇒ 用户看到的是**一坨协议字节** ⇒ ⇒ 卡片只显示 `report` 那句人话
  （界面那一半**已经画成图**了）。
- **✅ `report` 走真 i18n**：它**用户看得见** ⇒ ⇒ 中英两端各一份词条
  （`a2ui.surfaceDrawn` / `surfaceNotDrawn` / `surfaceNotDrawnSilent` / `labelTasks` / `labelAgents`）
  ⇒ ⇒ 用例钉「两端都在、且**不是副本**」。
- **⚠️⚠️ 顺带量到的一处病（lib 层不该被 React 绑住）**：为了让 lib 里的工具能拿到 i18n，
  `clientTools.ts` import 了 `../i18n` ⇒ ⇒ 而那一侧带 **React 绑定**（`initReactI18next`）
  ⇒ ⇒ **测试里 35 个文件各自 mock 了一份 `react-i18next`**（多数**没有** `initReactI18next`）
  ⇒ ⇒ **谁 import 谁炸**（模块加载即失败）⇒ ⇒ 全量 vitest **3 个套件直接挂掉**。
- **✅ 修（i18n 拆成「内核」＋「React 绑定」）**：新 `src/i18n/core.ts`
  （实例 + 词条 + 配置 + `ensureI18n()`）⇒ ⇒ `src/i18n/index.ts` 只留 **React 绑定**
  （`use()` → `init()`）⇒ ⇒ **同一个实例**（`i18next` 的默认导出是单例）
  ⇒ ⇒ lib import `core` ⇒ ⇒ **不再拖 React**。
  ⚠️ **顺序不能反**：i18next v24 的 `use()` 只是**排队**（`i18next.js:1954`），
  真正调 `module.init(instance)` 的是 **`init()`**（`i18next.js:1834`）
  ⇒ ⇒ 反了 ⇒ `useTranslation()` 拿不到实例 ⇒ ⇒ **界面全是 key、而且不报错**。
- **✅ 两端 `report` 的措辞对齐 ＋ **机器钉住**：`report` 是**给模型看的那一句**
  ⇒ ⇒ 两端措辞不一样 ⇒ ⇒ 同一个模型在手机上和桌面上**读到的是两句话** ⇒ ⇒ 那也是漂移
  ⇒ ⇒ 桌面端文案改成与移动端**逐字相同**，并且桌面端用例**直接读移动端的 arb** 比对
  （中英各 4 句）⇒ ⇒ 任何一边改措辞 ⇒ 那条立刻红（**不是人工对齐一次就算**）。
  ⚠️ **坑**：i18next 的 `t(key, opts, lng)` **第三个参数不是语言**（是 defaultValue）
  ⇒ ⇒ 传了也还是中文 ⇒ ⇒ 断言会「看着像绿、其实比的是中文」⇒ ⇒ 切语言用 `getFixedT('en-US')`。
- **✅ 证据 + 反向验证**：新增 **11 条**（工具 8 ＋ 内联渲染 3）⇒ ⇒ 相关 6 个文件 **43 passed**；
  `tsc --noEmit` **EXIT=0**；⚠️ **反向验证三处各恰好 1 红**（判据退回「事件数 > 0」⇒ **恰好 1 红**；
  事件那一半不过滤 ⇒ **恰好 1 红**；卡片回退到原始结果 ⇒ **恰好 1 红**）＋ 措辞那条 **恰好 1 红**
  ⇒ ⇒ 有分辨力、不是恒绿。
- **⚠️ 还欠的**：**桌面端真机 UI 未验**（本轮是单测 ＋ 真渲染 ＋ 闸）；
  **端脑零改动**（走已有的 `tools` 透传 ＋ `tool_call` ＋ `await_tool_result` 管道 ⇒ 不新增协议
  ⇒ ⇒ `ConversationPage.tsx:404` 已经把 `tools` 发出去、`:408` 已经开了 `await_tool_result: true`）。
- **✅ 移动端那份已落地**（并行会话做的）：同一份契约（执行结果 = `{ report, a2ui_events }`，
  事件与 `fixtures/a2ui/tasks_sse.txt` **逐字同形**）⇒ ⇒ 全量 `flutter test` **507 passed / 0 failed**
  ⇒ ⇒ 跨端闸 `scripts/check-client-tools.mjs` **阻断 0 项**（`enum` / `required` / description 三处对齐）。
  ⚠️ **移动端那条「桌面端 report 写死中文 / 判据用事件数」的提醒是过期读数** ——
  它读的是本会话**修之前**的桌面快照 ⇒ ⇒ 桌面端**已本地化**（真 i18n，中英两端）＋ **判据已是 `beginRendering`**。


## STATE STATUS (2026-11-02, Cortex 清干净 —— 旧名按语义分家 ＋ 闸从「有闸」变成「机器可判」)

**Updated:** 2026-11-02 (Cortex 是过时概念，清理它以免与新方案（端脑 / telencephalon）混淆 —— 详见根 `AGENTS.md` 同日 ㋮ 条)

- **⚠️ 病（一个旧名指两样东西）**：「Cortex」同时指着**端脑进程/服务状态**与**海马体任务**
  （`tasks.cortexTasks` 的**值**本来就写着「海马体任务」，**键名**却还在说 Cortex）⇒ ⇒ 改名**按语义分家**，
  不能一刀切 ⇒ ⇒ 端脑族 ⇒ `telencephalon*`（界面文案统一「端脑」）／海马体任务族 ⇒ `hippocampus*`。
- **✅ 桌面端源码侧（32 个文件）**：i18n 中英（**zh 48 个含 Cortex 的键 / en 34 个**全部改掉，
  另**补上英文缺失的整段** `telencephalonStatus.*` —— 此前英文下整段回落**中文默认值**）＋ store（7 个字段/方法）
  ＋ lib ＋ pages ＋ components ＋ **`CortexTaskSection.tsx` ⇒ `HippocampusTaskSection.tsx`**（组件名 ＋ testid）
  ＋ 传输层类型（`CortexWireChunk` ⇒ `TelencephalonWireChunk` 等）＋ `src-tauri` 的
  **`cortex_http.rs` ⇒ `telencephalon_http.rs`**（模块 ＋ tracing 前缀 ＋ 6 处引用 ＋ `Cargo.toml` 注释）。
- **✅ 顺带清掉的三处「界面在说谎」**：① `discover_cortex` 这个 Tauri 命令**压根没注册** ⇒ 「Cortex 实例」
  那段 UI **永远空** ⇒ 整段删了；② `AgentsResponse.cortex` 是**过期字段**（服务端 `shadow.rs:288` 早就返回
  `"telencephalon"`）⇒ 客户端 `resp.cortex?.id` **永远是 undefined** ⇒ 改读 `resp.telencephalon?.…`；
  ③ 两个**假落点**：`/api/cortex/admin/agents/install`（真路径是 `/api/telencephalon/admin/agents/install`）
  与 `~/.shadow/cortex/llm-config.json`（**Rust 侧压根没人读它**）⇒ 改成真路径 ＋ 把旧名写进注释当**历史对照**。
- **⚠️⚠️ 顺带量到的真病（video-sources 的 wire 是坏的）**：桌面端发 camelCase、服务端 DTO 是 snake_case
  ⇒ ⇒ `device` 块整体反序列化失败 ⇒ ⇒ PUT body 被拒（**422**）⇒ ⇒ 而客户端 `.catch(() => {})` 吞掉 ⇒ ⇒
  **失败长得像成功** ⇒ ⇒ 服务端 DTO 加 `#[serde(rename_all = "camelCase")]`（**服务端惯例本就是 camelCase**，
  见 `hippo_store.rs:193` ＋ `api/neuron_public.rs:27`；`hippo_store.rs:175-183` 记着「`rename_all` **曾经漏过一次**」）
  ＋ 客户端 `cortexVersion` ⇒ `telencephalonVersion`。
- **⚠️⚠️ 旧的 `scripts/check-cortex-residue.sh` 是「有闸」三个字的空壳**：**① 只看标识符** ⇒ 界面那句
  「启动 Cortex」**不在判据里**；**② 没进 CI** ⇒ 绿不绿没人知道；**③ 是 `.sh`** ⇒ 这台 Windows 机器**跑不了**
  （本机 WSL 无发行版）⇒ ⇒ **重写成 Node**（`scripts/lib/cortex-residue.mjs` **一处实现** ＋ 本目录薄壳）
  ⇒ ⇒ **词级判据** ＋ **兼容契约豁免清单**（token + 理由，**逐条登记**）＋ **防腐烂检查**（登记的 token 必须
  真的还在仓库里出现过，否则**退出码 2** = 判不了）＋ `--self-test`（4 条）＋ **接进 CI**。
  本目录现登记 **17 个 token / 40 处**豁免：旧环境变量别名（`CORTEX_ADMIN_KEY` 等）、旧 localStorage 键
  （`cortex_url`/`cortex_api_key` —— 改了旧 API key 就**擦不掉**）、旧持久化键（`shadow-cortex-store`）、
  真 PG 表名（`cortex_video_sources`）、wire 字段（`cortex_version`）、历史注释里的**被删类型名**
  （`CortexManager`）、旧路由（`/api/cortex/*` —— 保留当**历史对照**）、内部路由 `/cortex-status`。
- **✅ 顺带修好一道一直红的闸**：`scripts/check-brain-chain.mjs` 的 `desktop-sidecar-mounts-cortex` 规则
  **要求** `src-tauri/src/telencephalon_http.rs` 存在 ⇒ ⇒ 文件还叫 `cortex_http.rs` 时，这道闸**一直是红的**
  （`requireRule` 对缺文件是**阻断项**）⇒ ⇒ 本轮改名 ⇒ ⇒ **阻断 0 项 / EXIT=0**。
- **✅ 读数**：`tsc --noEmit` **EXIT=0**；全量 vitest **1334 passed / 1 failed**（唯一那条红是**基线红**：
  `tests/e2e/settings-lifecycle.test.tsx > Memory integration > renders storage path` —— 别人在飞地删了
  `settings.storagePathDefault` 键，**不是本轮引入**）；本目录闸 **0 残留 / EXIT=0**；**闸的反向验证**：
  真范围里种一次残留 ⇒ **恰好 1 红 / EXIT=1** ⇒ 删掉 ⇒ **0 红 / EXIT=0**；`src-tauri` `cargo check` **EXIT=0**
  （反向验证：模块名改回旧名 ⇒ **EXIT=101**，`error[E0583]: file not found for module cortex_http`）。
- **⚠️ 还欠的**：**真机 UI 未验**；**supervisor 徽章在撒谎**（`supervisor.enabled` 实为「端脑已挂载」，界面却写
  「监督器已启用」；`restartCount` **任何地方都不写** ⇒ 永远 0；`supervisorHelp` 描述的是**一个已被 `be50b7f`
  删掉的 respawn 机制**）⇒ ⇒ 本轮**只改措辞、没改语义** ⇒ ⇒ 那是另一个决定；**一批改名后仍是死键**
  （`agents.telencephalonStatus` 等无调用点）；**locale 大量既有缺键**（`identity.*`/`preview.*`/`voice.*`…）。

## STATE STATUS (2026-11-02, 「端口被占了，凭什么不告诉你」—— 端脑面抢占 ＋ 自愈 ＋ 说真话)

- **⚠️ 事故（02:57）**：用户报「错误: Failed to get models: error sending request for url
  (http://127.0.0.1:56334/v1/models)」。
- **✅ 真因（三段取证）**：
  - **(a)** 桌面端自己的端脑面**没起来** —— 启动日志
    `target/debug/logs/shadow.2026-11-01.log:214`：
    `bind 127.0.0.1:60080 failed (…只允许使用一次。 (os error 10048))`
    ⇒ 占着 60080 的是一台**独立端脑服务器**（`encephalon-server.exe --port 60080`）。
  - **(b)** 旧代码只 warn 一句就**放弃** ⇒ ⇒ 前端**照常**连 60080 ⇒ ⇒ 连上的是**别人的端脑**。
  - **(c)** 那台独立端脑的叶区指向**它自己的临时端口 neuron**
    （`encephalon/src/a2a_server.rs:122` 的 `neuron_port: 0` ⇒ `point_lobes_at_neuron`
    ⇒ **56334**）⇒ ⇒ 那颗 neuron 已经不在了 ⇒ ⇒ `get_available_model`
    （`telencephalon/src/lobes/mod.rs:445`）打 `/v1/models` 被拒 ⇒ ⇒ 端脑把那句
    transport 错误**原样**吐给界面。
  - ⇒ ⇒ **用户不是在跟自己的大脑说话** —— 他跟一台残留的独立端脑说话，
    而那台还在跟一颗死掉的 neuron 说话。
- **✅ 修（一处实现，两个动作）**：新 `src-tauri/src/brain_face.rs`
  （`BrainFaceStatus` ＋ `BrainFaceHandle` ＋ `classify_bind_error` ＋ `bind_until_owned`）：
  - **(a) 自愈**：绑不上 ⇒ 记下**真实原因** ⇒ **每 3s 重试** ⇒ 占的人一走就接管
    ⇒ ⇒ 桌面端从此**拥有** 60080（前端不再可能连到陌生的大脑）。
  - **(b) 说真话**：Tauri 命令 `get_brain_face_status` 暴露状态 ⇒ 前端
    `src/components/chat/BrainFaceBanner.tsx` 在 `conflict`/`failed` 时出**红字横幅**
    （带系统错误原文）⇒ 「现在连的不是这个 App 的大脑」摆到明面上。
- **✅ 顺带修的（客户端那一半）**：`src/lib/hippocampusClient.ts` 的响应解析改成
  「先读文本 ⇒ 是 JSON 就解析 ⇒ 不是 ⇒ **把服务端那句话原样说出来**」
  ⇒ ⇒ 不再抛「Unexpected token ''S'', "Storage er"... is not valid JSON」
  （= 用户上一条报的那句），而是显示真正的理由
  （「服务端回的不是 JSON（HTTP 200）：Storage error: … No field named tenant_id」）。
- **✅ 证据 + 反向验证**：
  - **独立验证台**（`%TEMP%\brain-face-check`，用 `#[path]` **直接引入真模块**）：
    占住端口 ⇒ `conflict / owned=false / error=Some("…os error 10048")`（系统错误原文）
    ⇒ 占的人一走 ⇒ `listening / owned=true` ⇒ **接管成功**（`SELF-HEAL OK`）。
    **反向验证**：削弱①（失败时不说 conflict）⇒ **恰好 1 条断言红**；
    削弱②（接管后不说 listening）⇒ **恰好 1 条断言红**；还原 ⇒ EXIT=0。
  - 前端横幅 **6 条真渲染测试**全绿 ⇒ 削弱「横幅永远不出现」⇒ **恰好 3 红**、
    「不渲染真实原因」⇒ **恰好 1 红**、还原 ⇒ 6/6 再绿。
  - 海马体客户端 **13 条**全绿 ⇒ 退回**真旧代码**（`response.json()` 且没有 catch）
    ⇒ **恰好 1 红**。
  - `cargo check --lib` **EXIT=0**（35 个既有 warning，零新增）；
    `tsc --noEmit` 我的三个文件**零红**（其余红在并行会话在飞的文件里）。
  - **全量 vitest：138 文件 / 1335 passed / 0 failed / 5 skipped** ⇒ ⇒ 顺带把
    **上一轮留下的**一条过期断言收了（`tests/e2e/settings-lifecycle.test.tsx` 还在等
    `settings.storagePathDefault` —— 那个键早就删了 ⇒ ⇒ 现在改成钉
    「**显示真路径** ＋ **假地址不许回来**」）。
- **⚠️ 还欠的**：
  - **(a)** 桌面端 **exe 没能重新链出来** —— 两个原因叠着：① `link.exe` 连撞
    **LNK1102 内存不足**（这台机器同时有别人的 cargo 在编，峰值 4.5GB+）；
    ② **海马体仓有在飞的改动把编译搞挂了**
    （`hippocampus-storage/src/lance/temporal_dataset.rs:193/194/208` 的
    `replace('\'', ''')` 转义被改坏 ⇒ ⇒ 桌面端依赖它 ⇒ ⇒ 链不出来）
    ⇒ ⇒ 「App 进程内自愈 ＋ 真机横幅」等这两样都清了再验（**不是我的改动挡着**）。
    ⚠️ **用户现在跑的还是 02:54 那个旧 exe**（它的端脑面**绑得上** 60080 ⇒ ⇒
    「Failed to get models」已经好了）⇒ ⇒ **新代码要等重链才生效**。
  - **(b)** **服务端**那一半没改：海马体的 handler 仍把 `Err` 映射成 **200 + 纯文本**
    ⇒ 应改成 4xx/5xx ＋ JSON 错误体（第三仓改动 ＋ 重链）。
  - **(c)** **schema 迁移**没做：盘上那份 `memory.lance` 是旧版写的、缺 `tenant_id` 列
    ⇒ ⇒ 海马体仓**故意**不做自动迁移（`schema_guard.rs` 模块注释：「rule 10」）⇒ ⇒
    「迁移（保留旧记忆）」还是「重灌（丢旧记忆）」**要用户拍板**。
- **✅ 顺带把「地址归属」定下来（台架脚本那一半）**：`scripts/start-a2ui-live-brain.ps1`
  的**默认端口就是桌面端端脑面的 60080** ⇒ ⇒ 它是**故意**抢同一个端口 ⇒ ⇒
  这就是本次事故的**根** ⇒ ⇒ 三处改动：
  ① **默认端口改 60091**（台架用自己那份，**别抢**）；
  ② **端口已被占 ⇒ 报出是谁（进程名 ＋ pid）并拒绝起**（退出码 3）
  —— 旧实现是「端口上在听的统统杀掉」⇒ ⇒ 那可能是**用户的桌面端**；
  ③ **`-Stop` 只停这个脚本自己起的那个**（记 pid 文件）⇒ ⇒ 旧实现按端口杀
  ⇒ ⇒ 一句 `-Stop` 会**杀掉用户的桌面端**。
  ⇒ ⇒ **真机验证**：`-Port 60080` ⇒ 「端口 60080 已经被占用：shadow-desktop
  (pid=51308)」＋「不抢、不杀」＋ **EXIT=3**，桌面端**毫发无损**；
  `-Stop -Port 60080` ⇒ 「没有本脚本起过的实例记录 —— 什么都不停」＋
  桌面端**仍在**。

## STATE STATUS (2026-11-02, Cortex 清干净的**收尾** —— 闸从「词级白名单」升级成「白名单 ＋ 上下文限定」，顺带修掉 video-sources 的三方三种写法)

- **✅ 闸读数**：桌面端主流程 **0 处残留 / EXIT=0**（491 个文件）；自检 **5 条全绿**
  （本轮新增第 ⑤ 条「`history` 类豁免的**上下文限定**必须生效」）。
- **⚠️⚠️ 判据升级（豁免分两类）**：`contract`（真契约 ⇒ 任何位置豁免）＋ `history`
  （史证 ⇒ **只在注释 / 文档行**豁免，出现在代码行 ⇒ 判红）⇒ ⇒ 桌面端那 7 条
  「只在注释里出现的旧名」（`CORTEX_CONFIG` / `cortex_configure_llm` / `.shadow/cortex` /
  `\`cortex\`` / `cortexVersion` / `CortexManager` / `test_cortex_manager_initial_state`）
  全部降级为 `history` ⇒ ⇒ **注释里的改名史合法、代码里的旧名判红** ⇒ ⇒ 而
  `cortex_url` / `cortex_api_key` / `shadow-cortex-store` / `cortex-status` / `api/cortex`
  **落在代码行**（localStorage 键、路由、e2e 里「断言旧路由不存在」）⇒ ⇒ 留 `contract`。
- **⚠️ 顺带订正一处假话**：桌面端那条 `cortex_video_sources` 的理由原写「真实 PG 表名 ——
  改了查不到数据」⇒ ⇒ **实测是假话**（该表早已 RENAME，B2d 后数据在海马体）⇒ ⇒ 已删
  （随 `src-tauri/src/video_source.rs` 的注释改写一并消失，闸的防腐烂判据随即报「已腐烂」
  ⇒ ⇒ **这条机制当场证明自己有用**）。
- **⚠️⚠️ 顺带修掉一处真 wire 不匹配（video-sources 三方三种写法）**：端脑 DTO 说 snake_case、
  桌面端 TS 说 camelCase、桌面端 Rust 壳又说 `cortex_version` ⇒ ⇒ **桌面端 PUT 一直 422**
  （serde 静默丢字段 ⇒ 整块 `device` 反序列化失败）⇒ ⇒ 而客户端是 `.catch(() => {})`
  ⇒ ⇒ **失败长得像成功**；**GET 侧**桌面端读 `activeId`、服务端回 `active_id`
  ⇒ ⇒ 活动源恒为 undefined ⇒ ⇒ 目录看着永远是空的。
  - 改法：端脑三个 DTO 加 `#[serde(rename_all = "camelCase")]` ＋ `Option` 字段补 `default`；
    **桌面端 Rust 壳**（`src-tauri/src/video_source.rs`）的 `cortex_version` ⇒
    `telencephalon_version`，三个 DTO 一并加 camelCase。
- **⚠️⚠️ 顺带发现一条死路径**：`src-tauri/src/video_source.rs` 那 4 个 Tauri command
  （`enumerate_uvc` / `probe_capabilities` / `push_thalamus` / `sync_health`）
  **在前端一个调用点都没有** —— 桌面端走的是 HTTP `/api/telencephalon/video-sources`
  ⇒ ⇒ 本轮只改名 ＋ 把注释改成说实话（它原注释说「保留 `device.cortex_version` 以兼容旧
  wire」⇒ ⇒ **它根本不过 HTTP** ⇒ ⇒ 那是句空话）⇒ ⇒ **删它**是另一笔（牵动在飞的
  `src-tauri/src/lib.rs`）。
- **✅ 证据 + 反向验证**：`tsc --noEmit` **EXIT=0**；闸 **0 处 / EXIT=0**；**反向验证**：
  在 `src/` 种一次普通残留 ⇒ ⇒ **恰好 1 红** ⇒ ⇒ 撤掉 ⇒ ⇒ **0 红**（正控）。
- **⚠️ 还欠的**：**两端真机 UI 都未验**；桌面端 `src-tauri` 的 `cargo check` 本轮**跑不了**
  —— 被**海马体仓的在飞改动**挡住（`hippocampus-storage` 编不过 ⇒ 端脑编不过 ⇒ 桌面端也编不过）
  ⇒ ⇒ ⚠️ 端脑那条「只关 hippocampus feature」的绕法**对桌面端不适用**（本仓**直接依赖**
  `hippocampus-server` ＋ **显式开** `features = ["hippocampus"]`）⇒ ⇒ 本轮用**独立 serde 小台**
  验掉了 serde 语义（桌面端 Rust 壳那三个 DTO 与端脑的**逐字同形** ⇒ ⇒ 已被覆盖）＋ grep 确认
  `DeviceBlock` **只在 `video_source.rs` 里出现** ⇒ ⇒ 改名**无其它引用面**
  ⇒ ⇒ ⚠️ 但**编译器没证过**（桌面端**绕不过**：本仓**直接依赖** `hippocampus-server` ＋ **显式开** `features = ["hippocampus"]` ⇒ ⇒ 端脑那条「只关 hippocampus feature」的路**对桌面端不适用** ⇒ ⇒ 端脑那边已用这条路证过（lib ＋ test cfg 各 `EXIT=0` ＋ 3 条 wire 单测**真跑通过**），桌面端只能等海马体仓那笔收尾）；⚠️ **2026-11-02 更新：欠因换了一个，欠账本身还在** —— 海马体仓那 3 个语法错**已被那个会话修好**（`hippocampus-storage/src/lance/temporal_dataset.rs` 现在是 `replace('\'', "''")`）⇒ ⇒ 端脑 `cargo check --all-targets` 本轮 **`CARGO_EXIT=0`**（端脑那 14 个「编不过的集成测试文件」本轮清零，详见父仓 ㋵ 条）⇒ ⇒ 但**桌面端 `cargo check` 仍红**：端脑 `BuildOptions` **被并行会话新加了 `control_plane` 字段**（未提交）⇒ ⇒ 桌面端 `src/telencephalon_http.rs:145` 的初始化少这个字段 ⇒ ⇒ **`E0063 missing field control_plane`** ⇒ ⇒ **`CARGO_EXIT=101`**。⚠️ 那个文件是**未跟踪的新文件**（并行会话刚创建）⇒ ⇒ **在飞** ⇒ ⇒ **不碰**（碰了就是覆盖在飞工作）⇒ ⇒ 也**不能**用 `paths` 覆盖绕开（端脑 HEAD 没有 `control_plane`，但那个在飞文件用的 `build_app_state_with` / `build_full_app` 也可能是新 API ⇒ ⇒ 覆盖只会把「一个错」换成「一大片错」）⇒ ⇒ 桌面端 Rust 侧本轮只有**降级证据**：① 桌面端 `video_source.rs` 的三个 DTO 字段名与 camelCase 约定**与端脑那份逐项一致**（唯一差别：时间字段 `String` vs `DateTime<Utc>`，serde 层面同为 ISO8601 文本 ⇒ 方向兼容）② `telencephalon_version` **全仓无外部引用点** ⇒ ⇒ **改名本身的编译风险为零** ⇒ ⇒ 但**编译器仍然没证过**（等并行会话接上 `control_plane`）；**全量 vitest** 本轮未重跑（本轮只动 Rust 壳 ＋ 闸脚本，不碰 TS 源码）。

## STATE STATUS (2026-11-02, 客户端收成一张面 —— 「所有的入口都在大脑」)

- **✅ 用户拍板**：「**坚持嵌入式，所有的入口都在大脑，由大脑负责路由和分发**」⇒ ⇒ 本仓的
  客户端**只有一个**后端地址（大脑那张面）⇒ ⇒ `src/lib/platform.ts` 的 `neuronUrl()`
  （`VITE_NEURON_URL` / `:8085` / `:8083`）**删掉**（留一段历史注释说明它为什么没了）。
- **⚠️⚠️ 订正一个假前提（它还写在三处测试里）**：旧断言说「端脑面上**没有** `/v1/models`，
  本地模型只可能走 neuron 自己的端口」⇒ ⇒ **那是错的** —— 端脑**把 neuron's route table 挂在
  根上**（`telencephalon/src/api/mod.rs` 的 `build_full_app` ⇒ `outer.merge(neuron_router)`）
  ⇒ ⇒ 脑面上**本来就有** `/v1/models`。
  - **运行时实测**（2026-11-02，桌面端 pid 51308 活着）：`GET 60080/v1/models?engine=llm`
    ⇒ **200 / total=13 / available=4**，与 `GET 8085/v1/models?engine=llm` **逐项相同**
    ⇒ ⇒ 同一份 registry ⇒ ⇒ 「绕过去看的是另一份清单」这个担心**不成立**。
- **✅ 改了什么**：
  - `src/lib/modelConfigProbe.ts`：两发探测（`/models/providers` ＋ `/v1/models`）**同一个 base**
    （`telencephalonClient.getBaseUrl()`）⇒ ⇒ 「同一张面」从注释变成**结构**。
  - `src/pages/ModelsPage.tsx` ＋ `src/components/business/LocalEnginePanel/LocalEnginePanel.tsx`：
    14 处 base 全部改成**函数内**的 `const BRAIN_BASE = telencephalonClient.getBaseUrl();`
    ⇒ ⇒ ⚠️ **模块级常量在 import 时就定死** ⇒ ⇒ 用户改了设置里的地址，这两页还在打老地址
    ⇒ ⇒ 「供应商来自新大脑、本地模型来自老机器」—— 同一个页面两张脸。
  - `src/components/AppInitializer.tsx`：那段「两张面，两个 base」的注释**订正**成「一张面」。
- **⚠️⚠️ 顺带修掉一处「我的改法把闸判失效了」**：providers 凭据闸靠「URL 里第一个
  `${标识符}` ⇒ 追它的赋值」判「这一发打的是哪张面」⇒ ⇒ 我第一版写成 `${brainBase()}`（**带括号**）
  ⇒ ⇒ 闸退到第二个插值 `${id}` 上 ⇒ ⇒ 4 处「**判不了**」（= 判不了 ≠ 没问题）⇒ ⇒ **没有改闸**，
  而是**把代码改回仓库既有惯例** ⇒ ⇒ 闸恢复 **绿 8 / 红 0 / 判不了 0**。
- **✅ 闸长到 8 条 ＋ 自检**（`scripts/check-brain-chain.mjs`）：⑦「客户端不许知道 neuron's 地址」
  （代码行里有 `neuronUrl` / `VITE_NEURON_URL` / `:8085` / `:8083` ⇒ 判红；**注释里提到 ⇒ 不判红**）
  ＋ ⑧「本地模型那一半必须从 client 取 base」（且 `platform.ts` 不得再导出 `neuronUrl`）
  ⇒ ⇒ `--self-test` **9 条全绿**（含正控）⇒ ⇒ **反向验证**：真范围种一次残留 ⇒ **恰好 1 红 /
  EXIT=1**；同一 token 挪到注释行 ⇒ **0 红 / EXIT=0**；删掉 ⇒ **0 红**。
- **⚠️⚠️ 顺带量到一个真缺口（本轮没改）**：脑面上的 **`/v1/*` 不过门** ⇒ ⇒ 实测
  `GET 60080/v1/models`（**不带任何钥匙**）→ **200**，而 `GET 60080/models/providers` → **401**
  ⇒ ⇒ neuron's OpenAI 兼容面（含 **`/v1/chat/completions` = 推理面**）在脑的端口上**敞开**
  ⇒ ⇒ 桌面上是 loopback（威胁模型 = 本机进程）⇒ ⇒ 但独立端脑 `--bind 0.0.0.0` 时等于把推理面敞开
  ⇒ ⇒ 那是**端脑仓门型表**的范围 ⇒ ⇒ 本轮没改，登记在此。
- **✅ 验证**：`tsc --noEmit` **EXIT=0**；全量 vitest **140 文件 / 1351 通过 / 0 失败 / 5 跳过**；
  脑链闸 **EXIT=0**（442 文件）；凭据闸 **EXIT=0**；其余 10 道客户端闸全绿。
- **⚠️ 还欠的**：本轮改动**未提交**（共享工作树混有他人在飞的改名 sweep）；**两端真机 UI 未验**
  （这一轮是静态闸 ＋ 单测 ＋ 活机 HTTP 取证）；「本地模型那一族」的其余部分（5 份硬编码供应商表
  ＋ 移动端 SQLite 模型库）还没统一。
