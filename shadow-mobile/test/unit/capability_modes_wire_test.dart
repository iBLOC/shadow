import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/capabilities/capability.dart';
import 'package:shadow_mobile/services/capabilities/capability_declaration.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// **「档位进端脑」那一格** —— 客户端把「用户给每个能力配了哪一档」
/// 随消息发出去。
///
/// ⚠️ 为什么这一格要有判据：
/// 「端脑知不知道用户配的档位」这件事，**在客户端这一侧**是可以钉死的
/// ⇒ ⇒ 而它在端脑那一侧还欠着 ⇒ ⇒ **所以这一格不能靠「端脑以后会看到」
/// 来担保** ⇒ ⇒ 得有**自己**的读数。
void main() {
  group('档位随消息发出去（客户端这一半）', () {
    test('键名是 snake_case 的 capability_modes（与端脑那条规矩同形）', () {
      expect(capabilityModesKey, 'capability_modes');
    });

    test('每个能力都带上了它那一档（值取自档位的 wire）', () {
      final payload = capabilityModesPayload((c) => switch (c) {
            Capability.calendarRead => AuthorizationMode.askEveryTime,
            Capability.calendarWrite => AuthorizationMode.fullAccess,
            Capability.contacts => AuthorizationMode.disabled,
            Capability.sms => AuthorizationMode.askEveryTime,
            Capability.photos => AuthorizationMode.askEveryTime,
            Capability.notificationsRead => AuthorizationMode.askEveryTime,
            Capability.mobileUse => AuthorizationMode.fullAccess,
          });
      expect(payload, {
        'calendar_read': 'ask',
        'calendar_write': 'full',
        'contacts': 'off',
        'sms': 'ask',
        'photos': 'ask',
        'notifications_read': 'ask',
        'mobile_use': 'full',
      });
    });

    test('请求体里真的有这一段（不是「构造了但没发出去」）', () {
      final req = SendMessageRequest(
        text: 'hi',
        capabilityModes: capabilityModesPayload((c) => AuthorizationMode.fullAccess),
      );
      final json = jsonDecode(jsonEncode(req.toJson()));
      expect(json.containsKey('capability_modes'), isTrue);
      expect(json['capability_modes']['calendar_read'], 'full');
    });

    test('⚠️ 没配 ⇒ ⇒ 不发这一段（不留空壳）', () {
      final json = SendMessageRequest(text: 'hi').toJson();
      expect(json.containsKey('capability_modes'), isFalse);
    });

    test('⚠️ 老端脑不认识这个字段 ⇒ ⇒ 也不该报错（字段是可选的）', () {
      // ⚠️ 这一格是「无害」的**前提**：端脑那边 serde 忽略未知字段。
      // ⇒ ⇒ 所以客户端**不必等端脑先改**就能先把这半边做掉。
      final json = SendMessageRequest(
        text: 'hi',
        capabilityModes: const {'calendar_read': 'ask'},
      ).toJson();
      // ⇒ ⇒ 键是**多出来**的一个，不是**替掉**任何一个 ⇒ ⇒ 老端脑照常解析。
      expect(json.containsKey('text'), isTrue);
      expect(json.containsKey('capability_modes'), isTrue);
    });

    test('档位取值只有三种（ask／full／off）⇒ ⇒ 认不出来的档位不许发出去', () {
      final payload = capabilityModesPayload((c) => AuthorizationMode.fromWire('nonsense'));
      // ⚠️ `fromWire` 认不出来 ⇒ ⇒ **fail-closed** ⇒ ⇒ 退成「每次询问」。
      expect(payload.values.every((v) => v == 'ask'), isTrue);
    });
  });
}
