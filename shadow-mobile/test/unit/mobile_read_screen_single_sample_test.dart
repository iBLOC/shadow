import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/accessibility_controller.dart';
import 'package:shadow_mobile/services/capabilities/accessibility_ops.dart';
import 'package:shadow_mobile/services/capabilities/capability_tools.dart';

/// **读屏的「一次采样」** —— 树与「这是谁的屏」必须**同源**。
///
/// ## 为什么这组用例存在（2026-11-11 真机实测）
///
/// ⚠️ 真机逐字读数：
/// `--- OTHER APP PKG --- source=android-a11y pkg=com.android.settings rawPkg=com.miui.home`
/// ⇒ ⇒ **同一时刻**，工具层说「设置」、原生说「桌面」
/// ⇒ ⇒ 而两者本该是**同一件事的两面** ⇒ ⇒ ⇒ **张冠李戴**。
///
/// ## 根因
///
/// ⇒ ⇒ 树取一次 `rootInActiveWindow`、包名**再取一次**
/// ⇒ ⇒ 两次之间前台**可能换人** ⇒ ⇒ 而两个字段**各自都「有值」**
/// ⇒ ⇒ ⇒ **矛盾长得像正常** ⇒ ⇒ 「失败长得像成功」的一族。
///
/// ## 修法
///
/// ⇒ ⇒ **一次采样**：原生侧一次取 root，同时给出树与包名
/// ⇒ ⇒ 工具层改走那一次 ⇒ ⇒ 两者**不可能**矛盾。
///
/// ⇒ ⇒ **通用形态：一个回答里的多个事实必须来自同一次采样**
/// ⇒ ⇒ 否则它们之间可以互相矛盾 ⇒ ⇒ 而矛盾长得像正常。
class _FakeA11y extends AccessibilityOps {
  _FakeA11y({
    required this.enabled,
    this.screen,
    this.snapshot,
    this.fakeForegroundPackage,
  });

  final bool enabled;
  final String? screen;

  /// **一次采样**的那一份（树 ＋ 包名**同源**）。
  final Map<String, dynamic>? snapshot;

  /// 「前台是谁」—— 分两次问的那一份（**故意与快照不一致**）。
  final String? fakeForegroundPackage;

  /// ⚠️ **调用计数** ⇒ ⇒ 证明工具层走的是**哪一条路**。
  ///
  /// ⚠️ 为什么必须计数：只断言**结果**不够 —— 结果对但走了两条路，
  /// ⇒ ⇒ 那个「对」是**巧合** ⇒ ⇒ 下次前台一换就张冠李戴 ⇒ ⇒ ⇒
  /// ⇒ ⇒ **断言「它被调用过」**才是承重的（这与「替身空转」同族）。
  int snapshotCalls = 0;
  int separatePkgCalls = 0;

  @override
  Future<Map<String, dynamic>?> readScreenSnapshot() async {
    snapshotCalls++;
    return snapshot;
  }

  @override
  Future<String?> foregroundPackage() async {
    separatePkgCalls++;
    return fakeForegroundPackage;
  }

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

void main() {
  group('读屏 ⇒ 树与「这是谁的屏」必须**同一次采样**', () {
    test('走**一次采样**那条路 ⇒ ⇒ 不许再单独问一次包名', () async {
      final _FakeA11y fake = _FakeA11y(
        enabled: true,
        snapshot: <String, dynamic>{
          'screen': 'node A',
          'package': 'com.android.settings',
        },
        // ⚠️ **故意不一致** ⇒ ⇒ 若工具层去问这一份 ⇒ ⇒ 结果就会错。
        fakeForegroundPackage: 'com.miui.home',
      );
      final Map<String, dynamic> r =
          (await CapabilityTools(accessibility: fake)
                  .readScreen(<String, dynamic>{}))
              as Map<String, dynamic>;

      expect(r['foregroundPackage'], 'com.android.settings');
      expect(r['screen'], 'node A');
      expect(
        fake.snapshotCalls,
        greaterThan(0),
        reason: '一次采样那条路**根本没被走** ⇒ ⇒ 这一格钉不住',
      );
      expect(
        fake.separatePkgCalls,
        equals(0),
        reason: '工具层**又单独问了一次**包名 ⇒ ⇒ 两次采样可能落在不同窗口'
            ' ⇒ ⇒ 张冠李戴（真机实测过）',
      );
    });

    /// ⚠️⚠️⚠️ **快照失败 ⇒ ⇒ 宁可「不知道」，也不许另问一次**（2026-11-11）
    /// ⇒ ⇒ 另问一次 = **第二次独立采样** ⇒ ⇒ 那正是本条修掉的那个缺陷 ⇒ ⇒
    /// ⇒ ⇒ ⇒ 而「快照失败」与「另问能成」几乎**不可能同时发生**
    /// ⇒ ⇒ ⇒ ⇒ （两者是**同一段遍历逻辑**的两个出口 ⇒ ⇒ 判空条件相同）
    /// ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **「同源」不是「快照成功时」的性质**
    /// ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 它是**无条件**性质。
    test('**没提供**一次采样 ⇒ ⇒ **不许**再单独问一次包名 ⇒ ⇒ 那一格回 null', () async {
      final _FakeA11y fake = _FakeA11y(
        enabled: true,
        screen: 'node A',
        // ⚠️ **故意给一个看着很真的值** ⇒ ⇒ 若工具层去问它 ⇒ ⇒ 就会报出来。
        fakeForegroundPackage: 'com.miui.home',
      );
      final Map<String, dynamic> r =
          (await CapabilityTools(accessibility: fake)
                  .readScreen(<String, dynamic>{}))
              as Map<String, dynamic>;
      expect(r['screen'], 'node A');
      expect(r.containsKey('foregroundPackage'), isTrue);
      expect(
        r['foregroundPackage'],
        isNull,
        reason: '快照失败却报出了包名 ⇒ ⇒ 那一定来自**另一次独立采样**'
            ' ⇒ ⇒ 两次采样可能落在不同窗口 ⇒ ⇒ 张冠李戴（真机实测过）'
            ' ⇒ ⇒ ⇒ **宁可说「不知道」，也不许给可能错的归属**',
      );
      expect(
        fake.snapshotCalls,
        equals(1),
        reason: '一次采样**问都没问** ⇒ ⇒ 拿不到就没试过 ⇒ ⇒ 读数失真',
      );
      expect(
        fake.separatePkgCalls,
        equals(0),
        reason: '工具层**又单独问了一次**包名 ⇒ ⇒ 那条活路必须**没有**'
            ' ⇒ ⇒ 否则「同源」只是「快照成功时」的性质',
      );
    });

    test('**两条路都不通** ⇒ ⇒ 明确失败（不许给半截答案）', () async {
      final _FakeA11y fake = _FakeA11y(enabled: false);
      await expectLater(
        CapabilityTools(accessibility: fake).readScreen(<String, dynamic>{}),
        throwsA(anything),
      );
    });
  });
}
