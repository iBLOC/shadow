import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/multimodal/multimodal_input_manager.dart';
import 'package:shadow_mobile/l10n/current_l10n.dart';
import 'package:shadow_mobile/tts_engine.dart';
import 'package:shadow_mobile/litert_engine.dart';
import 'package:shadow_mobile/services/prefrontal_client.dart';

class MockPrefrontalClient extends PrefrontalClient {
  bool shouldSucceed = true;

  MockPrefrontalClient() : super(baseUrl: 'http://localhost:8082');

  @override
  Future<SessionResponse> createSession({String? name}) async {
    return SessionResponse(
      id: 'test-session-123',
      name: name,
      createdAt: DateTime.now(),
    );
  }

  @override
  Future<bool> addSessionMessage({
    required String sessionId,
    required String role,
    required String content,
  }) async {
    return true;
  }

  @override
  Future<ProcessResponse> processMessage({
    required String sessionId,
    required String message,
    bool useTools = false,
  }) async {
    if (!shouldSucceed) {
      throw Exception('Mock processMessage failed');
    }
    return ProcessResponse(response: '这是一条测试回复');
  }
}

class MockLitertEngine extends LitertEngine {
  bool shouldSucceed = true;
  String mockResponse = '这是一条测试回复';

  @override
  bool get isInitialized => true;

  @override
  Future<String> generateContent(String prompt) async {
    if (!shouldSucceed) {
      throw Exception('Mock generation failed');
    }
    return mockResponse;
  }

  @override
  Future<String> generateContentWithAttachments(
    String prompt,
    List<Map<String, dynamic>> attachments,
  ) async {
    if (!shouldSucceed) {
      throw Exception('Mock generation with attachments failed');
    }
    return mockResponse;
  }
}

class MockTtsEngine extends TtsEngine {
  bool speakCalled = false;
  String? lastText;

  @override
  Future<void> speak(String text, {String lang = 'zh-CN'}) async {
    speakCalled = true;
    lastText = text;
  }
}

void main() {
  group('ChatNotifier Basic Operations', () {
    late ProviderContainer container;
    late MockLitertEngine mockEngine;
    late MockTtsEngine mockTts;

    setUp(() {
      mockEngine = MockLitertEngine();
      mockTts = MockTtsEngine();
      final mockClient = MockPrefrontalClient();

      container = ProviderContainer(
        overrides: [
          chatProvider.overrideWith(
            (ref) => ChatNotifier(
              mockEngine,
              mockTts,
              mockClient,
              skipInit: true,
              litertReady: true,
            ),
          ),
        ],
      );
    });

    tearDown(() {
      container.dispose();
    });

    test('initial state has litertReady set from parameter', () {
      final state = container.read(chatProvider);
      expect(state.messages, isEmpty);
      expect(state.isLoading, isFalse);
      expect(state.isInitialized, isFalse);
      expect(state.isLitertReady, isTrue);
      expect(state.mode, equals(ChatMode.off));
    });

    test('sendGreeting adds greeting message', () {
      container.read(chatProvider.notifier).sendGreeting();
      final state = container.read(chatProvider);
      expect(state.messages.length, equals(1));
      expect(state.messages.first.content, equals(currentL10n().chatGreeting));
      expect(state.messages.first.role, equals(ChatRole.assistant));
    });

    test('generateResponse with empty prompt returns early', () async {
      await container.read(chatProvider.notifier).generateResponse('');
      final state = container.read(chatProvider);
      expect(state.messages, isEmpty);
    });

    test('generateResponse adds user message and assistant response', () async {
      container.read(chatProvider.notifier).setMode(ChatMode.litert);

      await container.read(chatProvider.notifier).generateResponse('你好');

      final state = container.read(chatProvider);
      expect(state.messages.length, equals(2));
      expect(state.messages[0].content, equals('你好'));
      expect(state.messages[0].role, equals(ChatRole.user));
      expect(state.messages[1].content, equals('这是一条测试回复'));
      expect(state.messages[1].role, equals(ChatRole.assistant));
    });

    test('generateResponse calls TTS with response', () async {
      container.read(chatProvider.notifier).setMode(ChatMode.litert);

      await container.read(chatProvider.notifier).generateResponse('测试');

      expect(mockTts.speakCalled, isTrue);
      expect(mockTts.lastText, equals('这是一条测试回复'));
    });

    test('generateResponse handles error gracefully', () async {
      mockEngine.shouldSucceed = false;
      container.read(chatProvider.notifier).setMode(ChatMode.litert);

      await container.read(chatProvider.notifier).generateResponse('测试');

      final state = container.read(chatProvider);
      expect(state.messages.length, equals(2));
      expect(state.messages[0].content, equals('测试'));
      expect(state.messages[1].role, equals(ChatRole.system));
      expect(state.errorMessage, isNotNull);
    });

    test('setMode changes chat mode', () async {
      await container.read(chatProvider.notifier).setMode(ChatMode.litert);
      expect(container.read(chatProvider).mode, equals(ChatMode.litert));
    });
  });

  group('ChatNotifier Attachments', () {
    late ProviderContainer container;
    late MockLitertEngine mockEngine;
    late MockTtsEngine mockTts;

    setUp(() {
      mockEngine = MockLitertEngine();
      mockTts = MockTtsEngine();
      final mockClient = MockPrefrontalClient();

      container = ProviderContainer(
        overrides: [
          chatProvider.overrideWith(
            (ref) => ChatNotifier(
              mockEngine,
              mockTts,
              mockClient,
              skipInit: true,
              litertReady: true,
            ),
          ),
        ],
      );
    });

    tearDown(() {
      container.dispose();
    });

    test('generateResponseWithAttachments with image shows error', () async {
      await container.read(chatProvider.notifier).setMode(ChatMode.litert);

      final attachment = MultimodalInput(
        type: MultimodalInputType.image,
        data: null,
        path: '/test/image.jpg',
      );

      container.read(chatProvider.notifier).generateResponseWithAttachments(
        '',
        [attachment],
      );

      final state = container.read(chatProvider);
      expect(state.errorMessage, equals(currentL10n().chatImageNotAvailable));
    });

    test('generateResponseWithAttachments with camera shows error', () async {
      await container.read(chatProvider.notifier).setMode(ChatMode.litert);

      final attachment = MultimodalInput(
        type: MultimodalInputType.camera,
        data: null,
        path: '/test/camera.jpg',
      );

      container.read(chatProvider.notifier).generateResponseWithAttachments(
        '',
        [attachment],
      );

      final state = container.read(chatProvider);
      expect(state.errorMessage, equals(currentL10n().chatImageNotAvailable));
    });

    test('generateResponseWithAttachments with audio works', () async {
      mockEngine.mockResponse = '音频回复';
      await container.read(chatProvider.notifier).setMode(ChatMode.litert);

      final attachment = MultimodalInput(
        type: MultimodalInputType.audio,
        data: Uint8List.fromList([1, 2, 3]),
        path: null,
      );

      await container
          .read(chatProvider.notifier)
          .generateResponseWithAttachments('听语音', [attachment]);

      final state = container.read(chatProvider);
      expect(state.messages.length, equals(2));
      expect(state.messages[1].content, equals('音频回复'));
    });

    test('clearAttachments removes all attachments', () {
      container.read(chatProvider.notifier).clearAttachments();

      final state = container.read(chatProvider);
      expect(state.attachments, isEmpty);
    });
  });

  group('ChatNotifier speakLastResponse', () {
    late ProviderContainer container;
    late MockLitertEngine mockEngine;
    late MockTtsEngine mockTts;

    setUp(() {
      mockEngine = MockLitertEngine();
      mockTts = MockTtsEngine();
      final mockClient = MockPrefrontalClient();

      container = ProviderContainer(
        overrides: [
          chatProvider.overrideWith(
            (ref) => ChatNotifier(
              mockEngine,
              mockTts,
              mockClient,
              skipInit: true,
              litertReady: true,
            ),
          ),
        ],
      );
    });

    tearDown(() {
      container.dispose();
    });

    test('speakLastResponse speaks last assistant message', () async {
      await container.read(chatProvider.notifier).setMode(ChatMode.litert);
      await container.read(chatProvider.notifier).generateResponse('测试');

      await container.read(chatProvider.notifier).speakLastResponse();

      expect(mockTts.speakCalled, isTrue);
      expect(mockTts.lastText, equals('这是一条测试回复'));
    });
  });

  group('ChatNotifier playVoiceMessage', () {
    late ProviderContainer container;
    late MockLitertEngine mockEngine;
    late MockTtsEngine mockTts;

    setUp(() {
      mockEngine = MockLitertEngine();
      mockTts = MockTtsEngine();
      final mockClient = MockPrefrontalClient();

      container = ProviderContainer(
        overrides: [
          chatProvider.overrideWith(
            (ref) => ChatNotifier(
              mockEngine,
              mockTts,
              mockClient,
              skipInit: true,
              litertReady: true,
            ),
          ),
        ],
      );
    });

    tearDown(() {
      container.dispose();
    });

    test('playVoiceMessage calls TTS for audio message', () async {
      await container.read(chatProvider.notifier).setMode(ChatMode.litert);

      final attachment = MultimodalInput(
        type: MultimodalInputType.audio,
        data: null,
        path: '/test/audio.pcm',
      );

      await container
          .read(chatProvider.notifier)
          .generateResponseWithAttachments('听语音', [attachment]);

      mockTts.speakCalled = false;
      await container.read(chatProvider.notifier).playVoiceMessage(0);

      expect(mockTts.speakCalled, isTrue);
    });
  });

  group('ChatNotifier message content validation', () {
    late ProviderContainer container;
    late MockLitertEngine mockEngine;
    late MockTtsEngine mockTts;

    setUp(() {
      mockEngine = MockLitertEngine();
      mockTts = MockTtsEngine();
      final mockClient = MockPrefrontalClient();

      container = ProviderContainer(
        overrides: [
          chatProvider.overrideWith(
            (ref) => ChatNotifier(
              mockEngine,
              mockTts,
              mockClient,
              skipInit: true,
              litertReady: true,
            ),
          ),
        ],
      );
    });

    tearDown(() {
      container.dispose();
    });

    test('messages have correct role assignments', () async {
      await container.read(chatProvider.notifier).setMode(ChatMode.litert);
      await container.read(chatProvider.notifier).generateResponse('你好');

      final state = container.read(chatProvider);
      expect(state.messages[0].role, equals(ChatRole.user));
      expect(state.messages[1].role, equals(ChatRole.assistant));
    });

    test('error message is set on generation failure', () async {
      mockEngine.shouldSucceed = false;
      await container.read(chatProvider.notifier).setMode(ChatMode.litert);

      await container.read(chatProvider.notifier).generateResponse('测试');

      final state = container.read(chatProvider);
      expect(state.errorMessage, isNotNull);
      expect(state.messages.last.role, equals(ChatRole.system));
    });
  });
}
