import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:shadow_mobile/providers/error_dialog_provider.dart';
import 'package:shadow_mobile/widgets/app_error_boundary.dart';

void main() {
  testWidgets(
    'build-time FlutterError is reported to errorDialogProvider '
    'without throwing "modify provider during build"',
    (tester) async {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      const intentionalError = 'intentional test error from build';

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const AppErrorBoundary(
            child: _ThrowingChild(message: intentionalError),
          ),
        ),
      );

      // The build-time FlutterError is reported through FlutterError.onError
      // and surfaces as a test-framework exception. The boundary routes it
      // into the error dialog provider via a post-frame callback. Acknowledge
      // the framework-level error so it does not fail the test.
      expect(tester.takeException(), isA<FlutterError>());

      // Pump again so the post-frame callback inside the boundary fires
      // and mutates the provider outside of a build phase.
      await tester.pump();

      // The provider should have the error enqueued and no "modify provider
      // during build" exception should have been raised.
      final state = container.read(errorDialogProvider);
      expect(state.current, isNotNull,
          reason: 'current error should be enqueued after the build error');
      expect(state.current!.source, ErrorSource.flutter);
      expect(state.current!.message, contains(intentionalError));
      expect(tester.takeException(), isNull,
          reason: 'no further exceptions expected after the post-frame');
    },
  );

  testWidgets(
    'handler is installed exactly once and restored on dispose',
    (tester) async {
      final originalHandler = FlutterError.onError;
      addTearDown(() {
        FlutterError.onError = originalHandler;
      });

      final container = ProviderContainer();
      addTearDown(container.dispose);

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const AppErrorBoundary(child: SizedBox.shrink()),
        ),
      );

      // After mount, FlutterError.onError should be set to the boundary's
      // handler, not the original.
      expect(FlutterError.onError, isNotNull);
      expect(
        FlutterError.onError,
        isNot(equals(originalHandler)),
        reason: 'AppErrorBoundary should have replaced the default handler',
      );
      final installed = FlutterError.onError;

      // Dispose the boundary by replacing the widget tree.
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const SizedBox.shrink(),
        ),
      );

      // The original handler should be restored.
      expect(
        FlutterError.onError,
        equals(originalHandler),
        reason: 'dispose() must restore the prior FlutterError.onError',
      );
      // Sanity: the installed handler was indeed the boundary's.
      expect(installed, isNotNull);
    },
  );
}

class _ThrowingChild extends StatelessWidget {
  final String message;
  const _ThrowingChild({required this.message});

  @override
  Widget build(BuildContext context) {
    throw FlutterError(message);
  }
}
