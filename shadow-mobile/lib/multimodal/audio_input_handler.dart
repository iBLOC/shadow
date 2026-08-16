import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';
import '../services/pcm_audio_recorder.dart';

enum AudioInputState { idle, recording, processing }

class AudioInputHandler {
  final PcmAudioRecorder _recorder = PcmAudioRecorder();
  AudioInputState _state = AudioInputState.idle;
  DateTime? _recordingStartTime;
  Timer? _amplitudeTimer;
  final _amplitudeController = StreamController<double>.broadcast();
  void Function(Uint8List)? onAudioChunk;

  AudioInputState get state => _state;
  Stream<double> get amplitudeStream => _amplitudeController.stream;
  DateTime? get recordingStartTime => _recordingStartTime;

  int get recordingDurationSeconds {
    if (_recordingStartTime == null) return 0;
    return DateTime.now().difference(_recordingStartTime!).inSeconds;
  }

  Future<bool> hasPermission() async {
    final status = await Permission.microphone.status;
    return status.isGranted;
  }

  Future<bool> requestPermission() async {
    final status = await Permission.microphone.request();
    return status.isGranted;
  }

  Future<String?> startRecording() async {
    if (_state == AudioInputState.recording) return null;

    var hasPermission = await Permission.microphone.status.isGranted;
    if (!hasPermission) {
      hasPermission = await Permission.microphone.request().isGranted;
      if (!hasPermission) {
        debugPrint('AudioInputHandler: Microphone permission denied');
        return null;
      }
    }

    _recorder.onAudioChunk = _handleAudioChunk;
    final success = await _recorder.startRecording();
    if (!success) {
      debugPrint('AudioInputHandler: Failed to start recording');
      return null;
    }

    _recordingStartTime = DateTime.now();
    _state = AudioInputState.recording;

    _amplitudeTimer = Timer.periodic(
      const Duration(milliseconds: 100),
      (_) => _updateAmplitude(),
    );

    return 'pcm_recording';
  }

  void _handleAudioChunk(Uint8List chunk) {
    onAudioChunk?.call(chunk);
  }

  Future<void> _updateAmplitude() async {
    if (_state != AudioInputState.recording) return;
    try {
      final elapsed = await _recorder.getElapsedTimeMs();
      final normalized = ((elapsed % 1000) / 1000.0).clamp(0.0, 1.0);
      _amplitudeController.add(normalized);
    } catch (_) {}
  }

  Future<Uint8List?> stopRecording() async {
    if (_state != AudioInputState.recording) return null;

    _amplitudeTimer?.cancel();
    _amplitudeTimer = null;
    _state = AudioInputState.processing;

    final pcmData = await _recorder.stopRecording();
    _recordingStartTime = null;
    _state = AudioInputState.idle;

    return pcmData;
  }

  Future<void> cancelRecording() async {
    if (_state != AudioInputState.recording) return;

    _amplitudeTimer?.cancel();
    _amplitudeTimer = null;
    await _recorder.cancelRecording();
    _recordingStartTime = null;
    _state = AudioInputState.idle;
  }

  Future<String?> saveAudioToFile(Uint8List pcmData) async {
    try {
      final appDir = await getApplicationDocumentsDirectory();
      final audioDir = Directory('${appDir.path}/audio_recordings');
      if (!await audioDir.exists()) {
        await audioDir.create(recursive: true);
      }
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final path = '${audioDir.path}/voice_$timestamp.pcm';
      final file = File(path);
      await file.writeAsBytes(pcmData);
      debugPrint('AudioInputHandler: Saved audio to $path');
      return path;
    } catch (e) {
      debugPrint('AudioInputHandler: Failed to save audio: $e');
      return null;
    }
  }

  Future<void> dispose() async {
    _amplitudeTimer?.cancel();
    _recorder.dispose();
    await _amplitudeController.close();
  }
}
