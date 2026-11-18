---
**Updated:** 2026-11-17 (initial scenario; 用户诉求逐字：「新增测试场景 用户：帮我盯住前面的车移动了告诉我」；承 `2026-09-23-baby-cry-monitoring-scenario.md` 的「监控 → 事件 → 通知用户」环，**但把视觉那一格换成行车场景**)
**Status:** 🔵 草案 → 评审中
**Author:** shadow-desktop + shadow-mobile + telencephalon
**Spec companions:** none yet (this doc *is* the spec for the lead-vehicle motion watch flow)
**Plan companion:** none yet
**Layer coverage:** L4 (shadow-mobile / shadow-desktop UI) ↔ L3.5 (telencephalon 前额叶 intent + 调度) ↔ L2-equivalent (端脑 `vision_pipeline` + `visual_task` 逐帧 runner) ↔ L0 (hippocampus blob for frame evidence)
**Related docs:**
- `shadow/docs/superpowers/scenarios/2026-09-23-baby-cry-monitoring-scenario.md` — BC-01 走的是**同一形状**（订阅 → 事件 → 通知用户），只是事件源从**音频**换成**视频逐帧检测**；CW-01 的轮次与去重口径直接沿用它。
- `shadow/docs/superpowers/scenarios/visual-qa-scenarios.md` — VQA-06 是**连续视频对话**；CW-01 是它的**降噪版**（不聊天，只在事件发生时叫醒用户）。
- `telencephalon/src/visual_task/mod.rs` + `src/visual_task/runner.rs` — **本场景的发动机**（逐帧 runner ＋ 帧源工厂 ＋ 计数落库）。
- `telencephalon/src/lobes/intent.rs` — `Intent::VisualTask` 是本场景的**意图入口**（`target_class` 就是「前面的车」这个类别词）。
- `telencephalon/AGENTS.md` § 4-lobe model — 颞叶／枕叶／前额叶的规范映射。

---

## 0. Why this scenario exists

用户诉求逐字：「**帮我盯住前面的车移动了告诉我**」。

这一句里藏着**三个**要求，缺一个就做错：

| # | 用户话里的话 | 技术含义 | 缺了会怎样 |
|---|---|---|---|
| ❶ | 「盯住」 | **长驻监控**，不是一问一答 | 做成一问一答 ⇒ 用户问一次、答一次、然后没人再管 ⇒ ⇒ 「盯」这个字落空 |
| ❷ | 「前面的车」 | **一个持续存在的目标**，靠**空间关系**锚定（画面里正前方那辆） | 做成「画面里有车吗」⇒ ⇒ 路边停着的车也算 ⇒ ⇒ 报的不是「前面那辆」 |
| ❸ | 「移动了告诉我」 | **事件驱动通知**（变了才说，没变就闭嘴）＋ **要告诉我**（必须真的到用户眼前） | 做成轮询播报 ⇒ ⇒ 每秒刷屏 ⇒ ⇒ 用户静音 ⇒ ⇒ 等于没做 |

**它与既有场景的差别**：BC-01（宝宝哭）监控的是**声音事件**，CW-01 监控的是**空间状态的变化**。声音事件天然有「发生 / 没发生」二值；空间变化**没有**——车**一直都在**，变的是它**动了**。

⇒ ⇒ 所以本场景的核心不是「检测到车」（那是 `Intent::VisualTask` 已经有的），而是「**检测到车，并且它相对上一帧动了**」——**这是一个状态机，不是一次检测**。这是本场景存在的全部理由。

---

## 1. 思维链路（用户口述版 → 四叶区）

用户逐字口述的链路：

> 颞叶评估是视觉任务还要定时访问 ⇒ 通知前额叶 ⇒ 为枕叶创建定时任务 ⇒ 每秒钟执行一次 ⇒ 检查车辆是否还在 ⇒ 并把结果反馈到前额叶 ⇒ 前额叶根据结果结合任务内容决定要不要通知颞叶 ⇒ 给用户反馈。

**这一段是本场景的规格本体**，逐环节映射到四叶区与真实代码面：

| # | 用户口述 | 叶区 | 真实代码落点 | 状态 |
|---|---|---|---|---|
| 1 | 颞叶评估「是视觉任务**还要**定时访问」 | 颞叶 → 前额叶 | 意图分类产出 `Intent::VisualTask { question, target_class, cascade, source_hint }`（`telencephalon/src/lobes/intent.rs`） | ⚠️ **意图已存在，但「还要定时访问」这一半没被意图层表达**（见 §3 缺口 ❶） |
| 2 | 前额叶**为枕叶创建定时任务** | 前额叶 | ⚠️ **枕叶仓未被端脑装载**（`scripts/lib/brain-loaded-repos.mjs`：端脑真装上的叶区只有 prefrontal ＋ diencephalon）⇒ ⇒ 「给枕叶派活」在**今天**不是一条可走的路 | ⚠️ **缺口 ❷（本场景最大的一处）** |
| 3 | **每秒钟执行一次** | 执行器 | 端脑 `visual_task/runner.rs` 的 `run_visual_task` **本身就是逐帧循环**（每拉一帧跑一次 cascade）；`MAX_FRAMES_PER_TASK = 86_400`（≈24h @ 1Hz） | ✅ **已有**（但它不是「定时任务」，是「常驻 runner」） |
| 4 | 检查车辆是否还在 | 视觉判定 | `vision_pipeline/cascade.rs` ＋ `models.rs`（`NeuronDetectorClient` → `/v1/vision/detect`）出 `Detections`；`vision_pipeline/tracking/mod.rs` 有 **ByteTrack**（含卡尔曼滤波 ＋ track 生命周期） | ✅ **部件都在，但没被接成「状态比较」**（缺口 ❸） |
| 5 | 把结果反馈到前额叶 | 回报面 | `VisualTaskStore` 记 `detections_total` / `last_frame_detections` / `last_frame_at`；出口是 `GET /api/telencephalon/visual-tasks/{id}` | ⚠️ **只回计数，不回「动没动」**（缺口 ❹） |
| 6 | 前额叶**根据结果结合任务内容**决定要不要通知 | 决策 | 前额叶仓有 `schedule.rs`（`RepeatSpec`：Daily／Weekly／**EveryMinutes**）＋ `server/schedule_runner.rs`（`TICK = 30s`） | ⚠️ **有定时器，但粒度是分钟、tick 是 30 秒 ⇒ ⇒ 承载不了「每秒一次」**（缺口 ❺） |
| 7 | 通知颞叶给用户反馈 | 通知 | 端脑 `lobes/notification_inbox.rs`（收件箱 ＋ 去重 ＋ 确认）＋ 移动端 `main.dart` 的 `ReminderInbox` 轮询（**送出去了才确认**） | ✅ **通道在**，但只跑「提醒」语义（缺口 ❻） |

### 1.1 链路图

```
用户（车内，手机支架）
  │ 「帮我盯住前面的车移动了告诉我」
  ▼
颞叶（shadow-mobile 对话页 / 桌面端）
  │ ① 判型：视觉任务 ＋ 需要持续访问
  ▼
前额叶（意图分类 + 派单）
  │ ② 建监控任务：target_class="car" ＋ 判据="动了" ＋ 源=手机后置相机
  ▼
枕叶面（⚠️ 今天 = 端脑内嵌的 vision_pipeline，不是 occipital 仓）
  │ ③ 逐帧：拉帧 → cascade 检测 → ByteTrack 跟踪
  │ ④ 每帧与上一帧比：位移/速度 > 阈值 ⇒ 事件
  ▼
前额叶（状态机 + 决策）
  │ ⑤ 结合任务内容（"移动了告诉我"）决定要不要叫醒颞叶
  │ ⑥ 去重：同一辆车的一次"移动"只报一次
  ▼
颞叶 → 用户
  │ ⑦ 通知：文字 + 可选 TTS；**送出去了才确认**
  ▼
用户（「前面的车动了」）
```

---

## 2. Scenarios

### CW-01 — Lead-vehicle motion watch (main flow)

**Setup**
- 用户在车内，手机固定支架，**后置摄像头**对着前方道路。
  - ⚠️ **镜头方向别搞反**（2026-11-17 更正）：行车场景要看的正是**后置**（对前方的路）。移动端 `in_app_camera_service.dart` 的 `open({ useFrontCamera = false })` **默认就是后置**（`_pickIndex(CameraLensDirection.back)`）；而 `video_frame_collector.dart` 里那句 `_currentCameraIndex = 0; // Start with front camera` 指的是**枚举顺序里的第 0 个**，**不是**「前置镜头」——真方向要看 `lensDirection`。⚠️ 前置对着的是驾驶员的脸 ⇒ ⇒ 用前置＝拍到人脸。
  - ⚠️ **第二处镜头陷阱**（2026-11-17 复核新增）：`_pickIndex` 找不到后置时返 **-1** ⇒ ⇒ `open()` 回落 `_index = 0` ⇒ ⇒ **可能静默变成前置** ⇒ ⇒ 对本场景这一格必须**响亮失败**（不许静默换镜头）。
- 端脑与影子（视觉）引擎已就绪：`RUNNER_NEURON_BASE_URL` 指到 neuron，neuron 侧有检测模型（YOLO/RT-DETR 一档）与 VLM（保底一档）。
- 移动端或桌面端已配置一路**可用取帧源**（见 §3 缺口 ❼：今天**没有**一条端脑拉得到的车载帧路）。
- 目标：前车是一辆**持续存在**的目标 ⇒ ⇒ 检测器必须能给出**稳定 track_id**，不能每帧换 id。

**Flow**

| # | Step | 组件 | 协议 | Detail |
|---|---|---|---|---|
| 1 | User NL input | 颞叶（UI） | local UI event | 用户说：「帮我盯住前面的车移动了告诉我」。 |
| 2 | 颞叶判型 | 颞叶 → 前额叶 | ACP／意图面 | 颞叶判断这是**视觉任务**＋**需要持续访问**（不是一次问答）⇒ ⇒ 产出 `Intent::VisualTask { question: "盯住前面的车移动了告诉我", target_class: "car", cascade: …, source_hint: 后置相机 }`。⚠️ 意图层必须能同时表达「类别」与「**事件判据**」（见缺口 ❶）。 |
| 3 | 前额叶建任务 | 前额叶 | 端脑 `visual_task` 面 | 前额叶把意图落成一条 `VisualTask` 行（`VisualTaskStore::create`）：`target_class="car"`、`question=` 原句、`frame_source_url=` 取帧源、`cascade=` 档位。**任务内容**（"移动了告诉我"）必须**随任务存下来**——第 5 步的决策要靠它。 |
| 4 | 常驻 runner 起跑 | 端脑 runner | in-process | `run_visual_task` 起一个 `tokio::spawn` 循环：**拉一帧 → 跑一次 cascade → 落一次计数**。取帧源由 `frame_source_from_url` 按 scheme 选：`http(s)://` → `HttpFrameSource`、`rtsp://` → `RtspFrameSource`、`a2a://` → `A2aFrameSource`、`zenoh://`、`local://`。⚠️ **未知 scheme 响亮地拒**（`UnsupportedScheme`）——不许静默丢帧。 |
| 5 | 逐帧检测 | 视觉面 | HTTP → neuron | `NeuronDetectorClient` → `POST {neuron}/v1/vision/detect`（`confidence_threshold` 默认 **0.25**）⇒ ⇒ 回 `Detections`（`BBox` ＋ 类别 ＋ 置信度）。低置信目标可由 VLM 保底复判（`CascadeConfig::Serial`／`Fusion`）。 |
| 6 | **跟踪与状态比较** | 视觉面 | in-process | ByteTrack 给每个目标**跨帧的 track_id**；这一帧的 track 与上一帧的 track 比：中心位移 / 尺寸变化 / 速度 ⇒ ⇒ 超过阈值 ⇒ ⇒ **运动事件**。⚠️ 这是**本场景唯一新增的机制**（缺口 ❸）——今天 `VisualTaskStore` 只有计数，没有"动没动"。 |
| 7 | 结果回前额叶 | 回报面 | in-process／轮询 | 运动事件（或本帧的观测摘要）回给前额叶。⚠️ 今天出口是 `GET /api/telencephalon/visual-tasks/{id}`（只有计数）⇒ ⇒ 事件要么**扩字段**、要么**走通知面**（见缺口 ❹）。 |
| 8 | 前额叶决策 | 前额叶 | in-process | 前额叶**结合任务内容**判断要不要叫醒用户：任务说"移动了告诉我" ⇒ ⇒ 运动事件**且**尚未通知过 ⇒ ⇒ 通知；任务说"每分钟报一次" ⇒ ⇒ 那是**轮询播报**，不该等运动事件。⚠️ 判据与任务内容必须**分开存**，否则两者的语义会互相污染。 |
| 9 | 去重 | 前额叶 | in-process | 同一辆车的一次"移动"**只报一次**：红灯停车 → 起步 ⇒ 报一次；起步后保持行驶（每帧都在"动"）⇒ **不许**每秒报一次。去重键＝（task_id ＋ track_id ＋ 运动事件段），且一段运动**结束后**才允许下一次。 |
| 10 | 通知颞叶 | 前额叶 → 颞叶 | ACP ／ 通知面 | 前额叶把事件交给通知通道 ⇒ ⇒ 颞叶渲染一句：「**前面的车动了**」（带可选证据帧）。 |
| 11 | 送到用户眼前 | 颞叶 → user | SSE ／ 系统通知 ＋ TTS | 移动端走 `ReminderInbox` 那套轮询（**送出去了才确认**，送不出去就留在端脑待办里、下轮再送）。可选 TTS 播报（`shadow.tts.enabled` 关着就只出文字）。 |
| 12 | 证据留档 | 视觉面 → hippocampus | MCP `blob_put` | 触发那一帧（或前后各一帧）落进 hippocampus：`video/<camera_id>/<iso8601>.jpg`。用户事后问「刚才那辆车是走了还是跟上了」⇒ ⇒ 能取回那一帧。⚠️ 证据是**可选**的（带宽敏感），但**事件本身**必须有。 |

**Acceptance**
- **端到端延迟**：运动发生 → 用户眼前收到通知 ≤ **2 s**（移动端；含取帧间隔 ⇒ ⇒ 感知上限就是 1 秒一帧 ＋ 一次检测 ＋ 一次决策）。
- **不刷屏**：一次"移动" ⇒ ⇒ **恰好一条**通知；持续行驶 ⇒ ⇒ **零条**额外通知（去重生效）。
- **不误报**：静止的前车 ⇒ ⇒ **零条**通知（哪怕检测器每帧都在报 car）。⚠️ 这一条**承重**——它是"事件驱动"与"轮询播报"的分界线。
- **不漏报**：连续两次「停 → 动」⇒ ⇒ **两条**通知（去重不许把第二次吃掉）。
- **诚实性**：帧源拉不到 / neuron 不可达 ⇒ ⇒ 通知里**说清是哪一环断了**，不许静默；事件**不许**在没拿到帧的时候假装发生。
- **可停**：用户说「别盯了」⇒ ⇒ 任务停（`DELETE /api/telencephalon/admin/visual-tasks/{id}` ⇒ `CancellationToken` 收口），且**幂等**（停两次不报错）。

---

### CW-02 — Static lead vehicle must not fire (false-positive guard)

**Setup:** 前车完全静止（等红灯），但检测器每帧都稳定报出这辆车。

**Flow**
1. 运动判定只看**跨帧变化**（位移 / 速度），**不看**"检测到了 car"。
2. 静止 ⇒ ⇒ 位移 ≈ 0 ⇒ ⇒ **零条**通知。
3. ⚠️ 反例钉住：若实现退化成"检测到 car 就报"⇒ ⇒ **红灯路口每秒一条** ⇒ ⇒ 用户 10 秒内关掉监控。

**Acceptance:** 静止 60 秒 ⇒ ⇒ **0 条**通知；检测器命中数可以是每帧 1（那是"它在"，不是"它动了"）。

---

### CW-03 — Target switch (前车换车 / 目标丢失)

**Setup:** 用户换车、或者前车并入车流、或者前车被别的车挡住。

**Flow**
1. 原 track 消失 ⇒ ⇒ ByteTrack 的 track 状态走 `Lost` → `Removed`。
2. ⚠️ **"目标丢了"≠"目标动了"** ⇒ ⇒ **不许**报「前面的车动了」。
3. 但**该说清楚**：「前车看不到了」是**另一条**消息（用户会想知道自己在跟哪辆车）。
4. 新出现一辆车 ⇒ ⇒ **不是**原目标 ⇒ ⇒ 不触发（除非用户重新指定"那辆新的"）。

**Acceptance:** 目标丢失 ⇒ ⇒ 最多一条**「目标丢失」**类消息、**零条**「移动了」消息；换车后不自动跟新目标。

---

### CW-04 — Multi-vehicle disambiguation (路上不只一辆车)

**Setup:** 画面里有 3 辆车（前车、对向车、旁边车）。

**Flow**
1. 「前面的车」靠**空间关系**锚定 ⇒ ⇒ 取**画面中心区域 + 距离最近**的那辆，不是"任意一辆 car"。
2. ⚠️ 距离不能靠 YOLO 的类别标签（没有）⇒ ⇒ 靠 **BBox 尺寸**（越近越大）＋ **画面位置**（越靠中越前）。
3. 锁定后**保持锁定**（track_id 不换），直到它消失。

**Acceptance:** 3 辆车在场 ⇒ ⇒ **只盯住一辆**；旁边车动作大 ⇒ ⇒ **零条**通知（它不是目标）。

---

### CW-05 — Notification delivery failure (送不出去)

**Setup:** 手机在后台且系统通知权限被拒，或常驻服务没开。

**Flow**
1. 运动事件发生 ⇒ ⇒ 端脑收件箱落一条。
2. 移动端轮询到它 ⇒ ⇒ **送不出去**（权限拒绝）⇒ ⇒ **不确认** ⇒ ⇒ 留在端脑待办里 ⇒ ⇒ 下轮再送。
3. ⚠️ **不许**因为"送不出去"就把它当已送达 ⇒ ⇒ 那等于用户永远收不到却显示"已通知"。
4. 恢复权限后 ⇒ ⇒ 补送（可能已经过时 ⇒ ⇒ 消息里带事件时刻，不是"刚刚"）。

**Acceptance:** 权限被拒 ⇒ ⇒ **不丢事件**、**不谎报送达**；恢复后能补送且带**真实事件时刻**。

---

## 3. Open work / dependencies（今天跑不通的原因）

按链路口径逐条列出。**每一条都标了它在链上的位置**，便于判断砍掉哪一环的代价。

1. **❶ 意图层表达不了「还要定时访问」这一半**（链路 ❶）
   - `Intent::VisualTask` 有 `question` / `target_class` / `cascade` / `source_hint` —— 但**没有**「事件判据」（"移动了"）这一格。
   - ⇒ ⇒ 现在只能说「盯摄像头找 car」，**说不清**「找到了报什么」。
   - 修法方向：意图层加一个**判据字段**（或把它塞进 `question` 让端脑自己解析——⚠️ 那更脆）。

2. **❷ 枕叶仓未被端脑装载**（链路 ❷ —— **最大的一处**）
   - `scripts/lib/brain-loaded-repos.mjs` 逐条核端脑 `Cargo.toml` 的 path 依赖 ⇒ ⇒ **真被装上的叶区只有 `prefrontal` ＋ `diencephalon`**；`occipital` / `temporal` / `parietal` / `amygdala` **不在**端脑里。
   - ⚠️ **本条已逐字复核（2026-11-17 实测）**：端脑 `Cargo.toml` 里的兄弟仓 path 依赖**只有** `synapse` / `prefrontal` / `neuron` / `hippocampus-core`（＋`hippocampus-server` / `hippocampus-storage` 可选）/ `diencephalon` ⇒ ⇒ **无 `occipital`、无 `temporal`、无 `amygdala`、无 `parietal`** ⇒ ⇒ 「枕叶」在**今天**是**一个名字，不是一个可调度的进程**。
   - ⇒ ⇒ 用户口述的「为**枕叶**创建定时任务」在**今天**不是一条可走的路。
   - ⇒ ⇒ **但本场景要的那套能力（cascade ＋ 检测 ＋ 跟踪）已经在端脑里**（`vision_pipeline/`、`visual_task/`）。
   - ⇒ ⇒ **两条路可选**（这是个**要用户拍板**的口径，见 §5）：**(A)** 把这套面**当枕叶面**用，链路写成"前额叶 → 端脑视觉面"（改动最小，能力立刻可用）；**(B)** 真的把 `occipital` 装进端脑（改动大，且要解决 wire 形状——承影仓 U+3551 条已证「端脑发 JSON-RPC、lobe server 收 REST，**从未对上**」）。

3. **❸ 没有「动没动」的判定，只有计数**（链路 ❹）
   - `VisualTaskStore` 记的是 `detections_total` / `last_frame_detections` / `last_frame_at` ⇒ ⇒ 「在不在」能答，**「动没动」答不了**。
   - ⇒ ⇒ ByteTrack（`vision_pipeline/tracking/mod.rs`）**已经实现了** track 生命周期 ＋ 卡尔曼滤波，但**没被接进 runner 的判定**。
   - 修法方向：runner 每帧跑完 cascade 后，比对上一帧 track ⇒ ⇒ 产出运动事件（阈值：中心位移 > N px **或** 速度 > M px/s）。

4. **❹ 回报面只回计数，不回事件**（链路 ❺）
   - 出口是 `GET /api/telencephalon/visual-tasks/{id}` ⇒ ⇒ 轮询方能读到"这一帧有 1 辆车"，但**读不到**"它动了"。
   - ⇒ ⇒ 事件要么**扩字段**（任务行加"最近一次运动事件"），要么**走通知面**直接投递。

5. **❺ 前额叶的定时器承载不了「每秒一次」**（链路 ❻）
   - `prefrontal/src/schedule.rs` 的 `RepeatSpec` 是 Daily／Weekly／**EveryMinutes{n}** ⇒ ⇒ **最细 1 分钟**；`server/schedule_runner.rs` 的 `TICK = 30s` ⇒ ⇒ **起跑延迟与扫描粒度都在秒级以上**。
   - ⇒ ⇒ **「每秒钟执行一次」不能靠它实现**。
   - ⇒ ⇒ 但**这件事本来就不该靠它实现**——逐帧检测是 `visual_task/runner.rs` 的**常驻循环**（拉一帧跑一次），**它天生就是 1Hz**（`MAX_FRAMES_PER_TASK = 86_400` 的注释写的就是「~24h at 1Hz」）。
   - ⇒ ⇒ **真正的分工是**：**逐帧判定归端脑 runner**（1Hz 常驻），**「要不要通知」的决策归前额叶**（不需要 1Hz，它只在**事件发生时**醒一次）。⚠️ 这一点把用户口述的链路**修正**了一处：定时任务的**执行体**不是前额叶的 scheduler。

6. **❻ 通知通道只跑「提醒」语义**（链路 ❼）
   - `telencephalon/src/lobes/notification_inbox.rs` 的 `NotificationType` 只有 `Reminder` / `Overdue` / `NeedsConfirmation` ⇒ ⇒ **没有「视觉事件触发」这一类**。
   - ⇒ ⇒ 移动端那套 `ReminderInbox` 轮询（**送出去了才确认**，这个纪律很好）可以复用，但**类型要加**。
   - ⇒ ⇒ 加类型时**别破坏去重语义**：收件箱的 `push_once` 是**每个任务只响一次** ⇒ ⇒ 车辆反复停走会**只报第一次** ⇒ ⇒ 视觉事件需要**按事件段去重**，不是按任务去重。

7. **❼ 车载取帧源没有一条现成的**（链路 ❸）—— **但正解已经写在仓里了**
   - 端脑 `resolve_visual_task_frame_source` 的优先级是：`source_hint` 里的显式 URL → **端脑自己的 active video source**（⇒ ⇒ `http://telencephalon-local/{id}/frame`）→ 空（⇒ ⇒ `LocalFrameSource::empty()`，runner 第一个轮询就退出）。
   - ⇒ ⇒ `telencephalon-local/{id}/frame` 这个 URL 是**内部构造**的 ⇒ ⇒ **它背后有没有真的帧服务，要单独验**；移动端 `VideoFrameCollector` 抓帧写**本地文件**，**没有**对外供帧的 HTTP 面。
   - ⚠️ **本条已逐字复核（2026-11-17 实测）**：在端脑 `src/api/` 全树按 `telencephalon-local` 与 `/frame` 搜 ⇒ ⇒ **零命中** ⇒ ⇒ 那条 URL **背后没有对应的 HTTP 路由** ⇒ ⇒ 它落到 `HttpFrameSource` 会**拉不到帧** ⇒ ⇒ 移动端那条 `VideoFrameCollector` 也**只写本地文件、不供帧** ⇒ ⇒ **今天这条链的物理入口是断的**。
   - ✅ **正解（仓里已有，不用起任何 HTTP 服务）**：端脑 `visual_task/frame_sources.rs` 有 **`local://` scheme** ⇒ ⇒ `LocalFrameSource::with_producer(task_id)` 返一对「源 ＋ 推帧器」，`LocalFrameProducer::push(Vec<u8>)` **把帧推进队列**，`LocalFrameSource::next_frame()` 从队列取（空则睡 5 ms 重试）。⚠️ `LocalFrameSource::empty()` 是**闭的**（`closed=true`）⇒ ⇒ 第一次取帧就 `Ok(None)` ⇒ ⇒ **runner 立刻退出** ⇒ ⇒ 所以「空源」不是「等帧」，是「直接死」。
   - ⇒ ⇒ **为什么这条正解成立**：端脑**内嵌在手机 App 里**（`shadow-mobile/lib/services/encephalon/encephalon_mobile_service.dart` 起 `libencephalon.so`）⇒ ⇒ 「手机后置相机 → 1 Hz 取帧 → `push` 一帧 → 同进程 runner 取走」**不需要起任何网络服务** ⇒ ⇒ **手机当端脑的帧源，物理上是最短的一条路**。
   - ⚠️ **2026-11-17 第二轮复核订正（这一条原先说反了）**：
     - ❌ **「端脑那一半齐了」—— 不成立**：`frame_source_from_url` 里 `local://` 落到的是 **`LocalFrameSource::empty()`**（`closed = true`）⇒ ⇒ 第一次取帧就 `Ok(None)` ⇒ ⇒ **任务第一帧就停**；而能注册 producer 的 `with_producer(task_id)`（它会把自己插进进程级 `DashMap` 注册表）**全仓只有测试在调**（`frame_sources.rs:762`）⇒ ⇒ **生产注册表恒空** ⇒ ⇒ `resolve_producer(task_id)` 恒返 `None` ⇒ ⇒ **连「可推的对象」都没有**。根因：工厂签名 `frame_source_from_url(url, max_frames)` **没有 task_id** ⇒ ⇒ 造不出带 task_id 的 producer。
     - ❌ **「手机侧要有一层 JNI／通道」—— 说重了**：端脑在 App 进程内**有一个真的 loopback HTTP 端口**（`agentPort`，Dart 侧照旧打 `http://127.0.0.1:<agentPort>`）⇒ ⇒ 推帧**一条 loopback POST 路由 ＋ 一行 Dart 调用**就够，**不必动 Kotlin／ABI**。
     - ⇒ ⇒ **欠的其实是两格**：**端脑侧 producer 接线**（工厂带 task_id ⇒ ⇒ `local://` → `with_producer(task_id)`）**＋ 手机侧推帧面**。
     - ✅ **这一格已被编译级读数坐实**（2026-11-17）：端脑 lib 测试里插两条**临时探针** ⇒ ⇒ ❶ 工厂造的 `local://` 源**第一次取帧就 Ok(None)**（是闭的）＋ ❷ 工厂造它时**注册表一个 producer 都不注册**（⇒ `resolve_producer` 恒 None）＋ ❸ **任务在第一帧前就被停掉**（status=Stopped，detections_total=0）⇒ ⇒ **真变异**（把那行改成 `with_producer(...)`）⇒ ⇒ **恰好那两条探针红、其余 26 条一条没红** ⇒ ⇒ 探针用完即删，端脑仓那两个文件**逐字还原**。
   - ⚠️ 另注：`frame_source_url` 这一格还**多一层**——`source_hint` 只认「**长得像 URL 的**东西」（含 `://`）⇒ ⇒ 手机本地路径（`/data/.../frame.jpg`）**不算 URL** ⇒ ⇒ 要么传 `local://<task_id>`，要么补一段「本地路径 ⇒ 本地源」的解析。
   - ⇒ ⇒ 这一格是**整条链的物理入口**：它不通 ⇒ ⇒ 后面全白搭。**真机那一格必须先取证**（别假设它在）。

8. **❽ 手机在后台／息屏时相机还能不能开 —— 平台策略，今天不行**（链路 ❸ —— **2026-11-17 第二轮复核新增**）
   - ✅ **权限层是通的**（三处读数）：
     - **声明**：`camera_android_camerax` 的插件清单里有 `android.permission.CAMERA` ⇒ ⇒ **合并后的 release manifest**（`shadow-mobile/build/app/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml`，构建于 2026-11-17 21:15）里**确实有 CAMERA**。
     - **运行期**：
`in_app_camera_service.dart::open()` 真申请 `Permission.camera`，被拒 ⇒ ⇒ 返 `permissionDenied`（与 `noCamera`／`failed` 分开 ⇒ ⇒ 不静默）。
     - **镜头方向**：`open({useFrontCamera: false})` ⇒ ⇒ `_pickIndex(CameraLensDirection.back)` ⇒ ⇒ **默认后置**。⚠️ **但**找不到后置时 `_pickIndex` 返 -1 ⇒ ⇒ 回落 `_index = 0`（**可能是前置**）⇒ ⇒ 对本场景，**静默换成前置＝对着驾驶员的脸** ⇒ ⇒ 该回落必须**响亮失败**。
   - ❌ **但「行车时常驻取帧」过不去平台那一关**：
     - targetSdk = **36**（Flutter 3.47.8 的 `flutter.targetSdkVersion = 36`）⇒ ⇒ 相机前台服务必须声明 `android:foregroundServiceType="camera"` ＋ `FOREGROUND_SERVICE_CAMERA`（Android 11+／14+）；**本仓只有 `dataSync`**（合并后的 manifest 里 `foregroundServiceType="dataSync"`，**没有 camera**）。
     - Android 12+：**App 在后台启动的前台服务不能访问相机** ⇒ ⇒ 前台服务必须**在 App 可见时**启动。
     - Android 15+：`dataSync` 前台服务有 **6 小时/24 小时**超时 ⇒ ⇒ 超过 6 小时的行程会被系统收走。
   - ⇒ ⇒ **这一格不是代码，是产品/平台口径** ⇒ ⇒ 要么走「camera 类型前台服务 ＋ 前台启动」这一档，要么接受「**只在 App 可见时取帧**」的降级 ⇒ ⇒ **不猜**。
   - ⇒ ⇒ ⚠️ **它决定取样器的形状** ⇒ ⇒ **要排在实现之前**（见评估文档 §5 的第 0 步）。

9. **❾ 移动端那条 1 Hz 取样器有三条债**（链路 ❸ —— **2026-11-17 第二轮复核新增**）
   - `shadow-mobile/lib/services/video_frame_collector.dart`（仓里**已经有** 1 Hz 定时抓帧）但：
     ❶ **完全不申请相机权限** ⇒ ⇒ 未授权机上 `availableCameras()`／`takePicture()` 抛异常 ⇒ ⇒ 被 `catch (e) { return false; }` **吞掉** ⇒ ⇒ **失败长得像成功**；
     ❷ 抓的是 **JPEG 文件**（`takePicture()`），**不是帧流**，而且**从不对外供帧** ⇒ ⇒ 不能直接当端脑的帧源；
     ❸ `_currentCameraIndex = 0; // Start with front camera` —— 这个 0 是**枚举顺序里的第 0 个**，**不是**「前置镜头」（真方向看 `lensDirection`）⇒ ⇒ **注释在骗人**。
   - ⇒ ⇒ 复用它当取样源时这三条债要**一起**处理 —— 否则「拉不到帧」会**静默**。

---

## 4. Acceptance checklist

**主流程（CW-01）**
- [ ] 意图层能同时表达「目标类别」＋「事件判据」。
- [ ] **镜头方向对**（后置，不是前置）⇒ ⇒ 且权限被拒时**说得出话**（`permissionDenied` 已有 ⇒ ⇒ 不许静默）。
- [ ] 一条任务行存得下**任务内容**（"移动了告诉我"），且第 5 步的决策读得到它。
- [ ] 逐帧 runner：拉帧 → cascade → **跨帧比较** → 运动事件。
- [ ] 运动事件能回到前额叶（出口可轮询或可订阅）。
- [ ] 前额叶：运动事件 ＋ 任务内容 ⇒ ⇒ 决策 ⇒ ⇒ 通知。
- [ ] 去重：一次运动 ⇒ 一条；持续行驶 ⇒ 零条额外。
- [ ] 通知到用户眼前，**送不出去不确认**。
- [ ] 可停，且幂等。

**反例（承重）**
- [ ] 静止前车 60 秒 ⇒ ⇒ **0 条**通知（CW-02）。
- [ ] 目标丢失 ⇒ ⇒ **0 条**「移动了」（CW-03）。
- [ ] 旁边车动作 ⇒ ⇒ **0 条**通知（CW-04）。
- [ ] 通知送不出去 ⇒ ⇒ **不谎报送达、不丢事件**（CW-05）。

**真机那一格**
- [ ] **车载取帧源验通**（❼）—— 没通之前，上面所有条都是**夹具上**的。
  - ⚠️ **走 `local://` 推帧那条**（推荐）：手机后置相机 1 Hz 取帧 ⇒ ⇒ `LocalFrameProducer::push` ⇒ ⇒ 同进程 runner 取走 ⇒ ⇒ **零新增 Kotlin／ABI**（但**需要一条 loopback POST 路由** ⇒ ⇒ 端脑侧 producer 接线得先修，见 ❼ 的复核订正）。
  - ⚠️ **平台闸也要过**（❽）：相机在后台／息屏下的可用性 ⇒ ⇒ 「camera 类型前台服务 ＋ 前台启动」这一档，或「只在 App 可见时取帧」的降级 ⇒ ⇒ **没定口径之前，真机那一格验的是半条链**。
  - ⚠️ **负控**：`LocalFrameSource::empty()` 是**闭的** ⇒ ⇒ 第一次取帧就退出 ⇒ ⇒ **「没接上」必须表现为「任务立刻停」**，不许表现为「安静地等」——后者会把断链藏起来。
- [ ] 真机上一轮完整跑：说那句原话 ⇒ ⇒ 收到一条「前面的车动了」。
- [ ] 真机上的**负控**：前车静止 ⇒ ⇒ 手机静默。

---

## 5. 需要拍板的两处口径

1. **枕叶面怎么办**（缺口 ❷）
   - **(A) 用端脑内嵌的 `vision_pipeline` 当枕叶面** —— 能力**今天就有**，链路写成「前额叶 → 端脑视觉面」，改动最小；代价是**与"四叶区"那套命名不一致**（得在文档里说清"这一格今天住在端脑里"）。
   - **(B) 真把 `occipital` 装进端脑** —— 命名齐整，但改动大，且 wire 形状**从未对上**（U+3551 条已证）。
   - ⚠️ 我倾向 **(A)**：先让这条链**跑起来**，命名对齐另立一刀。但这是**口径**，得你拍。

2. **「移动」的阈值定在哪**（缺口 ❸）
   - 位移阈值（px）？速度阈值（px/s）？还是"相对车速"？
   - ⚠️ 这直接决定 CW-02 会不会误报（车在抖、路面不平 ⇒ ⇒ 位移噪声）。
   - 建议：**双阈值**（位移 > N **或** 速度 > M）＋ **一段静止期**（连续 K 帧不动才认"停了"）—— 但 K 与 N/M 得**用真机噪声量**，不能拍脑袋。

---

## 6. 为什么不把它并进既有场景（而不是新开一篇）

- BC-01 是**音频事件**（有／没有天然二分）；CW-01 是**空间状态变化**（没有天然二分 ⇒ 必须有状态机）。
- VQA-06 是**连续视频对话**（一直在聊）；CW-01 是**只在事件发生时出声**（大部分时间是哑的）。
- ⇒ ⇒ 判据形状不同（状态机 vs 事件）、失败形态不同（刷屏 vs 静默）、验收不同 ⇒ ⇒ **不能并进任一篇** ⇒ ⇒ 单开一篇，形状照 BC-* 的模板。