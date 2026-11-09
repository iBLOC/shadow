import '../accessibility_controller.dart';

/// 读屏被**截断**时的显式标记 —— 与 Kotlin 侧
/// `PrefrontalAccessibilityService.TRUNCATION_MARKER` **逐字对齐**。
///
/// ⚠️ 两边各写一份字面量 ⇒ ⇒ 所以有道闸钉着
/// （`scripts/check-mobile-a11y-contract.mjs`）⇒ ⇒ 谁改了一边没改另一边
/// ⇒ ⇒ 闸红 ⇒ ⇒ 不会静悄悄漂移。
const String kScreenTruncationMarker = '[truncated]';

/// 自家 app 的包名 —— 「这是谁的屏」那一格的答案（回落分支）。
///
/// ⚠️ 为什么这里可以**写死**：回落的前提**就是**「自家 app 在前台」
/// ⇒ ⇒ 答案不是「读到的」，是**推出来的** ⇒ ⇒ 写死的是**事实**，
/// 不是「某个环境下的值」。
///
/// ⚠️ 而它与 Gradle 的 applicationId 是**同一件事的两份**
/// ⇒ ⇒ 闸在比对（`scripts/check-mobile-a11y-contract.mjs`）⇒ ⇒ 漂了就红。
///
/// ⚠️⚠️ **为什么它住在这一层**（2026-11-11）：
/// ⇒ ⇒ 两棵树的**头**都要写自己的属主（原生那棵写真包的包名，
/// ⇒ ⇒ Flutter 那棵写自家包名）⇒ ⇒ ⇒ 而两棵树的源码**互相不认识**
/// ⇒ ⇒ ⇒ 常量必须住在**它们共同的下层** ⇒ ⇒ ⇒ **否则就是环**。
const String kOwnAppPackage = 'com.ibloc.shadow';

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
  ///
  /// ⚠️ **这是「开关」**，不是「服务此刻连上了没有」⇒ ⇒ 那件事是
  /// [isServiceConnected] ⇒ ⇒ 两个问题，两个判据。
  Future<bool> isEnabled();

  /// 无障碍服务**此刻连上了没有**（瞬时活性）。
  ///
  /// ⚠️ 与 [isEnabled] **不是同一件事** ⇒ ⇒ 别拿它当「开关」用：
  /// 系统的无障碍服务**会被系统自己重启**（真机实测约 1 秒）
  /// ⇒ ⇒ 那 1 秒里这里会短暂为 false，而 [isEnabled] 仍然是 true。
  ///
  /// ⚠️ 默认实现**跟随** [isEnabled] ⇒ ⇒ 单测里的假实现**不用改**
  /// ⇒ ⇒ 而真机那一头由 [PlatformAccessibilityOps] 覆盖成真实连接态。
  Future<bool> isServiceConnected() async => isEnabled();

  /// 「**现在能不能动手**」—— 等得起抖的判据。
  ///
  /// ⚠️ 与 [isEnabled] **不是同一件事** ⇒ ⇒ [isEnabled] 答「用户开没开」，
  /// 这个答「此刻能不能派发」⇒ ⇒ 真机实测：系统重启无障碍服务的那 1 秒里
  /// 连「已启用列表」都是空的 ⇒ ⇒ 一读就下结论会得出**假原因**。
  ///
  /// ⚠️ 默认实现**跟随** [isServiceConnected] ⇒ ⇒ 单测里的假实现**不用改**。
  Future<bool> isReady() async => isServiceConnected();

  /// 读当前屏幕（可访问性树）；null ＝ 取不到。
  Future<String?> readScreen();

  /// **一次采样** —— 树与「这是谁的屏」**同一个窗口**。
  ///
  /// ⚠️⚠️ **为什么它是「一次」而不是分两次**（2026-11-11 真机实测）：
  /// ⇒ ⇒ 分两次问 ⇒ ⇒ 两次 `rootInActiveWindow` 可能落在**不同**窗口
  /// ⇒ ⇒ ⇒ 实测逐字：`pkg=com.android.settings rawPkg=com.miui.home`
  /// ⇒ ⇒ ⇒ 同一时刻，工具层说「设置」、原生说「桌面」
  /// ⇒ ⇒ ⇒ ⇒ ⇒ **张冠李戴** ⇒ ⇒ 模型拿到**错的归属**。
  ///
  /// ⚠️ **默认实现回 null** ⇒ ⇒ 单测里的假实现**不用改**
  /// ⇒ ⇒ 而「拿不到 ⇒ 明确失败，不给半截答案」这条纪律**默认就成立**。
  Future<Map<String, dynamic>?> readScreenSnapshot() async => null;

  /// 本 app 自己的窗口在**屏幕**上的原点（物理像素）；null ＝ 拿不到。
  ///
  /// ⚠️ **默认实现回 null** ⇒ ⇒ 单测里的假实现**不用改**
  /// ⇒ ⇒ 而「拿不到原点 ⇒ 不换算」这条纪律**默认就成立**。
  Future<Map<String, double>?> viewGeometry() async => null;

  /// **前台是谁**（当前焦点窗口所属的 app 包名）；null ＝ 读不到。
  ///
  /// ⚠️ 为什么它属于「读屏结果」的一部分：树里只有 `text` / `desc` / `bounds`
  /// ⇒ ⇒ 模型看到「日历」二字可能以为那是自家界面
  /// ⇒ ⇒ 而「这棵树是谁的」树里**看不出来** ⇒ ⇒ 必须单独给一个字段。
  ///
  /// ⚠️ **默认实现回 null** ⇒ ⇒ 单测里的假实现**不用改**
  /// ⇒ ⇒ 而「读不到」这个形状**默认就成立**（null ≠ 空串）。
  Future<String?> foregroundPackage() async => null;

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
  Future<bool> isServiceConnected() =>
      AccessibilityController.isServiceConnected;

  @override
  Future<bool> isReady() => AccessibilityController.isReady;

  @override
  // ⚠️ `readScreen` 在控制器那边是**静态方法** ⇒ ⇒ 要带括号调用
  // ⇒ ⇒ 直接返回 tear-off 会类型不匹配。
  Future<String?> readScreen() => AccessibilityController.readScreen();

  @override
  Future<Map<String, dynamic>?> readScreenSnapshot() =>
      AccessibilityController.readScreenSnapshot();

  @override
  Future<Map<String, double>?> viewGeometry() =>
      AccessibilityController.viewGeometry();

  @override
  Future<String?> foregroundPackage() =>
      AccessibilityController.foregroundPackage();

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
