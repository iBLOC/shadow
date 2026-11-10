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
  _FakeA11y({
    required this.enabled,
    required this.screen,
    this.fakeForegroundPackage,
  });

  final bool enabled;
  final String? screen;

  /// ⚠️ **一次采样**的那一份（树 ＋ 包名**同源**）——
  /// ⇒ ⇒ 产品走的是**这条**路（2026-11-11 起：工具层不再分两次问）
  /// ⇒ ⇒ ⇒ 所以这里的假实现也必须**提供**它 ⇒ ⇒ 否则测的是一条**已废弃**的路。
  Map<String, dynamic>? get snapshot =>
      screen == null
          ? null
          : <String, dynamic>{
              'screen': screen,
              'package': fakeForegroundPackage,
            };

  @override
  Future<Map<String, dynamic>?> readScreenSnapshot() async => snapshot;

  /// 「前台是谁」—— 假的那一份 ⇒ ⇒ 单测钉得住。
  ///
  /// ⚠️ 抽象层给了**默认实现**（回 null）⇒ ⇒ 假实现**可以不改**
  /// ⇒ ⇒ 而这里**故意改**：要证明工具层真的走**可注入**的这一层
  /// ⇒ ⇒ （若它直连静态控制器 ⇒ ⇒ 单测就测不到 ⇒ ⇒ 只能真机验）。
  final String? fakeForegroundPackage;

  @override
  Future<String?> foregroundPackage() async => fakeForegroundPackage;

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

  test('原生那棵树 ⇒ 「前台是谁」取自**注入的无障碍层**（不是静态直连）', () async {
    final tools = CapabilityTools(
      accessibility: _FakeA11y(
        enabled: true,
        screen: '[android.widget.TextView]\n  text: 日历',
        fakeForegroundPackage: 'com.android.calendar',
      ),
    );
    final res = await tools.readScreen(<String, dynamic>{});
    final map = res as Map<String, dynamic>;
    // ⚠️ 这一格是**承重**的：若工具层直连静态控制器 ⇒ ⇒ 这里拿到的会是 null
    // ⇒ ⇒ 「模型怎么用『这是谁的屏』」就只剩真机能验 ⇒ ⇒ CI 永远静悄悄绿。
    expect(map['foregroundPackage'], 'com.android.calendar');
  });
}
