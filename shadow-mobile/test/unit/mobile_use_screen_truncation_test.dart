import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/accessibility_controller.dart';
import 'package:shadow_mobile/services/capabilities/accessibility_ops.dart';
import 'package:shadow_mobile/services/capabilities/capability_tools.dart';

/// 假的无障碍层 —— 只回一个**预设的字符串**。
///
/// ⚠️ 为什么能这么假：`AccessibilityOps` 存在的意义就是「生产走真机、
/// 单测塞假的」⇒ ⇒ 这条路的正路径（真机读屏）钉不住，
/// 但「读回来的**文本**怎么处理」是可以钉的 ⇒ ⇒ 那才是这组用例管的。
class _FakeA11y extends AccessibilityOps {
  _FakeA11y({required this.enabled, required this.screen});

  final bool enabled;
  final String? screen;

  @override
  Future<bool> isEnabled() async => enabled;

  @override
  Future<String?> readScreen() async => screen;

  @override
  Future<bool> tap(double x, double y) async => false;

  @override
  Future<bool> longPress(double x, double y) async => false;

  @override
  Future<bool> swipe(
    double x1,
    double y1,
    double x2,
    double y2,
    int durationMs,
  ) async =>
      false;

  @override
  Future<bool> findAndClickByText(String text) async => false;

  @override
  Future<bool> globalAction(GlobalAction action) async => false;
}

/// **读屏的截断必须是显式的** —— 静悄悄截断会让模型以为它看全了屏幕。
///
/// ⚠️ 这组用例的存在理由：原生侧的树遍历**原来没有任何上限** ⇒ ⇒ 一屏
/// WebView 就能灌进几万 token ⇒ ⇒ 现在原生侧有预算了 ⇒ ⇒ 但「截断了
/// 这件事**有没有被告诉模型**」是**这一层**的责任 ⇒ ⇒ 钉在这里。
void main() {
  Future<Map<String, dynamic>> read(String? screen, {bool enabled = true}) async {
    final tools = CapabilityTools(
      accessibility: _FakeA11y(enabled: enabled, screen: screen),
    );
    final res = await tools.readScreen(<String, dynamic>{});
    expect(res, isA<Map<String, dynamic>>());
    return res as Map<String, dynamic>;
  }

  test('没截断 ⇒ truncated=false', () async {
    final r = await read('[android.widget.TextView]\n  text: 你好');
    expect(r['truncated'], isFalse);
    // length 必须与原文**逐字**一致（UTF-16 码元数）⇒ ⇒ 别写成常量。
    expect(r['length'], (r['screen'] as String).length);
  });

  test('原生侧加了 [truncated] 标记 ⇒ truncated=true', () async {
    final r = await read('[android.widget.TextView]\n  text: 你好\n[truncated]');
    expect(r['truncated'], isTrue);
  });

  test('标记后面还有空白 ⇒ 仍然算截断', () async {
    final r = await read('  一些内容\n[truncated]\n\n');
    expect(r['truncated'], isTrue);
  });

  test('标记出现在**中间**不算截断（只有末尾才算）', () async {
    final r = await read('[truncated]\n后面还有内容');
    expect(r['truncated'], isFalse);
  });

  test('无障碍服务没开 ⇒ 明确失败，不是空屏', () async {
    await expectLater(
      read('whatever', enabled: false),
      throwsA(isA<StateError>()),
    );
  });
}
