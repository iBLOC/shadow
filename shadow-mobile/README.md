# shadow-mobile

Shadow 的**移动端**：Flutter 3.47 + shadcn_ui 的 Android 应用，App 进程里嵌着 `libencephalon.so` —— 大脑、端脑、叶区和唯一的 neuron 都在本机。

移动端与桌面端是同一个 agent 的两个终端 —— 通信链路完全一致：**大脑 → 端脑 → 叶区**。

## 技术栈

| 领域 | 选型 |
|---|---|
| UI | Flutter 3.47.8 / Dart SDK `^3.13.0` |
| 组件 | shadcn_ui 0.57.3（Flutter ShadcnUI，MIT）—— 与桌面端真 shadcn 同源，共用仓根 `design-tokens.json` |
| 状态 / 路由 | flutter_riverpod 2.5.1 / go_router 14.8.1 |
| 数据 | sqflite + path_provider |
| Agent → UI | genui / genui_a2ui 0.7.0（Agent2UI） |
| 多模态 | record / image_picker / camera / file_picker / vad / speech_to_text |
| 设备 | flutter_blue_plus（BLE 配网）/ usb_serial（USB 音频）/ flutter_ai_toolkit / connectivity_plus / web_socket_channel |

## 运行

```bash
flutter pub get
flutter run                     # 真机 / 模拟器
flutter analyze --no-fatal-infos --no-fatal-warnings
flutter test
```

环境要求：Flutter ≥ 3.47.0（Dart ≥ 3.13.0）、JDK 17、Android SDK（compileSdk 36 / minSdk 31）、NDK 30.0.14904198、CMake 3.22.1。

## 目录

```text
shadow-mobile/
├── lib/
│   ├── main.dart              应用入口（挂 ShadTheme）
│   ├── screens/               页面（对话 / 任务 / 能力 / 我 …）
│   ├── widgets/               组件（chat / settings …）
│   ├── providers/             Riverpod provider（chat / flow / telencephalon / ai …）
│   ├── services/
│   │   ├── encephalon/        嵌入式大脑（Dart 侧 MethodChannel 客户端 + provider）
│   │   ├── telencephalon/     端脑方言客户端 —— 唯一的对话入口
│   │   ├── prefrontal/        旧「前额叶方言」客户端（见「已知边界」）
│   │   ├── database/           sqflite 仓储
│   │   └── genui/              Agent2UI 渲染
│   ├── agents/                agent provider（工具注册表、人设）
│   ├── theme/                 app_tokens.g.dart / shad_scheme.g.dart（生成物）
│   ├── navigation/nav.g.dart  ← 生成物
│   ├── l10n/                  en / zh ARB
│   └── models/ providers/ai/  数据模型与本地 LLM provider 封装
├── android/app/src/main/
│   ├── kotlin/com/ibloc/shadow/
│   │   ├── MainActivity.kt
│   │   ├── EncephalonRuntime.kt   嵌入式大脑的 JNI 桥
│   │   ├── PrefrontalRuntime.kt   旧嵌入式前额叶（遗留）
│   │   └── mnn/ litert/ tts/ …    本地推理引擎与设备能力
│   └── jniLibs/<abi>/         libencephalon.so 等（不入库，需自行构建）
└── test/                      单元 + widget 测试
```

## 通信

对话**只**走端脑方言（`lib/services/telencephalon/telencephalon_client.dart`）：

| 场景 | 端点 |
|---|---|
| 创建会话（带人设） | `POST /shadow/v1/conversations` |
| 流式消息 | `POST /shadow/v1/conversations/{id}/messages:stream` |
| 会话列表 / 详情 | `/shadow/v1/conversations*` |
| 工作流 | `/api/flows` |
| agent 搜索 | `/api/telencephalon/agents/search` |

人设走**会话创建**：`customPromptProvider`（提示词设置页存的那份）→ `createConversation(systemPrompt:)`。传的是**函数**而不是值，所以改人设不必重建 `ChatNotifier`（那会把当前对话冲掉）。

### 嵌入式大脑怎么起来

```text
Dart  EncephalonMobileService.start()
   │  MethodChannel 'com.ibloc.shadow/encephalon_runtime'
   ▼
Kotlin EncephalonRuntime
   │  JNI
   ▼
libencephalon.so（Rust）
   → 大脑（thalamus + ACP 总线；neuron router-only，OpenAI 面挂在脑面上）
   → 脑面（端脑方言）  127.0.0.1:0（随机端口）
```

`start()` 返回 `{port, agentPort}`（两个值相同——neuron 改成 router-only 后只有**一个**端口）；Dart 侧随即把 `TelencephalonClient` 指向 `http://127.0.0.1:$agentPort`。端脑面没起来时，client **保持**指向外部端脑 `:60080`（指向一个没人监听的端口比指向外部端脑更糟）。宿主显式调 `setZitiClient(...)` 后进入**零信任客户端模式**：本地不起大脑，那个端口上是零信任代理，一切落到远端大脑。

## 后台运行

「客户端需要支持后台运行」（v2.9）：Android **前台服务**（`flutter_foreground_task ^11`）保活 App 进程 —— 端脑（`libencephalon.so`）、MNN 引擎（NSD 广播）、BLE、USB 音频都活在进程里，进程活着它们就都活着。

- 常驻通知「Shadow 正在后台运行」＋ 通知上的「停止」按钮；**划掉任务服务仍在**（`stopWithTask: false`，常驻语义）。
- 开关在 设置 → 运行时 → **后台常驻**（`AppConfigService.backgroundKeepAlive`，默认开）；端脑启动成功后自动拉起（`backgroundRunProvider.ensureRunningIfEnabled`）。
- targetSdk 34+ 前台服务必须带类型：manifest 的 `foregroundServiceType="dataSync"` 与 Dart `startService(serviceTypes: [ForegroundServiceTypes.dataSync])` **两处对齐**（`node ../scripts/check-mobile-background-service.mjs` 盯着这三处不许漂）。
- Android 13+ 通知权限与电池优化白名单在设置里逐项申请（MIUI 等厂商系统不进白名单，前台服务也保不住）。
- ⚠️ Android 15+ 对 **dataSync** 前台服务有每 24 小时 6 小时的运行预算，超预算系统会停服务（插件的 `allowAutoRestart` 会拉回来）。真要全天候再换 `mediaPlayback` / `connectedDevice` 类型（那两档无预算）。
- **iOS 上本功能无效** —— `ios/` 未开工（无 `UIBackgroundModes`），插件在 iOS 侧传默认选项、不起前台服务。

## 已知边界

- **`PrefrontalClient` 说的是旧方言** —— 路径是 `/api/sessions`、`/api/agents`、`/api/skills`、`/api/soul/*`、`/api/mcp/servers`、`/hippocampus/api/*`，与端脑方言**没有交集**。灵魂 / 任务 / 记忆 / 提供商 / 技能 / MCP / agent 列表这些页面仍走它，而嵌入式大脑**不提供**这些概念（记忆按设计走零信任网络上的海马体，不在移动端本地）。把 client 指向嵌入式大脑只会把「连接被拒」换成「404」，更难排查。
- **本地推理引擎（MNN / LiteRT）还在**，但**不在对话链路上** —— 对话路径只有端脑一条。
- **`libencephalon.so` 不入库** —— 它是兄弟仓 `encephalon` 的交叉编译产物（Android 侧是 cdylib，Kotlin 侧 `System.loadLibrary("encephalon")`）。构建后拷进 `android/app/src/main/jniLibs/<abi>/libencephalon.so`。缺失时 App **不会崩**：加载失败被 catch，运行时优雅降级。
- **ABI**：只出 `arm64-v8a`。
  ⚠️ **2026-11-11 订正**：此前这里写的是「`arm64-v8a` 与 `x86_64`」—— **那是错的**
  （端脑运行时**只入库存了 `arm64-v8a` 一份**）。而 x86_64 那个 ABI 在 APK 里
  **只有引擎/插件/CMake 的库、没有 `libencephalon.so`** ⇒ ⇒ **装得上、端脑面却
  整个消失** ⇒ ⇒ **失败长得像成功**。⇒ ⇒ 现在 x86_64 设备改走
  `INSTALL_FAILED_NO_MATCHING_ABIS`（**失败长得像失败**）。
  ⇒ ⇒ 要恢复它，得先把 x86_64 的端脑运行时**编出来**并补齐同目录的随包库。
- **去 Material 未完成**：`uses-material-design: true` 仍在，设置页等已迁到 shadcn 组件，其余页面还在迁移中。

## 脚本

| 命令 | 作用 |
|---|---|
| `flutter run` | 运行 |
| `flutter analyze --no-fatal-infos --no-fatal-warnings` | 静态检查 |
| `flutter test` | 单元 + widget 测试 |
| `flutter build apk --release --split-per-abi` | 按 ABI 打包 |
| `node scripts/check-legacy-residue.mjs` | 过时命名残留检查（词级 ＋ 兼容契约豁免清单 ＋ `--self-test`） |

## 约定

- **不要并发跑两个 flutter 命令**。
- Dart 源码行尾是 **CRLF**（生成器也是这么产的）。
- 设计 token 与导航是**生成物**：改 `../design-tokens.json` 或 `../agent-surface.json` 后跑 `node ../scripts/gen_tokens.mjs` / `node ../scripts/gen_nav.mjs` —— CI 会查漂移。
- shadcn 组件页面必须有 `ShadTheme` 祖先（生产 `main.dart` 已挂；测试用 `withShadTheme(...)` 装配同一套 `ShadScheme`）。
- 移动端**不许**引入本地直连推理的对话编排器 —— `node ../scripts/check-brain-chain.mjs` 会拦。

## 相关

- 平台架构：[`../ARCHITECTURE.md`](../ARCHITECTURE.md)
- 链路改造全文：[`../docs/superpowers/architecture/2026-10-29-brain-chain.md`](../docs/superpowers/architecture/2026-10-29-brain-chain.md)
- 本目录知识库：[`AGENTS.md`](AGENTS.md)
