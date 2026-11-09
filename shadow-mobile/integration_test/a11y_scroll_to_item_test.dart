import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shadow_mobile/services/accessibility_controller.dart';
import 'package:shadow_mobile/services/capabilities/capability_tools.dart';
import 'package:shadow_mobile/services/capabilities/flutter_semantics_tree.dart';

/// **滑动正路径（真机）** —— 「滑 ⇒ ⇒ 树里出现新的一项 ⇒ ⇒ 照着树给的坐标能点中它」。
///
/// ## 这一族回答什么
///
/// 上一刀把「自家窗口的坐标」升级成**整屏口径**（`bounds`）⇒ ⇒
/// 而这一族是它的**下游证据**：
/// ❶ 滑动**真的**能把目标项带进语义树（⇒ ⇒ 模型看得见它）；
/// ❷ 树里给的**整屏坐标**拿去派发手势，**真的**命中那一件东西
/// ⇒ ⇒ （不是「派发出去了」，而是**那一项自己的回调**被触发了）。
///
/// ## 为什么单测测不到这一族
///
/// 手势派发走的是**原生那条路**（Dart → 方法通道 → Kotlin → 无障碍服务 → 系统）
/// ⇒ ⇒ 单测只能塞假的 `AccessibilityOps` ⇒ ⇒ 派发那一段**测不到**。
///
/// ## 跑法
///
/// ```
/// pwsh -File shadow-mobile/scripts/verify-mobile-use-on-device.ps1 \
///   -DeviceId <设备号> \
///   -Target integration_test/a11y_scroll_to_item_test.dart \
///   -Driver test_driver/a11y_scroll_to_item_test.dart \
///   -KeepOwnAppForeground
/// ```
///
/// ⚠️ `-KeepOwnAppForeground` **必须**带 —— 这一族要读**自家窗口**的语义树
/// ⇒ ⇒ 把别的窗口推到前台 ⇒ ⇒ 那一族就白跑了。
void main() {
  final IntegrationTestWidgetsFlutterBinding binding =
      IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  // ⚠️ **fullyLive** —— 否则帧被 binding 跳过 ⇒ ⇒ 布局永远不落地。
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;
  // ⚠️ **放行设备指针事件** —— 否则真实触摸事件被丢在脚手架里。
  binding.shouldPropagateDevicePointerEvents = true;
  // ⚠️ **必须显式开语义树** —— 自家 app 的界面模型就靠它。
  _semanticsHandle = SemanticsBinding.instance.ensureSemantics();

  runApp(const _ListApp());

  /// **失败清单** —— 官方驱动看不见普通 `test()` 的失败 ⇒ ⇒ 自己记一份。
  final List<String> failures = <String>[];

  /// 跑一条检查 ⇒ ⇒ 失败**记下来**并**再抛一次**。
  Future<void> check(String name, Future<void> Function() body) async {
    try {
      await body();
    } catch (error) {
      failures.add(name);
      rethrow;
    }
  }

  /// 等无障碍服务被开启（最多 [seconds] 秒）。
  Future<bool> waitForAccessibility(int seconds) async {
    for (var i = 0; i < seconds * 2; i++) {
      if (await AccessibilityController.isEnabled) return true;
      await Future<void>.delayed(const Duration(milliseconds: 500));
    }
    return false;
  }

  /// 等列表**真的长出来**（语义树里有项了）⇒ ⇒ 后面那些断言才不是空的。
  Future<bool> waitForItems(int seconds) async {
    for (var i = 0; i < seconds * 4; i++) {
      final Map<String, double>? native =
          await AccessibilityController.viewGeometry();
      if (native != null) {
        final FlutterSemanticsSnapshot? snap = FlutterSemanticsTree.read(
          viewOrigin: ViewOrigin(native['originX']!, native['originY']!),
        );
        if (snap != null && _itemsIn(snap.text).isNotEmpty) return true;
      }
      await Future<void>.delayed(const Duration(milliseconds: 250));
    }
    return false;
  }

  test('滑动 ⇒ 树里出现**初始看不见**的项 ⇒ ⇒ 照着树的坐标能点中那一项', () async {
    await check('滑动正路径', () async {
      expect(await waitForAccessibility(60), isTrue, reason: '无障碍服务没开');
      // ⚠️ 语义树**必须开着** —— 不开 ⇒ ⇒ 自家界面模型这一格是空的。
      expect(
        _semanticsHandle,
        isNotNull,
        reason: '语义树没开 ⇒ ⇒ 读不到自家 app 的界面',
      );
      expect(
        await waitForItems(30),
        isTrue,
        reason: '列表的语义树一直没长出来 ⇒ ⇒ 后面那些断言全是空的',
      );

      // ⚠️ **原生量到的窗口原点** —— 没有它 ⇒ ⇒ 树里的坐标是「本窗口」口径
      // ⇒ ⇒ 派发手势就会点歪 ⇒ ⇒ 那一格就没验到。
      final Map<String, double>? native =
          await AccessibilityController.viewGeometry();
      expect(
        native,
        isNotNull,
        reason: '原生量不到窗口原点 ⇒ ⇒ 这一轮不成立 ⇒ ⇒ '
            '自家窗口的坐标没法换算成整屏口径',
      );
      final ViewOrigin origin =
          ViewOrigin(native!['originX']!, native['originY']!);

      // ---- ① 初始的树 ----
      final FlutterSemanticsSnapshot? before =
          FlutterSemanticsTree.read(viewOrigin: origin);
      expect(before, isNotNull, reason: '自家窗口的语义树读不到 ⇒ ⇒ 这一格没补上');
      final Set<int> beforeItems = _itemsIn(before!.text);
      expect(beforeItems, isNotEmpty, reason: '树里一个项都没有 ⇒ ⇒ 列表没长出来');
      // ignore: avoid_print
      print('--- SCROLL BEFORE --- items=$beforeItems');

      // ---- ② 滑 ----
      // ⚠️ **照着树给的坐标滑** —— 这正是模型会做的事 ⇒ ⇒
      // ⇒ ⇒ 顺带证明「树里的整屏坐标」对**手势**也成立（不只是对点击）。
      //
      // ⚠️⚠️ **锚点必须挑「屏内」的那一项**（2026-11-10 真机实测踩出来的）：
      //   树里**会**出现屏外的项（列表只渲染可见部分，但语义树里仍有它们的 bounds）
      //   ⇒ ⇒ 挑「编号最大」的那一项 ⇒ ⇒ 它的 bottom 落在**屏幕之外**
      //   ⇒ ⇒ 实测起点 y=3084 而屏高只有 2400 ⇒ ⇒ 手势派发 API 照样回
      //   「dispatched=true」⇒ ⇒ **界面一动不动** ⇒ ⇒ **失败长得像成功**。
      //   ⇒ ⇒ ⇒ 模型真正的做法是「挑一个**看得见**的项」⇒ ⇒ 尺子也该这么挑。
      final Map<String, double>? screen = await AccessibilityController.screenSize();
      expect(
        screen,
        isNotNull,
        reason: '原生量不到屏幕尺寸 ⇒ ⇒ 这一轮不成立 ⇒ ⇒ '
            '没法判断哪个项在屏内（也就没法挑一个有效的滑动锚点）',
      );
      final double screenH = screen!['height']!;
      final double screenW = screen['width']!;

      // ⚠️ **选屏内那一项** —— 优先编号大（更靠下 ⇒ ⇒ 滑起来变化更明显），
      //   但**必须**完整落在屏幕内。
      int anchor = -1;
      Rect? anchorBounds;
      final List<int> ordered = beforeItems.toList()..sort();
      for (final int idx in ordered.reversed) {
        final Rect? b = _boundsOfItem(before.text, idx);
        if (b == null) continue;
        if (b.top >= 0 && b.bottom <= screenH && b.left >= 0 && b.right <= screenW) {
          anchor = idx;
          anchorBounds = b;
          break;
        }
      }
      expect(
        anchor >= 0,
        isTrue,
        reason: '树里一个**完整落在屏内**的项都没有 ⇒ ⇒ 这一轮不成立 ⇒ ⇒ '
            '（屏幕 ${screenW.round()}x${screenH.round()}）',
      );
      // ⚠️⚠️ **断言锚点真的在屏内** —— 不许派发屏外坐标
      // ⇒ ⇒ 越界手势会「派发成功但没效果」⇒ ⇒ 那是假绿。
      expect(
        anchorBounds!.bottom <= screenH,
        isTrue,
        reason: '锚点 bottom=${anchorBounds.bottom} 超出屏高 $screenH ⇒ ⇒ '
            '这一轮会把屏外坐标派发出去 ⇒ ⇒ 派发会「成功」但界面不动',
      );
      final double x = anchorBounds.center.dx;
      final double yFrom = anchorBounds.bottom - 4;
      final double yTo = origin.y + 8;
      // ignore: avoid_print
      print('--- SCROLL ANCHOR --- item=$anchor bounds=$anchorBounds screen=${screenW.round()}x${screenH.round()}');
      for (var i = 0; i < 5; i++) {
        await CapabilityTools().swipe(<String, dynamic>{
          'x1': x,
          'y1': yFrom,
          'x2': x,
          'y2': yTo,
          'duration_ms': 400,
        });
        // ⚠️ **每滑一下都要等** —— 惯性还在 ⇒ ⇒ 树还没稳 ⇒ ⇒ 读到的是半路。
        await Future<void>.delayed(const Duration(milliseconds: 700));
      }
      await Future<void>.delayed(const Duration(milliseconds: 1200));

      // ---- ③ 滑完的树 ----
      final FlutterSemanticsSnapshot? after =
          FlutterSemanticsTree.read(viewOrigin: origin);
      expect(after, isNotNull);
      final Set<int> afterItems = _itemsIn(after!.text);
      // ignore: avoid_print
      print('--- SCROLL AFTER --- items=$afterItems');
      final Set<int> fresh = afterItems.difference(beforeItems);
      expect(
        fresh,
        isNotEmpty,
        reason: '滑了五下，树里的项**一个都没变** ⇒ ⇒ 树没跟着滚 ⇒ ⇒ '
            '模型会盯着**旧**的界面做判断 ⇒ ⇒ 坐标全歪',
      );

      // ---- ④ 照着新树里的坐标点**新出现的那一项** ----
      // ⚠️⚠️ **同样必须挑「屏内」的那一项**（2026-11-10 真机实测）：
      //   滑完之后树里**仍会**有屏外的项 ⇒ ⇒ 挑「编号最大」⇒ ⇒ 它的
      //   中心在屏幕之外（实测 (540,2312) 而屏高 2296）⇒ ⇒ 点不到。
      //   ⇒ ⇒ ⇒ 这一步**由新的越界判据当场拦住**（那把闸第一次在真机上抓住真因）
      //   ⇒ ⇒ ⇒ 但我们要的是**点中**，不是「被拦住」⇒ ⇒ 所以尺子要挑屏内的项。
      int target = -1;
      Rect? bounds;
      final List<int> freshOrdered = fresh.toList()..sort();
      for (final int idx in freshOrdered.reversed) {
        final Rect? b = _boundsOfItem(after.text, idx);
        if (b == null) continue;
        if (b.top >= 0 && b.bottom <= screenH && b.left >= 0 && b.right <= screenW) {
          target = idx;
          bounds = b;
          break;
        }
      }
      expect(
        target >= 0,
        isTrue,
        reason: '新出现的项里**没有一个完整落在屏内** ⇒ ⇒ 这一轮不成立',
      );
      final int tapsBefore = _taps[target] ?? 0;
      await CapabilityTools().tap(<String, dynamic>{
        'x': bounds!.center.dx,
        'y': bounds.center.dy,
      });
      await Future<void>.delayed(const Duration(milliseconds: 900));
      expect(
        _taps[target] ?? 0,
        tapsBefore + 1,
        reason: '照着树里给的整屏坐标点 ⇒ ⇒ 「项目 $target」自己的回调没被触发 ⇒ ⇒ '
            '坐标口径对不上（或者手势根本没落到我们自己的窗口上）',
      );
      // ignore: avoid_print
      print('--- SCROLL TAP --- target=$target bounds=$bounds taps=$_taps');
    });
  }, timeout: const Timeout(Duration(minutes: 6)));

  test('【结论】把这次的真机验证结果**如实**报给驱动脚本', () async {
    final String verdict = failures.isEmpty ? 'PASS' : 'FAIL';
    final Map<String, dynamic> report = <String, dynamic>{
      'shadow_verdict': verdict,
      'shadow_failures': failures,
    };
    IntegrationTestWidgetsFlutterBinding.instance.reportData = report;
    // ignore: avoid_print
    print('--- VERDICT --- $verdict failures=$failures');
    expect(failures, isEmpty, reason: '有检查没过：${failures.join(' | ')}');
  });
}

/// **每一项自己的回调计数** —— 「点到了哪一项」的最强证据。
final Map<int, int> _taps = <int, int>{};

/// 语义树的 handle —— 必须**握住不放**（放开 ⇒ ⇒ 树当场被拆掉）。
SemanticsHandle? _semanticsHandle;

/// 从语义树文本里抽出**所有**列表项的编号。
Set<int> _itemsIn(String tree) {
  final Set<int> out = <int>{};
  final Iterable<RegExpMatch> it =
      RegExp(r'text: 项目 (\d+)').allMatches(tree);
  for (final RegExpMatch m in it) {
    final int? n = int.tryParse(m.group(1)!);
    if (n != null) out.add(n);
  }
  return out;
}

/// 从语义树文本里抽出**某一项**的 bounds（整屏物理像素）。
///
/// ⚠️ 解析不出来就回 null ⇒ ⇒ 断言立刻红 ⇒ ⇒ 而不是「解析不出来就当过了」。
Rect? _boundsOfItem(String tree, int index) {
  final List<String> lines = tree.split('\n');
  final String needle = 'text: 项目 $index';
  for (var i = 0; i < lines.length; i++) {
    if (!lines[i].contains(needle)) continue;
    for (var j = i + 1; j < lines.length && j < i + 6; j++) {
      final RegExpMatch? m = RegExp(
        r'bounds: (-?\d+),(-?\d+),(-?\d+),(-?\d+)',
      ).firstMatch(lines[j]);
      if (m == null) continue;
      return Rect.fromLTRB(
        double.parse(m.group(1)!),
        double.parse(m.group(2)!),
        double.parse(m.group(3)!),
        double.parse(m.group(4)!),
      );
    }
  }
  return null;
}

/// 一个**满屏的列表** —— 每一项自带语义标签 ＋ 自己的点击回调。
class _ListApp extends StatelessWidget {
  const _ListApp();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: const Color(0xFF101014),
        body: ListView.builder(
          itemCount: 60,
          itemExtent: 64,
          itemBuilder: (BuildContext context, int index) {
            return Semantics(
              label: '项目 $index',
              child: GestureDetector(
                onTap: () => _taps[index] = (_taps[index] ?? 0) + 1,
                child: Container(
                  alignment: Alignment.center,
                  color: index.isEven
                      ? const Color(0xFF1B1B22)
                      : const Color(0xFF23232C),
                  child: Text(
                    '项目 $index',
                    style: const TextStyle(color: Colors.white),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
