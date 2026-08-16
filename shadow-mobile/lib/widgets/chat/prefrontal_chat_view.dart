import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_ai_toolkit/flutter_ai_toolkit.dart' as ai_toolkit;
import '../../generated/l10n/app_localizations.dart';
import '../../providers/ai/prefrontal_provider.dart';

/// Prefrontal Chat View using LlmChatView with PrefrontalProvider
class PrefrontalChatView extends ConsumerStatefulWidget {
  const PrefrontalChatView({super.key});

  @override
  ConsumerState<PrefrontalChatView> createState() =>
      _PrefrontalChatViewState();
}

class _PrefrontalChatViewState extends ConsumerState<PrefrontalChatView> {
  PrefrontalProvider? _provider;
  String? _sessionId;

  @override
  void initState() {
    super.initState();
    _initProvider();
  }

  Future<void> _initProvider() async {
    final provider = PrefrontalProvider();
    final sessionId = await provider.createSession();
    if (mounted) {
      setState(() {
        _provider = provider;
        _sessionId = sessionId;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    if (_provider == null || _sessionId == null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 16),
            Text(l10n.initializing),
          ],
        ),
      );
    }

    return ai_toolkit.LlmChatView(
      provider: _provider!,
      enableAttachments: true,
      enableVoiceNotes: true,
      welcomeMessage: l10n.welcomeMessage,
      suggestions: [l10n.tellMeStory, l10n.whatCanYouHelp, l10n.howAudioWorks],
    );
  }
}
