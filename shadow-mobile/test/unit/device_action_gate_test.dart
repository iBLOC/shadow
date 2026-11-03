import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/providers/capability_policy_provider.dart';
import 'package:shadow_mobile/services/app_config_service.dart';
import 'package:shadow_mobile/services/capabilities/capability.dart';

/// **设备动作闸** —— 原生侧那两个平行面（HTTP `/api/mobile/action` 与
/// A2A 的 `executeAction`）也认 Dart 侧那道能力闸。
///
/// ⚠️ 这组用例的存在理由：那两个平行面**不经过** `client_tool_registry`
/// ⇒ ⇒ 能力闸在它们身上**天然失效**⇒ ⇒ 「闸建好了」那句话是假的
/// ⇒ ⇒ 这组用例钉住「档位一变 ⇒ 状态真的推到原生侧」。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const a11yChannel = MethodChannel('com.ibloc.shadow/accessibility');

  group('⑩ 设备动作闸：原生侧那两个平行面也认这道闸', () {
    late Directory cfgDir;
    late File cfgFile;

    setUpAll(() async {
      cfgDir = await Directory.systemTemp.createTemp('shadow-gate-cap');
      cfgFile = File('${cfgDir.path}/app_config.json');
    });

    setUp(() {
      // ⚠️ 改档位会**真的写文件** ⇒ ⇒ 单测里把落盘目标指向临时文件。
      AppConfigService.configFileOverride = () async => cfgFile;
    });

    tearDownAll(() {
      AppConfigService.configFileOverride = null;
    });

    test('只有「完全访问」才放行原生侧的动作', () {
      expect(deviceActionsAllowedFor(CapabilityPolicy.empty), isFalse);
      expect(
        deviceActionsAllowedFor(
          CapabilityPolicy.empty.withMode(
            Capability.mobileUse,
            AuthorizationMode.fullAccess,
          ),
        ),
        isTrue,
      );
      // ⚠️ 「每次询问」⇒ ⇒ 原生那条腿**没法问**（没有 UI 可以弹卡片）
      // ⇒ ⇒ 只能拒 ⇒ ⇒ fail-closed。
      expect(
        deviceActionsAllowedFor(
          CapabilityPolicy.empty.withMode(
            Capability.mobileUse,
            AuthorizationMode.askEveryTime,
          ),
        ),
        isFalse,
      );
      // ⚠️ 「彻底关闭」⇒ ⇒ 更不能放行。
      expect(
        deviceActionsAllowedFor(
          CapabilityPolicy.empty.withMode(
            Capability.mobileUse,
            AuthorizationMode.disabled,
          ),
        ),
        isFalse,
      );
    });

    test('档位改成「完全访问」⇒ 真的把闸状态推给原生侧', () async {
      final calls = <MethodCall>[];
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(a11yChannel, (call) async {
        calls.add(call);
        return null;
      });
      addTearDown(() {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(a11yChannel, null);
      });

      final notifier = CapabilityPolicyNotifier();
      await notifier.setMode(
        Capability.mobileUse,
        AuthorizationMode.fullAccess,
      );

      final pushed = calls
          .where((c) => c.method == 'setDeviceActionsAllowed')
          .toList();
      expect(pushed, isNotEmpty, reason: '必须把闸状态推给原生侧');
      // ⚠️ 用 any 而不是 last ⇒ ⇒ 恢复时的推送与改档位时的推送
      // ⇒ ⇒ 谁先谁后**不是确定的** ⇒ ⇒ 断言「存在一个 true」才稳。
      expect(
        pushed.any((c) => (c.arguments as Map)['allowed'] == true),
        isTrue,
        reason: '必须推 allowed=true',
      );
    });

    test('改成「彻底关闭」⇒ 推给原生侧的是 allowed=false', () async {
      final calls = <MethodCall>[];
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(a11yChannel, (call) async {
        calls.add(call);
        return null;
      });
      addTearDown(() {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(a11yChannel, null);
      });

      final notifier = CapabilityPolicyNotifier();
      await notifier.setMode(
        Capability.mobileUse,
        AuthorizationMode.disabled,
      );

      final pushed = calls
          .where((c) => c.method == 'setDeviceActionsAllowed')
          .toList();
      expect(pushed, isNotEmpty);
      expect(
        pushed.any((c) => (c.arguments as Map)['allowed'] == false),
        isTrue,
        reason: '必须推 allowed=false',
      );
    });
  });
}