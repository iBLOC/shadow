import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_ai_toolkit/flutter_ai_toolkit.dart';
import '../generated/l10n/app_localizations.dart';
import '../providers/ai/litert_provider.dart';

class VoiceConversationScreen extends ConsumerWidget {
  const VoiceConversationScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.voiceMode),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: LlmChatView(
        provider: LiteRTProvider(),
        enableAttachments: true,
        enableVoiceNotes: true,
        welcomeMessage: l10n.welcomeMessage,
        suggestions: [
          l10n.tellMeStory,
          l10n.whatCanYouHelp,
          l10n.howAudioWorks,
        ],
      ),
    );
  }
}
