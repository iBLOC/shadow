import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/vad_service.dart';
import '../services/audio_segment_collector.dart';
import '../services/video_frame_collector.dart';

enum ConversationMode { message, conversation }

enum VoiceState { idle, listening, recording, processing, speaking }

enum VideoState { off, on, streaming }

class ConversationState {
  final ConversationMode mode;
  final VoiceState voiceState;
  final VideoState videoState;
  final bool isMirrored;
  final List<AudioSegment> pendingSegments;
  final List<VideoFrame> pendingFrames;
  final String? errorMessage;

  const ConversationState({
    this.mode = ConversationMode.message,
    this.voiceState = VoiceState.idle,
    this.videoState = VideoState.off,
    this.isMirrored = true,
    this.pendingSegments = const [],
    this.pendingFrames = const [],
    this.errorMessage,
  });

  ConversationState copyWith({
    ConversationMode? mode,
    VoiceState? voiceState,
    VideoState? videoState,
    bool? isMirrored,
    List<AudioSegment>? pendingSegments,
    List<VideoFrame>? pendingFrames,
    String? errorMessage,
  }) {
    return ConversationState(
      mode: mode ?? this.mode,
      voiceState: voiceState ?? this.voiceState,
      videoState: videoState ?? this.videoState,
      isMirrored: isMirrored ?? this.isMirrored,
      pendingSegments: pendingSegments ?? this.pendingSegments,
      pendingFrames: pendingFrames ?? this.pendingFrames,
      errorMessage: errorMessage,
    );
  }
}

class ConversationModeNotifier extends StateNotifier<ConversationState> {
  final VadService _vadService;
  final AudioSegmentCollector _audioCollector;
  final VideoFrameCollector _videoCollector;

  StreamSubscription<VadState>? _vadSubscription;
  final _segmentController = StreamController<AudioSegment>.broadcast();

  Stream<AudioSegment> get segmentStream => _segmentController.stream;

  ConversationModeNotifier({
    required VadService vadService,
    required AudioSegmentCollector audioCollector,
    required VideoFrameCollector videoCollector,
  }) : _vadService = vadService,
       _audioCollector = audioCollector,
       _videoCollector = videoCollector,
       super(const ConversationState()) {
    _setupVadListener();
  }

  void _setupVadListener() {
    _vadSubscription = _vadService.stateStream.listen((vadState) {
      switch (vadState) {
        case VadState.idle:
          state = state.copyWith(voiceState: VoiceState.idle);
          break;
        case VadState.listening:
          state = state.copyWith(voiceState: VoiceState.listening);
          break;
        case VadState.speechStart:
          _onSpeechStart();
          break;
        case VadState.speaking:
          state = state.copyWith(voiceState: VoiceState.recording);
          break;
        case VadState.speechEnd:
          _onSpeechEnd();
          break;
      }
    });
  }

  Future<void> _onSpeechStart() async {
    state = state.copyWith(voiceState: VoiceState.recording);
    await _audioCollector.startRecording();
    if (state.mode == ConversationMode.conversation &&
        state.videoState != VideoState.off) {
      await _videoCollector.startCapturing();
      state = state.copyWith(videoState: VideoState.streaming);
    }
  }

  Future<void> _onSpeechEnd() async {
    state = state.copyWith(voiceState: VoiceState.processing);

    final segments = await _audioCollector.stopRecording();

    if (state.mode == ConversationMode.conversation &&
        state.videoState == VideoState.streaming) {
      final frames = await _videoCollector.stopCapturing();
      state = state.copyWith(
        pendingFrames: frames,
        videoState: state.videoState == VideoState.streaming
            ? VideoState.on
            : state.videoState,
      );
    }

    for (final segment in segments) {
      _segmentController.add(segment);
    }

    state = state.copyWith(
      voiceState: VoiceState.idle,
      pendingSegments: segments,
    );
  }

  Future<void> startConversationMode() async {
    // Initialize video collector if camera is enabled
    if (state.videoState != VideoState.off) {
      await _videoCollector.initialize();
    }

    final ok = await _vadService.startListening();
    if (ok) {
      state = state.copyWith(mode: ConversationMode.conversation);
    } else {
      state = state.copyWith(errorMessage: 'Failed to start conversation mode');
    }
  }

  Future<void> startMessageMode() async {
    await _vadService.stopListening();
    await _audioCollector.cancelRecording();
    if (state.mode == ConversationMode.conversation &&
        state.videoState == VideoState.streaming) {
      await _videoCollector.stopCapturing();
    }
    state = state.copyWith(
      mode: ConversationMode.message,
      videoState: VideoState.off,
    );
  }

  /// Toggle camera on/off
  Future<void> toggleCamera() async {
    if (state.videoState == VideoState.off) {
      final ok = await _videoCollector.initialize();
      if (ok) {
        state = state.copyWith(
          videoState: VideoState.on,
          isMirrored: _videoCollector.isMirrored,
        );
      }
    } else {
      await _videoCollector.stopCapturing();
      state = state.copyWith(videoState: VideoState.off);
    }
  }

  /// Switch between front and back camera
  Future<void> flipCamera() async {
    if (state.videoState == VideoState.off) return;

    await _videoCollector.switchCamera();
    state = state.copyWith(isMirrored: _videoCollector.isMirrored);
  }

  /// Check if camera is available
  bool get hasCamera =>
      _videoCollector.cameras != null && _videoCollector.cameras!.length > 1;

  void onSegmentsSent() {
    state = state.copyWith(pendingSegments: []);
  }

  void onSpeakingComplete() {
    state = state.copyWith(voiceState: VoiceState.idle);
  }

  @override
  void dispose() {
    _vadSubscription?.cancel();
    _segmentController.close();
    super.dispose();
  }
}

final vadServiceProvider = Provider<VadService>((ref) {
  final service = VadService();
  ref.onDispose(() => service.dispose());
  return service;
});

final audioCollectorProvider = Provider<AudioSegmentCollector>((ref) {
  final collector = AudioSegmentCollector();
  ref.onDispose(() => collector.dispose());
  return collector;
});

final videoCollectorProvider = Provider<VideoFrameCollector>((ref) {
  final collector = VideoFrameCollector();
  ref.onDispose(() => collector.dispose());
  return collector;
});

final conversationModeProvider =
    StateNotifierProvider<ConversationModeNotifier, ConversationState>((ref) {
      return ConversationModeNotifier(
        vadService: ref.watch(vadServiceProvider),
        audioCollector: ref.watch(audioCollectorProvider),
        videoCollector: ref.watch(videoCollectorProvider),
      );
    });
