import '../providers/error_dialog_provider.dart';

/// Format an [AppError] as plain text for the clipboard.
///
/// The output is designed to be:
///   - Human-readable (sections, labels)
///   - Easy to paste into an AI coding tool (Claude, Cursor, etc.)
///   - Structured enough to grep / parse
///
/// Output shape:
///   [Shadow Error] 2026-06-25T10:30:45.123Z
///   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
///   Source:     http
///   Endpoint:   POST http://localhost:8082/v1/chat/completions
///   Status:     503 Service Unavailable
///   Message:    HTTP 503: Service Unavailable
///   Platform:   android flutter
///   Stack:
///     #0  _request (prefrontal_client.dart:62)
///     #1  getProviders (prefrontal_client.dart:71)
String formatErrorForClipboard(AppError error) {
  final buf = StringBuffer();
  final bar = '━' * 60;

  buf.writeln('[Shadow Error] ${error.timestamp}');
  buf.writeln(bar);
  buf.writeln('Source:     ${error.source}');
  if (error.endpoint != null) {
    buf.writeln('Endpoint:   ${error.method ?? "GET"} ${error.endpoint}');
  }
  if (error.status != null) {
    final statusLine = StringBuffer('Status:     ${error.status}');
    if (error.statusText != null && error.statusText!.isNotEmpty) {
      statusLine.write(' ${error.statusText}');
    }
    buf.writeln(statusLine);
  }
  buf.writeln('Message:    ${error.message}');
  if (error.platform != null) {
    buf.writeln('Platform:   ${error.platform}');
  }
  if (error.library != null) {
    buf.writeln('Library:    ${error.library}');
  }
  if (error.context != null) {
    buf.writeln('Context:    ${error.context}');
  }
  if (error.stack != null && error.stack!.isNotEmpty) {
    buf.writeln();
    buf.writeln('Stack:');
    buf.writeln(error.stack);
  }
  return buf.toString();
}
