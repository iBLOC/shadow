import 'dart:async';
import 'package:flutter/services.dart';

class PcmAudioRecorder {
  static const _channel = MethodChannel('com.ibloc.shadow/pcm_audio');

  Future<bool> hasPermission() async {
    try {
      return await _channel.invokeMethod<bool>('hasPermission') ?? false;
    } catch (e) {
      return false;
    }
  }

  Future<bool> startRecording() async {
    try {
      return await _channel.invokeMethod<bool>('startRecording') ?? false;
    } catch (e) {
      return false;
    }
  }

  Future<Uint8List?> stopRecording() async {
    try {
      final result = await _channel.invokeMethod<Uint8List>('stopRecording');
      return result;
    } catch (e) {
      return null;
    }
  }

  Future<bool> cancelRecording() async {
    try {
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
}
