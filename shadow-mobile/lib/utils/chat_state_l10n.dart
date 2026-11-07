import '../generated/l10n/app_localizations.dart';
import '../providers/chat_provider.dart';

extension ChatStateL10n on ChatState {
  String? displayErrorMessage(AppLocalizations l10n) {
    if (errorMessageL10nKey == null) return errorMessage;
    switch (errorMessageL10nKey!) {
      case ChatStateL10nKey.errorGeneric:
        return l10n.errorGeneric(errorMessageArg ?? '');
      case ChatStateL10nKey.errorAttachmentNotAvailable:
        return l10n.chatAttachmentNotAvailable;
    }
  }
}
