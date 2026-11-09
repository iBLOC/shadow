import '../accessibility_controller.dart';

/// 读屏被**截断**时的显式标记 —— 与 Kotlin 侧
/// `PrefrontalAccessibilityService.TRUNCATION_MARKER` **逐字对齐**。
///
/// ⚠️ 两边各写一份字面量 ⇒ ⇒ 所以有道闸钉着
/// （`scripts/check-mobile-a11y-contract.mjs`）⇒ ⇒ 谁改了一边没改另一边
/// ⇒ ⇒ 闸红 ⇒ ⇒ 不会静悄悄漂移。
const String kScreenTruncationMarker = '[truncated]';

/// **无障碍那一层** —— 工具层只认它，不认实现。
///
/// ⚠️ **为什么要这一层**：工具层若直接调静态的 [AccessibilityController]，
/// 单测就只能拿到「通道不在 ⇒ 失败」⇒ ⇒ **测不到**「无障碍已开启时
/// 真的会去点」那条正路径 ⇒ ⇒ 等于把最要紧的那一半钉不住。
/// ⇒ ⇒ 这里抽一层 ⇒ ⇒ 生产走真机、单测塞假的。
///
/// ⚠️ 它和 [DeviceDataChannel] 是**两件事**：
/// - 设备数据通道 ⇒ 读日历 / 联系人 / 短信 / 相册（**数据**）；
/// - 无障碍 ⇒ 读屏 / 点击 / 滑动（**操作这台手机**）。
abstract class AccessibilityOps {
  const AccessibilityOps();

  /// 无障碍服务是否已开启（系统设置里的那个开关）。
  Future<bool> isEnabled();

  /// 读当前屏幕（可访问性树）；null ＝ 取不到。
  Future<String?> readScreen();

  /// 本 app 自己的窗口在**屏幕**上的原点（物理像素）；null ＝ 拿不到。
  ///
  /// ⚠️ **默认实现回 null** ⇒ ⇒ 单测里的假实现**不用改**
  /// ⇒ ⇒ 而「拿不到原点 ⇒ 不换算」这条纪律**默认就成立**。
  Future<Map<String, double>?> viewGeometry() async => null;

  /// 点一下屏幕。
  Future<bool> tap(double x, double y);

  /// 长按屏幕。
  Future<bool> longPress(double x, double y);

  /// 从 (x1,y1) 滑到 (x2,y2)。
  Future<bool> swipe(
    double x1,
    double y1,
    double x2,
    double y2,
    int durationMs,
  );

  /// 按屏幕上的文字点击。
  Future<bool> findAndClickByText(String text);

  /// 全局系统动作（返回 / 桌面 / …）。
  Future<bool> globalAction(GlobalAction action);
}

/// 生产实现 —— 委托给静态的 [AccessibilityController]。
///
/// ⚠️ 为什么**委托**而不是把逻辑搬过来：那一层已经在真机上跑着
/// ⇒ ⇒ 搬一遍就是两份拷贝 ⇒ ⇒ 迟早漂移。
class PlatformAccessibilityOps extends AccessibilityOps {
  const PlatformAccessibilityOps();

  @override
  Future<bool> isEnabled() => AccessibilityController.isEnabled;

  @override
  // ⚠️ `readScreen` 在控制器那边是**静态方法** ⇒ ⇒ 要带括号调用
  // ⇒ ⇒ 直接返回 tear-off 会类型不匹配。
  Future<String?> readScreen() => AccessibilityController.readScreen();

  @override
  Future<Map<String, double>?> viewGeometry() =>
      AccessibilityController.viewGeometry();

  @override
  Future<bool> tap(double x, double y) => AccessibilityController.tap(x, y);

  @override
  Future<bool> longPress(double x, double y) =>
      AccessibilityController.longPress(x, y);

  @override
  Future<bool> swipe(
    double x1,
    double y1,
    double x2,
    double y2,
    int durationMs,
  ) => AccessibilityController.swipe(
    x1: x1,
    y1: y1,
    x2: x2,
    y2: y2,
    durationMs: durationMs,
  );

  @override
  Future<bool> findAndClickByText(String text) =>
      AccessibilityController.findAndClickByText(text);

  @override
  Future<bool> globalAction(GlobalAction action) =>
      AccessibilityController.globalAction(action);
}
