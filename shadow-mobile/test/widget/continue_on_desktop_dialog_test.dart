import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/services/session_transfer_service.dart';
import 'package:shadow_mobile/widgets/continue_on_desktop_dialog.dart';
import '../widget/test_helper.dart';

void main() {
  testSetup();

  group('ContinueOnDesktopDialog Widget Tests', () {
    testWidgets('renders dialog with local peer pre-selected', (
      WidgetTester tester,
    ) async {
      final mockClient = MockClient((request) async {
        if (request.url.path.contains('/v1/models')) {
          return http.Response(
            '{"data": [{"id": "gemma"}, {"id": "mistral"}]}',
            200,
          );
        }
        if (request.url.path.contains('/api/sessions/')) {
          return http.Response(
            '{"session_id": "test-session", "messages": [], "size_bytes": 1024}',
            200,
          );
        }
        return http.Response('{}', 404);
      });

      final service = SessionTransferService(client: mockClient);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            sessionTransferServiceProvider.overrideWithValue(service),
            continueDesktopProvider.overrideWith(
              (ref) => ContinueDesktopNotifier(service, 'test-session'),
            ),
          ],
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: Builder(
              builder: (context) {
                return Scaffold(body: _TestDialogContent());
              },
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Continue on Desktop'), findsOneWidget);
      expect(find.text('Transfer'), findsOneWidget);
    });

    testWidgets('shows add manually option when no peers', (
      WidgetTester tester,
    ) async {
      final mockClient = MockClient((request) async {
        if (request.url.path.contains('/v1/models')) {
          return http.Response('{"data": []}', 200);
        }
        return http.Response('{}', 404);
      });

      final service = SessionTransferService(client: mockClient);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            continueDesktopProvider.overrideWith(
              (ref) => ContinueDesktopNotifier(service, 'test-session'),
            ),
          ],
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const Scaffold(body: _MockNoPeersDialog()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.computer_outlined), findsOneWidget);
    });

    testWidgets('shows error state with retry when probing fails', (
      WidgetTester tester,
    ) async {
      final mockClient = MockClient((request) async {
        return http.Response('Internal error', 500);
      });

      final service = SessionTransferService(client: mockClient);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            continueDesktopProvider.overrideWith(
              (ref) => ContinueDesktopNotifier(service, 'test-session'),
            ),
          ],
          child: MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const Scaffold(body: _MockErrorDialog()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.error_outline), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });
  });
}

class _TestDialogContent extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(continueDesktopProvider);
    final l10n = AppLocalizations.of(context)!;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.continueDesktopTitle,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Text(l10n.continueDesktopDescription),
          const SizedBox(height: 16),
          if (state.peers.isEmpty)
            const CircularProgressIndicator()
          else
            ...state.peers.map(
              (peer) => ListTile(
                leading: const Icon(Icons.computer),
                title: Text(peer.name),
                subtitle: Text(peer.url),
                selected: state.selectedPeer?.id == peer.id,
              ),
            ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: state.selectedPeer != null ? () {} : null,
            child: Text(l10n.continueDesktopConfirm),
          ),
        ],
      ),
    );
  }
}

class _MockNoPeersDialog extends ConsumerWidget {
  const _MockNoPeersDialog();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.computer_outlined, size: 48),
          const SizedBox(height: 16),
          Text(l10n.continueDesktopNoPeers),
          const SizedBox(height: 24),
          TextField(
            decoration: InputDecoration(
              hintText: '192.168.1.100:8082',
              labelText: l10n.endpoint,
            ),
          ),
        ],
      ),
    );
  }
}

class _MockErrorDialog extends ConsumerWidget {
  const _MockErrorDialog();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, size: 48, color: Colors.red),
          const SizedBox(height: 16),
          Text(
            l10n.continueDesktopError('Connection failed'),
            style: const TextStyle(color: Colors.red),
          ),
          const SizedBox(height: 24),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              OutlinedButton(onPressed: () {}, child: Text(l10n.cancel)),
              const SizedBox(width: 16),
              ElevatedButton(onPressed: () {}, child: Text(l10n.retry)),
            ],
          ),
        ],
      ),
    );
  }
}
