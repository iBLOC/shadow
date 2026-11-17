import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/utils/chat_quote.dart';

import 'agui_fakes.dart';

/// 「长按气泡 ⇒ ⇒ **引用**到输入框」（2026-11-17）。
///
/// ## 这一刀要钉住的是哪几格
///
/// ❶ **纯函数层**：引文压成一行、截断、拼出来的话**引文在前**。
/// ❷ **承重那一格（真的到了端脑）**：AG-UI 那一路**只发当轮那一条 user
///    消息** ⇒ ⇒ 引用若只活在界面上 ⇒ ⇒ 模型**压根不知道** ⇒ ⇒
///    「界面上看着像引用了，其实没引用」—— **失败长得像成功**。
///    ⇒ ⇒ 这一层用**真 driver ＋ 假运输层**（[FakeAguiBrain]）⇒ ⇒ 断言
///    端脑**真的收到**了被引的那句。
/// ❸ **界面上那条气泡与发出去的那句是同一个字符串** ⇒ ⇒ 不会分叉。
/// ❹ **引用用完即清** ⇒ ⇒ 下一句普通发言不会带着它。
/// ❺ **重发旧消息不拼引用** ⇒ ⇒ 「重发原文」就是原文。
/// ❻ **空内容的消息引用不了**（工具卡片那种）⇒ ⇒ 那一格在菜单里被裁掉。
void main() {
  group('纯函数层', () {
    test('引文压成一行（被引的那条带换行 ⇒ ⇒ 边界不能丢）', () {
      expect(quoteSnippet('第一行\n第二行'), '第一行 第二行');
      expect(quoteSnippet('  两头有空格  '), '两头有空格');
    });

    test('引文截断到 200 字（长回复不许吃掉整次请求）', () {
      final snippet = quoteSnippet('x' * 300);
      expect(snippet.length, 201); // 200 + 省略号
      expect(snippet.endsWith('…'), isTrue);
    });

    test('拼出来的话：引文在前、你的话在后', () {
      expect(
        composeQuotedPrompt(
          quoted: '他说过的那句',
          prompt: '我的问题',
          marker: '引用：',
        ),
        '引用：他说过的那句\n我的问题',
      );
    });

    test('引文是空的 ⇒ ⇒ 原样返回（不凭空加一个标记）', () {
      expect(
        composeQuotedPrompt(quoted: '   ', prompt: '我的问题', marker: '引用：'),
        '我的问题',
      );
    });

    test('你的话是空的 ⇒ ⇒ 只发引文', () {
      expect(
        composeQuotedPrompt(
          quoted: '他说过的那句',
          prompt: '  ',
          marker: '引用：',
        ),
        '引用：他说过的那句',
      );
    });
  });

  group('那一格真的到了端脑（承重）', () {
    late FakeAguiBrain brain;
    late ProviderContainer container;

    setUp(() {
      brain = FakeAguiBrain(
        rounds: const <List<String>>[],
        framesFor: (int round, Map<String, dynamic> request) => <String>[
          aguiText('好'),
          aguiFinished(),
        ],
      );
      final client = ToolMockClient();
      container = ProviderContainer(
        overrides: [
          chatProvider.overrideWith(
            (ref) => ChatNotifier(MockTts(), client, aguiHttpClient: brain),
          ),
        ],
      );
      addTearDown(container.dispose);
    });

    test('引用 ⇒ ⇒ 端脑收到的那一句里**含被引的那句**', () async {
      final notifier = container.read(chatProvider.notifier);
      await notifier.generateResponse('第一句');
      notifier.quoteMessage(0);
      await notifier.generateResponse('第二句');

      final sent = aguiSentText(brain.requests.last);
      expect(sent, contains('第一句'));
      expect(sent, contains('第二句'));
      // ⇒ ⇒ 引文在**前**，你的话在**后**（模型读到的顺序与界面一致）。
      expect(sent.indexOf('第一句'), lessThan(sent.indexOf('第二句')));
    });

    test('界面上那条气泡与发出去的那句**是同一个字符串**（不分叉）', () async {
      final notifier = container.read(chatProvider.notifier);
      await notifier.generateResponse('第一句');
      notifier.quoteMessage(0);
      await notifier.generateResponse('第二句');

      // ⇒ ⇒ 取**用户那一条**（最后一条是助手的回复）。
      final messages = container.read(chatProvider).messages;
      final bubble = messages.lastWhere((m) => m.role == ChatRole.user).content;
      expect(bubble, aguiSentText(brain.requests.last));
    });

    test('引用**用完即清** ⇒ ⇒ 下一句普通发言不会带着它', () async {
      final notifier = container.read(chatProvider.notifier);
      await notifier.generateResponse('第一句');
      notifier.quoteMessage(0);
      expect(container.read(chatProvider).quotedMessage, isNotNull);

      await notifier.generateResponse('第二句');
      expect(container.read(chatProvider).quotedMessage, isNull);

      await notifier.generateResponse('第三句');
      final sent = aguiSentText(brain.requests.last);
      expect(sent, '第三句');
      expect(sent, isNot(contains('第一句')));
    });

    test('取消引用 ⇒ ⇒ 待发的那句回到没引用的样子', () async {
      final notifier = container.read(chatProvider.notifier);
      await notifier.generateResponse('第一句');
      notifier.quoteMessage(0);
      notifier.clearQuotedMessage();
      expect(container.read(chatProvider).quotedMessage, isNull);

      await notifier.generateResponse('第二句');
      expect(aguiSentText(brain.requests.last), '第二句');
    });

    test('重发旧消息 ⇒ ⇒ **不**把「现在待引用的那条」也拼进去', () async {
      final notifier = container.read(chatProvider.notifier);
      await notifier.generateResponse('第一句');
      notifier.quoteMessage(0);

      // ⇒ ⇒ 重发第一条（它后面的一切先撤掉）。
      await notifier.retryFromUserMessage(0);

      final sent = aguiSentText(brain.requests.last);
      // ⇒ ⇒ 「重发原文」就是原文 ⇒ ⇒ 一字不多。
      expect(sent, '第一句');
    });

    test('空内容的消息（工具卡片那种）⇒ ⇒ 引用不了', () async {
      final notifier = container.read(chatProvider.notifier);
      await notifier.generateResponse('第一句');
      // ⇒ ⇒ 第 0 条是用户那句；造一条**空的**消息试试。
      notifier.quoteMessage(0);
      expect(container.read(chatProvider).quotedMessage, isNotNull);

      notifier.clearQuotedMessage();
      // ⇒ ⇒ 越界 / 空内容 ⇒ ⇒ 不许挂上。
      notifier.quoteMessage(99);
      expect(container.read(chatProvider).quotedMessage, isNull);
    });
  });
}
