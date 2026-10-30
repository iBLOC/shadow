# PROJECT KNOWLEDGE BASE — shadow-mobile

**Updated:** 2026-10-30 (㉔ **第三层：移动端下线本地 LiteRT + 首页 UI 重构 —— 「所有通信都走 大脑 → 端脑 → 叶区」在移动端也真的成立了**：承 ㉓ 条，移动端的对话链路从「端脑优先 + 本地 LiteRT 兜底」改成「**只有端脑一条路**」，首页跟着重做。① **本地 LiteRT 在对话这条线上整个下线**：`ChatNotifier` 的 `_initLiteRT` / `initLitert` / `downloadModel` / `_litertEngine` / `_convertAttachmentsToLitertFormat` / `processAudioSegment` / `processAudioSegmentAndContinue` / `selectAgent` / `runLiteRTDiagnostic` 全删，`ChatState` 的 `isInitialized` / `mode` / `isLitertReady` / `downloadProgress` / `currentAgent` / `isDownloading` / `modelNotFound` 与 `ChatMode` 枚举一起没了，`ChatNotifier` 构造函数从 `(Tts, Litert, Telencephalon, {skipInit, litertReady})` 收成 `(Tts, Telencephalon, {systemPromptProvider})`，死 provider `modelManagerProvider` / `litertEngineProvider` / `modelListProvider` / `availableAgentsProvider` 一并删（**全仓零外部引用**）。② **⚠️ 端脑不通现在直接报错，不再静默回退本地**：以前 catch 住端脑异常只打一条 `_log.warning('端脑对话失败, 回退到本地模型')` 就转去本地引擎 —— 而本地引擎**从来没起来过**（`_getModelPath()` 给的是**文件**路径，Kotlin `LitertEngine.kt:160` 的 `diagnoseModelDirectory` 要的是**目录**）⇒ 静默回退只是把失败藏起来，用户看到的是一条「已就绪」的红横幅和一句永远等不来的回复；现在端脑不通就是不通，错误直接进对话流（system 消息）+ 错误横幅。③ **附件一律明确报错**：端脑那条链路（`/shadow/v1/conversations`）**只处理纯文本**，附件没有第二条路 ⇒ 任何附件（图片/相机/音频/文件）都直接报错，而且**消息不进对话流**（否则用户会以为图发出去了，其实根本没发）；新增 l10n `chatAttachmentNotAvailable`（替换掉已经不成立的 `chatImageNotAvailable`「LiteRT 图片功能暂时不可用，请等待版本更新」）+ 新增 `ChatStateL10nKey.errorAttachmentNotAvailable` 并在 `displayErrorMessage` 里接上（以前 `errorLitertInitFailed` 不在 switch 里 ⇒ 裸文件路径直出）。④ **首页三个真 bug（都有代码证据）**：(a) **AppBar 右侧恒为空** —— 三个 action 都挂在 `chatState.isInitialized || chatState.isLitertReady` 上，而 `ChatState.isInitialized` **全仓无一处设成 true**、`isLitertReady` 在移动端永不可能为真 ⇒ 「设置」页从此进不去；判据改成 `canChat`。(b) **错误横幅关不掉** —— `local_chat_view.dart` 里横幅 × 的 `onPressed` 是**空闭包**（注释写着 "This will be handled by the parent"，而父级从来没处理），`ChatNotifier.clearError()` 是**零调用方**的死方法；现在接上了。(c) **红色 system 气泡** —— 启动旁白（`_initLiteRT` 塞的那条）走 `ChatRole.system`，而 `chat_bubble.dart` 把 system 映射成 `colorScheme.errorContainer` ⇒ 首页必然挂三条红气泡；旁白随 `_initLiteRT` 一起没了，现在对话流里剩下的 system 消息**只可能是真错误**，红色是对的 ⇒ `chat_bubble.dart` **不动**。⑤ **首页删掉「本地模型下载框」**：`_showDownloadDialog` / `_waitForWifiThenDownload` / `_downloadDialogShown` / `_wifiWaitSub` 整块删（本地模型不再由客户端下载，也没有「模型不存在」这个状态可言）；连带 `test/widget/chat_screen_wifi_test.dart` 整个删（它测的就是那条已不存在的流程）。⑥ **`canChat` 保留但改成恒 true**：`425e666` 的教训正是「别拿本地引擎状态当可用性判据」—— 以前 `isInitialized || isLitertReady || mode == ChatMode.off` 在没装本地模型的设备上让输入框**整个禁用**、一条消息都发不出去；本地引擎没了这个判据没必要了，但**留着这个口**（UI 仍可直接用）。⑦ **模型管理页**：`_EngineStatusBar`（显示本地 LiteRT 引擎 ⇒ `isLitertReady` 恒假 ⇒ **永远**显示「引擎未运行」）换成 `_BrainStatusBar`（显示**嵌入式大脑**的真实状态，复用现成的 `encephalonStatus*` / `settingsEncephalonEmbedded` / `encephalonPort` 文案，**不新增 l10n**）；「本地模型」tab 整个删（本地引擎模型没有引擎会注册、`ModelSource.internalService` **全仓没有任何一处**创建过 ⇒ 两个分段永远空；而它剩下的「云端供应商」分段又和「模型商店」tab **完全重复**）⇒ 两个 tab 合成一个列表，FAB 直接开「添加云端模型」。⑧ **Agent2UI 补了常驻入口**：它以前唯一的入口是「本地模型没装好 → 下载框 → Use Agent2UI」那个逃生口，下载框下线后就**只能进不能出**了 ⇒ AppBar 加 `Icons.widgets_outlined` 按钮。⑨ **顺带修掉一个真 bug**：`GenUIAgentService.dispose()` **双重释放** —— genui 包的 `GenUiConversation.dispose()` 已经会 dispose 它持有的 `contentGenerator` 和 `a2uiMessageProcessor`，服务自己再 dispose 一遍 ⇒ `A2uiContentGenerator.dispose()` 里的 `_isProcessing.dispose()` 抛「A ValueNotifier<bool> was used after being disposed」。这个坑一直藏着是因为 Agent2UI 压根**进不去**；补了入口之后它第一次真的被 dispose 到。⑩ **删掉的死文件**（依据是**零调用方**）：`lib/litert_engine.dart`、`lib/services/model_download_service.dart`、`lib/providers/model_download_provider.dart`、`lib/widgets/chat/prefrontal_chat_view.dart`、`lib/providers/ai/prefrontal_provider.dart`。**故意留下**：`lib/providers/ai/litert_provider.dart`（`LiteRTProvider`，语音对话/智能客服还在用）、`lib/widgets/chat/mode_switcher.dart`（**它其实是语音模式入口**，不是 LiteRT 开关）、Kotlin 的 `LitertEngine.kt` 与 `com.ibloc.shadow/litert` channel（上面两个页面还要）、`lib/services/prefrontal_client.dart`（十几个页面在用）、`lib/providers/network_provider.dart` + `network_service.dart`（通用连通性工具，不是 LiteRT 专属）。⑪ **⚠️ 本轮撞上的环境坑（值得单独记一笔）**：同仓**另一个会话**（任务看板那条线，session `mvs_8bbfff99…`）在同一棵树上写文件 ⇒ 两边抢 `flutter test` 的 `build/` 与 `.dart_tool/` ⇒ 测试进程被**直接杀掉**（`exit=-1`，**没有任何错误输出**），看着像代码崩了。**排查办法**：把改动 `git diff -- <只有我的文件> | git apply` 到一个 `git worktree add --detach <dir> HEAD` 里单独跑 ⇒ **逐个文件单跑全部 exit=0**、整包 `--concurrency=1` 也全绿 ⇒ **代码没问题**。剩下的解释是**环境**：本机 16 GB 内存，当时空闲只剩 1.4~2.8 GB（Chrome / Feishu / 另一个会话的 flutter test 一起吃），`flutter_tester` 被 OOM 杀掉；等内存松一点重跑就全绿。**教训**：撞到「进程毫无输出地退出（exit=-1）」先查内存和同仓并行会话，别急着改代码。⑫ **⚠️ 还没做的**：设备上那个 **2.41 GB** 的 `gemma-4-E4B-it.litertlm` 还没清、真机首页复验还没做（等设备接上）；移动端对端脑 `tool_call` 仍然**零渲染/执行**（㉑ 条记的缺口，不在本轮范围）。
**Updated:** 2026-10-30 (㉓ **移动端任务看板改走端脑方言（原来打的是前额叶方言 + 桌面端口，手机上必然取不到）** —— 用户报「手机端任务看板任务获取失败」。① **根因两层叠加**：看板走 `PrefrontalClient.getTasks()` → 前额叶方言的 `/hippocampus/api/tasks`，而 `PrefrontalClient` 的 baseUrl 恒为 `http://localhost:60080`（**桌面 sidecar** 的端口，手机上没人监听）；**且**移动端不编本地海马体、嵌入式大脑那条面是纯端脑方言 ⇒ `/hippocampus/api/*` 一条路由都没有。② **改走端脑**：`TelencephalonClient` 新增 `listTasks` / `createTask` / `updateTaskStatus` / `confirmTask` / `deleteTask`（`/api/telencephalon/tasks*`），看板的 `TasksNotifier` 整个换源；数据在 temporal lobe 的 `TaskStore`（**进程内存，重启即丢**）。③ **⚠️ 线上形状三个坑**：`status`/`priority` 是 serde **变体名**（PascalCase：`Pending`/`InProgress`/`Completed`/`Cancelled`/`Overdue` 与 `Low`/`Medium`/`High`/`Urgent`）；时间字段 **snake_case**（`due_time`/`created_at`/`updated_at`）；**没有子步骤**（`steps` 是海马体的概念）⇒ 详情弹窗「子任务」页签改成「确认点」（`confirmation_points`），编辑弹窗只开放**状态**（端脑只给状态提供更新端点；标题/优先级仅「待确认」的任务能靠确认端点顺带改；描述与标签只在创建时写入）。「待确认」的任务在详情页有「确认任务」按钮（端脑只调度**确认过**的任务）。④ **⚠️ 写操作本来会 503**：端脑 `tasks_admin::verify_admin` 在「没配 admin key」时回 503，而**嵌入式大脑配不出 admin key**（Android 环境变量由 zygote 决定）⇒ 已改成与 `agent_management`/`test_reset` 同一套约定（空 key = 开发模式放行）。**端脑改了 ⇒ 手机的 `libencephalon.so` 变了 ⇒ 要重编 + 重打 APK**。⑤ **大脑的模型来源可显式选择**（承 ㉒ 条）：以前是「第一个云端供应商 wins」，**没法切回本地 neuron 权重**。新增 `BrainModelSource`（`local` / `cloud:<modelId>` / 没选过 = 自动，自动档保持旧行为），存新的 `app_settings` 表（SQLite v3→v4），UI 在「设置 → 嵌入式大脑」页的「大脑模型来源」卡片。**⚠️ 切换会重启大脑**（LLM 上游是 Rust 侧全局槽位，`boot` 时读一次）⇒ `applyModelSource()` = 记选择 → stop → start。⑥ **验证**：`flutter analyze` **0 error**（80 issues 全是既有风格 info）；`flutter test` **285/285 全绿**（新增 24 条）。⑦ **两个测出来才发现的坑**：**(a)** `package:http` 的 `http.Response(body, 200)` 不带 content-type 时按 **latin1** 编码响应体 ⇒ 中文被 `AsciiCodec` 拒掉（`Invalid argument (string): Contains invalid characters.`）—— mock 响应必须带 `content-type: application/json; charset=utf-8`；**(b)** `flutter test` **并行**跑多个文件、共用同一个 `shadow.db` ⇒ 真库的读会被别的文件的写锁住、永远不返回 ⇒ 大脑自动启动卡住、整个测试文件跟着挂（症状是随机文件 `did not complete`）⇒ 凡是启动大脑的测试都要把 `appSettingsRepositoryProvider` 覆盖成内存版。⑧ **⚠️ 还没做的**：端脑任务存储是**进程内存**（重启即丢），要做持久化得让端脑落盘或回到海马体（海马体在移动端不编）；任务看板目前也只支持端脑这一种来源，桌面端那条「海马体任务」分区（`CortexTaskSection`）在移动端没有对应物。)
**Updated:** 2026-10-30 (㉒ **嵌入式大脑默认启动（不再需要开关）+ 端脑「等大脑就绪」的门 —— 真机验通**：承 ㉑ 条，把「嵌入式大脑」从「设置页里一个要手动点的开关」改成「App 一起来就在跑」。① **实现落在 notifier 的 `_init()`**：它是大脑状态的唯一所有者，也掌握云端供应商的交接顺序 ⇒ `_init()` 改成「查状态 → 已在跑就接管（并把 client 指向端脑面）→ 没在跑就自动 `ensureStarted()`」；`ensureStarted()` 是**幂等**入口（已在跑直接 true；用 `_startInFlight ??= _startWithRetry()` 防并发 boot）；失败自动重试 **3 次**（2s / 4s 退避）—— App 刚起来时端口/SQLite/native 库都可能在就绪途中，一次失败不该让用户手动再点一次。`main.dart` 改用 **app 生命周期的 `ProviderContainer` + `UncontrolledProviderScope`**（不用根 widget 的 `ref.watch` —— 那会让每次大脑状态变化都重建整个 `MaterialApp.router`），`runApp` **之后**调 `ensureStarted()`（放 runApp 之后，别挡首屏）。② **⚠️ 启动顺序不能反**：必须先 `_applyCloudProvider()`（等 `modelsProvider.notifier.ready`）再 `_service.start()` —— Rust 侧 boot 时读 `llm_provider` slot 并用它 `set_default_model_for_all_lobes(model)`，顺序反了叶区就 `NO_MODEL_CONFIGURED`；真机 logcat 里 `✅ LLM provider set` **永远在** `✅ Encephalon started` **之前**。③ **管理页按钮改成上下文式**：跑着时**只显示「停止大脑」**（OutlinedButton），没在跑时才出现「启动大脑」（FilledButton）—— 它不再是常驻开关，而是**失败/手动停掉之后的恢复入口**。真机实测：运行中页面只有「停止大脑」（**没有**那个常驻的禁用开关）→ 点停 → 状态变「已停止」、端口释放、「启动大脑」出现 → 点它 → 又回到「运行中」。④ **⚠️ 真机测出来的竞态（已修）**：端脑 client 是**单例**，`setBaseUrl` 直接改它 ⇒ 大脑起来之前它指着 `TelencephalonClient.defaultBaseUrl`（`http://127.0.0.1:60080`，**移动端没人监听**）⇒ 启动期间发出的第一条消息会 connection refused。**实测时间轴**（小米 MIX 4，冷启动，`START u0` 为 t0）：Flutter 首帧 t=2.165s → Activity `Displayed` t=2.434s → **端脑面就绪 t=2.458s** ⇒ **UI 可交互到大脑就绪只有 ~25ms**，人类基本碰不到；**但大脑启动重试时窗口会拉长到 2s / 4s**（`_startWithRetry` 的退避），那时就能撞上。**修法 = 给端脑 client 加「就绪门」**：`TelencephalonClient.readinessGate`（宿主挂上来的 `Future<void> Function()`），**门挂在 `_u()` 这个「读 `_baseUrl`」的唯一收口上**，不是发请求那一步 —— 地址是发请求前拼好的，等晚了拼出来的还是那个死端口；`EncephalonMobileNotifier` 在构造时把 `waitUntilReady` 挂上去：大脑没在跑 ⇒ **拉起来再等**（这就是「默认启动，不需要开关」），用户**主动停过**（`_stoppedByUser` 标记）⇒ 立即返回（**不偷偷把用户刚停掉的大脑拉回来**，恢复得他自己点「启动大脑」），上限 15s（起不来就让请求照常失败，别把用户永远吊在「发送中」）。⑤ **⚠️ 两条既有红测试的真相（都不是 bug，是断言过时）**：(a) `test/widget/chat_screen_test.dart`「can enter text and tap send button」—— 旧断言 `expect(find.text('Hello, Shadow!'), findsNothing)` 本意是「输入框被清空」，但 `find.text` **同时匹配 `Text` 和 `EditableText`**，消息真的发出去之后这句话会作为**用户消息气泡**留在会话里 ⇒ 命中的是气泡不是输入框。那条旧断言是在「消息根本发不出去」的年代写的（`425e666` 之前 `generateResponse` 带 `mode == litert && isLitertReady` 守卫，在没有本地模型的测试环境里**直接 return**，什么都不会发生，测试也就「绿」了）⇒ 改成断言 **TextField 的 controller 为空** + **气泡存在**（后者比「找不到文本」更能证明发送成功）。(b) `test/unit/chat_provider_test.dart` 那 2 条图片/相机用例 —— 根因**不是** `setMode(litert)` 自动 `initLitert()`（构造时 `litertReady: true` ⇒ `setMode` 根本不会调 `initLitert`），而是 `425e666` 把 `generateResponseWithAttachments` 的条件**反转**了：旧规则是「本地引擎**就绪** + 有图 ⇒ 报图片不可用」，可 `_convertAttachmentsToLitertFormat` 恰恰会把图片转成 `{'image': base64}` 喂给本地引擎 —— **旧规则和那段代码自相矛盾**，`425e666` 修的是真 bug ⇒ 改成按**正确契约**断言：本地引擎**没就绪** ⇒ 报「图片不可用」；本地引擎**就绪** ⇒ 交给本地引擎、不报错。⑥ **⚠️ widget 测试的陷阱（别再踩）**：`testWidgets` 的 fake-async 区里 **sqflite ffi 开库是真实文件 I/O、永不完成** ⇒ 自动启动卡在「等模型列表就绪」、状态永远 `starting` ⇒ 解法：在 `setUpAll`（真异步区）先 `await DatabaseHelper.instance.database;` 打开一次，之后 getter 直接返回缓存实例。`pumpAndSettle()` 也不足以等 MethodChannel + SQLite 的自动启动 ⇒ 自己写 pump 循环等状态条件。⑦ **⚠️ 真机坐标的坑**：`adb shell input` 要用 **uiautomator dump 出来的真实 bounds**（输入框 `[297,2014][893,2146]` → 中心 (595,2080)；**软键盘弹起后布局上移**，发送按钮变成 `[915,1306][1047,1438]` → 中心 (981,1372)）。按截图比例换算的坐标（y=2147）**刚好落在 bounds 外** ⇒ tap 静默落空、看起来像「App 没反应」，白排查半天。⑧ **真机验通**：`am force-stop` → `am start`（**不点任何按钮**）⇒ logcat `✅ LLM provider set: http://192.168.31.147:8899/v1 model=mock-model` → `✅ Encephalon started on port 40635 (agent surface: 38713)`；端脑面 `/.well-known/agent.json` 200 + `/shadow/v1/agents` 200（**四个 native 叶区** parietal/prefrontal/temporal/occipital 全 `health_status: healthy`）、neuron 面 `/health` → `{"status":"healthy","service":"neuron"}` + `/v1/models` 24 个；从 App UI 发一条 `GATE-CHECK` → **MOCK-OK** 回显，PC 上 mock 上游收到的原始请求里 `system` = 叶区默认人设 + 会话人设拼接（1150 字符）、`user` = `GATE-CHECK` ⇒ **人设与多轮真的穿过了每一跳**。⑨ **测试基线**：本轮结束时 `flutter test` **261 passed / 0 failed**（此前 249 passed / **3 failed**），`flutter analyze --no-pub` **84 issues / 0 error**（基线 87）。**反向验证**（每条都做过）：注释掉 `_init()` 里的 `ensureStarted()` ⇒ 3 条变红；把 `generateResponseWithAttachments` 的条件退回旧的 ⇒ 3 条变红；恢复 `generateResponse` 的旧守卫 ⇒ `chat_screen_test` 变红（`Found 0 widgets`）；短路 `_u()` 里的 `_awaitReady()` ⇒ 2 条门测试变红；去掉 `_stoppedByUser` ⇒ 1 条变红。)
**Updated:** 2026-10-30 (㉑ **端脑的 `tool_call` 分支以前是死的 —— 已在真机上验通（但「模型自己调客户端工具」还没做）**：承 ⑳ 条，端脑 SSE 的 `tool_call` 是「影子给客户端换主题」那条产品线的地基，这轮查到底并修好。① **定性**：端脑的 `tool_call` 只有**外部 A2A 对端**能触发（native 叶区路径全程只产 `Delta`/`Error`）⇒ 之前它**永远不可能出现**。② **根因在 synapse**（不是端脑、也不是设备）：A2A 官方 `StreamResponse` **没有任何一类能承载工具调用**；synapse 服务端把 `ToolStart` 拍平成纯文本 `Calling tool: name(args)`、客户端又把不是失败的 `StatusUpdate` **全部丢弃** ⇒ 工具调用在线上被消灭。③ **修法**：`StatusUpdate.metadata` 开一条结构化旁路（键 `synapse_tool_event`），服务端写、客户端还原；**纯文本保留** ⇒ 老对端行为不变。反向验证：短路客户端还原 ⇒ 圆跳测试 **FAILED**（`left: 0, right: 1`）。④ **真机验通**：新增 `tool/mock_a2a_agent.mjs`（确定性 A2A 对端）→ 用 `POST /api/telencephalon/admin/agents/register` 注册进**手机**的端脑 → 手机的端脑真的发出 `event: tool_call`（`name=set_theme`、`args={"color":"#71717A"}`）。⑤ **⚠️ 移动端这边的真实缺口**：端脑会发 `tool_call` 了，但**移动端没有任何渲染/执行它的代码**（桌面端有骨架 `ToolPartRouter`/`ClientToolForm` 但也**零消费方**）⇒ 「模型让客户端换主题」这条闭环在两端都还没接上；且跑通的那个 `tool_call` 来自**外部对端**，不是模型自己决定的（叶区 `call_llm` 还没带 `tools` 字段）。⑥ **⚠️ `.so` 的跨仓依赖**：`telencephalon` 是 `synapse` 的 path 依赖 ⇒ **synapse 改了手机里的 `libencephalon.so` 就变了**，改 synapse 后必须重跑 `scripts/build-android.ps1`（4-5 min）+ 重打 APK 装机，端脑能力才会真的变。
**Updated:** 2026-10-30 (⑳ **移动端对话页根本进不了端脑链路 —— 真机上撞出来的三个洞（都修了）**：⑲ 条把链路的断点定位到「叶区 → LLM」那一跳；这轮把那一跳补上并**在真机上验到底**，顺带挖出三个洞，其中一个是**「所有通信都要走大脑 → 端脑 → 叶区」这条规则在移动端 UI 面上一直是断的**。① **LLM 供给通道（不依赖环境变量）**：neuron's remote 引擎**只认** `NEURON_REMOTE_BASE_URL` / `NEURON_REMOTE_MODELS` / `NEURON_REMOTE_API_KEY`，而 Android App 进程的环境变量由 zygote 决定、宿主注入不了（Android 10+ 连 `/proc/<pid>/environ` 都读不到）⇒ 环境变量路线在移动端是**死的**。于是走程序化注册：宿主把本地 SQLite `models` 表里 `source='cloudProvider'` 的那条推给大脑（`EncephalonRuntime.setLlmProvider` → JNI `nativeSetLlmProvider` → `encephalon_mobile_set_llm_provider` → `Embedded::boot` 里注册进 neuron 的**派发表** `state.engines.llm`）。⚠️ **注册引擎 ≠ 叶区会用它**：叶区按**模型 id** 请求，宿主还必须 `set_default_model_for_all_lobes(model)`，两件都做才会通。**端点要含 `/v1`**（neuron 拼的是 `{base_url}/chat/completions`）。**供应商配置读的是本地 `models` 表，不是 `providers_screen.dart` 那条路** —— 后者走 Prefrontal 后端（移动端已内嵌/离线），且 `ProviderInfo.fromResponse` 把 `apiKey` 丢了。② **⚠️ 产品缺口：移动端**配不出**云端供应商** —— 空状态提示写着「点击右下角添加模型」（`modelEmptyHint`），但那个按钮**根本不存在**：`_addLocalModel` / `_addCloudModel` 定义了却**零调用方** ⇒ 那句提示是骗人的，用户点了右下角什么也不会发生。补上 FAB + `_showAddModelSheet`（本地 / 云端二选一）。顺带：`ModelsNotifier` 增加 `late final ready` —— 首次加载是异步的（开库 → 扫本地模型 → 查表），宿主等它才能读模型列表，不等会误判成「用户没配供应商」。③ **⚠️ 移动端对话页永远进不了端脑链路**（真机上卡在「初始化中…」、标题是 **LiteRT**）：`ChatNotifier` 构造函数无条件调 `_initLiteRT()`，而它**一上来就把 `mode` 设成 `ChatMode.litert`** ⇒ `chat_screen.dart` 的 `isLitertMode` 恒为 true ⇒ 恒渲染 **`PrefrontalChatView`** —— 而那条视图走的是**前额叶方言**（`/api/sessions`），「改嵌大脑」之后端脑面上**根本没有这条路由** ⇒ 永远转圈。更要命的是 `generateResponse` 的守卫 `mode == litert && isLitertReady` —— 两个条件说的都是**本地** LiteRT 引擎 ⇒ **没装本地模型的设备上一条消息都发不出去**（函数直接返回），`local_chat_view.dart` 里输入框的 `enabled` 也是同一个条件 ⇒ **输入框整个是禁用的**。修法（Dart 侧）：`mode` 只在**本地引擎真的就绪**时才设成 litert（从 `_initLiteRT()` 挪到 `initLitert()` 的成功分支）；`generateResponse` / `generateResponseWithAttachments` **总是**走 `_generateLitertResponse`（它自己的语义本来就是「**先端脑、后本地**」）；新增 `ChatState.canChat` 取代「本地引擎就绪」作为输入框可用的条件。**这条的意义不止是「聊天能用」** —— 它正是「两个客户端都要维持 大脑 → 端脑 → 叶区 这条链路」在移动端 **UI 面**的兑现。④ **装机验证（真机，逐段实测）**：模型管理页加云端供应商（`mock` / `http://192.168.31.147:8899/v1` / `testkey` / `mock-model`）→ 设置 → 嵌入式大脑 → 启动大脑 ⇒ 端脑面 `127.0.0.1:38535`、neuron 面 `127.0.0.1:40315`（端口每次随机，用 `adb forward` + `ss -tln` 找）；`POST /shadow/v1/conversations/{id}/messages` → **200 `"reply":"MOCK-OK"`**；**PC 上的 mock 上游收到的原始请求**里 `system` = 叶区默认人设 + 会话人设拼接、`messages` = 4 条（上一轮 user + 上一轮 assistant + 当前轮 user）⇒ **人设与多轮都真的穿过了每一跳**。**错误信息的形状是判据**：断链 = `Failed to get models: ... (http://localhost:60080/v1/models)`（端点错）→ 命中 neuron 但无模型 = `NO_MODEL_CONFIGURED` → 引擎注册错 = `no_engine_for_model` —— 三种形状指三个不同的洞。⑤ **⚠️ UI 操作的两个坑（别再试）**：`input keyevent 111`(ESC) 与 `input keyevent 4`(BACK) 都会**直接关掉**「添加云端模型」对话框（`input text` **不会**唤起软键盘）⇒ 只能填完**直接点「添加」**；而且**软键盘弹起后对话框会上移**，字段坐标会变 —— 要按键盘弹起后的坐标填，否则 URL 会落进「模型名称」那一栏。

**Updated:** 2026-10-30 (⑲ **真机复验：设置页白屏结案 + 链路最后一跳的根因**：设备重新接上（小米 MIX 4 / `2106118C` / Android 13 / arm64-v8a / Odin+SD835），把上一条挂着的「真机未验」与「设置页正文全白」一起做完了。① **「设置页正文全白」的根因不是渲染器，是旧 APK 的代码**：设备上那个包是 **10-29 08:34** 装的，而修它的提交 `8f293a8`（引入 ShadcnUI + 升 Flutter 3.47.8，给 `GlassCard` 的 child 套 `Material(type: transparency)`）是 **12:28** —— 旧包在它之前。旧版设置页正文用 `GlassCard` 包 **`ListTile`**，而 Flutter 3.47.8 在 `ListTile` 被有背景色的祖先包裹时 debug 模式会 `FlutterError.reportError`（`list_tile.dart:1147` `_debugCheckBackgroundIsHidden`）⇒ **body 子树构建中断 ⇒ 整片正文不画**，而 AppBar / 底栏（不在那个子树里）照常显示 —— 症状与「白屏」完全吻合。**AGENTS.md 里那条「widget 测试渲染出 52 段文本」不能用来排除代码 bug**：测试跑的是 `895e668` 重构**之后**的代码，不是旧包里的代码。**已排除的三条嫌疑（都实测过，别再走一遍）**：`--ez enable-impeller false` 的 A/B **无效** —— Flutter 3.47.8 里 opt-out 已 deprecated（`shell.cc:527` 打的是「Impeller opt-out deprecated」警告），但 `flutter_main.cc:124-139` 的 `SelectedRenderingAPI` 仍会返回 `kSkiaOpenGLES` ⇒ **确实切到了 Skia**（logcat 里 `AdrenoGLES-0` = GLES 路径），而设置页**照样全白**；`pm clear` 清空应用数据后**照样全白**（不是持久化状态）；logcat 里**没有任何 Flutter 异常**（`E/flutter` 一条都没有 —— 不是构建期抛错）。**像素级测量给出的真相**：设置页正文区域 maxChannel 只有 **19/255**（卡片其实**画出来了**，只是暗色玻璃 `surfaceDarkGlass = 0x14FFFFFF`（alpha 8%）+ 边框 `borderDarkDefault = 0x1FFFFFFF`（alpha 12%）在纯黑底上肉眼不可见）—— 而任务看板页同样的卡片 maxChannel 是 250（**可见**），因为它用的是另一套更亮的 `AppColors.darkSurfaceGlass` / `darkBorder`（**两条路径用了不同的玻璃色**）。切浅色模式（`cmd uimode night no`）验证：浅色玻璃 `0xB3FFFFFF`（alpha 70%）本该很显眼，**正文依然空白** ⇒ 推翻「alpha 太低」这个假设 ⇒ 回到「子树没构建」。**重装新包后设置页完全正常**（外观组 / 主题色含新 logo「绛」色 / 玻璃强度 / 语音与辅助 / 连接组 / 高级折叠全部渲染）。② **链路真机复验的结论（三段都活着，断点精确定位在最后一跳）**：重编 `libencephalon.so`（`encephalon/scripts/build-android.ps1`，33 分钟，150.5 MB）+ 重打 APK（含 `e0ae904` 链路改造的 Dart 代码）后装到真机 ⇒ **端脑面起来了**（`files/flows` 目录的 mtime 正好是点「启动大脑」那一刻；`ss -tln` 找到随机端口，`/.well-known/agent.json` 与 `/shadow/v1/agents` 都 200，三个 native 叶区 temporal/prefrontal/parietal/occipital 都在），**neuron 的 OpenAI 面也活着**（`/health` → `{"status":"healthy"}`，`/v1/models` → 25 个模型），**端脑会话创建也成功**（`POST /shadow/v1/conversations` → 200 + RFC3339 `created_at`，正是本文件上面记的那个 wire 形状）。**但发消息断在最后一跳**，错误把根因说得很清楚：`POST /shadow/v1/conversations/{id}/messages` 与 `:stream` 都返回 **`502` / `{"error":{"code":5022,"message":"Failed to get models: error sending request for url (http://localhost:60080/v1/models)"}}`** —— 叶区仍在打 **`localhost:60080`**（那是**桌面 sidecar 的端口**，移动端上没人监听），而 neuron 的真实地址是 `127.0.0.1:<随机端口>`。③ **根因是「改了一套存储、调用读的是另一套」**（已在上游 `telencephalon` 修）：`NativeLobeRegistry` 同时持有 `inner`（`Arc<dyn NativeLobe>`，**shadow API 走这条**）与 `runtimes`（`LobeRuntime`，带 `openai_base_url`）；`reconfigure` / `point_lobes_at_neuron` 改的是**后者**，而 `build_lobe_client_with` 拿的是**前者**，且 `LobeClient::NativeWithConfig` 自己读环境变量 `TELENCEPHALON_NEURON_URL`、读不到就退回硬编码的 `http://localhost:60080` ⇒ **`point_lobes_at_neuron` 对实际调用路径完全无效**（桌面端 `cortex_http.rs:126` 用的是同一个 `reconfigure`，**所以桌面端有完全相同的 bug**）。修法：让 `LobeClient` **携带宿主配好的端点**（新增 `NativeAt(lobe, config, url)` 变体，端点取自 registry 的 runtime），环境变量只作兜底；配 2 条回归测试（端点必须真的到 client 上 / 永远不许退回那个死端口）。④ **⚠️ 移动端还差最后一环**：neuron 里 `available_count = 0`（无本地模型），而 **neuron 的所有 LLM 后端（candle / litert / mistralrs / llamacpp / remote）都靠环境变量选**（`NEURON_LLM_RUNTIME` / `NEURON_REMOTE_BASE_URL` 等），**App 进程注入不了环境变量**（Android 的 zygote 决定）⇒ **「移动端怎么给 neuron 配 LLM」是个真问题**，现有 `model_download_service.dart` 走的是 **LiteRT `.litertlm`**（Kotlin 侧），与 neuron 的 candle/gguf 是**两套引擎**、**接不上**。这是真机验完链路后暴露的下一层，不是本条能顺手解掉的。
**Updated:** 2026-10-28 (移动端「改嵌大脑」落地：嵌入式运行时换成与桌面端**同一个**大脑 `encephalon`（`libencephalon.so` 经 MethodChannel `com.ibloc.shadow/encephalon_runtime` 加载），不再是前额叶 lobe —— **两端嵌入的运行时现在一致了**。嵌入运行时内**再挂一层端脑面**（telencephalon `cortex_router`，`127.0.0.1` 随机端口），Dart 侧把端脑 client 指过去，**对话**与**会话列表**从前额叶方言迁到端脑方言；soul / tasks / memory / providers / skills / mcp / agents 列表页与语音会话模式**仍在前额叶方言**（端脑面上一条前额叶路径都没有，见根 `AGENTS.md` §「移动端 agent 面：两套「方言」与嵌入式大脑」）。移动端**不编本地海马体**（记忆走零信任网络内其它设备）⇒ Lance 退出移动端依赖图。旧的嵌入式前额叶支线（`/settings/prefrontal` + `libprefrontal_core_lib.so`）仍在，但已是**遗留**路径)
**Updated:** 2026-10-28 (收口残留的 `:8082`：移动端主链是端脑 `:60080`，但 6 处代码仍按前额叶 `:8082` 走。其中 4 处是纯端口残留（服务健康检查清单 / continue-on-desktop 手工填端点 / localPeer / 注释），改成 `:60080`；1 处（log 面板的 `/api/logs/stream`）只有前额叶有该路由，改连**本机嵌入式前额叶的真实端口**；3 处属于 **WebRTC companion 死代码**（自引用闭环、零外部引用，且 WS 路径 `/api/sessions/{id}/ws` 是前额叶专属、端脑的是 `/api/webrtc/{modality}/...`），按孤儿代码惯例整段删除并摘掉 `flutter_webrtc` 依赖)
**Updated:** 2026-10-28 (补上 **嵌入式 Prefrontal 运行时**（NDK `.so`）这条支线：MethodChannel/JNI 链路、`.so` 来源与缺失降级、以及它在整体架构里的位置 —— 移动端主链是端脑 telencephalon，嵌入支线跑的是前额叶；桌面端已升级为嵌大脑 `encephalon`，**两端嵌入的运行时目前不一致**。另：补上 `com.ibloc.shadow/prefrontal_runtime` channel（此前漏登记）)
**Updated:** 2026-09-25 (post-audit-cycle: telencephalon-centric view confirmed; port `:60080` unified; references [`2026-09-25-e2e-coverage-assessment.md`](../../docs/superpowers/architecture/2026-09-25-e2e-coverage-assessment.md))
**Project:** shadow-mobile (Layer 4 Interaction + thin on-device Engine via Kotlin Native)

> **Note (2026-07-19)**: This doc was previously framed as a "Layer 4 + Layer 2 hybrid" with 3 user-configurable modes. That framing predates **Telencephalon** (Layer 3.5). Current architecture: mobile is **primarily Layer 4** (Flutter UI); the on-device inference capability lives in the **Kotlin Native** layer (OpenAIServer.kt + LiteRT/MNN), exposed as a sidecar HTTP server on `:8085` when the user opts in. The default mobile flow routes everything through **telencephalon** (`:60080`).

## ARCHITECTURAL ROLE

Shadow-Mobile is the **Interaction Layer (Layer 4)** mobile client of the Shadow Platform. It is a **thin UI client** that talks to:

- **Agent Orchestrator (Telencephalon, Layer 3.5)** via `/api/telencephalon/*` — **primary** path; the mobile app routes most agent / flow / MCP / conversation / discovery operations through telencephalon
- **Agent Layer (Prefrontal)** via OpenAI `/v1/*` and A2A — **fallback** when telencephalon unreachable (note: `dacbe83` removed automatic fallback for `continue-on-desktop`)
- **Embedded Encephalon runtime** as an in-process NDK `.so` (`libencephalon.so`) — the **same brain** shadow-desktop embeds (`encephalon::Embedded::boot()`): thalamus + ACP 总线 + 端脑 + 单一 neuron (see §EMBEDDED ENCEPHALON RUNTIME). Its embedded **agent surface** is the telencephalon `cortex_router` on `127.0.0.1:<random>` — the **telencephalon dialect** only
- **Embedded Prefrontal runtime** as an in-process NDK `.so` — a **legacy** path (see §EMBEDDED PREFRONTAL RUNTIME). It embeds a *lobe* (prefrontal), not the brain; superseded by the embedding above
- **Local inference** via Kotlin `OpenAIServer.kt` (MNN / LiteRT bindings) on `:8085` when in **Phone-as-Engine** opt-in mode

**Reference**: `/home/ibloc/Projects/docs/superpowers/specs/2026-06-04-shadow-architecture-redesign.md`

## KEY PRINCIPLE: THIN CLIENT

The mobile app should NOT directly know about LLM/TTS/ASR internals. It only:
1. Sends user input to Agent (OpenAI `/v1/chat/completions` or A2A)
2. Receives streamed responses (SSE / WebSocket)
3. Plays TTS (via `/v1/audio/speech` response)
4. Captures mic audio (VAD-driven `audio_ws_service`)
5. Renders UI (Flutter 3.11+ with Riverpod 2.5 + GoRouter 14.8)
6. Surfaces native-platform capabilities (Android Accessibility for automation, MNN/LiteRT for on-device inference)

## OPERATING MODES (v2.8+ — post 2026-08-18)

| Mode | Path | Route | What happens |
|---|---|---|---|
| **Voice Assistant** (default) | `/voice` | mic → ASR → LLM (telencephalon or LiteRT) → TTS → shadow-esp32 USB / phone / BT | Interactive speech dialog. phone runs everything; shadow-esp32 is USB Audio sink + mic source. |
| **Live Stream** | `/livestream` | phone TTS text input → TTS → shadow-esp32 USB / phone / BT | TTS playback / read-aloud mode. shadow-esp32 is USB Audio sink only. |
| **Customer Service** | `/customer-service` | phone cellular call → shadow-esp32 USB / wired earphone | AI auto-answer phone calls. shadow-esp32 plays caller voice + AI TTS. Earphone takeover when plugged in. |

Both modes route audio via `UsbAudioRouter` (v2.5) to whichever output the user selects in the screen header:

| Output | Code | Description |
|---|---|---|
| **phone speaker** | `ShadowOutputRoute.phoneSpeaker` | Built-in speaker / wired headset |
| **BT headset** | `ShadowOutputRoute.bluetoothHeadset` | Standard Android Bluetooth; phone handles pairing |
| **shadow-esp32** | `ShadowOutputRoute.shadowEsp32` | `UsbAudioRouter.routeTo()` → `AudioManager.preferredDevice` |

The `ShadowOperationModeProvider` / `ShadowOutputRouteProvider` Riverpod state holds the current selection. A "Live" bottom-nav tab (added to `MainShell`) drives to `/livestream`; tapping the mic icon from there jumps back to `/voice`.

## PLATFORM CHANNELS (registered in `MainActivity.configureFlutterEngine`)

| Channel | Direction | Purpose |
|---|---|---|
| `com.ibloc.shadow/litert` | ⇅ | Load / infer / diagnose LiteRT model |
| `com.ibloc.shadow/engine` | ⇅ | Start/stop OpenAIServer, mDNS, auth, port config |
| `com.ibloc.shadow/tts` | ⇅ | Android TTS engine |
| `com.ibloc.shadow/accessibility` | ⇅ | Android Accessibility automation |
| `com.ibloc.shadow/mdns` | ⇅ | Discover + resolve `_shadow._tcp` services |
| `com.ibloc.shadow/mnn_logs` | ← | EventChannel: logcat streaming |
| `com.ibloc.shadow/pcm_audio` | ⇅ | Start/stop 16kHz PCM recording |
| `com.ibloc.shadow/pcm_audio_stream` | ← | EventChannel: PCM chunks to Dart |
| `com.ibloc.shadow/http_server` | ⇅ | MobileActionServer start/stop |
| `com.ibloc.shadow/engine` | ⇅ | Phone-as-Engine OpenAI server |
| `com.ibloc.shadow/ble_provision` | **v2.5** ⇅ | `provision(ssid, psk)` writes shadow-esp32 Wi-Fi creds via GATT |
| `com.ibloc.shadow/usb_audio` | **v2.5** ⇅ | `listRoutes` / `routeTo(id)` route Android audio to shadow-esp32 USB sink |
| `com.ibloc.shadow/call_state` | **v2.8** ⇅ | InCallService call events: `onCallState(idle/ringing/active/ended)`, `onEarphoneTakeover(taken)`, `setAiAutoAnswer(enabled)`, `setPreferredDevice(device)` |

> **Design note (v2.6+):** `com.ibloc.shadow/ble_provision` and `com.ibloc.shadow/usb_audio` were added in v2.5 to support the BLE provisioning flow. The `voice_conversation_screen.dart` and `livestream_screen.dart` screens automatically call `UsbAudioRouter.routeTo()` on initialization when they detect a connected shadow-esp32 — no explicit user-tap needed after initial provisioning.

```
shadow-mobile/
├── pubspec.yaml                         # Flutter package (Dart SDK ^3.13.0)
├── lib/
│   ├── main.dart                        # Entry — initializes AppConfig + ModelManager + Riverpod
│   ├── litert_engine.dart               # LiteRT LM engine wrapper
│   ├── litert_model.dart                # LiteRT model metadata + load
│   ├── mnn_engine.dart                  # MNN inference engine wrapper (uses Android Kotlin/C++ bridge)
│   ├── tts_engine.dart                  # TTS pipeline
│   ├── model_manager.dart               # Model registry + lifecycle
│   ├── model_config.dart                # Model configuration types
│   ├── router/
│   │   └── app_router.dart              # GoRouter declarative routes
│   ├── agents/                          # In-process agent runtimes
│   │   ├── a2a/                         # A2A client + message + server stubs (3 files)
│   │   ├── main_agent/                  # Main chat orchestrator (prompt + tools, 3 files)
│   │   ├── mobile_action_agent/         # Android-action sub-agent (Accessibility-based, 4 files)
│   │   └── providers/                   # agent_provider (Riverpod)
│   ├── screens/                         # 19 UI pages
│   │   ├── agents_screen.dart / chat_screen.dart / conversation_screen.dart
│   │   ├── flows_screen.dart            # Browse / run telencephalon flows (Sprint 1, commit 55ffc95)
│   │   ├── group_screen.dart / mcp_screen.dart / memory_screen.dart
│   │   ├── model_management_screen.dart / model_settings_screen.dart
│   │   ├── prompt_settings_screen.dart / providers_screen.dart / settings_screen.dart
│   │   ├── setup_wizard_screen.dart     # First-run wizard (telencephalon discovery + model check)
│   │   ├── skills_screen.dart / soul_screen.dart / task_board_screen.dart
│   │   ├── voice_conversation_screen.dart  # Hands-free voice mode
│   │   └── manage/                      # Sub-management screens
│   ├── services/                        # Wire-level + service layer (23 files)
│   │   ├── cortex/                      # cortex_client.dart — HTTP to telencephalon :60080 (dir name kept for git history)
│   │   ├── prefrontal/                  # Embedded prefrontal (.so) JNI bridge + settings page (4 files)
│   │   ├── database/                    # SQLite repositories (11 files)
│   │   ├── genui/                       # GenUI server helpers (Agent2UI)
│   │   ├── audio_ws_service.dart        # WebSocket audio streaming (VAD-driven)
│   │   ├── wake_word_service.dart       # Wake-word detection
│   │   ├── accessibility_controller.dart  # Android Accessibility API bridge
│   │   ├── session_transfer_service.dart  # Cross-device session transfer
│   │   ├── soul_service.dart            # "Soul" agent persistence
│   │   ├── model_download_service.dart  # Model puller (delegates to neuron `/v1/models/pull`)
│   │   ├── mdns_discovery.dart          # `_shadow._tcp` browsing
│   │   ├── network_service.dart         # connectivity_plus wrapper
│   │   ├── group_service.dart           # mTLS group manager
│   │   ├── engine_service.dart          # Inference engine coordination
│   │   ├── log_service.dart             # Rolling file logger (mobile-side)
│   │   ├── pcm_audio_recorder.dart      # PCM mic capture
│   │   ├── video_frame_collector.dart   # Camera frame capture for multimodal
│   │   ├── agent_review_service.dart    # Agent-review flow (approve / reject draft flows)
│   │   ├── app_config_service.dart      # App-level config init
│   │   └── prefrontal_client.dart       # HTTP client to telencephalon :60080 (/v1/* shim; chat/TTS/ASR)
│   ├── providers/                       # Riverpod state (14 providers)
│   │   ├── ai/                          # AI-specific providers (model registry, embeddings)
│   │   ├── cortex_provider.dart
│   │   ├── chat_provider.dart / conversation_mode_provider.dart
│   │   ├── flow_provider.dart / genui_provider.dart
│   │   ├── mnn_agent_integration.dart
│   │   ├── model_download_provider.dart / engine_models_provider.dart
│   │   ├── wake_word_provider.dart / theme_provider.dart / log_provider.dart
│   │   ├── service_provider.dart / error_dialog_provider.dart
│   ├── multimodal/                      # Audio / image / file input handlers (5 files)
│   ├── models/                          # Data classes (conversations, agents, flows, etc.)
│   ├── skills/                          # Skill definitions
│   ├── flutter_genui/                   # GenUI runtime (Agent2UI)
│   ├── theme/                           # Material 3 + glassmorphism themes
│   ├── widgets/                         # Reusable widgets
│   ├── utils/                           # Helpers (logging, formatting, etc.)
│   ├── config/                          # Build-time config
│   ├── l10n/                            # i18n strings (zh / en arb files — see i18n section)
│   └── generated/l10n/                  # Generated AppLocalizations (from arb files)
├── android/                             # Android platform code (Kotlin + C++)
│   └── app/src/main/
│       ├── kotlin/com/ibloc/shadow/
│       │   ├── MainActivity.kt          # Platform Channels registration
│       │   ├── PrefrontalAccessibilityService.kt
│       │   ├── litert/LitertEngine.kt   # Google AI Edge LiteRT
│       │   ├── mnn/                     # MNN wrapper
│       │   ├── pcm/PcmAudioRecorder.kt  # 16kHz PCM recording
│       │   ├── tts/TtsManager.kt
│       │   ├── http/MobileActionServer.kt  # HTTP server for mobile-action sub-agent
│       │   ├── OpenAIServer.kt          # Phone-as-Engine OpenAI-compat server (port 8085)
│       │   └── ...
│       └── cpp/                         # C++ JNI bridge
│           └── mnn_bridge.cpp
├── ios/                                 # iOS platform code (Swift / Objective-C)
│   └── Runner.xcodeproj/
└── assets/
    ├── models/                          # Default model catalog (small JSONs)
    └── config/                          # Default config files
```

## INBOUND PROTOCOLS (calls Telencephalon, then Prefrontal as fallback)

All HTTP calls go to standard endpoints. **No direct engine calls** — the mobile app never speaks `/v1/chat/completions` directly when telencephalon is reachable.

```dart
// LLM Chat (streaming)
POST {host}/v1/chat/completions       // via telencephalon or prefrontal
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

// Conversations (telencephalon preferred — `/shadow/v1/conversations`)
POST {host}/shadow/v1/conversations                // create
GET  {host}/shadow/v1/conversations                // list
POST {host}/shadow/v1/conversations/{id}/messages  // send (may return SSE)

// WebSocket streaming (chat)
WS {host}/api/sessions/{id}/ws

// Agent discovery
GET  {host}/.well-known/agent.json  → A2A AgentCard
```

## TELENCEPHALON-SPECIFIC ENDPOINTS (Sprint 1+2)

`lib/services/telencephalon/telencephalon_client.dart` (~814 lines after 2026-09-27 telencephalon migration) is the canonical caller for everything except chat/TTS/ASR (which still go through `prefrontal_client.dart` against the telencephalon `/v1/*` shim).

```dart
// === Health / discovery ===
Future<Map<String, dynamic>> health()                  // GET /.well-known/agent.json
Future<AgentsResponse>    listAgents()                 // GET /shadow/v1/agents
Future<Map<String, dynamic>> getAgent(String name)     // GET /shadow/v1/agents/{name}

// === Conversations (Sprint 1 — telencephalon persistence) ===
Future<Conversation> createConversation({agent, systemPrompt})  // POST /shadow/v1/conversations
Future<Conversation> getConversation(String id)                 // GET  /shadow/v1/conversations/{id}
Future<List<Conversation>> listConversations()                  // GET  /shadow/v1/conversations
Future<Conversation> importSessionAsConversation(...)           // POST session-export → conversation
Future<SendMessageResponse> sendMessage(id, req)                // POST /shadow/v1/conversations/{id}/messages

// === Flows (Sprint 1 — flows via telencephalon) ===
Future<List<FlowMeta>>      listFlows({name, tag, isDraft})      // GET    /api/flows
Future<FlowDefinition>      createFlow(FlowDefinition flow)      // POST   /api/flows
Future<FlowDefinition>      getFlow(String id)                   // GET    /api/flows/{id}
Future<FlowRunResult>       runFlow(flowIdOrName, inputs, ...)   // POST   /api/flows/{id}/run
Future<List<FlowDefinition>> listDrafts()                       // GET    /api/flows/draft
Future<FlowDefinition>      promoteDraft(draftId)                // POST   /api/flows/draft/{id}/promote
void                       rejectDraft(draftId)                 // POST   /api/flows/draft/{id}/reject

// === Admin (via shared surface with desktop) ===
// MCP / WASM / agent install / LLM description — same routes as desktop's telencephalon client
```

Mobile-specific helpers (NOT in desktop's telencephalon client):
- `importSessionAsConversation(...)` — converts a `SessionExport` JSON into a telencephalon conversation so the phone can pick up where another device left off
- **continue-on-desktop flow** (per `dacbe83`) — uses telencephalon only (no prefrontal fallback); the mobile app discovers the desktop's telencephalon endpoint and routes the chat session there

### 端脑会话的 wire 形状（别照着前额叶方言抄）

端脑的 `ConversationTurn` 在 Rust 侧是 `{ role, text, at }`，`at: DateTime<Utc>`
序列化成 **RFC3339 字符串**：

```json
{ "role": "user", "text": "hi", "at": "2026-10-29T01:23:46.123456789Z" }
```

**字段名是 `at`，不是 `timestamp`。** 前额叶方言用的才是 `timestamp`（毫秒整数）。
只认 `timestamp` 的客户端读到一条历史就会 `(json['timestamp'] as num).toInt()`
撞上 `null` → `_TypeError`，于是**会话列表页和 session transfer 的导入响应
一起崩**。`ConversationTurn.fromJson` 现在两种形状都认（见
`lib/services/telencephalon/telencephalon_client.dart`），回归测试在
`test/telencephalon_client_test.dart` 的 *conversation wire shape* 组里。

其它容易抄错的地方：

| 字段 | 端脑实际发的 | 说明 |
|---|---|---|
| `created_at` / `updated_at` | RFC3339 字符串 | `DateTime.parse` 直接能解 |
| `history[].role` | `"user"` / `"agent"` | 不是 `"assistant"` |
| `history[].at` | RFC3339 字符串 | **不是 `timestamp`** |
| `SendMessageResponse.timestamp` | 毫秒整数 | 这个**是**整数 |
| `agents[].agent_card.metadata.*` | `input_modalities` / `output_modalities` / `capabilities` | 空数组会被 `skip_serializing_if` 省略 |

端脑注册了三个 native lobe：**`temporal` / `prefrontal` / `parietal`**
（`NativeLobeRegistry::with_temporal()`）。`createConversation()` 不带 agent 时
服务端用 `CORTEX_DEFAULT_AGENT` 或 `"temporal"`。

## OUTBOUND PROTOCOLS (when Mobile is in Phone-as-Engine mode)

When the user enables **Phone-as-Engine** in Settings, the Kotlin `OpenAIServer.kt` exposes an OpenAI-compatible HTTP server on `:8085`:

```
POST /v1/chat/completions    # Delegates to LiteRT.generateContent()
GET  /v1/models              # Lists installed .litertlm files
```

This allows a desktop/Prefrontal agent to call `http://mobile.local:8085/v1/chat/completions` and use the phone's local LLM. mDNS `_shadow._tcp` advertises the service with capabilities TXT records.

## mDNS SERVICE DISCOVERY

On startup, the app browses `_shadow._tcp` services via `mdns_discovery.dart`:

```dart
// mDNS query for _shadow._tcp services
// then for each found service:
//   - GET http://host:port/.well-known/agent.json  → A2A AgentCard
//   - POST http://host:60080/api/telencephalon/agents  → register self (if user opts in)
//   - open WS ws://host:60080/api/webrtc/... for companion mode（端脑确实有这条路由，
//     但移动端 2026-10-28 把旧的 WebRTC companion 链当死代码删了，尚未接回来）
```

Persist discovered hosts in `preferences` (or SQLite via `group_service.dart`); the user can pin favourites on the Group page (`group_screen.dart`).

## COMPANION MODE (WebRTC) —— 2026-10-28 整段删除

原实现三个文件（`lib/services/webrtc_companion.dart`、`lib/services/webrtc_signaling.dart`、
`lib/providers/companion_mode_provider.dart`）**自引用闭环、零外部引用**：`companionModeProvider`
从未被任何 screen/widget 读取，`CompanionModeNotifier.start()` 从未被调用，
`telencephalon_client.webrtcSignalingUrl()` 也从未被引用 —— 整条链不可达。

而且它指向的服务已经变了：`WebRtcSignaling` 拼的是 **`/api/sessions/{id}/ws`**，那是
**Prefrontal 专属**路由（`prefrontal/src/server/routes.rs:76`）；Telencephalon 的 WS 路由是
`/api/webrtc/{modality}/sessions/{id}/ws`（`telencephalon/src/api/webrtc_route.rs:36`）。
原代码的 primary 是端脑 `:60080`、fallback 是前额叶 `:8082` —— 两边的路径都对不上。

故按「孤儿代码」惯例删除（git 历史保留），并从 `pubspec.yaml` 摘掉 `flutter_webrtc`
（它唯一的使用者就是 `webrtc_companion.dart`；摘掉后 APK 不再带 `libjingle_peerconnection_so.so`）。

要重做 Companion Mode 时：`TelencephalonClient.webrtcSignalingUrl(sessionId, modality)`
已经是正确的 URL 构造器，直接接上 `flutter_webrtc` 即可。

> 消息式 **Conversation Mode**（WebSocket 一次性语音消息，非实时）不受影响 ——
> 那条路走 `conversation_mode_provider` + `audio_ws_service.dart`，仍在。

## AGENTS (in-process)

`lib/agents/` hosts three runtimes + their providers:

| Subdir | Files | Role |
|---|---|---|
| `a2a/` | `a2a_client.dart` / `a2a_message.dart` / `a2a_server.dart` | A2A message types + client (outbound HTTP to other telencephalon / prefrontal / external) + server stub |
| `main_agent/` | `main_agent.dart` / `main_agent_prompt.dart` / `main_agent_tools.dart` | Primary chat orchestrator; system prompt + tool registry; runs on-device in Standalone mode |
| `mobile_action_agent/` | `actions.dart` / `mobile_action_agent.dart` / `mobile_actions_tools.dart` / `mobile_actions_viewmodel.dart` | Sub-agent that calls `AccessibilityController` to tap / swipe / type on Android UI elements |
| `providers/` | `agent_provider.dart` | Riverpod glue |

The `main_agent` is intentionally thin — for any non-trivial task (file ops, code edits, browser automation), it delegates to a **telencephalon flow** via `TelencephalonClient.runFlow(...)`. The `mobile_action_agent` is one of the few exceptions (it must run on-device because it touches the Android Accessibility API).

## PLATFORM CHANNELS (Flutter ↔ Kotlin)

| Channel | Purpose |
|---|---|---|
| `com.ibloc.shadow/litert` | LiteRT model load + inference |
| `com.ibloc.shadow/mnn` | MNN model load + inference |
| `com.ibloc.shadow/tts` | Android TTS engine |
| `com.ibloc.shadow/accessibility` | Android Accessibility automation |
| `com.ibloc.shadow/mdns` | Network discovery |
| `com.ibloc.shadow/mnn_logs` | Logcat streaming |
| `com.ibloc.shadow/pcm_audio` | Audio recording control |
| `com.ibloc.shadow/pcm_audio_stream` | Audio data stream (EventChannel) |
| `com.ibloc.shadow/http_server` | Mobile action server |
| `com.ibloc.shadow/prefrontal_runtime` | 嵌入式 Prefrontal 运行时（NDK `.so`）：`start` / `stop` / `isHealthy` / `getStatus` / `registerAgent` / `invokeAgent` / `startAndroidService` / `stopAndroidService` |
| `com.ibloc.shadow/encephalon_runtime` | 嵌入式 **大脑** 运行时（NDK `libencephalon.so`）：`start`（入参 `port` + `dataDir`，返回 `success` / `port` / `agentPort`）/ `stop` / `getPort` / `isHealthy` / `getStatus`（返回 `running` / `port` / `agentPort` / `healthy`）/ `infer`。**端脑面端口**看 `agentPort`：正数 = 端脑面在监听；**0 = 大脑在跑但端脑面没起来**（此时客户端不指过去）；**-2 = 大脑整个没在跑** |
| `com.ibloc.shadow/engine` | Phone-as-Engine OpenAI server: `startServer` / `stopServer` / `isServerRunning` / `getServerUrl` / `getApiKey` / `setApiKey` / `setAuthEnabled` / `getServiceName` |
| `com.ibloc.shadow/ble_provision` | **v2.5** — `provision(ssid, psk)` writes shadow-esp32 Wi-Fi creds via GATT |
| `com.ibloc.shadow/usb_audio` | **v2.5** — `listRoutes` / `routeTo(id)` route Android audio to shadow-esp32 USB sink |

## EMBEDDED PREFRONTAL RUNTIME (NDK `.so`, 2026-10-28)

手机进程内嵌一份 Prefrontal（前额叶）运行时，让 agent 能力在**没有远端服务器**时也能用。

```
Flutter → MethodChannel(com.ibloc.shadow/prefrontal_runtime)
        → PrefrontalRuntimeService (Kotlin)
        → JNI (Java_com_ibloc_shadow_PrefrontalRuntime_*)
        → libprefrontal_core_lib.so (Rust, 40MB/ABI)
        → axum mini HTTP server (127.0.0.1:<port>)
```

- **Dart 侧**：`lib/services/prefrontal/prefrontal_mobile_service.dart`（MethodChannel + HTTP 客户端）、`prefrontal_mobile_provider.dart`（Riverpod 状态）、`prefrontal_mobile_cluster_page.dart`（管理页）
- **入口**：路由 `/settings/prefrontal`，从「设置 → 嵌入式 Prefrontal」进
- **Kotlin 侧**：`android/app/src/main/kotlin/com/ibloc/shadow/PrefrontalRuntime.kt`（6 个 `external fun`）+ `PrefrontalRuntimeService.kt`
- **`.so` 不入库**：兄弟仓 [prefrontal](https://github.com/iBLOC/prefrontal) 的构建产物，按需用它的 `scripts/build-android.sh` 编，拷到 `android/app/src/main/jniLibs/<abi>/`。名字必须是 `prefrontal_core_lib`（Kotlin 侧 `System.loadLibrary("prefrontal_core_lib")`）
- **`.so` 缺失不崩**：`PrefrontalRuntime` 的 `init{}` 不重抛 `loadLibrary` 失败，各 native 调用点自己 catch `UnsatisfiedLinkError`，错误落进 `MainActivity` 已有的 `SO_NOT_LOADED` 分支

**这条支线在整体架构里的位置（重要）**：移动端**主链**是端脑 telencephalon（`:60080`，见 `engine_models_provider.dart`「Telencephalon is the single platform entry point」），prefrontal 在 HTTP 侧只是 fallback（`:8082`）。嵌入支线跑的却是**前额叶**——即 telencephalon 管的 lobe 之一，不是「大脑」本身。桌面端已经升级为嵌**大脑**（`encephalon::Embedded::boot()`）。**2026-10-28 起，移动端也改成嵌大脑了**（见下一节），这条前额叶支线降级为**遗留**路径。

## EMBEDDED ENCEPHALON RUNTIME (NDK `.so`, 2026-10-28)

手机进程内嵌的**大脑**（与桌面端同一个 `encephalon`），让 agent 能力在**没有远端服务器**时也能用。

```
Flutter → MethodChannel(com.ibloc.shadow/encephalon_runtime)
        → MainActivity (Kotlin)
        → JNI (Java_com_ibloc_shadow_EncephalonRuntime_*)
        → libencephalon.so (Rust cdylib)
        ├─ neuron 面 (127.0.0.1:<port>)     推理 / OpenAI 兼容
        └─ 端脑面 (127.0.0.1:<agentPort>)  telencephalon cortex_router
```

- **Rust 侧**：`encephalon` 仓的 `mobile` feature（`src/mobile/{mod.rs,jni.rs}`）。`MobileStack` 里同时跑 **neuron**（推理）与**端脑面**（`telencephalon::boot::build_app_state_with(..)` + `cortex_router`，`axum::serve` 绑 `127.0.0.1:0` 取随机端口）。端脑面起不来**不影响**大脑本体，只是 agent 面暂时要退回外部端脑
- **Kotlin 侧**：`android/app/src/main/kotlin/com/ibloc/shadow/EncephalonRuntime.kt`（6 个 `external fun`）+ `MainActivity.setupEncephalonRuntimeChannel()`
- **Dart 侧**：`lib/services/encephalon/encephalon_mobile_service.dart`（MethodChannel 封装）+ `encephalon_mobile_provider.dart`（Riverpod 状态）+ `encephalon_mobile_page.dart`（管理页）
- **入口**：路由 `/settings/encephalon`，从「设置 → 嵌入式大脑」进
- **`.so` 不入库**：兄弟仓 [encephalon](https://github.com/iBLOC/encephalon) 的构建产物，用它的 `scripts/build-android.ps1` 编（`-Target` 切 ABI），拷到 `android/app/src/main/jniLibs/<abi>/`。名字必须是 `encephalon`
- **`.so` 缺失不崩**：`EncephalonRuntime` 的 `init{}` 不重抛 `loadLibrary` 失败，各 native 调用点自己 catch `UnsatisfiedLinkError`，错误落进 `MainActivity` 已有的 `SO_NOT_LOADED` 分支
- **`dataDir` 必须显式给**：Android 没有 `$HOME`、进程 CWD 是 `/`（不可写），端脑的 flow（工作流）存储要写在 App 私有目录里。`start` 的 `dataDir` 参数优先，缺省回落 `filesDir?.absolutePath`
- **默认启动，不需要开关**（2026-10-30 改）：App 一起来 `EncephalonMobileNotifier._init()` 就把大脑拉起来（已在跑就接管），用户**不必**去 `/settings/encephalon` 点「启动大脑」。管理页上那个按钮**只在没在跑时出现**（失败/手动停掉之后的恢复入口），跑着时只有「停止大脑」。详见本文顶部 ㉒ 条
- **端脑 client 有「等大脑就绪」的门**：`TelencephalonClient.readinessGate` 由 `EncephalonMobileNotifier` 挂上，**门挂在 `_u()`（读 `_baseUrl` 的唯一收口）上** ⇒ 大脑起来之前发出的请求会**等**，而不是打到一个没人监听的端口上

**移动端不编本地海马体**：记忆走零信任网络内其它设备上的 hippocampus 服务 ⇒ `telencephalon` 把 `hippocampus-server` 改 optional，**Lance 退出移动端依赖图**（实测 mobile profile 构建日志里没有 `lance` crate）。代价：移动端**没有本地长期记忆**，会话只留在内存里。

**端脑面只说端脑方言**：嵌入式端脑面 = telencephalon 的 `cortex_router`，它**一条前额叶路径都没有**。所以 `PrefrontalClient`（`/api/sessions`、`/api/agents`、`/api/soul/*` …）**不能**指过去 —— 指了只会把「连接被拒」换成「404」。只有 `TelencephalonClient` 指过去，且目前只用得上 `/shadow/v1/*` 与 `/.well-known/agent.json` 两条线（对话 + 会话列表）。完整的方言对照见根 `AGENTS.md` §「移动端 agent 面：两套「方言」与嵌入式大脑」。

**验证手段**（2026-10-30 更新）：宿主 JVM 直测 `encephalon` 仓 `scripts/jni-host-test/`（**21/21 全绿**，含端脑面端口、`/.well-known/agent.json` 200、`/shadow/v1/conversations` 有响应、flow 目录落在给定 `dataDir` 下）+ Flutter 单测 **261/261 全绿**（2026-10-30 复查）+ 交叉编译 `.so` + APK 打包验收。**真机**（小米 MIX 4 / 2106118C / Android 13 / arm64-v8a）：端脑面**已经跑起来并验通**（`/.well-known/agent.json` 200、`/shadow/v1/agents` 200 且四个 native 叶区全 `healthy`、neuron 面 `/health` healthy + `/v1/models` 24 个、从 App UI 发一条消息拿到上游的 `MOCK-OK`）—— 见本文顶部 ⑲ / ⑳ / ㉒ 条与下节「真机调试清单」。

### 真机调试清单（2026-10-29）

```powershell
$adb='C:\Users\87462\AppData\Local\Android\Sdk\platform-tools\adb.exe'
& $adb devices -l                       # USB 断了就是空；Windows 侧看不到 MTP/ADB 接口就是真没插
& $adb mdns services                    # 局域网里的无线调试设备（Android 11+ 走 mDNS）
& $adb install -r -g -d '<apk>'         # MIUI 可能拦：INSTALL_FAILED_USER_RESTRICTED
& $adb shell am start -n com.ibloc.shadow/.MainActivity
& $adb exec-out screencap -p > "$env:TEMP\shot.png"
& $adb logcat -d -v brief | Select-String 'flutter|Dart'
```

- **MIUI 安装拦截**：安全中心关掉「安装监控」之后 `adb install` 才能过。`settings`/`appops`/`pm install`/`file://` 唤起安装器/`adb root`（生产版不允许）全都无效。
- **无线调试**：`adb mdns services` 里会列出 `adb-<model>/<serial> _adb._tcp <ip>:<port>`。⚠️ **同网段可能混着别人的设备** —— 2026-10-29 扫到 `192.168.31.235:5555` 是一台 `mi_lx04`（armeabi-v7a / SDK 27 / 800×480），**不是**目标机，连上后确认 `ro.product.model` / `ro.build.version.sdk` / `wm size` 再操作，别往陌生设备上装 APK。
- **关掉 Impeller 做 A/B（不用重打 APK）**：`FlutterShellArgs.fromIntent` 会读 intent extra `enable-impeller`（`engine/.../FlutterShellArgs.java:57,145-151`），Flutter 3.41.4 上实测 `--enable-impeller=false` 仍能落到 Skia 分支（`flutter_main.cc:127` 的 `warn_on_impeller_opt_out` + `SelectedRenderingAPI` 的 `kSkiaOpenGLES`）：
  - ✅ **2026-10-30 在 Flutter 3.47.8 上重新实测过，这条路径仍然有效**：`flutter_main.cc:268-303` 的 `SelectedRenderingAPI` 在 `enable_impeller == false` 时跳过 Impeller 分支、落到 `kSkiaOpenGLES` ⇒ `settings.enable_impeller = false`；日志里出现 `shell.cc:527` 的 `[Action Required]: Impeller opt-out deprecated` 警告 + `AdrenoGLES-0`（GLES 路径）就是「切到 Skia 了」的证据（opt-out 虽已 deprecated，但**仍被接受**）。

  ```powershell
  & $adb shell am force-stop com.ibloc.shadow
  & $adb shell am start -n com.ibloc.shadow/.MainActivity --ez enable-impeller false
  ```

**设置页在真机上正文全白（2026-10-30 已结案 —— 根因是旧 APK，不是渲染器）**：症状是 AppBar 与底部导航正常，正文整片不绘制。**当时的推理链是错的**，实测结论如下：
- ❌ **不是 Impeller / BackdropFilter**：上面那个 `--ez enable-impeller false` 的 A/B **实测无效** —— 确实切到了 Skia（`AdrenoGLES-0`），而设置页**照样全白**。
- ❌ **不是持久化状态**：`pm clear com.ibloc.shadow` 清空应用数据后**照样全白**。
- ❌ **不是 build 异常 / ErrorWidget 吞掉**：logcat 里 `E/flutter` **一条异常都没有**（只有 MIUI 系统噪音）。
- ❌ **不是「玻璃 alpha 太低」**：像素级测量显示正文区域 maxChannel 只有 **19/255** —— 卡片其实**画出来了**，只是暗色玻璃 `surfaceDarkGlass = 0x14FFFFFF`（alpha 8%）在纯黑底上不可见；任务看板页同样卡片可见是因为它用的是**另一套更亮的** `AppColors.darkSurfaceGlass` / `darkBorder`（**两条路径用了不同的玻璃色**）。但切浅色模式（浅色玻璃 alpha 70%，本该很显眼）后**正文依然空白** ⇒ 推翻这个假设。
- ✅ **真根因：设备上的 APK 太旧**。那个包是 **10-29 08:34** 装的，而修复它的提交 `8f293a8`（引入 ShadcnUI + 升 Flutter 3.47.8，给 `GlassCard` 的 child 套一层 `Material(type: transparency)`）是 **12:28** —— 旧包在它之前。旧版设置页正文用 `GlassCard` 包 **`ListTile`**，而 Flutter 3.47.8 在 `ListTile` 被有背景色的祖先包裹时，debug 模式会 `FlutterError.reportError`（`list_tile.dart:1147` `_debugCheckBackgroundIsHidden`）⇒ **body 子树构建中断 ⇒ 整片正文不画**；AppBar / 底栏不在那个子树里，所以照常显示。**重装新包后设置页完全正常。**
- ⚠️ **教训**：当时用「widget 测试里渲染出 52 段文本」来排除代码 bug 是**无效的** —— 测试跑的是 `895e668` 重构**之后**的代码，不是旧包里的代码。**真机症状与源码不一致时，先确认真机上跑的是哪份代码。**


**Android 交叉编译探针**：`scripts/android-cross-probe/`（2026-10-28 加）。验任意 Rust crate 能否编到 `aarch64-linux-android` —— 判断「改嵌大脑」可行性的唯一硬判据。实测结论：**wasmtime 不是 blocker，synapse 能编过；第一个真 blocker 是 `rquickjs-sys` 没有 Android 绑定**（`zen-engine` → `rquickjs` → `rquickjs-sys`，只支持 14 个桌面/musl/wasm32 平台）。用法与三条修法见该目录的 `README.md`。

## MULTIMODAL INPUT

`lib/multimodal/` wraps three input channels:
- `audio_input_handler.dart` — mic capture via `record` package; PCM chunks → `pcm_audio_recorder.dart`
- `image_input_handler.dart` — `image_picker` + `camera`; feeds `video_frame_collector.dart` for streaming
- `file_input_handler.dart` — `file_picker`; uploads to telencephalon via `TelencephalonClient`

`multimodal_input_manager.dart` multiplexes these into a single inbound stream consumed by `main_agent`.

## ANDROID NATIVE (MNN + LiteRT)

`android/app/src/main/cpp/mnn_bridge.cpp` is the JNI bridge between Dart (`lib/mnn_engine.dart`) and the MNN C++ runtime. MNN is the on-device inference engine for older / lower-end devices. LiteRT (via `lib/litert_engine.dart` + `lib/litert_model.dart`) is the newer path for devices that ship Google's LiteRT-LM. The Kotlin side wraps both into a single `OpenAIServer.kt` that exposes an OpenAI-compatible `/v1/*` surface on `:8085`.

**LiteRT init timeout + model-dir diagnosis** (recent fix): previously hanging forever; now 10s timeout, calls `diagnoseModelDirectory` first, shows download dialog immediately if model missing.

## i18n

Two ARB files (auto-generated Dart bindings live in `lib/generated/l10n/`):
- `lib/l10n/app_en.arb`
- `lib/l10n/app_zh.arb`

CI runs `flutter_localization_linter` — adding a UI string to only one locale fails the build.

## CONVENTIONS

- Flutter 3.47+ with Dart SDK `^3.13.0`（CI 固定 3.47.8 / Dart 3.13.7）
- Riverpod 2.5 for state management (`flutter_riverpod`)
- GoRouter 14.8 for declarative routing (`lib/router/app_router.dart`)
- speech_to_text 7.0 for ASR fallback
- sqflite 2.3 (mobile) + sqflite_common_ffi 2.3 (desktop tests) for local persistence
- genui 0.7 + genui_a2ui 0.7 for Agent2UI
- flutter_ai_toolkit 1.0 for chat UI primitives
- freezed_annotation + json_annotation for DTOs
- **Never** call `/v1/chat/completions` directly from a screen — always go through a provider or service
- i18n strings MUST appear in both `app_en.arb` and `app_zh.arb`
- Kotlin 1.9, NDK 27.2, Gradle 8.14, Java 17
- mTLS for secure communication (via `group_service.dart`)
- Network security config permits cleartext to `localhost` / `127.0.0.1` / `10.0.2.2` / `*.local` (dev only)

## BUILD COMMANDS

```bash
flutter pub get
flutter run                                # debug on attached device
flutter test                               # unit tests
flutter test integration_test              # integration tests
dart analyze                               # linter; 100 info-level issues as of 2026-07-19 (0 errors)
flutter build apk --release                # Android APK
flutter build appbundle --release          # Android App Bundle
flutter build ios --release --no-codesign  # iOS (unsigned; signing handled by Xcode)
flutter build web --release                # Web SPA (experimental — not the primary target)

# Trigger phone-as-Engine mode (after UI button or automatic on Engine-Only config)
adb shell am start -n com.ibloc.shadow/.MainActivity

# Discover the phone from a Linux machine
avahi-browse -rt _shadow._tcp

# Tail mobile logs
adb logcat | grep shadow
```

## BUILD TARGETS

| Target | Output | Notes |
|---|---|---|
| Android (APK / App Bundle) | `build/app/outputs/{apk,flutter-apk,bundle}/*` | Primary target; on-device MNN / LiteRT for offline inference |
| iOS | `build/ios/iphoneos/Runner.app` | Secondary target; requires Apple Developer account |
| Web (experimental) | `build/web/` | No native inference; routes everything through telencephalon or prefrontal HTTP |

## CODE HEALTH

```
$ dart analyze
100 issues found.   # 0 errors, 100 info-level (deprecation warnings + avoid_print + use_null_aware_elements)
```

No errors, no warnings — only style-level info issues (deprecated `value` / `activeColor` form-field props, stray `print()` calls in services, null-check patterns that could use `?.` shorthand).

## STATE STATUS (2026-07-19)

**Completed** ✅ (recent additions marked 🆕):
- 🆕 **Telencephalon client** (`lib/services/cortex/cortex_client.dart`, ~814 lines after 2026-09-27 migration) — wired for agents / conversations / flows / drafts / agent mirror / import-session-as-conversation; all of Sprint 1+2 surface
- 🆕 **FlowsScreen** (`lib/screens/flows_screen.dart` + commit `55ffc95`) — browse / run telencephalon flows from the phone
- 🆕 **continue-on-desktop via telencephalon only** (`dacbe83`) — chat sessions hand off to a desktop telencephalon without falling back to prefrontal
- 🆕 **telencephalon-embedded neuron+hippocampus paths** (`05aa697`) — all hardcoded URLs updated to the telencephalon-embedded model (`:60080/hippocampus/api/...`)
- **VAD-driven barge-in** via `audio_ws_service.dart` + `wake_word_service.dart`（Companion Mode 的 WebRTC 那部分已于 2026-10-28 作为死代码删除，见 §COMPANION MODE）
- **Mobile sub-agent** (`lib/agents/mobile_action_agent/`) — AccessibilityController-driven UI automation as a telencephalon-flow tool
- **A2A message types + client** (`lib/agents/a2a/`) — outbound A2A delegation to other telencephalon / prefrontal instances
- **Main agent** (`lib/agents/main_agent/`) — system prompt + tool registry; runs locally in Standalone mode
- **Multimodal input** — audio / image / file via `lib/multimodal/`, including `video_frame_collector.dart` for camera-streaming
- **Wake-word detection** — `wake_word_service.dart` for "Hey Shadow"-style invocation
- **Session transfer** — `session_transfer_service.dart` + `SessionExport` for cross-device handoff
- **Soul agent persistence** — `soul_service.dart` for user-persona state
- **Model downloader** — delegates to neuron's `/v1/models/pull` via `model_download_service.dart` + `model_download_provider.dart`
- **mDNS discovery** — `mdns_discovery.dart` for `_shadow._tcp` browsing + `group_service.dart` for mTLS trust
- **i18n** — `app_en.arb` + `app_zh.arb` with `flutter_localization_linter` enforcement
- **Database layer** — `lib/services/database/` with repositories for agents / MCP servers / skills / models
- **Agent review** — `agent_review_service.dart` for approve / reject draft flows
- **Voice conversation screen** — `lib/screens/voice_conversation_screen.dart` for hands-free mode
- **Phone-as-Engine mode** (`OpenAIServer.kt` on port 8085, SSE streaming, bridged to `LitertEngine` via `EngineProvider`, mDNS `_shadow._tcp` advertisement with capabilities TXT records)
- **Engine Platform Channel** `com.ibloc.shadow/engine` (startServer/stopServer/isServerRunning/getServerUrl/getApiKey/setApiKey/setAuthEnabled/getServiceName)
- **Network security config** permitting cleartext to `localhost` / `127.0.0.1` / `10.0.2.2` / `*.local` (dev only)
- **LiteRT init timeout + model-dir diagnosis** — was hanging forever; now 10s timeout, calls `diagnoseModelDirectory` first, shows download dialog immediately if model missing

**In Progress** 🔄:
- Offline-first chat — main_agent can run locally for trivial replies but anything non-trivial still requires telencephalon or neuron HTTP
- **v2.5 — shadow-esp32 BLE provisioning flow** is wired (Kotlin + Dart) but the live-streaming screen doesn't yet auto-discover a shadow-esp32 over BLE; v2.6 adds an `onAttach` hook that opens the provisioning screen when the user plugs the device in
- **v2.5 — USB Audio routing** is wired at the platform-channel level (UsbAudioRouter.kt + usb_audio_routing_service.dart); the actual `setMode(MODE_NORMAL) / isSpeakerphoneOn = false / preferredDevice` calls land in v2.6 once the live-streaming screen flips them on user-tap
- **Provisioning — security** — SSID/PSK travel over BLE cleartext in v2.5; v2.6 enables BLE bonding + MITM protection to encrypt the GATT writes

**Planned** 📋:
- Companion Mode (WebRTC) 重做 —— 原实现已作为死代码删除（见 §COMPANION MODE）；重做时直接用 `TelencephalonClient.webrtcSignalingUrl()`
- Hot reload of telencephalon flows into the FlowsScreen without app restart (currently requires re-fetch via `flow_provider`)
- Voice wake word integration hardening
- ESP32 / hardware device pairing (per `2026-06-04-shadow-architecture-redesign.md` Phase 6)
- Voice cloning on mobile (per platform-wide v0.9+ backlog)
- A2UI streaming on mobile (genui_a2ui 0.7 already declared; widgets not yet wired)
- Battery-aware inference scheduling (throttle MNN / LiteRT when device is unplugged or below 20% battery)
- ~~Prefrontal mobile (as library, not server) via Tauri embedding or FFI~~ — **DONE as A2A** (`c5812a3`); FFI scaffolding removed

## RELATED PROJECTS

| Project | Path | Role |
|---|---|---|
| Shadow umbrella | `https://github.com/iBLOC/shadow` | Container for mobile + desktop |
| Shadow-Desktop | `https://github.com/iBLOC/shadow/shadow-desktop` | Sibling Layer 4 client (Tauri + React) |
| Prefrontal | `https://github.com/iBLOC/prefrontal` | Layer 3 (Agent) — used as fallback when telencephalon unavailable |
| **Telencephalon** | `https://github.com/iBLOC/telencephalon` | **Layer 3.5 (Orchestrator) — primary HTTP target** |
| Hippocampus | `https://github.com/iBLOC/hippocampus` | Layer 0 (Memory) — reached via telencephalon on `:60080/hippocampus` |
| neuron | [github.com/ibloc/neuron](https://github.com/ibloc/neuron) | Layer 2 (Engine) — on-device MNN / LiteRT, plus remote `:8085` HTTP |
| Resonance | `https://github.com/iBLOC/resonance` | Layer 5 (Cross-user orchestration) — discovered via mDNS but mobile does not currently push tasks |

## ENVIRONMENT VARIABLES (mobile build-time)

```bash
# Optional — only needed when targeting a specific telencephalon / prefrontal in dev
export TELE_ULR="http://localhost:60080"        # default in production: discovered via mDNS (port unified 2026-09, was :8443)
export PREFRONTAL_HOST="http://localhost:8082"     # fallback only — `dacbe83` removed automatic fallback

# Model download defaults
export NEURON_DEFAULT_SOURCE="modelscope"           # mobile's `model_download_provider.dart` defaults to ModelScope
export HF_TOKEN="..."                                # for gated HuggingFace repos
export MODELSCOPE_TOKEN="..."                       # for gated ModelScope repos
```

## E2E COVERAGE (audit 2026-09-25)

Per [`2026-09-25-e2e-coverage-assessment.md`](../../docs/superpowers/architecture/2026-09-25-e2e-coverage-assessment.md), mobile's e2e coverage is held back by:

- **Silent skip pattern** in `integration_test/*.dart`: `api_flow_test.dart`, `memory_flow_test.dart`, `group_flow_test.dart`, `model_share_test.dart` all start with `isPrefrontalRunning()` and `return;` on false. **No CI matrix boots prefrontal** before these.
- **Stub app context** in `app_test.dart`, `conversation_flow_test.dart`, `task_flow_test.dart`: `app.main()` runs against a stub context with **no live Telencephalon client**.
- **No real-telencephalon e2e**: `cortex_client_test.dart` uses `http_testing.MockClient` only — no real `:60080` exercise.
- **Zero BLE / USB / InCallService e2e**: `com.ibloc.shadow/{ble_provision,usb_audio,call_state}` channels all uncovered.
- **Zero Live Stream / Customer Service e2e**: `/livestream` and `/customer-service` modes uncovered.

Sibling desktop has the same shape — see E2E assessment §3.6-3.9 for the desktop-side gaps.

## Commits (mobile-only, last 10)

| Hash | Description |
|------|-------------|
| (v2.5) | feat(mobile): BLE provisioning of shadow-esp32 + USB Audio routing for digital-human livestream PoC; complements shadow-esp32 v2.4/v2.5; `BleProvisioningService.kt` + `UsbAudioRouter.kt`; Dart `ble_provisioning_service.dart` + `usb_audio_routing_service.dart` + `provisioning_screen.dart`; new channels `com.ibloc.shadow/ble_provision` and `com.ibloc.shadow/usb_audio` |
| 05aa697 | feat(shadow-mobile): update all paths to cortex-embedded neuron+hippocampus |
| dacbe83 | feat(mobile): continue-on-desktop uses cortex only (no prefrontal fallback) |
| 55ffc95 | feat(mobile): add FlowsScreen for browsing/running cortex flows |
| (older — see git log) | Cortex client wiring (Sprint 1+2); main_agent + mobile_action_agent split; WebRTC companion mode; wake-word service; multimodal input; session transfer |

> The mobile project shares its git repository with shadow-desktop (`https://github.com/iBLOC/shadow/.git`), so commits are interleaved. Filter with `git log --author ...` or by `feat(mobile)` / `feat(shadow-mobile)` prefix.