import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';
import 'package:shadow_mobile/tts_engine.dart';

class MockTts extends TtsEngine {
  @override
  Future<void> speak(String text, {String lang = 'zh-CN'}) async {}
}

/// 先失败 N 次、之后成功的端脑 mock —— 用来造「发送失败」的状态。
class FlakyMockClient extends TelencephalonClient {
  int failuresLeft;
  final List<SendMessageRequest> requests = [];

  FlakyMockClient(this.failuresLeft) : super(baseUrl: 'http://127.0.0.1:60080');

  @override
  Future<Conversation> createConversation({
    String? agent,
    String? systemPrompt,
  }) async {
    final now = DateTime.now();
    return Conversation(
      id: 'conv-1',
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
    requests.add(req);
    if (failuresLeft > 0) {
      failuresLeft--;
      throw Exception('boom');
    }
    yield StreamEvent(type: 'delta', delta: '回复');
  }
}

ChatMessageModel user(String t) => ChatMessageModel(t, ChatRole.user);
ChatMessageModel assistant(String t) => ChatMessageModel(t, ChatRole.assistant);
ChatMessageModel system(String t) => ChatMessageModel(t, ChatRole.system);

void main() {
  test('undo 用户消息 ⇒ 它和它引发的回复整段截掉', () {
    final notifier = ChatNotifier(MockTts(), FlakyMockClient(0));
    notifier.state = ChatState(
      messages: [user('问题'), assistant('答'), system('Error: x')],
    );
    notifier.undoMessage(0);
    expect(notifier.state.messages, isEmpty);
  });

  test('undo 助手消息 ⇒ 只删自己，用户消息原样留着', () {
    final notifier = ChatNotifier(MockTts(), FlakyMockClient(0));
    notifier.state = ChatState(messages: [user('问题'), assistant('答')]);
    notifier.undoMessage(1);
    expect(notifier.state.messages, hasLength(1));
    expect(notifier.state.messages.first.role, ChatRole.user);
  });

  test('undo 越界 ⇒ no-op 不崩', () {
    final notifier = ChatNotifier(MockTts(), FlakyMockClient(0));
    notifier.state = ChatState(messages: [user('问题')]);
    notifier.undoMessage(5);
    notifier.undoMessage(-1);
    expect(notifier.state.messages, hasLength(1));
  });

  test('回复流式生成中 ⇒ undo/retry 都是 no-op', () async {
    final client = FlakyMockClient(0);
    final notifier = ChatNotifier(MockTts(), client);
    notifier.state = ChatState(
      messages: [user('问题'), assistant('答')],
      isLoading: true,
    );
    notifier.undoMessage(0);
    await notifier.retryFromUserMessage(0);
    await notifier.retryLastFailure();
    expect(notifier.state.messages, hasLength(2));
    expect(client.requests, isEmpty);
  });

  test('retryFromUserMessage ⇒ 截掉旧的、原文重发', () async {
    final client = FlakyMockClient(0);
    final notifier = ChatNotifier(MockTts(), client);
    notifier.state = ChatState(
      messages: [user('问题一'), assistant('答一'), user('问题二'), assistant('答二')],
    );
    await notifier.retryFromUserMessage(2);
    expect(client.requests, hasLength(1));
    expect(client.requests.first.text, '问题二');
    // 「从这条重来」＝ 它**之前**的历史原样保留，它自己和之后的一切
    // 被重发的那一轮换掉。
    expect(notifier.state.messages, hasLength(4));
    expect(notifier.state.messages[0].content, '问题一');
    expect(notifier.state.messages[1].content, '答一');
    expect(notifier.state.messages[2].content, '问题二');
    expect(notifier.state.messages.map((m) => m.role).toList(), [
      ChatRole.user,
      ChatRole.assistant,
      ChatRole.user,
      ChatRole.assistant,
    ]);
  });

  test('retryAssistantMessage ⇒ 按前面最近的用户消息重发', () async {
    final client = FlakyMockClient(0);
    final notifier = ChatNotifier(MockTts(), client);
    notifier.state = ChatState(
      messages: [user('问题一'), assistant('答一'), user('问题二')],
    );
    await notifier.retryAssistantMessage(1);
    expect(client.requests, hasLength(1));
    expect(client.requests.first.text, '问题一');
    expect(notifier.state.messages.map((m) => m.role).toList(), [
      ChatRole.user,
      ChatRole.assistant,
    ]);
  });

  test('retryLastFailure ⇒ 撤掉失败那轮（含 system 错误气泡）再重发', () async {
    final client = FlakyMockClient(1);
    final notifier = ChatNotifier(MockTts(), client);
    await notifier.generateResponse('第一次的问题');
    // 失败态：用户气泡还在（乐观插入），末尾多了 system 错误气泡。
    expect(client.requests, hasLength(1));
    expect(notifier.state.errorMessage, isNotNull);
    expect(notifier.state.messages.last.role, ChatRole.system);

    await notifier.retryLastFailure();
    expect(client.requests, hasLength(2));
    expect(client.requests.last.text, '第一次的问题');
    expect(notifier.state.errorMessage, isNull);
    // 失败那轮的 system 气泡没了；用户气泡不会重复。
    expect(
      notifier.state.messages.every((m) => m.role != ChatRole.system),
      isTrue,
    );
    expect(
      notifier.state.messages.where((m) => m.role == ChatRole.user).length,
      1,
    );
    expect(notifier.state.messages.last.role, ChatRole.assistant);
  });

  test('切会话失败的闸门关着 ⇒ retryLastFailure 不许绕过', () async {
    final client = FlakyMockClient(0);
    final notifier = ChatNotifier(MockTts(), client);
    notifier.state = ChatState(
      failedSwitchSessionId: 'conv-x',
      messages: [ChatMessageModel('问题', ChatRole.user)],
    );
    await notifier.retryLastFailure();
    expect(client.requests, isEmpty);
  });
}
