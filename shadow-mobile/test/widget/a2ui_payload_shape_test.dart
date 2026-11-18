import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/a2ui/a2ui_surface_events.dart';

import '../support/a2ui_fixture.dart';
import 'test_helper.dart';

/// A2UI 载荷的**形状**必须说真话。
///
/// ## 为什么钉这个
///
/// 官方 v1.0 要求 `parts[].data` 是**对象**。对端若把它发成 JSON **字符串**
/// ⇒ ⇒ 官方 SDK 的提取器**只认 Map** ⇒ ⇒ **整条消息被跳过**
/// ⇒ ⇒ 界面上「什么都没有」⇒ ⇒ **失败长得像成功**。
///
/// 桌面端那一侧**已经**会响亮报（`a2uiProtocol.ts` 的 `extractA2uiMessages`
/// 会 push 一条 warning：「端脑把 A2UI 载荷发成了 JSON 字符串（官方 v1.0 要求是对象）」）
/// ⇒ ⇒ 本仓若还静默吞 ⇒ ⇒ **两端宽严不同**：同一个坏载荷，桌面端说得出
/// 「这是字符串形状」，手机上什么都看不见 ⇒ ⇒ 跨端一致性那一格就开着了。
///
/// ⇒ ⇒ 这条判据钉的是「**两端一致**」那一格。
void main() {
  testSetup();

  test('载荷是对象 ⇒ 探测器**不**报警（v1.0 正常路径不受影响）', () {
    final events = a2uiFixtureEvents();
    expect(hasStringA2uiPayload(events), isFalse);
    // ⇒ ⇒ 真字节那一路**照旧**认得出 v1.0 消息（别把好路径误伤）
    expect(a2uiV1MessagesFromEvents(events).isNotEmpty, isTrue);
  });

  test('载荷是 JSON 字符串 ⇒ 探测器**认得出来**（不许静默吞）', () {
    final events = a2uiFixtureEventsWithStringPayload();
    expect(hasStringA2uiPayload(events), isTrue);
    // ⚠️ 它**同时**认不出 v1.0 消息 ⇒ ⇒ 这正是「界面空白」的成因
    expect(a2uiV1MessagesFromEvents(events), isEmpty);
  });

  test('服务层：字符串载荷 ⇒ **响亮地报错**（不是静默空白）', () async {
    final service = await a2uiFixtureService(
      body: a2uiSseOf(a2uiFixtureEventsWithStringPayload()),
    );
    addTearDown(service.dispose);
    final errors = <String?>[];
    final sub = service.errorReasonStream.listen(errors.add);
    addTearDown(sub.cancel);

    service.sendMessage('hello');
    await pumpEventQueue();

    expect(
      service.lastError,
      contains('端脑把 A2UI 载荷发成了 JSON 字符串'),
    );
    expect(
      errors.where((e) => e != null).join(),
      contains('JSON 字符串'),
    );
  });

  test('服务层：正常对象载荷 ⇒ **不报这一条**（别误伤）', () async {
    final service = await a2uiFixtureService();
    addTearDown(service.dispose);

    service.sendMessage('hello');
    await pumpEventQueue();

    expect(service.lastError, isNull);
  });
}
