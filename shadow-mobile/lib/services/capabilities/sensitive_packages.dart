/// **敏感目标清单** —— 「手机操作」一轮一次授权的例外面。
///
/// 用户拍板的逻辑（2026-11-12）：模拟用户行为**一轮只授权一次**
/// ⇒ ⇒ 例外：触到支付等更敏感的目标时，退回**逐次询问**。
///
/// ## 为什么按「前台包名」判
///
/// 「支付」不是一个独立的工具或能力 —— 它是「模拟用户行为」在
/// 支付类 App 里发生的那一段 ⇒ ⇒ 客户端能机械看到的只有
/// `mobile_read_screen` 回来的 **foregroundPackage**（此刻谁在前台）。
///
/// ## 为什么宁可清单短，也不放没把握的包名
///
/// 放错的包名 ⇒ ⇒ 永不命中 ⇒ ⇒ 「敏感例外」静默失效（fail-open）；
/// 清单短 ⇒ ⇒ 顶多在没收录的支付类 App 里少问一次。
/// ⚠️ 漏判的代价是真实的 ⇒ ⇒ 只收**确定无疑**的包名，
/// 后续逐个核真包名再扩（宁可多问，不可错放）。
const Set<String> sensitiveForegroundPackages = <String>{
  'com.eg.android.AlipayGphone', // 支付宝
  'com.tencent.mm', // 微信（支付场景在内；整个包算敏感 —— 宁可把聊天也多问一次）
  'com.unionpay', // 云闪付
};

/// 前台包名是否落在敏感清单里。
///
/// null ＝ 读不到前台 ⇒ **不算**敏感：这条判的是「要不要把本轮已授权的档
/// 收紧」，收紧本身需要证据 ⇒ 证据不足保持现状；而「要授权的动作」那侧
/// 仍是 fail-closed（没授权就执行不了），两件事别混。
bool isSensitiveForegroundPackage(String? packageName) =>
    packageName != null && sensitiveForegroundPackages.contains(packageName);
