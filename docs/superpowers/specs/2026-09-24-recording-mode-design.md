# 记录模式 (Recording Mode) — 设计规范

**Updated**: 2026-09-24 (initial design)
**Status**: 🔵 草案 → 评审中
**Scope**: shadow-desktop 双端 (Tauri Rust 后端 + React 前端)
**Related**:
- `diencephalon` — 音频/视频事件管线 (AudioEvent / event_nms / Thalamus)
- `hippocampus` — 长期存储 (人实体 / 人脸 / 声纹 / LanceGraph 关联)
- `occipital` 枕叶 — mage-vl 视频理解 (微软开源模型)
- `neuron` — 本地 ASR + VAD 推理
- `telencephalon` — agent 总结报告生成

---

## 0. 需求原文 (用户)

> shadow双端增加记录模式 分两种模式录音和录像
> 录音模式直接使用vad截取区分说话人 asr 保存下来 由agent生成总结报告
> 数据由海马体提供存储
> 视频除了音频的流程外再加上视频的理解流程使用枕叶微软开源模型mage-vl
> 音视频理解的数据存储都在一个人表中 可以理解为报告的事件记录
> 事件类型（音频事件/视频事件）事件的开始时间和结束时间（相对时间）
> 事件内容（asr文本/视频理解模型输出文本）事件关联人（复用海马体中人的实体）
> 海马体中现在已经有人脸还需要增加声纹
> 为了保证准确率一个人可以有多个人脸和多个声纹
> 总结的记忆关联到 lance graph 这样ai问答时可以使用图搜索获得之前的记忆

## 1. 需求分解

| # | 需求 | 实现 |
|---|---|---|
| N1 | 双端记录模式，两种：录音 / 录像 | `RecordingMode { Audio, Video }` |
| N2 | 录音：VAD 切分 + 说话人区分 (声纹) + ASR + agent 总结 | VAD→diarization→ASR 管线 (neuron) |
| N3 | 录像 = 录音流程 + 视频理解 (mage-vl, 枕叶) | 双通道并行 |
| N4 | 事件表：类型 / 相对起止时间 / 内容 / 关联人 | `RecordingEvent` 表 |
| N5 | 海马体存储全部数据 | hippocampus memory API |
| N6 | 海马体人实体：人脸 (已有) + 声纹 (新增)；一人多脸多声纹 | hippocampus-person 扩展 |
| N7 | 总结报告关联到 LanceGraph，AI 问答可图搜索 | LanceGraph memory edge |

## 2. 架构

```
┌─────────────────────── shadow-desktop (Tauri) ───────────────────────┐
│                                                                      │
│  [Recording UI]  开始/停止 · 模式选择 (录音/录像) · 实时事件流 · 报告入口  │
│        │                                                             │
│        ▼                                                             │
│  [RecordingManager] (Rust, src-tauri/src/recording/)                 │
│    ├─ AudioPipeline (两种模式都有)                                    │
│    │    1. 采集 (cpal / wasapi，16kHz mono PCM)                      │
│    │    2. VAD 切分 (neuron VAD，或 silero-rs)                       │
│    │    3. 声纹提取 (speaker embedding → hippocampus 声纹匹配)        │
│    │    4. ASR (neuron whisper/paraformer → 文本)                    │
│    │    └─ 产出: AudioEvent { start_rel_ms, end_rel_ms, text,        │
│    │              speaker_id, confidence }                           │
│    │                                                                 │
│    └─ VideoPipeline (仅录像模式，与 AudioPipeline 并行)               │
│         1. 采集 (tauri webview screen capture / UVC camera)          │
│         2. 关键帧抽取 (1 fps 或场景切换检测)                          │
│         3. mage-vl 理解 (枕叶 → neuron vision → 文本描述)             │
│         4. 人脸检测+识别 (帧内 → hippocampus 人脸匹配)                │
│         └─ 产出: VideoEvent { start_rel_ms, end_rel_ms,              │
│               description, person_ids[] }                            │
│                                                                      │
│  [EventStore]                                                        │
│    └─ RecordingEvent 表 (单一表，音视频事件同构):                     │
│        { id, session_id, event_type: audio|video,                    │
│          start_rel_ms, end_rel_ms, content, person_ids[],            │
│          raw_media_ref, created_at }                                 │
│        存储: hippocampus memory (dimension=recording, layer=L1)      │
│                                                                      │
│  [SummaryAgent] (telencephalon agent, 会话结束时触发)                 │
│    输入: 该 session 的全部 RecordingEvent (时间排序)                  │
│    输出: SummaryReport { text, topics[], person_ids[], time_range }  │
│    存储: hippocampus memory (dimension=recording_summary)            │
│    + LanceGraph 边: (SummaryReport)-[about_person]->(Person)         │
│    + LanceGraph 边: (SummaryReport)-[during_session]->(Session)      │
└──────────────────────────────────────────────────────────────────────┘
```

## 3. 数据模型

### 3.1 RecordingSession (会话)

```json
{
  "id": "rec-<uuid>",
  "mode": "audio" | "video",
  "started_at": "2026-09-24T10:00:00Z",
  "ended_at": null,
  "wallclock_start_ms": 1727164800000,
  "device_labels": ["mic-default", "screen-0"]
}
```

### 3.2 RecordingEvent (事件 — 单表，音视频同构, N4)

```json
{
  "id": "evt-<uuid>",
  "session_id": "rec-<uuid>",
  "event_type": "audio" | "video",
  "start_rel_ms": 12000,
  "end_rel_ms": 15500,
  "content": "我们下周三开会讨论部署方案",
  "person_ids": ["person-<hippocampus-uuid>"],
  "confidence": 0.93,
  "raw_media_ref": "blob://recording/rec-<uuid>/evt-<uuid>.opus",
  "created_at": "..."
}
```

- `start_rel_ms / end_rel_ms`：相对 session 起点（N4 相对时间）。
- `content`：音频=ASR 文本；视频=mage-vl 输出文本。
- `person_ids`：关联到海马体 Person 实体（N5/N6）。
- 存海马体：`POST /api/memories`，`dimension="recording_event"`，
  `uri="shadow:recording:{session_id}:{event_id}"`（幂等 upsert）。

### 3.3 SummaryReport (总结报告)

```json
{
  "id": "sum-<uuid>",
  "session_id": "rec-<uuid>",
  "text": "会议纪要正文…",
  "topics": ["部署方案", "周三会议"],
  "person_ids": ["person-a", "person-b"],
  "event_count": 42,
  "time_range": {"start_rel_ms": 0, "end_rel_ms": 3600000}
}
```

- 海马体：`dimension="recording_summary"`，`uri="shadow:recording:{session_id}:summary"`。
- **LanceGraph 关联 (N7)**：写入海马体后，同时写图边到 LanceGraph：
  - `(summary)-[mentions]->(person)` 每个参与人一条
  - `(summary)-[summarizes]->(session)`
  - `(event)-[spoken_by]->(person)`（音频事件）
  - `(event)-[shows]->(person)`（视频事件）
  这样 AI 问答（如"上次和小明开会聊了什么"）可以图遍历：
  `Person(小明) ←mentions- Summary ←- Session` 直接命中。

## 4. 海马体扩展 (Person 实体)

### 4.1 现状

海马体已有人脸（face embedding + Person 实体关联）。声纹缺失。

### 4.2 新增：声纹 (Voiceprint)

```json
{
  "person_id": "person-<uuid>",
  "voiceprints": [
    {"id": "vp-1", "embedding": [/* 192-dim x-vector */], "source": "rec-session-x", "created_at": "..."},
    {"id": "vp-2", "embedding": [/* ... */], "source": "rec-session-y", "created_at": "..."}
  ],
  "faces": [
    {"id": "face-1", "embedding": [/* 512-dim */], "image_ref": "blob://...", "created_at": "..."}
  ]
}
```

- **一人多声纹 + 多人脸 (N6)**：同一 Person 下 voiceprints / faces 都是数组。
  匹配时取 max-similarity（cosine）> 阈值即命中；新样本持续入库提升准确率。
- 声纹 embedding 模型：ECAPA-TDNN (192-dim) 或 gemini-embedding 类，本地跑 neuron。
- 存储位置：海马体 `dimension="person"` 的 memory 扩展字段（或 Lance 表
  `person_voiceprints`）。推荐 Lance 表（向量检索是 Lance 强项），海马体
  Person 实体只存 person_id → voiceprint_ids 映射。

### 4.3 说话人识别流程 (diarization)

```
VAD 切出语音段
  → 声纹提取 (embedding)
  → 海马体/Lance 声纹库 cosine 检索
      ├─ top1 > threshold (e.g. 0.82) → 命中已有 person_id
      ├─ 0.70 < top1 ≤ 0.82 → 不确定，标记 "unknown-?
      │   待用户确认后归并 (UI 提示)
      └─ top1 ≤ 0.70 → 新说话人 → 创建新 Person + 首条声纹
```

## 5. 录像模式的视频理解 (枕叶 mage-vl)

- 帧抽取：1 fps（可配置），或 scene-change 检测自适应。
- 每帧（或每 N 帧关键帧）→ mage-vl (微软开源 VLM) → 文本描述。
- 帧内人脸 → hippocampus 人脸库匹配 → person_ids。
- 相邻帧描述去重（时间窗合并：同一场景连续帧 → 一个 VideoEvent，
  start/end 取窗口边界）。
- 音频通道独立运行（同录音模式），与视频事件共用 RecordingEvent 表，
  `event_type` 区分。

## 6. Agent 总结 (telencephalon)

会话结束 (`stop_recording`) 后：

1. RecordingManager 从海马体拉全量 RecordingEvent（时间序）。
2. 组装 prompt（分批，事件多时分段摘要再合并 — map-reduce）。
3. telencephalon 调 LLM (neuron 本地或云端) 生成 SummaryReport。
4. 报告写海马体 + LanceGraph 边（§3.3）。
5. 颞叶 SSE 推送报告卡片到前端（复用 `FeishuPublishedCard` 模式）。

## 7. Tauri 命令面 (shadow-desktop/src-tauri)

```rust
recording_start(mode: "audio" | "video", device_hints?) -> session_id
recording_stop(session_id) -> SummaryReport
recording_status(session_id) -> { state, elapsed_ms, event_count }
recording_events(session_id, since_rel_ms?) -> Vec<RecordingEvent>  // 前端轮询/流
recording_list() -> Vec<RecordingSession>
recording_report(session_id) -> SummaryReport
```

## 8. 前端 (React)

- 新导航项 `RecordingPage`（/recording）：
  - 大按钮 开始/停止（模式选择：🎤 录音 / 🎬 录像）
  - 实时事件流（复用 chat 消息流渲染，AudioEventChip/VideoEventChip）
  - 会话历史列表 → 点开看报告
- 权限提示：屏幕/麦克风采集需用户确认（Tauri capability + OS 权限）。

## 9. 实施顺序

| Phase | 内容 | 依赖 |
|---|---|---|
| R1 | 数据模型 + RecordingEvent 海马体读写 + Tauri 命令骨架 | 无 |
| R2 | 录音模式：VAD + ASR（neuron）+ 声纹注册/匹配 | hippocampus 声纹表 |
| R3 | 录像模式：帧抽取 + mage-vl + 人脸匹配 | 枕叶 mage-vl 通路 |
| R4 | agent 总结 + LanceGraph 边写入 + AI 问答图搜索验证 | R1-R3 |
| R5 | 前端 RecordingPage + 实时流 UI | R1 |

## 10. 隐私与安全

- 录音/录像启动前必须用户显式确认；系统托盘常驻红点提示录制中。
- 原始音/视频落盘加密（复用 shadow-desktop EncryptedStorage）或仅保留
  embedding + 文本（用户可配 `keep_raw_media = false`）。
- Person 实体与声纹/人脸数据属敏感生物特征：仅存本地海马体（Lance 本地），
  不出零信任网络；云端 LLM 总结时只发文本（不发 embedding）。
