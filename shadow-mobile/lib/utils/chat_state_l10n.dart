import '../generated/l10n/app_localizations.dart';
import '../providers/chat_provider.dart';

extension ChatStateL10n on ChatState {
  String displayModelInfo(AppLocalizations l10n) {
    switch (modelInfoL10nKey) {
      case ChatStateL10nKey.modelInfoNotInitialized:
        return l10n.modelInfoNotInitialized;
      case ChatStateL10nKey.modelLoaded:
        return l10n.modelLoaded;
      case ChatStateL10nKey.desktopMode:
        return l10n.desktopMode;
      default:
        return modelInfo;
    }
  }

  String? displayErrorMessage(AppLocalizations l10n) {
    if (errorMessageL10nKey == null) return errorMessage;
    switch (errorMessageL10nKey!) {
      case ChatStateL10nKey.errorGeneric:
        return l10n.errorGeneric(errorMessageArg ?? '');
      case ChatStateL10nKey.errorAttachmentNotAvailable:
        return l10n.chatAttachmentNotAvailable;
      default:
        return errorMessage;
    }
  }
}
