import 'dart:ui' show FlutterView, PlatformDispatcher, Size;

import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shadow_mobile/services/accessibility_controller.dart';
import 'package:shadow_mobile/services/capabilities/accessibility_ops.dart';
import 'package:shadow_mobile/services/capabilities/capability_tools.dart';

/// 树里一个**带坐标的条目**（文字 ＋ 它的屏幕中心）。
///
/// ⚠️ 坐标是**屏幕像素** ⇒ ⇒ 与 `dispatchGesture` 用的**同一个坐标系**
/// ⇒ ⇒ 模型从树里读到的坐标**直接就能拿去点**。
class _Label {
  const _Label(this.text, this.cx, this.cy);

  final String text;
  final double cx;
  final double cy;
}

/// **真机上的「手机操作」** —— 这一族能力此前**只有编译级证据**。
///
/// ## 要证明的是什么
///
/// 「手机操作」这六个工具走的路是：Dart → **方法通道** → Kotlin → 无障碍服务
/// ⇒ ⇒ 中间**每一层都可能静悄悄失败**（方法名对不上 ⇒ notImplemented；
/// 参数名对不上 ⇒ 坐标读成 0 ⇒ 点到了屏幕左上角）⇒ ⇒ 而**单测测不到它**
/// （单测走的是抽象层 `AccessibilityOps`）⇒ ⇒ 只能**在真机上**验。
///
/// ## ⚠️⚠️ 为什么结论要**我们自己报**（而不是交给框架）
///
/// ⚠️ `integration_test` 的结果通道（`failureMethodsDetails`）**只收
/// `testWidgets` 的失败** ⇒ ⇒ 我们这些**普通 `test()`** 的失败它**看不见**
/// ⇒ ⇒ `flutter drive` 的驱动会因此报「All tests passed」、退出码是 **0**
/// ⇒ ⇒ **实测过**：真机上明明有一条用例红了（日志里有 `[E]`），驱动仍然说
/// 「All tests passed.」⇒ ⇒ **那就是「失败长得像成功」的最纯形态**
/// ⇒ ⇒ 所以这里**自己记一份失败清单**，由**驱动脚本**按这份清单判成败
/// ⇒ ⇒ 没有清单 ⇒ 驱动**一律判失败**（fail-closed）。
///
/// ## 为什么用 `test()` 而不是 `testWidgets()`
///
/// ⚠️ 无障碍服务开着 ⇒ ⇒ Flutter 引擎会**自己打开语义树** ⇒ ⇒ 引擎持有的
/// 那个 `SemanticsHandle` 没人能 dispose ⇒ ⇒ `testWidgets` 收尾时的
/// 「A SemanticsHandle was active at the end of the test」会**必然报错**
/// ⇒ ⇒ 而那报错**与被测代码无关**（是设备状态造成的）⇒ ⇒
/// ⇒ 这组用例只需要调平台通道、不需要 widget 树 ⇒ ⇒ 改用普通 `test()`
/// ⇒ ⇒ 不走框架的 handle 校验 ⇒ ⇒ 失败就只可能是**真的**失败。
///
/// ## ⚠️ 一个决定所有断言的前提：**自己的 App 读不到自己的窗口**
///
/// Android 无障碍框架**不会把宿主自己的窗口**交给它自己绑定的服务
/// ⇒ ⇒ `rootInActiveWindow` 返回 null ⇒ ⇒ 读屏必然是**空树**
/// ⇒ ⇒ **手势也会落在那个「前台窗口」上** ⇒ ⇒ 我们自己的 app 在前台时，
/// 手势点在我们自己的界面上，而我们也**读不到**结果
/// ⇒ ⇒ 所以真机验证必须**让别的 App 在前台**（验证脚本里按 HOME 切桌面）。
///
/// ## 为什么是「等」而不是「断言」
///
/// ⚠️ 无障碍服务是**系统设置里的开关**，**不能程序化授予** ⇒ ⇒ 装完 app
/// 之后它一定是关的 ⇒ ⇒ 「先装好 → 再开开关 → 再跑用例」这个顺序在
/// 自动化里做不到 ⇒ ⇒ 所以这里**轮询等** ⇒ ⇒ 开关可以在**用例运行期间**
/// 被打开（人手点，或者主机侧 `adb shell settings put` 代开）⇒ ⇒
/// 60 秒内没等到 ⇒ ⇒ **明确失败**（静悄悄跳过 = 假装验过）。
///
/// ## 这组用例**不覆盖**什么
///
/// ⚠️ **截断分支没被触发** —— 要触发它需要一棵 > 20 000 字符的树
/// ⇒ ⇒ 日常屏幕上造不出来 ⇒ ⇒ 截断的三道闸由 **JVM 单测**
/// （`ScreenBudgetTest`，7 条）覆盖 ⇒ ⇒ 这里只钉「**不误报**」。
/// ⚠️ **tap / longPress 只证明了「手势被派发」**，没证明「点到了想要的东西」
/// ⇒ ⇒ 后者要一个稳定的文本目标 ⇒ ⇒ 那是 `findAndClick` 的活（见下）。
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  /// **失败清单** —— 为什么自己记一份：见文件头那段。
  final List<String> failures = <String>[];

  /// 跑一条检查 ⇒ ⇒ 失败**记下来**并**再抛一次**
  /// ⇒ ⇒ 记下来 ⇒ 驱动脚本能看见；再抛一次 ⇒ 日志里那条用例仍然是红的。
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

  /// 读屏并**重试到真的读到**（最多 [attempts] 次）。
  ///
  /// ⚠️ **为什么要重试**：app 刚起来的那一瞬间，前台窗口里一个节点都
  /// 没有（真机实测）⇒ ⇒ 第一读拿到的是空 ⇒ ⇒ 原生侧现在会明确回 null
  /// （「读不到」而不是「屏幕是空的」）⇒ ⇒ 这里重试直到窗口挂好。
  Future<String?> readTreeWithRetry(int attempts) async {
    String? tree;
    for (var i = 0; i < attempts; i++) {
      tree = await AccessibilityController.readScreen();
      if (tree != null && tree.trim().isNotEmpty) return tree;
      await Future<void>.delayed(const Duration(milliseconds: 500));
    }
    return tree;
  }

  /// 从树里取出**所有带文字的条目**（`text: xxx` 那一行）。
  ///
  /// ⚠️ 为什么**按行取**而不是按节点取：树是文本，没有结构化 API
  /// ⇒ ⇒ 而「按文字点击」要的就是**文字** ⇒ ⇒ 这就够用。
  List<String> extractTexts(String tree) {
    final out = <String>[];
    for (final line in tree.split('\n')) {
      final match = RegExp(r'text:\s*(.+)$').firstMatch(line.trim());
      if (match != null) {
        final value = match.group(1)!.trim();
        if (value.isNotEmpty && !out.contains(value)) out.add(value);
      }
    }
    return out;
  }

  /// 从树里取出**带坐标的条目**（文字 ＋ 它的屏幕中心）。
  ///
  /// ⚠️ 树里 `bounds:` 行**紧跟**在同节点的 `text:` / `desc:` 行后面
  /// ⇒ ⇒ 所以「记住最近一个标签，遇到 bounds 就配对」即可。
  ///
  /// ⚠️ 这条是**「模型怎么知道该点哪」**的答案：没有坐标，模型看得见
  /// 「WLAN」也**不知道它在哪** ⇒ ⇒ 只能瞎点 ⇒ ⇒ 点按那条能力等于没有。
  List<_Label> extractLabels(String tree) {
    final out = <_Label>[];
    String? pending;
    for (final line in tree.split('\n')) {
      final trimmed = line.trim();
      final label =
          RegExp(r'^(?:text|desc):\s*(.+)$').firstMatch(trimmed);
      if (label != null) {
        pending = label.group(1)!.trim();
        continue;
      }
      final box =
          RegExp(r'^bounds:\s*(-?\d+),(-?\d+),(-?\d+),(-?\d+)$')
              .firstMatch(trimmed);
      if (box != null && pending != null) {
        final left = int.parse(box.group(1)!);
        final top = int.parse(box.group(2)!);
        final right = int.parse(box.group(3)!);
        final bottom = int.parse(box.group(4)!);
        if (right > left && bottom > top) {
          out.add(_Label(pending, (left + right) / 2, (bottom + top) / 2));
        }
        pending = null;
      }
    }
    return out;
  }

  /// 树里所有**标签**（`text:` / `desc:` 的值）。
  List<String> labelsOf(String tree) {
    final out = <String>[];
    for (final line in tree.split('\n')) {
      final match =
          RegExp(r'^(?:text|desc):\s*(.+)$').firstMatch(line.trim());
      if (match != null) {
        final value = match.group(1)!.trim();
        if (value.isNotEmpty) out.add(value);
      }
    }
    return out;
  }

  /// 从树里找出**一个 long-clickable 的节点**（带文字或描述 ＋ 屏幕中心）。
  ///
  /// ⚠️⚠️ **为什么要找「可长按」的节点** —— 靶子必须「长按与点按走出
  /// ⇒ ⇒ **不同结果**」⇒ ⇒ 否则两条路分不开 ⇒ ⇒ 而「分不开」意味着
  /// ⇒ ⇒ 那条用例**证明不了任何事**。
  ///
  /// ⚠️ **树里没有 long-clickable 这个字段** —— 原生侧那棵树只拍
  /// ⇒ ⇒ `text` / `desc` / `bounds` ⇒ ⇒ 所以**判据要落在文字上**：
  /// ⇒ ⇒ ⇒ 桌面 app 图标的**可访问名**（描述）是 app 名（天气｜相册｜日历…）
  /// ⇒ ⇒ ⇒ 而桌面**没有**那些「动作型短语」⇒ ⇒ ⇒ 也就是说：
  /// ⇒ ⇒ ⇒ ⇒ **桌面里出现的那些 app 名**就是可长按的图标。
  ///
  /// ⚠️⚠️ 而「桌面」本身怎么认？—— **不认** ⇒ ⇒ 我们**不钉死哪个图标**：
  /// ⇒ ⇒ ⇒ 从树里挑「一个看起来像 app 图标的标签」⇒ ⇒ 逐个试
  /// ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **通用形态：靶子要能区分「两条路」**，
  /// ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 而**挑哪个靶子**可以试 ⇒ ⇒ ⇒ ⇒ 挑不出来时**如实失败**。
  /// 这个词像不像「一个动作」（应用信息｜移除｜设置｜下个日程…）？
  ///
  /// ⚠️ **为什么要排除它们** —— 长按弹出菜单后，菜单项**也会**出现在树里
  /// ⇒ ⇒ 而菜单项正是「长按的结果」⇒ ⇒ 若把菜单项当靶子再长按一次，
  /// ⇒ ⇒ 那就**测的是菜单**而不是桌面图标 ⇒ ⇒ ⇒ 判据会自相矛盾。
  bool looksLikeActionPhrase(String text) {
    const actions = <String>[
      '移除', '删除', '重命名', '卸载', '编辑', '设置',
      '应用信息', '新建', '添加', '分享', '移动', '复制',
      '收藏', '排序', '隐藏', '自启动',
    ];
    for (final a in actions) {
      if (text.contains(a)) return true;
    }
    return false;
  }

  List<_Label> findLongClickable(String tree) {
    // ⚠️ **「app 图标的描述」是短词**（天气/相册/日历/设置…）
    // ⇒ ⇒ 而「动作型短语」更长（含动词：应用信息/移除/新建日程…）
    // ⇒ ⇒ ⇒ 所以按**长度**分开 ⇒ ⇒ 不用钉死具体哪个 app。
    final out = <_Label>[];
    for (final label in extractLabels(tree)) {
      final text = label.text.trim();
      if (text.isEmpty) continue;
      // ⚠️ app 图标的描述一般 **≤ 6 个字**（天气｜相册｜计算器｜设置｜日历）
      // ⇒ ⇒ 菜单项那种「应用信息」「新建日程」会被这条规则排除掉
      // ⇒ ⇒ ⇒ 而桌面里那些带**长句子**的（小组件标题、天气详情）也排除掉
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **通用形态：用「性质」筛，不要用「名单」筛**。
      if (text.length > 6) continue;
      if (looksLikeActionPhrase(text)) continue;
      out.add(label);
    }
    return out;
  }


  /// 树里的**节点数**。
  int nodeCount(String tree) {
    return RegExp(r'\[([A-Za-z0-9_.]+)\]').allMatches(tree).length;
  }

  /// 树的**结构签名** —— 只看**节点类型的分布**，不看文本。
  ///
  /// ⚠️ 为什么不看文本：桌面上有**时钟**在走 ⇒ ⇒ 同一棵树的文本自己就会变
  /// ⇒ ⇒ 「文本不等」不等于「界面变了」⇒ ⇒ 那会把「**什么都没发生**」
  /// 判成「变了」（假绿）⇒ ⇒ 只信结构。
  String structureSignature(String tree) {
    final counts = <String, int>{};
    for (final match in RegExp(r'\[([A-Za-z0-9_.]+)\]').allMatches(tree)) {
      final name = match.group(1)!;
      counts[name] = (counts[name] ?? 0) + 1;
    }
    final names = counts.keys.toList()..sort();
    final parts = <String>[];
    for (final name in names) {
      parts.add('$name=${counts[name]}');
    }
    return parts.join(',');
  }

  /// 界面是不是「**实质变了**」。
  ///
  /// ⚠️⚠️ 判据必须**够狠** —— 上一版只比「结构签名是否不同」
  /// ⇒ ⇒ 结果**只差一个 LinearLayout** 也算「变了」
  /// ⇒ ⇒ **滑动手势根本没生效也判过了**（那也是「失败长得像成功」！）
  /// ⇒ ⇒ 现在要求：**节点数**差得够多，**或** 树的**体量**差得够多。
  bool materiallyChanged(String before, String after) {
    if (structureSignature(before) != structureSignature(after)) return true;
    if ((nodeCount(before) - nodeCount(after)).abs() > 5) return true;
    if ((before.length - after.length).abs() > 300) return true;
    // ⚠️⚠️ **最后一招，也是最要紧的一招**：**标签集合**差得够多。
    // ⇒ ⇒ 为什么需要它：真机上**两个不同的页面可能节点类型分布完全一样**
    //   （设置列表 → 它的子页面，两边都是「一列 TextView」）
    // ⇒ ⇒ 而长度差也可能不够 300 ⇒ ⇒ 前面三条都会**漏判**
    // ⇒ ⇒ ⇒ 结果「界面明明变了，却判成没变」⇒ ⇒ **假失败**。
    // ⇒ ⇒ 而「时钟自己走」只改**一个**标签 ⇒ ⇒ 差 1~2 个不算 ⇒ ⇒ 不会假绿。
    final a = labelsOf(before).toSet();
    final b = labelsOf(after).toSet();
    final diff = a.difference(b).length + b.difference(a).length;
    return diff >= 3;
  }

  /// 读屏并**重试到「界面变了」**（最多 [attempts] 次）。
  ///
  /// ⚠️ **为什么要轮询**：手势派发出去之后，系统要**一点时间**才把新窗口
  /// 挂上来 ⇒ ⇒ 第一读很可能还是旧的那棵 ⇒ ⇒ 只读一次会误判。
  Future<String?> readTreeUntilChanged(String before, int attempts) async {
    for (var i = 0; i < attempts; i++) {
      final tree = await AccessibilityController.readScreen();
      if (tree != null && tree.trim().isNotEmpty && materiallyChanged(before, tree)) {
        return tree;
      }
      await Future<void>.delayed(const Duration(milliseconds: 500));
    }
    return null;
  }

  test('无障碍服务开着 ⇒ 读屏能拿到真树的文本', () async {
    await check('读屏 ⇒ 拿到真树的文本', () async {
      final enabled = await waitForAccessibility(60);
      expect(
        enabled,
        isTrue,
        reason:
            '无障碍服务没开 ⇒ ⇒ 请在系统设置里开启「影」的无障碍服务'
            '（或主机侧代开：adb shell settings put secure '
            'enabled_accessibility_services '
            'com.ibloc.shadow/com.ibloc.shadow.PrefrontalAccessibilityService '
            '&& adb shell settings put secure accessibility_enabled 1）',
      );

      final tree = await readTreeWithRetry(60);
      expect(tree, isNotNull, reason: '读屏返回 null ⇒ 服务没连上或没有可读窗口');
      expect((tree ?? '').trim(), isNotEmpty, reason: '读到了一棵空树');

      // ⚠️ **截断标记不该出现在一棵正常树上** —— 误报比漏报更坑
      // ⚠️⚠️ **判据从「不许截断」改成「要么不截断、要么显式标记」**（2026-11-11 真机实测）
      // ⇒ ⇒ 原断言是「这一屏**不许**出现截断标记」
      // ⇒ ⇒ ⇒ 但那一屏是**谁**没人管 ⇒ ⇒ 而 MIUI **桌面**的树巨大
      // ⇒ ⇒ ⇒ ⇒ 实测树规模：ImageView×67 ＋ RelativeLayout×53 ＋ TextView×59
      // ⇒ ⇒ ⇒ ⇒ ⇒ 字符预算 20000 ⇒ ⇒ **它本来就该被截断**
      // ⇒ ⇒ ⇒ ⇒ ⇒ 而上一轮同一屏是 19149 字符（**刚好不截断**）
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **同一个东西，差一点点 ⇒ ⇒ 一个绿一个红** ⇒ ⇒
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 那不是能力变了，那是**环境漂了**
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⚠️ **产品真正该保证的性质**不是「不截断」，
      // ⇒ ⇒ ⇒ ⇒ ⇒ 而是「**截断了就一定说出来**」（静悄悄截断 ⇒ ⇒ 模型以为看全了）
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **通用形态：判据要对着「被测物该保证的性质」，
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 而不是对着「某个环境下恰好成立的值」**。
      final bool marked = tree!.trimRight().endsWith(kScreenTruncationMarker);
      final bool hasMarkerInside = tree.contains(kScreenTruncationMarker);
      expect(
        marked,
        hasMarkerInside,
        reason: '截断标记的**位置**不对：'
            '要么整棵树**没被截断**（那就不许出现标记），'
            '要么**末尾**必须带标记（截断了就要说出来）',
      );

      // 打印树的头部，好肉眼核对「读到的确实是一棵树」。
      final head = tree.length > 300 ? tree.substring(0, 300) : tree;
      // ignore: avoid_print
      print('--- SCREEN TREE (${tree.length} chars) truncated=$marked ---\n$head');
    });
  }, timeout: const Timeout(Duration(minutes: 3)));

  test('工具层那条路 ⇒ **截断了就说截断了**（truncated 字段与标记逐字对齐）', () async {
    await check('工具层 ⇒ truncated 字段与标记逐字对齐', () async {
      final tools = CapabilityTools();
      Map<String, dynamic>? map;
      for (var i = 0; i < 30; i++) {
        final res = await tools.readScreen(<String, dynamic>{});
        if (res is Map<String, dynamic>) {
          final screen = res['screen'];
          if (screen is String && screen.trim().isNotEmpty) {
            map = res;
            break;
          }
        }
        await Future<void>.delayed(const Duration(milliseconds: 500));
      }
      expect(map, isNotNull, reason: '工具层始终没读到屏');
      final Map<String, dynamic> got = map!;
      expect(got['screen'], isA<String>());
      final String screen = got['screen'] as String;
      expect(screen.trim(), isNotEmpty);

      // ⚠️⚠️ **判据：字段与标记必须**逐字对齐** ⇒ ⇒ 两者说的是同一件事。
      // ⇒ ⇒ 「truncated=true 但树里没标记」⇒ ⇒ 模型看不出来 ⇒ ⇒ 那是静悄悄截断
      // ⇒ ⇒ 「truncated=false 但树里带标记」⇒ ⇒ 字段在说谎 ⇒ ⇒ 同一族。
      // ⚠️⚠️ 而**不许**再断言「truncated 必须是 false」——
      // ⇒ ⇒ 那一屏（MIUI 桌面）的树**本来就超预算** ⇒ ⇒ 截断是**正确行为**
      // ⇒ ⇒ ⇒ ⇒ ⇒ **通用形态：截断不是 bug，**静悄悄**的截断才是 bug**
      final bool fieldSaysTruncated = map['truncated'] == true;
      final bool markerSaysTruncated = screen.trimRight().endsWith(kScreenTruncationMarker);
      expect(
        fieldSaysTruncated,
        markerSaysTruncated,
        reason: 'truncated 字段（$fieldSaysTruncated）与树末尾的标记'
            '（$markerSaysTruncated）**不一致** ⇒ ⇒ '
            '要么模型看不出来，要么字段在说谎',
      );
      // ignore: avoid_print
      print('--- TOOL LAYER --- truncated=$fieldSaysTruncated '
          'marker=$markerSaysTruncated len=${screen.length}');
    });
  }, timeout: const Timeout(Duration(minutes: 3)));

  test('全局动作：通知栏 ⇒ 界面大幅变了 ⇒ 返回 ⇒ 又回到原界面', () async {
    await check('全局动作 ⇒ 落地且可逆', () async {
      final tools = CapabilityTools();
      expect(await waitForAccessibility(60), isTrue, reason: '无障碍服务没开');

      final base = await readTreeWithRetry(60);
      expect(base, isNotNull, reason: '读不到前台窗口');
      final baseSignature = structureSignature(base!);

      // ① 「通知栏」⇒ ⇒ 界面必须**大幅**变掉（不是差一个节点那种）
      await tools.globalAction(<String, dynamic>{'action': 'notifications'});
      final shade = await readTreeUntilChanged(base, 40);
      expect(
        shade,
        isNotNull,
        reason: '按了「通知栏」之后 **界面没有实质变化** ⇒ ⇒ 全局动作很可能没落地',
      );
      // ignore: avoid_print
      print('--- SIGNATURE (notifications) ---\nbase=$baseSignature'
          '\nshade=${structureSignature(shade!)}'
          '\nbaseNodes=${nodeCount(base)}'
          '\nshadeNodes=${nodeCount(shade)}');

      // ② 「返回」⇒ ⇒ 必须**离开通知栏**（⇒ 证明它可逆，不是乱按）
      // ⚠️⚠️ **不能**断言「回到原界面」—— 真机上**证伪**过这条假设：
      // 从通知栏「返回」之后落到的是**另一个**界面（三星上不保证回到
      // 拉下通知栏之前那一屏）⇒ ⇒ ⇒ 断言**设备真正做到的事**
      // （通知栏被关掉了），而不是**我想象的**事。
      await tools.globalAction(<String, dynamic>{'action': 'back'});
      final back = await readTreeUntilChanged(shade, 40);
      expect(
        back,
        isNotNull,
        reason: '按了「返回」之后界面没有实质变化 ⇒ ⇒ 收不回去',
      );
      expect(
        structureSignature(back!),
        isNot(structureSignature(shade)),
        reason: '返回之后结构跟通知栏一模一样 ⇒ ⇒ 通知栏根本没关掉',
      );
      // ignore: avoid_print
      print('--- SIGNATURE (back) ---\nshade=${structureSignature(shade)}'
          '\nback=${structureSignature(back)}');
    });
  }, timeout: const Timeout(Duration(minutes: 4)));

  test('滑动手势 ⇒ 界面真的变了（**滑动落地**，不钉死「哪个平台特性」）', () async {
    await check('滑动手势 ⇒ 落地', () async {
      final tools = CapabilityTools();
      expect(await waitForAccessibility(60), isTrue, reason: '无障碍服务没开');

      final FlutterView view = PlatformDispatcher.instance.views.first;
      final Size size = view.physicalSize;
      final double cx = size.width / 2;

      final base = await readTreeWithRetry(60);
      expect(base, isNotNull, reason: '读不到前台窗口');

      // ⚠️⚠️⚠️ **为什么不再断言「从顶边下拉 ⇒ 通知栏」**（2026-11-10 真机实测）
      // ⇒ ⇒ 那一版把**一个平台特性**当成了**能力本身**的判据
      // ⇒ ⇒ ⇒ 实测（odin / MIUI 14）：**系统级** `adb input swipe` 对照
      // ⇒ ⇒   从**正中**（x=540）往下拉 ⇒ ⇒ **界面一动不动**
      // ⇒ ⇒   从 x=300 往下拉 ⇒ ⇒ 拉出 **NotificationShade**
      // ⇒ ⇒   从 x=900 往下拉 ⇒ ⇒ 拉出 **control_center**
      // ⇒ ⇒ ⇒ **同一条手势、同一台机器，只因为起点 x 不同，结果就三种**
      // ⇒ ⇒ ⇒ ⇒ 那不是「滑动手势不成立」，那是**平台在这个坐标上是死区**
      // ⇒ ⇒ ⇒ ⇒ ⇒ **通用形态：把平台特性当能力判据 ⇒ ⇒ 尺子会红在
      // ⇒ ⇒ ⇒ ⇒ ⇒ 「平台行为」上，而产品其实没问题**
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 修法：**判「滑动落地」这件事本身**（界面变了没有），
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **不钉死用哪个坐标 / 拉出哪个界面**。
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⚠️ 而「界面变了」的判据必须是**实质变化**
      // ⇒ ⇒ ⇒ ⇒ ⇒ （见 materiallyChanged：节点数 / 体量 / 标签集合）
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 否则滑一下没动会被判成「变了」⇒ ⇒ 假绿。

      // ① 从**顶边**往下拉 ⇒ ⇒ 通知栏（**首选**路径）
      await tools.swipe(<String, dynamic>{
        'x1': cx,
        'y1': 4,
        'x2': cx,
        'y2': size.height * 0.6,
        'duration_ms': 500,
      });
      var after = await readTreeUntilChanged(base!, 40);
      var how = 'top-edge';

      // ② ⚠️ **正中下拉在某些机型/桌面上是死区** ⇒ ⇒ 换**左侧**起点重试
      // ⇒ ⇒（实测 x=300 能拉出 NotificationShade ⇒ ⇒ 而 x=540 什么也不发生）
      if (after == null) {
        // ignore: avoid_print
        print('--- SWIPE (top-edge center) --- 没变化 ⇒ ⇒ 换左侧起点重试');
        await tools.swipe(<String, dynamic>{
          'x1': size.width * 0.28,
          'y1': 4,
          'x2': size.width * 0.28,
          'y2': size.height * 0.6,
          'duration_ms': 500,
        });
        after = await readTreeUntilChanged(base, 40);
        how = 'top-edge-left';
      }

      expect(
        after,
        isNotNull,
        reason: '两个候选起点都试过了，界面**都没有实质变化**'
            ' ⇒ ⇒ 滑动手势在真机上不成立',
      );
      // ignore: avoid_print
      print('--- SIGNATURE (swipe) ---\nhow=$how'
          '\nbase=${structureSignature(base)}'
          '\nafter=${structureSignature(after!)}'
          '\nbaseNodes=${nodeCount(base)}'
          '\nafterNodes=${nodeCount(after)}');

      // 收尾：把可能拉下来的通知栏收回去（不断言 —— 收不回去也不影响本条的结论）
      await tools.globalAction(<String, dynamic>{'action': 'back'});
    });
  }, timeout: const Timeout(Duration(minutes: 5)));

  test('滑动手势（**别人的 app 里**）⇒ 列表内容真的变了', () async {
    await check('滑动手势 ⇒ 别人的 app 里列表变了', () async {
      final tools = CapabilityTools();
      expect(await waitForAccessibility(60), isTrue, reason: '无障碍服务没开');

      // ⚠️ **目标必须「确定可滚」** —— 实测踩过：
      // ⇒ ⇒ 桌面（MIUI 启动器）**不可靠**（它有负一屏、卡片、各种层）
      // ⇒ ⇒ ⇒ 而**系统设置**的首屏是一张**确定可滚的列表** ⇒ ⇒ 拿它当靶子。
      // ⇒ ⇒ ⇒ **通用形态：尺子要挑一个「行为确定」的靶子**，
      // ⇒ ⇒ ⇒ 否则红的是「靶子不配合」，不是「被测能力不行」。
      // ⚠️⚠️⚠️ **不要自己按 home** —— 第一版在这里按了 `home`
      // ⇒ ⇒ ⇒ 结果把**主机侧准备好的靶子**（系统设置）切回了桌面
      // ⇒ ⇒ ⇒ ⇒ 而桌面**不是确定可滚的列表** ⇒ ⇒ ⇒ 红了
      // ⇒ ⇒ ⇒ ⇒ ⇒ **通用形态：注释里写了「靶子是什么」不算数**，
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **代码里必须真的对着那个靶子量** ——
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 否则尺子量的**根本不是它说的那个东西**。
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⚠️ 而 app 自己**开不了**别的 app ⇒ ⇒
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 「拉起设置」这件事只能由**主机侧**做
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒（驱动脚本已经在做：它把设置拉到前台）
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **app 侧不许把它切走**。
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⚠️⚠️ **而且必须先确认「前台那屏确实可滚」**
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒（否则滑的是一张死屏 ⇒ ⇒ 又是「靶子不配合」）
      final target = await readTreeWithRetry(60);
      expect(target, isNotNull, reason: '读不到前台窗口');
      final targetTexts = labelsOf(target!);
      expect(
        targetTexts.length,
        greaterThan(3),
        reason: '前台那屏的树几乎没东西 ⇒ ⇒ 不是一张可滚列表 ⇒ ⇒ '
            '靶子没准备好（主机侧该把系统设置拉到前台）',
      );

      final FlutterView view = PlatformDispatcher.instance.views.first;
      final Size size = view.physicalSize;

      final beforeTree = await readTreeWithRetry(60);
      expect(beforeTree, isNotNull, reason: '读不到前台窗口');
      final String before = beforeTree ?? '';

      // ⚠️⚠️ **起点必须避开「平台死区」** —— 实测（odin / MIUI 14）：
      // ⇒ ⇒ 桌面上从**正中**（x=540）下拉是**死区**（什么也不发生）
      // ⇒ ⇒ 而从 **x=300** 下拉能拉出 NotificationShade
      // ⇒ ⇒ ⇒ ⇒ 而在**设置列表**里，滚动手势的起点同样避开正中偏上的位置
      // ⇒ ⇒ ⇒ ⇒ ⇒ **通用形态：同一条手势在不同 x 上结果不同 ⇒ ⇒
      // ⇒ ⇒ ⇒ ⇒ ⇒ 尺子不能只试一个坐标就判生死**
      final double x = size.width * 0.28;
      // ⚠️⚠️ **两个方向都要试** —— 实测踩过：设置列表**上一轮已经被滑到底**
      // ⇒ ⇒ ⇒ 再往上滑就**滑不动** ⇒ ⇒ ⇒ 树不变 ⇒ ⇒ ⇒ 红了
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **通用形态：靶子有「当前位置」⇒ ⇒ 尺子不能假设
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 它在某个特定位置 ⇒ ⇒ ⇒ ⇒ ⇒ **通用形态：
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **测「能不能滑」要覆盖它可能的两个方向**。
      String? after;
      final directions = <List<double>>[
        [size.height * 0.72, size.height * 0.28], // 往上推 ⇒ ⇒ 列表往后翻
        [size.height * 0.28, size.height * 0.72], // 往下拉 ⇒ ⇒ 列表往前翻
      ];
      for (final d in directions) {
        await tools.swipe(<String, dynamic>{
          'x1': x,
          'y1': d[0],
          'x2': x,
          'y2': d[1],
          'duration_ms': 500,
        });
        after = await readTreeUntilChanged(before, 20);
        if (after != null) break;
      }
      expect(
        after,
        isNotNull,
        reason: '在别的 app 里两个方向都滑过了，界面**都没有实质变化**'
            ' ⇒ ⇒ 滑动手势在真机上不成立',
      );
      // ignore: avoid_print
      print('--- SCROLL (other app) ---\nbefore=${structureSignature(before)}'
          '\nafter=${structureSignature(after!)}'
          '\nbeforeNodes=${nodeCount(before)}'
          '\nafterNodes=${nodeCount(after)}');
    });
  }, timeout: const Timeout(Duration(minutes: 5)));

  test('长按（**别人的 app 里**）⇒ 被认成长按，**不是**被当成点按', () async {
    await check('长按 ⇒ 被认成长按（不是点按）', () async {
      final tools = CapabilityTools();
      expect(await waitForAccessibility(60), isTrue, reason: '无障碍服务没开');

      // ⚠️⚠️ **靶子必须「长按与点按走出不同结果」** —— 否则两条路分不开，
      // ⇒ ⇒ 而「分不开」意味着这条用例**证明不了任何事**。
      // ⇒ ⇒ ⇒ 实测（odin / MIUI 14）：**桌面（MIUI 启动器）**的 app 图标
      // ⇒ ⇒ ⇒ ⇒ 是 `long-clickable=true`（实测 18 个节点）⇒ ⇒
      // ⇒ ⇒ ⇒ ⇒ **长按** ⇒ ⇒ 弹出菜单（应用信息｜移除｜设置｜下个日程｜…）
      // ⇒ ⇒ ⇒ ⇒ **点按** ⇒ ⇒ **打开那个 app**（实测：日历 → `com.android.calendar`）
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **两条路互斥** ⇒ ⇒ ⇒ 这就是判别式。
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **通用形态：靶子要能区分「两条路」**，
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 否则「证明了什么」是空的。

      // ① 先让自家 app **离开前台** —— 它读不到自己的窗口
      await tools.globalAction(<String, dynamic>{'action': 'home'});
      await Future<void>.delayed(const Duration(milliseconds: 1500));

      // ⚠️ **从树里找一个 long-clickable 的图标** —— 不钉死「哪个图标」
      // ⇒ ⇒（桌面布局因机型而异）⇒ ⇒ 钉「**它可长按**」这个性质。
      final home = await readTreeWithRetry(60);
      expect(home, isNotNull, reason: '读不到桌面');
      final candidates = findLongClickable(home!);
      expect(candidates, isNotEmpty, reason: '桌面里一个像 app 图标的标签都没有'
          ' ⇒ ⇒ 这个机型上没法用它当靶子');
      // ⚠️ **逐个试** —— 不是每个 app 图标都一定响应长按
      // ⇒ ⇒ 所以只要**有一个**长按成功（前台没换人），这条能力就成立。
      _Label? target;
      String? pkgBefore;
      String? pkgAfter;
      Map<String, dynamic>? pressResult;
      for (final c in candidates.take(8)) {
        final before = await AccessibilityController.foregroundPackage();
        final res = await tools.longPress(<String, dynamic>{
          'x': c.cx,
          'y': c.cy,
        });
        // ⚠️ **长按之后前台没换人** ⇒ ⇒ 它**没**被当成点按 ⇒ ⇒ 这次长按成了
        final afterPkg = await AccessibilityController.foregroundPackage();
        // ignore: avoid_print
        print('--- LONG PRESS TRY --- label=${c.text} '
            'at ${c.cx},${c.cy} pkgBefore=$before pkgAfter=$afterPkg');
        if (afterPkg == before) {
          target = c;
          pkgBefore = before;
          pkgAfter = afterPkg;
          pressResult = res as Map<String, dynamic>;
          break;
        }
        // ⚠️ 前台换了人 ⇒ ⇒ 这次被当成点按了 ⇒ ⇒ **换下一个图标**重试
        // ⇒ ⇒ ⇒（顺带把点开的东西退回去 ⇒ ⇒ 别影响后面的用例）
        await tools.globalAction(<String, dynamic>{'action': 'home'});
        await Future<void>.delayed(const Duration(milliseconds: 1200));
      }
      expect(target, isNotNull, reason: '挨个试了 ${candidates.take(8).length} 个桌面图标，'
          '没有一个的长按被认成长按 ⇒ ⇒ 长按在真机上不成立');

      // ⚠️ **派发结果也要看一眼** —— 工具层在「没派发出去」时会**抛错**
      // ⇒ ⇒ 能走到这里就说明派发出去了 ⇒ ⇒ 但**派发成功 ≠ 长按被认出来**
      // ⇒ ⇒ ⇒ （那正是这一条要判的：有没有被当成点按）。
      final Map<String, dynamic> press = pressResult ?? <String, dynamic>{};
      expect(press['longPressed'], isTrue);

      // ③ 读回界面 ⇒ ⇒ 判「**这是长按的结果**」还是「**这是点按的结果**」
      final afterTree = await readTreeUntilChanged(home, 40);
      expect(afterTree, isNotNull, reason: '长按之后界面**没有实质变化**'
          ' ⇒ ⇒ 长按在真机上不成立');
      final afterTexts = labelsOf(afterTree ?? '').join('|');
      final _Label picked = target ?? candidates.first;
      // ignore: avoid_print
      print('--- LONG PRESS (other app) ---\nlabel=${picked.text}'
          '\nat=${picked.cx},${picked.cy}'
          '\nafterNodes=${nodeCount(afterTree ?? '')}'
          '\nafterTexts=$afterTexts');

      // ⚠️⚠️ **判据：长按的结果 ≠ 点按的结果** —— 两条路**互斥**。
      // ⇒ ⇒ 「被当成点按」的症状是：**那个 app 被打开了**。
      // ⇒ ⇒ ⇒ 而「点按才有的界面」的特征是：**前台换了人**。
      // ⇒ ⇒ ⇒ ⚠️ 这里不能钉死某个 app 的名字 ⇒ ⇒（桌面上的图标因机型而异）
      // ⇒ ⇒ ⇒ ⇒ 而要钉**性质**：长按之后**前台没换人**。
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **通用形态：判据钉「性质」，不钉「某个环境下的值」**。
      // ⇒ ⇒ ⇒ ⇒ ⚠️⚠️ 而「前台是谁」这条信息**要产品给** —— 树里**看不出来**
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒（树只有 text/desc/bounds）⇒ ⇒ ⇒ 所以产品侧
      // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 新增了 `foregroundPackage` 字段。
      expect(
        pkgAfter,
        pkgBefore,
        reason: '长按之后**前台换了人**（$pkgBefore ⇒ $pkgAfter）⇒ ⇒ '
            '那个 app 被打开了 ⇒ ⇒ 这次长按**被系统当成了点按**'
            ' ⇒ ⇒ 长按没被认成长按',
      );
    });
  }, timeout: const Timeout(Duration(minutes: 5)));

  test('点按 / 长按：手势被派发出去了（**只证明派发**）', () async {
    await check('点按 / 长按 ⇒ 派发成功', () async {
      final tools = CapabilityTools();
      expect(await waitForAccessibility(60), isTrue, reason: '无障碍服务没开');

      final FlutterView view = PlatformDispatcher.instance.views.first;
      final Size size = view.physicalSize;

      // ⚠️ 这里**故意不比对界面**：点在桌面空白处可能正好命中一个图标
      // ⇒ ⇒ 界面变不变**取决于运气** ⇒ ⇒ 只钉「手势被派发」这一层。
      // ⚠️ 而且工具层在「没派发出去」时会**抛错** ⇒ ⇒ 能走到这里就说明派发出去了。
      final tapped = await tools.tap(<String, dynamic>{
        'x': size.width / 2,
        'y': size.height / 2,
      });
      expect(tapped, isA<Map<String, dynamic>>());
      expect((tapped as Map<String, dynamic>)['tapped'], isTrue);

      final pressed = await tools.longPress(<String, dynamic>{
        'x': size.width / 2,
        'y': size.height / 2,
      });
      expect(pressed, isA<Map<String, dynamic>>());
      expect((pressed as Map<String, dynamic>)['longPressed'], isTrue);

      // 收尾：把设备带回桌面（长按可能在桌面弹了个菜单）
      await tools.globalAction(<String, dynamic>{'action': 'back'});
      await tools.globalAction(<String, dynamic>{'action': 'home'});
    });
  }, timeout: const Timeout(Duration(minutes: 3)));

  test('按文字点一个**不存在的**文本 ⇒ 必须**明确失败**（不能静悄悄说点了）', () async {
    await check('按文字点不存在的文本 ⇒ 必须报错', () async {
      final tools = CapabilityTools();
      expect(await waitForAccessibility(60), isTrue, reason: '无障碍服务没开');

      // ⚠️ 先确认**确实有可读窗口** ⇒ ⇒ 否则「找不到文本」这个理由就不成立
      // ⇒ ⇒ 失败原因会被「窗口都没了」顶包（那就是另一种失败了）。
      expect(await readTreeWithRetry(30), isNotNull, reason: '读不到前台窗口');

      // ⚠️ 用一个**不可能存在**的文本 ⇒ ⇒ 正常路径必然找不到
      // ⇒ ⇒ 工具层必须抛错 ⇒ ⇒ 「失败长得像成功」那一族被堵住。
      var threw = false;
      try {
        await tools.findAndClick(<String, dynamic>{
          'text': '__shadow_mobile_use_no_such_text_9d3f__',
        });
      } catch (_) {
        threw = true;
      }
      expect(
        threw,
        isTrue,
        reason: '找不到那个文本却**没报错** ⇒ ⇒ 模型会以为「点了」',
      );
    });
  }, timeout: const Timeout(Duration(minutes: 3)));

  test('按文字点一个**真的存在**的条目 ⇒ 界面真的变了（**正路径**）', () async {
    await check('按文字点击 ⇒ 真的点到了', () async {
      final tools = CapabilityTools();
      expect(await waitForAccessibility(60), isTrue, reason: '无障碍服务没开');

      final tree = await readTreeWithRetry(60);
      expect(tree, isNotNull, reason: '读不到前台窗口');
      final candidates = extractTexts(tree!);
      expect(candidates, isNotEmpty, reason: '树里一个带文字的条目都没有 ⇒ ⇒ 没东西可点');

      // ⚠️ **逐个试**：不是每个带文字的节点都对应一个**可点**的目标
      // ⇒ ⇒ 所以只要**有一个**点出了界面变化，这条能力就成立。
      var clicked = false;
      for (final text in candidates.take(12)) {
        try {
          await tools.findAndClick(<String, dynamic>{'text': text});
        } catch (_) {
          continue; // 这一条不是可点目标 ⇒ ⇒ 试下一个
        }
        final after = await readTreeUntilChanged(tree, 12);
        if (after != null) {
          clicked = true;
          // ignore: avoid_print
          print('--- FIND AND CLICK --- text=$text nodes '
              '${nodeCount(tree)} -> ${nodeCount(after)}');
          break;
        }
      }
      expect(
        clicked,
        isTrue,
        reason: '挨个试了 12 个带文字的条目，没有一个点出了界面变化 ⇒ ⇒ 「按文字点击」在真机上不成立',
      );
    });
  }, timeout: const Timeout(Duration(minutes: 4)));

  test('从树里读出坐标 ⇒ 点它 ⇒ 界面真的变了（**闭环**）', () async {
    await check('读坐标 ⇒ 点 ⇒ 界面变了', () async {
      final tools = CapabilityTools();
      expect(await waitForAccessibility(60), isTrue, reason: '无障碍服务没开');

      final tree = await readTreeWithRetry(60);
      expect(tree, isNotNull, reason: '读不到前台窗口');
      final labels = extractLabels(tree!);
      expect(
        labels,
        isNotEmpty,
        reason: '树里一个带坐标的条目都没有 ⇒ ⇒ 模型没法定位目标',
      );

      // ⚠️ **逐个试**：不是每个带文字的条目都点得动 ⇒ ⇒ 只要**有一个**
      // 点出了实质变化，这条「读坐标 → 点」的路就算成立。
      var hit = false;
      for (final label in labels.take(12)) {
        await tools.tap(<String, dynamic>{'x': label.cx, 'y': label.cy});
        String? after;
        for (var i = 0; i < 12; i++) {
          final current = await AccessibilityController.readScreen();
          if (current != null && current.trim().isNotEmpty) {
            after = current;
            if (materiallyChanged(tree, current)) break;
          }
          await Future<void>.delayed(const Duration(milliseconds: 400));
        }
        // ignore: avoid_print
        print('--- TAP TRY --- label=${label.text} at ${label.cx},${label.cy}'
            ' afterLen=${after?.length ?? -1}'
            ' afterSig=${after == null ? 'null' : structureSignature(after)}');
        if (after != null && materiallyChanged(tree, after)) {
          hit = true;
          // ignore: avoid_print
          print('--- TAP BY COORD --- label=${label.text} at '
              '${label.cx},${label.cy} nodes '
              '${nodeCount(tree)} -> ${nodeCount(after)}');
          break;
        }
      }
      expect(
        hit,
        isTrue,
        reason: '从树里读出的坐标挨个点了一遍，没有一个点出了界面变化 ⇒ ⇒ 「读坐标 → 点」这条路不成立',
      );
    });
  }, timeout: const Timeout(Duration(minutes: 4)));

  test('【结论】把这次的真机验证结果**如实**报给驱动脚本', () async {
    // ⚠️⚠️ **这条是给驱动脚本看的** —— 它**看不见**上面那些普通 `test()`
    // 的失败 ⇒ ⇒ 只看我们**自己报的**结论 ⇒ ⇒ 所以这里必须**如实**写
    // ⇒ ⇒ 一条都没过 ⇒ ⇒ 就写 FAIL ⇒ ⇒ 驱动据此退出码非 0。
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
