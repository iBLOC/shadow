import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
    disconnectPrefrontal();
    _prefrontalStream = PrefrontalLogStream(baseUrl: baseUrl, onLog: addLog);
    _prefrontalStream?.connect();
  }

  void disconnectPrefrontal() {
    _prefrontalStream?.disconnect();
    _prefrontalStream = null;
  }

  void connectMnn() {
    disconnectMnn();
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
  List<int> _buffer = [];

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
          _buffer.addAll(data);
          _processBuffer();
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

  void _processBuffer() {
    final str = String.fromCharCodes(_buffer);
    final lines = str.split('\n');
    for (var i = 0; i < lines.length - 1; i++) {
      final line = lines[i];
      if (line.startsWith('data:')) {
        final jsonStr = line.substring(5).trim();
        if (jsonStr.isNotEmpty) {
          try {
            final json = _parseJson(jsonStr);
            if (json.isNotEmpty) {
              final entry = LogEntry.fromJson(json, LogSource.prefrontal);
              onLog(entry);
            }
          } catch (e) {
            debugPrint('Failed to parse log entry: $e');
          }
        }
      }
    }
    final lastLine = lines.last;
    if (!lastLine.startsWith('data:')) {
      _buffer = [];
    } else {
      _buffer = [];
    }
  }

  Map<String, dynamic> _parseJson(String jsonStr) {
    try {
      final result = <String, dynamic>{};
      var i = 0;
      if (jsonStr.isEmpty || jsonStr[0] != '{') return result;
      i++;
      while (i < jsonStr.length && jsonStr[i] != '}') {
        while (i < jsonStr.length && (jsonStr[i] == ' ' || jsonStr[i] == ',')) {
          i++;
        }
        if (i >= jsonStr.length || jsonStr[i] == '}') break;
        final keyEnd = jsonStr.indexOf(':', i);
        if (keyEnd == -1) break;
        var key = jsonStr.substring(i, keyEnd).trim();
        if (key.startsWith('"') && key.endsWith('"')) {
          key = key.substring(1, key.length - 1);
          i = keyEnd + 1;
          while (i < jsonStr.length && jsonStr[i] == ' ') {
            i++;
          }
          dynamic value;
          if (i < jsonStr.length && jsonStr[i] == '"') {
            i++;
            final valueEnd = jsonStr.indexOf('"', i);
            value = jsonStr.substring(i, valueEnd);
            i = valueEnd + 1;
          } else {
            final valueEnd = jsonStr.indexOf(RegExp(r'[,}]'), i);
            final rawValue = valueEnd == -1
                ? jsonStr.substring(i).trim()
                : jsonStr.substring(i, valueEnd).trim();
            if (rawValue == 'null') {
              value = null;
            } else if (rawValue == 'true') {
              value = true;
            } else if (rawValue == 'false') {
              value = false;
            } else if (double.tryParse(rawValue) != null) {
              value = double.parse(rawValue);
            } else {
              value = rawValue;
            }
            i = valueEnd == -1 ? jsonStr.length : valueEnd;
          }
          result[key] = value;
        } else {
          i = keyEnd + 1;
        }
      }
      return result;
    } catch (e) {
      return {};
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
