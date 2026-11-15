import 'dart:async';

import 'package:flutter/material.dart';

import '../generated/l10n/app_localizations.dart';
import '../theme/app_tokens.g.dart';
import '../tts_engine.dart';

/// **全局「没出声」横幅** —— 出声失败时，**任何页面**都看得见。
///
/// ## 为什么挂在 App 根部，而不是在对话页弹 SnackBar
///
/// - 出声**不止**发生在对话页（本地会话里点语音消息也会出声）⇒ ⇒
///   SnackBar 依赖**当前页有 Scaffold** ⇒ ⇒ 在别的页面失败就弹不出来
///   ⇒ ⇒ 那还是「失败长得像成功」。
/// - 失败是**用户要处理的事**（没配默认 TTS 模型 / 上游炸了 / 设备没有
///   内置 TTS 引擎）⇒ ⇒ **不自动消失** ⇒ ⇒ 等用户自己关掉。
/// - 真相源仍是 [TtsEngine.lastFailure] —— 关掉横幅**不等于**问题解决。
class TtsErrorBanner extends StatefulWidget {
  const TtsErrorBanner({super.key});

  @override
  State<TtsErrorBanner> createState() => _TtsErrorBannerState();
}

class _TtsErrorBannerState extends State<TtsErrorBanner> {
  StreamSubscription<String>? _sub;
  String? _reason;

  @override
  void initState() {
    super.initState();
    // ⚠️ 补上**当前**已有的错误（横幅是后挂的 ⇒ 之前的失败它没听见）。
    _reason = TtsEngine.lastFailure;
    _sub = TtsEngine.failures.listen((reason) {
      if (!mounted) return;
      setState(() => _reason = reason);
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final reason = _reason;
    if (reason == null || reason.isEmpty) return const SizedBox.shrink();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFF3A1D1D) : const Color(0xFFFFE5E5);
    final fg = isDark ? const Color(0xFFFFB4AB) : const Color(0xFF93000A);
    return Container(
      width: double.infinity,
      color: bg,
      padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.volume_off_outlined, size: 18, color: fg),
          const SizedBox(width: AppTokens.spaceSm),
          Expanded(
            child: Text(
              // ⚠️ 上下文（译文）＋ 原因（原文）**两者都在** —— 原因不重包
              // （HTTP 码 / 门 / 引擎没初始化，处置完全不同）。
              l10n == null
                  ? 'Speech failed: $reason'
                  : l10n.ttsSpeakFailed(reason),
              style: TextStyle(color: fg, fontSize: 13),
            ),
          ),
          IconButton(
            icon: Icon(Icons.close, size: 16, color: fg),
            tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
            onPressed: () => setState(() => _reason = null),
          ),
        ],
      ),
    );
  }
}
