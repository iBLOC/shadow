import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/capabilities/flutter_semantics_tree.dart';

/// **滑动正路径** —— 「滑到哪一项，树里就看得见哪一项；看得见的，就能点得到」。
///
/// ## 为什么这一族存在
///
/// 手机操作这条线里，`mobile_swipe` 一直摆在那儿 ⇒ ⇒ 但**没有一条判据**
/// 钉住「滑 ⇒ ⇒ 目标项进入语义树 ⇒ ⇒ 模型看得见它 ⇒ ⇒ 按文字能点中它」。
/// ⇒ ⇒ 三处可能各坏各的，而**每一处单独坏掉都长得像成功**：
/// - 滑动没生效 ⇒ ⇒ 树没变 ⇒ ⇒ 模型只是「没找到」（看着像目标不存在）；
/// - 树没跟着滚 ⇒ ⇒ 模型盯着**旧**的界面做判断 ⇒ ⇒ 坐标全歪；
/// - 看得见但点不到 ⇒ ⇒ 模型开始瞎点。
///
/// ⚠️ 这一族**不需要真机** —— Flutter 的语义树在单测里就能造出来
/// ⇒ ⇒ 所以它能进 CI ⇒ ⇒ 真机那一段只负责补「真机上语义树也一样」这一格。
void main() {
  const int itemCount = 60;
  const double itemExtent = 60;
  /// 目标项（初始**在视口外** ⇒ ⇒ 树里看不见 ⇒ ⇒ 滑过去才看得见）。
  const int target = 55;

  late ScrollController controller;
  final List<int> tapped = <int>[];

  /// 造一个 60 项的列表 —— 每项**自带语义标签**（没有标签 ⇒ ⇒ 树里一个字都没有）。
  Future<void> pumpList(WidgetTester tester) async {
    controller = ScrollController();
    tapped.clear();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ListView.builder(
            controller: controller,
            itemCount: itemCount,
            itemExtent: itemExtent,
            itemBuilder: (BuildContext context, int index) {
              return Semantics(
                label: '项目 $index',
                child: GestureDetector(
                  onTap: () => tapped.add(index),
                  child: ColoredBox(
                    key: ValueKey<int>(index),
                    color: const Color(0xFF202030),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
    await tester.pump();
  }

  testWidgets('初始 ⇒ 树里**看不见**视口外的项（树只反映**看得见的**）', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpList(tester);

    final FlutterSemanticsSnapshot? snapshot = FlutterSemanticsTree.read();
    expect(snapshot, isNotNull, reason: '语义树都没拿到 ⇒ ⇒ 这一族根本没跑');
    expect(snapshot!.text, contains('text: 项目 0'));
    expect(
      snapshot.text,
      isNot(contains('项目 $target')),
      reason: '视口外的项也进了树 ⇒ ⇒ 模型会去点**看不见**的东西 ⇒ ⇒ '
          '那是「以为看得见，其实看不见」的一族',
    );
    handle.dispose();
  });

  testWidgets('滑过去 ⇒ 树里**看得见**那一项，且坐标与量出来的位置一致', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpList(tester);

    // ⚠️ 滚到**最底**（jumpTo 会被夹到 maxScrollExtent）⇒ ⇒ 目标项必然进视口。
    controller.jumpTo(itemCount * itemExtent);
    await tester.pumpAndSettle();

    final FlutterSemanticsSnapshot? snapshot = FlutterSemanticsTree.read();
    expect(snapshot, isNotNull);
    expect(
      snapshot!.text,
      contains('text: 项目 $target'),
      reason: '滑过去了，树里却看不见那一项 ⇒ ⇒ 模型会以为目标不存在 ⇒ ⇒ '
          '那是「失败长得像成功」的一族',
    );
    // ⚠️ 坐标：**语义树本来就是物理像素**（别再乘一次 dpr）。
    final Rect logical = tester.getRect(find.byKey(const ValueKey<int>(target)));
    final double dpr = tester.view.devicePixelRatio;
    final String expected =
        'viewBounds: ${(logical.left * dpr).round()},${(logical.top * dpr).round()},'
        '${(logical.right * dpr).round()},${(logical.bottom * dpr).round()}';
    expect(
      snapshot.text,
      contains(expected),
      reason: '那一项的坐标与量出来的位置对不上 ⇒ ⇒ 模型照着点会点歪',
    );
    handle.dispose();
  });

  testWidgets('看得见 ⇒ 按文字**点得到**那一项（控件自己的回调被触发）', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpList(tester);
    controller.jumpTo(itemCount * itemExtent);
    await tester.pumpAndSettle();

    expect(FlutterSemanticsTree.tapByText('项目 $target'), isTrue);
    await tester.pump();
    expect(
      tapped,
      contains(target),
      reason: '看得见却点不到 ⇒ ⇒ 模型只能瞎点 ⇒ ⇒ 「看得见」这一格是假的',
    );
    handle.dispose();
  });

  testWidgets('**负控**：看不见的字 ⇒ 不许去点（不许瞎点）', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle handle = tester.ensureSemantics();
    await pumpList(tester);

    expect(
      FlutterSemanticsTree.tapByText('项目 $target'),
      isFalse,
      reason: '点**看不见**的东西 ⇒ ⇒ 那是乱按，不是「按文字点击」',
    );
    expect(tapped, isEmpty, reason: '负控竟然点中了东西 ⇒ ⇒ 那一格判据有问题');
    handle.dispose();
  });
}
