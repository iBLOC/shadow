import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/chat_provider.dart';
import '../../providers/conversation_mode_provider.dart';
import '../../theme/app_colors.dart';

/// Mode switcher button for toggling between text and voice modes
class ModeSwitcher extends ConsumerWidget {
  const ModeSwitcher({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final convNotifier = ref.read(conversationModeProvider.notifier);
    final chatNotifier = ref.read(chatProvider.notifier);

    return IconButton(
      icon: Icon(Icons.phone, color: AppColors.primary),
      onPressed: () {
        chatNotifier.sendGreeting();
        convNotifier.startConversationMode();
      },
      tooltip: 'Voice Mode',
    );
  }
}
