import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:web_socket_channel/web_socket_channel.dart';

enum AudioWsState {
  disconnected,
  connecting,
  connected,
  listening,
  speaking,
  error,
}

class AudioWsService {
  WebSocketChannel? _channel;
  final String _url;
  final String _sessionId;

  AudioWsState _state = AudioWsState.disconnected;
  final _stateController = StreamController<AudioWsState>.broadcast();
  final _transcriptionController = StreamController<String>.broadcast();
  final _vadController = StreamController<String>.broadcast();

  AudioWsState get state => _state;
  Stream<AudioWsState> get stateStream => _stateController.stream;
  Stream<String> get transcriptionStream => _transcriptionController.stream;
  Stream<String> get vadStream => _vadController.stream;

  AudioWsService({required String sessionId, String? baseUrl})
    : _sessionId = sessionId,
      _url = baseUrl ?? 'ws://localhost:60000';

  Future<bool> connect() async {
    if (_state == AudioWsState.connected || _state == AudioWsState.connecting) {
      return true;
    }

    _updateState(AudioWsState.connecting);

    try {
      final uri = Uri.parse('$_url/api/sessions/$_sessionId/audio');
      _channel = WebSocketChannel.connect(uri);

      await _channel!.ready;

      _updateState(AudioWsState.connected);

      _channel!.stream.listen(
        _handleMessage,
        onError: _handleError,
        onDone: _handleDone,
      );

      return true;
    } catch (e) {
      _updateState(AudioWsState.error);
      return false;
    }
  }

  void _handleMessage(dynamic message) {
    try {
      final data = json.decode(message as String);
      final type_ = data['type'] as String?;

      switch (type_) {
        case 'connected':
          _updateState(AudioWsState.connected);
          break;
        case 'vad_state':
          final state = data['state'] as String?;
          _vadController.add(state ?? 'unknown');
          if (state == 'listening') {
            _updateState(AudioWsState.listening);
          } else if (state == 'speaking') {
            _updateState(AudioWsState.speaking);
          }
          break;
        case 'transcription':
          final text = data['text'] as String?;
          if (text != null) {
            _transcriptionController.add(text);
          }
          break;
        case 'error':
          final error = data['message'] as String?;
          _transcriptionController.addError(error ?? 'Unknown error');
          break;
      }
    } catch (e) {
      // Ignore parsing errors for non-JSON messages
    }
  }

  void _handleError(dynamic error) {
    _updateState(AudioWsState.error);
  }

  void _handleDone() {
    _updateState(AudioWsState.disconnected);
  }

  void _updateState(AudioWsState newState) {
    _state = newState;
    _stateController.add(newState);
  }

  Future<void> startListening({int sampleRate = 16000}) async {
    if (_state != AudioWsState.connected) {
      return;
    }

    _channel!.sink.add(
      json.encode({'type': 'audio_start', 'sample_rate': sampleRate}),
    );

    _updateState(AudioWsState.listening);
  }

  void sendAudioData(Uint8List audioBytes) {
    if (_state != AudioWsState.listening && _state != AudioWsState.speaking) {
      return;
    }

    final base64Data = base64.encode(audioBytes);
    _channel?.sink.add(json.encode({'type': 'audio_data', 'data': base64Data}));
  }

  Future<void> stopListening() async {
    if (_state != AudioWsState.connected) {
      return;
    }

    _channel!.sink.add(json.encode({'type': 'audio_end'}));

    _updateState(AudioWsState.connected);
  }

  Future<void> disconnect() async {
    await _channel?.sink.close();
    _channel = null;
    _updateState(AudioWsState.disconnected);
  }

  Future<void> dispose() async {
    await disconnect();
    await _stateController.close();
    await _transcriptionController.close();
    await _vadController.close();
  }
}
