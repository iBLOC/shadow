import 'dart:async';
import 'package:camera/camera.dart';

class VideoFrame {
  final String path;
  final DateTime timestamp;

  VideoFrame({required this.path, required this.timestamp});
}

class VideoFrameCollector {
  CameraController? _controller;
  List<CameraDescription>? _cameras;
  int _currentCameraIndex = 0;
  bool _isInitialized = false;
  bool _isCapturing = false;
  bool _isEnabled = false;
  Timer? _captureTimer;
  final List<VideoFrame> _frames = [];

  bool get isInitialized => _isInitialized;
  bool get isCapturing => _isCapturing;
  bool get isEnabled => _isEnabled;
  bool get isMirrored => _currentCameraIndex == 0; // Front camera is mirrored
  int get currentCameraIndex => _currentCameraIndex;
  List<CameraDescription>? get cameras => _cameras;
  List<VideoFrame> get frames => List.unmodifiable(_frames);

  Future<bool> initialize() async {
    if (_isInitialized) return true;

    try {
      _cameras = await availableCameras();
      if (_cameras == null || _cameras!.isEmpty) return false;

      _currentCameraIndex = 0; // Start with front camera
      _controller = CameraController(
        _cameras![_currentCameraIndex],
        ResolutionPreset.low,
        enableAudio: false,
      );

      await _controller!.initialize();
      _isInitialized = true;
      _isEnabled = true;
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<void> startCapturing() async {
    if (!_isInitialized || _isCapturing) return;

    _frames.clear();
    _isCapturing = true;

    _captureTimer = Timer.periodic(
      const Duration(seconds: 1),
      (_) => _captureFrame(),
    );
  }

  Future<void> _captureFrame() async {
    if (!_isCapturing || _controller == null) return;

    try {
      final file = await _controller!.takePicture();
      _frames.add(VideoFrame(path: file.path, timestamp: DateTime.now()));
    } catch (e) {
      // Frame capture failed, skip this frame
    }
  }

  Future<List<VideoFrame>> stopCapturing() async {
    if (!_isCapturing) return [];

    _captureTimer?.cancel();
    _captureTimer = null;
    _isCapturing = false;

    return List.unmodifiable(_frames);
  }

  Future<void> switchCamera() async {
    if (_cameras == null || _cameras!.length < 2) return;

    _currentCameraIndex = (_currentCameraIndex + 1) % _cameras!.length;

    await _controller?.dispose();

    _controller = CameraController(
      _cameras![_currentCameraIndex],
      ResolutionPreset.low,
      enableAudio: false,
    );

    await _controller!.initialize();
  }

  void setEnabled(bool enabled) {
    _isEnabled = enabled;
  }

  CameraController? get controller => _controller;

  Future<void> dispose() async {
    await stopCapturing();
    await _controller?.dispose();
    _controller = null;
    _isInitialized = false;
    _isEnabled = false;
  }
}
