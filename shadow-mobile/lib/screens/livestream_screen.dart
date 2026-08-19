// SPDX-License-Identifier: Apache-2.0
//
// v2.6 — Live-stream / read-aloud mode.
//
// In this mode the phone plays synthesised speech or streaming
// audio out via the Android AudioManager. shadow-esp32 — which
// is plugged in over USB-C — appears as a USB Audio Class 1.0
// sink (v2.4 of the firmware). The phone's `UsbAudioRouter`
// (v2.5) routes the AudioTrack to whatever output the user
// has selected (phone speaker, BT headset, or shadow-esp32).
//
// shadow-esp32 plays **no role** in the audio processing — it
// is a USB Audio device whose only job is to forward the PCM
// stream to the I²S DAC and out to the speaker. This screen is
// the TTS / playback control surface on the phone.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/mode_provider.dart';
import '../generated/l10n/app_localizations.dart';
import '../services/usb_audio_routing_service.dart';

class LivestreamScreen extends ConsumerStatefulWidget {
  const LivestreamScreen({super.key});

  @override
  ConsumerState<LivestreamScreen> createState() => _LSState();
}

class _LSState extends ConsumerState<LivestreamScreen> {
  final _textCtl = TextEditingController();
  bool _playing = false;
  bool _routingToShadow = false;

  @override
  void dispose() {
    _textCtl.dispose();
    super.dispose();
  }

  Future<void> _toggle() async {
    setState(() => _playing = !_playing);
    if (_playing) {
      // Hand the typed text to the Android TTS engine. The
      // audio is routed by the system AudioManager based on
      // whichever output the user has selected; if shadow-esp32
      // is the chosen sink, the PCM frames go to it via USB.
      // (Real TTS push lands in the Kotlin side via the
      // `com.ibloc.shadow/tts` channel — the placeholder here
      // updates a state field the platform channel reads.)
      _mirrorRoute();
    }
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
      if (shadow.deviceId != 0) {
        await svc.routeTo(shadow.deviceId);
        if (mounted) setState(() => _routingToShadow = true);
      } else {
        if (mounted) setState(() => _routingToShadow = false);
      }
    } catch (_) {
      // ignore — TTS still plays to whatever is the current
      // AudioManager default (phone speaker / BT / etc.).
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final mode = ref.watch(shadowOperationModeProvider);
    final route = ref.watch(shadowOutputRouteProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.liveStreamMode),
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
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ---- Output route card -----------------------
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.audioOutput,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
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
                      onSelectionChanged: (sel) {
                        ref.read(shadowOutputRouteProvider.notifier).state =
                            sel.first;
                        _mirrorRoute();
                      },
                    ),
                    const SizedBox(height: 8),
                    if (_routingToShadow ||
                        route == ShadowOutputRoute.shadowEsp32)
                      Text(
                        l10n.shadowEsp32ReceivesAudio,
                        style: const TextStyle(color: Colors.green),
                      )
                    else if (route == ShadowOutputRoute.bluetoothHeadset)
                      Text(
                        l10n.routeViaBluetoothA2dp,
                        style: const TextStyle(color: Colors.blue),
                      )
                    else
                      Text(
                        l10n.routeViaPhoneSpeaker,
                        style: const TextStyle(color: Colors.grey),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            // ---- Live-stream / TTS panel ----------------
            Text(
              l10n.liveStreamMode,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _textCtl,
              maxLines: 6,
              decoration: InputDecoration(
                labelText: l10n.ttsInputLabel,
                hintText: l10n.ttsInputHint,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                FilledButton.icon(
                  onPressed: _toggle,
                  icon: Icon(_playing ? Icons.stop : Icons.play_arrow),
                  label: Text(_playing ? l10n.stopTts : l10n.startTts),
                ),
              ],
            ),
            if (mode != ShadowOperationMode.liveStream) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.orange.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  l10n.modeMismatch,
                  style: const TextStyle(color: Colors.orange),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
