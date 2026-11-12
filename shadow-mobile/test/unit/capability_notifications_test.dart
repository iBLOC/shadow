import 'package:flutter_test/flutter_test.dart';

import 'package:shadow_mobile/services/capabilities/capability.dart';
import 'package:shadow_mobile/services/capabilities/capability_declaration.dart';
import 'package:shadow_mobile/services/capabilities/capability_tools.dart';
import 'package:shadow_mobile/services/capabilities/device_data_channel.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';

/// **假通道（通知那一族）** —— 与 capability_grants_test 的 Fake 同一模式：
/// `DeviceDataChannel` 的方法都是普通实例方法 ⇒ 子类覆写 ⇒ 单测不碰原生层。
class FakeNotificationChannel extends DeviceDataChannel {
  FakeNotificationChannel({this.granted = true, this.connectedError = false});

  /// 「通知使用权」服务开关的状态。
  bool granted;

  /// 模拟「已授权但监听服务还没连上」。
  final bool connectedError;

  /// 断言用：通道收到的参数与调用次数。
  int lastLimit = -1;
  bool lastIncludeOngoing = false;
  int reads = 0;

  @override
  Future<bool> notificationsAccessGranted() async => granted;

  @override
  Future<List<Map<String, Object?>>> readNotifications({
    int limit = 30,
    bool includeOngoing = false,
  }) async {
    reads++;
    lastLimit = limit;
    lastIncludeOngoing = includeOngoing;
    if (connectedError) {
      throw Exception('通知使用权已授予，但监听服务还没连上（刚开完或系统正在重启它）—— 稍后重试');
    }
    return <Map<String, Object?>>[
      <String, Object?>{
        'id': 'n1',
        'app': '微信',
        'package': 'com.tencent.mm',
        'title': '你好',
        'text': '在吗',
        'postedAtMs': 1000,
        'ongoing': false,
      },
      <String, Object?>{
        'id': 'n2',
        'app': '计算器',
        'package': 'com.calc',
        'title': '',
        'text': '3+4',
        'postedAtMs': 2000,
        'ongoing': true,
      },
    ];
  }
}

ClientToolRegistry registryWith(FakeNotificationChannel channel) {
  return buildMobileClientTools(
    setAccentColor: (_) async {},
    setDarkMode: (_) async {},
    fetchSurfaceEvents: (_) async => const [],
    deviceDataChannel: channel,
  );
}

void main() {
  group('通知能力（notification_read_events）', () {
    test('注册表里有它，挂的是 notifications_read 档，只读不需要点头', () {
      final registry = registryWith(FakeNotificationChannel());
      final tool = registry.lookup('notification_read_events');
      expect(tool, isNotNull);
      expect(tool!.capability, Capability.notificationsRead);
      expect(tool.requiresApproval, isFalse);
    });

    test('发给模型的参数表：required_permissions 声明 notifications_read ＋ limit ＋ include_ongoing', () {
      final registry = registryWith(FakeNotificationChannel());
      final tool = registry.lookup('notification_read_events')!;
      final props = tool.parameters!['properties'] as Map<String, dynamic>;
      final decl = props['required_permissions'] as Map<String, dynamic>;
      expect(((decl['items'] as Map<String, dynamic>)['enum'] as List),
          ['notifications_read']);
      expect(props.containsKey('limit'), isTrue);
      expect(props.containsKey('include_ongoing'), isTrue);
    });

    test('使用权没开 ⇒ 抛 StateError 明确失败，不是空列表，也绝不碰读取', () async {
      final channel = FakeNotificationChannel(granted: false);
      final tools = CapabilityTools(channel: channel);
      await expectLater(
        tools.readNotifications(<String, dynamic>{}),
        throwsA(isA<StateError>()),
      );
      expect(channel.reads, 0);
    });

    test('已授权 ⇒ 读得到，带上条数；limit 上限 200、非法回默认 30', () async {
      final channel = FakeNotificationChannel();
      final tools = CapabilityTools(channel: channel);
      final result = await tools.readNotifications(<String, dynamic>{});
      expect((result as Map)['count'], 2);
      expect((result['notifications'] as List).length, 2);
      expect(channel.lastLimit, 30);

      await tools.readNotifications(<String, dynamic>{'limit': 5000});
      expect(channel.lastLimit, 200);
      await tools.readNotifications(<String, dynamic>{'limit': 'x'});
      expect(channel.lastLimit, 30);
    });

    test('include_ongoing 会透传给通道（默认 false 滤常驻）', () async {
      final channel = FakeNotificationChannel();
      final tools = CapabilityTools(channel: channel);
      await tools.readNotifications(<String, dynamic>{'include_ongoing': true});
      expect(channel.lastIncludeOngoing, isTrue);
      await tools.readNotifications(<String, dynamic>{});
      expect(channel.lastIncludeOngoing, isFalse);
    });

    test('声明核对：notifications_read 对得上；sms 是越权 ⇒ 拒', () {
      final ok = evaluatePermissionDeclaration(
        capability: Capability.notificationsRead,
        declared: ['notifications_read'],
      );
      expect(ok.ok, isTrue);
      final bad = evaluatePermissionDeclaration(
        capability: Capability.notificationsRead,
        declared: ['sms'],
      );
      expect(bad.ok, isFalse);
    });
  });
}
