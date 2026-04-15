# 统一日志系统实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan.

**Goal:** 实现统一日志系统，兼容 MNN 和 Prefrontal，支持实时日志流、过滤、导出

**Architecture:** Flutter App 作为日志聚合中心，MNN 通过 EventChannel 从 Android logcat 读取，Prefrontal 通过 SSE 推送日志

**Tech Stack:** Flutter (Riverpod), Rust (Axum, tracing), Android (EventChannel, logcat)

---

## Chunk 1: Prefrontal 日志 SSE 端点

**Files:**
- Create: `/home/ibloc/Projects/prefrontal/src/server/log_handler.rs`
- Modify: `/home/ibloc/Projects/prefrontal/src/server/routes.rs`
- Modify: `/home/ibloc/Projects/prefrontal/src/server/mod.rs`

### Task 1: 创建 log_handler.rs

- [ ] **Step 1: 创建 log_handler.rs 文件**

```rust
// src/server/log_handler.rs
use axum::{
    response::sse::{Event, Sse},
    routing::get,
    Router,
};
use std::time::Duration;
use tokio_stream::wrappers::BroadcastStream;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt};

pub fn router() -> Router {
    Router::new().route("/api/logs/stream", get(log_stream_handler))
}

async fn log_stream_handler() -> Sse<BroadcastStream<Result<Event, std::fmt::Error>>> {
    // 创建广播通道用于日志事件
    let (tx, rx) = tokio::sync::broadcast::channel(100);
    
    // 设置 tracing subscriber 格式化层
    let fmt_layer = fmt::layer().json();
    let (non_blocking, _guard) = tracing_appender::non_blocking(tx);
    
    // 注意：这里需要全局替换 subscriber 来捕获日志
    // 实际实现中可能需要使用 GlobalDispatcher's approach
    
    let stream = BroadcastStream::new(rx)
        .map_while(|result| {
            match result {
                Ok(event) => Some(Event::default().json_data(event).ok()),
                Err(_) => None,
            }
        });
    
    Sse::new(stream)
        .keep_alive(Duration::from_secs(30))
}
```

### Task 2: 添加路由到 routes.rs

- [ ] **Step 1: 在 routes.rs 添加 log_handler 路由**

```rust
// 在 routes.rs 顶部添加
mod log_handler;

// 在 create_app() 函数中添加
.route("/api/logs/stream", get(log_handler::log_stream_handler))
```

### Task 3: 验证 Prefrontal 构建

- [ ] **Step 1: 运行 cargo check**

```bash
cd /home/ibloc/Projects/prefrontal && cargo check
```

---

## Chunk 2: Flutter LogService + Provider

**Files:**
- Create: `/home/ibloc/Projects/shadow/shadow-mobile/lib/services/log_service.dart`
- Create: `/home/ibloc/Projects/shadow/shadow-mobile/lib/providers/log_provider.dart`

### Task 1: 创建 LogService

- [ ] **Step 1: 创建 lib/services/log_service.dart**

```dart
import 'dart:async';
import 'package:flutter/foundation.dart';

enum LogSource { mnn, prefrontal }
enum LogLevel { debug, info, warning, error }

class LogEntry {
  final DateTime timestamp;
  final LogSource source;
  final LogLevel level;
  final String tag;
  final String message;

  LogEntry({
    required this.timestamp,
    required this.source,
    required this.level,
    required this.tag,
    required this.message,
  });

  factory LogEntry.fromJson(Map<String, dynamic> json, LogSource source) {
    return LogEntry(
      timestamp: DateTime.parse(json['timestamp'] as String),
      source: source,
      level: _parseLevel(json['level'] as String),
      tag: json['target'] as String? ?? json['tag'] as String? ?? '',
      message: json['message'] as String,
    );
  }

  static LogLevel _parseLevel(String level) {
    switch (level.toUpperCase()) {
      case 'DEBUG':
        return LogLevel.debug;
      case 'INFO':
        return LogLevel.info;
      case 'WARN':
      case 'WARNING':
        return LogLevel.warning;
      case 'ERROR':
      case 'SEVERE':
        return LogLevel.error;
      default:
        return LogLevel.info;
    }
  }

  Map<String, dynamic> toJson() => {
        'timestamp': timestamp.toIso8601String(),
        'source': source.name,
        'level': level.name,
        'tag': tag,
        'message': message,
      };
}

class LogState {
  final List<LogEntry> logs;
  final LogSource? sourceFilter;
  final LogLevel? levelFilter;
  final bool autoScroll;

  static const int maxLogs = 1000;

  LogState({
    this.logs = const [],
    this.sourceFilter,
    this.levelFilter,
    this.autoScroll = true,
  });

  LogState copyWith({
    List<LogEntry>? logs,
    LogSource? sourceFilter,
    bool clearSourceFilter = false,
    LogLevel? levelFilter,
    bool clearLevelFilter = false,
    bool? autoScroll,
  }) {
    return LogState(
      logs: logs ?? this.logs,
      sourceFilter: clearSourceFilter ? null : (sourceFilter ?? this.sourceFilter),
      levelFilter: clearLevelFilter ? null : (levelFilter ?? this.levelFilter),
      autoScroll: autoScroll ?? this.autoScroll,
    );
  }

  List<LogEntry> get filteredLogs {
    return logs.where((log) {
      if (sourceFilter != null && log.source != sourceFilter) return false;
      if (levelFilter != null && log.level != levelFilter) return false;
      return true;
    }).toList();
  }
}

class LogService extends StateNotifier<LogState> {
  LogService() : super(LogState());

  void addLog(LogEntry entry) {
    final newLogs = [entry, ...state.logs];
    if (newLogs.length > LogState.maxLogs) {
      newLogs.removeLast();
    }
    state = state.copyWith(logs: newLogs);
  }

  void clearLogs() {
    state = state.copyWith(logs: []);
  }

  void setSourceFilter(LogSource? source) {
    if (source == null) {
      state = state.copyWith(clearSourceFilter: true);
    } else {
      state = state.copyWith(sourceFilter: source);
    }
  }

  void setLevelFilter(LogLevel? level) {
    if (level == null) {
      state = state.copyWith(clearLevelFilter: true);
    } else {
      state = state.copyWith(levelFilter: level);
    }
  }

  void setAutoScroll(bool value) {
    state = state.copyWith(autoScroll: value);
  }

  String exportLogs() {
    final buffer = StringBuffer();
    buffer.writeln('timestamp,source,level,tag,message');
    for (final log in state.filteredLogs) {
      buffer.writeln(
          '${log.timestamp.toIso8601String()},${log.source.name},${log.level.name},${log.tag},${log.message}');
    }
    return buffer.toString();
  }
}
```

### Task 2: 创建 log_provider.dart

- [ ] **Step 1: 创建 lib/providers/log_provider.dart**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/log_service.dart';

final logServiceProvider =
    StateNotifierProvider<LogService, LogState>((ref) {
  return LogService();
});

final filteredLogsProvider = Provider<List<LogEntry>>((ref) {
  final logState = ref.watch(logServiceProvider);
  return logState.filteredLogs;
});
```

### Task 3: 验证 Flutter 代码

- [ ] **Step 1: 运行 flutter analyze**

```bash
cd /home/ibloc/Projects/shadow/shadow-mobile && flutter analyze lib/services/log_service.dart lib/providers/log_provider.dart
```

---

## Chunk 3: Prefrontal SSE 日志流连接

**Files:**
- Create: `/home/ibloc/Projects/shadow/shadow-mobile/lib/services/log_service/prefrontal_log_stream.dart`

### Task 1: 创建 PrefrontalLogStream

- [ ] **Step 1: 创建 prefrontal_log_stream.dart**

```dart
import 'dart:async';
import 'package:http/http.dart' as http;
import '../log_service.dart';

class PrefrontalLogStream {
  final String baseUrl;
  final void Function(LogEntry) onLog;
  StreamSubscription? _subscription;
  bool _isConnected = false;

  PrefrontalLogStream({
    required this.baseUrl,
    required this.onLog,
  });

  Future<void> connect() async {
    if (_isConnected) return;
    
    try {
      final request = http.Request('GET', Uri.parse('$baseUrl/api/logs/stream'));
      request.headers['Accept'] = 'text/event-stream';
      request.headers['Cache-Control'] = 'no-cache';
      
      final response = await http.Client().send(request);
      
      if (response.statusCode == 200) {
        _isConnected = true;
        _subscription = response.stream
            .transform(utf8Decoder)
            .transform(const LineSplitter())
            .listen(_handleSSEData);
      }
    } catch (e) {
      debugPrint('PrefrontalLogStream connection error: $e');
    }
  }

  void _handleSSEData(String data) {
    if (!data.startsWith('data:')) return;
    final jsonStr = data.substring(5).trim();
    if (jsonStr.isEmpty) return;
    
    try {
      final json = jsonDecode(jsonStr) as Map<String, dynamic>;
      final entry = LogEntry.fromJson(json, LogSource.prefrontal);
      onLog(entry);
    } catch (e) {
      debugPrint('Failed to parse log entry: $e');
    }
  }

  void disconnect() {
    _subscription?.cancel();
    _isConnected = false;
  }

  bool get isConnected => _isConnected;
}
```

### Task 2: 集成到 LogService

- [ ] **Step 1: 在 log_service.dart 添加 prefrontal 连接方法**

```dart
// 在 LogService 类中添加
class LogService extends StateNotifier<LogState> {
  PrefrontalLogStream? _prefrontalStream;
  // ... existing code ...

  void connectPrefrontal(String baseUrl) {
    _prefrontalStream = PrefrontalLogStream(
      baseUrl: baseUrl,
      onLog: addLog,
    );
    _prefrontalStream!.connect();
  }

  void disconnectPrefrontal() {
    _prefrontalStream?.disconnect();
    _prefrontalStream = null;
  }
}
```

---

## Chunk 4: MNN EventChannel (Android)

**Files:**
- Modify: `/home/ibloc/Projects/shadow/shadow-mobile/android/app/src/main/kotlin/com/ibloc/shadow/MainActivity.kt`
- Create: `/home/ibloc/Projects/shadow/shadow-mobile/android/app/src/main/kotlin/com/ibloc/shadow/LogcatReader.kt`

### Task 1: 创建 LogcatReader.kt

- [ ] **Step 1: 创建 LogcatReader.kt**

```kotlin
package com.ibloc.shadow

import android.util.Log
import kotlinx.coroutines.*
import java.text.SimpleDateFormat
import java.util.*
import java.util.regex.Pattern

class LogcatReader {
    companion object {
        private const val TAG = "ShadowLogcat"
        private val LOGCAT_PATTERN = Pattern.compile(
            "(\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}:\\d{2}\\.\\d{3})\\s+(\\d+)\\s+(\\d+)\\s+([DIWE])\\s+([\\w]+):\\s+(.*)"
        )
        private val TAGS = listOf("PrefrontalMNN", "OpenAIServer", "mnn_bridge", "ShadowMNN")
        private val DATE_FORMAT = SimpleDateFormat("yy-MM-dd HH:mm:ss.SSS", Locale.US)
    }

    private var readingJob: Job? = null
    private var onLogEntry: ((Map<String, Any>) -> Unit)? = null
    private var lastReadTimestamp: Long = 0

    fun startReading(onLogEntry: (Map<String, Any>) -> Unit) {
        this.onLogEntry = onLogEntry
        readingJob = CoroutineScope(Dispatchers.IO).launch {
            readLogcat()
        }
    }

    fun stopReading() {
        readingJob?.cancel()
        readingJob = null
    }

    private suspend fun readLogcat() = withContext(Dispatchers.IO) {
        // 先清除旧日志确保只读新日志
        Runtime.getRuntime().exec("logcat -c").waitFor()
        delay(100)
        lastReadTimestamp = System.currentTimeMillis()

        val process = Runtime.getRuntime().exec("logcat -v threadtime")
        val reader = process.inputStream.bufferedReader()

        try {
            while (isActive) {
                val line = reader.readLine() ?: break
                parseLine(line)?.let { entry ->
                    withContext(Dispatchers.Main) {
                        onLogEntry?.invoke(entry)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error reading logcat", e)
        } finally {
            reader.close()
            process.destroy()
        }
    }

    private fun parseLine(line: String): Map<String, Any>? {
        val matcher = LOGCAT_PATTERN.matcher(line)
        if (!matcher.matches()) return null

        val dateStr = matcher.group(1) ?: return null
        val level = matcher.group(4) ?: return null
        val tag = matcher.group(5) ?: return null

        if (!TAGS.contains(tag)) return null

        return try {
            val date = DATE_FORMAT.parse(dateStr)
            mapOf(
                "timestamp" to (date?.time ?: System.currentTimeMillis()),
                "level" to when (level) {
                    "D" -> "debug"
                    "I" -> "info"
                    "W" -> "warning"
                    "E" -> "error"
                    else -> "info"
                },
                "tag" to tag,
                "message" to (matcher.group(6) ?: "")
            )
        } catch (e: Exception) {
            null
        }
    }
}
```

### Task 2: 修改 MainActivity.kt 添加 EventChannel

- [ ] **Step 1: 在 MainActivity.kt 添加 EventChannel handler**

```kotlin
// 添加 import
import android.content.Context
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.BinaryMessenger

// 在 MainActivity 类中添加
private var logcatReader: LogcatReader? = null

// 添加方法
private fun setupLogcatChannel(messenger: BinaryMessenger) {
    val channel = EventChannel(messenger, "com.ibloc.shadow/mnn_logs")
    
    channel.setStreamHandler(object : EventChannel.StreamHandler {
        override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
            logcatReader = LogcatReader()
            logcatReader?.startReading { entry ->
                events?.success(entry)
            }
        }

        override fun onCancel(arguments: Any?) {
            logcatReader?.stopReading()
            logcatReader = null
        }
    })
}

// 在 configureFlutterEngine 中调用
setupLogcatChannel(binding.binaryMessenger)
```

---

## Chunk 5: MNN Flutter EventChannel 客户端

**Files:**
- Create: `/home/ibloc/Projects/shadow/shadow-mobile/lib/services/log_service/mnn_log_stream.dart`

### Task 1: 创建 MnnLogStream

- [ ] **Step 1: 创建 mnn_log_stream.dart**

```dart
import 'dart:async';
import 'package:flutter/services.dart';
import '../log_service.dart';

class MnnLogStream {
  static const EventChannel _channel = EventChannel('com.ibloc.shadow/mnn_logs');
  
  StreamSubscription? _subscription;
  final void Function(LogEntry) onLog;

  MnnLogStream({required this.onLog});

  void connect() {
    _subscription?.cancel();
    _subscription = _channel.receiveBroadcastStream().listen(
      (dynamic event) {
        if (event is Map) {
          final entry = LogEntry(
            timestamp: DateTime.fromMillisecondsSinceEpoch(
                (event['timestamp'] as num).toInt()),
            source: LogSource.mnn,
            level: _parseLevel(event['level'] as String),
            tag: event['tag'] as String? ?? '',
            message: event['message'] as String? ?? '',
          );
          onLog(entry);
        }
      },
      onError: (error) {
        debugPrint('MnnLogStream error: $error');
      },
    );
  }

  void disconnect() {
    _subscription?.cancel();
    _subscription = null;
  }

  static LogLevel _parseLevel(String level) {
    switch (level.toLowerCase()) {
      case 'debug':
        return LogLevel.debug;
      case 'info':
        return LogLevel.info;
      case 'warning':
      case 'warn':
        return LogLevel.warning;
      case 'error':
        return LogLevel.error;
      default:
        return LogLevel.info;
    }
  }
}
```

### Task 2: 集成到 LogService

- [ ] **Step 1: 在 log_service.dart 添加 MNN 连接方法**

```dart
// 在 LogService 类中添加
class LogService extends StateNotifier<LogState> {
  MnnLogStream? _mnnStream;
  // ... existing code ...

  void connectMnn() {
    _mnnStream = MnnLogStream(onLog: addLog);
    _mnnStream!.connect();
  }

  void disconnectMnn() {
    _mnnStream?.disconnect();
    _mnnStream = null;
  }
}
```

---

## Chunk 6: LogPanel UI

**Files:**
- Create: `/home/ibloc/Projects/shadow/shadow-mobile/lib/widgets/log_panel_section.dart`
- Modify: `/home/ibloc/Projects/shadow/shadow-mobile/lib/screens/settings_screen.dart`

### Task 1: 创建 LogPanelSection widget

- [ ] **Step 1: 创建 lib/widgets/log_panel_section.dart**

```dart
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import '../services/log_service.dart';
import '../providers/log_provider.dart';

class LogPanelSection extends ConsumerStatefulWidget {
  const LogPanelSection({super.key});

  @override
  ConsumerState<LogPanelSection> createState() => _LogPanelSectionState();
}

class _LogPanelSectionState extends ConsumerState<LogPanelSection> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    // 连接日志源
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(logServiceProvider.notifier)
        ..connectPrefrontal('http://10.0.2.2:8082')
        ..connectMnn();
    });
  }

  @override
  void dispose() {
    ref.read(logServiceProvider.notifier)
      ..disconnectPrefrontal()
      ..disconnectMnn();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _exportLogs() async {
    final logs = ref.read(logServiceProvider.notifier).exportLogs();
    final directory = await getApplicationDocumentsDirectory();
    final file = File('${directory.path}/shadow_logs_${DateTime.now().millisecondsSinceEpoch}.csv');
    await file.writeAsString(logs);
    
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Logs exported to ${file.path}')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final logState = ref.watch(logServiceProvider);
    final filteredLogs = logState.filteredLogs;

    // 自动滚动
    if (logState.autoScroll && _scrollController.hasClients) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _scrollController.animateTo(
          0,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      });
    }

    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              const Icon(Icons.article_outlined, size: 20),
              const SizedBox(width: 8),
              const Text('日志', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
              const Spacer(),
              // Source filter
              SegmentedButton<LogSource?>(
                segments: const [
                  ButtonSegment(value: null, label: Text('全部')),
                  ButtonSegment(value: LogSource.mnn, label: Text('MNN')),
                  ButtonSegment(value: LogSource.prefrontal, label: Text('后端')),
                ],
                selected: {logState.sourceFilter},
                onSelectionChanged: (selected) {
                  ref.read(logServiceProvider.notifier).setSourceFilter(selected.first);
                },
              ),
              const SizedBox(width: 8),
              // Level filter
              PopupMenuButton<LogLevel?>(
                icon: const Icon(Icons.filter_list),
                onSelected: (level) {
                  ref.read(logServiceProvider.notifier).setLevelFilter(level);
                },
                itemBuilder: (context) => [
                  const PopupMenuItem(value: null, child: Text('所有级别')),
                  const PopupMenuItem(value: LogLevel.debug, child: Text('Debug')),
                  const PopupMenuItem(value: LogLevel.info, child: Text('Info')),
                  const PopupMenuItem(value: LogLevel.warning, child: Text('Warning')),
                  const PopupMenuItem(value: LogLevel.error, child: Text('Error')),
                ],
              ),
              // Auto scroll
              Switch(
                value: logState.autoScroll,
                onChanged: (value) {
                  ref.read(logServiceProvider.notifier).setAutoScroll(value);
                },
              ),
              // Export
              IconButton(
                icon: const Icon(Icons.download),
                onPressed: _exportLogs,
                tooltip: '导出日志',
              ),
              // Clear
              IconButton(
                icon: const Icon(Icons.delete_outline),
                onPressed: () {
                  ref.read(logServiceProvider.notifier).clearLogs();
                },
                tooltip: '清空日志',
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Log list
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.3),
                borderRadius: BorderRadius.circular(8),
              ),
              child: filteredLogs.isEmpty
                  ? const Center(child: Text('暂无日志', style: TextStyle(color: Colors.grey)))
                  : ListView.builder(
                      controller: _scrollController,
                      reverse: true,
                      itemCount: filteredLogs.length,
                      itemBuilder: (context, index) {
                        final log = filteredLogs[index];
                        return _LogEntryTile(log: log);
                      },
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LogEntryTile extends StatelessWidget {
  final LogEntry log;

  const _LogEntryTile({required this.log});

  Color _getLevelColor() {
    switch (log.level) {
      case LogLevel.debug:
        return Colors.grey;
      case LogLevel.info:
        return Colors.blue;
      case LogLevel.warning:
        return Colors.orange;
      case LogLevel.error:
        return Colors.red;
    }
  }

  IconData _getLevelIcon() {
    switch (log.level) {
      case LogLevel.debug:
        return Icons.bug_report;
      case LogLevel.info:
        return Icons.info;
      case LogLevel.warning:
        return Icons.warning;
      case LogLevel.error:
        return Icons.error;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(_getLevelIcon(), size: 14, color: _getLevelColor()),
          const SizedBox(width: 4),
          Text(
            log.source == LogSource.mnn ? '[MNN]' : '[Pre]',
            style: TextStyle(fontSize: 10, color: Colors.grey[400]),
          ),
          const SizedBox(width: 4),
          Text(
            log.tag,
            style: TextStyle(fontSize: 10, color: Colors.grey[400]),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              log.message,
              style: TextStyle(fontSize: 12, color: _getLevelColor()),
            ),
          ),
        ],
      ),
    );
  }
}
```

### Task 2: 添加到 Settings Screen

- [ ] **Step 1: 在 settings_screen.dart 导入并添加 LogPanelSection**

```dart
// 添加 import
import '../widgets/log_panel_section.dart';

// 在 _SettingsScreenState 类中添加
Widget build(BuildContext context) {
  return Scaffold(
    body: CustomScrollView(
      slivers: [
        // ... existing app bar ...
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                // ... existing sections ...
                
                // 添加 LogPanelSection
                SizedBox(
                  height: 400,  // 固定高度
                  child: const LogPanelSection(),
                ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}
```

---

## Verification

- [ ] Prefrontal: `cargo build --manifest-path /home/ibloc/Projects/prefrontal/Cargo.toml`
- [ ] Flutter: `flutter analyze` 无错误
- [ ] APK 构建: `flutter build apk --debug` 成功
