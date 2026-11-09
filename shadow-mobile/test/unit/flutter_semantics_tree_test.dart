import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/accessibility_controller.dart';
import 'package:shadow_mobile/services/capabilities/accessibility_ops.dart';
import 'package:shadow_mobile/services/capabilities/capability_tools.dart';
import 'package:shadow_mobile/services/capabilities/flutter_semantics_tree.dart';

/// 假的无障碍层 —— 原生那棵树在这里**读不到**（自家窗口的典型情形）。
class _FakeA11y extends AccessibilityOps {
  _FakeA11y({required this.enabled, required this.screen, this.geometry});

  final bool enabled;
  final String? screen;

  /// 自家窗口在屏幕上的原点 —— null ＝ 「原生量不到」
  /// ⇒ ⇒ 工具层就**不换算**（保持本窗口口径）。
  final Map<String, double>? geometry;

  @override
  Future<bool> isEnabled() async => enabled;

  @override
  Future<String?> readScreen() async => screen;

  @override
  Future<Map<String, double>?> viewGeometry() async => geometry;

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

/// **自家 app 自己的界面模型** —— 这一族钉的是「模型看得见自己 app 的屏幕」。
///
/// ## 为什么这组用例存在
///
/// Android 无障碍框架**不把宿主自己的窗口**交给它自己绑定的那个服务
/// ⇒ ⇒ 原生那棵树在自家窗口上**必然是空的**
/// ⇒ ⇒ 读屏在自家窗口上**没东西** ⇒ ⇒ 模型看不懂自己 app 的屏幕
/// ⇒ ⇒ 而「模型在自己 app 里干活」正是手机操作这条线的主战场。
///
/// ⚠️ 这一族**不需要真机** —— Flutter 的语义树在单测里就能造出来
/// （`tester.ensureSemantics()`）⇒ ⇒ 所以它能进 CI。
void main() {
  const Key targetKey = Key('target');

  /// 一个带文字的按钮 ＋ 一个标题（够树长出来）。
  Future<void> pumpApp(WidgetTester tester, {required VoidCallback onTap}) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Column(
            children: <Widget>[
              const Text('影'),
              Padding(
                padding: const EdgeInsets.only(left: 10, top: 20),
                child: SizedBox(
                  key: targetKey,
                  width: 100,
                  height: 50,
                  child: ElevatedButton(
                    onPressed: onTap,
                    child: const Text('确定'),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    await tester.pump();
  }

  testWidgets('自家 app 的界面 ⇒ 树里看得见文字与角色', (tester) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpApp(tester, onTap: () {});

    final FlutterSemanticsSnapshot? snapshot =
        FlutterSemanticsTree.read();
    expect(snapshot, isNotNull, reason: '语义树都没拿到 ⇒ ⇒ 这一层根本没跑');
    expect(snapshot!.text, contains('text: 确定'));
    expect(snapshot.text, contains('text: 影'));
    expect(snapshot.text, contains('[button]'));
    // ⚠️ 头一行必须**说清这是哪棵树** ⇒ ⇒ 模型才知道自己看的是什么。
    expect(snapshot.text, contains('source=flutter-semantics'));
    handle.dispose();
  });

  testWidgets('坐标是**本窗口物理像素**（逻辑 × dpr），不是整屏坐标', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpApp(tester, onTap: () {});

    final FlutterSemanticsSnapshot? snapshot =
        FlutterSemanticsTree.read();
    expect(snapshot, isNotNull);
    final Rect logical = tester.getRect(find.byKey(targetKey));
    // ⚠️ 语义树的坐标**本来就是物理像素**（RenderView 的 rootTransform
    // 里含 dpr）⇒ ⇒ 期望值 = 逻辑 × 设备像素比
    // ⇒ ⇒ 谁在这里多乘一次 dpr，这条用例就红。
    final double dpr = tester.view.devicePixelRatio;
    final String expected =
        'viewBounds: ${(logical.left * dpr).round()},${(logical.top * dpr).round()},'
        '${(logical.right * dpr).round()},${(logical.bottom * dpr).round()}';
    expect(
      snapshot!.text,
      contains(expected),
      reason: '坐标换算错了 ⇒ ⇒ 模型照着点会点歪 ⇒ ⇒ 那一族是「点歪了」',
    );
    handle.dispose();
  });

  testWidgets('预算用完 ⇒ 显式标 [truncated]（不许静悄悄截断）', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpApp(tester, onTap: () {});

    final FlutterSemanticsSnapshot? snapshot =
        FlutterSemanticsTree.read(maxChars: 60);
    expect(snapshot, isNotNull);
    expect(snapshot!.truncated, isTrue);
    expect(snapshot.text.trimRight(), endsWith('[truncated]'));
    handle.dispose();
  });

  testWidgets('按文字点 ⇒ **控件自己的回调**被触发（不是「派发出去了」）', (
    WidgetTester tester,
  ) async {
    int taps = 0;
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpApp(tester, onTap: () => taps++);

    expect(FlutterSemanticsTree.tapByText('确定'), isTrue);
    await tester.pump();
    expect(
      taps,
      1,
      reason: '控件自己的回调没被触发 ⇒ ⇒ 那一件东西**没被点到**',
    );
    handle.dispose();
  });

  testWidgets('原生树读不到 + 自家 app 在前台 ⇒ 回落自家界面并**标明来源**', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpApp(tester, onTap: () {});

    final CapabilityTools tools = CapabilityTools(
      accessibility: _FakeA11y(enabled: true, screen: null),
      ownAppInForeground: () => true,
    );
    final Object? result = await tools.readScreen(<String, dynamic>{});
    final Map<String, dynamic> map = result as Map<String, dynamic>;
    expect(map['source'], kScreenSourceFlutterSemantics);
    expect(map['coordinateSpace'], kCoordinateSpaceView);
    expect(map['screen'], contains('text: 确定'));
    // ⚠⚠️ **「这是谁的屏」这一格不许缺** —— 回落分支也必须带这个键
    // ⇒ ⇒ 两条分支的**形状**必须一样 ⇒ ⇒ 模型不许靠「有没有这个键」
    // ⇒ ⇒ 去猜这是哪棵树 ⇒ ⇒ 而回落的前提**就是**自家 app 在前台
    // ⇒ ⇒ 答案就是自家包名。
    expect(map['foregroundPackage'], kOwnAppPackage);
    handle.dispose();
  });

  testWidgets('原生树有内容 ⇒ **不许**回落（两棵树不许混为一谈）', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpApp(tester, onTap: () {});

    final CapabilityTools tools = CapabilityTools(
      accessibility: _FakeA11y(
        enabled: true,
        screen: '[android.widget.TextView]\n  text: 设置',
      ),
      ownAppInForeground: () => true,
    );
    final Object? result = await tools.readScreen(<String, dynamic>{});
    final Map<String, dynamic> map = result as Map<String, dynamic>;
    expect(map['source'], kScreenSourceAndroidA11y);
    expect(map['coordinateSpace'], kCoordinateSpaceScreen);
    expect(map['screen'], contains('设置'));
    // ⚠️ **负控**：自家那棵树一个字都不许混进来。
    expect(map['screen'], isNot(contains('确定')));
    handle.dispose();
  });

  testWidgets('自家 app 不在前台 ⇒ **不许**回落 ⇒ 明确失败', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpApp(tester, onTap: () {});

    final CapabilityTools tools = CapabilityTools(
      accessibility: _FakeA11y(enabled: true, screen: null),
      ownAppInForeground: () => false,
    );
    await expectLater(
      tools.readScreen(<String, dynamic>{}),
      throwsA(isA<StateError>()),
      reason: '在别人的屏幕上显示自家 app 的界面 ⇒ ⇒ 那是「失败长得像成功」',
    );
    handle.dispose();
  });

  testWidgets('按文字点击：自家窗口 ⇒ 走语义动作（不用坐标）', (
    WidgetTester tester,
  ) async {
    int taps = 0;
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpApp(tester, onTap: () => taps++);

    final CapabilityTools tools = CapabilityTools(
      accessibility: _FakeA11y(enabled: true, screen: null),
      ownAppInForeground: () => true,
    );
    final Object? result =
        await tools.findAndClick(<String, dynamic>{'text': '确定'});
    final Map<String, dynamic> map = result as Map<String, dynamic>;
    expect(map['clicked'], isTrue);
    expect(map['source'], kScreenSourceFlutterSemantics);
    await tester.pump();
    expect(taps, 1, reason: '控件自己的回调没被触发 ⇒ ⇒ 那一件东西没被点到');
    handle.dispose();
  });

  testWidgets('**负控**：在别人的屏幕上找不到那个字 ⇒ 不许去点自家 app', (
    WidgetTester tester,
  ) async {
    int taps = 0;
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpApp(tester, onTap: () => taps++);

    final CapabilityTools tools = CapabilityTools(
      accessibility: _FakeA11y(
        enabled: true,
        screen: '[android.widget.TextView]\n  text: 设置',
      ),
      ownAppInForeground: () => true,
    );
    await expectLater(
      tools.findAndClick(<String, dynamic>{'text': '确定'}),
      throwsA(isA<StateError>()),
    );
    expect(
      taps,
      0,
      reason: '在别人的 app 里找不到那个字 ⇒ ⇒ 回落去点自家 app ⇒ ⇒ 那会点到一个用户没要求的东西',
    );
    handle.dispose();
  });

  testWidgets('窗口原点已知 ⇒ 坐标升级成**整屏口径**（字段名与原生那棵一样）', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpApp(tester, onTap: () {});

    final FlutterSemanticsSnapshot? snapshot = FlutterSemanticsTree.read(
      viewOrigin: const ViewOrigin(37, 11),
    );
    expect(snapshot, isNotNull);
    expect(snapshot!.coordinateSpace, kCoordinateSpaceScreen);
    // ⚠️ 同一个字段名 bounds ⇒ ⇒ **同一个口径**（原生那棵也用它）。
    expect(snapshot.text, contains('bounds:'));
    // ⚠️ 本窗口口径**不许同时出现** ⇒ ⇒ 两套坐标不许混在一起。
    expect(snapshot.text, isNot(contains('viewBounds:')));
    // ⚠️ 整屏值 ＝ 本窗口值 ＋ 原点 ⇒ ⇒ 差一个偏移就红。
    final Rect logical = tester.getRect(find.byKey(targetKey));
    final double dpr = tester.view.devicePixelRatio;
    final String expected =
        'bounds: ${(logical.left * dpr).round() + 37},'
        '${(logical.top * dpr).round() + 11},'
        '${(logical.right * dpr).round() + 37},'
        '${(logical.bottom * dpr).round() + 11}';
    expect(
      snapshot.text,
      contains(expected),
      reason: '原点换算错了 ⇒ ⇒ 模型照着点会点歪 ⇒ ⇒ 那一族是「点歪了」',
    );
    handle.dispose();
  });

  testWidgets('工具层：原点已知 ⇒ 回落结果按**整屏口径**回报', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpApp(tester, onTap: () {});

    final CapabilityTools tools = CapabilityTools(
      accessibility: _FakeA11y(
        enabled: true,
        screen: null,
        geometry: <String, double>{'originX': 37, 'originY': 11},
      ),
      ownAppInForeground: () => true,
    );
    final Object? result = await tools.readScreen(<String, dynamic>{});
    final Map<String, dynamic> map = result as Map<String, dynamic>;
    expect(map['source'], kScreenSourceFlutterSemantics);
    // ⚠️ 口径**跟着快照**走 ⇒ ⇒ 拿到原点 ⇒ ⇒ 整屏口径。
    expect(map['coordinateSpace'], kCoordinateSpaceScreen);
    expect(map['screen'], contains('bounds:'));
    expect(map['screen'], isNot(contains('viewBounds:')));
    handle.dispose();
  });

  testWidgets('语义树存在但**一个带字节点都没有** ⇒ 回 null', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: SizedBox.expand())),
    );
    await tester.pump();

    // ⚠️ 先确认树**确实存在** ⇒ ⇒ 否则这条用例是空绿（什么都没测到）。
    expect(FlutterSemanticsTree.rootNode(), isNotNull);
    expect(
      FlutterSemanticsTree.read(),
      isNull,
      reason: '空树当成成功 ⇒ ⇒ 模型以为「这一屏是空的」⇒ ⇒ 那是「失败长得像成功」',
    );
    handle.dispose();
  });

  testWidgets('工具层：自家树是空的 ⇒ **明确失败**（不许回一棵只有头行的树）', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await tester.pumpWidget(
      const MaterialApp(home: Scaffold(body: SizedBox.expand())),
    );
    await tester.pump();

    final CapabilityTools tools = CapabilityTools(
      accessibility: _FakeA11y(enabled: true, screen: null),
      ownAppInForeground: () => true,
    );
    await expectLater(
      tools.readScreen(<String, dynamic>{}),
      throwsA(isA<StateError>()),
    );
    handle.dispose();
  });
}