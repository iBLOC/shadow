import 'dart:async';
import 'dart:typed_data';
import '../services/pcm_audio_recorder.dart';

enum AudioInputState { idle, recording, processing }

class AudioInputHandler {
  final PcmAudioRecorder _recorder = PcmAudioRecorder();
  AudioInputState _state = AudioInputState.idle;
  DateTime? _recordingStartTime;
  Timer? _amplitudeTimer;
  final _amplitudeController = StreamController<double>.broadcast();

  AudioInputState get state => _state;
  Stream<double> get amplitudeStream => _amplitudeController.stream;
  DateTime? get recordingStartTime => _recordingStartTime;

  int get recordingDurationSeconds {
    if (_recordingStartTime == null) return 0;
    return DateTime.now().difference(_recordingStartTime!).inSeconds;
  }

  Future<bool> hasPermission() async {
    return await _recorder.hasPermission();
  }

  Future<String?> startRecording() async {
    if (_state == AudioInputState.recording) return null;

    final hasPermission = await _recorder.hasPermission();
    if (!hasPermission) return null;

    final success = await _recorder.startRecording();
    if (!success) return null;

    _recordingStartTime = DateTime.now();
    _state = AudioInputState.recording;

    _amplitudeTimer = Timer.periodic(
      const Duration(milliseconds: 100),
      (_) => _updateAmplitude(),
    );

    return 'pcm_recording';
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

  Future<void> dispose() async {
    _amplitudeTimer?.cancel();
    await _amplitudeController.close();
  }
}
