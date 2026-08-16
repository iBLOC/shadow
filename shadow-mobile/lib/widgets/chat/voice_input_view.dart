import 'package:flutter/material.dart';
import '../../generated/l10n/app_localizations.dart';

/// Voice input view with long-press-to-record gesture
class VoiceInputView extends StatelessWidget {
  final bool isRecording;
  final bool isEnabled;
  final VoidCallback onStartRecording;
  final VoidCallback onStopAndSend;

  const VoiceInputView({
    super.key,
    required this.isRecording,
    required this.isEnabled,
    required this.onStartRecording,
    required this.onStopAndSend,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    if (!isEnabled) {
      return Center(
        child: Text(
          l10n.initializing,
          style: TextStyle(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      );
    }

    return GestureDetector(
      onLongPressStart: (_) {
        if (!isRecording) {
          onStartRecording();
        }
      },
      onLongPressEnd: (_) {
        if (isRecording) {
          onStopAndSend();
        }
      },
      child: Container(
        height: 56,
        decoration: BoxDecoration(
          color: isRecording
              ? Colors.red.withValues(alpha: 0.1)
              : Theme.of(context).colorScheme.primaryContainer,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(
            color: isRecording
                ? Colors.red
                : Theme.of(context).colorScheme.primary,
            width: 2,
          ),
        ),
        child: Center(
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                isRecording ? Icons.mic : Icons.mic_none,
                color: isRecording
                    ? Colors.red
                    : Theme.of(context).colorScheme.primary,
                size: 28,
              ),
              const SizedBox(width: 8),
              Text(
                isRecording ? l10n.recording : l10n.holdToRecord,
                style: TextStyle(
                  color: isRecording
                      ? Colors.red
                      : Theme.of(context).colorScheme.primary,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
