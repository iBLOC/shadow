import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class PcmAudioRecorder {
  static const _channel = MethodChannel('com.ibloc.shadow/pcm_audio');
  static const _streamChannel = EventChannel(
    'com.ibloc.shadow/pcm_audio_stream',
  );

  StreamSubscription<dynamic>? _streamSubscription;
  void Function(Uint8List)? onAudioChunk;

  void _startListening() {
    _streamSubscription?.cancel();
    _streamSubscription = _streamChannel.receiveBroadcastStream().listen(
      (dynamic data) {
        if (data is Uint8List && onAudioChunk != null) {
          onAudioChunk!(data);
        }
      },
      onError: (dynamic error) {
        debugPrint('PcmAudioRecorder stream error: $error');
      },
    );
  }

  void _stopListening() {
    _streamSubscription?.cancel();
    _streamSubscription = null;
  }

  Future<bool> hasPermission() async {
    try {
      return await _channel.invokeMethod<bool>('hasPermission') ?? false;
    } catch (e) {
      return false;
    }
  }

  Future<bool> startRecording() async {
    try {
      _startListening();
      return await _channel.invokeMethod<bool>('startRecording') ?? false;
    } catch (e) {
      return false;
    }
  }

  Future<Uint8List?> stopRecording() async {
    try {
      _stopListening();
      final result = await _channel.invokeMethod<Uint8List>('stopRecording');
      return result;
    } catch (e) {
      return null;
    }
  }

  Future<bool> cancelRecording() async {
    try {
      _stopListening();
      return await _channel.invokeMethod<bool>('cancelRecording') ?? false;
    } catch (e) {
      return false;
    }
  }

  Future<bool> isRecording() async {
    try {
      return await _channel.invokeMethod<bool>('isRecording') ?? false;
    } catch (e) {
      return false;
    }
  }

  Future<int> getElapsedTimeMs() async {
    try {
      return await _channel.invokeMethod<int>('getElapsedTimeMs') ?? 0;
    } catch (e) {
      return 0;
    }
  }

  void dispose() {
    _stopListening();
  }
}
