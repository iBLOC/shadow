---
**Updated:** 2026-11-17 (第二版：第二轮**逐条回源码复核** —— 订正**三处**与源码不符的结论（其中一处方向相反）＋ 补**两处**整族缺口；**总纲不变**，变的是**缺口清单**与**推进顺序**；复核逐条见 §0.1)
**Status:** 草案 → 评审中
**Author:** shadow + telencephalon
**Scope:** 本篇**评估**「盯住前车移动了告诉我」这一类场景在**当前项目**能否满足，并给出**通用能力**的落点建议 —— 本篇**不实现任何代码**，是**评估 + 架构口径**文档。
**Related docs:**
- `shadow/docs/superpowers/scenarios/2026-11-17-lead-vehicle-motion-watch-scenario.md` — 被评估的那个场景（CW-01..CW-05）。
- `telencephalon/src/lobes/perception.rs` — **本篇最重要的一份代码**：感知层的输出契约。
- `telencephalon/src/lobes/mod.rs` 的 dispatch_perception — **通用闭环已经在跑**的那一段。
- `telencephalon/src/visual_task/` — 逐帧执行体（⚠️ **节奏由源决定，不是 runner 自带节拍**；见 §0.1 订正三）。
- `shadow-mobile/android/app/src/main/AndroidManifest.xml` ＋ 合并后的 release manifest — 相机权限与前台服务类型的**真实读数**（见 §0.1 新增缺口一）。

---

## 0. 结论先行（一句话）

**这类场景当前项目「架构上满足、工程上没接上」** —— 不需要新造一套机制，**需要把三段已有的通用面接起来**。

更准确地说，当前项目里**已经躺着这套通用能力的三个零件**，而且**架构契约写得比这个场景需要的样子还干净**（端脑的 perception.rs 头文件逐字写着：「**sensing lobes never act**……the prefrontal lobe (scheduling layer) is the only component that turns reports into dispatched actions」）⇒ ⇒ **用户那句「要做通用能力不是 agent 工具」的直觉，仓里本来就认**。

但：「零件在」≠「通了」。当前**只接了数据传感器统计异常这一条腿**，视觉腿、状态变化腿、事件去重腿**都是断的**。

⚠️ **本篇第二版（复核）订正了三处结论、补了两处缺口** —— 见 **§0.1**。

---

### 0.1 第二轮复核（2026-11-17）—— 上一版有三处说错了，另有两处整族缺口没写

> **为什么有这一节**：第一版评估是**读代码得出的结论**；本轮把**每一句关键结论回到源码逐条复核**，发现**三处结论与源码不符**（其中一处**方向相反**），另有**两处整族缺口在第一版里根本没出现**。⇒ ⇒ **评估文档自己也会骗人** —— 这条教训要留在纸上。
>
> ⚠️ 本节**只订正，不推翻总纲**：§3「通用能力六件」与 §1.1 的分层口径**仍然成立**（感知层只报事实、调度层决定动作；监控是**平台能力**不是 agent 工具）。变的是**缺口清单**与**推进顺序**。

**❶ 订正一：「端脑那一半齐了」—— ❌ 不成立，**端脑那一半也缺**（方向相反）**

第一版 §2.4 写「端脑那一半齐了，手机那一半要接」。逐字复核源码：

- `telencephalon/src/visual_task/frame_sources.rs:94-95`：`local://` 落到 **`LocalFrameSource::empty()`** ⇒ ⇒ `empty()` 的 `closed = true` ⇒ ⇒ `next_frame()` **第一次就返 `Ok(None)`** ⇒ ⇒ runner 记 `warn!("frame source exhausted; stopping task")` ⇒ ⇒ `store.stop(task_id)` ⇒ ⇒ **任务第一帧就停**。
- `frame_sources.rs:464` 的 `with_producer(task_id)`（它会把 producer 插进**进程级注册表** `DashMap<Uuid, …>`）**全仓只有一处调用**：`frame_sources.rs:762`，**在测试里**。
- ⇒ ⇒ 生产路径上**注册表永远是空的** ⇒ ⇒ `resolve_producer(task_id)` 恒返 `None` ⇒ ⇒ **根本没有可推帧的对象**。
- 根因：**工厂函数签名里没有 task_id**（`frame_source_from_url(url, max_frames)`，`frame_sources.rs:37`）⇒ ⇒ 它**造不出**带 task_id 的 producer。

⇒ ⇒ **订正后的说法**：这条链断在**端脑**这一侧（**不是**手机侧）⇒ ⇒ 「手机把帧推给端脑」今天**连推的对象都没有**。

　⚠️ **本刀已把它跑出来了**：这三条现在有**编译级读数**（端脑 lib 测试 ＋ 两条临时探针 ＋ 一道真变异）⇒ ⇒ 「源是闭的／注册表恒空／任务第一帧前就停」都是**跑出来的**，不再是读源码推的 ⇒ ⇒ 读数与复现命令见 §6 ⑨。

**❷ 订正二：「推帧要 JNI／通道」—— ❌ 说重了，**通道早就在****

端脑**跑在手机 App 进程内**（`shadow-mobile/lib/services/encephalon/encephalon_mobile_service.dart` 起 `libencephalon.so`），而且它**有一个真的 loopback HTTP 端口**（`agentPort`）：`EncephalonRuntime.kt:267-268` 逐字写着「**agentPort 就是代理的端口 ⇒ ⇒ Dart 侧零改动（它照旧打 `http://127.0.0.1:<agentPort>`）**」。

⇒ ⇒ 推帧**不需要 JNI、不需要新 MethodChannel 方法、不需要动 ABI** ⇒ ⇒ **一条 loopback POST 路由 ＋ 一行 Dart 调用**就够（前提是先补 ❶）⇒ ⇒ 第一版「零新增端点、零 HTTP 服务」**方向对但理由错**（真正省的是**不用动 Kotlin**，不是「不用 HTTP」）。

**❸ 订正三：runner「天生就是 1Hz」—— ❌ 那是注释里的**假设****

`runner.rs:52-96` 的 `run_visual_task` 是**紧循环**：拉一帧 → 跑一次 cascade → 再拉 ⇒ ⇒ **节奏由源决定，runner 自己没有节拍**。`MAX_FRAMES_PER_TASK = 86_400; // ~24h at 1Hz` 里那个 1Hz 是**假设**，不是机制。

⇒ ⇒ 「每秒钟执行一次」必须由**生产端**（手机取样器）节流，或给 runner 加节拍 ⇒ ⇒ 顺便：`LocalFrameSource::next_frame` 空队列时**睡 5 ms 重试** ⇒ ⇒ **200 次/秒的空转唤醒** ⇒ ⇒ 长跑任务要在**推送侧**限速。

**❹ 新增缺口一（整族缺）：Android 的「后台相机」策略 —— 第一版完全没提**

用户这一问（「这是纯视觉任务直接使用手机后置摄像头权限可以吗」）问的是**权限**，但**权限不是那道闸**。逐层核对：

| 层 | 判定 | 证据 |
|---|---|---|
| **声明** | ✅ 已声明 | `camera_android_camerax-0.6.30/android/src/main/AndroidManifest.xml` 有 `android.permission.CAMERA`；**合并后的 release manifest**（`shadow-mobile/build/app/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml`，构建于 2026-11-17 21:15）里**确实有 `android.permission.CAMERA`** |
| **运行期授予** | ✅ 已通，且**不静默** | `in_app_camera_service.dart::open()` 先查 `Permission.camera.status`，未授予就 `request()`；被拒 ⇒ ⇒ 返 `InAppCameraOpenStatus.permissionDenied`（与 `noCamera`／`failed` **分开** ⇒ ⇒ 用户知道该去设置批、换设备、还是重试） |
| **镜头方向** | ✅ 默认后置（⚠️ 但有一处静默换镜头的风险） | `open({useFrontCamera = false})` → `_pickIndex(CameraLensDirection.back)`；⚠️ **找不到后置时 `_pickIndex` 返 -1 ⇒ ⇒ 回落 `_index = 0`（可能是前置）** ⇒ ⇒ 对「盯前车」这一格，**静默换成前置＝对着驾驶员的脸** ⇒ ⇒ 该回落必须**响亮失败**，不许静默换镜头 |
| **后台／息屏可用** | ❌ **不满足**，而这才是**真闸** | targetSdk = **36**（Flutter 3.47.8 的 `flutter.targetSdkVersion = 36`）⇒ ⇒ ① 相机前台服务必须声明 `android:foregroundServiceType="camera"` ＋ `FOREGROUND_SERVICE_CAMERA`（Android 11+／14+）；**本仓只有 `dataSync`**（合并后的 manifest 里 `android:foregroundServiceType="dataSync"`，**没有 camera**）⇒ ⇒ ② Android 12+：**App 在后台启动的前台服务不能访问相机** ⇒ ⇒ ③ Android 15+：`dataSync` 前台服务有 **6 小时/24 小时**超时 ⇒ ⇒ 超过 6 小时的行程会被系统收走 |

⇒ ⇒ **「直接用后置摄像头权限」—— 权限层面答案是「可以」；但「手机在车里、屏幕灭着、1 Hz 连续取帧」—— Android 平台层面答案是「今天不行」** ⇒ ⇒ 缺的是**平台策略**，不是代码。

**❺ 新增缺口二：移动端那条 1 Hz 取样器有三条债**

`shadow-mobile/lib/services/video_frame_collector.dart`（**仓里已经有 1 Hz 定时抓帧**）：

1. **完全不申请相机权限** ⇒ ⇒ `availableCameras()`／`takePicture()` 在未授权机上抛异常 ⇒ ⇒ 被 `catch (e) { return false; }` **吞掉** ⇒ ⇒ **失败长得像成功**。
2. 抓的是 **JPEG 文件**（`takePicture()`），**不是帧流**；而且**从不对外供帧**（没有 HTTP 面、没有 push 面）⇒ ⇒ 不能直接当端脑的帧源。
3. `_currentCameraIndex = 0; // Start with front camera` —— 这个 0 是**枚举顺序里的第 0 个**，**不是**「前置镜头」（真方向看 `lensDirection`）⇒ ⇒ **注释在骗人**。

⇒ ⇒ 复用它当取样源时，这三条债必须**一起**处理 —— 否则「拉不到帧」会**静默**。

---

## 1. 评估矩阵：这类场景需要什么 vs 项目里有什么

把「盯住前车」抽象成**一类**场景（持续监控 + 状态变化 + 事件通知），它需要**七段能力**：

| # | 通用能力段 | 当前项目里 | 判定 |
|---|---|---|---|
| 1 | **用户意图 → 「持续监控某目标」** | Intent::VisualTask{question,target_class,cascade,source_hint}（telencephalon/src/lobes/intent.rs） | 半通 —— 有「持续视觉任务」这一档，但**没有「事件判据」字段**（说不出「移动了」），且**没有非视觉的监控档**（盯价格／盯水烧开／盯快递／盯门磁都塞不进 target_class） |
| 2 | **常驻执行体（周期性取样）** | visual_task/runner.rs 的 run_visual_task（逐帧循环 + MAX_FRAMES_PER_TASK=86_400「~24h at 1Hz」） | 通（视觉这一支） |
| 3 | **判据（什么算「变了」）** | perception.rs::detect_anomaly（z-score + 恒定基线的阶跃检测）+ vision_pipeline/tracking/mod.rs 的 ByteTrack | 半通 —— 通用判据**有**（统计异常），但**空间状态变化**（目标动了／消失了／换了一辆）**没有判据**；且 detect_anomaly 只吃**标量样本**，吃不了 bbox/track |
| 4 | **观测 → 报告的统一契约** | perception::PerceptionReport{source,timestamp_ms,sensor,summary,severity,confidence,evidence,recommendation,requires_action} | 通 + **这是全套的地基** —— evidence 是**不透明 JSON** ⇒ ⇒ 「车动了」可以原样塞进去 ⇒ ⇒ **通用性够** |
| 5 | **报告 → 决策（要不要打扰用户）** | dispatch_perception（lobes/mod.rs）：拉 parietal 的 anomaly_scan 报告 ⇒ ⇒ 喂 LLM 出**调度计划** ⇒ ⇒ 「scheduling layer decides」 | 半通 —— 闭环**已经跑着**，但**只接数据传感器**；且它**只出「计划」文本**，**没有落成「通知用户」**（无去重、无投递） |
| 6 | **决策 → 送达用户** | notification_inbox.rs（NotificationType = Reminder／Overdue／NeedsConfirmation + push_once 去重 + 确认）+ 移动端 ReminderInbox 轮询（**送出去了才确认**） | 半通 —— 通道在、纪律好，但**没有「感知事件触发」这一类**，且去重是**按任务一次**（车辆反复停走只会报第一次） |
| 7 | **通用接入面（不新增 agent 工具）** | prefrontal/src/tool.rs 的 ToolRegistry（工具名／描述／schema／approval／rate limit／domain 通用元数据）+ client_tool_registry.dart（两端同构的客户端工具面）+ synapse 的 flow／compose 面 | 通 —— ⇒ ⇒ **「监控」应该做成一个通用能力 + 一族参数化工具**，**不是**给 agent 加一个 watch_car 工具 |

### 1.1 一张图：现状 vs 通用能力该有的样子

【今天】
  感知 ──▶ 报告 ──▶ LLM 出「调度计划」文本 ──▶ 断（没有落成通知）
  ↑
  └── 只有「数据传感器的统计异常」这一条腿（parietal.anomaly_scan）

【通用能力该有的样子】
  ┌─────────────┐   ┌──────────────┐   ┌──────────────┐   ┌─────────────┐
  │ 采样器(通用) │──▶│ 判据(可注册) │──▶│ 报告(统一)   │──▶│ 决策(策略)   │
  │ 视觉/传感/网页│   │ 动了/超标/变了│   │ PerceptionReport│  │ 去重+该不该说│
  └─────────────┘   └──────────────┘   └──────────────┘   └──────┬──────┘
        ▲                                                          │
        │                                                          ▼
   ┌─────────────┐                                    ┌─────────────┐
   │ 通用监控登记 │                                    │ 通知/投递    │
   │ (一个通用工具)│                                    │ (送出去才确认)│
   └─────────────┘                                    └─────────────┘

注意：上面**没有一格**是「agent 工具」。**「监控」是平台能力**（登记一个长期任务 + 挂一个判据），**不是**让 agent 在对话里反复调工具去轮询 —— 后者有两个硬伤：**① 每轮都要 LLM 参与（贵且慢）；② 没有常驻执行体 ⇒ ⇒ 对话一断，监控就停**。

---

## 2. 逐段取证（每条都带代码落点）

### 2.1 报告契约 —— **这是地基，而且已经够通用**

`telencephalon/src/lobes/perception.rs`：

``rust
pub struct PerceptionReport {
    pub source: String,            // 哪个叶区产的
    pub timestamp_ms: i64,
    pub sensor: String,            // 哪个传感器／相机
    pub summary: String,           // 给人看的一句话
    pub severity: Severity,        // Info < Warning < Critical（**可排序**）
    pub confidence: f32,           // 0.0..1.0
    pub evidence: serde_json::Value, // **不透明 JSON** ⇒ 不同传感器可挂不同形状
    pub recommendation: String,    // 只是**建议**
    pub requires_action: bool,     // 只是**信号**
}
``

**三个设计决定，正好是通用能力需要的**：
- ① **evidence 是不透明 JSON** ⇒ ⇒ 「车动了」这一格可以**原样挂上去**（bbox 前后对比／track_id／位移量）⇒ ⇒ **不需要为每个场景改契约**。
- ② **severity 可排序**（Ord）⇒ ⇒ 决策层能「先处理最严重的」⇒ ⇒ **策略**写在调度层，不写在感知层。
- ③ **recommendation 只是建议、requires_action 只是信号** ⇒ ⇒ **感知层不许自己动手** ⇒ ⇒ 这就是**通用架构的关键**：判据变了，触发方式（通知／开灯／下单）可以完全不同，**感知层不受影响**。

### 2.2 决策闭环 —— **已经在跑，只是只接了一条腿**

`telencephalon/src/lobes/mod.rs` 的 dispatch_perception：

1. 取 AppState（无 AppState ⇒ ⇒ 响亮地说「需要 AppState」）
2. 从 lobe_registry 取 parietal runtime（找不到 ⇒ ⇒ 响亮地说「未在 lobe_registry 中找到 parietal」）
3. 发一句 "anomaly_scan" 给 parietal ⇒ ⇒ 拿回报告 JSON
4. 报告为空／含「无异常」⇒ ⇒ **不调度**（安静）
5. 否则 ⇒ ⇒ **喂 LLM** 出调度计划（system prompt 明写「decide which agent should respond and what the first action is」）
6. 返回「📡 感知扫描 + 🧭 前额叶调度计划」

**这一段就是用户要的那条通用链的骨架**，而且**分层是对的**：感知层只报事实，调度层决定响应。

**但它有两个断点**：
- ① **只接 parietal（数据传感）** ⇒ ⇒ 视觉那一支（枕叶）**没有对应的一跳**（dispatch_perception 里写死找 "parietal"）。
- ② **只产出「计划」文本，没有落成动作** ⇒ ⇒ 「前面的车动了」会变成**一段给用户看的计划**，而不是**一条送达的通知** ⇒ ⇒ **闭环断在最后一米**。

### 2.3 判据 —— **通用判据已有，但「空间变化」缺**

- ✅ detect_anomaly(samples: &[(i64, f64)]) → AnomalyVerdict{mean,stddev,latest,z_score,severity}：**与传感器无关**，吃标量时间序列，z-score + 恒定基线阶跃检测（注释写得很讲究：**把最新一点从自己的基线里排除**，否则尖峰会把自己藏起来）。
- ✅ ByteTrack（`telencephalon/src/vision_pipeline/tracking/mod.rs`）：卡尔曼滤波 + track 生命周期（New/Tracked/Lost/Removed）⇒ ⇒ **「动没动」「还在不在」「换没换」这三个问题的机械部分都在**。
- ❌ **两者没接上** ⇒ ⇒ detect_anomaly 吃不了 bbox/track；ByteTrack 的输出**没进** PerceptionReport；visual_task 的 store 仍只记**计数**。

⇒ ⇒ **缺口不是「没有跟踪」，是「没有把跟踪结果翻译成 PerceptionReport」** —— 这一格是**适配器**，不是新算法。

### 2.4 取样源 —— **手机当源的路已通了一半**

- ✅ 端脑 `visual_task/frame_sources.rs` **有** `local://` scheme 与 `LocalFrameProducer::push(Vec<u8>)`（**API 在**）。
- ❌⚠️ **但生产路径上它**接不上**（第二版订正，详见 §0.1 ❶）**：`local://` 落到 **`LocalFrameSource::empty()`**（`closed = true`）⇒ ⇒ 第一次取帧就 `Ok(None)` ⇒ ⇒ **任务第一帧就停**；而能注册 producer 的 `with_producer(task_id)` **全仓只有测试在调** ⇒ ⇒ 生产注册表恒空 ⇒ ⇒ **没有可推的对象**。根因：工厂签名 `frame_source_from_url(url, max_frames)` **没有 task_id**。
- ✅ 端脑**内嵌在手机 App 里**（`shadow-mobile/lib/services/encephalon/encephalon_mobile_service.dart` 起 `libencephalon.so`）⇒ ⇒ **有一个真的 loopback HTTP 端口**（`agentPort`，Dart 侧照旧打 `http://127.0.0.1:<agentPort>`）⇒ ⇒ **推帧不需要 JNI／新 MethodChannel**（第二版订正，详见 §0.1 ❷）。
- ✅ 手机相机权限**今天已通**（`in_app_camera_service.dart`：真申请 Permission.camera，被拒返 permissionDenied 不静默；open({ useFrontCamera = false }) **默认后置**）⇒ ⇒ ⚠️ **但「后台／息屏还能不能开相机」是另一道闸**，且今天**过不去**（第二版新增，详见 §0.1 ❹）。
- ⚠️ **LocalFrameSource::empty() 是闭的** ⇒ ⇒ 第一次取帧就 Ok(None) ⇒ ⇒ **runner 立刻退出** ⇒ ⇒ 「没接上」表现为「任务立刻停」，**不是**「安静地等」⇒ ⇒ 这正是**负控该有的形状**。

### 2.5 通知 —— **通道在，语义缺一格**

- ✅ notification_inbox.rs：Notification{id,task_id,task_title,notification_type,message,timestamp,due_time} + push_once（去重键）+ 确认语义 + **内存态**（进程一退全没，如实写着）。
- ✅ 移动端 ReminderInbox：**送出去了才确认**（送不出去就留在端脑待办里、下轮再送）—— **这个纪律直接可用于事件通知**。
- ❌ NotificationType 只有 Reminder／Overdue／NeedsConfirmation ⇒ ⇒ **没有「感知事件触发」这一类**。
- ⚠️ **去重语义会咬人**：push_once 是**按任务一次** ⇒ ⇒ 车辆反复停走**只会报第一次** ⇒ ⇒ 视觉事件需要**按事件段去重**（任务 + 目标 + 事件段），**不是**按任务。


## 3. 「通用能力」该长什么样（建议形态）

### 3.1 一句话形态

**把「监控」从 agent 的一次工具调用，提升成平台的一个长期登记项。**

### 3.2 六个通用件（每件都能服务不止一个场景）

| 件 | 是什么 | 服务哪些场景 |
|---|---|---|
| **① 监控登记项**（MonitorSpec） | 「盯**什么**（target）+ **在哪儿取样**（source）+ **多久取一次**（cadence）+ **什么算变了**（predicate）+ **变了说什么**（message + 送达方式）」 | 盯前车／盯股价／盯水烧开／盯快递／盯门磁／盯服务器指标 |
| **② 取样器（source）** | 一族可插拔取样器：camera（手机后置／桌面摄像头）／rtsp／http／sensor（thalamus）／web（网页轮询） | 所有监控场景的**数据入口** |
| **③ 判据（predicate）** | 一族可插拔判据：**出现／消失**（目标在不在）、**位移**（动了）、**数值越界**（超标）、**内容变化**（页面变了）、**状态跃迁**（订单发货了） | 所有监控场景的**「变了」定义** |
| **④ 统一报告** | 复用 PerceptionReport（**已有**）—— 判据命中就产一份报告 | 所有监控场景的**事实出口** |
| **⑤ 决策策略** | 「这次要不要打扰用户」：去重（按事件段）+ 合并（同一波别刷屏）+ 严重度门槛 + 静默期 | 所有监控场景的**打扰控制** |
| **⑥ 送达** | 复用 notification_inbox + 移动端 ReminderInbox（**送出去才确认**）—— 但要**加一类 NotificationType** + **改去重键** | 所有监控场景的**送达** |

**③ 判据与 ⑤ 策略要分开**：判据说「变了」（客观），策略说「要不要说、什么时候说」（主观）⇒ ⇒ 这条分界线让**加一个新场景不需要改既有代码**。

### 3.3 用户侧只暴露**两个**通用动作（不是一族工具）

``
monitor_start(spec)   // 登记一个长期监控（spec 见 3.2）
monitor_stop(id)      // 停掉
``

**为什么是两个动作而不是一堆**：**监控的种类该由用户的一句话决定**（agent 把「盯住前面的车移动了告诉我」翻译成 MonitorSpec{target: car, predicate: displacement, source: phone_rear_camera, cadence: 1s}）⇒ ⇒ **用户不用学命令**，**agent 只负责填那张表**。

**但这正是「通用能力」与「agent 工具」的分界**：
- ❌ **agent 工具**形态：agent 每轮自己调 check_camera() 去看一眼 ⇒ ⇒ **每轮烧 LLM** + **对话一断监控就停** + **没有去重**（每轮都看见「车在」都会想报）。
- ✅ **平台能力**形态：登记项在端脑里**常驻跑**，判据命中了**才**产生一次事件 ⇒ ⇒ agent 只在**事件发生时**参与一次（决定怎么措辞／要不要说）⇒ ⇒ **成本与「事件次数」成正比，不与「对话轮数」成正比**。

### 3.4 落点建议（哪个仓改什么）

| 层 | 仓 | 改什么 | 动量 |
|---|---|---|---|
| 报告契约 | 端脑 telencephalon | **复用** PerceptionReport（**不改**）；加 MonitorSpec 类型 + MonitorStore（仿 VisualTaskStore 的 DashMap） | 小 |
| 取样器 | 端脑 + 移动端 | 端脑侧把逐帧 runner **泛化成**「源 → 帧 → 判据」**并补上 producer 接线**（⚠️ 第二版订正：`local://` 今天落到 closed 的 `empty()`，**端脑那一半并不齐** ⇒ ⇒ 见 §0.1 ❶）；移动端接上推帧（**走 loopback HTTP 即可**，不需要 JNI ⇒ ⇒ 见 §0.1 ❷） | 中 |
| 判据 | 端脑 | 新增 predicate 模块：appears／disappears／displacement／threshold；把 ByteTrack 输出**翻译成** PerceptionReport（**适配器，不是新算法**） | 中 |
| 决策 | 端脑 dispatch_perception | 从「只找 parietal」泛化成**按 source 找**；产出**动作**（落通知）而不只是**计划文本** | 中 |
| 去重 + 送达 | 端脑 notification_inbox | 加 NotificationType（感知事件）+ 去重键从「按任务」改成「**按事件段**」 | 小 |
| 手机那一半 | 移动端 shadow-mobile | 后置相机 1 Hz 取帧 ⇒ ⇒ 经 **loopback POST** 把帧递给端脑的 LocalFrameProducer（⚠️ 取样器现成（`video_frame_collector.dart`）但有**三条债**：不申请权限／只出 JPEG 不供帧／镜头注释骗人 ⇒ ⇒ 见 §0.1 ❺） | 中 |
| **平台策略** | 移动端 shadow-mobile（Android） | ⚠️ **新增**：相机在**后台／息屏**下的可用性 —— 需 `foregroundServiceType="camera"` ＋ `FOREGROUND_SERVICE_CAMERA` ＋ **前台启动**（Android 12+ 后台启动的前台服务**不能**访问相机）＋ `dataSync` 的 6 小时超时（Android 15+）⇒ ⇒ **这是产品/平台决定，不是代码**（见 §0.1 ❹） | 中（**含决策**） |
| 用户面 | 影仓 shadow | 两端加**监控登记页**（看有哪些监控在跑／停掉／看历史）；**不加一族工具** | 中 |

**客户端工具面**（clientTools.ts／client_tool_registry.dart）：**今天不需要新工具** ⇒ ⇒ 「监控」在**端脑侧**是能力，在**客户端侧**是**管理界面**（不是工具）⇒ ⇒ 这条边界要守住 ⇒ ⇒ **不然又会长出一族设备工具**。


---

## 4. 满足度判定（对「这类场景」）

| 判定 | 数量 | 含义 |
|---|---|---|
| **通** | 3 | 报告契约／取样执行体（视觉支）／通用接入面 |
| **半通** | 4 | 意图层／判据／决策闭环／通知送达 |
| **缺** | 2 | ❶ **「移动了」这一类空间状态判据**（ByteTrack 在，翻译层不在）｜❷ **手机取样器的三条债**（不申请权限／只出 JPEG 不供帧／镜头注释骗人 ⇒ ⇒ §0.1 ❺） |
| **断** | 2 | ❶ **端脑侧 producer 接线**（`local://` → `with_producer(task_id)` ＋ 注册表 ⇒ ⇒ **第二版新增**，原先误记成「手机那一半」）｜❷ **手机 → 端脑的帧通道**（走 loopback HTTP ⇒ ⇒ 不需要 JNI） |
| **平台闸** | 1 | ❶ **Android 后台相机策略**（camera 类型前台服务 ＋ 前台启动 ＋ 6h 超时 ⇒ ⇒ §0.1 ❹）—— **这一格不是代码**，是平台/产品决定 |

**总判定**：

- **对「盯住前车」这一个场景**：**今天做不出来**，缺口清晰但**比第一版多两处**（端脑 producer 接线 ＋ Android 后台相机策略），且少一处误判（推帧**不需要** JNI）。
- **对「这类场景」整体**：**架构满足，工程欠接线** ⇒ ⇒ **不应该为每个场景各造一个工具** ⇒ ⇒ 应当**把上面那六个通用件补齐**，之后新场景**只填 MonitorSpec 那张表**。
- ⚠️ **但「架构满足」这句话有前提**：它指的是**分层口径**（感知只报事实／调度决定动作）⇒ ⇒ **不代表「手机当传感器」在 Android 上能常驻** ⇒ ⇒ 后台策略那格不补上，「架构满足」在**行车场景**里会变成**纸上满足**。

**本篇只是评估**：上面 §3 的六个件**一件都没做** ⇒ ⇒ **不许说「通用能力已具备」** ⇒ ⇒ 现在的准确说法是：**「通用能力的零件齐了大半，接口缺一格（MonitorSpec）、两段接线、两条债、一道平台闸」**。

---

## 5. 建议的推进顺序（每步都有独立可验收的读数）

0. **先定平台口径**（**不是代码，是决定**）：Android 后台相机策略 ⇒ ⇒ 走「camera 类型前台服务 ＋ 前台启动」这一档（用户必须先把 App 开在前台），还是接受「**只在 App 可见时取帧**」这一档降级？⇒ ⇒ **不猜** ⇒ ⇒ 它决定后面所有取样器的形状。
1. **补端脑那一半**（producer 接线）：工厂签名带上 task_id ⇒ ⇒ `local://` 落到 `with_producer(task_id)` ⇒ ⇒ 注册表真被填上 ⇒ ⇒ **读数**：任务建起来**不会第一帧就停**（`status` 停在 Running 而不是 Stopped）⇒ ⇒ 这是**第二版新增的一步**（第一版把它算进「手机那一半」⇒ ⇒ 方向搞反了）。
2. **接手机那一半**（推帧）：loopback POST 路由 ＋ Dart 侧后置相机 1 Hz 取帧（**真申请权限** ＋ **失败响亮** ＋ **按 `lensDirection` 选后置**，不许静默换镜头）⇒ ⇒ **读数**：真机 `detections_total` 在涨（不是 0）⇒ ⇒ 顺带证明「负控」：不推帧时任务**立刻停**（不是安静地等）⇒ ⇒ ⚠️ **节奏在生产端限**（runner 没有节拍 ⇒ ⇒ 空转 200 次/秒）。
3. **再补判据翻译层**：ByteTrack 输出 ⇒ ⇒ PerceptionReport{severity: Warning, evidence: {位移, track_id}} ⇒ ⇒ **读数**：静止时**零报告**，车动时**一份报告**。
4. **然后做 MonitorSpec + MonitorStore**（把上面两件**泛化**成一族）⇒ ⇒ **读数**：用**同一个 spec 模板**登记「盯前车」与「盯水烧开」两个监控，**两端都跑**。
5. **最后接决策与送达**：dispatch_perception 泛化 + 通知类型 + 事件段去重 ⇒ ⇒ **读数**：一次「停→动」**一条**通知；持续行驶**零条**额外；送不出去**不确认**。

**顺序的理由**：⓿ 先把**平台口径**钉住（它是**产品决定**，且决定取样器形状 ⇒ ⇒ 越晚发现越贵）⇒ ⇒ ❶ 把「帧能到」这格最硬的物理入口打通（**且必须在端脑侧先通**，否则手机侧没有可推的对象 ⇒ ⇒ 这是第一版搞反的那一步）⇒ ⇒ ❷ 判据翻译层是「通用性」的最小证明（视觉一支先跑通）⇒ ⇒ ❸ 再泛化（此时才有证据说明抽象是对的）⇒ ⇒ ❹ 最后接决策与送达（**去重是最容易做错的一格**，放最后有前面几步的真实事件流来验它）。

**不要倒着来**：先做「注册一个 watch_car 工具」⇒ ⇒ 会得到**一个场景专用、且架构上错误**的东西（每轮烧 LLM、对话一断就停、无去重）⇒ ⇒ 而这正是用户说的「**不要 agent 工具，要通用能力**」。

---

## 6. 仍然欠着的

- ① **本篇零代码改动**（纯评估）⇒ ⇒ 上面每一条都还是**纸面** ⇒ ⇒ 端脑／移动端／影仓三本账本**不占号**（本篇只在**父仓**占一枚）。
- ② **「移动」阈值仍待定**（位移？速度？双阈值 + 静止段？）⇒ ⇒ **不能拍脑袋** ⇒ ⇒ 得用**真机噪声量**（路面不平 ⇒ ⇒ 车在抖 ⇒ ⇒ 位移噪声是多少）。
- ③ **dispatch_perception 只接 parietal** 这一格改起来会**碰到兄弟在飞面**（端脑 lobes/mod.rs 是热点）⇒ ⇒ 那一刀要**先查归属**再动手。
- ④ **flow 面没验完**（synapse 侧 flow 模块路径与预期不同，端脑的 flow feature 是 dep:serde_json ⇒ ⇒ 轻量）⇒ ⇒ 通用编排**有可能**落在 flow 上，但本篇**没验**，不写进结论。
- ⑤ 真 CI 待取。
- ⑥ **本轮（第二版）复核仍**零代码改动** ⇒ ⇒ 上面每一条还是**纸面** ⇒ ⇒ 端脑／移动端／桌面端三本账**不占号**（本刀只在**父仓**占一枚）。
- ⑦ ⚠️ **「合并后 manifest」那条读数是**构建产物**（release 变体，构建于 2026-11-17 21:15）⇒ ⇒ **会过期**：工作树面若再动相机／前台服务声明，那条读数要**重跑**才作数 ⇒ ⇒ 别拿旧构建产物当今天的结论。
- ⑧ ⚠️ **真机那一格仍空**（设备未授权）⇒ ⇒ 「手机上真的能后置取帧、真的能 1 Hz 推、真的能认出『前车动了』」**一格都没验** ⇒ ⇒ **不许说「真机已验证」**。
- ⑨ **✅ 本刀已把「编译级读数」补上** —— 端脑 `cargo test -p telencephalon --lib visual_task` ⇒ ⇒ **编译通过**（test profile，3m44s，退出码 0）＋ **26/26 绿**；插两条**临时探针**后 **28/28 绿** ⇒ ⇒ **订正一从「读源码」升级成「跑出来的读数」**：工厂造的 `local://` 源**第一次取帧就 Ok(None)**（闭的）＋ 工厂造它时**注册表一个 producer 都不注册**（⇒ `resolve_producer` 恒 None ⇒ ⇒ 没有可推的对象）＋ **任务在第一帧前就被停掉**（status=Stopped，detections_total=0）。⇒ ⇒ **真变异**（把 `local://` 那一行改成 `with_producer(...)`）⇒ ⇒ **恰好那两条探针红**（一条报「注册表变了」、一条报「任务没被停掉」）＋ **其余 26 条一条没红** ⇒ ⇒ **尺子有牙且不牵连别条**；探针用完即删，兄弟仓那两个文件**逐字还原**（sha 归一化行尾后与 HEAD blob 一致 ＋ `git diff HEAD` 空 ＋ 残留 0）。
- ⑩ **⚠️ 这一刀撞出来的机器约束** —— 真变异那一跑**第一次是 rustc OOM**（memory allocation failed ⇒ ⇒ 退出码 0xc0000409）⇒ ⇒ **根因不是代码**：兄弟会话在 synapse 仓跑 `cargo test`，同时起了十几个 `link.exe` ⇒ ⇒ 16 GB 内存只剩 149 MB ⇒ ⇒ **共享机器上「同时编两个仓」会互相挤爆** ⇒ ⇒ 通形：**编译型验证先量内存**（≥3.5 GB 空闲再发车）；另：判据别用 `/READY/` 这种**子串判据**（「NOT_READY」里含「READY」⇒ ⇒ 判据自己骗了自己 ⇒ ⇒ 改用 `MEMREADY` 这种不歧义的标记）。
