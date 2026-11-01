import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// 日志来源。`mnn` 的语义已经泛化为「本机组件（EventChannel，宿主侧
/// AppLog 抄送，通道名沿用 mnn_logs）」；`app` 是 Dart 侧 package:logging
/// 的记录（各 Notifier / Service 的运行时日志）；`client` 是**客户端
/// 错误**（全局错误监听器 `global_error_listener.dart`）。
///
/// ⚠️ **它以前叫 `prefrontal`** —— 那时它装的是遗留嵌入式 Prefrontal 的
/// SSE 流；那个运行时随「嵌入式 Prefrontal」整条删除 ⇒ ⇒ 那一路没有了 ⇒
/// ⇒ 这个来源现在**只**装客户端错误 ⇒ ⇒ 名字得跟内容对上。
enum LogSource { mnn, app, client }

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
      sourceFilter: clearSourceFilter
          ? null
          : (sourceFilter ?? this.sourceFilter),
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

  @override
  void dispose() {
    disconnectMnn();
    super.dispose();
  }

  void addLog(LogEntry entry) {
    final newLogs = [entry, ...state.logs];
    if (newLogs.length > LogState.maxLogs) {
      newLogs.removeLast();
    }
    state = state.copyWith(logs: newLogs);
  }

  void addClientError({required String tag, required String message, String? stack}) {
    addLog(LogEntry(
      timestamp: DateTime.now(),
      source: LogSource.client,
      level: LogLevel.error,
      tag: tag,
      message: stack != null ? '$message\n$stack' : message,
    ));
  }

  /// 接住 Dart 侧 package:logging 的记录（`Logger.root.onRecord`）。
  ///
  /// App 里几十个 Notifier / Service 都在用 `Logger('…')` 打运行时日志
  /// （大脑启动、模型路由、错误降级…），但 logging 包默认没有监听者 ——
  /// 这些日志此前哪儿也不去。这里把它们领进日志面板。
  void addDartLog(String loggerName, String level, String message, [String? error]) {
    addLog(LogEntry(
      timestamp: DateTime.now(),
      source: LogSource.app,
      level: switch (level) {
        'FINE' || 'FINER' || 'FINEST' => LogLevel.debug,
        'WARNING' => LogLevel.warning,
        'SEVERE' => LogLevel.error,
        _ => LogLevel.info,
      },
      tag: loggerName,
      message: error != null
          ? '$message ($error)'
          : message,
    ));
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
        '${log.timestamp.toIso8601String()},${log.source.name},${log.level.name},${log.tag},${log.message}',
      );
    }
    return buffer.toString();
  }

  /// 幂等：流是进程级的（本进程 logcat），面板只是观察者。
  ///
  /// 设置页的「高级 → 日志」折叠区每次展开都会重建面板并调一次这里；
  /// 宿主侧 onListen 会先回放最近一段存量 —— 若每次都拆掉重连，
  /// 同一批存量就会被重复塞进列表。
  void connectMnn() {
    if (_mnnStream != null) return;
    _mnnStream = MnnLogStream(onLog: addLog);
    _mnnStream?.connect();
  }

  void disconnectMnn() {
    _mnnStream?.disconnect();
    _mnnStream = null;
  }

  MnnLogStream? _mnnStream;
}

class MnnLogStream {
  static const EventChannel _channel = EventChannel(
    'com.ibloc.shadow/mnn_logs',
  );

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
              (event['timestamp'] as num?)?.toInt() ??
                  DateTime.now().millisecondsSinceEpoch,
            ),
            source: LogSource.mnn,
            level: _parseLevel(event['level'] as String? ?? 'info'),
            tag: event['tag'] as String? ?? 'MNN',
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
