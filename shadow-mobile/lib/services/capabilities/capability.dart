import 'package:flutter/foundation.dart';

/// **设备能力** —— 这台手机上「可以被模型驱动」的一类东西。
///
/// ## 为什么按能力分，而不是按工具分
///
/// 用户在设置里配的是「日历」「联系人」这种**能力**，不是一个具体的
/// 工具名 ⇒ ⇒ 同一个能力下的读 / 写工具共享同一档授权 ⇒ ⇒ 授权语义
/// 对用户是稳定的（「我能读日历」这一件事），而不是随工具增减而漂移。
///
/// ## 为什么日历拆成读 / 写两档
///
/// 读与写的**风险面根本不同**：
/// - 读 ⇒ 事件标题 / 地点 / 参与人会**流进模型上下文** ⇒ ⇒ 可能随
///   下一轮上送给云端模型 ⇒ ⇒ 这是**外泄面**；
/// - 写 ⇒ 改的是用户**真实日历里的东西** ⇒ ⇒ 这是**副作用面**。
///
/// ⇒ ⇒ 合成一档就没法表达「读可以放开、写必须问」⇒ ⇒ 拆开。
enum Capability {
  /// 读日历事件（时间窗内）。
  calendarRead('calendar_read', '读取日历'),

  /// 写日历事件（新建 / 修改）。
  calendarWrite('calendar_write', '写入日历'),

  /// 读通讯录。
  contacts('contacts', '读取联系人'),

  /// 读短信。
  sms('sms', '读取短信'),

  /// 读相册（**只读元数据**，不取图片内容）。
  photos('photos', '读取相册'),

  /// 读设备通知（**通知栏里别人发的通知** —— 感知模式的移动端数据源）。
  ///
  /// ⚠️ 通知使用权是**服务开关**（NotificationListenerService），不是运行时权限
  /// ⇒ ⇒ 没有系统弹窗可弹 ⇒ ⇒ 一键入口直接开系统设置页（与 mobileUse 同一族）。
  ///
  /// ⚠️ iOS **没有**对等 API（无公开的 NotificationListenerService 对应物）
  /// ⇒ ⇒ 这一档在 iOS 上不存在（与短信同族：是平台事实，不是「暂时没实现」）。
  notificationsRead('notifications_read', '读取通知'),

  /// **手机操作** —— 让模型驱动这台手机本身（读屏 / 点击 / 滑动 / 输入）。
  ///
  /// ⚠️ 这是移动端对标桌面端 **computer-use** 的那一条腿
  /// ⇒ ⇒ 「日历读 / 日历写 / 联系人 / 短信 / 相册」是**读这台手机的数据**，
  /// 而它是**操作这台手机**（能点「确认支付」）⇒ ⇒ 风险面完全不同
  /// ⇒ ⇒ 必须是**独立一档**，不能混进「读取相册」那一档里。
  mobileUse('mobile_use', '手机操作'),

  ;

  const Capability(this.wire, this.label);

  /// 落盘用的稳定字符串。**不要**用枚举名 —— 重命名枚举会
  /// 让用户已存的偏好全部读不回来。
  final String wire;

  /// 中文标签（**仅供调试与兜底**）。
  ///
  /// ⚠️ 界面上的名字走 l10n（`capabilityLabel`），这里这份是
  /// 「万一漏了翻译时至少不是英文」的最后一道兜底。
  final String label;

  /// 这个能力在 **iOS** 上有没有对应的系统 API。
  ///
  /// ⚠️ iOS **没有公开的短信读取 API** —— Messages 框架只对自家 App 开放，
  /// 别的 App 读不到用户的收件箱 ⇒ ⇒ 短信这个能力在 iOS 上**根本不存在**
  /// ⇒ ⇒ 别让用户去配一个永远不会被触发的档（那只是噪声）。
  ///
  /// ⚠️ **手机操作**在 iOS 上同样**不存在** —— 等价于 Android 无障碍服务
  /// （读可访问性树 + 派发手势）的那套 API 在 iOS 上**没有公开对应物**
  /// （XCUITest 只在测试期可用）⇒ ⇒ 这一档在 iOS 上没有意义。
  ///
  /// ⚠️ 这**不是**「iOS 上暂时没实现」⇒ ⇒ 是**平台就没有这个能力**
  /// ⇒ ⇒ 与「实现了但用户关掉了」在语义上完全不同（后者是 [AuthorizationMode.disabled]）。
  bool get availableOnIOS =>
      this != Capability.sms &&
      this != Capability.mobileUse &&
      this != Capability.notificationsRead;

  /// 从落盘的字符串还原。**认不出来的返回 null**。
  ///
  /// ⚠️ **为什么是 null，而不是「挑一个默认值」**：
  /// 落盘的是「能力名 → 档位」⇒ ⇒ 一个认不出来的能力名如果被映射到
  /// 某个**真实**能力上（比如 calendarRead），那条配置就会凭空给
  /// 「读日历」开一道门 ⇒ ⇒ **坏配置反而放开了授权** ⇒ ⇒ 与
  /// fail-closed **正好相反**。
  ///
  /// ⇒ ⇒ 认不出来 ⇒ 调用方**整条丢掉** ⇒ ⇒ 那个能力保持默认的
  /// 「每次询问」⇒ ⇒ 宁可多问一次，也不要因为解析失败而**静悄悄地放开**。
  static Capability? fromWire(String? wire) {
    for (final c in Capability.values) {
      if (c.wire == wire) return c;
    }
    return null;
  }
}

/// 用户对某个能力的**授权档位**。
enum AuthorizationMode {
  /// 每次调用都要用户点头（聊天里出一张 Allow / Deny 卡片）。
  askEveryTime('ask'),

  /// 不再逐次询问，直接执行。
  ///
  /// ⚠️ **不等于**「绕过了系统的权限弹窗」—— 系统权限（Android 的
  /// READ_CALENDAR 等）**始终**要用户自己批 ⇒ ⇒ 这一档只免掉
  /// 「模型每叫一次就打断一次」这一层。
  fullAccess('full'),

  /// **彻底关闭** —— 这个能力对模型**不存在**。
  ///
  /// ⚠️ 与前两档的根本区别：前两档里这个能力**是存在的**，只是「用不用
  /// 得问用户」不同 ⇒ ⇒ 这一档是**能力本身不在了**：
  /// - 这个工具**不会**出现在发给模型的 `tools` 数组里 ⇒ ⇒ 模型
  ///   **不知道**它有这个东西 ⇒ ⇒ 不会浪费回合去调一个必然被拒的工具；
  /// - 万一模型仍然点名调了（它缓存过工具表 / 幻觉），客户端**明确拒绝**
  ///   并把拒绝回传端脑 ⇒ ⇒ **绝不**执行。
  ///
  /// ⚠️ 「每次询问」已经能防住「静悄悄地读走你的日历」—— 但防不住
  /// 「模型一次又一次地问，直到你手滑点了允许」。这一档是那道兜底。
  disabled('off'),

  ;

  const AuthorizationMode(this.wire);

  final String wire;

  static AuthorizationMode fromWire(String? wire) {
    for (final m in AuthorizationMode.values) {
      if (m.wire == wire) return m;
    }
    // ⚠️ 认不出来 ⇒ 退化成「每次询问」⇒ ⇒ **fail-closed**。
    return AuthorizationMode.askEveryTime;
  }
}

/// 能力授权的**持久化**格式（读写 `app_config.json`）。
///
/// ⚠️ 为什么存在 [AppConfigService] 旁边而不是数据库里：
/// 这些是**用户偏好**，不是业务数据 ⇒ ⇒ 跟主题色 / 明暗放一起。
class CapabilityPolicyStore {
  /// 从配置文件读出「能力 → 档位」的映射。
  ///
  /// 返回的 map 是**防御性副本**（调用方改它不影响仓库）。
  static Map<String, String> read(Map<String, dynamic> config) {
    final raw = config['capabilityModes'];
    if (raw is! Map) return const {};
    final out = <String, String>{};
    raw.forEach((key, value) {
      if (key is String && value is String) out[key] = value;
    });
    return out;
  }

  /// 把「能力 → 档位」的映射写进配置字典。
  ///
  /// ⚠️ 空 map **不写** ⇒ ⇒ 配置文件里不留空壳。
  static void write(Map<String, String> modes, Map<String, dynamic> config) {
    if (modes.isEmpty) {
      config.remove('capabilityModes');
      return;
    }
    config['capabilityModes'] = modes;
  }
}

/// 这个能力在**当前平台**上可不可用。
///
/// ⚠️ **为什么按平台判**：iOS 没有公开的短信读取 API ⇒ ⇒ 短信在 iOS 上
/// 不存在 ⇒ ⇒ 设置页要把它标成「不支持」并**禁用**那个下拉
/// ⇒ ⇒ 否则用户配了一个永远不会被触发的档，还以为是自己配错了。
///
/// ⚠️ 平台判定走 [defaultTargetPlatform]（而不是 `dart:io` 的 `Platform`）
/// ⇒ ⇒ 单测能用 `debugDefaultTargetPlatformOverride` 把它钉死
/// ⇒ ⇒ 不然「iOS 上短信不可用」这条**测不到**。
bool capabilitySupportedOn(
  Capability capability, {
  TargetPlatform? platform,
}) {
  final target = platform ?? defaultTargetPlatform;
  if (target != TargetPlatform.iOS) return true;
  return capability.availableOnIOS;
}

/// 能力 → **系统权限**的对应关系**不在这一侧**，在原生层
/// （`DeviceDataBridge`）。
///
/// ⚠️ 为什么不用 `permission_handler` 插件来做这件事：
/// 它在 Android 上的 `calendarFullAccess` 把 READ_CALENDAR 与 WRITE_CALENDAR
/// **捆在一起**（两个都必须在 manifest 里声明，少一个直接判 denied ——
/// 见插件的 `PermissionManager.java:414-419`）⇒ ⇒ 「我能读日历」
/// 就会**顺带**把「我能改日历」也拿到 ⇒ ⇒ 正好毁掉本项目要的
/// **按能力分档**（日历读 / 写是两个档）。
///
/// ⇒ ⇒ 权限串留在原生层（那里才知道各平台叫什么）⇒ ⇒ Dart 这一侧
/// 只认**能力名**（`calendar_read` / `calendar_write` / …）。
