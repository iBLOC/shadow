import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/log_service.dart';

final logServiceProvider = StateNotifierProvider<LogService, LogState>((ref) {
  return LogService();
});

final filteredLogsProvider = Provider<List<LogEntry>>((ref) {
  final logState = ref.watch(logServiceProvider);
  return logState.filteredLogs;
});
