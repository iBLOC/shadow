import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/agui/agui_tool_outcome_gate.dart';

/// 结算闸的判据 —— 钉的是**机制**：一次调用只兑现一次、没登记的不兑现、
/// 放弃时**每一条都兑现成失败**（模型不许干等）。
///
/// ⚠️ **与桌面端 `src/lib/agui/__tests__/aguiGate.test.ts` 逐字对等**。
void main() {
  group('ToolOutcomeGate', () {
    test('兑现一次就生效 —— 第二次不兑现(模型只看见一条结果)', () async {
      final ToolOutcomeGate gate = ToolOutcomeGate();
      final Future<AguiToolOutcome> p = gate.open('c1');
      expect(gate.isOpen('c1'), isTrue);
      expect(
        gate.settle('c1', const AguiToolOutcome(ok: true, content: 'done')),
        isTrue,
      );
      expect(
        gate.settle('c1', const AguiToolOutcome(ok: true, content: 'again')),
        isFalse,
      );
      final AguiToolOutcome settled = await p;
      expect(settled.ok, isTrue);
      expect(settled.content, 'done');
      expect(gate.openCount, 0);
    });

    test('没登记过的 id ⇒ ⇒ 不兑现(不许凭空多一条结果)', () {
      final ToolOutcomeGate gate = ToolOutcomeGate();
      expect(
        gate.settle(
          'never-opened',
          const AguiToolOutcome(ok: true, content: 'x'),
        ),
        isFalse,
      );
    });

    test('放弃全部 ⇒ ⇒ 每条都兑现成失败(模型不干等)', () async {
      final ToolOutcomeGate gate = ToolOutcomeGate();
      final Future<AguiToolOutcome> a = gate.open('c1');
      final Future<AguiToolOutcome> b = gate.open('c2');
      gate.abandonAll('页面被关掉了');
      final AguiToolOutcome oa = await a;
      expect(oa.ok, isFalse);
      expect(oa.error, '页面被关掉了');
      final AguiToolOutcome ob = await b;
      expect(ob.ok, isFalse);
      expect(ob.error, '页面被关掉了');
      expect(gate.openCount, 0);
    });

    test('失败的原因不许留空(空着＝把失败说成成功)', () {
      expect(failedOutcome('   ').error, isNotEmpty);
      expect(failedOutcome('boom').error, 'boom');
    });
  });
}
