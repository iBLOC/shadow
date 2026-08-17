// SPDX-License-Identifier: Apache-2.0
//
// v2.6 — Mode provider for the two main runtime shapes the
// mobile app supports. The Provider holds the current
// `ShadowOperationMode` (live-stream or voice-assistant) and
// the audio output device (`ShadowOutputRoute`). Other widgets
// read these to switch between the digital-human live-streaming
// screen and the existing voice-conversation screen, and to
// pick where the synthesised audio lands (phone speaker, BLE
// headset, or shadow-esp32 USB).

import 'package:flutter_riverpod/flutter_riverpod.dart';

enum ShadowOperationMode {
  /// Phone hosts the digital human avatar; TTS audio is pushed
  /// to shadow-esp32 over USB Audio. The lib/widgets/live2d
  /// and lib/screens/digital_human_screen.dart pair implement
  /// this end.
  liveStream,

  /// Phone is a passive voice assistant: mic capture (I²S) on
  /// shadow-esp32 → ASR → LLM (cortex or on-device LiteRT) →
  /// TTS → shadow-esp32 USB Audio → speaker. The existing
  /// `voice_conversation_screen.dart` is the UI surface.
  voiceAssistant,
}

enum ShadowOutputRoute {
  /// Built-in phone speaker or wired headset.
  phoneSpeaker,

  /// Bluetooth A2DP output. shadow-mobile routes the stream
  /// through the system AudioManager. The pair happens on
  /// Settings → Bluetooth on the phone; shadow-esp32 is not
  /// involved in pairing.
  bluetoothHeadset,

  /// shadow-esp32 USB Audio Class 1.0 sink. v2.4 of the firmware
  /// enumerates as a USB audio device; v2.5 of mobile routes
  /// there via `UsbAudioRouter.routeTo`.
  shadowEsp32,
}

final shadowOperationModeProvider =
    StateProvider<ShadowOperationMode>(
  (ref) => ShadowOperationMode.voiceAssistant,
);

final shadowOutputRouteProvider =
    StateProvider<ShadowOutputRoute>(
  (ref) => ShadowOutputRoute.shadowEsp32,
);
