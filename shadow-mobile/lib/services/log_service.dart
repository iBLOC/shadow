import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// 日志来源。`mnn` 的语义已经泛化为「本机组件（EventChannel，宿主侧
/// AppLog 抄送，通道名沿用 mnn_logs）」；`app` 是 Dart 侧 package:logging
/// 的记录（各 Notifier / Service 的运行时日志）；`prefrontal` 是遗留
/// Prefrontal 的 SSE 流。
enum LogSource { mnn, app, prefrontal }

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
      level: _parseLevel(json['level'] as String? ?? 'info'),
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
    disconnectPrefrontal();
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
      source: LogSource.prefrontal,
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

  void connectPrefrontal(String baseUrl) {
    // 同一地址且还连着 ⇒ 不拆重连（面板每次展开都会重新挂上来）。
    final current = _prefrontalStream;
    if (current != null && current.baseUrl == baseUrl && current.isConnected) {
      return;
    }
    disconnectPrefrontal();
    _prefrontalStream = PrefrontalLogStream(baseUrl: baseUrl, onLog: addLog);
    _prefrontalStream?.connect();
  }

  void disconnectPrefrontal() {
    _prefrontalStream?.disconnect();
    _prefrontalStream = null;
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

  PrefrontalLogStream? _prefrontalStream;
  MnnLogStream? _mnnStream;
}

class PrefrontalLogStream {
  final String baseUrl;
  final void Function(LogEntry) onLog;
  Socket? _socket;
  bool _isConnected = false;

  /// 未消费的字节 —— 只保留**不完整的尾行**（跨 TCP 段的 SSE 帧不被丢）。
  String _pending = '';

  PrefrontalLogStream({required this.baseUrl, required this.onLog});

  Future<void> connect() async {
    if (_isConnected) return;

    try {
      final uri = Uri.parse('$baseUrl/api/logs/stream');
      final host = uri.host;
      final port = uri.port;

      _socket = await Socket.connect(host, port);
      _isConnected = true;

      _socket!.listen(
        (data) {
          consume(utf8.decode(data, allowMalformed: true));
        },
        onError: (error) {
          debugPrint('PrefrontalLogStream error: $error');
          _isConnected = false;
        },
        onDone: () {
          _isConnected = false;
        },
      );

      final request =
          'GET /api/logs/stream HTTP/1.1\r\n'
          'Host: $host:$port\r\n'
          'Accept: text/event-stream\r\n'
          'Cache-Control: no-cache\r\n'
          'Connection: keep-alive\r\n'
          '\r\n';
      _socket!.write(request);
      await _socket!.flush();
    } catch (e) {
      debugPrint('PrefrontalLogStream connection error: $e');
      _isConnected = false;
    }
  }

  /// 喂入**一段**新到的字节：消费缓冲里的完整行，不完整的尾行留在
  /// [_pending] 等下一段（跨 TCP 段的 SSE 帧不被丢）。`data:` 行按真
  /// JSON 解码（手写解析器不认转义引号 —— message 里带 `\"` 就解析成垃圾）。
  @visibleForTesting
  void consume(String chunk) {
    var input = _pending + chunk;
    // HTTP/1.1 响应头剥离 —— 幂等：缓冲以 "HTTP/" 开头才剥（剥完不再以它
    // 开头，天然不重复）；没有头的流（异常但可能）也照常工作。
    if (input.startsWith('HTTP/')) {
      final headerEnd = input.indexOf('\r\n\r\n');
      if (headerEnd == -1) {
        _pending = input; // 头还没到齐，整段留着
        return;
      }
      input = input.substring(headerEnd + 4);
    }
    final lines = input.split('\n');
    // split 的最后一段要么是空串（行完整）要么是不完整的尾行 —— 留给下一段。
    _pending = lines.removeLast();
    for (final rawLine in lines) {
      final line = rawLine.endsWith('\r') ? rawLine.substring(0, rawLine.length - 1) : rawLine;
      if (!line.startsWith('data:')) continue; // event:/注释/空行
      final jsonStr = line.substring(5).trim();
      if (jsonStr.isEmpty) continue;
      try {
        final json = jsonDecode(jsonStr);
        if (json is Map<String, dynamic>) {
          onLog(LogEntry.fromJson(json, LogSource.prefrontal));
        }
      } catch (e) {
        debugPrint('Failed to parse log entry: $e');
      }
    }
  }

  void disconnect() {
    _socket?.destroy();
    _socket = null;
    _isConnected = false;
  }

  bool get isConnected => _isConnected;
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
