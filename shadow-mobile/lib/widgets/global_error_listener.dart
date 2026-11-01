import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/error_dialog_provider.dart';
import '../providers/log_provider.dart';
import '../services/log_service.dart';
import '../utils/error_formatter.dart';
import '../utils/build_phase_guard.dart';

/// Mounts above the [MaterialApp] and shows a modal [AlertDialog] whenever
/// the [errorDialogProvider] has a current error. Listens to provider
/// changes via [ref.listen] so the dialog appears as soon as an error is
/// reported, regardless of where the error originated (HTTP, Flutter
/// framework, platform channel, manual `showError` call).
///
/// Also mirrors every reported error into the persistent [LogService]
/// (capped at 100 client entries) so testers can review the history
/// later in the logs panel.
class GlobalErrorListener extends ConsumerStatefulWidget {
  final Widget child;

  const GlobalErrorListener({super.key, required this.child});

  @override
  ConsumerState<GlobalErrorListener> createState() =>
      _GlobalErrorListenerState();
}

class _GlobalErrorListenerState extends ConsumerState<GlobalErrorListener> {
  @override
  Widget build(BuildContext context) {
    ref.listen<ErrorDialogState>(errorDialogProvider, (prev, next) {
      if (next.current != null && prev?.current?.id != next.current!.id) {
        final current = next.current!;
        // ⚠️ 这条写入**不能**发生在 build 期。
        //
        // `ref.listen` 的回调会在 provider 状态变化时**同步**触发 ——
        // 而那次变化可能正好发生在某一帧的 build 里（错误上报后
        // `GlobalErrorListener` 重建，监听在 build 里重新注册）。
        // 此时改 `logServiceProvider` ⇒ Riverpod 抛
        // "Tried to modify a provider while the widget tree was building."
        // ⇒ 整个 App 打断（2026-11-01 真机踩到过）。
        //
        // ⇒ 把写入挪到 build 期之外；弹窗那半本来就有 post-frame 防护。
        final logNotifier = ref.read(logServiceProvider.notifier);
        runOutsideBuild(() {
          if (!mounted) return;
          try {
            logNotifier.addClientError(
              tag: _tagForSource(current.source),
              message: _summarize(current),
              stack: current.stack,
            );
          } catch (e) {
            // ignore: avoid_print
            print('log panel write failed: $e');
          }
        });
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          _showErrorDialog(context, ref, current);
        });
      }
    });
    return widget.child;
  }

  String _tagForSource(ErrorSource source) {
    switch (source) {
      case ErrorSource.http:
        return 'http';
      case ErrorSource.flutter:
        return 'flutter';
      case ErrorSource.platform:
        return 'platform';
      case ErrorSource.manual:
        return 'app';
    }
  }

  String _summarize(AppError error) {
    if (error.endpoint != null) {
      final status = error.status != null ? ' [${error.status}]' : '';
      return '${error.method ?? "GET"} ${error.endpoint}$status — ${error.message}';
    }
    return error.message;
  }

  Future<void> _showErrorDialog(
    BuildContext context,
    WidgetRef ref,
    AppError error,
  ) async {
    final notifier = ref.read(errorDialogProvider.notifier);
    final queueLen = ref.read(errorDialogProvider).queue.length;
    final queueHint = queueLen > 0 ? ' (+$queueLen queued)' : '';

    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        bool copied = false;
        return StatefulBuilder(
          builder: (ctx, setState) {
            return AlertDialog(
              icon: Icon(
                Icons.error_outline,
                color: Theme.of(ctx).colorScheme.error,
                size: 32,
              ),
              title: Text('${error.source.label}$queueHint'),
              content: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (error.endpoint != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          '${error.method ?? "GET"} ${error.endpoint}'
                          '${error.status != null ? "  →  ${error.status}${error.statusText != null ? " ${error.statusText}" : ""}" : ""}',
                          style: Theme.of(ctx)
                              .textTheme
                              .bodySmall
                              ?.copyWith(fontFamily: 'monospace'),
                        ),
                      ),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Theme.of(ctx)
                            .colorScheme
                            .errorContainer
                            .withValues(alpha: 0.3),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: Theme.of(ctx)
                              .colorScheme
                              .error
                              .withValues(alpha: 0.3),
                        ),
                      ),
                      child: Text(
                        error.message,
                        style: Theme.of(ctx).textTheme.bodyMedium,
                      ),
                    ),
                    if (error.stack != null && error.stack!.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      ExpansionTile(
                        title: const Text('Stack trace'),
                        tilePadding: EdgeInsets.zero,
                        childrenPadding: const EdgeInsets.symmetric(
                          vertical: 4,
                        ),
                        children: [
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: Theme.of(ctx)
                                  .colorScheme
                                  .surfaceContainerHighest,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              error.stack!,
                              style: Theme.of(ctx)
                                  .textTheme
                                  .bodySmall
                                  ?.copyWith(fontFamily: 'monospace'),
                            ),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 12),
                    Text(
                      'Time: ${error.timestamp.toIso8601String()}',
                      style: Theme.of(ctx).textTheme.bodySmall?.copyWith(
                            color: Theme.of(ctx)
                                .colorScheme
                                .onSurfaceVariant,
                          ),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton.icon(
                  onPressed: () async {
                    final text = formatErrorForClipboard(error);
                    await Clipboard.setData(ClipboardData(text: text));
                    if (!ctx.mounted) return;
                    setState(() => copied = true);
                    Future.delayed(const Duration(seconds: 2), () {
                      if (ctx.mounted) {
                        setState(() => copied = false);
                      }
                    });
                  },
                  icon: Icon(copied ? Icons.check : Icons.copy, size: 18),
                  label: Text(copied ? 'Copied' : 'Copy error'),
                ),
                FilledButton(
                  onPressed: () {
                    Navigator.of(ctx).pop();
                    notifier.dismiss();
                  },
                  child: const Text('Close'),
                ),
              ],
            );
          },
        );
      },
    );
  }
}
