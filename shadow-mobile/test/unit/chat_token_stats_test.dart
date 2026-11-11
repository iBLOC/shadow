import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';
import 'package:shadow_mobile/tts_engine.dart';

class MockTts extends TtsEngine {
  @override
  Future<void> speak(String text, {String lang = 'zh-CN'}) async {}
}

/// 分多次吐 delta 的端脑 mock —— 造「真的流过」的计时窗。
class StreamingMockClient extends TelencephalonClient {
  StreamingMockClient() : super(baseUrl: 'http://127.0.0.1:60080');

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
    await Future<void>.delayed(const Duration(milliseconds: 5));
    yield StreamEvent(type: 'delta', delta: '你');
    await Future<void>.delayed(const Duration(milliseconds: 5));
    yield StreamEvent(type: 'delta', delta: '好');
    await Future<void>.delayed(const Duration(milliseconds: 5));
    yield StreamEvent(type: 'delta', delta: '呀');
  }
}

void main() {
  // ---- estimateTokens：与桌面端 tokenStats.ts 同一条口径 -------------

  test('estimateTokens 空串 ⇒ 0', () {
    expect(estimateTokens(''), 0);
  });

  test('estimateTokens 纯拉丁 ⇒ ceil(len/4)，至少 1', () {
    expect(estimateTokens('hello'), 2); // ceil(5/4)
    expect(estimateTokens('hello world'), 3); // ceil(11/4)
    expect(estimateTokens('a'), 1);
  });

  test('estimateTokens 纯 CJK ⇒ 每字 1', () {
    expect(estimateTokens('你好世界'), 4);
    expect(estimateTokens('，。'), 2); // CJK 标点（U+3000–U+303F）也按 1 计
    expect(estimateTokens('，'), 1); // 全角逗号（U+FF0C，全角形式段）
  });

  test('estimateTokens 混合 ⇒ CJK 逐字 ＋ 其余 ceil(len/4)', () {
    // '你好' = 2 CJK；' world!' = 7 other ⇒ 2 + ceil(7/4) = 4
    expect(estimateTokens('你好 world!'), 4);
    // emoji 是一个码位（surrogate 对按 rune 数 1）⇒ other 1 ⇒ ceil = 1
    expect(estimateTokens('😀'), 1);
  });

  // ---- computeTokenStats：起算点与除零口径 ---------------------------

  test('computeTokenStats 负窗夹到 0 ⇒ 速度 0（不许出负数速度）', () {
    final start = DateTime(2026, 11, 11, 12, 0, 0);
    final before = start.subtract(const Duration(milliseconds: 50));
    final stats = computeTokenStats('你好', start, before);
    expect(stats.durationMs, 0);
    expect(stats.tokensPerSecond, 0.0);
    expect(stats.tokens, 2);
  });

  test('computeTokenStats 40 tokens / 2s ⇒ 20.0 tok/s', () {
    final start = DateTime(2026, 11, 11, 12, 0, 0);
    final end = start.add(const Duration(seconds: 2));
    final stats = computeTokenStats('汉' * 40, start, end);
    expect(stats.tokens, 40);
    expect(stats.durationMs, 2000);
    expect(stats.tokensPerSecond, 20.0);
  });

  // ---- provider 接线：流完才挂读数 ＋ 时间戳 ---------------------------

  test('generateResponse 流完 ⇒ 助手消息带 token 读数与 createdAt', () async {
    final notifier = ChatNotifier(MockTts(), StreamingMockClient());
    await notifier.generateResponse('问题');
    final messages = notifier.state.messages;
    expect(messages, hasLength(2));
    // 用户气泡：落笔时刻。
    expect(messages[0].createdAt, isNotNull);
    // 助手气泡：读数 + 时刻。
    final stats = messages[1].tokenStats;
    expect(stats, isNotNull);
    expect(stats!.tokens, 3); // '你好呀' = 3 CJK
    expect(stats.durationMs, greaterThan(0));
    expect(stats.tokensPerSecond, greaterThan(0));
    expect(messages[1].createdAt, isNotNull);
  });

  test('没有 delta 就没有读数（不编数字）⇒ 失败路径无 stats', () async {
    // 直接构造「从服务端历史切进来」形状的消息：没有 tokenStats，
    // 界面只显时间 —— 这是模型层的判据，UI 按同一判据裁剪。
    final m = ChatMessageModel('历史回复', ChatRole.assistant);
    expect(m.tokenStats, isNull);
  });
}
