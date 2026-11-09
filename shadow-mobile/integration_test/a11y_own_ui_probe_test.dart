import 'dart:ui' show Display, FlutterView, PlatformDispatcher;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:shadow_mobile/services/accessibility_controller.dart';
import 'package:shadow_mobile/services/capabilities/capability_tools.dart';
import 'package:shadow_mobile/services/capabilities/flutter_semantics_tree.dart';

/// **探针**（probe）—— 一小块**我们自己写的** UI，专门回答一个问题：
/// 「点按 / 长按 到底**点到了哪**？」
///
/// ## 这一族补的是哪一格
///
/// 上一轮那组真机用例证明的是「手势**被派发**」（原生日志 dispatched=true）
/// ⇒ ⇒ 以及「按文字点击」在**系统设置**那种第三方列表上点出了界面变化。
/// ⇒ ⇒ 但「界面变了」是**间接证据**：变了 ≠ 变到了**那一件**东西
/// ⇒ ⇒ 而「点按 / 长按」更只证明了**派发** ⇒ ⇒ 模型点了哪儿，仍然是**猜的**。
/// ⇒ ⇒ 台账里那句「在模型自己写的 UI 上还没验过（那才是主战场）」说的就是这一格。
///
/// ## 为什么探针能把它变成**直接证据**
///
/// 探针跑在**我们自己的进程**里 ⇒ ⇒ 前台窗口就是**我们自己的 UI**
/// ⇒ ⇒ 于是我们能同时拿到两样东西：
/// ① **目标在哪**（用 RenderBox **量**出来，不靠算）；
/// ② **点到了没有**（目标控件**自己的回调**被触发了 ＋ 原始指针事件的落点）。
/// ⇒ ⇒ 这才是「点到了想要的东西」的**直接**证据。
///
/// ## ⚠️ 一个必须说清的前提：自己的 app 读不到自己的窗口
///
/// Android 无障碍框架**不把宿主自己的窗口**交给它自己绑定的服务
/// ⇒ ⇒ rootInActiveWindow 是 null ⇒ ⇒ 这里**不读屏**。
/// ⇒ ⇒ 但这**不妨碍**手势落进来：dispatchGesture 走的是系统注入
/// ⇒ ⇒ 与「读」是**两条路** ⇒ ⇒ 上一轮已实测「手势会落在我们自己的界面上」
/// ⇒ ⇒ ⇒ 这一族补的正是那个缺口：**落进来了，但当时读不到结果**。
///
/// ## ⚠️⚠️ 坐标系：**不猜偏移**，让落点自己作证
///
/// 手势坐标是**屏幕物理像素**，而 Flutter 的事件坐标是**视图逻辑像素**
/// ⇒ ⇒ 两者差一个「视图原点相对屏幕原点的偏移」（状态栏 / 导航栏 / 非全屏）
/// ⇒ ⇒ 而那个偏移**取决于 app 是否 edge-to-edge**（系统版本 / targetSdk / 主题）
/// ⇒ ⇒ ⇒ 所以这里**不假设它是 0**：先在**空白处**点一下，
/// ⇒ ⇒ **用落点自己把偏移量出来**，再拿它去点目标
/// ⇒ ⇒ ⇒ 「坐标系对不对」这件事**不靠假设**，靠**实测**。
class _Probe {
  /// A（点按目标）与 B（长按目标）的定位钥匙。
  static final GlobalKey keyA = GlobalKey();
  static final GlobalKey keyB = GlobalKey();

  /// 视图尺寸（逻辑像素）—— 由布局报出来。
  static double viewWidth = 0;
  static double viewHeight = 0;

  /// 两个目标在**视图逻辑坐标**里的真实矩形 —— 由 **RenderBox 量**出来。
  ///
  /// ⚠️ 为什么不用「按比例算」：Scaffold 的内边距、状态栏 inset、
  /// 折叠屏分屏…… 都会让「算出来的位置」与「真实位置」差一截
  /// ⇒ ⇒ 差一截 ⇒ ⇒ 那一截就足以让点击落到边界之外
  /// ⇒ ⇒ ⇒ **量**比**算**可靠。
  static Rect rectA = Rect.zero;
  static Rect rectB = Rect.zero;

  /// **原始指针事件** —— 比手势识别器更底层
  /// ⇒ ⇒ 长按的判定**不依赖**「按住 500ms vs Flutter 那个 500ms 阈值」的擦边竞态。
  static Offset? down;
  static Offset? up;
  static Duration? held;
  static int downCount = 0;

  /// 目标控件**自己的回调** —— 「那一件东西真的被点了」的最强证据。
  static int tapA = 0;
  static int tapB = 0;
  static int longPressA = 0;
  static int longPressB = 0;

  /// 校准出来的「视图原点相对屏幕原点的偏移」（**物理**像素）。
  static Offset originPhysical = Offset.zero;
  static bool calibrated = false;

  /// ⚠️⚠️ **校准时所在的那块屏** —— 换屏 ⇒ ⇒ 偏移当场作废 ⇒ ⇒ 必须重量。
  static int calibratedDisplayId = -1;
  static double calibratedDpr = 0;

  /// **我们此刻在哪块屏上** —— **量**出来，不猜。
  ///
  /// ⚠️ 为什么必须知道：实测（2026-11-04）真凶 —— app 被 launching 到
  /// ⇒ ⇒ **DeX 虚拟桌面屏**（1920x1080 @**213dpi** ⇒ dpr=**1.33125**）
  /// ⇒ ⇒ 而**无障碍手势只派发到默认屏**（内屏 420dpi ⇒ dpr=**2.625**）
  /// ⇒ ⇒ ⇒ 两块屏**坐标系不同** ⇒ ⇒ 手势落不进我们自己的窗口
  /// ⇒ ⇒ ⇒ 症状：**派发成功、零指针事件** ⇒ ⇒ **长得像手势坏了**
  /// ⇒ ⇒ ⇒ 实际上是我们**不在手势去的那块屏上**。
  static int displayId = -1;
  static double displayDpr = 0;
  static Size displaySize = Size.zero;

  /// 主机侧告诉我们的**期望 dpr**（默认屏 density/160）
  /// ⇒ ⇒ 空串 ＝ 主机没给 ⇒ ⇒ 那就不做这项自检。
  static const String expectDprRaw =
      String.fromEnvironment('PROBE_EXPECT_DPR', defaultValue: '');

  /// 把「我在哪块屏上」**量**出来（FlutterView.display ⇒ id / dpr / size）。
  static void captureDisplay() {
    try {
      final Display display = PlatformDispatcher.instance.views.first.display;
      displayId = display.id;
      displayDpr = display.devicePixelRatio;
      displaySize = display.size;
    } catch (_) {
      // ⚠️ 拿不到就**保持原值** ⇒ ⇒ 后面按「未知」处理，不猜。
    }
  }

  /// 「我是不是在主机期望的那块屏上？」
  ///
  /// ⚠️ 这一条是**自检** —— 不是「相信主机没搞错」，
  /// ⇒ ⇒ 而是「**自己**看一眼 dpr 对不对」⇒ ⇒ 对不上就**明确说这一轮不成立**。
  static bool displayMatchesExpectation() {
    if (expectDprRaw.isEmpty) return true;
    final double? expect = double.tryParse(expectDprRaw);
    if (expect == null) return true;
    return (displayDpr - expect).abs() < 0.01;
  }

  static Duration _downStamp = Duration.zero;

  static void onDown(PointerDownEvent event) {
    down = event.position;
    downCount++;
    up = null;
    held = null;
    _downStamp = event.timeStamp;
  }

  static void onUp(PointerUpEvent event) {
    up = event.position;
    held = event.timeStamp - _downStamp;
  }
}

/// 一个**可点**的目标块（它自己的回调就是证据）。
class _Target extends StatelessWidget {
  const _Target({
    super.key,
    required this.color,
    required this.label,
    required this.onTap,
    required this.onLongPress,
  });

  final Color color;

  /// ⚠️ **语义标签** —— 自家 app 的界面模型（Flutter 语义树）只拍
  /// **带字**的节点 ⇒ ⇒ 没有标签 ⇒ ⇒ 树里就一个字都没有
  /// ⇒ ⇒ 「自家窗口的界面模型」这一格等于**空着**。
  final String label;

  final VoidCallback onTap;
  final VoidCallback onLongPress;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        onLongPress: onLongPress,
        child: ColoredBox(color: color),
      ),
    );
  }
}

/// **生命周期观察者** —— 把「App 什么时候被暂停 / 停止」**打出来**。
///
/// ⚠️ 为什么需要它：手势走 `dispatchGesture` ⇒ ⇒ 它派发到**当前可交互的窗口**
/// ⇒ ⇒ 而 App 一旦被 **STOPPED**（息屏 / 被切走）就**收不到触摸**了
/// ⇒ ⇒ ⇒ 症状：`dispatched=true`（派发成功）但 App 里**零指针事件**
/// ⇒ ⇒ ⇒ 而那条路**静悄悄** ⇒ ⇒ 所以必须把生命周期**打出来**才能定位。
class _LifecycleProbe extends WidgetsBindingObserver {
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // ignore: avoid_print
    print('--- PROBE LIFECYCLE --- $state '
        'framesEnabled=${SchedulerBinding.instance.framesEnabled}');
  }
}

/// 探针页 —— 两个目标 ＋ 中间一大片**空白**（负控用）。
class _ProbeApp extends StatelessWidget {
  const _ProbeApp();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: const Color(0xFF101014),
        // ⚠️ 根 Listener 必须是两个目标的**祖先**（不能是兄弟）
        // ⇒ ⇒ 否则命中测试只会把事件给最上面那个目标
        // ⇒ ⇒ 空白处就收不到事件 ⇒ ⇒ 负控会变成「什么都没发生」
        // ⇒ ⇒ 而不是「**什么都没被点到**」。
        body: Listener(
          behavior: HitTestBehavior.opaque,
          onPointerDown: _Probe.onDown,
          onPointerUp: _Probe.onUp,
          child: LayoutBuilder(
            builder: (BuildContext context, BoxConstraints constraints) {
              final double w = constraints.maxWidth;
              final double h = constraints.maxHeight;
              // 目标边长取短边的 30% ⇒ ⇒ 足够大（容得下状态栏那种偏移）
              // ⇒ ⇒ 又足够小（两个目标之间留得开空白）。
              final double side = (w < h ? w : h) * 0.30;
              _Probe.viewWidth = w;
              _Probe.viewHeight = h;
              return Stack(
                children: <Widget>[
                  Positioned(
                    left: w * 0.06,
                    top: h * 0.18,
                    width: side,
                    height: side,
                    child: _Target(
                      key: _Probe.keyA,
                      color: const Color(0xFF00897B),
                      label: '目标甲',
                      onTap: () => _Probe.tapA++,
                      onLongPress: () => _Probe.longPressA++,
                    ),
                  ),
                  Positioned(
                    left: w * 0.64,
                    top: h * 0.60,
                    width: side,
                    height: side,
                    child: _Target(
                      key: _Probe.keyB,
                      color: const Color(0xFF6D4C41),
                      label: '目标乙',
                      onTap: () => _Probe.tapB++,
                      onLongPress: () => _Probe.longPressB++,
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}


/// **语义树的 handle** —— 必须**握住不放**。
///
/// ⚠️ 为什么必须显式开：Flutter 只在「平台请求语义」时才建树
/// ⇒ ⇒ 自家 app 的界面模型（`FlutterSemanticsTree`）就**读不到**
/// ⇒ ⇒ 而这一族要验的正是它 ⇒ ⇒ 所以这里**自己**把它打开。
SemanticsHandle? _semanticsHandle;

/// 从**语义树文本**里抽出「某个 label 那一段」的 bounds（整屏口径）。
///
/// ⚠️ 为什么现算：树的文本格式是**给人看的** ⇒ ⇒ 解析它就是「拿尺子量」
/// ⇒ ⇒ 但尺子本身要有分辨力 ⇒ ⇒ 解析不出来就回 null ⇒ ⇒ 断言立刻红
/// ⇒ ⇒ 而不是「解析不出来就当过了」。
Rect? boundsOfLabel(String tree, String label) {
  final List<String> lines = tree.split('\n');
  for (var i = 0; i < lines.length; i++) {
    if (!lines[i].contains('text: $label')) continue;
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

/// 设备像素比（逻辑像素 ⇄ 屏幕物理像素的换算因子）。
double _devicePixelRatio() {
  return WidgetsBinding.instance.platformDispatcher.views.first.devicePixelRatio;
}

/// 某个 widget 在**视图逻辑坐标**里的真实矩形（**量**出来的，不是算的）。
Rect? rectOf(GlobalKey key) {
  final BuildContext? ctx = key.currentContext;
  if (ctx == null) return null;
  final RenderObject? ro = ctx.findRenderObject();
  if (ro is! RenderBox || !ro.hasSize) return null;
  if (ro.size.isEmpty) return null;
  return ro.localToGlobal(Offset.zero) & ro.size;
}

void main() {
  final IntegrationTestWidgetsFlutterBinding binding =
      IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  // ⚠️⚠️⚠️ **必须切到 fullyLive** —— 这是「探针布局不落地」的**根因**
  // （2026-11-03 读 flutter 源码定位）。
  //
  // ## 为什么默认策略下探针页**永远不会被构建**
  //
  // `IntegrationTestWidgetsFlutterBinding` 继承 `LiveTestWidgetsFlutterBinding`，
  // 后者的**默认 framePolicy 是 `fadePointers`** ⇒ ⇒ 而 `fadePointers` 下
  // `handleBeginFrame` **只有 `_viewNeedsPaint` 为真时才真的画帧**：
  //
  //     if (_expectingFrame || _expectingFrameToReassemble ||
  //         (framePolicy == fullyLive) || ... ||
  //         (framePolicy == fadePointers && _viewNeedsPaint)) {
  //       _drawFrame = drawFrame; super.handleBeginFrame(...);
  //     } else {
  //       _drawFrame = skipFrame;      // ← 帧被**丢掉**
  //     }
  //
  // ⇒ ⇒ `_viewNeedsPaint` 只有在**真的画过一次之后**才为真
  // ⇒ ⇒ 于是：第一次帧（**唯一能构建 widget 树的那次**）被跳过
  // ⇒ ⇒ 什么都没被 paint ⇒ ⇒ `_viewNeedsPaint` 永远为假
  // ⇒ ⇒ 之后每一帧继续被跳过 ⇒ ⇒ **树永远不构建**。
  //
  // ⇒ ⇒ 症状与真机实测**逐字对得上**：
  //     rootElement=mounted keyA=null view=0.0x0.0
  //     framesEnabled=true schedulerPhase=idle
  // ⇒ ⇒（`framesEnabled=true` 说明**帧是开着的**，只是**一个都没被画**）
  //
  // ## 之前那版注释**猜错了方向**
  //
  // 旧注释说「只 sleep、不手动出帧 —— 手动 `scheduleFrame()` 多余且有害」。
  // ⇒ ⇒ 方向反了：问题不是「引擎不出帧」，而是「**binding 把帧跳过了**」。
  // ⇒ ⇒ `scheduleFrame()` 只是**请求**一帧，跳不跳由 binding 说了算 ⇒ ⇒ 无效。
  // ⇒ ⇒ 真正能强制「这一帧被画」的是 `binding.pump()`（它会置 `_expectingFrame`）。
  //
  // ## 为什么选 fullyLive 而不是只 pump 一次
  //
  // 这一族要验的是「**手势落在自家 UI 的哪一件东西上**」⇒ ⇒ 探针页得**像个真 App**
  // ⇒ ⇒ 一直渲染 ⇒ ⇒ `fullyLive`（每个被请求的帧都画）最贴近生产形态。
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;

  // ⚠️⚠️⚠️ **必须放行「设备指针事件」** —— 这是「手势落不进 app」的**真凶**
  // （2026-11-03 读 flutter_test 源码定位）。
  //
  // ## 症状
  //
  // 探针页明明在前台、Activity 是 RESUMED、窗口是 touchable 的，
  // 无障碍那边 `performTap: (540.0,910.8) dispatched=true` 也派发成功，
  // ⇒ ⇒ **可 app 里一个指针事件都没有**（downCount 恒为 0）。
  //
  // ## 真凶
  //
  // `flutter_test` 的 `LiveTestWidgetsFlutterBinding`（`integration_test` 的父类）
  // **默认把「真实设备」的指针事件丢掉** —— 源码原文：
  //
  //   /// This means that pointer events triggered by the [WidgetController] will
  //   /// result in actual interactions with the UI, but other pointer events
  //   /// such as those from physical taps will be dropped.
  //   bool shouldPropagateDevicePointerEvents = false;
  //
  // ⇒ ⇒ `handlePointerEvent` 里 `pointerEventSource == device` 且该标志为 false
  // ⇒ ⇒ ⇒ 事件**直接被丢**（不派发给框架）⇒ ⇒ 探针的 `Listener` 收不到。
  // ⇒ ⇒ ⇒ 所以这跟「a11y 能不能派发」**无关** —— 连 `adb shell input tap`
  // ⇒ ⇒ ⇒ 也一样进不来（实测：普通 tap 也没让 downCount 涨）。
  //
  // ## 为什么这是**脚手架**问题、不是生产链路问题
  //
  // 真 App（不是测试目标包）跑的是普通 `WidgetsFlutterBinding`
  // ⇒ ⇒ 没有这层拦截 ⇒ ⇒ 实测 `adb shell input tap` 能打开「设置」页 ✓
  // ⇒ ⇒ ⇒ 生产链路上的触摸**是通的**；只有集成测试里被挡掉了。
  //
  // ## 顺带：这条标志**每个用例结束都会被校验**
  //
  // `_verifyShouldPropagateDevicePointerEventsUnset` 会比对「用例前后」的值
  // ⇒ ⇒ 所以在 `main()` 里设一次就够（每条用例开始时它已经是 true）
  // ⇒ ⇒ ⇒ 用例体内**不要**再改它。
  binding.shouldPropagateDevicePointerEvents = true;

  // ⚠️ **把生命周期打出来** —— 手势落不进来时，这是**唯一**能说清原因的证据。
  WidgetsBinding.instance.addObserver(_LifecycleProbe());

  // ⚠️⚠️ **必须显式开语义树** —— Flutter 只在「平台请求语义」时才建树
  // ⇒ ⇒ 自家 app 的界面模型（`FlutterSemanticsTree`）就**读不到**
  // ⇒ ⇒ 而这一族要验的正是它 ⇒ ⇒ 所以这里**自己**把它打开
  // ⇒ ⇒ 并把 handle **握住不放**（放开 ⇒ ⇒ 树当场被拆掉）。
  _semanticsHandle = SemanticsBinding.instance.ensureSemantics();

  // ⚠️ **探针必须先起来** —— 它就是「被点的那一样东西」。
  runApp(const _ProbeApp());

  /// **失败清单** —— 为什么自己记一份：官方驱动看不见普通 test() 的失败。
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

  /// 等布局落地 —— 并且**顺手把两个目标的真实矩形量出来**。
  ///
  /// ⚠️⚠️ 为什么这里**要主动 pump 一帧**（旧注释说「别去指挥引擎出帧」——
  /// ⇒ ⇒ **方向反了**，已更正）：
  /// ⇒ ⇒ 真正的问题不是「引擎不出帧」，而是「**binding 把帧跳过了**」
  /// ⇒ ⇒ （见 `main()` 里那段 `fullyLive` 的根因说明）
  /// ⇒ ⇒ `scheduleFrame()` 只**请求**一帧，跳不跳由 binding 说了算 ⇒ ⇒ 无效
  /// ⇒ ⇒ `binding.pump()` 走的是 binding 的 `_expectingFrame` 那条路
  /// ⇒ ⇒ ⇒ 它会**强制**下一帧真的被画出来 ⇒ ⇒ 这是这里唯一有效的手段。
  ///
  /// ⚠️ `pump()` 有 `assert(inTest)` ⇒ ⇒ 万一不在 test 里，**不该把测试带崩**
  /// ⇒ ⇒ ⇒ 故：包 try/catch ＋ 加超时（帧没来时会挂住）。
  Future<bool> waitForLayout() async {
    try {
      await binding.pump().timeout(
            const Duration(seconds: 5),
            onTimeout: () {},
          );
    } catch (_) {
      // ⚠️ pump 失败**不该**让整条检查挂掉 ⇒ ⇒ 后面的轮询还能给出真实诊断。
    }
    // ⚠️⚠️ **屏必须先稳定下来** —— 实测（2026-11-04）：app 会被 launching 到
    // ⇒ ⇒ **DeX 虚拟桌面屏**（dpr=1.33125）上 ⇒ ⇒ 而手势只去**默认屏**
    // ⇒ ⇒ ⇒ 两块屏坐标系不同 ⇒ ⇒ 手势落不进我们的窗口 ⇒ ⇒ 零指针事件
    // ⇒ ⇒ ⇒ ⇒ 所以这里**等屏不再变**，别拿着半路那套几何去算坐标。
    int? lastDisplayId;
    double lastDpr = 0;
    for (var i = 0; i < 40; i++) {
      final Rect? a = rectOf(_Probe.keyA);
      final Rect? b = rectOf(_Probe.keyB);
      _Probe.captureDisplay();
      final bool displayStable = lastDisplayId == _Probe.displayId &&
          (lastDpr - _Probe.displayDpr).abs() < 0.0001;
      if (!displayStable) {
        lastDisplayId = _Probe.displayId;
        lastDpr = _Probe.displayDpr;
      }
      if (a != null && b != null && _Probe.viewWidth > 0 && displayStable) {
        _Probe.rectA = a;
        _Probe.rectB = b;
        return true;
      }
      // ⚠️⚠️ **诊断必须打在「等待过程里」，不能打在「等完之后」** ——
      // ⇒ ⇒ 前两轮都把诊断放在 expect **之后** ⇒ ⇒ expect 一炸就**永远打不出来**
      // ⇒ ⇒ ⇒ 结果：连「rootElement 到底挂上了没有」都不知道 ⇒ ⇒ 白跑两轮。
      // ⇒ ⇒ ⇒ 所以这里**第一次就打印**，而且**只打前三次**（免得刷屏）。
      if (i < 3) {
        // ignore: avoid_print
        print('--- PROBE WAIT#$i --- rootElement='
            '${WidgetsBinding.instance.rootElement == null ? 'null' : 'mounted'} '
            'keyA=${_Probe.keyA.currentContext == null ? 'null' : 'has ctx'} '
            'view=${_Probe.viewWidth}x${_Probe.viewHeight} '
            'framesEnabled=${SchedulerBinding.instance.framesEnabled} '
            'schedulerPhase=${SchedulerBinding.instance.schedulerPhase} '
            'framePolicy=${binding.framePolicy.name}');
      }
      await Future<void>.delayed(const Duration(milliseconds: 250));
    }
    return false;
  }

  /// 等「这一次手势」真的落进 app（用 downCount 区分前后两次）。
  Future<bool> waitForLanding(int before) async {
    for (var i = 0; i < 40; i++) {
      if (_Probe.downCount > before && _Probe.down != null && _Probe.up != null) {
        return true;
      }
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
    return false;
  }

  /// 落点是不是落在**某个目标**里。
  bool inAnyTarget(Offset point) {
    return _Probe.rectA.inflate(6).contains(point) ||
        _Probe.rectB.inflate(6).contains(point);
  }

  /// 两个目标**之间**的那片空白（负控点 ＋ 校准点都用它）。
  ///
  /// ⚠️ 为什么选「两者之间」而不是随便找个空白：它的 **x** 落在
  /// 两块目标的 x 区间**之外** ⇒ ⇒ 就算 y 因为状态栏那种偏移而偏了，
  /// ⇒ ⇒ 它**仍然**不在任何目标里 ⇒ ⇒ 校准不会误触目标。
  Offset blankPoint() {
    final double x = (_Probe.rectA.right + _Probe.rectB.left) / 2;
    final double y = (_Probe.rectA.bottom + _Probe.rectB.top) / 2;
    return Offset(x, y);
  }

  /// 校准：找一个**空白**的点按 ⇒ ⇒ 换算出「视图原点相对屏幕原点的偏移」。
  ///
  /// ⚠️ 为什么必须校准：手势坐标是**屏幕物理像素**，Flutter 事件坐标是
  /// **视图逻辑像素** ⇒ ⇒ 两者差一个偏移 ⇒ ⇒ 而那个偏移**取决于 app 是否
  /// edge-to-edge** ⇒ ⇒ ⇒ 所以**不猜**：在空白处点一下，
  /// **用落点自己把偏移量出来**。
  /// **重新量**一次：两个目标的真实矩形 ＋ 屏信息。
  ///
  /// ⚠️ 为什么每次都要重量：目标矩形 / 空白点 / dpr **全都依赖当下那套几何**
  /// ⇒ ⇒ 换屏 / 分屏 / 折叠展开都会让它们**当场过期**
  /// ⇒ ⇒ ⇒ 拿着过期的几何去点 ⇒ ⇒ 点到别的地方 ⇒ ⇒ **看着像「点歪了」**。
  void remeasure() {
    final Rect? a = rectOf(_Probe.keyA);
    final Rect? b = rectOf(_Probe.keyB);
    if (a != null) _Probe.rectA = a;
    if (b != null) _Probe.rectB = b;
    _Probe.captureDisplay();
  }

  Future<bool> calibrate() async {
    // ⚠️⚠️ **每次校准前先重量** —— 别拿上一轮那套几何算坐标。
    remeasure();
    // ⚠️ **换过屏 ⇒ ⇒ 上次校准出来的偏移作废** —— 坐标系跟着屏走。
    if (_Probe.calibrated &&
        _Probe.calibratedDisplayId == _Probe.displayId &&
        (_Probe.calibratedDpr - _Probe.displayDpr).abs() < 0.0001) {
      return true;
    }
    final double dpr = _devicePixelRatio();
    final Offset blank = blankPoint();
    // ⚠️⚠️ 候选点必须按**当前几何**生成，不能硬编码 ——
    // ⇒ ⇒ 实测踩过：设备**跑着跑着转了屏**（横屏 dpr=1.33 ⇒ ⇒ 竖屏 dpr=2.625）
    // ⇒ ⇒ ⇒ 而候选点里的 `300` / `1200` 是**物理像素硬编码**
    // ⇒ ⇒ ⇒ 转屏后它们指的是**完全不同的位置**
    // ⇒ ⇒ ⇒ 于是量出来的偏移是 `Offset(413.0, 147.9)` 这种**离谱值**
    // ⇒ ⇒ ⇒ ⇒ 被自己的「偏移离谱」闸拒掉 ⇒ ⇒ 整族白跑。
    // ⇒ ⇒ ⇒ 修法：候选点按**当前**的空白竖线生成，
    // ⇒ ⇒ ⇒ 且**只在竖线上散开 y**（x 固定）⇒ ⇒ 不管 y 偏多少，
    // ⇒ ⇒ ⇒ x 都在两块目标之外 ⇒ ⇒ 不会误触。
    final List<Offset> candidates = <Offset>[
      Offset(blank.dx * dpr, blank.dy * dpr),
      Offset(blank.dx * dpr, blank.dy * dpr * 0.45),
      Offset(blank.dx * dpr, blank.dy * dpr * 1.55),
    ];
    for (final Offset candidate in candidates) {
      final int downBefore = _Probe.downCount;
      final int tapABefore = _Probe.tapA;
      final int tapBBefore = _Probe.tapB;
      await CapabilityTools().tap(<String, dynamic>{
        'x': candidate.dx,
        'y': candidate.dy,
      });
      final bool landed = await waitForLanding(downBefore);
      if (!landed) {
        // ⚠️⚠️ **诊断必须打在「没落进来」的那一刻** —— 不然只剩一个 false。
        // ⇒ ⇒ `lifecycle` 是关键：App 被 STOPPED ⇒ ⇒ 触摸根本进不来。
        // ignore: avoid_print
        print('--- PROBE CALIBRATE MISS --- candidate=$candidate '
            'downCount=${_Probe.downCount} (before=$downBefore) '
            'lifecycle=${WidgetsBinding.instance.lifecycleState} '
            'framesEnabled=${SchedulerBinding.instance.framesEnabled} '
            'displayId=${_Probe.displayId} displayDpr=${_Probe.displayDpr}');
        continue;
      }
      final Offset landing = _Probe.down!;
      final Offset origin = Offset(
        candidate.dx - landing.dx * dpr,
        candidate.dy - landing.dy * dpr,
      );
      // ignore: avoid_print
      print('--- PROBE CALIBRATE HIT --- candidate=$candidate landed=$landing '
          'origin=$origin downCount=${_Probe.downCount}');
      // ⚠️ 误触了目标 ⇒ ⇒ 换下一个候选（这一下不算校准）。
      if (_Probe.tapA != tapABefore || _Probe.tapB != tapBBefore) {
        // ignore: avoid_print
        print('--- PROBE CALIBRATE REJECT --- 误触了目标');
        continue;
      }
      if (inAnyTarget(landing)) {
        // ignore: avoid_print
        print('--- PROBE CALIBRATE REJECT --- 落点在目标里');
        continue;
      }
      // ⚠️ 量出来的偏移**离谱** ⇒ ⇒ 说明这一轮的数据不可信
      // ⇒ ⇒ ⇒ 宁可换一个候选，也不要拿一个错的偏移去点目标。
      if (origin.dx.abs() > 300 || origin.dy.abs() > 300) {
        // ignore: avoid_print
        print('--- PROBE CALIBRATE REJECT --- 偏移离谱 $origin');
        continue;
      }
      // ⚠️⚠️⚠️ **量出来的偏移必须再验一次** —— 之前的版本是
      // ⇒ ⇒ 「量出来 ⇒ 直接拿去点目标」⇒ ⇒ 而那一步**没被验证过**
      // ⇒ ⇒ ⇒ 一旦几何在量与用之间变了（转屏 / 窗口大小变）
      // ⇒ ⇒ ⇒ 拿一个**过期的偏移**去点 ⇒ ⇒ 点到别的地方 ⇒ ⇒ 看起来像「点歪了」
      // ⇒ ⇒ ⇒ ⇒ 其实是我们自己的坐标**过期**了。
      // ⇒ ⇒ ⇒ 验证法：**按算出来的偏移再点一次同一个空白点**，
      // ⇒ ⇒ ⇒ 落点**必须回到同一个地方**（误差 ≤ 25 逻辑像素）
      // ⇒ ⇒ ⇒ 否则这个偏移**不可信** ⇒ ⇒ 换下一个候选。
      final Offset verifyPoint = Offset(
        blank.dx * dpr + origin.dx,
        blank.dy * dpr + origin.dy,
      );
      final int downBeforeVerify = _Probe.downCount;
      await CapabilityTools().tap(<String, dynamic>{
        'x': verifyPoint.dx,
        'y': verifyPoint.dy,
      });
      final bool verifyLanded = await waitForLanding(downBeforeVerify);
      if (!verifyLanded) {
        // ignore: avoid_print
        print('--- PROBE CALIBRATE REJECT --- 验证那一下没落进来');
        continue;
      }
      final Offset verifyLanding = _Probe.down!;
      if ((verifyLanding - blank).distance > 25.0) {
        // ignore: avoid_print
        print('--- PROBE CALIBRATE REJECT --- 验证落点 $verifyLanding '
            '没回到空白点 $blank ⇒ ⇒ 偏移不可信（几何变了？）');
        continue;
      }
      _Probe.originPhysical = origin;
      _Probe.calibrated = true;
      _Probe.calibratedDisplayId = _Probe.displayId;
      _Probe.calibratedDpr = _Probe.displayDpr;
      // ignore: avoid_print
      print('--- PROBE CALIBRATE --- sent=$candidate landed=$landing '
          'originPhysical=$origin dpr=$dpr '
          'verify=$verifyPoint verifyLanding=$verifyLanding '
          'displayId=${_Probe.displayId} displayDpr=${_Probe.displayDpr}');
      return true;
    }
    return false;
  }

  /// 视图逻辑坐标 ⇒ 屏幕物理坐标（**用校准出来的偏移**换算）。
  Offset? screenPoint(Offset logical) {
    if (!_Probe.calibrated) return null;
    final double dpr = _devicePixelRatio();
    return Offset(
      logical.dx * dpr + _Probe.originPhysical.dx,
      logical.dy * dpr + _Probe.originPhysical.dy,
    );
  }

  test('探针布局就绪（没有它，后面的断言都是空的）', () async {
    await check('探针布局就绪', () async {
      expect(
        await waitForAccessibility(60),
        isTrue,
        reason: '无障碍服务没开 ⇒ ⇒ 请在系统设置里开启「影」的无障碍服务'
            '（或主机侧代开：adb shell settings put secure '
            'enabled_accessibility_services '
            'com.ibloc.shadow/com.ibloc.shadow.PrefrontalAccessibilityService '
            '&& adb shell settings put secure accessibility_enabled 1）',
      );
      expect(
        await waitForLayout(),
        isTrue,
        reason: '探针布局没落地 ⇒ ⇒ 后面那些「点到了哪个控件」的断言全是空的',
      );

      // ⚠️ 视图尺寸要跟**物理屏幕**对得上 —— 对不上说明坐标系整个是错的。
      final FlutterView view = PlatformDispatcher.instance.views.first;
      final double dpr = _devicePixelRatio();
      expect(
        _Probe.viewWidth,
        closeTo(view.physicalSize.width / dpr, 1.0),
        reason: '探针视图宽 ${_Probe.viewWidth} 与物理屏宽换算出来的 '
            '${view.physicalSize.width / dpr} 对不上',
      );
      expect(
        _Probe.viewHeight,
        closeTo(view.physicalSize.height / dpr, 1.0),
        reason: '探针视图高 ${_Probe.viewHeight} 与物理屏高换算出来的 '
            '${view.physicalSize.height / dpr} 对不上',
      );

      // ⚠️⚠️ **自检：我在主机期望的那块屏上吗？**
      // ⇒ ⇒ 实测（2026-11-04）真凶：app 被 launching 到 **DeX / 外接虚拟屏**
      // ⇒ ⇒ ⇒（dpr=1.33125）⇒ ⇒ 而手势只派发到**默认屏**（dpr=2.625）
      // ⇒ ⇒ ⇒ ⇒ 两块屏坐标系不同 ⇒ ⇒ 手势落不进我们自己的窗口
      // ⇒ ⇒ ⇒ ⇒ 症状：**派发成功、零指针事件** ⇒ ⇒ **长得像手势坏了**
      // ⇒ ⇒ ⇒ ⇒ 实际上是我们**不在手势去的那块屏上** ⇒ ⇒ 这一轮不成立。
      expect(
        _Probe.displayMatchesExpectation(),
        isTrue,
        reason: '探针跑在 dpr=${_Probe.displayDpr} 的屏上，'
            '而主机期望的是 dpr=${_Probe.expectDprRaw} '
            '⇒ ⇒ 大概率落在 DeX / 外接虚拟屏上 ⇒ ⇒ '
            '无障碍手势不会落到这块屏 ⇒ ⇒ 这一轮**不成立**',
      );

      // ⚠️ **诊断**：自己的 app 读不到自己的窗口 ⇒ ⇒ 读屏这里是空的。
      // ⇒ ⇒ 这条**不断言**（平台行为可能变）⇒ ⇒ 只把它记下来。
      // ⚠️ **诊断**：rootElement 挂上了没有 ⇒ ⇒ 探针页到底有没有被挂进去。
      // ⇒ ⇒ 这一行是**排查用**的：上一轮「布局没落地」的失败，
      // ⇒ ⇒ 究竟是「runApp 没生效」还是「帧没来」，全靠它分辨。
      // ignore: avoid_print
      print('--- PROBE ROOT --- rootElement='
          '${WidgetsBinding.instance.rootElement == null ? 'null' : 'mounted'} '
          'keyA=${_Probe.keyA.currentContext == null ? 'null' : 'has ctx'} '
          'view=${_Probe.viewWidth}x${_Probe.viewHeight}');

      final String? ownTree = await AccessibilityController.readScreen();
      // ignore: avoid_print
      print('--- PROBE LAYOUT --- dpr=$dpr '
          'view=${_Probe.viewWidth}x${_Probe.viewHeight} '
          'rectA=${_Probe.rectA} rectB=${_Probe.rectB} '
          'blank=${blankPoint()} '
          'displayId=${_Probe.displayId} displayDpr=${_Probe.displayDpr} '
          'displaySize=${_Probe.displaySize} '
          'ownTree=${ownTree == null ? 'null' : ownTree.length}');
    });
  }, timeout: const Timeout(Duration(minutes: 3)));

  test('校准 ⇒ 从落点把「视图原点偏移」量出来（不靠假设）', () async {
    await check('校准 ⇒ 量出视图原点偏移', () async {
      expect(await waitForLayout(), isTrue, reason: '探针布局没落地');
      final bool ok = await calibrate();
      expect(
        ok,
        isTrue,
        reason: '三个候选空白点都没量出偏移 ⇒ ⇒ 这一轮没法在自家 UI 上验',
      );
      expect(_Probe.calibrated, isTrue);
    });
  }, timeout: const Timeout(Duration(minutes: 3)));

  test('点按 ⇒ 落在**我指的那个控件**上（不是「派发出去了」）', () async {
    await check('点按 ⇒ 命中目标 A', () async {
      final CapabilityTools tools = CapabilityTools();
      expect(await waitForAccessibility(60), isTrue, reason: '无障碍服务没开');
      expect(await waitForLayout(), isTrue, reason: '探针布局没落地');
      expect(await calibrate(), isTrue, reason: '校准失败 ⇒ ⇒ 坐标系没法定');

      final Rect rectA = _Probe.rectA;
      final Offset target = rectA.center;
      final Offset sent = screenPoint(target)!;
      final int tapABefore = _Probe.tapA;
      final int tapBBefore = _Probe.tapB;
      final int downBefore = _Probe.downCount;

      // 走**生产那条路**：工具层 → 方法通道 → Kotlin → 无障碍服务 → 系统。
      await tools.tap(<String, dynamic>{'x': sent.dx, 'y': sent.dy});

      final bool landed = await waitForLanding(downBefore);
      expect(
        landed,
        isTrue,
        reason: '手势派发之后，**app 里一个指针事件都没有** ⇒ ⇒ '
            '那一下没落到我们自己的窗口上 ⇒ ⇒ 「点按」这条路在自家 UI 上不成立',
      );

      // ⚠️⚠️ **最强的那条**：目标控件**自己的回调**被触发了
      // ⇒ ⇒ 这不是「界面变了」的间接判断，而是「**那一件东西**被点了」。
      expect(
        _Probe.tapA,
        tapABefore + 1,
        reason: '目标 A 的 onTap **没被触发** ⇒ ⇒ 那一下没落到它身上',
      );
      expect(
        _Probe.tapB,
        tapBBefore,
        reason: '目标 B 的 onTap 被触发了 ⇒ ⇒ 落到了**别的**东西上',
      );

      // 落点必须**就是**目标 A 的中心（校准过了 ⇒ ⇒ 差值应当极小）。
      final Offset landing = _Probe.down!;
      expect(
        (landing - target).distance,
        lessThan(25.0),
        reason: '落点 $landing 离目标中心 $target 太远 ⇒ ⇒ 坐标系换算还是有问题',
      );
      expect(inAnyTarget(landing), isTrue, reason: '落点不在任何目标里');
      // ignore: avoid_print
      print('--- PROBE TAP --- sent=$sent landed=$landing target=$target '
          'tapA=${_Probe.tapA} tapB=${_Probe.tapB} '
          'displayId=${_Probe.displayId} displayDpr=${_Probe.displayDpr}');
    });
  }, timeout: const Timeout(Duration(minutes: 4)));

  test('长按 ⇒ 落在**我指的那个控件**上（按住的事实，不是「派发出去了」）', () async {
    await check('长按 ⇒ 命中目标 B', () async {
      final CapabilityTools tools = CapabilityTools();
      expect(await waitForAccessibility(60), isTrue, reason: '无障碍服务没开');
      expect(await waitForLayout(), isTrue, reason: '探针布局没落地');
      expect(await calibrate(), isTrue, reason: '校准失败 ⇒ ⇒ 坐标系没法定');

      final Rect rectB = _Probe.rectB;
      final Offset target = rectB.center;
      final Offset sent = screenPoint(target)!;
      final int downBefore = _Probe.downCount;
      // ⚠️ **先记基线** ⇒ ⇒ 后面断言「**净增**」⇒ ⇒ 不被前面的用例污染。
      final int longPressBefore = _Probe.longPressB;
      final int tapBefore = _Probe.tapB;

      await tools.longPress(<String, dynamic>{'x': sent.dx, 'y': sent.dy});

      final bool landed = await waitForLanding(downBefore);
      expect(
        landed,
        isTrue,
        reason: '长按派发之后，**app 里一个指针事件都没有** ⇒ ⇒ '
            '那一下没落到我们自己的窗口上',
      );
      // ⚠️ **按住时长**是长按的**事实** —— 比手势识别器的阈值可靠
      // ⇒ ⇒ Kotlin 那边长按是 800ms ⇒ ⇒ 这里要求 **> 500ms**（越过平台阈值）。
      expect(
        _Probe.held,
        isNotNull,
        reason: '没有拿到「抬起」事件 ⇒ ⇒ 这一下不是一次完整的长按',
      );
      expect(
        _Probe.held!.inMilliseconds,
        greaterThan(500),
        reason: '按住时长只有 ${_Probe.held!.inMilliseconds}ms ⇒ ⇒ '
            '没越过平台的长按阈值（500ms）⇒ ⇒ 这一下在 app 眼里不是长按',
      );
      // ⚠️⚠️⚠️ **「手指停了多久」不等于「app 认这是长按」** ——
      // ⇒ ⇒ 真机实测（2026-11-10，Kotlin 侧按住 500ms）：**onLongPress 没触发，
      // 反倒是 onTap 触发了** ⇒ ⇒ app 收到的是**点按**！
      // ⇒ ⇒ ⇒ 那把只量「按住 ≥350ms」的尺子**量错了被测物** ⇒ ⇒ 绿灯是假的。
      // ⇒ ⇒ ⇒ 所以这里必须断言**控件自己的长按回调**被触发了。
      expect(
        _Probe.longPressB - longPressBefore,
        equals(1),
        reason: '长按**没有被 app 认成长按**（onLongPress 没触发）⇒ ⇒ '
            '这一下在 app 眼里是别的东西 ⇒ ⇒ 长按这条能力不成立',
      );
      expect(
        _Probe.tapB - tapBefore,
        equals(0),
        reason: '这一下被 app 当成了**点按**（onTap 触发）⇒ ⇒ '
            '长按会误触发点击动作 ⇒ ⇒ 比「没长按」更糟',
      );
      final Offset landing = _Probe.down!;
      expect(
        (landing - target).distance,
        lessThan(25.0),
        reason: '长按落点 $landing 离目标中心 $target 太远',
      );
      // ignore: avoid_print
      print('--- PROBE LONG PRESS --- sent=$sent landed=$landing target=$target '
          'heldMs=${_Probe.held == null ? -1 : _Probe.held!.inMilliseconds} '
          'longPressB=${_Probe.longPressB} tapB=${_Probe.tapB} '
          'displayId=${_Probe.displayId} displayDpr=${_Probe.displayDpr}');
    });
  }, timeout: const Timeout(Duration(minutes: 4)));

  test('负控：点在**空白**上 ⇒ 谁都没被点（否则上面两条是空的）', () async {
    await check('负控 ⇒ 空白处不触发任何目标', () async {
      final CapabilityTools tools = CapabilityTools();
      expect(await waitForAccessibility(60), isTrue, reason: '无障碍服务没开');
      expect(await waitForLayout(), isTrue, reason: '探针布局没落地');
      expect(await calibrate(), isTrue, reason: '校准失败 ⇒ ⇒ 坐标系没法定');

      final Offset blank = blankPoint();
      expect(inAnyTarget(blank), isFalse, reason: '负控点选到了目标里 ⇒ ⇒ 换个点');
      final Offset sent = screenPoint(blank)!;

      final int tapABefore = _Probe.tapA;
      final int tapBBefore = _Probe.tapB;
      final int downBefore = _Probe.downCount;

      await tools.tap(<String, dynamic>{'x': sent.dx, 'y': sent.dy});

      final bool landed = await waitForLanding(downBefore);
      expect(
        landed,
        isTrue,
        reason: '空白处的那一下**连指针事件都没有** ⇒ ⇒ '
            '那一带被系统吃掉了（状态栏 / 导航栏？）⇒ ⇒ 这个点不能用',
      );
      expect(
        _Probe.tapA,
        tapABefore,
        reason: '点在空白上却**触发了目标 A** ⇒ ⇒ 目标区域判定有问题',
      );
      expect(
        _Probe.tapB,
        tapBBefore,
        reason: '点在空白上却**触发了目标 B** ⇒ ⇒ 目标区域判定有问题',
      );
      final Offset landing = _Probe.down!;
      expect(
        (landing - blank).distance,
        lessThan(25.0),
        reason: '空白那一下的落点 $landing 离 $blank 太远',
      );
      // ignore: avoid_print
      print('--- PROBE NEGATIVE --- sent=$sent landed=$landing blank=$blank '
          'tapA=${_Probe.tapA} tapB=${_Probe.tapB} '
          'displayId=${_Probe.displayId} displayDpr=${_Probe.displayDpr}');
    });
  }, timeout: const Timeout(Duration(minutes: 4)));

  test('自家窗口 ⇒ 语义树可读 ＋ 原点两条路**一致**（原生量 vs 探针校准）', () async {
    await check('自家窗口语义树 ＋ 原点一致性', () async {
      // ⚠️ 语义树**必须开着** —— 不开 ⇒ ⇒ 自家界面模型根本读不到。
      expect(
        _semanticsHandle,
        isNotNull,
        reason: '语义树没开 ⇒ ⇒ 自家 app 的界面模型这一格是空的',
      );
      expect(await waitForAccessibility(60), isTrue, reason: '无障碍服务没开');
      expect(await waitForLayout(), isTrue, reason: '探针布局没落地');
      expect(await calibrate(), isTrue, reason: '校准失败 ⇒ ⇒ 坐标系没法定');

      // ⚠️ **原生量到的窗口原点**（**物理**像素）—— 这是**第一条路**。
      final Map<String, double>? native =
          await AccessibilityController.viewGeometry();
      expect(
        native,
        isNotNull,
        reason: '原生量不到窗口原点 ⇒ ⇒ 这一轮不成立 ⇒ ⇒ '
            '自家窗口的坐标没法换算成整屏口径',
      );

      // ⚠️ **探针校准量到的原点**（**物理**像素）—— 这是**第二条路**。
      final Offset calibrated = _Probe.originPhysical;

      // ⚠⚠⚠ **当裁判**：两条路量到的原点必须一致。
      // ⇒ ⇒ 差得远 ⇒ ⇒ 说明「语义树坐标 ↔ 整屏坐标」的换算**不可信**
      // ⇒ ⇒ ⇒ 自家窗口的坐标就**不许**拿去点（宁可不点，也不要点歪）。
      final double dx = (native!['originX']! - calibrated.dx).abs();
      final double dy = (native['originY']! - calibrated.dy).abs();
      expect(
        dx,
        lessThan(5.0),
        reason: '原生量到的原点 X=${native['originX']} 与探针校准的 '
            '${calibrated.dx} 差了 $dx 像素 ⇒ ⇒ 两条路对不上',
      );
      expect(
        dy,
        lessThan(5.0),
        reason: '原生量到的原点 Y=${native['originY']} 与探针校准的 '
            '${calibrated.dy} 差了 $dy 像素 ⇒ ⇒ 两条路对不上',
      );

      // ⚠️ **语义树本身**（自家 app 的界面模型）——
      // ⇒ ⇒ 带原点 ⇒ ⇒ 坐标必须是**整屏口径**（字段名与原生那棵一样）。
      final FlutterSemanticsSnapshot? own = FlutterSemanticsTree.read(
        viewOrigin: ViewOrigin(native['originX']!, native['originY']!),
      );
      expect(own, isNotNull, reason: '自家 app 的语义树读不到 ⇒ ⇒ 这一格没补上');
      expect(own!.coordinateSpace, kCoordinateSpaceScreen);
      expect(own.text, contains('bounds:'), reason: '树里没有整屏口径的 bounds');
      expect(
        own.text,
        isNot(contains('viewBounds:')),
        reason: '两套坐标混在一起了 ⇒ ⇒ 模型会拿错口径去点',
      );

      // ⚠⚠⚠ **最强的那条**：树里报出来的 bounds 必须等于
      // ⇒ ⇒ 「量出来的矩形 × dpr ＋ 原生原点」⇒ ⇒ 差一截就红。
      final Rect? bounds = boundsOfLabel(own.text, '目标甲');
      expect(bounds, isNotNull, reason: '树里没有「目标甲」的 bounds');
      final double dpr = _devicePixelRatio();
      final Rect expected = Rect.fromLTRB(
        _Probe.rectA.left * dpr + native['originX']!,
        _Probe.rectA.top * dpr + native['originY']!,
        _Probe.rectA.right * dpr + native['originX']!,
        _Probe.rectA.bottom * dpr + native['originY']!,
      );
      expect(
        (bounds!.left - expected.left).abs(),
        lessThanOrEqualTo(3.0),
        reason: '树里的 bounds $bounds 与量出来的 $expected 对不上 ⇒ ⇒ '
            '「语义树坐标 ＋ 原点 ≠ 整屏坐标」',
      );
      expect(
        (bounds.top - expected.top).abs(),
        lessThanOrEqualTo(3.0),
        reason: '树里的 bounds $bounds 与量出来的 $expected 对不上',
      );
      expect(
        (bounds.right - expected.right).abs(),
        lessThanOrEqualTo(3.0),
        reason: '树里的 bounds $bounds 与量出来的 $expected 对不上',
      );
      expect(
        (bounds.bottom - expected.bottom).abs(),
        lessThanOrEqualTo(3.0),
        reason: '树里的 bounds $bounds 与量出来的 $expected 对不上',
      );

      // ⚠️ **工具层**（走生产那条回落路）—— 口径必须**跟着快照**走。
      final Map<String, dynamic> toolsResult =
          (await CapabilityTools().readScreen(<String, dynamic>{}))
              as Map<String, dynamic>;
      // ignore: avoid_print
      print('--- PROBE TOOLS LAYER --- source=${toolsResult['source']} '
          'coordinateSpace=${toolsResult['coordinateSpace']}');
      if (toolsResult['source'] == kScreenSourceFlutterSemantics) {
        expect(
          toolsResult['coordinateSpace'],
          kCoordinateSpaceScreen,
          reason: '拿到原点 ⇒ ⇒ 回落结果的坐标口径必须是**整屏**',
        );
      }

      // ignore: avoid_print
      print('--- PROBE OWN TREE --- native=$native calibrated=$calibrated '
          'bounds=$bounds expected=$expected dpr=$dpr');
    });
  }, timeout: const Timeout(Duration(minutes: 4)));

  test('**自家 app 在前台** ⇒ 走回落那条路 ⇒ 「这是谁的屏」这一格**键在、值＝自家包名**', () async {
    await check('回落分支 ⇒ foregroundPackage 键在且值＝自家包名', () async {
      expect(await waitForAccessibility(60), isTrue, reason: '无障碍服务没开');

      final Map<String, dynamic> r =
          (await CapabilityTools().readScreen(<String, dynamic>{}))
              as Map<String, dynamic>;
      // ignore: avoid_print
      print('--- PROBE FALLBACK PKG --- source=${r['source']} '
          'pkg=${r['foregroundPackage']} '
          'hasKey=${r.containsKey('foregroundPackage')}');

      // ⚠⚠️ **键不许缺** —— 两条分支的**形状**必须一样 ⇒ ⇒ 模型不许靠
      // ⇒ ⇒ 「有没有这个键」去猜这是哪棵树 ⇒ ⇒ 而这一格**真机上是头一次验**。
      expect(
        r.containsKey('foregroundPackage'),
        isTrue,
        reason: '回落分支**没有** foregroundPackage 键 ⇒ ⇒ 两条分支形状不一样 '
            '⇒ ⇒ 模型分不清「值是空」与「这一格没实现」',
      );

      if (r['source'] == kScreenSourceFlutterSemantics) {
        // ⇒ ⇒ 回落的前提**就是**自家 app 在前台 ⇒ ⇒ 答案**已知**（不必问原生）
        expect(
          r['foregroundPackage'],
          kOwnAppPackage,
          reason: '回落分支答的必须是**自家包名**（前提就是自家 app 在前台）',
        );
      }
    });
  }, timeout: const Timeout(Duration(minutes: 3)));
  test('【结论】把这次的真机验证结果**如实**报给驱动脚本', () async {
    // ⚠️⚠️ **这条是给驱动脚本看的** —— 它**看不见**上面那些普通 test()
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
