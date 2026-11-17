import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/agui/agui_client.dart';
import 'package:shadow_mobile/agui/agui_device_tool.dart';
import 'package:shadow_mobile/agui/agui_events.dart';
import 'package:shadow_mobile/services/capabilities/capability.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';

/// AG-UI 那一路的**纯函数层**判据。
///
/// ⚠️ **为什么单独一层**：端脑在 AG-UI 这一路**只负责点名**
/// （工具名 ＋ 参数 JSON）⇒ ⇒ 「这台设备能不能干」「参数对不对」
/// 「有没有被权限声明骗过」这几格判定**必须有地方住**。
///
/// ⚠️ **失败不许长得像成功**：每一处判不下去都给出**原因**
/// ⇒ ⇒ 那个原因会作为 AG-UI 的 `error` 字段回传 ⇒ ⇒ 端脑那边
/// 「error 在场 ⇒ 状态就是 failed」⇒ ⇒ 模型能看见失败并改口径。
void main() {
  ClientToolRegistry registryOf(List<ClientTool> tools) =>
      ClientToolRegistry(tools);

  ClientTool themeTool({Capability? capability, bool requiresApproval = false}) {
    return ClientTool(
      name: 'set_theme',
      description: 'Change the app theme colour',
      requiresApproval: requiresApproval,
      capability: capability,
      execute: (Map<String, dynamic> args) async =>
          <String, dynamic>{'applied': 'indigo'},
    );
  }

  AuthorizationMode fullAccess(Capability capability) =>
      AuthorizationMode.fullAccess;
  AuthorizationMode disabled(Capability capability) =>
      AuthorizationMode.disabled;

  group('decideAguiToolCall —— 五道闸', () {
    test('❶ 名字空 ⇒ 失败并说清为什么', () {
      final AguiToolDecision decision = decideAguiToolCall(
        name: '',
        argsJson: '{}',
        registry: registryOf(<ClientTool>[themeTool()]),
        modeFor: fullAccess,
      );
      expect(decision.ok, isFalse);
      expect(decision.error, 'tool call without a name');
      expect(decision.tool, isNull);
    });

    test('❷ 这台设备不会这个活 ⇒ 明确失败（不许闷着）', () {
      final AguiToolDecision decision = decideAguiToolCall(
        name: 'launch_missiles',
        argsJson: '{}',
        registry: registryOf(<ClientTool>[themeTool()]),
        modeFor: fullAccess,
      );
      expect(decision.ok, isFalse);
      expect(decision.error, contains('unsupported tool'));
      expect(decision.error, contains('launch_missiles'));
    });

    test('❸ 能力「彻底关闭」⇒ 绝不执行', () {
      final AguiToolDecision decision = decideAguiToolCall(
        name: 'set_theme',
        argsJson: '{}',
        registry: registryOf(<ClientTool>[
          themeTool(capability: Capability.mobileUse),
        ]),
        modeFor: disabled,
      );
      expect(decision.ok, isFalse);
      expect(decision.error, contains('capability disabled'));
      expect(decision.error, contains('mobile_use'));
    });

    test('❹ 参数不是合法 JSON ⇒ 失败（不许当成空参数跑）', () {
      final AguiToolDecision decision = decideAguiToolCall(
        name: 'set_theme',
        argsJson: '{not json',
        registry: registryOf(<ClientTool>[themeTool()]),
        modeFor: fullAccess,
      );
      expect(decision.ok, isFalse);
      expect(decision.error, contains('not valid JSON'));
    });

    test('❹ 参数不是对象 ⇒ 失败（数组也不是参数）', () {
      final AguiToolDecision decision = decideAguiToolCall(
        name: 'set_theme',
        argsJson: '[1,2,3]',
        registry: registryOf(<ClientTool>[themeTool()]),
        modeFor: fullAccess,
      );
      expect(decision.ok, isFalse);
      expect(decision.error, 'tool arguments are not an object');
    });

    test('❺ 权限声明对不上 ⇒ 失败（核对 ≠ 授权）', () {
      final AguiToolDecision decision = decideAguiToolCall(
        name: 'set_theme',
        argsJson: '{"required_permissions":["calendar_read"]}',
        registry: registryOf(<ClientTool>[
          themeTool(capability: Capability.mobileUse),
        ]),
        modeFor: fullAccess,
      );
      expect(decision.ok, isFalse);
      expect(decision.error, contains('permission declaration mismatch'));
      expect(decision.error, contains('calendar_read'));
    });

    test('声明为空 ⇒ 宽容（老模型不知道有这一栏）', () {
      final AguiToolDecision decision = decideAguiToolCall(
        name: 'set_theme',
        argsJson: '{"color":"indigo"}',
        registry: registryOf(<ClientTool>[themeTool()]),
        modeFor: fullAccess,
      );
      expect(decision.ok, isTrue);
      expect(decision.error, isNull);
      expect(decision.tool!.name, 'set_theme');
      expect(decision.args['color'], 'indigo');
    });

    test('声明正好对上 ⇒ 放行', () {
      final AguiToolDecision decision = decideAguiToolCall(
        name: 'set_theme',
        argsJson: '{"required_permissions":["mobile_use"]}',
        registry: registryOf(<ClientTool>[
          themeTool(capability: Capability.mobileUse),
        ]),
        modeFor: fullAccess,
      );
      expect(decision.ok, isTrue);
      expect(decision.args['required_permissions'], <String>['mobile_use']);
    });

    test('空参数 ⇒ 当成空对象（不是失败）', () {
      final AguiToolDecision decision = decideAguiToolCall(
        name: 'set_theme',
        argsJson: '',
        registry: registryOf(<ClientTool>[themeTool()]),
        modeFor: fullAccess,
      );
      expect(decision.ok, isTrue);
      expect(decision.args, isEmpty);
    });
  });

  group('aguiInlineFilesFromAttachments —— 附件那一格是接缝', () {
    test('legacy 的 media_type ⇒ AG-UI 的 mimeType（键名不一样！）', () {
      final List<AguiInlineFile> files = aguiInlineFilesFromAttachments(
        <Map<String, String>>[
          <String, String>{
            'media_type': 'image/png',
            'data': 'aGVsbG8=',
            'filename': 'shot.png',
          },
        ],
      );
      expect(files, hasLength(1));
      expect(files.single.mediaType, 'image/png');
      expect(files.single.base64, 'aGVsbG8=');
    });

    test('没有附件 ⇒ 空列表（不是失败）', () {
      expect(aguiInlineFilesFromAttachments(null), isEmpty);
      expect(aguiInlineFilesFromAttachments(<Map<String, String>>[]), isEmpty);
    });

    test('缺 media_type ⇒ 响亮地拒（不许静默丢附件）', () {
      expect(
        () => aguiInlineFilesFromAttachments(<Map<String, String>>[
          <String, String>{'data': 'aGVsbG8='},
        ]),
        throwsA(isA<AguiProtocolException>()),
      );
    });

    test('缺 data ⇒ 响亮地拒', () {
      expect(
        () => aguiInlineFilesFromAttachments(<Map<String, String>>[
          <String, String>{'media_type': 'image/png'},
        ]),
        throwsA(isA<AguiProtocolException>()),
      );
    });
  });
}
