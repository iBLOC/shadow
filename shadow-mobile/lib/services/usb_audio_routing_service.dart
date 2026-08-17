// SPDX-License-Identifier: Apache-2.0
//
// v2.4 — USB Audio device detection and routing on Android.
//
// The phone, when it has the shadow-esp32 plugged in over USB-C,
// needs to route audio output to "USB Audio Device" (the UAC1
// sink that shadow-esp32 exposes). Android exposes the active
// routing through `AudioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)`;
// we wrap that as a Riverpod notifier so the live-streaming
// screen can detect "shadow-esp32 is plugged in" and switch the
// routing automatically.
//
// Android 7+ supports USB Audio Class 1.0/2.0 natively — we
// don't have to ask for any special permission, just call
// `setSpeakerphoneOn(false)` (so the earpiece isn't used) and
// query the active output device.

import 'dart:async';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class UsbAudioRoute {
  final String deviceName;
  final int deviceId;
  final bool isUsb;
  final bool isShadowEsp32;

  const UsbAudioRoute({
    required this.deviceName,
    required this.deviceId,
    required this.isUsb,
    required this.isShadowEsp32,
  });
}

class UsbAudioRoutingService {
  static const MethodChannel _channel =
      MethodChannel('com.ibloc.shadow/usb_audio');

  /// Returns the list of currently-available output devices with
  /// the shadow-esp32 entry flagged. v2.4 of the Kotlin side
  /// (see `UsbAudioRoute.kt` in `android/app/src/main/kotlin/`)
  /// exposes the list of USB audio sinks via a platform channel.
  Future<List<UsbAudioRoute>> currentRoutes() async {
    final raw = await _channel.invokeMethod<List<dynamic>>('listRoutes');
    if (raw == null) return [];
    return raw.map((e) {
      final map = e as Map<dynamic, dynamic>;
      final name = (map['name'] as String?) ?? '';
      return UsbAudioRoute(
        deviceName: name,
        deviceId: (map['id'] as int?) ?? 0,
        isUsb: (map['isUsb'] as bool?) ?? false,
        isShadowEsp32: name.contains('shadow-esp32'),
      );
    }).toList();
  }

  /// Tell the Android `AudioManager` to route output to a specific
  /// device. Used by the live-streaming screen to flip to the
  /// shadow-esp32 USB sink the moment the user plugs it in. */
  Future<void> routeTo(int deviceId) async {
    await _channel.invokeMethod('routeTo', {'id': deviceId});
  }
}

final usbAudioRoutesProvider = StreamProvider<List<UsbAudioRoute>>((ref) async* {
  final svc = UsbAudioRoutingService();
  while (true) {
    try {
      final routes = await svc.currentRoutes();
      yield routes;
    } catch (_) {
      yield [];
    }
    await Future.delayed(const Duration(seconds: 1));
  }
});
