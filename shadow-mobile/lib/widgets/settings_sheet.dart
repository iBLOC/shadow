import 'package:flutter/material.dart';
import '../generated/l10n/app_localizations.dart';
import '../services/accessibility_controller.dart';

class SettingsSheet extends StatelessWidget {
  final String modelInfo;
  final VoidCallback onReset;

  const SettingsSheet({
    super.key,
    required this.modelInfo,
    required this.onReset,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Container(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.settings),
              const SizedBox(width: 8),
              Text(l10n.settings, style: Theme.of(context).textTheme.titleLarge),
            ],
          ),
          const SizedBox(height: 16),
          ListTile(
            leading: const Icon(Icons.info_outline),
            title: Text(l10n.modelInfo),
            subtitle: Text(modelInfo),
          ),
          if (AccessibilityController.isSupported) ...[
            const Divider(),
            _AccessibilityTile(),
          ],
          const Divider(),
          ListTile(
            leading: Icon(
              Icons.refresh,
              color: Theme.of(context).colorScheme.error,
            ),
            title: Text(l10n.resetEngine),
            subtitle: const Text('Reinitialize engine'),
            onTap: onReset,
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

class _AccessibilityTile extends StatefulWidget {
  @override
  State<_AccessibilityTile> createState() => _AccessibilityTileState();
}

class _AccessibilityTileState extends State<_AccessibilityTile> {
  bool _enabled = false;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    final enabled = await AccessibilityController.isEnabled;
    if (mounted) setState(() => _enabled = enabled);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return ListTile(
      leading: Icon(
        _enabled ? Icons.accessibility_new : Icons.accessibility,
        color: _enabled
            ? Theme.of(context).colorScheme.primary
            : Theme.of(context).colorScheme.outline,
      ),
      title: Text(l10n.accessibilityControl),
      subtitle: Text(_enabled ? l10n.accessibilityOn : l10n.accessibilityOff),
      trailing: const Icon(Icons.open_in_new, size: 18),
      onTap: () async {
        await AccessibilityController.openSettings();
        if (context.mounted) _refresh();
      },
    );
  }
}
