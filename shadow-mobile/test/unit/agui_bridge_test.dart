import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/agui/agui_bridge.dart';
import 'package:shadow_mobile/agui/agui_client.dart';
import 'package:shadow_mobile/agui/agui_events.dart';
import 'package:shadow_mobile/agui/agui_tool_outcome_gate.dart';
import 'package:shadow_mobile/agui/agui_types.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';

Future<Object?> _noop(Map<String, dynamic> args) async => null;

/// 形状转换层的判据 —— 钉的是**协议形状**：
/// · 工具是**扁平**的（不套 `function`）—— 端脑自己再包一次；
/// · data URL 形状不对 ⇒ ⇒ **响亮地拒**（不静默丢图）；
/// · 失败 ⇒ ⇒ **必须带 error**。
///
/// ⚠️ **与桌面端 `src/lib/agui/__tests__/aguiBridge.test.ts` 逐字对等**。
void main() {
  group('toAguiTools', () {
    test('扁平形状 —— 不套 function(端脑自己包一次 ⇒ 两端不许各包一次)', () {
      final ClientToolRegistry registry = ClientToolRegistry(<ClientTool>[
        const ClientTool(
          name: 'set_theme',
          description: '换主题色',
          parameters: <String, dynamic>{
            'type': 'object',
            'properties': <String, dynamic>{'color': <String, dynamic>{'type': 'string'}},
          },
          execute: _noop,
        ),
      ]);
      final List<AguiTool> tools = toAguiTools(registry);
      expect(tools, hasLength(1));
      final Map<String, dynamic> json = tools.first.toJson();
      expect(json['name'], 'set_theme');
      expect(json.containsKey('function'), isFalse);
      expect(json.containsKey('type'), isFalse);
      expect(json['parameters'], isNotNull);
    });

    test('没有 parameters 的工具 ⇒ ⇒ 参数表是空的(不许缺字段)', () {
      final ClientToolRegistry registry = ClientToolRegistry(<ClientTool>[
        const ClientTool(name: 'noop', description: '什么都不干', execute: _noop),
      ]);
      final AguiTool tool = toAguiTools(registry).first;
      expect(
        tool.parameters,
        <String, dynamic>{
          'type': 'object',
          'properties': <String, dynamic>{},
        },
      );
    });

    test('排除名单里的工具 ⇒ ⇒ 不出现在模型面前(那一档能力关掉了)', () {
      final ClientToolRegistry registry = ClientToolRegistry(<ClientTool>[
        const ClientTool(name: 'noop', description: '什么都不干', execute: _noop),
      ]);
      expect(toAguiTools(registry, excludedNames: <String>{'noop'}), isEmpty);
    });
  });

  group('parseDataUrl', () {
    test('data URL ⇒ ⇒ MIME ＋ base64', () {
      final AguiInlineFile f = parseDataUrl('data:image/png;base64,aGVsbG8=');
      expect(f.mediaType, 'image/png');
      expect(f.base64, 'aGVsbG8=');
    });

    test('形状不对 ⇒ ⇒ **抛**(不许静默丢图)', () {
      expect(
        () => parseDataUrl('https://example.com/a.png'),
        throwsA(predicate((Object e) =>
            e is AguiProtocolException &&
            e.message.contains('base64 data URL'))),
      );
      expect(
        () => parseDataUrl('data:image/png,notbase64'),
        throwsA(predicate((Object e) =>
            e is AguiProtocolException &&
            e.message.contains('base64 data URL'))),
      );
    });
  });

  group('toToolOutcome', () {
    test('成功 ⇒ ⇒ 只交 `report` 那一句(组件树是给界面的)', () {
      final AguiToolOutcome o = toToolOutcome(
        true,
        <String, dynamic>{
          'report': '主题已换',
          'tree': <String, dynamic>{'big': true},
        },
      );
      expect(o.ok, isTrue);
      // ⚠️ `pickReportPayload` 给的是 **`{report}` 那个对象**（legacy 路送的
      // 就是它）⇒ ⇒ AG-UI 的 content 是**字符串** ⇒ ⇒ 序列化成 JSON ⇒ ⇒ 模型
      // 看到的内容与 legacy 路**逐字同形**。
      expect(o.content, '{"report":"主题已换"}');
      expect(o.content.contains('big'), isFalse);
    });

    test('失败 ⇒ ⇒ **必须带 error**(不许只塞 content)', () {
      final AguiToolOutcome o = toToolOutcome(false, null, '主题服务拒绝');
      expect(o.ok, isFalse);
      expect(o.error, '主题服务拒绝');
      expect(o.content, isEmpty);
    });
  });
}
