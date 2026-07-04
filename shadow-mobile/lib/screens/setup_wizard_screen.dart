import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../generated/l10n/app_localizations.dart';
import '../services/app_config_service.dart';

enum _SetupStep { welcome, password, provider, done }

class _WizardState {
  const _WizardState({
    required this.step,
    this.password = '',
    this.confirmPassword = '',
    this.providerType = 'openai',
    this.providerName = '',
    this.apiBase = 'https://api.openai.com/v1',
    this.apiKey = '',
  });

  final _SetupStep step;
  final String password;
  final String confirmPassword;
  final String providerType;
  final String providerName;
  final String apiBase;
  final String apiKey;

  _WizardState copyWith({
    _SetupStep? step,
    String? password,
    String? confirmPassword,
    String? providerType,
    String? providerName,
    String? apiBase,
    String? apiKey,
  }) {
    return _WizardState(
      step: step ?? this.step,
      password: password ?? this.password,
      confirmPassword: confirmPassword ?? this.confirmPassword,
      providerType: providerType ?? this.providerType,
      providerName: providerName ?? this.providerName,
      apiBase: apiBase ?? this.apiBase,
      apiKey: apiKey ?? this.apiKey,
    );
  }
}

class SetupWizardScreen extends ConsumerStatefulWidget {
  const SetupWizardScreen({super.key});

  @override
  ConsumerState<SetupWizardScreen> createState() => _SetupWizardScreenState();
}

class _SetupWizardScreenState extends ConsumerState<SetupWizardScreen> {
  _WizardState _s = const _WizardState(step: _SetupStep.welcome);

  void _next() {
    final steps = _SetupStep.values;
    final idx = steps.indexOf(_s.step);
    if (idx < steps.length - 1) {
      setState(() => _s = _s.copyWith(step: steps[idx + 1]));
    }
  }

  void _back() {
    final steps = _SetupStep.values;
    final idx = steps.indexOf(_s.step);
    if (idx > 0) {
      setState(() => _s = _s.copyWith(step: steps[idx - 1]));
    }
  }

  Future<void> _finish() async {
    if (mounted) context.go('/');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _StepIndicator(current: _s.step),
            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: _buildStep(_s, context),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStep(_WizardState s, BuildContext context) {
    switch (s.step) {
      case _SetupStep.welcome:
        return _WelcomeStep(onNext: _next);
      case _SetupStep.password:
        return _PasswordStep(
          state: s,
          onChange: (ns) => setState(() => _s = ns),
          onBack: _back,
          onNext: _next,
        );
      case _SetupStep.provider:
        return _ProviderStep(
          state: s,
          onChange: (ns) => setState(() => _s = ns),
          onBack: _back,
          onFinish: _finish,
        );
      case _SetupStep.done:
        return _DoneStep(onFinish: _finish);
    }
  }
}

class _StepIndicator extends StatelessWidget {
  const _StepIndicator({required this.current});
  final _SetupStep current;

  @override
  Widget build(BuildContext context) {
    final steps = _SetupStep.values;
    final idx = steps.indexOf(current);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Row(
        children: List.generate(steps.length, (i) {
          final isDone = i < idx;
          final isCurrent = i == idx;
          return Expanded(
            child: Container(
              margin: EdgeInsets.only(right: i == steps.length - 1 ? 0 : 6),
              height: 4,
              decoration: BoxDecoration(
                color: isCurrent || isDone
                    ? Theme.of(context).colorScheme.primary
                    : Theme.of(context).colorScheme.outlineVariant,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          );
        }),
      ),
    );
  }
}

class _WelcomeStep extends StatelessWidget {
  const _WelcomeStep({required this.onNext});
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return _StepFrame(
      title: 'Setupwelcometitle',
      subtitle: 'Setupwelcomedesc',
      actions: [
        FilledButton(onPressed: onNext, child: Text('Commoncontinue')),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Bullet(text: 'Setupbulletprivacy'),
          _Bullet(text: 'Setupbulletlocal'),
          _Bullet(text: 'Setupbulletopen'),
        ],
      ),
    );
  }
}

class _PasswordStep extends StatefulWidget {
  const _PasswordStep({
    required this.state,
    required this.onChange,
    required this.onBack,
    required this.onNext,
  });
  final _WizardState state;
  final ValueChanged<_WizardState> onChange;
  final VoidCallback onBack;
  final VoidCallback onNext;

  @override
  State<_PasswordStep> createState() => _PasswordStepState();
}

class _PasswordStepState extends State<_PasswordStep> {
  String? _error;

  bool get _canProceed =>
      widget.state.password.length >= 8 &&
      widget.state.password == widget.state.confirmPassword;

  void _submit() {
    if (!_canProceed) {
      setState(() {
        _error = widget.state.password.length < 8
            ? 'Password must be at least 8 characters'
            : 'Passwords do not match';
      });
      return;
    }
    widget.onNext();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return _StepFrame(
      title: 'Setuppasswordtitle',
      subtitle: 'Setuppassworddesc',
      actions: [
        OutlinedButton(onPressed: widget.onBack, child: Text('Commonback')),
        const SizedBox(width: 8),
        FilledButton(onPressed: _submit, child: Text('Commoncontinue')),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            obscureText: true,
            decoration: InputDecoration(
              labelText: 'Setuppasswordlabel',
              border: const OutlineInputBorder(),
            ),
            onChanged: (v) => widget.onChange(widget.state.copyWith(password: v)),
          ),
          const SizedBox(height: 12),
          TextField(
            obscureText: true,
            decoration: InputDecoration(
              labelText: 'Setuppasswordconfirm',
              border: const OutlineInputBorder(),
            ),
            onChanged: (v) =>
                widget.onChange(widget.state.copyWith(confirmPassword: v)),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
        ],
      ),
    );
  }
}

class _ProviderStep extends StatefulWidget {
  const _ProviderStep({
    required this.state,
    required this.onChange,
    required this.onBack,
    required this.onFinish,
  });
  final _WizardState state;
  final ValueChanged<_WizardState> onChange;
  final VoidCallback onBack;
  final VoidCallback onFinish;

  @override
  State<_ProviderStep> createState() => _ProviderStepState();
}

class _ProviderStepState extends State<_ProviderStep> {
  String? _hint;

  void _save() {
    if (widget.state.providerName.trim().isEmpty ||
        widget.state.apiBase.trim().isEmpty) {
      setState(() => _hint = 'Provider name and API base are required');
      return;
    }
    widget.onFinish();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return _StepFrame(
      title: 'Setupprovidertitle',
      subtitle: 'Setupproviderdesc',
      actions: [
        OutlinedButton(onPressed: widget.onBack, child: Text('Commonback')),
        const SizedBox(width: 8),
        FilledButton(onPressed: _save, child: Text('Commonfinish')),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DropdownButtonFormField<String>(
            value: widget.state.providerType,
            decoration: InputDecoration(
              labelText: 'Setupprovidertype',
              border: const OutlineInputBorder(),
            ),
            items: const [
              DropdownMenuItem(value: 'openai', child: Text('OpenAI')),
              DropdownMenuItem(value: 'anthropic', child: Text('Anthropic')),
              DropdownMenuItem(value: 'ollama', child: Text('Ollama (local)')),
              DropdownMenuItem(value: 'minimax', child: Text('MiniMax')),
              DropdownMenuItem(value: 'deepseek', child: Text('DeepSeek')),
              DropdownMenuItem(value: 'custom', child: Text('Custom')),
            ],
            onChanged: (v) {
              if (v == null) return;
              widget.onChange(widget.state.copyWith(providerType: v));
            },
          ),
          const SizedBox(height: 12),
          TextField(
            decoration: InputDecoration(
              labelText: 'Setupprovidername',
              hintText: 'My Provider',
              border: const OutlineInputBorder(),
            ),
            onChanged: (v) =>
                widget.onChange(widget.state.copyWith(providerName: v)),
          ),
          const SizedBox(height: 12),
          TextField(
            decoration: InputDecoration(
              labelText: 'Setupproviderapibase',
              hintText: 'https://api.openai.com/v1',
              border: const OutlineInputBorder(),
            ),
            onChanged: (v) =>
                widget.onChange(widget.state.copyWith(apiBase: v)),
          ),
          const SizedBox(height: 12),
          TextField(
            obscureText: true,
            decoration: InputDecoration(
              labelText: 'Setupproviderapikey',
              hintText: 'sk-...',
              border: const OutlineInputBorder(),
            ),
            onChanged: (v) =>
                widget.onChange(widget.state.copyWith(apiKey: v)),
          ),
          if (_hint != null) ...[
            const SizedBox(height: 12),
            Text(
              _hint!,
              style: TextStyle(color: Theme.of(context).colorScheme.primary),
            ),
          ],
        ],
      ),
    );
  }
}

class _DoneStep extends StatelessWidget {
  const _DoneStep({required this.onFinish});
  final VoidCallback onFinish;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return _StepFrame(
      title: 'Setupdonetitle',
      subtitle: 'Setupdonedesc',
      actions: [
        FilledButton.icon(
          onPressed: onFinish,
          icon: const Icon(Icons.arrow_forward),
          label: Text('Setupdoneaction'),
        ),
      ],
      child: const Icon(Icons.check_circle, size: 64, color: Colors.green),
    );
  }
}

class _StepFrame extends StatelessWidget {
  const _StepFrame({
    required this.title,
    required this.subtitle,
    required this.child,
    required this.actions,
  });
  final String title;
  final String subtitle;
  final Widget child;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          Text(
            subtitle,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
          const SizedBox(height: 24),
          Expanded(
            child: SingleChildScrollView(child: child),
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: actions,
          ),
        ],
      ),
    );
  }
}

class _Bullet extends StatelessWidget {
  const _Bullet({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: 4, right: 8),
            child: Icon(Icons.check_circle_outline, size: 16),
          ),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }
}
