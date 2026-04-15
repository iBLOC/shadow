# 统一日志系统设计

**项目:** Shadow Mobile  
**日期:** 2026-03-26  
**状态:** 已批准

## 1. 背景

Shadow Mobile 需要查看两个独立服务的日志：
- **Prefrontal** (Rust 后端) — API 请求、Agent 执行日志
- **MNN** (Android Native) — 模型加载、推理日志

当前问题：
- 无统一日志聚合点
- MNN 日志仅在 logcat 可见
- Prefrontal 日志仅输出到 stdout
- 无法在 App 内实时查看日志

## 2. 目标

构建一个**统一日志系统**，兼容 MNN 和 Prefrontal，支持：
- 实时日志流
- 按来源和级别过滤
- 日志导出
- 在 Settings 页面展示

## 3. 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     Shadow-Mobile (Flutter)                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  LogService (Riverpod)                   │   │
│  │                                                          │   │
│  │   EventChannel (MNN)          SSE Stream (Prefrontal)   │   │
│  │         │                            │                   │   │
│  │         └──────────┬─────────────────┘                   │   │
│  │                    ▼                                      │   │
│  │            ┌─────────────┐                               │   │
│  │            │  LogBuffer  │  (max 1000 entries, FIFO)    │   │
│  │            └──────┬──────┘                               │   │
│  │                   ▼                                       │   │
│  │            ┌─────────────┐                               │   │
│  │            │  LogPanel   │  (Settings screen)           │   │
│  │            └─────────────┘                               │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 4. 数据模型

```dart
enum LogSource { mnn, prefrontal }

enum LogLevel { debug, info, warning, error }

class LogEntry {
  final DateTime timestamp;
  final LogSource source;    // mnn 或 prefrontal
  final LogLevel level;     // debug/info/warning/error
  final String tag;         // 日志标签
  final String message;     // 日志内容
}
```

## 5. 组件设计

### 5.1 Prefrontal 日志 SSE 端点

**端点:** `GET /api/logs/stream`

**格式:** Server-Sent Events (SSE)

**数据格式:**
```
data: {"timestamp":"2026-03-26T10:30:00.000Z","level":"INFO","target":"prefrontal","message":"Agent started"}

data: {"timestamp":"2026-03-26T10:30:01.000Z","level":"WARN","target":"prefrontal","message":"Slow request"}
```

**实现位置:** `prefrontal/src/server/log_handler.rs` (新建)

### 5.2 MNN 日志 EventChannel

**Channel 名:** `com.ibloc.shadow/mnn_logs`

**方向:** Android → Flutter (单向流)

**数据格式:**
```json
{"timestamp":1708839000000,"level":"info","tag":"PrefrontalMNN","message":"MNN initialized"}
```

**实现位置:**
- Android: `MainActivity.kt` 添加 EventChannel handler
- Kotlin: `LogcatReader.kt` 读取 tag 过滤的 logcat

### 5.3 LogService (Flutter)

```dart
// lib/services/log_service.dart
final logServiceProvider = StateNotifierProvider<LogService, LogState>((ref) {
  return LogService();
});

class LogState {
  final List<LogEntry> logs;
  final LogSource? sourceFilter;   // null = ALL
  final LogLevel? levelFilter;      // null = ALL
  final bool autoScroll;
}

class LogService extends StateNotifier<LogState> {
  // 订阅 MNN EventChannel
  // 订阅 Prefrontal SSE
  // addLog(LogEntry)
  // clearLogs()
  // setSourceFilter(LogSource?)
  // setLevelFilter(LogLevel?)
  // exportLogs() -> Future<String>
}
```

### 5.4 LogPanel UI (Settings Screen)

**位置:** `settings_screen.dart` 新增 `_LogPanelSection`

**功能:**
- 日志列表 (ListView)
- 过滤器: 源 (SegmentedButton) + 级别 (PopupMenuButton)
- 自动滚动开关 (Switch)
- 导出按钮 (IconButton) → 保存到 Downloads
- 清空按钮 (IconButton)

**样式:** 使用现有的 `GlassCard` 玻璃拟态风格

## 6. 实现顺序

### Phase 1: Prefrontal 日志 SSE
1. 创建 `log_handler.rs` — SSE 端点
2. 注册路由 — `routes.rs`
3. 测试验证

### Phase 2: Flutter LogService
1. 创建 `lib/services/log_service.dart`
2. 创建 `lib/providers/log_provider.dart`
3. 实现 `PrefrontalLogStream` (SSE 客户端)

### Phase 3: MNN EventChannel
1. Android `MainActivity.kt` — 添加 EventChannel
2. 创建 `LogcatReader.kt` — 读取 logcat
3. Flutter `MnnLogStream` — 接收日志

### Phase 4: LogPanel UI
1. 创建 `_LogPanelSection` widget
2. 集成到 `settings_screen.dart`
3. 导出功能实现

## 7. 依赖变更

### Flutter (pubspec.yaml)
- 无需新增依赖 (使用已有 http package 做 SSE)

### Prefrontal (Cargo.toml)
- 无需新增依赖 (复用现有 tracing 基础设施)

## 8. 文件变更清单

### 新建文件

**Prefrontal:**
- `src/server/log_handler.rs` — 日志 SSE 端点

**Shadow-Mobile:**
- `lib/services/log_service.dart` — 日志服务
- `lib/providers/log_provider.dart` — Riverpod provider
- `lib/services/logcat/mnn_log_stream.dart` — MNN 日志流
- `lib/widgets/log_panel_section.dart` — LogPanel UI 组件

### 修改文件

**Prefrontal:**
- `src/server/routes.rs` — 注册 `/api/logs/stream`
- `src/server/mod.rs` — 导出 log_handler

**Shadow-Mobile:**
- `lib/screens/settings_screen.dart` — 添加 LogPanel
- `android/app/src/main/kotlin/.../MainActivity.kt` — EventChannel
- `android/app/src/main/kotlin/.../LogcatReader.kt` — 新建 (logcat 读取)

## 9. 注意事项

1. **日志缓冲**: 最多保留 1000 条，FIFO 淘汰旧日志
2. **性能**: 日志写入使用 isolate 避免阻塞 UI
3. **权限**: Android logcat 读取需要 READ_LOGS 权限 (debug build 默认有)
4. **SSE 重连**: App 端实现自动重连机制
