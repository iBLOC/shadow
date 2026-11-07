// SPDX-License-Identifier: Apache-2.0
//
// v2.8 — Smart customer service screen.
//
// shadow-esp32 mic → USB Audio IN → phone ASR → LLM → TTS →
// USB Audio OUT → shadow-esp32 speaker (local hears)
// + TTS → phone cellular TX → remote caller hears.
//
// The "smart" part: AI auto-answer toggle; LLM handles the
// conversation with the caller using shadow-esp32 mic as the
// primary audio source.
//
// No InCallService needed — the phone's native call UI handles
// the cellular call. The AI processing is a separate pipeline
// activated from this screen.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_ai_toolkit/flutter_ai_toolkit.dart';

import '../providers/ai/brain_llm_provider.dart';
import '../providers/mode_provider.dart';
import '../services/encephalon/encephalon_mobile_provider.dart';
import '../services/usb_audio_routing_service.dart';
import '../generated/l10n/app_localizations.dart';

class CustomerServiceScreen extends ConsumerStatefulWidget {
  const CustomerServiceScreen({super.key});

  @override
  ConsumerState<CustomerServiceScreen> createState() => _CSState();
}

class _CSState extends ConsumerState<CustomerServiceScreen> {
  bool _aiAutoAnswer = true;
  bool _routingToShadow = false;

  @override
  void initState() {
    super.initState();
    _mirrorRoute();
  }

  Future<void> _mirrorRoute() async {
    final svc = UsbAudioRoutingService();
    try {
      final routes = await svc.currentRoutes();
      final shadow = routes.firstWhere(
        (r) => r.isShadowEsp32,
        orElse: () => const UsbAudioRoute(
          deviceName: '',
          deviceId: 0,
          isUsb: false,
          isShadowEsp32: false,
        ),
      );
      if (shadow.deviceId != 0 && mounted) {
        await svc.routeTo(shadow.deviceId);
        setState(() => _routingToShadow = true);
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final route = ref.watch(shadowOutputRouteProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.customerServiceMode),
        actions: [
          IconButton(
            tooltip: l10n.openVoiceAssistant,
            icon: const Icon(Icons.mic),
            onPressed: () {
              ref.read(shadowOperationModeProvider.notifier).state =
                  ShadowOperationMode.voiceAssistant;
              context.go('/voice');
            },
          ),
          IconButton(
            tooltip: l10n.openLiveStreamMode,
            icon: const Icon(Icons.live_tv),
            onPressed: () {
              ref.read(shadowOperationModeProvider.notifier).state =
                  ShadowOperationMode.liveStream;
              context.go('/livestream');
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // ---- Status bar --------------------------
          _buildStatusBar(l10n, route),
          // ---- AI processing surface ----------------
          Expanded(
            child: LlmChatView(
              // 推理归 neuron 管 —— 进程内管线，本地/云端由大脑目录与路由决定。
              provider: BrainLlmProvider(
                service: ref.read(encephalonMobileServiceProvider),
                failureText: () => l10n.encephalonInferFailed,
                audioHint: () => l10n.voiceNoteBrainAsrPending,
              ),
              enableAttachments: true,
              enableVoiceNotes: true,
              welcomeMessage: l10n.customerServiceHint,
              suggestions: [l10n.whatCanYouHelp, l10n.howAudioWorks],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusBar(AppLocalizations l10n, ShadowOutputRoute route) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: Row(
        children: [
          // Mic indicator: shadow-esp32 mic as input
          if (_routingToShadow || route == ShadowOutputRoute.shadowEsp32)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.green.withOpacity(0.15),
                borderRadius: BorderRadius.circular(4),
                border: Border.all(color: Colors.green),
              ),
              child: const Text(
                'shadow-esp32 mic',
                style: TextStyle(color: Colors.green, fontSize: 12),
              ),
            ),
          const SizedBox(width: 12),
          // Speaker indicator
          Text(
            _routeLabel(route),
            style: TextStyle(
              color: route == ShadowOutputRoute.shadowEsp32
                  ? Colors.green
                  : Colors.grey,
              fontSize: 12,
            ),
          ),
          const Spacer(),
          // AI auto-answer toggle
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(l10n.aiAutoAnswer, style: const TextStyle(fontSize: 12)),
              Switch(
                value: _aiAutoAnswer,
                onChanged: (v) => setState(() => _aiAutoAnswer = v),
                activeThumbColor: Colors.green,
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _routeLabel(ShadowOutputRoute r) {
    return switch (r) {
      ShadowOutputRoute.phoneSpeaker => 'Phone speaker',
      ShadowOutputRoute.bluetoothHeadset => 'BT',
      ShadowOutputRoute.shadowEsp32 => 'shadow-esp32 speaker',
    };
  }
}
