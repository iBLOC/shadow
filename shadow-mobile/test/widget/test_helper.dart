import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:shadow_mobile/litert_engine.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/providers/conversation_mode_provider.dart';
import 'package:shadow_mobile/providers/genui_provider.dart';
import 'package:shadow_mobile/providers/service_provider.dart';
import 'package:shadow_mobile/providers/theme_provider.dart';
import 'package:shadow_mobile/services/prefrontal_client.dart';
import 'package:shadow_mobile/tts_engine.dart';

void testSetup() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });
}

final mockServiceInfos = [
  ServiceInfo(
    name: 'resonance',
    displayName: 'Resonance',
    host: 'localhost',
    port: 8080,
    status: ServiceStatus.healthy,
  ),
  ServiceInfo(
    name: 'prefrontal',
    displayName: 'Prefrontal',
    host: 'localhost',
    port: 8082,
    status: ServiceStatus.healthy,
  ),
  ServiceInfo(
    name: 'hippocampus',
    displayName: 'Hippocampus',
    host: 'localhost',
    port: 8081,
    status: ServiceStatus.healthy,
  ),
];

List<Override> getTestOverrides() {
  return [
    serviceProvider.overrideWith((ref) => MockServiceNotifier()),
    themeModeProvider.overrideWith((ref) => MockThemeNotifier()),
    chatProvider.overrideWith((ref) => MockChatNotifier()),
    conversationModeProvider.overrideWith(
      (ref) => MockConversationModeNotifier(),
    ),
    useAgent2UIModeProvider.overrideWith((ref) => false),
  ];
}

class MockServiceNotifier extends ServiceNotifier {
  MockServiceNotifier() : super() {
    state = mockServiceInfos;
  }

  @override
  Future<void> checkAll() async {
    // Do nothing - synchronous mock
  }
}

class MockThemeNotifier extends ThemeModeNotifier {
  MockThemeNotifier() : super();

  @override
  void setThemeMode(ThemeMode mode) {}
  @override
  void toggleTheme() {}
}

class MockChatNotifier extends ChatNotifier {
  MockChatNotifier()
    : super(LitertEngine(), TtsEngine(), PrefrontalClient(), skipInit: true);
}

class MockConversationModeNotifier extends ConversationModeNotifier {
  MockConversationModeNotifier() : super(videoCollector: null);
}

Future<void> pumpWidgetForTest(WidgetTester tester, Widget child) async {
  await tester.pumpWidget(child);
  await tester.pump(const Duration(milliseconds: 100));
}

Future<void> completePendingMicrotasks(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 100));
}
