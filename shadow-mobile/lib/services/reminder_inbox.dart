import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:logging/logging.dart';

final _log = Logger('ReminderInbox');

/// 一条提醒 —— 端脑的通知收件箱里的一条。
///
/// ⚠️ 形状与端脑 `lobes::notification_inbox::Notification` 对齐。
class ReminderNotification {
  const ReminderNotification({
    required this.id,
    required this.taskId,
    required this.taskTitle,
    required this.type,
    required this.message,
    this.dueTime,
  });

  factory ReminderNotification.fromJson(Map<String, dynamic> json) {
    return ReminderNotification(
      id: json['id'] as String? ?? '',
      taskId: json['task_id'] as String? ?? '',
      taskTitle: json['task_title'] as String? ?? '',
      type: json['notification_type'] as String? ?? 'Reminder',
      message: json['message'] as String? ?? '',
      dueTime: json['due_time'] == null
          ? null
          : DateTime.tryParse(json['due_time'] as String),
    );
  }

  /// 通知自己的编号（拿它去 ack）。
  final String id;
  /// 任务号 —— 端脑分配的事实。
  final String taskId;
  final String taskTitle;
  /// `Reminder` / `Overdue` / `NeedsConfirmation`。
  final String type;
  final String message;
  final DateTime? dueTime;
}

/// 提醒收件箱 —— 轮询端脑的提醒 ⇒ ⇒ 送到用户眼前 ⇒ ⇒ **送出去了才确认**。
///
/// ## 为什么需要它（2026-11-09 真机取证）
///
/// 端脑以前**在生产上从不构造**调度器 ⇒ ⇒ 用户在对话里说「提前 10 分钟
/// 提醒我」⇒ ⇒ 端脑把提醒**存进任务库**⇒ ⇒ **永远不响** ⇒ ⇒ 而每一步都
/// 成功 ⇒ ⇒ **失败长得像成功**。
///
/// 现在端脑会响了 ⇒ ⇒ 但**响了没人收到**是同一种失败 ⇒ ⇒ 这一段就是
/// 「收到」那个出口。
///
/// ## ⚠️ 一条不许省的纪律
///
/// **只有真的送出去了才确认** —— 送不出去（常驻服务没开）⇒ ⇒ 提醒**留在
/// 端脑的待办里**⇒ ⇒ 下个周期再送 ⇒ ⇒ 绝不「确认掉一条用户没看到的提醒」
/// ⇒ ⇒ 那会让提醒**静默消失**＝失败长得像成功。
class ReminderInbox {
  ReminderInbox({
    required this.baseUrl,
    required this.shadowKey,
    required this.adminToken,
    required this.deliver,
    this.interval = const Duration(seconds: 30),
    http.Client? httpClient,
  }) : _http = httpClient ?? http.Client();

  /// 端脑地址 —— **每次都问一遍**（嵌入式大脑起来后地址会变）。
  final String Function() baseUrl;
  /// 影子锁（`X-Shadow-Key`）。
  final String? Function() shadowKey;
  /// admin token（`X-Admin-Token`）—— ack 是**写门**，只有它开得了。
  final String? Function() adminToken;
  /// 真的送到用户眼前了吗？—— 返回 false ⇒ ⇒ **不确认**。
  final Future<bool> Function(ReminderNotification n) deliver;
  final Duration interval;
  final http.Client _http;

  Timer? _timer;
  bool _stopped = false;

  void start() {
    if (_timer != null) return;
    unawaited(pollOnce());
    _timer = Timer.periodic(interval, (_) => unawaited(pollOnce()));
  }

  void stop() {
    _stopped = true;
    _timer?.cancel();
    _timer = null;
  }

  /// 轮询一轮 —— `start()` 每个周期调它，测试也直接调它。
  Future<void> pollOnce() async {
    if (_stopped) return;
    List<ReminderNotification> pending;
    try {
      pending = await fetchPending();
    } catch (e) {
      _log.warning('提醒轮询失败: $e');
      return;
    }
    for (final n in pending) {
      if (_stopped) return;
      var delivered = false;
      try {
        delivered = await deliver(n);
      } catch (e) {
        _log.warning('提醒送达失败: $e');
      }
      if (!delivered) {
        // ⚠️ **送不出去就不确认** ⇒ ⇒ 提醒留在端脑的待办里。
        _log.info('提醒 ${n.id} 没能送到用户眼前 —— 它留在待办里');
        continue;
      }
      try {
        await ack([n.id]);
      } catch (e) {
        _log.warning('确认提醒失败: $e');
      }
    }
  }

  /// 读门的**全部**钥匙 —— 影子锁 ∪ admin token（**拿不到就不带**）。
  ///
  /// ⚠️ 绝不塞空串：空串会把门骗开（端脑的 `ct_eq` 口径）。
  Map<String, String> headers() {
    final h = <String, String>{};
    final shadow = shadowKey()?.trim();
    if (shadow != null && shadow.isNotEmpty) h['X-Shadow-Key'] = shadow;
    final admin = adminToken()?.trim();
    if (admin != null && admin.isNotEmpty) h['X-Admin-Token'] = admin;
    return h;
  }

  /// 未确认的提醒。
  Future<List<ReminderNotification>> fetchPending() async {
    final uri = Uri.parse('${baseUrl()}/api/telencephalon/notifications');
    final resp = await _http.get(uri, headers: headers());
    if (resp.statusCode != 200) {
      throw Exception(
        'GET /api/telencephalon/notifications → ${resp.statusCode}: ${resp.body}',
      );
    }
    // ⚠️ **显式按 utf8 解码** —— 不靠 content-type 猜：
    // `package:http` 只在 content-type 是 `application/json` 时才按 utf8
    // 解码，其它一律 latin1 ⇒ ⇒ 提醒正文是中文 ⇒ ⇒ 猜错就是**乱码**
    // （看着像成功了，其实用户看到的是一堆问号）。
    final decoded = jsonDecode(utf8.decode(resp.bodyBytes));
    if (decoded is! List) return const <ReminderNotification>[];
    return decoded
        .whereType<Map<String, dynamic>>()
        .map(ReminderNotification.fromJson)
        .toList();
  }

  /// 确认（= 「已经送到用户眼前了」）。
  Future<void> ack(List<String> ids) async {
    if (ids.isEmpty) return;
    final uri = Uri.parse('${baseUrl()}/api/telencephalon/notifications/ack');
    final resp = await _http.post(
      uri,
      headers: {...headers(), 'Content-Type': 'application/json'},
      body: jsonEncode({'ids': ids}),
    );
    if (resp.statusCode != 200) {
      throw Exception(
        'POST /api/telencephalon/notifications/ack → ${resp.statusCode}: ${resp.body}',
      );
    }
  }
}
