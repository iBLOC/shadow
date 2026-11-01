/// 会话标题的**唯一**派生规则。
///
/// ⚠️ 为什么要有这么一条：端脑的 `Conversation` **没有标题字段**
/// （只有 `id` / `agent` / `created_at` / `updated_at` / `history`）
/// ⇒ ⇒ 标题只能由客户端**派生** ⇒ ⇒ 那就必须**只有一处**实现 ——
/// 会话列表页与对话页各写一份 ⇒ 迟早分叉 ⇒ ⇒ 而分叉出来的标题
/// 「有的按叶区名、有的按第一句话」⇒ ⇒ 用户看到的列表与对话页**对不上**。
///
/// 规则：**用户自己说过的第一句话** ⇒ ⇒ 同一个叶区的所有会话
/// **不再长得一模一样**（这是「管理多个会话」能被看见的前提）。
///
/// 返回 `null` ⇒ 这段话**不是**标题（空白）⇒ 由调用方决定回退文案。
String? deriveConversationTitle(String? raw) {
  if (raw == null) return null;
  // 换行与连续空白压成单个空格 —— 标题是**一行**，多行会把卡片撑破。
  final text = raw.trim().replaceAll(RegExp(r'\s+'), ' ');
  if (text.isEmpty) return null;
  // ⚠️ 按**码点**（runes）截断，不按 UTF-16 码元（length）⇒
  // emoji 这类星平面字符占**两个**码元 ⇒ 按码元切会切出半个代理对
  // ⇒ 渲染成「豆腐块」。
  final runes = text.runes.toList();
  return runes.length <= maxTitleRunes
      ? text
      : '${String.fromCharCodes(runes.take(maxTitleRunes))}…';
}

/// 标题最多几个码点。
const int maxTitleRunes = 30;
