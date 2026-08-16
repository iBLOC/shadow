import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Source category for an error. Mirrors the desktop classification.
enum ErrorSource { http, flutter, platform, manual }

extension ErrorSourceLabel on ErrorSource {
  String get label {
    switch (this) {
      case ErrorSource.http:
        return 'HTTP request failed';
      case ErrorSource.flutter:
        return 'Widget tree error';
      case ErrorSource.platform:
        return 'Platform error';
      case ErrorSource.manual:
        return 'Application error';
    }
  }

  String get wireName {
    switch (this) {
      case ErrorSource.http:
        return 'http';
      case ErrorSource.flutter:
        return 'flutter';
      case ErrorSource.platform:
        return 'platform';
      case ErrorSource.manual:
        return 'manual';
    }
  }
}

class AppError {
  final String id;
  final DateTime timestamp;
  final ErrorSource source;
  final String? endpoint;
  final String? method;
  final int? status;
  final String? statusText;
  final String message;
  final String? stack;
  final String? library;
  final String? context;
  final String? platform;

  AppError({
    required this.id,
    required this.timestamp,
    required this.source,
    required this.message,
    this.endpoint,
    this.method,
    this.status,
    this.statusText,
    this.stack,
    this.library,
    this.context,
    this.platform,
  });
}

class ErrorDialogState {
  final AppError? current;
  final List<AppError> queue;

  const ErrorDialogState({this.current, this.queue = const []});

  ErrorDialogState copyWith({
    AppError? current,
    List<AppError>? queue,
    bool clearCurrent = false,
  }) {
    return ErrorDialogState(
      current: clearCurrent ? null : (current ?? this.current),
      queue: queue ?? this.queue,
    );
  }
}

class ErrorDialogNotifier extends StateNotifier<ErrorDialogState> {
  ErrorDialogNotifier() : super(const ErrorDialogState());

  void show({
    required ErrorSource source,
    required String message,
    String? endpoint,
    String? method,
    int? status,
    String? statusText,
    String? stack,
    String? library,
    String? context,
    String? platform,
  }) {
    final err = AppError(
      id: _newId(),
      timestamp: DateTime.now(),
      source: source,
      message: message,
      endpoint: endpoint,
      method: method,
      status: status,
      statusText: statusText,
      stack: stack,
      library: library,
      context: context,
      platform: platform,
    );
    if (state.current == null) {
      state = state.copyWith(current: err);
    } else {
      state = state.copyWith(queue: [...state.queue, err]);
    }
  }

  void dismiss() {
    if (state.queue.isNotEmpty) {
      final next = state.queue.first;
      final rest = state.queue.sublist(1);
      state = state.copyWith(current: next, queue: rest);
    } else {
      state = state.copyWith(clearCurrent: true);
    }
  }

  void clearQueue() {
    state = const ErrorDialogState();
  }
}

String _newId() {
  final now = DateTime.now().microsecondsSinceEpoch;
  final rand = now ^ (now >> 16);
  return 'err_${now.toString()}_${rand.toRadixString(36)}';
}

final errorDialogProvider =
    StateNotifierProvider<ErrorDialogNotifier, ErrorDialogState>((ref) {
  return ErrorDialogNotifier();
});
