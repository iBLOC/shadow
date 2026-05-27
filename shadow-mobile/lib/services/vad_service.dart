import 'dart:async';
import 'package:vad/vad.dart';
import 'package:permission_handler/permission_handler.dart';

enum VadState { idle, listening, speechStart, speaking, speechEnd }

class VadService {
  VadHandler? _vadHandler;
  VadState _state = VadState.idle;
  final _stateController = StreamController<VadState>.broadcast();
  final _audioController = StreamController<List<double>>.broadcast();

  VadState get state => _state;
  Stream<VadState> get stateStream => _stateController.stream;
  Stream<List<double>> get audioStream => _audioController.stream;

  Future<bool> requestPermission() async {
    final status = await Permission.microphone.request();
    return status.isGranted;
  }

  Future<bool> initialize() async {
    final hasPermission = await requestPermission();
    if (!hasPermission) return false;

    _vadHandler = VadHandler.create(isDebug: false);
    _setupListeners();
    return true;
  }

  void _setupListeners() {
    _vadHandler?.onSpeechStart.listen((_) {
      _updateState(VadState.speechStart);
    });

    _vadHandler?.onRealSpeechStart.listen((_) {
      _updateState(VadState.speaking);
    });

    _vadHandler?.onSpeechEnd.listen((samples) {
      _audioController.add(samples);
      _updateState(VadState.speechEnd);
    });

    _vadHandler?.onVADMisfire.listen((_) {
      _updateState(VadState.idle);
    });

    _vadHandler?.onError.listen((msg) {
      _updateState(VadState.idle);
    });
  }

  void _updateState(VadState newState) {
    _state = newState;
    _stateController.add(newState);
  }

  Future<bool> startListening() async {
    if (_vadHandler == null) {
      final ok = await initialize();
      if (!ok) return false;
    }

    try {
      await _vadHandler?.startListening(
        positiveSpeechThreshold: 0.5,
        negativeSpeechThreshold: 0.35,
        preSpeechPadFrames: 1,
        redemptionFrames: 8,
        frameSamples: 1536,
        minSpeechFrames: 3,
      );
      _updateState(VadState.listening);
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<void> stopListening() async {
    await _vadHandler?.stopListening();
    _updateState(VadState.idle);
  }

  Future<void> dispose() async {
    await stopListening();
    await _vadHandler?.dispose();
    _vadHandler = null;
    await _stateController.close();
    await _audioController.close();
  }
}
