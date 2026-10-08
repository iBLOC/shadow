import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/flow_provider.dart';
import 'package:shadow_mobile/screens/flows_screen.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

import 'test_helper.dart';

/// Stub notifier — keeps the screen stable so we can assert on layout/copy.
class _StubFlowsNotifier extends FlowsNotifier {
  _StubFlowsNotifier(Ref ref) : super(ref);

  @override
  Future<void> refresh() async {
    // no-op: keep the empty idle state for visual assertions
  }

  @override
  Future<FlowRunResult> runFlow(
    String flowIdOrName,
    Map<String, dynamic> inputs,
  ) async =>
      FlowRunResult(outputs: const {'ok': true});

  @override
  Future<void> promoteDraft(String draftId) async {}
  @override
  Future<void> rejectDraft(String draftId) async {}
}

void main() {
  testSetup();

  Future<void> pumpFlowsScreen(WidgetTester tester) async {
    await pumpWidgetForTest(
      tester,
      ProviderScope(
        overrides: [
          ...getTestOverrides(),
          flowsProvider.overrideWith(_StubFlowsNotifier.new),
        ],
        child: const MaterialApp(
          localizationsDelegates: [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
          ],
          supportedLocales: [Locale('en')],
          locale: Locale('en'),
          home: FlowsScreen(),
        ),
      ),
    );
  }

  testWidgets('renders Telencephalon Flows title (i18n updated)', (tester) async {
    await pumpFlowsScreen(tester);
    // i18n key stays `telencephalonFlows` but the value is now 'Telencephalon Flows'
    await tester.pumpAndSettle();
    expect(find.text('Telencephalon Flows'), findsOneWidget);
  });

  testWidgets('renders Active / Drafts tabs', (tester) async {
    await pumpFlowsScreen(tester);
    expect(find.text('Active'), findsOneWidget);
    expect(find.text('Drafts'), findsOneWidget);
  });

  testWidgets('empty state copy says "registered in telencephalon"', (tester) async {
    await pumpFlowsScreen(tester);
    // Flows are empty in stub; the empty state copy must use the new wording.
    expect(
      find.textContaining('No flows registered in telencephalon'),
      findsOneWidget,
    );
  });

  testWidgets('telencephalonFlows i18n key resolves to new telencephalon value (zh)',
      (tester) async {
    await pumpWidgetForTest(
      tester,
      ProviderScope(
        overrides: [
          ...getTestOverrides(),
          flowsProvider.overrideWith(_StubFlowsNotifier.new),
        ],
        child: const MaterialApp(
          localizationsDelegates: [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
          ],
          supportedLocales: [Locale('en'), Locale('zh')],
          locale: Locale('zh'),
          home: FlowsScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('端脑流程'), findsOneWidget);
  });
}