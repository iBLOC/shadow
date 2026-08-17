// SPDX-License-Identifier: Apache-2.0
//
// v2.8 — Call routing service for the smart customer service mode.
//
// Wraps the Android InCallService (call routing, USB/earphone
// switching) behind a Flutter PlatformChannel so the
// customer_service_screen can observe call state and manage
// audio routing from Dart.

import 'dart:async';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/mode_provider.dart';

enum CallState {
  idle,
  ringing,
  active,
  ended,
}

class CallRoutingService {
  static const _channel = MethodChannel('com.ibloc.shadow/call_state');

  final _stateStream = StreamController<CallState>.broadcast();
  Stream<CallState> get stateStream => _stateStream.stream;

  bool _isAiMode = true; // AI auto-answer by default

  CallRoutingService() {
    _channel.setMethodCallHandler(_handleMethod);
  }

  Future<dynamic> _handleMethod(MethodCall call) async {
    final args = call.arguments as Map<String, dynamic>;
    switch (call.method) {
      case 'onCallState':
        final state = args['state'] as String;
        final callState = CallState.values.firstWhere(
          (s) => s.name == state,
          orElse: () => CallState.idle,
        );
        _stateStream.add(callState);
        break;
      case 'onEarphoneTakeover':
        final taken = args['taken'] as bool;
        ref.read(isEarphoneTakeoverProvider.notifier).state = taken;
        break;
    }
  }

  Future<void> setAiAutoAnswer(bool enabled) async {
    _isAiMode = enabled;
    await _channel.invokeMethod('setAiAutoAnswer', {'enabled': enabled});
  }

  Future<void> endCall() async {
    await _channel.invokeMethod('endCall');
  }

  Future<void> setPreferredDevice(ShadowOutputRoute route) async {
    final deviceName = route == ShadowOutputRoute.shadowEsp32
        ? 'shadow-esp32'
        : route == ShadowOutputRoute.bluetoothHeadset
            ? 'bluetooth'
            : 'phone';
    await _channel.invokeMethod('setPreferredDevice', {'device': deviceName});
  }

  void dispose() {
    _stateStream.close();
    _channel.setMethodCallHandler(null);
  }
}

final callRoutingServiceProvider = Provider<CallRoutingService>((ref) {
  final svc = CallRoutingService();
  ref.onDispose(() => svc.dispose());
  return svc;
});
