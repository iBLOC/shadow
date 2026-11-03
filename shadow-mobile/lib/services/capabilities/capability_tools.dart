import '../accessibility_controller.dart';
import 'accessibility_ops.dart';
import 'capability.dart';
import 'device_data_channel.dart';

/// **设备能力执行器** —— 五个能力工具的**执行那一半**。
///
/// ## ⚠️ 为什么「工具定义」不在这个文件里
///
/// 跨端对齐闸 `scripts/check-client-tools.mjs` 靠**字面量 `ClientTool(`**
/// 抽取「发给模型看的那一份」（名字 / 描述 / 参数表）⇒ ⇒ 工具定义
/// **必须**写在 `services/client_tools/client_tool_registry.dart` 的
/// `buildMobileClientTools` 里 ⇒ ⇒ 这个文件只留**干活的那一半**：
/// 参数校验、取数、错误语义。
///
/// ⇒ ⇒ 两边各管一段 ⇒ ⇒ 闸看得见工具，也不会看见两份定义漂移。
///
/// ## 这五个工具与普通客户端工具的区别
///
/// 普通工具（`set_theme` 等）**没有** [ClientTool.capability] ⇒ ⇒
/// 它们不在能力授权的范围内 ⇒ ⇒ 授权策略对它们**没有影响**。
///
/// 而这里的每一个工具都**带**一个 capability ⇒ ⇒ 它们受**三层**授权约束：
/// 1. **应用层档位**（每次询问 / 完全访问）—— 见 `capability_policy_provider`；
/// 2. **系统层权限**（Android 的 READ_CALENDAR 等）—— 用户在系统弹窗里批；
/// 3. **执行时的那道闸**（每次询问 ⇒ 出一张 Allow / Deny 卡片）。
///
/// ⇒ ⇒ 三层是**串联**的：任何一层不同意，能力就不生效。
///
/// ## ⚠️ 为什么这些工具**不返回** `report` 字段
///
/// `pickReportPayload` 的规则是「结果里有 `report` ⇒ **只**回 `report`」
/// ⇒ ⇒ 那些字段（`events` / `contacts` / `messages`）就**到不了模型**。
///
/// 而「读日历 / 读联系人」这件事的**意义**就是让模型看到内容 ⇒ ⇒
/// 所以这些工具**不设** `report` ⇒ ⇒ 整份结果原样回传给模型。
///
/// （用户授权读的就是这些内容 ⇒ ⇒ 这一层已经由「用户点头」把过关了。）
class CapabilityTools {
  /// 设备数据通道。
  ///
  /// ⚠️ 字段是**公开**的（不是 `_channel`）—— 因为命名参数要能
  /// 从外面传进来 ⇒ ⇒ `this._channel` 会让参数变成私有的，外部根本传不了。
  final DeviceDataChannel channel;

  /// 无障碍那一层（读屏 / 点击 / 滑动）。
  ///
  /// ⚠️ **可注入**是为了单测能塞一个假的进来 ⇒ ⇒ 单测不必真的连原生层
  /// ⇒ ⇒ 「无障碍已开启 ⇒ 真的会去点」那条正路径才钉得住。
  ///
  /// ⚠️ **可空**是为了保住 `const` 构造（生产路径不需要注入 ⇒ ⇒ 用默认的
  /// [AccessibilityOps.platform]）⇒ ⇒ 见 [_a11y]。
  final AccessibilityOps? accessibility;

  const CapabilityTools({
    this.channel = const DeviceDataChannel(),
    this.accessibility,
  });

  /// 无障碍那一层（没注入就用真机实现）。
  AccessibilityOps get _a11y =>
      accessibility ?? const PlatformAccessibilityOps();

  /// 读日历事件（时间窗内）。
  ///
  /// ⚠️ 参数认不出来 ⇒ 用**默认值**（现在起 / 往后七天 / 50 条）⇒ ⇒
  /// 模型不会因为格式怪就被卡住。
  Future<Object?> readCalendar(Map<String, dynamic> args) async {
    final now = DateTime.now();
    final from = _parseTime(args['from']) ?? now;
    final to = _parseTime(args['to']) ?? from.add(const Duration(days: 7));
    final limit = _parseLimit(args['limit'], 50);
    await _ensureOsPermission(Capability.calendarRead, channel);
    final events = await channel.readCalendar(
      startMs: from.millisecondsSinceEpoch,
      endMs: to.millisecondsSinceEpoch,
      limit: limit,
    );
    return <String, dynamic>{'events': events, 'count': events.length};
  }

  /// 写日历事件（新建；给了 `event_id` 就是改那一条）。
  Future<Object?> writeCalendar(Map<String, dynamic> args) async {
    final title = (args['title'] as String?)?.trim();
    if (title == null || title.isEmpty) {
      throw const FormatException(
        'calendar_write_event expects a non-empty "title"',
      );
    }
    final start = _parseTime(args['start']);
    if (start == null) {
      throw const FormatException(
        'calendar_write_event expects "start" as an ISO-8601 date-time',
      );
    }
    final end =
        _parseTime(args['end']) ?? start.add(const Duration(hours: 1));
    await _ensureOsPermission(Capability.calendarWrite, channel);
    final saved = await channel.writeCalendar(
      title: title,
      startMs: start.millisecondsSinceEpoch,
      endMs: end.millisecondsSinceEpoch,
      description: args['description'] as String?,
      location: args['location'] as String?,
      eventId: args['event_id'] as String?,
    );
    return <String, dynamic>{'event': saved};
  }

  /// 读联系人（可带一个名字过滤词）。
  Future<Object?> readContacts(Map<String, dynamic> args) async {
    final query = (args['query'] as String?)?.trim();
    final limit = _parseLimit(args['limit'], 50);
    await _ensureOsPermission(Capability.contacts, channel);
    final contacts = await channel.readContacts(query: query, limit: limit);
    return <String, dynamic>{
      'contacts': contacts,
      'count': contacts.length,
    };
  }

  /// 读最近的短信。
  Future<Object?> readSms(Map<String, dynamic> args) async {
    final limit = _parseLimit(args['limit'], 30);
    await _ensureOsPermission(Capability.sms, channel);
    final messages = await channel.readSms(limit: limit);
    return <String, dynamic>{
      'messages': messages,
      'count': messages.length,
    };
  }

  /// 读相册（**只读元数据**）。
  Future<Object?> readPhotos(Map<String, dynamic> args) async {
    final limit = _parseLimit(args['limit'], 30);
    await _ensureOsPermission(Capability.photos, channel);
    final photos = await channel.readPhotos(limit: limit);
    return <String, dynamic>{
      'photos': photos,
      'count': photos.length,
    };
  }

  // ── 手机操作（mobile use）─────────────────────────────────
  //
  // ⚠️ 这一族与上面那五个**不是一类东西**：
  // 上面是「读这台手机上的**数据**」，这里是「**操作这台手机**」——
  // 能点「确认支付」、能打字发消息 ⇒ ⇒ 风险面高一个量级
  // ⇒ ⇒ 它有自己的能力与授权档（`Capability.mobileUse`）。
  //
  // ⚠️ 底座是 Android 的**无障碍服务**（AccessibilityService）
  // ⇒ ⇒ 走的是**另一条通道**（`com.ibloc.shadow/accessibility`），
  // 不是设备数据通道 ⇒ ⇒ 因为「无障碍服务」不是运行时权限，
  // 它是用户在**系统设置**里手动开的开关。

  /// 读当前屏幕（可访问性树）。
  ///
  /// ⚠️ 为什么用**树**而不是截图：树是文本 ⇒ ⇒ 模型直接读得懂、token 也省；
  /// 而截图（MediaProjection）要用户**每次**授权 ⇒ ⇒ 树是更省事的「看见」。
  Future<Object?> readScreen(Map<String, dynamic> args) async {
    await _ensureAccessibilityService();
    final text = await _a11y.readScreen();
    if (text == null) {
      throw StateError(
        'the accessibility service stopped responding — cannot read the screen',
      );
    }
    // ⚠️ **截断必须是显式的** —— Kotlin 侧预算用完时会在末尾加
    // `[truncated]` ⇒ ⇒ 模型据此知道「这一屏**没看全**」⇒ ⇒ 别对着
    // 缺失的信息做判断（那是「失败长得像成功」的一族）。
    final truncated = text.trimRight().endsWith(kScreenTruncationMarker);
    return <String, dynamic>{
      'screen': text,
      'length': text.length,
      'truncated': truncated,
    };
  }

  /// 点一下屏幕（坐标）。
  Future<Object?> tap(Map<String, dynamic> args) async {
    final x = _parseCoordinate(args['x']);
    final y = _parseCoordinate(args['y']);
    if (x == null || y == null) {
      throw const FormatException(
        'mobile_tap expects "x" and "y" as numbers (screen pixels)',
      );
    }
    await _ensureAccessibilityService();
    final ok = await _a11y.tap(x, y);
    if (!ok) {
      throw StateError('the tap gesture was not dispatched');
    }
    return <String, dynamic>{'tapped': true, 'x': x, 'y': y};
  }

  /// 长按屏幕（坐标）。
  Future<Object?> longPress(Map<String, dynamic> args) async {
    final x = _parseCoordinate(args['x']);
    final y = _parseCoordinate(args['y']);
    if (x == null || y == null) {
      throw const FormatException(
        'mobile_long_press expects "x" and "y" as numbers (screen pixels)',
      );
    }
    await _ensureAccessibilityService();
    final ok = await _a11y.longPress(x, y);
    if (!ok) {
      throw StateError('the long-press gesture was not dispatched');
    }
    return <String, dynamic>{'longPressed': true, 'x': x, 'y': y};
  }

  /// 滑动（从 (x1,y1) 到 (x2,y2)）。
  Future<Object?> swipe(Map<String, dynamic> args) async {
    final x1 = _parseCoordinate(args['x1']);
    final y1 = _parseCoordinate(args['y1']);
    final x2 = _parseCoordinate(args['x2']);
    final y2 = _parseCoordinate(args['y2']);
    if (x1 == null || y1 == null || x2 == null || y2 == null) {
      throw const FormatException(
        'mobile_swipe expects "x1", "y1", "x2" and "y2" as numbers',
      );
    }
    final durationMs = _parseLimit(args['duration_ms'], 300);
    await _ensureAccessibilityService();
    final ok = await _a11y.swipe(x1, y1, x2, y2, durationMs);
    if (!ok) {
      throw StateError('the swipe gesture was not dispatched');
    }
    return <String, dynamic>{
      'swiped': true,
      'durationMs': durationMs,
    };
  }

  /// 按**屏幕上的文字**点击（比坐标稳：不受分辨率与布局变化影响）。
  Future<Object?> findAndClick(Map<String, dynamic> args) async {
    final text = (args['text'] as String?)?.trim();
    if (text == null || text.isEmpty) {
      throw const FormatException(
        'mobile_find_and_click expects a non-empty "text"',
      );
    }
    await _ensureAccessibilityService();
    final ok = await _a11y.findAndClickByText(text);
    if (!ok) {
      // ⚠️ 没找到 ⇒ **明确失败**，别回一句「点了」——
      // 那会让模型以为界面变了，然后开始瞎点。
      throw StateError('no clickable element with that text was found: $text');
    }
    return <String, dynamic>{'clicked': true, 'text': text};
  }

  /// 全局系统动作（返回 / 桌面 / 最近任务 / 通知栏 / 快捷设置 / 电源菜单）。
  Future<Object?> globalAction(Map<String, dynamic> args) async {
    final raw = (args['action'] as String?)?.trim() ?? '';
    final action = _globalActionFromWire(raw);
    if (action == null) {
      throw FormatException(
        'mobile_global_action expects "action" to be one of: back, home, '
        'recents, notifications, quick_settings, power_dialog',
      );
    }
    await _ensureAccessibilityService();
    final ok = await _a11y.globalAction(action);
    if (!ok) {
      throw StateError('the global action was not dispatched: $raw');
    }
    return <String, dynamic>{'action': raw};
  }

  /// 全局动作的 wire 名 → 枚举。
  ///
  /// ⚠️ **认不出来返回 null** ⇒ ⇒ 调用方**明确失败**
  /// ⇒ ⇒ 绝不「挑一个默认值」（那会让模型要「最近任务」却收到一个「返回」）。
  GlobalAction? _globalActionFromWire(String raw) {
    for (final action in GlobalAction.values) {
      if (action.wire == raw) return action;
    }
    return null;
  }

  /// 执行前确认**无障碍服务**已开启。
  ///
  /// ⚠️ 这一层与「应用层档位」是**两件事**：
  /// - 应用层（每次询问 / 完全访问 / 彻底关闭）⇒ 用户对**这个助手**的授权；
  /// - 系统层（无障碍服务）⇒ Android 对**这个 App**的开关。
  ///
  /// ⚠️ 与运行时权限**不同**：无障碍服务**不能**由程序弹窗申请
  /// ⇒ ⇒ 只能用户在系统设置里手动开 ⇒ ⇒ 这里**明确失败**并说清去哪儿开
  /// ⇒ ⇒ 设置页那一行给一键入口。
  Future<void> _ensureAccessibilityService() async {
    final enabled = await _a11y.isEnabled();
    if (enabled) return;
    throw StateError(
      'the accessibility service is not enabled — the user has to turn it on '
      'in the system settings first',
    );
  }
}

/// 执行前确认**系统层**权限。
///
/// ⚠️ 这一层与「应用层档位」是**两件事**：
/// - 应用层（每次询问 / 完全访问）⇒ 用户对**这个助手**的授权；
/// - 系统层（READ_CALENDAR 等）⇒ Android 对**这个 App**的授权。
///
/// ⇒ ⇒ 两层都要过 ⇒ ⇒ 这里补的是**系统层**。
///
/// ⚠️ 没权限 ⇒ **就地申请**（用户刚点头，准许他批）⇒ ⇒ 还不批 ⇒
/// **明确失败**（抛异常 ⇒ 端脑知道这条路走不通）⇒ ⇒
/// **绝不**静悄悄地返回一个空列表（那是「假装成功」）。
Future<void> _ensureOsPermission(
  Capability capability,
  DeviceDataChannel channel,
) async {
  final granted = await channel.hasOsPermission(capability.wire);
  if (granted) return;
  final requested = await channel.requestPermission(capability.wire);
  if (!requested) {
    throw StateError(
      'the user has not granted the system permission for '
      '${capability.label} — cannot proceed',
    );
  }
}

/// 解析一个时间参数。
///
/// ⚠️ 认不出来 ⇒ 返回 null ⇒ ⇒ 调用方用**默认值** ⇒ ⇒
/// 「没给时间」与「给了一个看不懂的时间」走同一条路 ⇒ ⇒
/// 模型不会因为格式怪就被卡住。
DateTime? _parseTime(Object? raw) {
  if (raw is int) {
    return DateTime.fromMillisecondsSinceEpoch(raw);
  }
  if (raw is! String) return null;
  final text = raw.trim();
  if (text.isEmpty) return null;
  return DateTime.tryParse(text);
}

/// 解析一个**坐标**参数（模型偶尔会传字符串）。
///
/// ⚠️ 认不出来 ⇒ 返回 null ⇒ ⇒ 调用方**明确失败**
/// ⇒ ⇒ 绝不「猜一个坐标」（猜错了就是点在别人身上）。
double? _parseCoordinate(Object? raw) {
  if (raw is num) return raw.toDouble();
  if (raw is String) {
    final parsed = double.tryParse(raw.trim());
    if (parsed != null) return parsed;
  }
  return null;
}

/// 解析一个数量参数。
///
/// ⚠️ 上限 200 —— 防止模型一次要一万条 ⇒ ⇒ 把整个通讯录灌进上下文。
int _parseLimit(Object? raw, int fallback) {
  var limit = fallback;
  if (raw is int) {
    limit = raw;
  } else if (raw is String) {
    limit = int.tryParse(raw.trim()) ?? fallback;
  }
  if (limit < 1) return fallback;
  if (limit > 200) return 200;
  return limit;
}