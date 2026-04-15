# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-14
**Updated:** 2026-03-22
**Project:** shadow-mobile (Android Agent App)

## OVERVIEW

Shadow 移动端应用，基于 Flutter + MNN。作为用户分身的移动界面，通过 Platform Channel 与 Prefrontal 通信，支持 flutter_genui Agent2UI 和 MNN 本地推理。

## 架构定位

```
Shadow-Mobile
    │
    ├── UI Shell (Flutter + Riverpod)
    │         │
    │         └── flutter_genui (Agent2UI)
    │
    ├── Platform Channel
    │         │
    │         ├── Kotlin (MainActivity)
    │         │         │
    │         │         └── Prefrontal HTTP Client
    │         │
    │         └── MNN Engine (本地推理)
    │
    └── Android Accessibility Service (自动化)
```

## STRUCTURE

```
shadow-mobile/
├── lib/                    # Flutter UI (Dart)
│   ├── main.dart           # 应用入口 (ShadowApp)
│   ├── router/             # GoRouter 路由配置 (10 routes)
│   ├── screens/            # 页面
│   │   ├── chat_screen.dart           # 聊天主页
│   │   ├── task_board_screen.dart     # 任务看板
│   │   ├── providers_screen.dart      # 模型提供商管理
│   │   ├── model_management_screen.dart # 模型下载管理
│   │   ├── mcp_screen.dart           # MCP服务管理
│   │   ├── skills_screen.dart        # Skill管理
│   │   ├── conversation_screen.dart  # 会话管理
│   │   ├── memory_screen.dart        # 记忆管理
│   │   ├── agents_screen.dart        # Agent管理
│   │   └── settings_screen.dart     # 设置页面
│   ├── providers/          # Riverpod 状态管理
│   │   ├── chat_provider.dart        # 聊天状态 + MNN集成
│   │   ├── model_download_provider.dart
│   │   └── service_provider.dart     # 服务健康检查
│   ├── services/           # 服务层
│   │   ├── prefrontal_client.dart    # Prefrontal API客户端
│   │   ├── model_download_service.dart
│   │   ├── accessibility_controller.dart
│   │   └── mdns_discovery.dart
│   └── mnn_engine.dart     # MNN Platform Channel封装
├── android/                # Android Native
│   └── app/src/main/
│       ├── kotlin/com/ibloc/shadow/
│       │   ├── MainActivity.kt           # Platform Channel
│       │   ├── PrefrontalAccessibilityService.kt
│       │   └── mnn/                     # MNN 封装
│       └── cpp/            # C++ JNI桥接
└── docs/                   # 文档
```

## 路由配置 (AppRoutes)

```dart
class AppRoutes {
  static const String chat = '/';
  static const String taskBoard = '/tasks';
  static const String conversation = '/conversation';
  static const String agents = '/agents';
  static const String models = '/models';
  static const String providers = '/providers';
  static const String mcp = '/mcp';
  static const String skills = '/skills';
  static const String memory = '/memory';
  static const String settings = '/settings';
}
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Prefrontal Client | `lib/services/prefrontal_client.dart` | API通信 |
| Providers管理 | `lib/screens/providers_screen.dart` | ProviderType枚举 |
| Skills管理 | `lib/screens/skills_screen.dart` | SkillsNotifier |
| MCP管理 | `lib/screens/mcp_screen.dart` | MCPNotifier |
| 会话管理 | `lib/screens/conversation_screen.dart` | ConversationsNotifier |
| 记忆管理 | `lib/screens/memory_screen.dart` | MemoryNotifier |
| Agent管理 | `lib/screens/agents_screen.dart` | AgentsNotifier |
| 任务看板 | `lib/screens/task_board_screen.dart` | TasksNotifier |
| UI/Chat | `lib/screens/chat_screen.dart` | ChatScreen类 |
| 路由配置 | `lib/router/app_router.dart` | GoRouter 配置 |
| MNN集成 | `lib/mnn_engine.dart` | Platform Channel |
| 模型管理 | `lib/model_manager.dart` | 本地模型列表 |

## CONVENTIONS

- **Flutter**: 3.11+ SDK
- **Package**: `com.ibloc.shadow` (已从 `com.ibloc.prefrontal` 重命名)
- **Gradle**: Kotlin DSL (.gradle.kts) 而非Groovy
- **Build**: Gradle 8.14, Java 17, NDK 27.2
- **ABI**: 仅arm64-v8a支持
- **状态管理**: Riverpod
- **路由**: GoRouter
- **Agent2UI**: flutter_genui

## API ENDPOINTS

| Service | URL | Purpose |
|---------|-----|---------|
| Resonance | `http://localhost:8080` | 任务派发、模型评分 |
| Prefrontal | `http://localhost:8082` | 任务执行、Agent 管理 |
| Hippocampus | `http://localhost:8081` | 记忆存储和搜索 |

## 与 PREFRONTAL 的连接

### 已实现 ✅
- [x] **PrefrontalClient** - `lib/services/prefrontal_client.dart`
  - 支持: providers, skills, agents, tasks, memory, mcp, conversations
- [x] ProviderRepository - ProvidersNotifier
- [x] SkillRepository - SkillsNotifier
- [x] MCPRepository - MCPNotifier
- [x] Service health check (service_provider.dart)
- [x] Model download service (model_download_service.dart)
- [x] mDNS discovery (mdns_discovery.dart)

## 数据状态 ✅

| 页面 | 数据源 | 状态 |
|------|--------|------|
| chat_screen | MNN本地 | ✅ 正常 |
| providers_screen | PrefrontalClient | ✅ 已连接 |
| model_management_screen | HTTP | ⚠️ 硬编码IP |
| task_board_screen | PrefrontalClient | ✅ 已连接 |
| mcp_screen | PrefrontalClient | ✅ 已连接 |
| skills_screen | PrefrontalClient | ✅ 已连接 |
| conversation_screen | PrefrontalClient | ✅ 已连接 |
| memory_screen | PrefrontalClient | ✅ 已连接 |
| agents_screen | PrefrontalClient | ✅ 已连接 |

### Provider类型 ✅

```dart
enum ProviderType {
  openai('OpenAI', 'https://api.openai.com/v1', 'gpt-4o'),
  anthropic('Anthropic', 'https://api.anthropic.com', 'claude-sonnet-4-20250514'),
  ollama('Ollama', 'http://localhost:11434', 'llama3'),
  groq('Groq', 'https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile'),
  deepseek('DeepSeek', 'https://api.deepseek.com', 'deepseek-chat'),
  moonshot('Moonshot', 'https://api.moonshot.cn/v1', 'moonshot-v1-8k'),
  zhipuai('智谱AI', 'https://open.bigmodel.cn/api/paas/v4', 'glm-4'),
  local('本地模型', 'http://localhost:8080', 'local-model');
}
```

## COMMANDS

```bash
# 运行
flutter run

# 分析
flutter analyze

# 构建APK
flutter build apk --debug
```

## KNOWN ISSUES

1. **~~Model下载IP~~**: ✅ 已修复 - 使用 `AppConfigService` 可配置模型下载服务器地址
2. **Prefrontal API**: 需要backend运行才能获取真实数据，否则使用mock数据

## NOTES

- Android 专属 (iOS/Linux 等目录为 Flutter 标准空壳)
- 预编译 MNN 库在 `jniLibs/arm64-v8a/`
- 无障碍服务需用户手动在系统设置中开启
- flutter_genui 提供 Agent2UI 能力（对话式 + 自动化）
- 所有数据操作通过 HTTP API 与 Prefrontal/Hippocampus 通信
- API不可用时自动回退到mock数据
