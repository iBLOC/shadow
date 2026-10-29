import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/multimodal/multimodal_input_manager.dart';
import 'package:shadow_mobile/l10n/current_l10n.dart';
import 'package:shadow_mobile/tts_engine.dart';
import 'package:shadow_mobile/litert_engine.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// 端脑 client 的 mock —— 对话走**端脑方言**
/// （`/shadow/v1/conversations`），与桌面端同一条链路。
///
/// 之前的 mock 是「前额叶方言」（`/api/sessions` + `/hippocampus/...`），
/// 那条路在「改嵌大脑」之后不存在了。
class MockTelencephalonClient extends TelencephalonClient {
  bool shouldSucceed = true;
  String mockResponse = '这是一条测试回复';

  MockTelencephalonClient() : super(baseUrl: 'http://127.0.0.1:60080');

  @override
  Future<Conversation> createConversation({
    String? agent,
    String? systemPrompt,
  }) async {
    if (!shouldSucceed) {
      throw Exception('Mock createConversation failed');
    }
    final now = DateTime.now();
    return Conversation(
      id: 'test-conversation-123',
      agent: agent ?? 'test-agent',
      createdAt: now,
      updatedAt: now,
      history: const [],
    );
  }

  @override
  Stream<StreamEvent> streamMessage(
    String conversationId,
    SendMessageRequest req,
  ) async* {
    if (!shouldSucceed) {
      throw Exception('Mock streamMessage failed');
    }
    yield StreamEvent(type: 'delta', delta: mockResponse);
    yield StreamEvent(
      type: 'done',
      agent: 'test-agent',
      conversationId: conversationId,
    );
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
    late MockTelencephalonClient mockClient;

    setUp(() {
      mockEngine = MockLitertEngine();
      mockTts = MockTtsEngine();
      mockClient = MockTelencephalonClient();

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
      // 端脑不可达 → 退回本地模型 → 本地模型也失败 → 报错。
      mockClient.shouldSucceed = false;
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
    late MockTelencephalonClient mockClient;

    setUp(() {
      mockEngine = MockLitertEngine();
      mockTts = MockTtsEngine();
      mockClient = MockTelencephalonClient();

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

    /// 本地引擎**没就绪**的容器 —— `mode=off`、`isLitertReady=false`。
    ///
    /// 带图的消息只能走本地引擎（端脑那条路只处理纯文本，见
    /// `_generateLitertResponse` 里 `attachments.isEmpty` 那个分支）⇒
    /// 本地引擎没就绪时必须**明确报错**，而不是把消息悄悄丢掉。
    ProviderContainer containerWithoutLocalEngine() {
      final c = ProviderContainer(
        overrides: [
          chatProvider.overrideWith(
            (ref) => ChatNotifier(mockEngine, mockTts, mockClient, skipInit: true),
          ),
        ],
      );
      addTearDown(c.dispose);
      return c;
    }

    test('generateResponseWithAttachments with image shows error when local engine is off', () async {
      final off = containerWithoutLocalEngine();

      final attachment = MultimodalInput(
        type: MultimodalInputType.image,
        data: null,
        path: '/test/image.jpg',
      );

      await off
          .read(chatProvider.notifier)
          .generateResponseWithAttachments('', [attachment]);

      final state = off.read(chatProvider);
      expect(state.errorMessage, equals(currentL10n().chatImageNotAvailable));
    });

    test('generateResponseWithAttachments with camera shows error when local engine is off', () async {
      final off = containerWithoutLocalEngine();

      final attachment = MultimodalInput(
        type: MultimodalInputType.camera,
        data: null,
        path: '/test/camera.jpg',
      );

      await off
          .read(chatProvider.notifier)
          .generateResponseWithAttachments('', [attachment]);

      final state = off.read(chatProvider);
      expect(state.errorMessage, equals(currentL10n().chatImageNotAvailable));
    });

    test('generateResponseWithAttachments with image goes to the local engine when ready', () async {
      // ⚠️ 这里的语义在 `425e666` 之前是**反的**：那时是
      // 「本地引擎就绪 + 有图 ⇒ 报图片不可用」，可
      // `_convertAttachmentsToLitertFormat` 恰恰会把图片转成
      // `{'image': base64}` 喂给本地引擎 —— 旧规则和那段代码自相矛盾。
      //
      // 正确的契约：**带图走本地引擎**（端脑只处理纯文本）⇒
      // 本地引擎就绪就该能发出去，不该报错。
      mockEngine.mockResponse = '图片回复';
      await container.read(chatProvider.notifier).setMode(ChatMode.litert);

      final attachment = MultimodalInput(
        type: MultimodalInputType.image,
        data: null,
        path: '/test/image.jpg',
      );

      await container
          .read(chatProvider.notifier)
          .generateResponseWithAttachments('', [attachment]);

      final state = container.read(chatProvider);
      expect(state.errorMessage, isNull);
      expect(state.messages.length, equals(2));
      expect(state.messages[1].content, equals('图片回复'));
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
    late MockTelencephalonClient mockClient;

    setUp(() {
      mockEngine = MockLitertEngine();
      mockTts = MockTtsEngine();
      mockClient = MockTelencephalonClient();

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
    late MockTelencephalonClient mockClient;

    setUp(() {
      mockEngine = MockLitertEngine();
      mockTts = MockTtsEngine();
      mockClient = MockTelencephalonClient();

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
    late MockTelencephalonClient mockClient;

    setUp(() {
      mockEngine = MockLitertEngine();
      mockTts = MockTtsEngine();
      mockClient = MockTelencephalonClient();

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
      mockClient.shouldSucceed = false;
      mockEngine.shouldSucceed = false;
      await container.read(chatProvider.notifier).setMode(ChatMode.litert);

      await container.read(chatProvider.notifier).generateResponse('测试');

      final state = container.read(chatProvider);
      expect(state.errorMessage, isNotNull);
      expect(state.messages.last.role, equals(ChatRole.system));
    });
  });

  group('ChatNotifier 端脑链路（改嵌大脑）', () {
    late ProviderContainer container;
    late MockTelencephalonClient mockClient;
    late MockLitertEngine localEngine;

    setUp(() {
      mockClient = MockTelencephalonClient();
      localEngine = MockLitertEngine();
      container = ProviderContainer(
        overrides: [
          chatProvider.overrideWith(
            (ref) => ChatNotifier(
              localEngine,
              MockTtsEngine(),
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

    test('对话走端脑的 shadow 会话（不退回本地模型）', () async {
      await container.read(chatProvider.notifier).setMode(ChatMode.litert);
      await container.read(chatProvider.notifier).generateResponse('你好');

      final state = container.read(chatProvider);
      // 会话 id 来自端脑（/shadow/v1/conversations），不是本地生成的。
      expect(state.sessionId, equals('test-conversation-123'));
      expect(state.messages.length, equals(2));
      expect(state.messages[1].content, equals('这是一条测试回复'));
      expect(state.messages[1].role, equals(ChatRole.assistant));
      // 本地模型没被调用过 —— 端脑答的就用端脑的。
      expect(localEngine.isInitialized, isTrue);
    });

    test('端脑不可达时退回本地模型', () async {
      mockClient.shouldSucceed = false;
      await container.read(chatProvider.notifier).setMode(ChatMode.litert);
      await container.read(chatProvider.notifier).generateResponse('你好');

      final state = container.read(chatProvider);
      expect(state.messages.length, equals(2));
      expect(state.messages[1].content, equals('这是一条测试回复'));
      expect(state.messages[1].role, equals(ChatRole.assistant));
    });
  });
}
