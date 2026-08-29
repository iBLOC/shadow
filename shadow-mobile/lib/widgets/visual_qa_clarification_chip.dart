import 'package:flutter/material.dart';
import '../../generated/l10n/app_localizations.dart';
import '../../services/cortex/cortex_client.dart';

/// Visual-QA clarification chip — a glass card with one button per
/// candidate video source. The user picks one; the parent screen
/// reuses the current conversation to send the picked source id +
/// label as the next user message.
class VisualQaClarificationChip extends StatelessWidget {
  final ClarificationPayload clarification;
  final void Function(ClarificationCandidate candidate) onPick;

  const VisualQaClarificationChip({
    super.key,
    required this.clarification,
    required this.onPick,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context)!;
    return Container(
      key: const ValueKey('visual-qa-clarification-chip'),
      margin: const EdgeInsets.symmetric(vertical: 6),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Icon(
                Icons.videocam_outlined,
                size: 18,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(width: 8),
              Text(
                _titleFor(clarification.kind, l10n),
                style: theme.textTheme.labelLarge,
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final c in clarification.candidates)
                _CandidateButton(
                  candidate: c,
                  onTap: () => onPick(c),
                ),
            ],
          ),
        ],
      ),
    );
  }

  String _titleFor(String kind, AppLocalizations l10n) {
    switch (kind) {
      case 'vsrc_pick':
      case 'visual_qa_source_picker':
        return l10n.visualQaPickCamera;
      default:
        return kind;
    }
  }
}

class _CandidateButton extends StatelessWidget {
  final ClarificationCandidate candidate;
  final VoidCallback onTap;

  const _CandidateButton({required this.candidate, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final label = candidate.hostLabel != null && candidate.hostLabel!.isNotEmpty
        ? '${candidate.deviceLabel} · ${candidate.hostLabel}'
        : candidate.deviceLabel;
    return OutlinedButton(
      key: ValueKey('visual-qa-candidate-${candidate.sourceId}'),
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        textStyle: theme.textTheme.labelMedium,
      ),
      child: Text(label),
    );
  }
}