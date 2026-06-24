import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadow_mobile/screens/group_screen.dart'
    hide groupServiceProvider;
import 'package:shadow_mobile/services/group_service.dart';
import 'test_helper.dart';

class MockGroupServiceNotifier extends GroupServiceNotifier {
  MockGroupServiceNotifier()
    : super(
        service: GroupService(),
        deviceName: 'Test Device',
        pubkey: 'test-pubkey',
      );

  @override
  Future<void> createGroup(String pin) async {
    state = const GroupServiceState(state: GroupState.creating);
    await Future.delayed(const Duration(milliseconds: 100));
    state = const GroupServiceState(state: GroupState.idle);
  }

  @override
  Future<void> joinGroup(String pin) async {
    state = const GroupServiceState(state: GroupState.joining);
    await Future.delayed(const Duration(milliseconds: 100));
    state = const GroupServiceState(state: GroupState.idle);
  }

  @override
  Future<void> leaveGroup() async {
    state = const GroupServiceState(state: GroupState.idle);
  }

  @override
  Future<void> refreshMembers() async {}
}

void main() {
  testSetup();

  group('GroupScreen Widget Tests', () {
    testWidgets('renders scaffold with app bar', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            groupServiceProvider.overrideWith(
              (ref) => MockGroupServiceNotifier(),
            ),
          ],
          child: const MaterialApp(home: GroupScreen()),
        ),
      );

      expect(find.byType(Scaffold), findsOneWidget);
      expect(find.byType(AppBar), findsOneWidget);
    });

    testWidgets('shows Group title in app bar', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            groupServiceProvider.overrideWith(
              (ref) => MockGroupServiceNotifier(),
            ),
          ],
          child: const MaterialApp(home: GroupScreen()),
        ),
      );

      expect(find.text('Group'), findsOneWidget);
    });

    testWidgets('shows idle state with join/create buttons', (
      WidgetTester tester,
    ) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            groupServiceProvider.overrideWith(
              (ref) => MockGroupServiceNotifier(),
            ),
          ],
          child: const MaterialApp(home: GroupScreen()),
        ),
      );

      expect(find.text('Join or Create a Group'), findsOneWidget);
      expect(find.text('Join'), findsOneWidget);
      expect(find.text('Create'), findsOneWidget);
      expect(find.byIcon(Icons.login), findsOneWidget);
      expect(find.byIcon(Icons.add), findsOneWidget);
    });

    testWidgets('shows PIN input field', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            groupServiceProvider.overrideWith(
              (ref) => MockGroupServiceNotifier(),
            ),
          ],
          child: const MaterialApp(home: GroupScreen()),
        ),
      );

      expect(find.byType(TextField), findsOneWidget);
      expect(find.text('PIN Code'), findsOneWidget);
    });

    testWidgets('shows 6-digit PIN input', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            groupServiceProvider.overrideWith(
              (ref) => MockGroupServiceNotifier(),
            ),
          ],
          child: const MaterialApp(home: GroupScreen()),
        ),
      );

      final textField = find.byType(TextField);
      expect(textField, findsOneWidget);
      final TextField widget = tester.widget(textField);
      expect(widget.keyboardType, TextInputType.number);
    });

    testWidgets('shows group icon when idle', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            groupServiceProvider.overrideWith(
              (ref) => MockGroupServiceNotifier(),
            ),
          ],
          child: const MaterialApp(home: GroupScreen()),
        ),
      );

      expect(find.byIcon(Icons.group), findsOneWidget);
    });

    testWidgets('shows PIN code instructions', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            groupServiceProvider.overrideWith(
              (ref) => MockGroupServiceNotifier(),
            ),
          ],
          child: const MaterialApp(home: GroupScreen()),
        ),
      );

      expect(
        find.text('Enter 6-digit PIN to join existing group or create new one'),
        findsOneWidget,
      );
    });

    testWidgets('join and create buttons are side by side', (
      WidgetTester tester,
    ) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            groupServiceProvider.overrideWith(
              (ref) => MockGroupServiceNotifier(),
            ),
          ],
          child: const MaterialApp(home: GroupScreen()),
        ),
      );

      final joinButton = find.widgetWithText(OutlinedButton, 'Join');
      final createButton = find.widgetWithText(FilledButton, 'Create');
      expect(joinButton, findsOneWidget);
      expect(createButton, findsOneWidget);
    });

    testWidgets('can enter PIN code', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            groupServiceProvider.overrideWith(
              (ref) => MockGroupServiceNotifier(),
            ),
          ],
          child: const MaterialApp(home: GroupScreen()),
        ),
      );

      final textField = find.byType(TextField);
      expect(textField, findsOneWidget);

      await tester.enterText(textField, '123456');
      await tester.pumpAndSettle();

      expect(find.text('123456'), findsOneWidget);
    });

    testWidgets('can tap Join button', (WidgetTester tester) async {
      await pumpWidgetForTest(
        tester,
        ProviderScope(
          overrides: [
            ...getTestOverrides(),
            groupServiceProvider.overrideWith(
              (ref) => MockGroupServiceNotifier(),
            ),
          ],
          child: const MaterialApp(home: GroupScreen()),
        ),
      );

      final joinButton = find.widgetWithText(OutlinedButton, 'Join');
      expect(joinButton, findsOneWidget);

      await tester.tap(joinButton);
      await tester.pumpAndSettle();

      expect(find.text('Join'), findsOneWidget);
    });
  });
}
