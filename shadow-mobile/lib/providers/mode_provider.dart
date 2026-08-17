// SPDX-License-Identifier: Apache-2.0
//
// v2.8 — Mode provider for three runtime shapes:
//   1. liveStream — phone TTS to shadow-esp32 (one-way)
//   2. voiceAssistant — bi-directional voice with LLM
//   3. customerService — phone call with AI auto-answer
//
// All three modes use the same shadow-esp32 USB Audio sink.
// The difference is which audio sources are active and whether
// the phone's cellular call is involved.

import 'package:flutter_riverpod/flutter_riverpod.dart';

enum ShadowOperationMode {
  /// Phone hosts TTS playback. shadow-esp32 is USB Audio sink.
  liveStream,

  /// Phone runs ASR + LLM + TTS. shadow-esp32 is USB Audio sink + mic source.
  voiceAssistant,

  /// Phone answers cellular calls with AI auto-reply.
  /// Shadow-esp32 is USB Audio sink (caller voice + AI TTS).
  /// Human can takeover with wired earphone.
  customerService,
}

enum ShadowOutputRoute {
  /// Built-in phone speaker or wired headset.
  phoneSpeaker,

  /// Bluetooth A2DP output.
  bluetoothHeadset,

  /// shadow-esp32 USB Audio Class 1.0 sink.
  shadowEsp32,
}

/// Current mode.
final shadowOperationModeProvider =
    StateProvider<ShadowOperationMode>(
  (ref) => ShadowOperationMode.customerService,
);

/// Current output route.
final shadowOutputRouteProvider =
    StateProvider<ShadowOutputRoute>(
  (ref) => ShadowOutputRoute.shadowEsp32,
);

/// Is the phone in a call? Updated by InCallService on Android.
final isPhoneCallActiveProvider = StateProvider<bool>(
  (ref) => false,
);

/// Has the wired earphone takeover happened?
final isEarphoneTakeoverProvider = StateProvider<bool>(
  (ref) => false,
);
