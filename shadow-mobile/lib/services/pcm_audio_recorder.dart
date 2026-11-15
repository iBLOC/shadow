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
      if (result == null) {
        // ⚠️ 原生说「没在录」⇒ ⇒ **说清楚**（不许静默返回 null ⇒ ⇒
        // 上游会以为「录到了但是空的」⇒ ⇒ 失败长得像成功）。
        debugPrint('PcmAudioRecorder.stopRecording: 原生没有交出音频（可能没在录）');
      }
      return result;
    } catch (e) {
      // ⚠️ 异常**不许吞成 null** ⇒ ⇒ 真因进日志。
      debugPrint('PcmAudioRecorder.stopRecording error: $e');
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
