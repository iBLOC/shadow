import '../accessibility_controller.dart';
import 'accessibility_ops.dart';
import 'capability.dart';
import 'device_data_channel.dart';
import 'flutter_semantics_tree.dart';

/// ⚠️ **自家 app 的包名**（`kOwnAppPackage`）住在 [accessibility_ops.dart] 里
/// ⇒ ⇒ 因为两棵树的**头**都要写自己的属主 ⇒ ⇒ ⇒ 而两棵树的源码**互相不认识**
/// ⇒ ⇒ ⇒ 常量必须住在**它们共同的下层** ⇒ ⇒ ⇒ **否则就是环**。
/// ⇒ ⇒ 本文件已经 import 了那一层 ⇒ ⇒ ⇒ 引用点**一行不用改**。

/// 读屏结果的**来源** —— 两棵树的坐标口径不一样 ⇒ ⇒ 必须标出来。
///
/// ⚠️ 为什么非标不可：原生那棵树是**别人的窗口**（坐标＝整屏物理像素），
/// 而自家 app 那棵是**本窗口**（坐标＝本窗口物理像素）
/// ⇒ ⇒ 模型若把后者当整屏坐标去点 ⇒ ⇒ 点歪 ⇒ ⇒ 看起来像「手势坏了」。
const String kScreenSourceAndroidA11y = 'android-a11y';

/// 自家 app 自己的界面模型（Flutter 语义树）。
const String kScreenSourceFlutterSemantics = 'flutter-semantics';

/// 坐标口径 —— 与上面的来源**配套**（整屏 vs 本窗口）。
const String kCoordinateSpaceScreen = 'screen';
const String kCoordinateSpaceView = 'view';

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

  /// 「自家 app 现在在前台吗」的判据 —— **可注入**。
  ///
  /// ⚠️ 为什么可注入：回落（读屏 / 按文字点击）**只在前台是自家 app**
  /// 时才允许 ⇒ ⇒ 而「前台是谁」在单测里没法造 ⇒ ⇒ 注入一条假的判据
  /// ⇒ ⇒ 单测就能把「该回落」与「不许回落」两条路**都**钉住。
  ///
  /// ⚠️ null ⇒ ⇒ 用真实生命周期（`AppLifecycleState.resumed`）。
  final bool Function()? ownAppInForeground;

  const CapabilityTools({
    this.channel = const DeviceDataChannel(),
    this.accessibility,
    this.ownAppInForeground,
  });

  /// 无障碍那一层（没注入就用真机实现）。
  AccessibilityOps get _a11y =>
      accessibility ?? const PlatformAccessibilityOps();

  /// 自家 app 在前台吗（没注入判据 ⇒ 问真实生命周期）。
  bool _ownAppInForeground() =>
      ownAppInForeground?.call() ?? FlutterSemanticsTree.isOwnAppInForeground();

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
    // ⚠️⚠️ **一次采样** —— 树与「这是谁的屏」必须**同源**。
    //
    // ⚠️⚠️ **为什么不能分两次问**（2026-11-11 真机实测）：
    // ⇒ ⇒ 分两次（树一次、包名一次）⇒ ⇒ 两次 `rootInActiveWindow`
    // ⇒ ⇒ ⇒ 可能落在**不同**窗口
    // ⇒ ⇒ ⇒ ⇒ 实测逐字：`pkg=com.android.settings rawPkg=com.miui.home`
    // ⇒ ⇒ ⇒ ⇒ ⇒ 同一时刻，工具层说「设置」、原生说「桌面」
    // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **张冠李戴** ⇒ ⇒ 模型被告知**错的归属**
    // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 「失败长得像成功」的一族。
    //
    // ⇒ ⇒ **通用形态：一个回答里的多个事实必须来自同一次采样**
    // ⇒ ⇒ 否则它们之间可以互相矛盾 ⇒ ⇒ 而矛盾长得像正常。
    final Map<String, dynamic>? snapshot =
        await _a11y.readScreenSnapshot();
    final String? text =
        snapshot != null ? snapshot['screen'] as String? : await _a11y.readScreen();
    if (text != null && text.trim().isNotEmpty) {
      // ⚠️ **截断必须是显式的** —— Kotlin 侧预算用完时会在末尾加
      // `[truncated]` ⇒ ⇒ 模型据此知道「这一屏**没看全**」⇒ ⇒ 别对着
      // 缺失的信息做判断（那是「失败长得像成功」的一族）。
      final truncated = text.trimRight().endsWith(kScreenTruncationMarker);
      return <String, dynamic>{
        'screen': text,
        'length': text.length,
        'truncated': truncated,
        // ⚠️ **来源与坐标口径要写明** —— 模型必须知道自己看的是哪棵树，
        // 以及那些坐标能不能直接拿去点。
        'source': kScreenSourceAndroidA11y,
        'coordinateSpace': kCoordinateSpaceScreen,
        // ⚠️⚠️ **前台是谁** —— 模型必须知道自己看的是**哪个 app 的屏**。
        // ⇒ ⇒ 它看到「日历」二字可能以为那是自家界面 ⇒ ⇒ 而「这棵树是谁的」
        // ⇒ ⇒ 树里**看不出来** ⇒ ⇒ 所以要单独给一个字段。
        // ⚠️ 取不到 ⇒ ⇒ **null**（不是空串）⇒ ⇒ 模型据此知道「不知道」。
        // ⚠️ 这一格走**可注入**的无障碍层（`_a11y`）⇒ ⇒ 单测塞假的就能钉住
        // ⇒ ⇒ 否则「模型怎么用『这是谁的屏』」只能真机验 ⇒ ⇒ CI 永远静悄悄绿。
        // ⚠️⚠️ **同源** —— 与上面那棵树**同一次采样** ⇒ ⇒ 不会张冠李戴。
        //
        // ⚠️⚠️⚠️ **快照失败 ⇒ ⇒ 宁可「不知道」，也不另问一次**（2026-11-11）：
        // ⇒ ⇒ 另问一次 = **第二次独立采样** ⇒ ⇒ 那正是本条修的那个缺陷 ⇒ ⇒
        // ⇒ ⇒ ⇒ 而「快照失败」与「另问能成」几乎**不可能同时发生**
        // ⇒ ⇒ ⇒ ⇒ （两者是**同一段遍历逻辑**的两个出口 ⇒ ⇒ 判空条件相同）
        // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **「同源」不是「快照成功时」的性质**
        // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 它是**无条件**性质。
        // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **不许**有任何一条分两次采样的活路。
        // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **回落那条**
        // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒（走 Flutter 语义树）
        // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 属主是**推出来**的
        // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒
        // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **通用形态**：
        // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **回退路径**
        // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 也不许

        // ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 偷偷换个来源。
        'foregroundPackage': snapshot != null
            ? snapshot['package'] as String?
            : null,
      };
    }
    // ⚠️⚠️ **回落：自家 app 的窗口** —— Android 不把宿主自己的窗口交给
    // 它自己绑定的那个无障碍服务 ⇒ ⇒ 原生那棵树在自家窗口上**必然是空的**
    // ⇒ ⇒ 而「模型在自己 app 里干活」正是手机操作这条线的主战场
    // ⇒ ⇒ 所以拿 **Flutter 自己的语义树**顶上（自家 app 的界面模型）。
    //
    // ⚠️⚠️ **但必须先确认「自家 app 在前台」** —— 原生树读不到有两种可能：
    // ❶ 前台就是自家 app；❷ 前台是**别人**、只是那棵树恰好是空的
    // ⇒ ⇒ 这两种**长得一样** ⇒ ⇒ 不问一句就回落 ⇒ ⇒ 会在别人的屏幕上
    // 显示自家 app 的界面 ⇒ ⇒ 那是最典型的「失败长得像成功」。
    if (!_ownAppInForeground()) {
      throw StateError(
        'cannot read the screen: the foreground window has no readable '
        'accessibility tree',
      );
    }
    // ⚠ **窗口原点**（本窗口在屏幕上的位置）—— 拿到 ⇒ ⇒ 坐标就能换算成
    // **整屏**口径 ⇒ ⇒ 与原生那棵树**同一个字段名、同一个口径**
    // ⇒ ⇒ 模型照着点得准 ⇒ ⇒ 自家窗口也能按坐标操作。
    // ⚠ 拿不到 ⇒ ⇒ 保持**本窗口**口径（字段名 `viewBounds`）⇒ ⇒ 不猜。
    final Map<String, double>? geometry = await _a11y.viewGeometry();
    final ViewOrigin? origin = geometry == null
        ? null
        : ViewOrigin(
            geometry['originX'] ?? 0,
            geometry['originY'] ?? 0,
          );
    final FlutterSemanticsSnapshot? own =
        FlutterSemanticsTree.read(viewOrigin: origin);
    if (own == null) {
      throw StateError(
        'cannot read the screen: this app own semantics tree is not available',
      );
    }
    return <String, dynamic>{
      'screen': own.text,
      'length': own.text.length,
      'truncated': own.truncated,
      'source': kScreenSourceFlutterSemantics,
      // ⚠ 口径**跟着快照**走（整屏 or 本窗口）⇒ ⇒ 别写死。
      'coordinateSpace': own.coordinateSpace,
      // ⚠⚠️ **「这是谁的屏」这一格不许缺** —— 两条分支的**形状**必须一样
      // ⇒ ⇒ 模型不许靠「有没有这个键」去猜这是哪棵树。
      // ⚠ 回落的前提**就是**「自家 app 在前台」⇒ ⇒ 答案已知 ⇒ ⇒ 不去问原生
      // ⇒ ⇒ （原生在自家前台时**拿不到自家窗口**⇒ ⇒ 问了也只会得到 null
      // ⇒ ⇒ ⇒ 那会让模型以为「不知道这是谁的屏」，而其实它就在自家 app 里）。
      'foregroundPackage': kOwnAppPackage,
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
    // ⚠️⚠️ **越界先拦** —— 派发 API 对越界坐标照样回「派发成功」
    // ⇒ ⇒ 界面不动 ⇒ ⇒ **失败长得像成功**（2026-11-10 真机实测）。
    await _ensureOnScreen('tap', <Map<String, double>>[
      <String, double>{'x': x, 'y': y},
    ]);
    final ok = await _a11y.tap(x, y);
    if (!ok) {
      throw await _notDispatched('tap gesture');
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
    await _ensureOnScreen('long-press', <Map<String, double>>[
      <String, double>{'x': x, 'y': y},
    ]);
    final ok = await _a11y.longPress(x, y);
    if (!ok) {
      throw await _notDispatched('long-press gesture');
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
    // ⚠️⚠️ **两端都要在屏内** —— 真机实测：起点 y=3084 而屏高 2400
    // ⇒ ⇒ 派发成功但界面一动不动 ⇒ ⇒ **失败长得像成功**。
    await _ensureOnScreen('swipe', <Map<String, double>>[
      <String, double>{'x': x1, 'y': y1},
      <String, double>{'x': x2, 'y': y2},
    ]);
    final ok = await _a11y.swipe(x1, y1, x2, y2, durationMs);
    if (!ok) {
      throw await _notDispatched('swipe gesture');
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
    // ⚠️⚠️ **先问「前台是谁」** —— 原生那棵树读不到时**才**走自家 app 那条路。
    //
    // ⚠️ 为什么不能「找不到就回落」：在**别人的** app 里找不到那个字
    // ⇒ ⇒ 回落就变成「去点自家 app 里的同名控件」
    // ⇒ ⇒ 那会点到一个用户**没要求**的东西 ⇒ ⇒ 比报错更坏。
    final String? tree = await _a11y.readScreen();
    if (tree == null && _ownAppInForeground()) {
      // ⚠️ 自家窗口那条路**不用坐标** —— 那一套坐标是「本窗口」的，
      // ⇒ ⇒ 与 mobile_tap 的「整屏像素」不是同一个口径 ⇒ ⇒ 拿它去点会歪
      // ⇒ ⇒ 所以让框架把动作**直接派给控件**（控件自己的回调 ⇒ ⇒ 准）。
      final bool tapped = FlutterSemanticsTree.tapByText(text);
      if (tapped) {
        return <String, dynamic>{
          'clicked': true,
          'text': text,
          'source': kScreenSourceFlutterSemantics,
        };
      }
      // ⚠️ 没找到 ⇒ **明确失败**，别回一句「点了」——
      // 那会让模型以为界面变了，然后开始瞎点。
      throw StateError(
        'no clickable element with that text was found in this app own UI: '
        '$text',
      );
    }
    final bool ok = await _a11y.findAndClickByText(text);
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
      throw await _notDispatched('global action', detail: raw);
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

  /// **坐标在不在屏幕内** —— 越界 ⇒ ⇒ **派发之前**就拦下来。
  ///
  /// ⚠️⚠️ **为什么必须拦**（2026-11-10 真机实测）：
  /// Android 的手势派发 API 对**越界坐标**照样回「派发成功」
  /// ⇒ ⇒ 实测滑动起点 `y=3084` 而屏幕只有 2400 高
  /// ⇒ ⇒ 派发成功 ⇒ ⇒ **界面一动不动**
  /// ⇒ ⇒ ⇒ 症状：**失败长得像成功** ⇒ ⇒ 模型以为滑过了
  /// ⇒ ⇒ ⇒ 接着照着**旧**的语义树判断 ⇒ ⇒ 坐标全歪。
  ///
  /// ⚠️⚠️ **越界是「模型算错坐标」的最常见形态** —— 树里给的 bounds
  /// ⇒ ⇒ 有时是**另一个窗口**的（多屏/分屏）⇒ ⇒ 换算到整屏就跑到屏外了。
  /// ⇒ ⇒ 所以这一层**必须**有 ⇒ ⇒ 否则这类错误**静悄悄**。
  ///
  /// ⚠️ 拿不到屏幕尺寸 ⇒ ⇒ **不拦**（宁可放过，不误杀）⇒ ⇒ 与原生那层同一口径。
  Future<void> _ensureOnScreen(String what, List<Map<String, double>> points) async {
    final Map<String, double>? size = await AccessibilityController.screenSize();
    if (size == null) return;
    final double w = size['width']!;
    final double h = size['height']!;
    for (final Map<String, double> p in points) {
      final double x = p['x']!;
      final double y = p['y']!;
      if (x < 0 || y < 0 || x > w || y > h) {
        throw StateError(
          'the $what was rejected: the point (${x.round()},${y.round()}) is '
          'outside the screen (0..${w.round()} x 0..${h.round()}) — '
          'it would have been dispatched but had no effect',
        );
      }
    }
  }

  /// 「派发不出去」的**真因** —— 说清是「没派发」还是「服务没连上」。
  ///
  /// ⚠️ **为什么要分这两种**：真机实测过「系统把无障碍服务重启了」
  /// ⇒ ⇒ 那 1 秒里任何手势都派发不出去 ⇒ ⇒ 但那**不是**「用户没开」
  /// ⇒ ⇒ 一律报「没派发出去」，模型会以为手机坏了 / 坐标不对；
  /// ⇒ ⇒ 一律报「服务没连上」，那「派发出去了但没生效」又被说成重启。
  ///
  /// ⚠️ 判据是**连接态**（瞬时）⇒ ⇒ 报「没连上」时服务**正在重启**
  /// ⇒ ⇒ 那句话本身就是给模型的**下一步指令**（等一下再试）。
  Future<StateError> _notDispatched(String what, {String? detail}) async {
    final connected = await _a11y.isServiceConnected();
    final suffix = detail == null ? '' : ': $detail';
    if (connected) {
      return StateError('the $what was not dispatched$suffix');
    }
    return StateError(
      'the accessibility service is not connected right now '
      '(it may be restarting) — the $what was not dispatched$suffix',
    );
  }

  /// 执行前确认**无障碍服务**已开启。
  ///
  /// ⚠️ 这里判的是**「开关」**（用户在系统设置里开了没）⇒ ⇒ 那是
  /// **权威**判据 ⇒ ⇒ 不会因为系统重启服务而误杀一次调用。
  /// ⇒ ⇒ 「服务此刻连上了没有」是**另一件事**，由派发那一层抗抖。
  ///
  /// ⚠️ 这一层与「应用层档位」是**两件事**：
  /// - 应用层（每次询问 / 完全访问 / 彻底关闭）⇒ 用户对**这个助手**的授权；
  /// - 系统层（无障碍服务）⇒ Android 对**这个 App**的开关。
  ///
  /// ⚠️ 与运行时权限**不同**：无障碍服务**不能**由程序弹窗申请
  /// ⇒ ⇒ 只能用户在系统设置里手动开 ⇒ ⇒ 这里**明确失败**并说清去哪儿开
  /// ⇒ ⇒ 设置页那一行给一键入口。
  Future<void> _ensureAccessibilityService() async {
    // ⚠️ 问的是「**现在能不能动手**」⇒ ⇒ 而不是「用户开没开」
    // ⇒ ⇒ 因为真机实测：系统重启无障碍服务的那 1 秒里，**连「已启用列表」**
    // 都是空的 ⇒ ⇒ 一读就下结论 ⇒ ⇒ 会把「系统正在重启它」说成「用户没开」
    // ⇒ ⇒ 那是**假原因** ⇒ ⇒ 模型会劝用户去动一个本来就是开的开关。
    // ⇒ ⇒ ⇒ 原生那一头会**等服务连上**（≤3 秒）再答 ⇒ ⇒ 这一格抗得住抖。
    if (await _a11y.isReady()) return;
    // ⚠️ 还是不行 ⇒ ⇒ 判清是「用户没开」还是「开了但没连上」
    // ⇒ ⇒ 两者的**下一步指令**完全不同 ⇒ ⇒ 不能混成一句。
    final switched = await _a11y.isEnabled();
    throw StateError(
      switched
          ? 'the accessibility service is enabled but not connected right now '
              '(it may be restarting) — retry in a moment'
          : 'the accessibility service is not enabled — the user has to turn '
              'it on in the system settings first',
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
  // ⚠️ **详细版** ⇒ ⇒ 「用户点了拒绝」与「系统拒绝再弹」**分得开**
  // ⇒ ⇒ 后者**只能**去系统设置页开 ⇒ ⇒ 错误文案必须说清**下一步该干什么**
  // ⇒ ⇒ 否则模型（和用户）只看到一句「没权限」⇒ ⇒ 谁也不知道该干嘛。
  final outcome = await channel.requestPermissionDetailed(capability.wire);
  if (outcome.granted) return;
  if (outcome.permanentlyDenied) {
    throw StateError(
      'the system will no longer show the permission prompt for '
      '${capability.label} — the user has to enable it in the system settings',
    );
  }
  throw StateError(
    'the user has not granted the system permission for '
    '${capability.label} — cannot proceed',
  );
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