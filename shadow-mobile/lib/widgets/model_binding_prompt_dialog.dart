import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../generated/l10n/app_localizations.dart';
import '../providers/error_dialog_provider.dart';
import '../router/app_router.dart';
import '../theme/app_colors.dart';

/// 模型绑定引导弹窗。当 cortex 返回 LLM_NOT_REGISTERED 时弹出。
/// 提供按钮跳转到设置页面 (`/settings`) 或直接绑定特定选项。
class ModelBindingPromptDialog extends ConsumerWidget {
  const ModelBindingPromptDialog({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prompt = ref.watch(modelBindingPromptProvider);
    if (prompt == null) return const SizedBox.shrink();

    final l10n = AppLocalizations.of(context)!;
    final options = prompt.bindingOptions ?? const [];

    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.all(24),
      child: Container(
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(16),
        ),
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.warning_amber_rounded,
                    color: AppColors.primary, size: 28),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    l10n.modelBindingPromptTitle,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              prompt.userMessage ?? l10n.modelBindingPromptGoSettings,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 24),
            if (options.isNotEmpty)
              ...options.map((opt) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(opt.label,
                            style:
                                Theme.of(context).textTheme.titleSmall),
                        const SizedBox(height: 4),
                        Text(opt.description,
                            style:
                                Theme.of(context).textTheme.bodySmall),
                      ],
                    ),
                  ))
            else
              Text(
                l10n.modelBindingPromptGoSettings,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () {
                    ref
                        .read(modelBindingPromptProvider.notifier)
                        .dismiss();
                  },
                  child: Text(l10n.modelBindingPromptLater),
                ),
                const SizedBox(width: 8),
                FilledButton.icon(
                  icon: const Icon(Icons.settings),
                  label: Text(l10n.modelBindingPromptGoSettings),
                  onPressed: () {
                    ref
                        .read(modelBindingPromptProvider.notifier)
                        .dismiss();
                    if (context.mounted) {
                      context.go(AppRoutes.settings);
                    }
                  },
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
