import 'dart:async';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import 'webrtc_signaling.dart';

/// Phase of the WebRTC companion lifecycle.
enum WebRtcPhase {
  idle,
  connecting,
  signaling,
  negotiating,
  connected,
  streaming,
  speaking,
  error,
}

/// RTCPeerConnection wrapper that drives a Companion Mode session
/// against a Prefrontal agent. Mirrors the desktop's
/// `webrtcCompanion.ts` so the two clients share an end-to-end
/// protocol.
///
/// Audio path:
/// - Local mic is captured via `getUserMedia({audio: true})` and
///   sent as Opus over the WebRTC peer connection.
/// - Remote audio (TTS response) is rendered via
///   `RTCVideoRenderer` with `audio: true`.
/// - VAD-driven barge-in is signalled over the same WebSocket.
///
/// Fallback behavior:
/// - If the primary signaling connection fails, the companion will
///   automatically try the fallback URL (default: prefrontal at :8082)
class WebRtcCompanion {
  RTCPeerConnection? _pc;
  MediaStream? _localStream;
  final RTCVideoRenderer _remoteRenderer = RTCVideoRenderer();

  final WebRtcSignaling _signaling;
  WebRtcPhase _phase = WebRtcPhase.idle;
  String? _error;
  StreamSubscription? _sigSub;
  bool _usedFallback = false;

  WebRtcCompanion({required WebRtcSignaling signaling})
    : _signaling = signaling;

  WebRtcPhase get phase => _phase;
  String? get error => _error;
  bool get usedFallback => _usedFallback;
  RTCVideoRenderer get remoteRenderer => _remoteRenderer;
  MediaStream? get localStream => _localStream;

  Future<bool> start({bool camera = false}) async {
    if (_phase != WebRtcPhase.idle && _phase != WebRtcPhase.error) return true;
    _setPhase(WebRtcPhase.connecting);

    try {
      await _remoteRenderer.initialize();

      _localStream = await navigator.mediaDevices.getUserMedia({
        'audio': {
          'echoCancellation': true,
          'noiseSuppression': true,
          'autoGainControl': true,
        },
        'video': camera,
      });

      _pc = await createPeerConnection({
        'iceServers': [
          {'urls': 'stun:stun.l.google.com:19302'},
        ],
        'sdpSemantics': 'unified-plan',
      });

      _wirePcHandlers(_pc!);

      for (final track in _localStream!.getTracks()) {
        await _pc!.addTrack(track, _localStream!);
      }

      final connected = await _signaling.connect();
      if (!connected) {
        throw StateError('signaling WebSocket failed to open (tried primary and fallback)');
      }
      _usedFallback = _signaling.usedFallback;

      _sigSub = _signaling.outbound.listen(_handleSignaling);

      final offer = await _pc!.createOffer({
        'offerToReceiveAudio': true,
        'offerToReceiveVideo': camera,
      });
      await _pc!.setLocalDescription(offer);
      _setPhase(WebRtcPhase.signaling);
      _signaling.sendOffer(offer.sdp ?? '');

      _setPhase(WebRtcPhase.negotiating);
      return true;
    } catch (e) {
      _error = e.toString();
      _setPhase(WebRtcPhase.error);
      await stop();
      return false;
    }
  }

  void _wirePcHandlers(RTCPeerConnection pc) {
    pc.onIceCandidate = (RTCIceCandidate c) {
      _signaling.sendIce(
        candidate: c.candidate ?? '',
        sdpMid: c.sdpMid,
        sdpMLineIndex: c.sdpMLineIndex,
      );
    };

    pc.onConnectionState = (RTCPeerConnectionState s) {
      switch (s) {
        case RTCPeerConnectionState.RTCPeerConnectionStateConnected:
          _setPhase(WebRtcPhase.connected);
          break;
        case RTCPeerConnectionState.RTCPeerConnectionStateDisconnected:
        case RTCPeerConnectionState.RTCPeerConnectionStateClosed:
          _setPhase(WebRtcPhase.idle);
          break;
        case RTCPeerConnectionState.RTCPeerConnectionStateFailed:
          _error = 'peer connection failed';
          _setPhase(WebRtcPhase.error);
          break;
        default:
          break;
      }
    };

    pc.onTrack = (RTCTrackEvent ev) {
      if (ev.streams.isNotEmpty) {
        _remoteRenderer.srcObject = ev.streams[0];
        _setPhase(WebRtcPhase.speaking);
      }
    };
  }

  void _handleSignaling(WebRtcSignal signal) {
    switch (signal.type) {
      case WebRtcSignalType.answer:
        final sdp = signal.data['sdp'] as String?;
        if (sdp != null && _pc != null) {
          _pc!.setRemoteDescription(RTCSessionDescription(sdp, 'answer'));
          _setPhase(WebRtcPhase.connected);
        }
        break;
      case WebRtcSignalType.ice:
        final candidate = signal.data['candidate'] as String?;
        if (candidate == null || _pc == null) return;
        _pc!.addCandidate(
          RTCIceCandidate(
            candidate,
            signal.data['sdp_mid'] as String?,
            signal.data['sdp_m_line_index'] as int?,
          ),
        );
        break;
      case WebRtcSignalType.connected:
      case WebRtcSignalType.disconnected:
      case WebRtcSignalType.vadState:
      case WebRtcSignalType.transcription:
      case WebRtcSignalType.audioFrame:
      case WebRtcSignalType.bargeIn:
      case WebRtcSignalType.error:
      case WebRtcSignalType.offer:
        break;
    }
  }

  void sendBargeIn() {
    _signaling.sendBargeIn();
  }

  void toggleMic(bool muted) {
    if (_localStream == null) return;
    for (final t in _localStream!.getAudioTracks()) {
      t.enabled = !muted;
    }
  }

  Future<void> stop() async {
    await _sigSub?.cancel();
    _sigSub = null;
    for (final t in _localStream?.getTracks() ?? const <MediaStreamTrack>[]) {
      await t.stop();
    }
    await _localStream?.dispose();
    _localStream = null;
    await _pc?.close();
    _pc = null;
    await _remoteRenderer.dispose();
    _setPhase(WebRtcPhase.idle);
  }

  void _setPhase(WebRtcPhase p) {
    _phase = p;
  }
}
