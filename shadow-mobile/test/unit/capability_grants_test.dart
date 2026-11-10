import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/providers/capability_policy_provider.dart';
import 'package:shadow_mobile/services/app_config_service.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/services/accessibility_controller.dart';
import 'package:shadow_mobile/services/capabilities/accessibility_ops.dart';
import 'package:shadow_mobile/services/capabilities/capability.dart';
import 'package:shadow_mobile/services/capabilities/capability_tools.dart';
import 'package:shadow_mobile/services/capabilities/device_data_channel.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';
import 'package:shadow_mobile/tts_engine.dart';

/// **假通道** —— 把原生层换成一个可断言的东西。
///
/// ⚠️ 之所以能替换：`DeviceDataChannel` 的方法都是普通实例方法 ⇒ ⇒
/// 子类可以覆写 ⇒ ⇒ 单测不必真的连原生层（也不必真机）。
class FakeDeviceDataChannel extends DeviceDataChannel {
  FakeDeviceDataChannel({
    this.granted = true,
    this.requestResult = true,
    this.permanentlyDenied = false,
    this.events = const [],
  });

  /// 系统权限是否已授予。
  bool granted;

  /// 「申请权限」这个动作的结果（模拟用户批 / 不批）。
  bool requestResult;

  /// 模拟「系统**拒绝再弹**」（用户拒绝过两次 ⇒ 系统不再弹那个框）。
  ///
  /// ⚠️ 这一档必须与「用户点了拒绝」**分得开** ⇒ ⇒ 否则客户端只会说
  /// 「用户没给权限」⇒ ⇒ 而真相是「只能去系统设置里开」。
  final bool permanentlyDenied;

  /// 读日历要返回的东西。
  List<Map<String, Object?>> events;

  /// 断言用：被调用了几次。
  int calendarReads = 0;
  int permissionRequests = 0;
  int lastLimit = -1;

  @override
  Future<bool> hasOsPermission(String capabilityWire) async => granted;

  @override
  Future<bool> requestPermission(String capabilityWire) async {
    permissionRequests++;
    if (requestResult) granted = true;
    return requestResult;
  }

  /// **详细版**的申请 —— 与原生那侧**同形状**（字段名一字不差）。
  @override
  Future<PermissionRequestOutcome> requestPermissionDetailed(
    String capabilityWire,
  ) async {
    permissionRequests++;
    if (requestResult) granted = true;
    return PermissionRequestOutcome(
      granted: requestResult,
      // ⚠️ 「系统拒绝再弹」⇒ ⇒ 压根**没弹** ⇒ ⇒ 与「用户点了拒绝」分得开。
      dialogShown: !permanentlyDenied,
      permanentlyDenied: permanentlyDenied,
      superseded: false,
    );
  }

  @override
  Future<List<Map<String, Object?>>> readCalendar({
    required int startMs,
    required int endMs,
    int limit = 50,
  }) async {
    calendarReads++;
    lastLimit = limit;
    return events;
  }
}

/// **假的无障碍层** —— 单测里不必真的连原生层。
///
/// ⚠️ 正因为有了它，才能钉住「无障碍**已开启** ⇒ 真的会去点」那条**正路径**
/// ⇒ ⇒ 而不只是测「没开启 ⇒ 失败」那一条。
class FakeAccessibilityOps extends AccessibilityOps {
  FakeAccessibilityOps({
    this.enabled = true,
    this.screen = '[android.widget.Button] text: OK',
    this.result = true,
  });

  /// 无障碍服务是否已开启。
  bool enabled;

  /// 读屏要返回的东西。
  String? screen;

  /// 各个动作的结果（点 / 滑 / 找文字 / 全局动作）。
  bool result;

  /// 断言用：被调用了什么。
  final List<String> calls = [];

  @override
  Future<bool> isEnabled() async => enabled;

  @override
  Future<String?> readScreen() async {
    calls.add('readScreen');
    return screen;
  }

  @override
  Future<bool> tap(double x, double y) async {
    calls.add('tap:$x,$y');
    return result;
  }

  @override
  Future<bool> longPress(double x, double y) async {
    calls.add('longPress:$x,$y');
    return result;
  }

  @override
  Future<bool> swipe(
    double x1,
    double y1,
    double x2,
    double y2,
    int durationMs,
  ) async {
    calls.add('swipe:$x1,$y1,$x2,$y2');
    return result;
  }

  @override
  Future<bool> findAndClickByText(String text) async {
    calls.add('findAndClickByText:$text');
    return result;
  }

  @override
  Future<bool> globalAction(GlobalAction action) async {
    calls.add('globalAction:${action.wire}');
    return result;
  }
}

class _FakeTts extends TtsEngine {
  @override
  Future<void> speak(String text, {String lang = 'zh-CN'}) async {}
}

/// 会发一串事件、并记录「结果回传」的端脑 mock。
class _MockClient extends TelencephalonClient {
  _MockClient(this.events) : super(baseUrl: 'http://127.0.0.1:60080');

  final List<StreamEvent> events;
  final List<Map<String, dynamic>> reports = [];

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
    for (final event in events) {
      yield event;
    }
  }

  @override
  Future<void> reportToolResult(
    String conversationId, {
    required String name,
    String? toolCallId,
    required Object? result,
    bool ok = true,
  }) async {
    reports.add({'name': name, 'ok': ok, 'result': result});
  }
}

void main() {
  ToolCallModel? lastToolCall(ChatNotifier notifier) {
    final calls = notifier.state.messages
        .where((m) => m.toolCall != null)
        .map((m) => m.toolCall!)
        .toList();
    return calls.isEmpty ? null : calls.last;
  }

  Future<void> waitForSettled(ChatNotifier notifier) async {
    for (var i = 0; i < 200; i++) {
      final call = lastToolCall(notifier);
      if (call != null) {
        final terminal = call.status == ToolCallStatus.succeeded ||
            call.status == ToolCallStatus.failed;
        if (terminal && (call.reported || call.reportErrorText != null)) {
          return;
        }
      }
      await Future<void>.delayed(const Duration(milliseconds: 5));
    }
    fail('工具调用在 1 秒内没落定');
  }

  ClientToolRegistry registryWith(FakeDeviceDataChannel channel) {
    return buildMobileClientTools(
      setAccentColor: (_) async {},
      setDarkMode: (_) async {},
      fetchSurfaceEvents: (_) async => const [],
      deviceDataChannel: channel,
    );
  }

  group('① 档位层：默认必须是「每次询问」', () {
    test('没配过的能力 = 每次询问（fail-closed）', () {
      const policy = CapabilityPolicy.empty;
      for (final capability in Capability.values) {
        expect(
          policy.modeFor(capability),
          AuthorizationMode.askEveryTime,
          reason: '${capability.wire} 不该默认就是完全访问',
        );
      }
    });

    test('认不出来的档位字符串 ⇒ 退化成「每次询问」', () {
      expect(
        AuthorizationMode.fromWire('不存在的档位'),
        AuthorizationMode.askEveryTime,
      );
      expect(AuthorizationMode.fromWire(null), AuthorizationMode.askEveryTime);
    });

    test('认不出来的能力名 ⇒ 落到的那个能力也是「每次询问」', () {
      final policy = CapabilityPolicy.fromWire({'???': 'full'});
      expect(policy.modeFor(Capability.calendarRead), AuthorizationMode.askEveryTime);
      expect(policy.modeFor(Capability.photos), AuthorizationMode.askEveryTime);
    });

    test('配过的能力就是那个档位，且只影响它自己', () {
      final policy = CapabilityPolicy.empty.withMode(
        Capability.calendarRead,
        AuthorizationMode.fullAccess,
      );
      expect(policy.modeFor(Capability.calendarRead), AuthorizationMode.fullAccess);
      // ⚠️ 日历**写**是另一档 ⇒ ⇒ 读放开不等于写也放开。
      expect(policy.modeFor(Capability.calendarWrite), AuthorizationMode.askEveryTime);
      expect(policy.modeFor(Capability.contacts), AuthorizationMode.askEveryTime);
    });

    test('落盘往返：toWire → fromWire 不丢档位', () {
      final policy = CapabilityPolicy.empty
          .withMode(Capability.contacts, AuthorizationMode.fullAccess)
          .withMode(Capability.sms, AuthorizationMode.askEveryTime);
      final restored = CapabilityPolicy.fromWire(policy.toWire());
      expect(restored.modeFor(Capability.contacts), AuthorizationMode.fullAccess);
      expect(restored.modeFor(Capability.sms), AuthorizationMode.askEveryTime);
      expect(restored, policy);
    });
  });

  group('② 持久化：坏配置不许放宽授权', () {
    test('配置里没有这一项 ⇒ 空映射', () {
      expect(CapabilityPolicyStore.read(<String, dynamic>{}), isEmpty);
      expect(
        CapabilityPolicyStore.read(<String, dynamic>{'别的': 1}),
        isEmpty,
      );
    });

    test('类型不对的项被丢掉，不许混进策略', () {
      // ⚠️ 键类型故意放宽成 Object —— 线上真能收到这种形状。
      final inner = <Object, Object>{
        'calendar_read': 'full',
        'sms': 123, // ⚠️ 值不是字符串
        42: 'ask', // ⚠️ 键不是字符串
      };
      final raw = CapabilityPolicyStore.read(<String, dynamic>{
        'capabilityModes': inner,
      });
      expect(raw, <String, String>{'calendar_read': 'full'});
    });

    test('空 map 不写进配置（不留空壳）', () {
      final config = <String, dynamic>{};
      CapabilityPolicyStore.write(const {}, config);
      expect(config.containsKey('capabilityModes'), isFalse);
    });

    test('非空 map 写进配置', () {
      final config = <String, dynamic>{};
      CapabilityPolicyStore.write(<String, String>{'sms': 'ask'}, config);
      expect(config['capabilityModes'], <String, String>{'sms': 'ask'});
    });
  });

  group('③ 注册层：五个能力工具都在，且各归各的能力', () {
    test('五个工具都注册了，能力映射正确', () {
      final registry = registryWith(FakeDeviceDataChannel());
      final expected = <String, Capability>{
        'calendar_read_events': Capability.calendarRead,
        'calendar_write_event': Capability.calendarWrite,
        'contacts_search': Capability.contacts,
        'sms_read_messages': Capability.sms,
        'photos_list_recent': Capability.photos,
      };
      for (final entry in expected.entries) {
        final tool = registry.lookup(entry.key);
        expect(tool, isNotNull, reason: '${entry.key} 没注册');
        expect(tool!.capability, entry.value, reason: '${entry.key} 归错能力了');
      }
    });

    test('能力工具**不**自带 requiresApproval —— 授权在档位上，不在工具上', () {
      final registry = registryWith(FakeDeviceDataChannel());
      expect(registry.lookup('calendar_read_events')!.requiresApproval, isFalse);
      expect(registry.lookup('calendar_write_event')!.requiresApproval, isFalse);
    });

    test('普通工具**没有**能力（档位对它没有影响）', () {
      final registry = registryWith(FakeDeviceDataChannel());
      expect(registry.lookup('set_theme')!.capability, isNull);
    });
  });

  group('④ 授权闸：档位决定要不要点头', () {
    test('档位=每次询问 ⇒ 停在「等你点头」，且**没碰**数据源', () async {
      final channel = FakeDeviceDataChannel();
      final client = _MockClient([
        StreamEvent(
          type: 'tool_call',
          name: 'calendar_read_events',
          args: <String, dynamic>{},
        ),
      ]);
      final notifier = ChatNotifier(
        _FakeTts(),
        client,
        clientTools: registryWith(channel),
        capabilityModeFor: (_) => AuthorizationMode.askEveryTime,
      );

      await notifier.generateResponse('我明天有什么安排');

      final call = lastToolCall(notifier);
      expect(call, isNotNull);
      expect(call!.status, ToolCallStatus.awaitingApproval);
      // ⚠️ 没点头 ⇒ ⇒ 一个字节都不许去读。
      expect(channel.calendarReads, 0);
      expect(client.reports, isEmpty);
    });

    test('档位=完全访问 ⇒ 直接执行并回传端脑', () async {
      final channel = FakeDeviceDataChannel(
        events: [
          <String, Object?>{'id': '1', 'title': '站会'},
        ],
      );
      final client = _MockClient([
        StreamEvent(
          type: 'tool_call',
          name: 'calendar_read_events',
          args: <String, dynamic>{},
        ),
      ]);
      final notifier = ChatNotifier(
        _FakeTts(),
        client,
        clientTools: registryWith(channel),
        capabilityModeFor: (_) => AuthorizationMode.fullAccess,
      );

      await notifier.generateResponse('我明天有什么安排');
      await waitForSettled(notifier);

      final call = lastToolCall(notifier);
      expect(call!.status, ToolCallStatus.succeeded);
      expect(channel.calendarReads, 1);
      expect(client.reports, hasLength(1));
      expect(client.reports.single['ok'], isTrue);
      // ⚠️ 结果里**不能**有 `report` 键 —— 有的话明细到不了模型。
      final payload = client.reports.single['result'] as Map;
      expect(payload.containsKey('report'), isFalse);
      expect(payload['count'], 1);
    });

    test('档位是**调用时**读的 ⇒ 用户改完立刻生效', () async {
      final channel = FakeDeviceDataChannel();
      final client = _MockClient([
        StreamEvent(
          type: 'tool_call',
          name: 'calendar_read_events',
          args: <String, dynamic>{},
        ),
      ]);
      var mode = AuthorizationMode.askEveryTime;
      final notifier = ChatNotifier(
        _FakeTts(),
        client,
        clientTools: registryWith(channel),
        capabilityModeFor: (_) => mode,
      );

      await notifier.generateResponse('我明天有什么安排');
      expect(lastToolCall(notifier)!.status, ToolCallStatus.awaitingApproval);

      // 用户在设置里改成「完全访问」⇒ ⇒ 下一次调用就该直接跑。
      mode = AuthorizationMode.fullAccess;
      await notifier.generateResponse('那再看一次');
      await waitForSettled(notifier);
      expect(lastToolCall(notifier)!.status, ToolCallStatus.succeeded);
    });

    test('没注入策略提供者 ⇒ 一律「每次询问」（fail-closed）', () async {
      final channel = FakeDeviceDataChannel();
      final client = _MockClient([
        StreamEvent(
          type: 'tool_call',
          name: 'calendar_read_events',
          args: <String, dynamic>{},
        ),
      ]);
      final notifier = ChatNotifier(
        _FakeTts(),
        client,
        clientTools: registryWith(channel),
      );

      await notifier.generateResponse('我明天有什么安排');
      expect(lastToolCall(notifier)!.status, ToolCallStatus.awaitingApproval);
      expect(channel.calendarReads, 0);
    });

    test('普通工具不受档位影响（没有能力 ⇒ 照常直接跑）', () async {
      final client = _MockClient([
        StreamEvent(
          type: 'tool_call',
          name: 'set_theme',
          args: <String, dynamic>{'dark': true},
        ),
      ]);
      final notifier = ChatNotifier(
        _FakeTts(),
        client,
        clientTools: registryWith(FakeDeviceDataChannel()),
        capabilityModeFor: (_) => AuthorizationMode.askEveryTime,
      );

      await notifier.generateResponse('换成深色');
      await waitForSettled(notifier);
      expect(lastToolCall(notifier)!.status, ToolCallStatus.succeeded);
    });
  });

  group('⑤ 执行层：没权限就**明确失败**，不许假装成功', () {
    test('权限已授予 ⇒ 读得到，并带上条数', () async {
      final channel = FakeDeviceDataChannel(
        events: [
          <String, Object?>{'id': '1'},
          <String, Object?>{'id': '2'},
        ],
      );
      final tools = CapabilityTools(channel: channel);
      final result = await tools.readCalendar(<String, dynamic>{});
      expect((result as Map)['count'], 2);
      expect(channel.calendarReads, 1);
    });

    test('权限没批 ⇒ 抛异常，**不是**空列表', () async {
      final channel = FakeDeviceDataChannel(granted: false, requestResult: false);
      final tools = CapabilityTools(channel: channel);
      await expectLater(
        tools.readCalendar(<String, dynamic>{}),
        throwsA(isA<StateError>()),
      );
      // ⚠️ 没权限 ⇒ 连 provider 都不许碰。
      expect(channel.calendarReads, 0);
      expect(channel.permissionRequests, 1);
    });

    test('用户当场批了 ⇒ 继续往下走', () async {
      final channel = FakeDeviceDataChannel(granted: false, requestResult: true);
      final tools = CapabilityTools(channel: channel);
      final result = await tools.readCalendar(<String, dynamic>{});
      expect((result as Map)['count'], 0);
      expect(channel.permissionRequests, 1);
      expect(channel.calendarReads, 1);
    });

    test('limit 有上限（不许把整本通讯录灌进上下文）', () async {
      final channel = FakeDeviceDataChannel();
      final tools = CapabilityTools(channel: channel);
      await tools.readCalendar(<String, dynamic>{'limit': 5000});
      expect(channel.lastLimit, 200);
      await tools.readCalendar(<String, dynamic>{'limit': 0});
      expect(channel.lastLimit, 50);
    });

    test('写日历缺标题 / 缺时间 ⇒ 明确失败', () async {
      final tools = CapabilityTools(channel: FakeDeviceDataChannel());
      await expectLater(
        tools.writeCalendar(<String, dynamic>{'start': '2026-11-03T10:00:00'}),
        throwsA(isA<FormatException>()),
      );
      await expectLater(
        tools.writeCalendar(<String, dynamic>{'title': '开会'}),
        throwsA(isA<FormatException>()),
      );
    });
  });

  group('⑥ 落盘往返：档位真的存得下', () {
    late Directory cfgDir;
    late File cfgFile;

    setUpAll(() async {
      cfgDir = await Directory.systemTemp.createTemp('shadow-cfg-cap');
      cfgFile = File('${cfgDir.path}/app_config.json');
    });

    setUp(() {
      // ⚠️ 单测里没有 `path_provider` 的平台实现 ⇒ ⇒ 落盘目标指向临时文件。
      AppConfigService.configFileOverride = () async => cfgFile;
    });

    tearDownAll(() {
      AppConfigService.configFileOverride = null;
    });

    test('写进去 → 换个实例重新读 ⇒ 还是那一档（走的是**磁盘**）', () async {
      final config = AppConfigService();
      await config.init();
      await config.setCapabilityModes(<String, String>{
        'contacts': 'full',
        'calendar_read': 'ask',
      });

      final reloaded = AppConfigService();
      await reloaded.init();
      expect(reloaded.capabilityModes['contacts'], 'full');
      expect(reloaded.capabilityModes['calendar_read'], 'ask');
    });

    test('落盘的档位回到策略里 ⇒ 认得出来，且**不影响别的能力**', () async {
      final config = AppConfigService();
      await config.init();
      await config.setCapabilityModes(<String, String>{'contacts': 'full'});

      final reloaded = AppConfigService();
      await reloaded.init();
      final policy = CapabilityPolicy.fromWire(reloaded.capabilityModes);
      expect(policy.modeFor(Capability.contacts), AuthorizationMode.fullAccess);
      // ⚠️ 别的能力**不受影响** ⇒ ⇒ 仍然是「每次询问」。
      expect(policy.modeFor(Capability.photos), AuthorizationMode.askEveryTime);
    });
  });

  group('⑦ 「彻底关闭」档：这个能力对模型**不存在**', () {
    test('关闭的能力工具**不进**发给模型的 tools 数组', () {
      final registry = registryWith(FakeDeviceDataChannel());
      final hidden = disabledCapabilityToolNames(
        registry,
        (capability) => capability == Capability.calendarRead
            ? AuthorizationMode.disabled
            : AuthorizationMode.askEveryTime,
      );
      expect(hidden, contains('calendar_read_events'));
      // ⚠️ 关掉「读日历」不许顺带关掉「写日历」⇒ ⇒ 分档按**能力**走。
      expect(hidden, isNot(contains('calendar_write_event')));
      // ⚠️ 普通工具没有能力 ⇒ ⇒ 永远不在这个集合里。
      expect(hidden, isNot(contains('set_theme')));

      final names = toOpenAiTools(registry, excludedNames: hidden)
          .map((tool) => (tool['function'] as Map)['name'])
          .toList();
      expect(names, isNot(contains('calendar_read_events')));
      expect(names, contains('calendar_write_event'));
      expect(names, contains('set_theme'));
    });

    test('端脑点名调一个「已关闭」的工具 ⇒ 明确失败 + 回传 + **没碰数据源**', () async {
      final channel = FakeDeviceDataChannel(
        events: [
          <String, Object?>{'id': '1', 'title': '站会'},
        ],
      );
      final client = _MockClient([
        StreamEvent(
          type: 'tool_call',
          name: 'calendar_read_events',
          args: <String, dynamic>{},
        ),
      ]);
      final notifier = ChatNotifier(
        _FakeTts(),
        client,
        clientTools: registryWith(channel),
        capabilityModeFor: (capability) =>
            capability == Capability.calendarRead
            ? AuthorizationMode.disabled
            : AuthorizationMode.fullAccess,
      );

      await notifier.generateResponse('我明天有什么安排');
      await waitForSettled(notifier);

      final call = lastToolCall(notifier);
      expect(call, isNotNull);
      // ⚠️ **明确失败** —— 不是「等你点头」，更不是「悄悄跑了」。
      expect(call!.status, ToolCallStatus.failed);
      expect(call.errorText, isNotNull);
      // ⚠️ **一个字节都不许去读** —— 这一档是「彻底」不许执行。
      expect(channel.calendarReads, 0);
      // ⚠️ 必须**回传** —— 否则模型会一直等一个永远不来的结果。
      expect(client.reports, hasLength(1));
      expect(client.reports.single['ok'], isFalse);
      final payload = client.reports.single['result'] as Map;
      expect(payload['capability'], 'calendar_read');
    });

    test('「彻底关闭」比「每次询问」更严 ⇒ 不许落到「等你点头」那格', () async {
      final channel = FakeDeviceDataChannel();
      final client = _MockClient([
        StreamEvent(
          type: 'tool_call',
          name: 'calendar_read_events',
          args: <String, dynamic>{},
        ),
      ]);
      final notifier = ChatNotifier(
        _FakeTts(),
        client,
        clientTools: registryWith(channel),
        capabilityModeFor: (_) => AuthorizationMode.disabled,
      );

      await notifier.generateResponse('我明天有什么安排');
      await waitForSettled(notifier);

      final call = lastToolCall(notifier)!;
      expect(call.status, isNot(ToolCallStatus.awaitingApproval));
      expect(call.status, ToolCallStatus.failed);
      expect(channel.calendarReads, 0);
    });

    test('档位落盘：disabled 的 wire 是 off，往返不丢', () {
      expect(AuthorizationMode.disabled.wire, 'off');
      expect(AuthorizationMode.fromWire('off'), AuthorizationMode.disabled);

      final policy = CapabilityPolicy.empty.withMode(
        Capability.sms,
        AuthorizationMode.disabled,
      );
      final restored = CapabilityPolicy.fromWire(policy.toWire());
      expect(restored.modeFor(Capability.sms), AuthorizationMode.disabled);
      expect(restored, policy);
    });
  });

  group('⑧ 平台差异：iOS 上**没有**短信这个能力', () {
    test('iOS ⇒ 短信不可用；其它能力都可用', () {
      expect(
        capabilitySupportedOn(Capability.sms, platform: TargetPlatform.iOS),
        isFalse,
      );
      expect(
        capabilitySupportedOn(
          Capability.contacts,
          platform: TargetPlatform.iOS,
        ),
        isTrue,
      );
      expect(
        capabilitySupportedOn(
          Capability.calendarRead,
          platform: TargetPlatform.iOS,
        ),
        isTrue,
      );
      expect(
        capabilitySupportedOn(Capability.photos, platform: TargetPlatform.iOS),
        isTrue,
      );
      // ⚠️ Android 上**都有** ⇒ ⇒ 短信不是「没实现」，是「iOS 没有」。
      expect(
        capabilitySupportedOn(Capability.sms, platform: TargetPlatform.android),
        isTrue,
      );
    });

    test('iOS ⇒ 短信工具**不进**发给模型的 tools 数组', () {
      final registry = registryWith(FakeDeviceDataChannel());
      final hidden = unsupportedCapabilityToolNames(
        registry,
        platform: TargetPlatform.iOS,
      );
      expect(hidden, contains('sms_read_messages'));
      expect(hidden, isNot(contains('calendar_read_events')));
      expect(hidden, isNot(contains('set_theme')));

      final names = toOpenAiTools(registry, excludedNames: hidden)
          .map((tool) => (tool['function'] as Map)['name'])
          .toList();
      expect(names, isNot(contains('sms_read_messages')));
      expect(names, contains('calendar_read_events'));
    });
  });

  group('⑨ 手机操作（mobile use）：操作这台手机本身', () {
    const mobileTools = <String>[
      'mobile_read_screen',
      'mobile_tap',
      'mobile_long_press',
      'mobile_swipe',
      'mobile_find_and_click',
      'mobile_global_action',
    ];

    test('六个工具都注册了，能力映射都是 mobileUse', () {
      final registry = registryWith(FakeDeviceDataChannel());
      for (final name in mobileTools) {
        final tool = registry.lookup(name);
        expect(tool, isNotNull, reason: '$name 没注册');
        expect(tool!.capability, Capability.mobileUse, reason: '$name 归错能力了');
      }
    });

    test('关掉「手机操作」⇒ 它的工具**不进** tools 数组，读日历还在', () {
      final registry = registryWith(FakeDeviceDataChannel());
      final hidden = disabledCapabilityToolNames(
        registry,
        (capability) => capability == Capability.mobileUse
            ? AuthorizationMode.disabled
            : AuthorizationMode.askEveryTime,
      );
      for (final name in mobileTools) {
        expect(hidden, contains(name), reason: '$name 没被关掉');
      }
      // ⚠️ 关掉「手机操作」不许顺带关掉「读日历」⇒ ⇒ 分档按**能力**走。
      expect(hidden, isNot(contains('calendar_read_events')));

      final names = toOpenAiTools(registry, excludedNames: hidden)
          .map((tool) => (tool['function'] as Map)['name'])
          .toList();
      for (final name in mobileTools) {
        expect(names, isNot(contains(name)), reason: '$name 还在 tools 数组里');
      }
      expect(names, contains('calendar_read_events'));
    });

    test('档位=每次询问 ⇒ 停在「等你点头」，且**没碰**无障碍服务', () async {
      final ops = FakeAccessibilityOps();
      final client = _MockClient([
        StreamEvent(
          type: 'tool_call',
          name: 'mobile_tap',
          args: <String, dynamic>{'x': 100, 'y': 200},
        ),
      ]);
      final notifier = ChatNotifier(
        _FakeTts(),
        client,
        clientTools: buildMobileClientTools(
          setAccentColor: (_) async {},
          setDarkMode: (_) async {},
          fetchSurfaceEvents: (_) async => const [],
          accessibilityOps: ops,
        ),
        capabilityModeFor: (_) => AuthorizationMode.askEveryTime,
      );

      await notifier.generateResponse('点一下屏幕右上角');

      final call = lastToolCall(notifier);
      expect(call!.status, ToolCallStatus.awaitingApproval);
      // ⚠️ 没点头 ⇒ ⇒ **一个手势都不许发**。
      expect(ops.calls, isEmpty);
    });

    test('档位=彻底关闭 ⇒ 被点名 ⇒ 明确失败 + 回传 + **没碰**无障碍服务', () async {
      final ops = FakeAccessibilityOps();
      final client = _MockClient([
        StreamEvent(
          type: 'tool_call',
          name: 'mobile_tap',
          args: <String, dynamic>{'x': 100, 'y': 200},
        ),
      ]);
      final notifier = ChatNotifier(
        _FakeTts(),
        client,
        clientTools: buildMobileClientTools(
          setAccentColor: (_) async {},
          setDarkMode: (_) async {},
          fetchSurfaceEvents: (_) async => const [],
          accessibilityOps: ops,
        ),
        capabilityModeFor: (_) => AuthorizationMode.disabled,
      );

      await notifier.generateResponse('点一下屏幕右上角');
      await waitForSettled(notifier);

      final call = lastToolCall(notifier)!;
      expect(call.status, ToolCallStatus.failed);
      // ⚠️ **一个手势都不许发** —— 这一档是「彻底」不许执行。
      expect(ops.calls, isEmpty);
      expect(client.reports, hasLength(1));
      expect(client.reports.single['ok'], isFalse);
    });

    test('iOS ⇒ 手机操作**不存在** ⇒ 它的工具**不进** tools 数组', () {
      expect(
        capabilitySupportedOn(
          Capability.mobileUse,
          platform: TargetPlatform.iOS,
        ),
        isFalse,
      );
      final registry = registryWith(FakeDeviceDataChannel());
      final hidden = unsupportedCapabilityToolNames(
        registry,
        platform: TargetPlatform.iOS,
      );
      for (final name in mobileTools) {
        expect(hidden, contains(name), reason: '$name 在 iOS 上不该出现');
      }
    });

    test('无障碍**未开启** ⇒ 明确失败（抛异常），不是假装成功', () async {
      final tools = CapabilityTools(
        accessibility: FakeAccessibilityOps(enabled: false),
      );
      await expectLater(
        tools.tap(<String, dynamic>{'x': 100, 'y': 200}),
        throwsA(isA<StateError>()),
      );
    });

    test('无障碍**已开启** ⇒ 真的去点了（坐标对得上）', () async {
      final ops = FakeAccessibilityOps();
      final tools = CapabilityTools(accessibility: ops);
      final result = await tools.tap(<String, dynamic>{'x': 100, 'y': 200});
      expect((result as Map)['tapped'], isTrue);
      expect(ops.calls, contains('tap:100.0,200.0'));
    });

    test('认不出来的全局动作 ⇒ 明确失败，不挑默认值', () async {
      final ops = FakeAccessibilityOps();
      final tools = CapabilityTools(accessibility: ops);
      await expectLater(
        tools.globalAction(<String, dynamic>{'action': '打开时光机'}),
        throwsA(isA<FormatException>()),
      );
      // ⚠️ **不许**静悄悄变成「返回」⇒ ⇒ 一个动作都不许发。
      expect(ops.calls, isEmpty);
    });
  });

  group('⑤ 权限声明：agent 自己声明需要哪些权限', () {
    test('声明与工具**真实**需要的那一档对得上 ⇒ 照常执行', () async {
      final channel = FakeDeviceDataChannel(
        events: [
          <String, Object?>{'id': '1', 'title': '站会'},
        ],
      );
      final client = _MockClient([
        StreamEvent(
          type: 'tool_call',
          name: 'calendar_read_events',
          args: <String, dynamic>{
            'required_permissions': ['calendar_read'],
          },
        ),
      ]);
      final notifier = ChatNotifier(
        _FakeTts(),
        client,
        clientTools: registryWith(channel),
        capabilityModeFor: (_) => AuthorizationMode.fullAccess,
      );

      await notifier.generateResponse('我明天有什么安排');
      await waitForSettled(notifier);

      final call = lastToolCall(notifier);
      expect(call!.status, ToolCallStatus.succeeded);
      expect(channel.calendarReads, 1);
      // ⚠️ 卡片上要写清楚「这次要哪个权限」⇒ ⇒ 用户点头前就知道。
      expect(call.requiredPermissions, ['calendar_read']);
    });

    test('声明了**这个工具不需要**的权限 ⇒ 明确失败，且一个字节都不许读', () async {
      final channel = FakeDeviceDataChannel();
      final client = _MockClient([
        StreamEvent(
          type: 'tool_call',
          name: 'calendar_read_events',
          args: <String, dynamic>{
            'required_permissions': ['calendar_write'],
          },
        ),
      ]);
      final notifier = ChatNotifier(
        _FakeTts(),
        client,
        clientTools: registryWith(channel),
        capabilityModeFor: (_) => AuthorizationMode.fullAccess,
      );

      await notifier.generateResponse('我明天有什么安排');
      await waitForSettled(notifier);

      final call = lastToolCall(notifier);
      expect(call!.status, ToolCallStatus.failed);
      // ⚠️ 越权的声明 ⇒ ⇒ **一个字节都不许读**。
      expect(channel.calendarReads, 0);
      // ⚠️ 失败要**回传端脑** ⇒ ⇒ 模型能学到下次改对。
      expect(client.reports, hasLength(1));
      expect(client.reports.single['ok'], isFalse);
      final payload = client.reports.single['result'] as Map;
      expect(payload['declared'], contains('calendar_write'));
      expect(payload['required'], contains('calendar_read'));
      // ⚠️ 错误文案里要点名那个**多出来的**权限（不含语种地断言）。
      expect(call.errorText, contains('calendar_write'));
    });

    test('没声明 ⇒ 宽容：按工具真实需要的那一档走', () async {
      final channel = FakeDeviceDataChannel();
      final client = _MockClient([
        StreamEvent(
          type: 'tool_call',
          name: 'calendar_read_events',
          args: <String, dynamic>{},
        ),
      ]);
      final notifier = ChatNotifier(
        _FakeTts(),
        client,
        clientTools: registryWith(channel),
        capabilityModeFor: (_) => AuthorizationMode.fullAccess,
      );

      await notifier.generateResponse('我明天有什么安排');
      await waitForSettled(notifier);

      expect(lastToolCall(notifier)!.status, ToolCallStatus.succeeded);
      expect(channel.calendarReads, 1);
    });

    test('系统**拒绝再弹** ⇒ 错误文案要说「去系统设置」（不是「用户没给」）', () async {
      final channel = FakeDeviceDataChannel(
        granted: false,
        requestResult: false,
        permanentlyDenied: true,
      );
      final tools = CapabilityTools(channel: channel);
      await expectLater(
        tools.readCalendar(<String, dynamic>{}),
        throwsA(
          isA<StateError>().having(
            (e) => e.message,
            'message',
            contains('system settings'),
          ),
        ),
      );
    });
  });
}