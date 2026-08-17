// SPDX-License-Identifier: Apache-2.0
//
// v2.8 — Smart customer service screen.
//
// This is the third mode (alongside voiceAssistant and
// liveStream). The phone detects incoming/outgoing cellular
// calls, routes audio to shadow-esp32 via USB Audio, and lets
// an LLM answer the call automatically (or a human take over
// via wired earphone).
//
// When a call is active:
//   - Call RX (caller voice) → phone → USB Audio OUT →
//     shadow-esp32 → speaker (room hears the caller)
//   - shadow-esp32 mic → USB Audio IN → phone ASR → LLM →
//     TTS → phone TX → caller hears AI answer
//
// When a wired earphone is plugged in:
//   - Android auto-routes call TX/RX to earphone (human takeover)
//   - shadow-esp32 becomes silent (bypassed)

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/mode_provider.dart';
import '../services/call_routing_service.dart';
import '../generated/l10n/app_localizations.dart';

class CustomerServiceScreen extends ConsumerStatefulWidget {
  const CustomerServiceScreen({super.key});

  @override
  ConsumerState<CustomerServiceScreen> createState() => _CSState();
}

class _CSState extends ConsumerState<CustomerServiceScreen> {
  CallState _callState = CallState.idle;
  late final CallRoutingService _callService;
  StreamSubscription<CallState>? _callSub;

  @override
  void initState() {
    super.initState();
    _callService = ref.read(callRoutingServiceProvider);
    _callSub = _callService.stateStream.listen((state) {
      if (mounted) setState(() => _callState = state);
    });
  }

  @override
  void dispose() {
    _callSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final route = ref.watch(shadowOutputRouteProvider);
    final isEarphone = ref.watch(isEarphoneTakeoverProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.customerServiceMode),
        actions: [
          IconButton(
            tooltip: l10n.openVoiceMode,
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
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ---- Call state card ----------------------------
            _buildCallStateCard(l10n, isEarphone),
            const SizedBox(height: 16),

            // ---- Audio output selector -----------------------
            _buildAudioOutputCard(l10n, route, isEarphone),
            const SizedBox(height: 16),

            // ---- AI auto-answer toggle -----------------------
            _buildAiToggleCard(l10n),
            const SizedBox(height: 16),

            // ---- Route indicator -----------------------------
            if (route == ShadowOutputRoute.shadowEsp32)
              Text(
                l10n.shadowEsp32ReceivesAudio,
                style: const TextStyle(color: Colors.green),
              )
            else if (route == ShadowOutputRoute.bluetoothHeadset)
              Text(l10n.routeViaBluetoothA2dp,
                  style: const TextStyle(color: Colors.blue))
            else
              Text(l10n.routeViaPhoneSpeaker,
                  style: const TextStyle(color: Colors.grey)),
          ],
        ),
      ),
    );
  }

  Widget _buildCallStateCard(AppLocalizations l10n, bool isEarphone) {
    final stateLabel = switch (_callState) {
      CallState.idle => l10n.callStateIdle,
      CallState.ringing => l10n.callStateRinging,
      CallState.active => l10n.callStateActive,
      CallState.ended => l10n.callStateEnded,
    };
    final stateColor = switch (_callState) {
      CallState.idle => Colors.grey,
      CallState.ringing => Colors.orange,
      CallState.active => Colors.green,
      CallState.ended => Colors.red,
    };
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(l10n.callState, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: stateColor.withOpacity(0.15),
              borderRadius: BorderRadius.circular(4),
              border: Border.all(color: stateColor, width: 1),
            ),
            child: Text(stateLabel, style: TextStyle(color: stateColor)),
          ),
          if (isEarphone) ...[
            const SizedBox(height: 8),
            Text(l10n.earphoneTakeoverActive,
                style: const TextStyle(color: Colors.orange)),
          ],
          if (_callState == CallState.ringing) ...[
            const SizedBox(height: 8),
            FilledButton.icon(
              onPressed: () => _callService.endCall(),
              icon: const Icon(Icons.call_end),
              label: Text(l10n.endCall),
            ),
          ],
        ]),
      ),
    );
  }

  Widget _buildAudioOutputCard(
      AppLocalizations l10n, ShadowOutputRoute route, bool isEarphone) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(l10n.audioOutput, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          SegmentedButton<ShadowOutputRoute>(
            segments: const [
              ButtonSegment(
                value: ShadowOutputRoute.phoneSpeaker,
                label: Text('Phone'),
                icon: Icon(Icons.phone_iphone),
              ),
              ButtonSegment(
                value: ShadowOutputRoute.bluetoothHeadset,
                label: Text('BT'),
                icon: Icon(Icons.bluetooth_audio),
              ),
              ButtonSegment(
                value: ShadowOutputRoute.shadowEsp32,
                label: Text('shadow-esp32'),
                icon: Icon(Icons.speaker),
              ),
            ],
            selected: {route},
            onSelectionChanged: (sel) async {
              final newRoute = sel.first!;
              ref.read(shadowOutputRouteProvider.notifier).state = newRoute;
              await _callService.setPreferredDevice(newRoute);
            },
          ),
          if (isEarphone) ...[
            const SizedBox(height: 8),
            Text(l10n.earphoneTakeoverAudioRouteNote,
                style: const TextStyle(fontSize: 12)),
          ],
        ]),
      ),
    );
  }

  Widget _buildAiToggleCard(AppLocalizations l10n) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.aiAutoAnswer,
                    style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 4),
                Text(l10n.aiAutoAnswerDesc,
                    style: const TextStyle(fontSize: 12, color: Colors.grey)),
              ],
            ),
          ),
          Switch(
            value: true, // v2.8: AI auto-answer is always on
            onChanged: (v) => _callService.setAiAutoAnswer(v),
          ),
        ]),
      ),
    );
  }
}
