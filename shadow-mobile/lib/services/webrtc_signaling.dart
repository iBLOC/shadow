import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';

/// WebRTC signaling message types exchanged with Prefrontal.
///
/// Mirrors the desktop `webrtcCompanion.ts` wire format and the
/// `WsMessage` enum in `prefrontal/src/server/websocket.rs`.
enum WebRtcSignalType {
  offer,
  answer,
  ice,
  bargeIn,
  connected,
  disconnected,
  vadState,
  transcription,
  audioFrame,
  error,
}

class WebRtcSignal {
  final WebRtcSignalType type;
  final Map<String, dynamic> data;
  const WebRtcSignal(this.type, this.data);

  factory WebRtcSignal.fromJson(Map<String, dynamic> json) {
    final raw = (json['type'] as String?) ?? '';
    final type = WebRtcSignalType.values.firstWhere(
      (t) => _wireName(t) == raw,
      orElse: () => WebRtcSignalType.error,
    );
    return WebRtcSignal(type, json);
  }

  String toJsonString() => json.encode({'type': _wireName(type), ...data});
}

String _wireName(WebRtcSignalType t) {
  switch (t) {
    case WebRtcSignalType.offer:
      return 'webrtc_offer';
    case WebRtcSignalType.answer:
      return 'webrtc_answer';
    case WebRtcSignalType.ice:
      return 'webrtc_ice';
    case WebRtcSignalType.bargeIn:
      return 'webrtc_barge_in';
    case WebRtcSignalType.connected:
      return 'webrtc_connected';
    case WebRtcSignalType.disconnected:
      return 'webrtc_disconnected';
    case WebRtcSignalType.vadState:
      return 'vad_state';
    case WebRtcSignalType.transcription:
      return 'transcription';
    case WebRtcSignalType.audioFrame:
      return 'webrtc_audio_frame';
    case WebRtcSignalType.error:
      return 'error';
  }
}

/// Sends SDP / ICE candidates over the existing Prefrontal
/// session WebSocket and surfaces server events back to the
/// caller via streams. Pure transport — the actual SDP and
/// candidate generation lives in `WebRtcCompanion`.
class WebRtcSignaling {
  final String _baseUrl;
  final String _sessionId;
  WebSocketChannel? _channel;
  bool _disposed = false;

  final _outbound = StreamController<WebRtcSignal>.broadcast();
  final _vad = StreamController<String>.broadcast();
  final _transcription = StreamController<String>.broadcast();
  final _connected = StreamController<void>.broadcast();
  final _disconnected = StreamController<void>.broadcast();
  final _error = StreamController<String>.broadcast();

  WebRtcSignaling({required String sessionId, String? baseUrl})
    : _baseUrl = baseUrl ?? 'ws://localhost:8082',
      _sessionId = sessionId;

  Stream<WebRtcSignal> get outbound => _outbound.stream;
  Stream<String> get vad => _vad.stream;
  Stream<String> get transcription => _transcription.stream;
  Stream<void> get connected => _connected.stream;
  Stream<void> get disconnected => _disconnected.stream;
  Stream<String> get error => _error.stream;

  Future<bool> connect() async {
    if (_disposed) return false;
    try {
      final uri = Uri.parse('$_baseUrl/api/sessions/$_sessionId/ws');
      _channel = WebSocketChannel.connect(uri);
      await _channel!.ready;
      _channel!.stream.listen(
        _onMessage,
        onError: _onError,
        onDone: _onDone,
        cancelOnError: false,
      );
      return true;
    } catch (e) {
      _error.add('signaling connect: $e');
      return false;
    }
  }

  void sendOffer(String sdp) {
    _send(WebRtcSignal(WebRtcSignalType.offer, {'sdp': sdp}));
  }

  void sendIce({
    required String candidate,
    String? sdpMid,
    int? sdpMLineIndex,
  }) {
    _send(
      WebRtcSignal(WebRtcSignalType.ice, {
        'candidate': candidate,
        if (sdpMid != null) 'sdp_mid': sdpMid,
        if (sdpMLineIndex != null) 'sdp_m_line_index': sdpMLineIndex,
      }),
    );
  }

  void sendBargeIn() {
    _send(const WebRtcSignal(WebRtcSignalType.bargeIn, {}));
  }

  void _send(WebRtcSignal signal) {
    if (_disposed) return;
    _channel?.sink.add(signal.toJsonString());
  }

  void _onMessage(dynamic message) {
    if (message is! String) return;
    try {
      final data = json.decode(message) as Map<String, dynamic>;
      final signal = WebRtcSignal.fromJson(data);
      switch (signal.type) {
        case WebRtcSignalType.answer:
        case WebRtcSignalType.ice:
          _outbound.add(signal);
          break;
        case WebRtcSignalType.connected:
          _connected.add(null);
          break;
        case WebRtcSignalType.disconnected:
          _disconnected.add(null);
          break;
        case WebRtcSignalType.vadState:
          _vad.add((signal.data['state'] as String?) ?? 'unknown');
          break;
        case WebRtcSignalType.transcription:
          _transcription.add((signal.data['text'] as String?) ?? '');
          break;
        case WebRtcSignalType.audioFrame:
        case WebRtcSignalType.bargeIn:
        case WebRtcSignalType.offer:
          break;
        case WebRtcSignalType.error:
          _error.add((signal.data['message'] as String?) ?? 'unknown');
          break;
      }
    } catch (_) {
      // ignore non-JSON frames
    }
  }

  void _onError(dynamic error) {
    _error.add('ws error: $error');
    _disconnected.add(null);
  }

  void _onDone() {
    _disconnected.add(null);
  }

  Future<void> dispose() async {
    _disposed = true;
    await _channel?.sink.close();
    await _outbound.close();
    await _vad.close();
    await _transcription.close();
    await _connected.close();
    await _disconnected.close();
    await _error.close();
  }
}
