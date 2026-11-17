import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/multimodal/multimodal.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/services/capabilities/capability.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';

import 'agui_fakes.dart';

/// 移动端那一格的 **AG-UI 接线**判据。
///
/// ⚠️ **只假运输层** ⇒ ⇒ driver／SSE 解析／协议归约／provider 的执行器
/// **全都是真的** ⇒ ⇒ 这里钉的是**生产那一路**
/// （与桌面端 `fetchImpl` 假法同口径 ⇒ ⇒ 两端判据同一条规则）。
void main() {
  ChatNotifier notifierWith({
    required FakeAguiBrain brain,
    ClientToolRegistry? tools,
    AuthorizationMode Function(Capability capability)? modeFor,
  }) {
    return ChatNotifier(
      MockTts(),
      ToolMockClient(),
      clientTools: tools,
      capabilityModeFor: modeFor,
      aguiHttpClient: brain,
    );
  }

  /// 对话流里最后一条**助手**消息的正文。
  String? lastAssistantText(ChatNotifier notifier) {
    final texts = notifier.state.messages
        .where((m) => m.role == ChatRole.assistant && m.toolCall == null)
        .map((m) => m.content)
        .toList();
    return texts.isEmpty ? null : texts.last;
  }

  group('AG-UI 那一路：文本', () {
    test('文本增量逐字进对话流（不是只在流里飘着）', () async {
      final brain = FakeAguiBrain(rounds: <List<String>>[
        <String>[
          aguiText('你好'),
          aguiText(',世界'),
          aguiFinished(),
        ],
      ]);
      final notifier = notifierWith(brain: brain);

      await notifier.generateResponse('hi');

      expect(lastAssistantText(notifier), '你好,世界');
      // 流完了 ⇒ streamingText 要清空（不然界面上留着一截残字）。
      expect(notifier.state.streamingText, '');
      expect(notifier.state.isLoading, isFalse);
      expect(notifier.state.errorMessage, isNull);
    });
  });

  group('AG-UI 那一路：失败不许长得像成功', () {
    test('RUN_ERROR ⇒ 如实抛，**带上端脑的原话**', () async {
      final brain = FakeAguiBrain(rounds: <List<String>>[
        <String>[aguiError('设备拒绝了这一轮')],
      ]);
      final notifier = notifierWith(brain: brain);

      await notifier.generateResponse('hi');

      // ⚠️ 原话要**看得见**（不然用户只看到「出错了」三个字）。
      expect(notifier.state.errorMessage, contains('设备拒绝了这一轮'));
      expect(notifier.state.isLoading, isFalse);
    });

    test('流没跑完（没有 RUN_FINISHED）⇒ 抛（不许当成跑完了）', () async {
      final brain = FakeAguiBrain(rounds: <List<String>>[
        <String>[aguiText('半句')],
      ]);
      final notifier = notifierWith(brain: brain);

      await notifier.generateResponse('hi');

      expect(notifier.state.errorMessage, contains('without RUN_FINISHED'));
    });

    test('非 2xx ⇒ 抛，**带上端脑的原话**', () async {
      final brain = FakeAguiBrain(
        rounds: <List<String>>[
          <String>[aguiFinished()],
        ],
        statuses: <int>[400],
        bodies: <String>['请把字节内联成 data source'],
      );
      final notifier = notifierWith(brain: brain);

      await notifier.generateResponse('hi');

      expect(
        notifier.state.errorMessage,
        contains('请把字节内联成 data source'),
      );
    });
  });

  group('AG-UI 那一路：请求面', () {
    test('工具清单**整份带上去**（少了它 ⇒ 设备工具静默失灵）', () async {
      final brain = FakeAguiBrain(rounds: <List<String>>[
        <String>[aguiText('好'), aguiFinished()],
      ]);
      final notifier = notifierWith(
        brain: brain,
        tools: ClientToolRegistry([
          ClientTool(
            name: 'set_theme',
            description: 'Change the app theme colour',
            execute: (args) async => <String, dynamic>{'applied': 'indigo'},
          ),
        ]),
      );

      await notifier.generateResponse('换个色');

      final Map<String, dynamic> request = brain.requests.single;
      final List<dynamic> tools = request['tools'] as List<dynamic>;
      expect(tools, hasLength(1));
      expect((tools.single as Map)['name'], 'set_theme');
      // ⚠️ AG-UI 的工具是**扁平**形状（**不套 function**）。
      expect((tools.single as Map).containsKey('function'), isFalse);
      // 用户那句话也在请求里。
      final List<dynamic> messages = request['messages'] as List<dynamic>;
      final List<dynamic> content =
          (messages.single as Map)['content'] as List<dynamic>;
      expect((content.single as Map)['text'], '换个色');
    });

    test('「彻底关闭」的能力**不进**清单（模型看不见它）', () async {
      final brain = FakeAguiBrain(rounds: <List<String>>[
        <String>[aguiText('好'), aguiFinished()],
      ]);
      final notifier = notifierWith(
        brain: brain,
        tools: ClientToolRegistry([
          ClientTool(
            name: 'mobile_tap',
            description: 'Tap a point.',
            capability: Capability.mobileUse,
            execute: (args) async => <String, dynamic>{'tapped': true},
          ),
          ClientTool(
            name: 'set_theme',
            description: 'Change the app theme colour',
            execute: (args) async => <String, dynamic>{'applied': 'indigo'},
          ),
        ]),
        modeFor: (Capability capability) => AuthorizationMode.disabled,
      );

      await notifier.generateResponse('点一下');

      final List<dynamic> tools =
          brain.requests.single['tools'] as List<dynamic>;
      final List<String> names = tools
          .map((dynamic t) => (t as Map)['name'] as String)
          .toList();
      // ⚠️ 「彻底关闭」的能力对模型**不存在** ⇒ ⇒ 模型看不见它。
      expect(names, isNot(contains('mobile_tap')));
      expect(names, contains('set_theme'));
    });

    test('附件**内联**进请求（legacy 的 media_type ⇒ AG-UI 的 mimeType）', () async {
      // ⚠️ 编码器要**读盘** ⇒ ⇒ 得有一个真的文件。
      final Directory dir = Directory.systemTemp.createTempSync('agui-attach');
      addTearDown(() => dir.deleteSync(recursive: true));
      final File file = File('${dir.path}/shot.png');
      file.writeAsBytesSync(<int>[1, 2, 3, 4, 5]);

      final brain = FakeAguiBrain(rounds: <List<String>>[
        <String>[aguiText('看到了'), aguiFinished()],
      ]);
      final notifier = notifierWith(brain: brain);

      await notifier.generateResponseWithAttachments(
        '看这张图',
        <MultimodalInput>[
          MultimodalInput(
            type: MultimodalInputType.file,
            data: file,
            path: file.path,
          ),
        ],
      );

      final List<dynamic> messages =
          brain.requests.single['messages'] as List<dynamic>;
      final List<dynamic> content =
          (messages.single as Map)['content'] as List<dynamic>;
      // ⚠️ **接缝**：legacy 的载荷键是 media_type（下划线）
      // ⇒ ⇒ AG-UI 的 part 键是 mimeType（驼峰）⇒ ⇒ 照抄键名就错了。
      final Map<String, dynamic> part =
          content.firstWhere((dynamic p) => (p as Map)['type'] == 'image')
              as Map<String, dynamic>;
      final Map<String, dynamic> source =
          part['source'] as Map<String, dynamic>;
      expect(source['type'], 'data');
      expect(source['mimeType'], 'image/png');
      expect(source['value'], base64Encode(<int>[1, 2, 3, 4, 5]));
    });
  });
}
