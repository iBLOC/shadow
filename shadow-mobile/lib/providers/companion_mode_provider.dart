import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/webrtc_companion.dart';
import '../services/webrtc_signaling.dart';

enum VoiceState { idle, listening, speaking, bargeIn }

class CompanionState {
  final WebRtcPhase phase;
  final VoiceState voiceState;
  final bool isMuted;
  final String? sessionId;
  final String? lastTranscript;
  final String? errorMessage;

  const CompanionState({
    this.phase = WebRtcPhase.idle,
    this.voiceState = VoiceState.idle,
    this.isMuted = false,
    this.sessionId,
    this.lastTranscript,
    this.errorMessage,
  });

  CompanionState copyWith({
    WebRtcPhase? phase,
    VoiceState? voiceState,
    bool? isMuted,
    String? sessionId,
    String? lastTranscript,
    String? errorMessage,
    bool clearError = false,
  }) {
    return CompanionState(
      phase: phase ?? this.phase,
      voiceState: voiceState ?? this.voiceState,
      isMuted: isMuted ?? this.isMuted,
      sessionId: sessionId ?? this.sessionId,
      lastTranscript: lastTranscript ?? this.lastTranscript,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

class CompanionModeNotifier extends StateNotifier<CompanionState> {
  WebRtcCompanion? _companion;
  WebRtcSignaling? _signaling;
  StreamSubscription? _vadSub;
  StreamSubscription? _transcriptionSub;
  StreamSubscription? _connectedSub;
  StreamSubscription? _disconnectedSub;
  StreamSubscription? _errorSub;

  CompanionModeNotifier() : super(const CompanionState());

  Future<bool> start({required String sessionId, String? baseUrl}) async {
    if (state.phase == WebRtcPhase.connected ||
        state.phase == WebRtcPhase.negotiating ||
        state.phase == WebRtcPhase.streaming) {
      return true;
    }

    state = state.copyWith(
      phase: WebRtcPhase.connecting,
      sessionId: sessionId,
      clearError: true,
    );

    try {
      _signaling = WebRtcSignaling(sessionId: sessionId, baseUrl: baseUrl);
      _companion = WebRtcCompanion(signaling: _signaling!);

      _wireSignalingStreams();

      final ok = await _companion!.start();
      if (!ok) {
        state = state.copyWith(
          phase: WebRtcPhase.error,
          errorMessage: _companion!.error ?? 'start failed',
        );
        return false;
      }
      return true;
    } catch (e) {
      state = state.copyWith(
        phase: WebRtcPhase.error,
        errorMessage: e.toString(),
      );
      return false;
    }
  }

  void _wireSignalingStreams() {
    final s = _signaling!;
    _vadSub?.cancel();
    _vadSub = s.vad.listen((v) {
      switch (v) {
        case 'speaking':
        case 'listening':
        case 'barge_in':
          state = state.copyWith(voiceState: _mapVad(v));
          break;
        default:
          state = state.copyWith(voiceState: VoiceState.idle);
      }
    });

    _transcriptionSub?.cancel();
    _transcriptionSub = s.transcription.listen((text) {
      if (text.isNotEmpty) {
        state = state.copyWith(lastTranscript: text);
      }
    });

    _connectedSub?.cancel();
    _connectedSub = s.connected.listen((_) {
      state = state.copyWith(phase: WebRtcPhase.connected);
    });

    _disconnectedSub?.cancel();
    _disconnectedSub = s.disconnected.listen((_) {
      state = state.copyWith(phase: WebRtcPhase.idle);
    });

    _errorSub?.cancel();
    _errorSub = s.error.listen((e) {
      state = state.copyWith(errorMessage: e, phase: WebRtcPhase.error);
    });
  }

  VoiceState _mapVad(String v) {
    switch (v) {
      case 'speaking':
        return VoiceState.speaking;
      case 'listening':
        return VoiceState.listening;
      case 'barge_in':
        return VoiceState.bargeIn;
      default:
        return VoiceState.idle;
    }
  }

  void toggleMute() {
    if (_companion == null) return;
    final next = !state.isMuted;
    _companion!.toggleMic(next);
    state = state.copyWith(isMuted: next);
  }

  void bargeIn() {
    _companion?.sendBargeIn();
    state = state.copyWith(voiceState: VoiceState.bargeIn);
  }

  Future<void> stop() async {
    await _vadSub?.cancel();
    await _transcriptionSub?.cancel();
    await _connectedSub?.cancel();
    await _disconnectedSub?.cancel();
    await _errorSub?.cancel();
    _vadSub = _transcriptionSub = _connectedSub = _disconnectedSub = _errorSub =
        null;

    await _companion?.stop();
    _companion = null;
    await _signaling?.dispose();
    _signaling = null;

    state = state.copyWith(
      phase: WebRtcPhase.idle,
      voiceState: VoiceState.idle,
      sessionId: null,
    );
  }

  @override
  void dispose() {
    stop();
    super.dispose();
  }
}

final companionModeProvider =
    StateNotifierProvider<CompanionModeNotifier, CompanionState>(
      (ref) => CompanionModeNotifier(),
    );
