import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/error_dialog_provider.dart';

/// Top-level Flutter error boundary.
///
/// Wrap the [MaterialApp] (or any subtree) in this widget. If a build
/// throws, the error is reported to the global error dialog store and
/// the child is replaced by a minimal fallback so the rest of the app
/// remains visible and the dialog can be shown.
class AppErrorBoundary extends ConsumerStatefulWidget {
  final Widget child;

  const AppErrorBoundary({super.key, required this.child});

  @override
  ConsumerState<AppErrorBoundary> createState() => _AppErrorBoundaryState();
}

class _AppErrorBoundaryState extends ConsumerState<AppErrorBoundary> {
  Object? _error;
  FlutterExceptionHandler? _priorFlutterOnError;

  // Re-entrancy guard: while a post-frame callback is pending we ignore
  // further Flutter errors so that a rebuild triggered by the boundary
  // itself cannot re-enter the handler and spin forever.
  bool _errorScheduled = false;

  @override
  void initState() {
    super.initState();
    // Install the global Flutter error handler exactly once. The previous
    // implementation did this in didChangeDependencies, which (a) re-assigned
    // the handler on every dependency change and (b) called `state = ...` on
    // the ErrorDialogNotifier from inside a build phase — both Riverpod
    // forbids. The resulting "modify provider during build" exception was
    // then reported through this very handler, producing the infinite
    // ErrorDialogNotifier.show() / didChangeDependencies loop.
    _priorFlutterOnError = FlutterError.onError;
    FlutterError.onError = _handleFlutterError;
  }

  @override
  void dispose() {
    // Restore the handler that was active before this boundary mounted so
    // we don't leak references across hot reload / navigation.
    FlutterError.onError = _priorFlutterOnError;
    super.dispose();
  }

  void _handleFlutterError(FlutterErrorDetails details) {
    if (_errorScheduled) {
      // A previous error is still being processed; don't stack another
      // post-frame callback. Still delegate to the prior handler so
      // logging/console output keeps working.
      _priorFlutterOnError?.call(details);
      return;
    }
    _errorScheduled = true;

    // Defer the provider/state mutations to a post-frame callback so we
    // are no longer inside the current build phase when Riverpod's
    // _debugCanModifyProviders check runs.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      try {
        if (!mounted) return;
        ref.read(errorDialogProvider.notifier).show(
              source: ErrorSource.flutter,
              message: details.exceptionAsString(),
              stack: details.stack?.toString(),
              library: details.library ?? 'flutter framework',
              context: details.context?.toString(),
              platform: defaultTargetPlatform.name,
            );
        setState(() {
          _error = details.exception;
        });
      } finally {
        _errorScheduled = false;
      }
    });

    // Always delegate to the previous handler so logging/console output
    // continues to work.
    _priorFlutterOnError?.call(details);
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      // AppErrorBoundary wraps MaterialApp.router, so when we render the
      // fallback the framework's MaterialApp/Localizations/Directionality
      // ancestors are not yet (or no longer) present. Provide a baseline
      // Directionality + Localizations so the error UI can render correctly,
      // and wrap the body in a SingleChildScrollView so long stack traces
      // don't overflow on small screens.
      return Directionality(
        textDirection: TextDirection.ltr,
        child: Material(
          color: Theme.of(context).colorScheme.surface,
          child: SingleChildScrollView(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.error_outline,
                      size: 64,
                      color: Theme.of(context).colorScheme.error,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Something went wrong',
                      style: Theme.of(context).textTheme.titleLarge,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _error.toString(),
                      style: Theme.of(context).textTheme.bodyMedium,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: () {
                        setState(() {
                          _error = null;
                        });
                      },
                      child: const Text('Continue'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }
    return widget.child;
  }
}
