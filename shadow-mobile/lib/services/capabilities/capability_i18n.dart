import '../../generated/l10n/app_localizations.dart';
import 'capability.dart';

/// **能力的本地化文案** —— 一处映射，两处用（设置页 + 授权卡片）。
///
/// ⚠️ 为什么单独一个文件：能力工具的**名字 / 说明 / 参数**在两处出现
/// ⇒ ⇒ 设置页那一份与授权卡片那一份**必须逐字一致**
/// ⇒ ⇒ 收成一处，避免「设置里叫『读取日历』、审批卡上叫『Read calendar』」。
///
/// ⚠️ 能力工具的**工具名**（`calendar_read_events`）是**给模型看的**
/// ⇒ ⇒ 用户在审批卡上看到那个名字等于**什么都没看懂**
/// ⇒ ⇒ 这一层就是把它翻成人话。

/// 能力 → 界面上的名字（设置页那一份、卡片标题那一份）。
String capabilityLabel(AppLocalizations l10n, Capability capability) {
  switch (capability) {
    case Capability.calendarRead:
      return l10n.capabilityCalendarRead;
    case Capability.calendarWrite:
      return l10n.capabilityCalendarWrite;
    case Capability.contacts:
      return l10n.capabilityContacts;
    case Capability.sms:
      return l10n.capabilitySms;
    case Capability.photos:
      return l10n.capabilityPhotos;
    case Capability.mobileUse:
      return l10n.capabilityMobileUse;
  }
}

/// 能力 → 「模型想做什么」的一句话。
///
/// ⚠️ 这句话是**用户点头前读到的唯一说明** ⇒ ⇒ 必须说人话
/// ⇒ ⇒ 不能拿工具描述（那是**写给模型**的英文技术散文）顶替。
String capabilityRequestText(
  AppLocalizations l10n,
  Capability capability, {
  /// **具体是哪个工具**（可空）。
  ///
  /// ⚠️ 为什么需要它：「手机操作」这一族有**六个工具**
  /// （读屏 / 点 / 长按 / 滑 / 按文字点 / 全局动作）
  /// ⇒ ⇒ 光看能力说不出「模型到底想干什么」⇒ ⇒ 得看**工具名**
  /// ⇒ ⇒ 否则用户在「允许」那颗按钮前面看到的是一句含糊的话。
  String? toolName,
}) {
  switch (capability) {
    case Capability.calendarRead:
      return l10n.capabilityRequestCalendarRead;
    case Capability.calendarWrite:
      return l10n.capabilityRequestCalendarWrite;
    case Capability.contacts:
      return l10n.capabilityRequestContacts;
    case Capability.sms:
      return l10n.capabilityRequestSms;
    case Capability.photos:
      return l10n.capabilityRequestPhotos;
    case Capability.mobileUse:
      switch (toolName) {
        case 'mobile_read_screen':
          return l10n.capabilityRequestMobileReadScreen;
        case 'mobile_tap':
          return l10n.capabilityRequestMobileTap;
        case 'mobile_long_press':
          return l10n.capabilityRequestMobileLongPress;
        case 'mobile_swipe':
          return l10n.capabilityRequestMobileSwipe;
        case 'mobile_find_and_click':
          return l10n.capabilityRequestMobileFindAndClick;
        case 'mobile_global_action':
          return l10n.capabilityRequestMobileGlobalAction;
        default:
          return l10n.capabilityRequestMobileUse;
      }
  }
}

/// 能力 → 「要读的是哪一段」的参数摘要。
///
/// ⚠️ 原来的卡片把参数按 `key: value` 原样摊出来 ⇒ ⇒ 用户看到的是
/// `from: 2026-11-02T09:00:00` ⇒ ⇒ 这不是「说明」，这是**日志**。
/// ⇒ ⇒ 这一层把每个能力**最关键的那一个参数**说成人话。
String capabilityArgsSummary(
  AppLocalizations l10n,
  Capability capability,
  Map<String, dynamic> args, {
  /// **具体是哪个工具**（可空）—— 见 [capabilityRequestText] 的说明。
  String? toolName,
}) {
  switch (capability) {
    case Capability.calendarRead:
      final from = _formatMoment(args['from']);
      final to = _formatMoment(args['to']);
      if (from.isEmpty && to.isEmpty) {
        return l10n.capabilityArgTimeRangeDefault;
      }
      return l10n.capabilityArgTimeRange(from, to);

    case Capability.calendarWrite:
      final title = (args['title'] as String?)?.trim() ?? '';
      final start = _formatMoment(args['start']);
      if (title.isEmpty && start.isEmpty) return '';
      if (start.isEmpty) return l10n.capabilityArgTitle(title);
      if (title.isEmpty) return l10n.capabilityArgStartAt(start);
      return '${l10n.capabilityArgTitle(title)} · ${l10n.capabilityArgStartAt(start)}';

    case Capability.contacts:
      final query = (args['query'] as String?)?.trim() ?? '';
      if (query.isNotEmpty) return l10n.capabilityArgKeyword(query);
      return l10n.capabilityArgContactsHead(_limitOf(args, 50));

    case Capability.sms:
      return l10n.capabilityArgRecentSms(_limitOf(args, 30));

    case Capability.photos:
      return l10n.capabilityArgRecentPhotos(_limitOf(args, 30));
    case Capability.mobileUse:
      switch (toolName) {
        case 'mobile_tap':
        case 'mobile_long_press':
          return l10n.capabilityArgMobilePoint(
            _argOf(args, 'x'),
            _argOf(args, 'y'),
          );
        case 'mobile_swipe':
          return l10n.capabilityArgMobileSwipe(
            _argOf(args, 'x1'),
            _argOf(args, 'y1'),
            _argOf(args, 'x2'),
            _argOf(args, 'y2'),
          );
        case 'mobile_find_and_click':
          return l10n.capabilityArgMobileText(_argOf(args, 'text'));
        case 'mobile_global_action':
          return l10n.capabilityArgMobileAction(_argOf(args, 'action'));
        default:
          // ⚠️ 读屏没有参数 ⇒ ⇒ 空摘要（不是「无」也不是空白行）。
          return '';
      }
  }
}

/// 把 ISO 时间翻成「2026-11-02 09:00」。
///
/// ⚠️ 认不出来 ⇒ 原样返回 ⇒ ⇒ 用户至少能看到模型**原来要的是什么**，
/// 而不是看到一片空白。
String _formatMoment(Object? raw) {
  if (raw is! String) return '';
  final text = raw.trim();
  if (text.isEmpty) return '';
  final parsed = DateTime.tryParse(text);
  if (parsed == null) return text;
  String two(int value) => value.toString().padLeft(2, '0');
  return '${parsed.year}-${two(parsed.month)}-${two(parsed.day)} '
      '${two(parsed.hour)}:${two(parsed.minute)}';
}

/// 取一个参数并**拍成字符串**（认不出来就空串）。
///
/// ⚠️ 为什么拍成字符串：模型偶尔会传数字给本该是文字的字段
/// ⇒ ⇒ 原样拼进文案里会出现「位置 3.0, 4.0」这种怪东西。
String _argOf(Map<String, dynamic> args, String key) {
  final raw = args[key];
  if (raw == null) return '';
  if (raw is num) {
    return raw == raw.roundToDouble()
        ? raw.toInt().toString()
        : raw.toString();
  }
  return raw.toString().trim();
}

/// 条数参数（认不出来就用默认值）。
String _limitOf(Map<String, dynamic> args, int fallback) {
  final raw = args['limit'];
  if (raw is int) return '$raw';
  if (raw is String) {
    final parsed = int.tryParse(raw.trim());
    if (parsed != null) return '$parsed';
  }
  return '$fallback';
}