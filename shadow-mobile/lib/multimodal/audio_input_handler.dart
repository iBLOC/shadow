import 'dart:async';
import 'dart:io';
import 'package:record/record.dart';
import 'package:path_provider/path_provider.dart';

enum AudioInputState { idle, recording, processing }

class AudioInputHandler {
  final AudioRecorder _recorder = AudioRecorder();
  AudioInputState _state = AudioInputState.idle;
  String? _currentPath;

  AudioInputState get state => _state;

  Future<bool> hasPermission() async {
    return await _recorder.hasPermission();
  }

  Future<String?> startRecording() async {
    if (_state == AudioInputState.recording) return null;
    
    final hasPermission = await _recorder.hasPermission();
    if (!hasPermission) return null;

    final dir = await getTemporaryDirectory();
    final path = '${dir.path}/audio_${DateTime.now().millisecondsSinceEpoch}.m4a';
    _currentPath = path;

    await _recorder.start(
      const RecordConfig(
        encoder: AudioEncoder.aacLc,
        bitRate: 128000,
        sampleRate: 44100,
      ),
      path: path,
    );

    _state = AudioInputState.recording;
    return path;
  }

  Future<String?> stopRecording() async {
    if (_state != AudioInputState.recording) return null;

    _state = AudioInputState.processing;
    final path = await _recorder.stop();
    _state = AudioInputState.idle;
    return path;
  }

  Future<void> cancelRecording() async {
    if (_state != AudioInputState.recording) return;
    
    await _recorder.stop();
    if (_currentPath != null) {
      final file = File(_currentPath!);
      if (await file.exists()) {
        await file.delete();
      }
    }
    _currentPath = null;
    _state = AudioInputState.idle;
  }

  Future<void> dispose() async {
    await _recorder.dispose();
  }
}
