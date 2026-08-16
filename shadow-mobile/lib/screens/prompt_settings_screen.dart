import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../agents/providers/agent_provider.dart';
import '../../agents/main_agent/main_agent_prompt.dart';

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
    ).showSnackBar(const SnackBar(content: Text('提示词已保存')));
  }

  void _reset() {
    _controller.text = MainAgentPrompt.defaultSystemPrompt;
    ref.read(customPromptProvider.notifier).state = null;
    setState(() => _hasChanges = false);
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('已恢复默认提示词')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('提示词设置'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          TextButton(
            onPressed: _hasChanges ? _save : null,
            child: const Text('保存'),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('主Agent系统提示词', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Expanded(
              child: TextField(
                controller: _controller,
                maxLines: null,
                expands: true,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  hintText: '输入系统提示词...',
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
                  label: const Text('恢复默认'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
