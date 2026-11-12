import '../../generated/l10n/app_localizations.dart';

/// 能力标注的用户语言（文本 / 视觉 / 语音识别 / 语音合成 / …）。
///
/// ⚠️ 端脑目录的 capability 取值域：llm / asr / tts / embedding /
/// vision / rerank / ocr —— 认不出的原样显示（不吞）。
///
/// ⚠️ 独立成文件：模型管理页与自持模型表单**都用它** —— 放在任何一边
/// 都会把另一边拖进 import 环（页面文件里那个循环 import 的旧债不重犯）。
/// ⚠️ 叫 `catalogCapabilityLabel` 不叫 `capabilityLabel`：仓里已有一个
/// `Capability`（枚举）版的 `capability_i18n.dart` —— 撞名会让同时
/// import 两边的文件直接编译红。
String catalogCapabilityLabel(AppLocalizations l10n, String? capability) {
  switch (capability) {
    case 'llm':
      return l10n.capLlm;
    case 'vision':
      return l10n.capVision;
    case 'asr':
      return l10n.capAsr;
    case 'tts':
      return l10n.capTts;
    case 'embedding':
      return l10n.capEmbedding;
    case 'rerank':
      return l10n.capRerank;
    case 'ocr':
      return l10n.capOcr;
    case 'image_gen':
      // ⚠️ **词是 `image_gen`（带下划线）** —— 端脑词表与 synapse 云端目录
      // 同一拼法；写错一个字母这行就「认不出」了（default 会原样显示）。
      return l10n.capImageGen;
    default:
      return capability ?? '';
  }
}
