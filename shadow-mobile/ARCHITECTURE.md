# shadow-mobile 架构

> 本文描述**现状**。平台级架构见 [`../ARCHITECTURE.md`](../ARCHITECTURE.md)；改造全过程见 [`../docs/superpowers/architecture/2026-10-29-brain-chain.md`](../docs/superpowers/architecture/2026-10-29-brain-chain.md)。

## 进程模型

移动端是**一个 App 进程**：Rust 侧的嵌入式大脑（`libencephalon.so`）和 Flutter UI 在同一个进程里。

```text
┌─ shadow-mobile 进程 ────────────────────────────────┐
│  Flutter UI（Dart）                                  │
│    └── Riverpod / go_router                          │
│         │  MethodChannel 'com.ibloc.shadow/encephalon_runtime'
│  Kotlin 层（MainActivity）                            │
│    └── EncephalonRuntime ── JNI ──▶ libencephalon.so │
│                                          │            │
│                                          ├── 大脑      │
│                                          │    thalamus + ACP 总线
│                                          ├── 端脑 cortex_router 127.0.0.1:0
│                                          │    └── 叶区 temporal / prefrontal / parietal
│                                          └── 单一 neuron │
└──────────────────────────────────────────────────────┘
```

## 三条数据通路

### 1. 对话 —— 唯一链路，必须走端脑

```text
ChatNotifier.send()
   → TelencephalonClient.createConversation(systemPrompt: 人设)
   → POST /shadow/v1/conversations
   → TelencephalonClient.streamMessage(id, req)
   → POST /shadow/v1/conversations/{id}/messages:stream
```

端脑再往下走：意图路由 → 叶区 → neuron。**客户端不碰 neuron。**

这条链路两端**同形**：桌面端也是 `createConversation` + `streamMessage`，人设也是随会话创建送出。

### 2. 设备与本地能力 —— 不走端脑

BLE 配网、USB 音频路由、相机 / 麦克风 / 文件选择、VAD、唤醒词、TTS、MNN / LiteRT 引擎、SQLite 仓储 —— 这些是**设备能力**，本来就该在端侧，不经过端脑。

### 3. 遗留的前额叶方言 —— 与端脑**没有交集**

`lib/services/prefrontal_client.dart` 说的是**前额叶方言**：

```text
/api/sessions   /api/agents   /api/skills   /api/providers
/api/soul/*     /api/mcp/servers   /hippocampus/api/*
```

而嵌入式大脑挂起来的那条面说的是**端脑方言**：

```text
/shadow/v1/*   /api/telencephalon/*   /models/providers
```

**两者没有交集。** 所以 `PrefrontalClient` **不能**指向嵌入式大脑的端脑面 —— 那样只会把「连接被拒」换成「404」，反而更难排查。

仍然留在旧方言上的页面：灵魂、任务、记忆、提供商、技能、MCP、agent 列表。它们在端脑里**没有对应概念**，需要单独决定由零信任网络里的哪个服务提供（记忆按用户的要求走网络上的海马体，**不在移动端本地**）。

## 组件

| 组件 | 职责 |
|---|---|
| `services/encephalon/encephalon_mobile_service.dart` | MethodChannel 客户端；`start()` / `stop()` / `port` / `agentPort` |
| `services/encephalon/encephalon_mobile_provider.dart` | 把端脑面端口接上 client；端脑没起来时保持指向外部端脑 |
| `services/telencephalon/telencephalon_client.dart` | 端脑方言的**唯一**客户端（会话 / agent / 工作流 / 语音信令） |
| `providers/chat_provider.dart` | 对话状态机；持有 `_systemPromptProvider`（函数式，改人设不重建 notifier） |
| `agents/providers/agent_provider.dart` | 人设（`customPromptProvider`）、模型引擎、工具注册表 |
| `services/prefrontal/prefrontal_mobile_*` | 旧嵌入式前额叶（`libprefrontal_core_lib.so`）—— 遗留通路 |
| `providers/ai/` | 本地 LLM provider 封装（LiteRT / MNN / 前额叶）—— 保留，但不在对话链路上 |

## 关键约束

1. **对话不许直连推理。** 旧的 `MainAgentNotifier`（直接拿 `ModelEngine` 跑本地 MNN）已删除 —— 留着就可能被重新接上，移动端会静默退回旧链路。
2. **人设必须随会话创建送。** 之前的 `createConversation()` 不带 `system`，提示词设置页存的人设根本没进链路。
3. **Dart 初始化列表里不能写 `() => null`** —— `=>` 在初始化列表里有别的含义，会被解析成**构造器体**。用具名函数。
4. **`libencephalon.so` 缺失要优雅降级**，不能重抛 `UnsatisfiedLinkError`。
5. **ABI 只出 `arm64-v8a` 与 `x86_64`**；`build.gradle.kts` 里的 `abiFilters` 要 `clear()` 再 `addAll()`（在集合上「追加」等于什么都没限制）。

## 遗留与缺口

| 项 | 状态 |
|---|---|
| 灵魂 / 任务 / 记忆 / 提供商 / 技能 / MCP / agent 列表 | 仍走前额叶方言，嵌入式大脑不提供这些概念 —— **待定归属** |
| 移动端海马体 | 移动端脑**不带**海马体；记忆按设计走零信任网络上的远端海马体 |
| x86_64 jniLibs | 不完整（缺 `libc++_shared.so` 与 MNN 全家）—— 当前不崩，因为 Kotlin 层的 MNN 是死代码 |
| CI 产出的 APK | `libencephalon.so` 不入库，CI 目前**不会**带嵌入式大脑（主功能缺失，会优雅降级） |
| 去 Material | 未完成，`uses-material-design: true` 仍在 |
| 真机验证 | **未做**（设备失联） |
| 叶区 → LLM 端点 | 叶区默认端点是 `http://localhost:60080`，移动端**没有任何东西在听**（端脑面绑随机端口）⇒ 断链。已由大脑仓的 `point_lobes_at_neuron` 修掉（**已合并**）—— 叶区现在指向进程内 neuron 自己的 listener |

## 可执行的不变量

`node ../scripts/check-brain-chain.mjs` 拦下面 6 条（CI job `Brain chain check`）：

1. 桌面端客户端不得直连推理
2. 桌面端客户端不得有绕过端脑会话 API 的平台分支
3. 桌面端 sidecar 必须挂起端脑的 HTTP 面
4. 桌面端 sidecar 不得再暴露直连推理的 Tauri 命令
5. **移动端对话必须走端脑方言**（`/shadow/v1/conversations`）
6. **移动端不得保留本地直连推理的对话编排器**

## 本地校验

```bash
flutter analyze --no-fatal-infos --no-fatal-warnings
flutter test
node ../scripts/check-brain-chain.mjs
node ../scripts/check-agent-surface.mjs
```
