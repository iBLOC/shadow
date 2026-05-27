import 'dart:typed_data';
import 'package:record/record.dart';
import 'package:path_provider/path_provider.dart';

class AudioSegment {
  final Uint8List data;
  final int sampleRate;
  final bool isFinal;

  AudioSegment({
    required this.data,
    required this.sampleRate,
    required this.isFinal,
  });

  int get durationMs => (data.length ~/ (sampleRate * 2)) * 1000;
}

class AudioSegmentCollector {
  static const int maxDurationMs = 30000;
  static const int sampleRate = 16000;

  final AudioRecorder _recorder = AudioRecorder();
  List<Int16List> _buffers = [];
  bool _isRecording = false;
  DateTime? _startTime;

  bool get isRecording => _isRecording;

  Future<bool> hasPermission() async {
    return await _recorder.hasPermission();
  }

  Future<void> startRecording() async {
    if (_isRecording) return;

    final hasPermission = await _recorder.hasPermission();
    if (!hasPermission) return;

    _buffers = [];
    _startTime = DateTime.now();

    final dir = await getTemporaryDirectory();
    final path =
        '${dir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.wav';

    await _recorder.start(
      const RecordConfig(
        encoder: AudioEncoder.pcm16bits,
        sampleRate: sampleRate,
        numChannels: 1,
      ),
      path: path,
    );

    _isRecording = true;
  }

  Future<List<AudioSegment>> stopRecording() async {
    if (!_isRecording) return [];

    await _recorder.stop();
    _isRecording = false;

    if (_buffers.isEmpty) return [];

    final allSamples = <int>[];
    for (final buffer in _buffers) {
      allSamples.addAll(buffer);
    }

    final durationMs = DateTime.now().difference(_startTime!).inMilliseconds;

    if (durationMs <= maxDurationMs) {
      return [
        AudioSegment(
          data: _int16ListToBytes(Int16List.fromList(allSamples)),
          sampleRate: sampleRate,
          isFinal: true,
        ),
      ];
    }

    return _splitIntoSegments(allSamples);
  }

  List<AudioSegment> _splitIntoSegments(List<int> samples) {
    final segments = <AudioSegment>[];
    final maxSamples = (sampleRate * maxDurationMs ~/ 1000);

    for (int i = 0; i < samples.length; i += maxSamples) {
      final end = (i + maxSamples < samples.length)
          ? i + maxSamples
          : samples.length;
      final segmentSamples = samples.sublist(i, end);
      final isLast = end >= samples.length;

      segments.add(
        AudioSegment(
          data: _int16ListToBytes(Int16List.fromList(segmentSamples)),
          sampleRate: sampleRate,
          isFinal: isLast,
        ),
      );
    }

    return segments;
  }

  Uint8List _int16ListToBytes(Int16List list) {
    final bytes = Uint8List(list.length * 2);
    final byteData = ByteData.view(bytes.buffer);
    for (int i = 0; i < list.length; i++) {
      byteData.setInt16(i * 2, list[i], Endian.little);
    }
    return bytes;
  }

  Future<void> cancelRecording() async {
    if (!_isRecording) return;
    await _recorder.stop();
    _isRecording = false;
    _buffers = [];
  }

  Future<void> dispose() async {
    await _recorder.dispose();
  }
}
