import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../agents/providers/agent_provider.dart';
import '../../agents/main_agent/main_agent_prompt.dart';
import '../generated/l10n/app_localizations.dart';

/// 提示词设置页面
class PromptSettingsScreen extends ConsumerStatefulWidget {
  const PromptSettingsScreen({super.key});

  @override
  ConsumerState<PromptSettingsScreen> createState() =>
      _PromptSettingsScreenState();
}

class _PromptSettingsScreenState extends ConsumerState<PromptSettingsScreen> {
  late TextEditingController _controller;
  bool _hasChanges = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(
      text:
          ref.read(customPromptProvider) ?? MainAgentPrompt.defaultSystemPrompt,
    );
    _controller.addListener(_onTextChanged);
  }

  void _onTextChanged() {
    final hasChanges = _controller.text != MainAgentPrompt.defaultSystemPrompt;
    if (hasChanges != _hasChanges) {
      setState(() => _hasChanges = hasChanges);
    }
  }

  @override
  void dispose() {
    _controller.removeListener(_onTextChanged);
    _controller.dispose();
    super.dispose();
  }

  void _save() {
    ref.read(customPromptProvider.notifier).state = _controller.text;
    setState(() => _hasChanges = false);
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(AppLocalizations.of(context)!.promptSaved)));
  }

  void _reset() {
    _controller.text = MainAgentPrompt.defaultSystemPrompt;
    ref.read(customPromptProvider.notifier).state = null;
    setState(() => _hasChanges = false);
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(AppLocalizations.of(context)!.promptRestored)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(AppLocalizations.of(context)!.promptSettingsTitle),
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          TextButton(
            onPressed: _hasChanges ? _save : null,
            child: Text(AppLocalizations.of(context)!.commonSave),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(AppLocalizations.of(context)!.promptMainAgentLabel, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Expanded(
              child: TextField(
                controller: _controller,
                maxLines: null,
                expands: true,
                decoration: InputDecoration(
                  border: OutlineInputBorder(),
                  hintText: AppLocalizations.of(context)!.promptInputHint,
                ),
                style: const TextStyle(fontSize: 14),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton.icon(
                  onPressed: _reset,
                  icon: const Icon(Icons.restore),
                  label: Text(AppLocalizations.of(context)!.promptRestoreDefault),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
