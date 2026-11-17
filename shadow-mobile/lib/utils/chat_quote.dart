/// 「长按气泡 ⇒ ⇒ **引用**到输入框」那一格的**纯函数**部分。
///
/// ⚠️ **为什么单独一份纯函数**（不塞在 provider 里）：这一格的**形状**
/// （引文在前、你的话在后、引文压成一行）必须能被**单测**钉住
/// ⇒ ⇒ 而 provider 那层要绑一整台假端脑才跑得起来。
library;

/// 引用片段：压成**一行**、截到 [max] 个字。
///
/// ⚠️ **为什么压成一行**：被引的那条可能**带换行**（代码块、列表、模型
/// 那头排过版的回复）⇒ ⇒ 直接拼进去 ⇒ ⇒ 「引用：」那一行后面会跟着一
/// 堆原文 ⇒ ⇒ 模型读到的是一段**没有边界**的话 ⇒ ⇒ 引用的边界就丢了。
///
/// ⚠️ **为什么截断**：一条长回复几百上千字 ⇒ ⇒ 全塞进去 ⇒ ⇒ 这一次请求
/// 的上下文被一条**历史**吃掉 ⇒ ⇒ 而引用要的是「他在说哪一句」⇒ ⇒
/// 片段就够。
String quoteSnippet(String text, {int max = 200}) {
  final String oneLine = text.replaceAll(RegExp(r'\s+'), ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return '${oneLine.substring(0, max)}…';
}

/// 把「被引用的那一条」与「你新写的那一句」拼成**一条**发给模型的话。
///
/// ⚠️ **为什么必须拼进正文**（而不是另发一条消息）：AG-UI 那一路
/// **只发当轮那一条 user 消息** ⇒ ⇒ 引用若只活在界面上 ⇒ ⇒ 模型
/// **压根不知道**被引的是哪一句 ⇒ ⇒ 那就是「界面上看着像引用了，其实
/// 没引用」—— **失败长得像成功**。
///
/// ⚠️ **为什么拼成一条**（而不是两条）：拼成一条 ⇒ ⇒ **界面上那条气泡**
/// 与**发出去的那句话**是**同一个字符串** ⇒ ⇒ 用户看到的与模型收到的
/// **不会分叉** ⇒ ⇒ 不存在「界面上是 A、发出去是 B」那一格。
///
/// ⚠️ [marker] 是**带标点**的标记（「引用：」／"Quote: "）⇒ ⇒ 由 l10n 给
/// ⇒ ⇒ 这一格**不写死**中文 ⇒ ⇒ 英文界面下模型看到的也是英文标记。
String composeQuotedPrompt({
  required String quoted,
  required String prompt,
  required String marker,
}) {
  final String snippet = quoteSnippet(quoted);
  if (snippet.isEmpty) return prompt;
  final String body = prompt.trim();
  if (body.isEmpty) return '$marker$snippet';
  return '$marker$snippet\n$body';
}
