import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/multimodal/multimodal_input_manager.dart';
import 'package:shadow_mobile/l10n/current_l10n.dart';
import 'package:shadow_mobile/tts_engine.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// 端脑 client 的 mock —— 对话走**端脑方言**
/// （`/shadow/v1/conversations`），与桌面端同一条链路。
///
/// 之前的 mock 是「前额叶方言」（`/api/sessions` + `/hippocampus/...`），
/// 那条路在「改嵌大脑」之后不存在了。
class MockTelencephalonClient extends TelencephalonClient {
  bool shouldSucceed = true;
  String mockResponse = '这是一条测试回复';

  /// 建了几次会话 —— 用来断言「附件被拒时**根本没到端脑**」。
  int createConversationCalls = 0;
  int streamMessageCalls = 0;

  MockTelencephalonClient() : super(baseUrl: 'http://127.0.0.1:60080');

  @override
  Future<Conversation> createConversation({
    String? agent,
    String? systemPrompt,
  }) async {
    createConversationCalls++;
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
    streamMessageCalls++;
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
  /// 造一个只连端脑的容器。
  ///
  /// 移动端本地 LiteRT 已下线 ⇒ `ChatNotifier` 现在**只有两个依赖**
  /// （TTS + 端脑 client），没有 `skipInit` / `litertReady` 这两个参数了。
  ProviderContainer makeContainer(
    MockTtsEngine tts,
    MockTelencephalonClient client,
  ) {
    final c = ProviderContainer(
      overrides: [
        chatProvider.overrideWith((ref) => ChatNotifier(tts, client)),
      ],
    );
    addTearDown(c.dispose);
    return c;
  }

  group('ChatNotifier Basic Operations', () {
    late MockTtsEngine mockTts;
    late MockTelencephalonClient mockClient;
    late ProviderContainer container;

    setUp(() {
      mockTts = MockTtsEngine();
      mockClient = MockTelencephalonClient();
      container = makeContainer(mockTts, mockClient);
    });

    test('初始状态：没有消息、不在加载、可以发消息', () {
      final state = container.read(chatProvider);
      expect(state.messages, isEmpty);
      expect(state.isLoading, isFalse);
      // `canChat` 现在恒真 —— 本地 LiteRT 下线后没有「引擎没就绪」的前置条件。
      // 以前这里是 `isInitialized || isLitertReady || mode == ChatMode.off`，
      // 两个字段说的都是**本地**引擎 ⇒ 没装本地模型的设备上输入框整个是禁用的。
      expect(state.canChat, isTrue);
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
      expect(mockClient.createConversationCalls, 0);
    });

    test('generateResponse adds user message and assistant response', () async {
      await container.read(chatProvider.notifier).generateResponse('你好');

      final state = container.read(chatProvider);
      expect(state.messages.length, equals(2));
      expect(state.messages[0].content, equals('你好'));
      expect(state.messages[0].role, equals(ChatRole.user));
      expect(state.messages[1].content, equals('这是一条测试回复'));
      expect(state.messages[1].role, equals(ChatRole.assistant));
    });

    test('generateResponse calls TTS with response', () async {
      await container.read(chatProvider.notifier).generateResponse('测试');

      expect(mockTts.speakCalled, isTrue);
      expect(mockTts.lastText, equals('这是一条测试回复'));
    });

    test('端脑不可达时直接报错（不再有本地兜底）', () async {
      // 以前这里是「端脑失败 → 回退本地引擎 → 本地也失败 → 报错」，
      // 而本地引擎**从来没起来过**（`_getModelPath()` 给的是文件路径，
      // Kotlin 那边要的是目录）⇒ 静默回退只是把失败藏起来。
      //
      // 现在端脑不通就是不通，错误**直接**抛给用户。
      mockClient.shouldSucceed = false;

      await container.read(chatProvider.notifier).generateResponse('测试');

      final state = container.read(chatProvider);
      expect(state.messages.length, equals(2));
      expect(state.messages[0].content, equals('测试'));
      expect(state.messages[1].role, equals(ChatRole.system));
      expect(state.errorMessage, isNotNull);
      expect(state.isLoading, isFalse);
      // 端脑答的不能再有本地兜底的第二次机会。
      expect(mockClient.streamMessageCalls, 0);
    });

    test('端脑返回空内容时视为失败', () async {
      mockClient.mockResponse = '';

      await container.read(chatProvider.notifier).generateResponse('测试');

      final state = container.read(chatProvider);
      expect(state.errorMessage, isNotNull);
      expect(state.messages.last.role, equals(ChatRole.system));
    });

    test('reset 清空消息并丢掉端脑会话 id', () async {
      await container.read(chatProvider.notifier).generateResponse('你好');
      expect(container.read(chatProvider).sessionId, isNotNull);

      await container.read(chatProvider.notifier).reset();

      final state = container.read(chatProvider);
      expect(state.messages, isEmpty);
      expect(state.sessionId, isNull);
      expect(state.errorMessage, isNull);
    });
  });

  group('ChatNotifier Attachments', () {
    late MockTtsEngine mockTts;
    late MockTelencephalonClient mockClient;
    late ProviderContainer container;

    setUp(() {
      mockTts = MockTtsEngine();
      mockClient = MockTelencephalonClient();
      container = makeContainer(mockTts, mockClient);
    });

    test('带图片 → 明确报错，且根本没到端脑', () async {
      final attachment = MultimodalInput(
        type: MultimodalInputType.image,
        data: null,
        path: '/test/image.jpg',
      );

      await container
          .read(chatProvider.notifier)
          .generateResponseWithAttachments('', [attachment]);

      final state = container.read(chatProvider);
      expect(state.errorMessage, equals(currentL10n().chatAttachmentNotAvailable));
      expect(state.errorMessageL10nKey, equals(ChatStateL10nKey.errorAttachmentNotAvailable));
      // 附件被拒 ⇒ 连会话都没建，更没发过消息。
      expect(mockClient.createConversationCalls, 0);
      expect(mockClient.streamMessageCalls, 0);
      // 消息**没有**进对话流 —— 用户不会以为它发出去了。
      expect(state.messages, isEmpty);
    });

    test('带相机照片 → 同样明确报错', () async {
      final attachment = MultimodalInput(
        type: MultimodalInputType.camera,
        data: null,
        path: '/test/camera.jpg',
      );

      await container
          .read(chatProvider.notifier)
          .generateResponseWithAttachments('', [attachment]);

      expect(
        container.read(chatProvider).errorMessage,
        equals(currentL10n().chatAttachmentNotAvailable),
      );
    });

    test('带音频 → 同样明确报错（端脑只处理纯文本）', () async {
      final attachment = MultimodalInput(
        type: MultimodalInputType.audio,
        data: Uint8List.fromList([1, 2, 3]),
        path: null,
      );

      await container
          .read(chatProvider.notifier)
          .generateResponseWithAttachments('听语音', [attachment]);

      expect(
        container.read(chatProvider).errorMessage,
        equals(currentL10n().chatAttachmentNotAvailable),
      );
    });

    test('没有附件时照常走端脑', () async {
      await container
          .read(chatProvider.notifier)
          .generateResponseWithAttachments('你好', const []);

      final state = container.read(chatProvider);
      expect(state.errorMessage, isNull);
      expect(state.messages.length, equals(2));
      expect(state.messages[1].content, equals('这是一条测试回复'));
      expect(mockClient.createConversationCalls, 1);
    });

    test('clearAttachments removes all attachments', () {
      container.read(chatProvider.notifier).clearAttachments();

      final state = container.read(chatProvider);
      expect(state.attachments, isEmpty);
    });
  });

  group('ChatNotifier speakLastResponse', () {
    late MockTtsEngine mockTts;
    late MockTelencephalonClient mockClient;
    late ProviderContainer container;

    setUp(() {
      mockTts = MockTtsEngine();
      mockClient = MockTelencephalonClient();
      container = makeContainer(mockTts, mockClient);
    });

    test('speakLastResponse speaks last assistant message', () async {
      await container.read(chatProvider.notifier).generateResponse('测试');

      await container.read(chatProvider.notifier).speakLastResponse();

      expect(mockTts.speakCalled, isTrue);
      expect(mockTts.lastText, equals('这是一条测试回复'));
    });
  });

  group('ChatNotifier playVoiceMessage', () {
    late MockTtsEngine mockTts;
    late MockTelencephalonClient mockClient;
    late ProviderContainer container;

    setUp(() {
      mockTts = MockTtsEngine();
      mockClient = MockTelencephalonClient();
      container = makeContainer(mockTts, mockClient);
    });

    test('playVoiceMessage calls TTS for audio message', () async {
      // 语音消息现在**进不来**（附件一律被拒），所以这里直接注入一条
      // 带 `attachmentType` 的消息，锁住「播放语音消息会念出来」这条契约。
      final notifier = container.read(chatProvider.notifier);
      container.read(chatProvider.notifier); // 触发 provider 初始化
      notifier.state = container.read(chatProvider).copyWith(
        messages: [
          ChatMessageModel(
            '语音内容',
            ChatRole.user,
            attachmentType: MultimodalInputType.audio,
          ),
        ],
      );

      await notifier.playVoiceMessage(0);

      expect(mockTts.speakCalled, isTrue);
      expect(mockTts.lastText, equals('语音内容'));
    });
  });

  group('ChatNotifier message content validation', () {
    late MockTtsEngine mockTts;
    late MockTelencephalonClient mockClient;
    late ProviderContainer container;

    setUp(() {
      mockTts = MockTtsEngine();
      mockClient = MockTelencephalonClient();
      container = makeContainer(mockTts, mockClient);
    });

    test('messages have correct role assignments', () async {
      await container.read(chatProvider.notifier).generateResponse('你好');

      final state = container.read(chatProvider);
      expect(state.messages[0].role, equals(ChatRole.user));
      expect(state.messages[1].role, equals(ChatRole.assistant));
    });

    test('error message is set on generation failure', () async {
      mockClient.shouldSucceed = false;

      await container.read(chatProvider.notifier).generateResponse('测试');

      final state = container.read(chatProvider);
      expect(state.errorMessage, isNotNull);
      expect(state.messages.last.role, equals(ChatRole.system));
    });
  });

  group('ChatNotifier 端脑链路（改嵌大脑）', () {
    late MockTelencephalonClient mockClient;
    late ProviderContainer container;

    setUp(() {
      mockClient = MockTelencephalonClient();
      container = makeContainer(MockTtsEngine(), mockClient);
    });

    test('对话走端脑的 shadow 会话', () async {
      await container.read(chatProvider.notifier).generateResponse('你好');

      final state = container.read(chatProvider);
      // 会话 id 来自端脑（/shadow/v1/conversations），不是本地生成的。
      expect(state.sessionId, equals('test-conversation-123'));
      expect(state.messages.length, equals(2));
      expect(state.messages[1].content, equals('这是一条测试回复'));
      expect(state.messages[1].role, equals(ChatRole.assistant));
    });

    test('同一个会话里连发两条消息只建一次会话', () async {
      final notifier = container.read(chatProvider.notifier);
      await notifier.generateResponse('第一句');
      await notifier.generateResponse('第二句');

      expect(mockClient.createConversationCalls, 1);
      expect(mockClient.streamMessageCalls, 2);
      expect(container.read(chatProvider).messages.length, equals(4));
    });
  });
}
