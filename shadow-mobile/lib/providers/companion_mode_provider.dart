import 'dart:async';
import 'dart:typed_data';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../services/audio_ws_service.dart';

enum CompanionMode { off, connecting, connected, streaming }

enum VoiceState { idle, listening, speaking }

class CompanionState {
  final CompanionMode mode;
  final VoiceState voiceState;
  final String? errorMessage;
  final bool isMuted;
  final String? sessionId;

  const CompanionState({
    this.mode = CompanionMode.off,
    this.voiceState = VoiceState.idle,
    this.errorMessage,
    this.isMuted = false,
    this.sessionId,
  });

  CompanionState copyWith({
    CompanionMode? mode,
    VoiceState? voiceState,
    String? errorMessage,
    bool? isMuted,
    String? sessionId,
  }) {
    return CompanionState(
      mode: mode ?? this.mode,
      voiceState: voiceState ?? this.voiceState,
      errorMessage: errorMessage,
      isMuted: isMuted ?? this.isMuted,
      sessionId: sessionId ?? this.sessionId,
    );
  }
}

class CompanionModeNotifier extends StateNotifier<CompanionState> {
  RTCPeerConnection? _peerConnection;
  MediaStream? _localStream;
  final String? _baseUrl;
  final AudioWsService? _audioService;

  final _transcriptionController = StreamController<String>.broadcast();
  Stream<String> get transcriptionStream => _transcriptionController.stream;

  CompanionModeNotifier({String? baseUrl, AudioWsService? audioService})
    : _baseUrl = baseUrl,
      _audioService = audioService,
      super(const CompanionState());

  Future<bool> connect(String sessionId) async {
    state = state.copyWith(
      mode: CompanionMode.connecting,
      sessionId: sessionId,
    );

    try {
      _localStream = await _createLocalStream();
      await _createPeerConnection();
      state = state.copyWith(mode: CompanionMode.connected);
      return true;
    } catch (e) {
      state = state.copyWith(
        mode: CompanionMode.off,
        errorMessage: e.toString(),
      );
      return false;
    }
  }

  Future<MediaStream> _createLocalStream() async {
    final audioConstraints = {
      'echoCancellation': true,
      'noiseSuppression': true,
      'autoGainControl': true,
    };

    return await navigator.mediaDevices.getUserMedia({
      'audio': audioConstraints,
      'video': false,
    });
  }

  Future<void> _createPeerConnection() async {
    final config = {
      'iceServers': [
        {'urls': 'stun:stun.l.google.com:19302'},
        {'urls': 'stun:stun1.l.google.com:19302'},
      ],
    };

    _peerConnection = await createPeerConnection(config);

    _peerConnection!.onTrack = (RTCTrackEvent event) {
      if (event.streams.isNotEmpty) {
        _handleRemoteStream(event.streams[0]);
      }
    };

    _peerConnection!.onIceCandidate = (RTCIceCandidate candidate) {
      _sendIceCandidate(candidate);
    };

    _peerConnection!.onConnectionState = (RTCPeerConnectionState rtcState) {
      switch (rtcState) {
        case RTCPeerConnectionState.RTCPeerConnectionStateConnected:
          state = state.copyWith(mode: CompanionMode.connected);
          break;
        case RTCPeerConnectionState.RTCPeerConnectionStateDisconnected:
          state = state.copyWith(mode: CompanionMode.off);
          break;
        case RTCPeerConnectionState.RTCPeerConnectionStateFailed:
          state = state.copyWith(
            mode: CompanionMode.off,
            errorMessage: 'Connection failed',
          );
          break;
        default:
          break;
      }
    };

    if (_localStream != null) {
      for (final track in _localStream!.getTracks()) {
        _peerConnection!.addTrack(track, _localStream!);
      }
    }
  }

  void _handleRemoteStream(MediaStream stream) {
    final audioTracks = stream.getAudioTracks();
    if (audioTracks.isNotEmpty) {
      state = state.copyWith(voiceState: VoiceState.speaking);
    }
  }

  void _sendIceCandidate(RTCIceCandidate candidate) {}

  Future<void> startStreaming() async {
    if (_peerConnection == null || _localStream == null) return;

    try {
      final offer = await _peerConnection!.createOffer();
      await _peerConnection!.setLocalDescription(offer);
      state = state.copyWith(mode: CompanionMode.streaming);
    } catch (e) {
      state = state.copyWith(errorMessage: e.toString());
    }
  }

  Future<void> stop() async {
    await _localStream?.dispose();
    await _peerConnection?.close();

    _localStream = null;
    _peerConnection = null;

    state = state.copyWith(
      mode: CompanionMode.off,
      voiceState: VoiceState.idle,
      sessionId: null,
    );
  }

  void toggleMute() {
    if (_localStream == null) return;

    for (final track in _localStream!.getAudioTracks()) {
      track.enabled = !track.enabled;
    }

    state = state.copyWith(isMuted: !state.isMuted);
  }

  void sendAudioData(Uint8List data) {
    _audioService?.sendAudioData(data);
  }

  MediaStream? get localStream => _localStream;

  @override
  void dispose() {
    stop();
    _transcriptionController.close();
    super.dispose();
  }
}

final companionModeProvider =
    StateNotifierProvider<CompanionModeNotifier, CompanionState>((ref) {
      return CompanionModeNotifier();
    });
