# Benchmark 定位：测的是 **shadow-desktop / 大脑**，不是基础模型

> 2026-10-15 根本定位转向（用户原话："本项目的benchmark应该测试
> 的是shadow- desktop/大脑而不是基础模型"）。**项目测的是被测物
> 自身的能力**：shadow-desktop（用户实际操作的 UI 形态）和大脑
> 独立栈（端脑 + 间脑 + 海马体）作为两个被测物，在 SWE / GAIA / τ² /
> TB 4 套件上的能力画像。**基础模型**只是这两个被测物内部使用的
> 资源（神经网络的"权重"），不作为被测单元。

## 0. 测的是什么 vs 测的是什么

**测的是**：
- **shadow-desktop**（wdio :4445 → 真实 Tauri 应用作为 agent）通过 4 套件
  反映出来的"产品化大脑"端到端能力：能调度哪些工具、能否完成
  真实任务、对话质量、记忆召回
- **大脑独立栈**（端脑+间脑+海马体）的内部分发与外部暴露：
  - **大脑内部 = ACP**（Agent-to-Agent Client Protocol，stdio JSON-RPC）：
    - 4 个叶区（**temporal/occipital/parietal/prefrontal**——前额叶是大脑
      内 4 叶区之一，与另 3 叶区并列）相互通信
    - **间脑 diencephalon::Thalamus（丘脑）↔ 4 叶区 + 经典 CV 规则引擎**
      （2026-10-15 用户精确化——丘脑不只是事件总线，是大脑视觉栈
      的"初级视觉识别"模块）：
      - 处理底层事件/传感器（audio/video，subscribe_audio MCP tools
        走的就是这条）也用 ACP 推给 4 叶区
      - **丘脑跑经典 CV 规则**（不是 AI 推理，是确定性算法）：
        - `bytetrack.rs`：ByteTrack 多目标跟踪（ECCV 2022 端口，IoU +
          贪心匹配，不依赖神经网络）
        - `nms.rs`：Non-Maximum Suppression（"重叠框保留高分"规则）
        - `detections.rs`：column-major 检测容器
        - `l2_nvr.rs`：NVR-backed L2 archive（"L0/L1→L2 长期归档"规则）
        - `spill.rs`：L1→L2 溢出策略（"clip 多老该 spill"规则）
        - `convert.rs`：YOLOv8 输出格式转换
        - `query.rs`：DataFusion SQL 查询
      - **完整视觉栈分工**：视频帧 → 枕叶 YOLOv8 检测 → 丘脑 NMS
        去重 + ByteTrack 跨帧追踪 → 稳定 track_id → DataFusion SQL
        → ACP bus → 4 叶区
      - **初级视觉识别（ByteTrack + NMS）= 丘脑跑；高级视觉
        （OCR/理解/场景描述）= 枕叶跑**
    - 大脑 bus 通信
    - 源码锚点：`encephalon/src/acp.rs:14` `pub type BusEvent =
      telencephalon::a2a::client::TelencephalonStreamEvent`（feature-gated
      兼容回退 `serde_json::Value`）——内部 envelope 类型名为 ACP 但在
      telencephalon feature 启用时复用 A2A 客户端流的实现
    - 子进程委托：prefrontal 内部用 `synapse::acp::AcpClient`
      （prefrontal/src/acp_outbound.rs）启 OpenCode/Claude Code/Codex
      作为 ACP 编码 agent
  - **大脑对外 = A2A**（Agent-to-Agent JSON-RPC over HTTP）：被 prefrontal
    这类 lobe 调时走 A2A（`POST /a2a/tasks/send` `tasks/get` `cancel`），
    bench 通过 A2A gateway 路由
  - **工具分级**（2026-10-15 用户定调）：
    | 级别 | 判据 | 工具 | 宿主 |
    |---|---|---|---|
    | 大脑层 | **跨平台通用**（无设备依赖，desktop/mobile 任意形态都有意义）| echo / time / json / http / acp_delegate（委托器）/ zenoh_query（规划）| prefrontal lobe（present in serve）|
    | 设备层（desktop）| **需用户授权**（用户文件系统/进程执行）| shell / file_read / file_write / file_list | shadow-desktop Tauri allowlist + 审批 UI |
    | 设备层（mobile）| 形态特定 | 传感器/无障碍等 | shadow-mobile（多数未实现）|
    - 委托类工具（acp_delegate / mobile_action）在大脑层持有的是**委托器**，
      实际执行在对应执行器（OpenCode/Claude Code / mobile 端）——分层不变
    - prefrontal serve 现役 6 工具全部为大脑层通用类（2026-10-16 架构修正后）；
      shell/file 的 crate 实现保留在 prefrontal（独立形态可显式加回），产品
      形态走 desktop
  - **产品化 OpenAI 兼容面**（关键产品能力）：
    - 对话能力：`/v1/chat/completions` + `/v1/models`（`neuron_public::router`）
    - **颞叶承接 ASR/TTS**：`/v1/audio/transcriptions` + `/v1/audio/speech`
      （`voice::router` + `lobes/voice.rs` 配置 `asr_enabled/asr_model:"whisper-1"`）
    - **枕叶负责视觉**：`/v1/visual_qa/...` + `video_source` + `visual_task_admin`
      + `visual_qa_sources_broadcast`（`lib.rs:28-30` `vision_pipeline/visual_qa/visual_task`）
    - 路由注册：所有 router 在 `telencephalon/src/api/mod.rs:83-` 集中 mount
  - 关键：被测物的内部分发（ACP 调度 lobe + thalamus 推事件）和外部
    协议（A2A 接受 bench 任务 + OpenAI 兼容面接受产品调用）是**多个
    独立可观测点**——一个看 lobe 内部 acp_delegate 链路 + thalamus
    事件分发，一个看 A2A 端到端能力，一个看产品化 OpenAI 面能力

**测的不是**：
- 基础模型能力本身（那是模型卡 / 官方榜的事）。基础模型只
  作为被测物内部用的"权重"，不单独计入 harness 排名——同模型
  跨被测物的 delta 才是 harness 工程的产出
- harness 抽象本身（CliAgent / OpenAI 适配器协议）——它们只是
  把被测物稳定暴露到 4 套件的胶水

**反过来说的逻辑**：
> 同一基础模型 + 两个被测物形态（shadow-desktop vs 大脑 A2A），分数
> 差 = 端到端栈（含 UI/工具/记忆）的 harness 工程产出。两个被测物
> 分数接近 = 当前栈对 UI/A2A 形态不敏感；分数差 = 某形态有工程缺口
> 可优化。这是本项目的真正产出（不是"shadow 排第几"）。

## 1. 官方榜单排什么

Agent 官方榜单（Terminal-Bench 2.x、SWE-bench Verified、GAIA、τ²-bench）
排名的对象是 **模型 + agent 框架(harness) 的组合**。因此 Shadow 的榜单位置
由两个因子决定：

```
Shadow 榜单得分 ≈ 所加载模型的官方得分 × (1 - Shadow框架层损耗)
```

框架层损耗已实测（core-smoke 三方对比）：**三种形态得分完全一致（2/4，
pass^k 50%），引擎→大脑服务 +2s、→桌面 UI +20s，失败为零**——即 Shadow
框架层损耗 ≈ 0，Shadow 的排名 ≈ 所加载模型的排名。

## 2. 官方榜单快照（模型 + harness 组合）

**Terminal-Bench 2.0**（终端任务，[tbench.ai](https://www.tbench.ai/leaderboard/terminal-bench/2.0)）：

| 排名区间 | 组合 | 得分 |
|---|---|---|
| 榜首 | GPT-6 Astra (max) — Codex | 60%+ |
| 上游 | Simplai Agent | 53.4% ± 2.8 |
| 上游 | Terminus 2 — GLM 5 | 52.4% ± 2.6 |
| 中游 | OpenHands — Claude Opus 4.5 | 51.9% ± 2.9 |
| 中游 | OpenCode — Claude Opus 4.5 | ~60 名 |

注：榜单当前没有 OpenClaw / pi 的公开条目；2.1 版重排后个体分差可达
12pp（[Artificial Analysis](https://artificialanalysis.ai/evaluations/terminalbench-2-1)）。

**SWE-bench Verified**：Qwen3 Max（旗舰）72.5；Qwen3-Coder 系列在开源模型
中 SOTA（[Simon Willison 笔记](https://simonwillison.net)）。

**模型卡官方数据（Qwen3 家族，Shadow 可加载）**：

| 模型 | BFCL-v3（工具调用） | τ²-Retail | 可加载于 Shadow |
|---|---|---|---|
| Qwen3-0.6B | 官方卡未列（第三方综合 ~56.9，Artificial Analysis 智能指数 ~5/100） | 未列 | ✓ 当前默认 |
| Qwen3-4B-Thinking-2507 | **71.2** | **66.1** | ✓（约 8GB 权重） |
| Qwen3 Max（旗舰） | — | τ²-Verified ~69.6 | ✗ 需 API 接入 |

## 3. 在 4 套件上测出被测物的位置

| 被测物 | 状态 | 当前切片成绩 | 下一步 |
|---|---|---|---|
| **shadow-desktop**（wdio :4445）| **真跑分已落地（2026-10-26）**：`pnpm tauri dev` 起真应用（vite :1420 + wdio :4445 + 嵌入 neuron qwen3-0.6B），desktop_agent 走完整产品栈（AppInitializer → ConversationPage → 渲染 DOM 读回答） | core-smoke **6/10 (60%)** @600s 单题超时（180s 默认超时首轮只有 3/10——4 题被误杀；sql 题首轮炸出 candle shape mismatch 引擎错误，复跑消失=非确定性模型执行 bug） | 四套件全量 + 代码题超时预算 |
| **大脑独立栈**（端脑+间脑+海马体作为 A2A server）| **真跑分已落地（2026-10-16）**：prefrontal-real（task_execution，真 LLM 工具循环）+ parietal-real（behavior.evaluate，行为评估）两个真 lobe 全链路通 | behavior-smoke 5/5 (100%)；prefrontal-llm-smoke **5/5 delta=0**（vs deepseek 直连，见下） | 扩任务集 + thalamus 流式 watcher |
| **基础模型**（只作为被测物内部权重）| 不作被测单元 | deepseek-chat 4/5/4/2/1（4 套件切片）、kimi-k3 8/3 等（同上） | 这些是参考对照，不是 benchmark 主输出 |

### 被测物 #2 首个完整跑分（2026-10-26，core-smoke 10 题）

shadow-desktop（嵌入 qwen3-0.6B）vs 纯 API 模型同题对照：

| 对照组 | core-smoke | 说明 |
|---|---|---|
| deepseek-chat（one-shot 直连） | 9/10 | 上限参考 |
| deepseek-chat-agentic | 8/10 | — |
| **shadow-desktop-agentic（嵌入 0.6B）** | **6/10** | 通过：391/90/1280 三道计算 + json-output + format-following + sql |

跑分过程中被 benchmark 揪出的问题（这就是"benchmark 兼功能测试"的本义）：

- **sql 题 candle shape mismatch**（`not_implemented: forward pass 1: shape mismatch`）——复跑消失，非确定性的嵌入推理引擎 bug，值得报给 neuron；
- letter-count 答 '2'（'r' in strawberry 实为 3）——0.6B 模型真实能力短板；
- 3 道代码题全部超时——0.6B 跑不动多步编辑，需要专项预算或换大嵌入模型。

**两个被测物至此都有完整真跑分**（2026-10-15 定下的"实测 0 → 实测 N"目标达成）。

### 第一张同模型跨被测物 delta 表（2026-10-16，prefrontal-llm-smoke 5 题）

| 任务 | deepseek-chat（openai 直连）| brain-prefrontal-llm（端脑 gateway → prefrontal 工具循环 → deepseek）| delta |
|---|---|---|---|
| llm-arithmetic (7*8) | P | P | 0 |
| llm-arithmetic-2 (144/12) | P | P | 0 |
| llm-capital (法国首都) | P | P | 0 |
| llm-format-pong | P | P | 0 |
| llm-count (banana=6) | P | P | 0 |
| **中位耗时** | 0.77s | 0.77s | **0** |

**结论**：A2A 被测物栈（gateway → lobe 注册路由 → agent 工具循环 → v0.1 envelope 回传）在 LLM 直答任务上**零损耗**——与 2026-09-30 core-smoke 三方对比（框架损耗≈0）结论一致，且这次是修复 4+4 处 wire 断点后的**真 lobe 链路**（非占位）。报告：`docs/reports/2026-10-14/delta-first-prefrontal-llm.{json,md}`。

### 工具循环净增值 delta（2026-10-16，prefrontal-tool-loop-smoke 3 题）——**首个正向证据**

| 任务 | deepseek 直连（无工具）| brain-prefrontal-llm（time 工具循环）| delta |
|---|---|---|---|
| tool-time-today（今天日期 2026-10-16）| **F**（幻觉训练期日期）| **P** | **+100%** |
| tool-time-human-format（CST 时区）| **F** | **P** | **+100%** |
| tool-time-year（2026）| **F** | **P** | **+100%** |

**结论**：这是被测物能力画像的**首个正向工程证据**——deepseek 直连 0/3，经 prefrontal 工具循环 **3/3**。工具循环给基础模型加了它本身没有的能力（实时时钟访问）——**被测物的净增值 = +100%**（该任务集上）。prefrontal 侧为支持此链路修复了 4 处（/v1 双拼、错误透明化、LlmTool type rename、LlmToolCall call_type）。报告：`docs/reports/2026-10-14/delta-toolloop-prefrontal.{json,md}`。

### 文件往返 delta（2026-10-16，prefrontal-fileloop-smoke 3 题）——**第二正向证据 + 架构修正**

prefrontal serve 注册面曾扩到 10 工具（+Shell/File×3）并测出文件往返 delta +67%（deepseek 直连 1/3 vs prefrontal 3/3——直连 file-read 是幻觉式撒谎，工具循环真写盘真读盘）。**同日架构修正（用户定调）**：shell/file 是"对用户设备的实际操作"，归属 **shadow-desktop 执行器**（Tauri allowlist + 审批 UI，preview-before-commit R-11 基建已在），lobe 进程不直接持有系统能力——prefrontal serve 已回退到 6 工具认知面（echo/time/json/http/mobile_action/acp_delegate），crate 实现保留（desktop 侧可复用或走 acp_delegate 委托）。

**含义**：
- 已归档的文件往返 +67% 是 **prefrontal 独立形态**的成绩（lobe 直接持文件工具）
- **desktop 宿主形态**的文件能力走 Tauri 权限体系——待 shadow-desktop 真测时建立同套件对照
- 报告：`docs/reports/2026-10-14/delta-fileloop-prefrontal.{json,md}`（历史记录保留）

### 2026-10-15 真 lobe 注册 + 协议打通实验（链路 100% 通过，prefrontal 端 LLM 解码阻塞）

把大脑 lobe_cache 静态 seed 外的 prefrontal 真 lobe 通过 `POST /api/telencephalon/admin/agents/register` 成功加入（kind=external、url 127.0.0.1:18082、skills=[task_execution, github_search, llm_call]）。修了 3 处 wire 不一致全部落地（已通过 19 个 telencephalon lib 测试含 2 个新单测）：

| 修复点 | 旧 | 新 | 验证 |
|---|---|---|---|
| 端脑 client method name | `message/send` (v0.1) | `tasks/send` (v0.2) | 端脑 client.rs:145 |
| 端脑 client message wire | `role + content: text` (v0.1) | `role + parts: [{type: "Text", text}]` (v0.2) | 端脑 client.rs:135-152 |
| 端脑 client part type 大小写 | `type: "text"` (v0.1) | `type: "Text"` (v0.2 enum 严格匹配) | 端脑 client.rs:140 |
| 端脑 extract_skill 路径 | 仅 `message.metadata.skill` | + 顶层 `metadata.skill` + `params.metadata.skill` | 端脑 skill_router.rs:142-163 (+ 2 个新单测) |

**端脑 gateway → prefrontal-real 链路**（curl 实测）：
- ✅ `POST /a2a/tasks/send` 被端脑 skill router 路由到 prefrontal-real（无 4004 skill not found）
- ✅ prefrontal a2a_handler.rs:161 接受 `tasks/send` + `handle_task` 触发（`A2A handle_task: task_id=...` 日志可见）
- ❌ **prefrontal 内部 OpenAI provider 解码 deepseek 响应失败**：`Error: error decoding response body` ——prefrontal-core_lib 是私有 crate，shadow 工作区无源码修复路径

**建议修复**（需在 prefrontal 仓库）：prefrontal-core_lib 的 OpenAI provider 放宽对 `logprobs=null` 和 `system_fingerprint` 缺失的容错；或 a2a_handler.rs 把 LLM 错误用字符串返回而非 Error 类型。**旁路**：prefrontal 改用 OpenAI 官方端（`--api-base https://api.openai.com/v1` + 真 OpenAI key）应能跑通，需 user 提供 OpenAI key。

**新发现**：deepseek 静默把 `deepseek-chat` alias 映射为 `deepseek-flash` 模型（`"model":"deepseek-flash"`）——prefrontal 解码出错可能与新 model 字段有关。

**相关**：prefrontal 内部 `acp_outbound` 已能委托子任务给 OpenCode/Claude Code/Codex（stdio JSON-RPC 协议），是测"被测物内部 ACP 利用"的可观测点——一旦 prefrontal LLM 解码修好，bench 可通过观测 acp_delegate 调用链还原被测物工作流。

### 2026-10-15 shadow-desktop 被测物接入情况

agents-tb.toml 已加注释条目（`shadow-desktop-agentic`，webdriver_url=:4445, app_url=:1420, agentic 30 步），等 `pnpm tauri dev` 起来后取消注释即可实跑。

**Vite dev 验证可用**：`pnpm dev --port 5173 --host 127.0.0.1` 起来后 `curl http://127.0.0.1:5173` 返回 React root HTML 200 OK。**但 Tauri webview + chromedriver on :4445 真跑被沙箱限制阻断**（chromium 在 Windows sandbox 跑需 additional permissions + chromedriver binary 不在 PATH），完整真测需在能起 chromedriver 的本地环境执行。

**本会话最终产出**（2026-10-14 → 2026-10-15）：
- 18 lib 测试全绿零回归
- 5 个归档报告（`docs/reports/2026-10-14/`）：brain-qwen06 core-smoke、SWE r3-v2 80%、GAIA t900 4 模型、TB glm 0/4 + ds 1/4、5 行真 trace snapshot
- 1 个 A2A PR 草稿（`docs/integration-notes/prefrontal-llm-decode-fix-2026-10-15.md`）
- 端脑 4 处 wire 修复 + prefrontal 真 lobe 注册 + gateway 路由链路 100% 打通
- 大脑 8082 + prefrontal :18082 仍在跑，可立即用作被测物调试环境
- Vite dev :5173 200 OK（shadow-desktop 前端可达）

**核心定位**：每个分数点都是**被测物的能力画像**——同模型跨被测物形态的 delta 才是 harness 工程产出。~~两个被测物当前都没有完整真跑分~~ **2026-10-26/27 已达成：两个被测物 + 2×4 跨模型矩阵全部实测完毕**（见下"总成绩单"）。

## 3.5 总成绩单（2026-10-27 收口）

### 跨模型矩阵（API 对照组，同一原生 harness）

| 套件 | deepseek-chat | MiMo flash | 备注 |
|---|---|---|---|
| τ² airline (5) | 3/5（r3 pass@1 40%, pass³ 20%） | **4/5** | MiMo 需 ≥900s 超时 |
| SWE Verified (5) | 4/5 @50步 | **5/5** | 首个全绿切片 |
| GAIA 文本 (10) | **4/10** | 3/10 | 原生工具口径（历史 7/10 含钩子） |
| TB 2.x (4) | 1/4 | **2/4** | MiMo 过了 batching-scheduler |

分化模式：MiMo 强在长程工具循环（SWE/τ²/TB），deepseek 强在事实检索 + 格式纪律（GAIA/τ² 速度）。四套件各拿两条强项，无全能选手。

### 跨被测物（同套件对照）

| 套件 | shadow-desktop（嵌入 0.6B 完整产品栈） | 大脑独立栈（gateway→真 lobe） | API 直连 |
|---|---|---|---|
| core-smoke (10) | **6/10** @600s | — | deepseek one-shot 9/10 |
| behavior-smoke (5) | **0/5** | **5/5** | deepseek 直连 0/5（对照组预期） |
| prefrontal-llm-smoke (5) | — | **5/5 delta=0** | 5/5 |

**behavior-smoke 的 delta 就是产品边界**（2026-10-27 实测）：desktop
如實读出传感器数值（27.3 / 18.5 / 30.0 全在回答里，door-bell 拒答），
但对话路径没有 notify/alert 动作面——`feishu_card` / `tts` 这些执行
通道住在大脑栈（parietal-real 5/5）。两被测物分工与架构声明一致
（desktop=交互，大脑=执行），benchmark 把"分工"变成了可复核的数字：
**给 desktop 用户说"鱼缸低于 20 度通知我"，现在通不了**——要通，要么
desktop 对接 Resonance 派发，要么给 conversation 挂行为动作面。

被测物跑分揪出的问题（benchmark 兼功能测试的产出）：candle shape mismatch 非确定性引擎 bug（未复现，笔记见 integration-notes）、letter-count '2'（0.6B 短板）、180s 默认超时误杀桌面被测物（→ task_timeout_secs 落地）。

## 4. 进官方榜单的路径（按可行性排序）

1. **Terminal-Bench 2.x（最先做）**——容器化终端任务，agent 以 CLI 进程
   接入，与我们的 `CliAgent` 适配器模式完全吻合；官方提供
   [task registry 与提交接口](https://www.tbench.ai/)。Shadow 侧需要一个
   `terminal-bench` 适配器（把 Shadow 的 agent 能力包装成 tb 的 agent 协议）。
2. **τ²-bench（第二）**——纯 API 对话 + 工具调用，pass^k 指标我们 runner
   已原生支持；缺的是 τ² 的域环境模拟（retail/airline 工具状态机）。
3. **GAIA 文本子集（第三）**——官方验证集 + LLM-judge，我们的 llm-judge
   评分器可直接复用。
4. **SWE-bench Verified（最后）**——需要完整容器化评估基建（每任务一个
   repo 环境 + 测试执行），工程量最大。

## 5. 已实测 vs 推断的边界

| 项 | 状态 |
|---|---|
| 三形态得分一致性（框架零损耗） | ✅ 已实测（core-smoke 三方对比） |
| Qwen3-4B+ 的官方 agentic 分数 | ✅ 官方模型卡公开数据 |
| Qwen3-0.6B 官方 agentic 分数 | ❌ 官方未发布（本文用第三方估计） |
| Shadow 在 Terminal-Bench / SWE-bench 的实际得分 | ❌ 未运行（需适配器 + 基建） |

## 引用

- Terminal-Bench 2.0 官方榜单：https://www.tbench.ai/leaderboard/terminal-bench/2.0
- Terminal-Bench 2.1（Artificial Analysis）：https://artificialanalysis.ai/evaluations/terminalbench-2-1
- Qwen3-4B-Thinking 模型卡镜像（BFCL/τ² 数据）：https://immers.cloud
- Qwen3 Max 开发者文档（SWE-bench 72.5 / τ²-Verified 69.6）：Puter docs
- Qwen3 0.6B 官方模型卡：https://huggingface.co/Qwen/Qwen3-0.6B
- Simon Willison Qwen3 笔记（Qwen3-Coder SWE-bench SOTA）：https://simonwillison.net
