import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/multimodal/attachment_encoder.dart';
import 'package:shadow_mobile/multimodal/multimodal_input_manager.dart';
import 'package:shadow_mobile/l10n/current_l10n.dart';
import 'package:shadow_mobile/tts_engine.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

import 'agui_fakes.dart';

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

  /// AG-UI 那一面的**假端脑**。
  ///
  /// ⚠️ **只假运输层** —— driver／SSE 解析／协议归约／provider 的执行器
  /// **全都是真的** ⇒ ⇒ 判据钉的是**生产那一路**（与桌面端 `fetchImpl`
  /// 假法同口径）。
  ///
  /// ⚠️ **为什么回复内容是「按需算」的**：「空回复＝失败」那一档必须能测
  /// ⇒ ⇒ 内容必须在**发请求那一刻**才读（写死在这里就测不出来）。
  late final FakeAguiBrain brain = FakeAguiBrain(
    rounds: const <List<String>>[],
    framesFor: (int round, Map<String, dynamic> request) => <String>[
      if (mockResponse.isNotEmpty) aguiText(mockResponse),
      aguiFinished(),
    ],
  );

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

  // ⚠️ **legacy 的 `streamMessage` 不再被调用** —— 生产那一路已经换成
  // AG-UI（`ag-ui:stream`）⇒ ⇒ 这里**只假运输层**（[brain]）⇒ ⇒ 真
  // driver／真协议归约／真执行器**全在**。
}

class MockTtsEngine extends TtsEngine {
  bool speakCalled = false;
  String? lastText;

  @override
  Future<TtsSpeakResult> speak(String text, {String lang = 'zh-CN', bool allowFallback = true, String? lobe}) async {
    speakCalled = true;
    lastText = text;
    return const TtsSpeakResult.spoke();
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
        chatProvider.overrideWith(
          (ref) => ChatNotifier(tts, client, aguiHttpClient: client.brain),
        ),
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
      expect(mockClient.brain.roundCount, 0);
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

    test('带图片 → 真的发到端脑，请求体里带着那张图', () async {
      // ⚠️ **这一格的口径变过两次**（2026-11-16）。
      //
      // 第一次：「带图片 ⇒ 明确报错，且根本没到端脑」⇒ ⇒ 钉的是「端脑链路
      // 只处理纯文本」⇒ ⇒ 而那句话**现在是假的**（图片已经能发了）⇒ ⇒
      // 同一个意图（「不许静默丢附件」）**换一条更狠的钉法**：以前「没到
      // 端脑」就能证明「没丢」（因为压根没发）⇒ ⇒ 现在图**真的发了** ⇒ ⇒
      // 「没丢」必须由**请求体里那张图**来证明。
      final dir = await Directory.systemTemp.createTemp('shadow-img-');
      addTearDown(() => dir.delete(recursive: true));
      final file = File('${dir.path}/IMG_1.jpg');
      final bytes = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4]);
      await file.writeAsBytes(bytes);

      final attachment = MultimodalInput(
        type: MultimodalInputType.image,
        data: file,
        path: file.path,
      );

      await container
          .read(chatProvider.notifier)
          .generateResponseWithAttachments('这是什么', [attachment]);

      final state = container.read(chatProvider);
      expect(state.errorMessage, isNull);
      // 图**真的**发出去了。
      expect(mockClient.brain.roundCount, 1);
      // ⚠️ **这里抓到的就是「真正发出去的那个形状」** —— 假端脑是从**请求体
      // 的字节**里解出来的 ⇒ ⇒ 比 legacy 那个「请求对象」还靠下一层
      // ⇒ ⇒ 变异掉 `toJson`／附件映射**当场红**。
      final request = mockClient.brain.requests.single;
      final parts = aguiAttachmentParts(request);
      expect(parts, hasLength(1), reason: 'the request must carry the image');
      // ⚠️ **键名是接缝**：AG-UI 用 **mimeType**（驼峰），不是 legacy 的
      // media_type ⇒ ⇒ 照抄键名 ⇒ ⇒ 端脑按错类型处理（把 PDF 当纯文本
      // 解 ⇒ ⇒ 乱码）⇒ ⇒ **失败长得像成功**。
      expect(aguiAttachmentMimeType(request), 'image/jpeg');
      final source = parts.first['source'] as Map<String, dynamic>;
      // base64 必须与文件字节**逐字**一致 ⇒ ⇒ 不能是空串、不能是文件名。
      expect(source['value'], base64Encode(bytes));
      // 消息**真的**进了对话流 ⇒ ⇒ 用户不会以为它发出去了却没发。
      expect(state.messages.length, 2);
      // 候选行清空 ⇒ ⇒ 用户再点一次发送不会把同一张图**再发一遍**。
      expect(state.attachments, isEmpty);
    });

    test('带**文本文件** → 也能真发（全类型那一刀的重点）', () async {
      final dir = await Directory.systemTemp.createTemp('shadow-txt-');
      addTearDown(() => dir.delete(recursive: true));
      final file = File('${dir.path}/note.txt');
      final bytes = Uint8List.fromList('hello world'.codeUnits);
      await file.writeAsBytes(bytes);

      await container.read(chatProvider.notifier).generateResponseWithAttachments(
        '读一下',
        [
          MultimodalInput(
            type: MultimodalInputType.file,
            data: file,
            path: file.path,
          ),
        ],
      );

      final state = container.read(chatProvider);
      expect(state.errorMessage, isNull);
      expect(mockClient.brain.roundCount, 1);
      final request = mockClient.brain.requests.single;
      final parts = aguiAttachmentParts(request);
      expect(parts, hasLength(1));
      expect(aguiAttachmentMimeType(request), 'text/plain');
      final source = parts.first['source'] as Map<String, dynamic>;
      expect(source['value'], base64Encode(bytes));
      // ⚠️ **文件名在 AG-UI 这一路丢了** —— part 只有
      // `{type, source:{type,value,mimeType}}` ⇒ ⇒ 没有 filename 那一格
      // ⇒ ⇒ **桌面端同样丢**（两端同口径）⇒ ⇒ 这里**不钉**文件名
      // ⇒ ⇒ 缺口记在台账里，不许当成「钉住了」。
    });

    test('带 **PDF** → 也能真发', () async {
      final dir = await Directory.systemTemp.createTemp('shadow-pdf-');
      addTearDown(() => dir.delete(recursive: true));
      final file = File('${dir.path}/doc.pdf');
      await file.writeAsBytes(Uint8List.fromList([1, 2, 3, 4]));

      await container.read(chatProvider.notifier).generateResponseWithAttachments(
        '总结一下',
        [
          MultimodalInput(
            type: MultimodalInputType.file,
            data: file,
            path: file.path,
          ),
        ],
      );

      final state = container.read(chatProvider);
      expect(state.errorMessage, isNull);
      final request = mockClient.brain.requests.single;
      final parts = aguiAttachmentParts(request);
      expect(parts, hasLength(1));
      expect(aguiAttachmentMimeType(request), 'application/pdf');
      // ⚠️ 文件名同样丢了（见上面那一格）⇒ ⇒ 这里只钉 MIME。
    });

    test('**这一档还没接**（视频）→ 明确报错说清原因，且根本没到端脑', () async {
      final dir = await Directory.systemTemp.createTemp('shadow-vid-');
      addTearDown(() => dir.delete(recursive: true));
      final file = File('${dir.path}/v.mp4');
      await file.writeAsBytes(Uint8List.fromList([1, 2, 3, 4]));

      await container.read(chatProvider.notifier).generateResponseWithAttachments(
        '',
        [
          MultimodalInput(
            type: MultimodalInputType.video,
            data: file,
            path: file.path,
          ),
        ],
      );

      final state = container.read(chatProvider);
      expect(
        state.errorMessageL10nKey,
        equals(ChatStateL10nKey.errorAttachmentFailed),
      );
      // ⚠️ **原因要说清是「这一类还没接」** ⇒ ⇒ 不是「你配得不对」⇒ ⇒
      // 用户去换模型**也没用** ⇒ ⇒ 不能让他白折腾。
      expect(state.errorMessage, contains('unsupported'));
      expect(mockClient.brain.roundCount, 0);
      expect(state.messages, isEmpty);
    });

    test('格式不认识 → 明确报错，且根本没到端脑', () async {
      final dir = await Directory.systemTemp.createTemp('shadow-img-');
      addTearDown(() => dir.delete(recursive: true));
      // ⚠️ 扩展名不在那张表里 ⇒ ⇒ 端脑那边没有「认这个格式」的办法
      // ⇒ ⇒ 必须在**发出去之前**就说清楚 ⇒ ⇒ 绝不许把一段未知字节
      // 假装成能发的东西发出去。
      final file = File('${dir.path}/IMG_1.heic');
      await file.writeAsBytes(Uint8List.fromList([1, 2, 3, 4]));

      final attachment = MultimodalInput(
        type: MultimodalInputType.image,
        data: file,
        path: file.path,
      );

      await container
          .read(chatProvider.notifier)
          .generateResponseWithAttachments('这是什么', [attachment]);

      final state = container.read(chatProvider);
      expect(
        state.errorMessageL10nKey,
        equals(ChatStateL10nKey.errorAttachmentFailed),
      );
      expect(state.errorMessage, contains('unsupported'));
      expect(mockClient.brain.roundCount, 0);
      expect(state.messages, isEmpty);
    });

    test('附件读不出 → 明确报错，且根本没到端脑', () async {
      final attachment = MultimodalInput(
        type: MultimodalInputType.image,
        data: File('/definitely/not/here/IMG_1.jpg'),
        path: '/definitely/not/here/IMG_1.jpg',
      );

      await container
          .read(chatProvider.notifier)
          .generateResponseWithAttachments('这是什么', [attachment]);

      final state = container.read(chatProvider);
      expect(
        state.errorMessageL10nKey,
        equals(ChatStateL10nKey.errorAttachmentFailed),
      );
      expect(mockClient.brain.roundCount, 0);
    });

    test('带**相机照片** → 现在也能真发（它就是一张图片）', () async {
      // ⚠️ **这一格的口径也变了**：以前「带相机照片 ⇒ 明确报错」⇒ ⇒ 钉的
      // 是「端脑只处理纯文本」⇒ ⇒ 现在图片能发了 ⇒ ⇒ **相机照片当然也能
      // 发**（它落进同一个 image 档）⇒ ⇒ 判据不改就会红，而它红的原因不是
      // 代码坏了，是**它钉的那个世界变了**。
      final dir = await Directory.systemTemp.createTemp('shadow-cam-');
      addTearDown(() => dir.delete(recursive: true));
      final file = File('${dir.path}/IMG_9.jpg');
      await file.writeAsBytes(Uint8List.fromList([1, 2, 3, 4]));

      await container.read(chatProvider.notifier).generateResponseWithAttachments(
        '这是什么',
        [
          MultimodalInput(
            type: MultimodalInputType.camera,
            data: file,
            path: file.path,
          ),
        ],
      );

      expect(container.read(chatProvider).errorMessage, isNull);
      expect(mockClient.brain.roundCount, 1);
      expect(aguiAttachmentMimeType(mockClient.brain.requests.single),
          'image/jpeg');
    });

    test('附件数超了 → 明确报错，且根本没到端脑', () async {
      final dir = await Directory.systemTemp.createTemp('shadow-many-');
      addTearDown(() => dir.delete(recursive: true));
      final file = File('${dir.path}/IMG_1.jpg');
      await file.writeAsBytes(Uint8List.fromList([1, 2, 3, 4]));

      final many = List.generate(
        AttachmentEncoder.maxAttachmentsPerMessage + 1,
        (_) => MultimodalInput(
          type: MultimodalInputType.image,
          data: file,
          path: file.path,
        ),
      );

      await container
          .read(chatProvider.notifier)
          .generateResponseWithAttachments('看', many);

      final state = container.read(chatProvider);
      expect(
        state.errorMessageL10nKey,
        equals(ChatStateL10nKey.errorAttachmentFailed),
      );
      expect(state.errorMessage, contains('too many'));
      expect(mockClient.brain.roundCount, 0);
    });

    test('带音频字节（不是文件）→ 明确报错，且根本没到端脑', () async {
      // ⚠️ 这一格**不是**「音频不支持」⇒ ⇒ **wav/mp3 现在能发**⇒ ⇒ 这里
      // 报错的原因是**它不是一个文件**（data 是裸字节，不是路径）⇒ ⇒
      // 理由变了，判据要跟着变。
      final attachment = MultimodalInput(
        type: MultimodalInputType.audio,
        data: Uint8List.fromList([1, 2, 3]),
        path: null,
      );

      await container
          .read(chatProvider.notifier)
          .generateResponseWithAttachments('听语音', [attachment]);

      final state = container.read(chatProvider);
      expect(
        state.errorMessageL10nKey,
        equals(ChatStateL10nKey.errorAttachmentFailed),
      );
      expect(mockClient.brain.roundCount, 0);
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
      expect(mockClient.brain.roundCount, 2);
      expect(container.read(chatProvider).messages.length, equals(4));
    });
  });
}
