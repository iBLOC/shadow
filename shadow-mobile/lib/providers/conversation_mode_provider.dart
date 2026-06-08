import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/audio_ws_service.dart';
import '../services/video_frame_collector.dart';
import '../services/prefrontal_client.dart';

enum ConversationMode { message, conversation }

enum VoiceState { idle, listening, recording, processing, speaking }

enum VideoState { off, on, streaming }

class ConversationState {
  final ConversationMode mode;
  final VoiceState voiceState;
  final VideoState videoState;
  final bool isMirrored;
  final String? errorMessage;
  final String? sessionId;

  const ConversationState({
    this.mode = ConversationMode.message,
    this.voiceState = VoiceState.idle,
    this.videoState = VideoState.off,
    this.isMirrored = true,
    this.errorMessage,
    this.sessionId,
  });

  ConversationState copyWith({
    ConversationMode? mode,
    VoiceState? voiceState,
    VideoState? videoState,
    bool? isMirrored,
    String? errorMessage,
    String? sessionId,
  }) {
    return ConversationState(
      mode: mode ?? this.mode,
      voiceState: voiceState ?? this.voiceState,
      videoState: videoState ?? this.videoState,
      isMirrored: isMirrored ?? this.isMirrored,
      errorMessage: errorMessage,
      sessionId: sessionId ?? this.sessionId,
    );
  }
}

class ConversationModeNotifier extends StateNotifier<ConversationState> {
  AudioWsService? _audioService;
  final VideoFrameCollector _videoCollector;
  final PrefrontalClient _prefrontalClient;
  String? _sessionId;
  final String? _baseUrl;

  StreamSubscription<AudioWsState>? _stateSubscription;
  StreamSubscription<String>? _vadSubscription;
  StreamSubscription<String>? _transcriptionSubscription;

  final _transcriptionController = StreamController<String>.broadcast();
  Stream<String> get transcriptionStream => _transcriptionController.stream;

  ConversationModeNotifier({
    String? sessionId,
    String? baseUrl,
    VideoFrameCollector? videoCollector,
    PrefrontalClient? prefrontalClient,
  }) : _sessionId = sessionId,
       _baseUrl = baseUrl,
       _videoCollector = videoCollector ?? VideoFrameCollector(),
       _prefrontalClient =
           prefrontalClient ?? PrefrontalClient(baseUrl: baseUrl),
       super(const ConversationState());

  Future<String?> _createSession() async {
    try {
      final session = await _prefrontalClient.createSession();
      debugPrint('ConversationModeNotifier: Created session ${session.id}');
      return session.id;
    } catch (e) {
      debugPrint('ConversationModeNotifier: Failed to create session: $e');
      return null;
    }
  }

  Future<bool> connect() async {
    if (_sessionId == null) {
      _sessionId = await _createSession();
      if (_sessionId == null) {
        state = state.copyWith(errorMessage: 'Failed to create session');
        return false;
      }
      state = state.copyWith(sessionId: _sessionId);
    }

    _audioService = AudioWsService(sessionId: _sessionId!, baseUrl: _baseUrl);

    _stateSubscription = _audioService!.stateStream.listen((wsState) {
      switch (wsState) {
        case AudioWsState.disconnected:
          state = state.copyWith(voiceState: VoiceState.idle);
          break;
        case AudioWsState.connecting:
          state = state.copyWith(voiceState: VoiceState.listening);
          break;
        case AudioWsState.connected:
          state = state.copyWith(voiceState: VoiceState.idle);
          break;
        case AudioWsState.listening:
          state = state.copyWith(voiceState: VoiceState.listening);
          break;
        case AudioWsState.speaking:
          state = state.copyWith(voiceState: VoiceState.speaking);
          break;
        case AudioWsState.error:
          state = state.copyWith(
            voiceState: VoiceState.idle,
            errorMessage: 'Audio connection error',
          );
          break;
      }
    });

    _vadSubscription = _audioService!.vadStream.listen((vadState) async {
      if (vadState == 'listening') {
        state = state.copyWith(voiceState: VoiceState.listening);
      } else if (vadState == 'speaking') {
        state = state.copyWith(voiceState: VoiceState.speaking);
        if (state.videoState == VideoState.on) {
          await _videoCollector.startCapturing();
          state = state.copyWith(videoState: VideoState.streaming);
        }
      } else if (vadState == 'idle') {
        state = state.copyWith(voiceState: VoiceState.idle);
        if (state.videoState == VideoState.streaming) {
          await _videoCollector.stopCapturing();
          state = state.copyWith(videoState: VideoState.on);
        }
      }
    });

    _transcriptionSubscription = _audioService!.transcriptionStream.listen((
      text,
    ) {
      _transcriptionController.add(text);
    });

    return await _audioService!.connect();
  }

  Future<void> startConversationMode() async {
    if (_audioService == null) {
      final ok = await connect();
      if (!ok) {
        state = state.copyWith(
          errorMessage: 'Failed to connect to audio service',
        );
        return;
      }
    }

    if (state.videoState != VideoState.off) {
      await _videoCollector.initialize();
    }

    await _audioService!.startListening();
    state = state.copyWith(mode: ConversationMode.conversation);
  }

  void sendAudioData(Uint8List audioData) {
    _audioService?.sendAudioData(audioData);
  }

  Future<void> restartListening() async {
    await _audioService?.stopListening();
    await _audioService?.startListening();
    state = state.copyWith(voiceState: VoiceState.listening);
  }

  Future<void> startMessageMode() async {
    await _audioService?.stopListening();
    if (state.mode == ConversationMode.conversation &&
        state.videoState == VideoState.streaming) {
      await _videoCollector.stopCapturing();
    }
    state = state.copyWith(
      mode: ConversationMode.message,
      videoState: VideoState.off,
    );
  }

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

  Future<void> flipCamera() async {
    if (state.videoState == VideoState.off) return;

    await _videoCollector.switchCamera();
    state = state.copyWith(isMirrored: _videoCollector.isMirrored);
  }

  bool get hasCamera =>
      _videoCollector.cameras != null && _videoCollector.cameras!.length > 1;

  void onSegmentsSent() {}

  void onSpeakingComplete() {
    state = state.copyWith(voiceState: VoiceState.idle);
  }

  @override
  void dispose() {
    _stateSubscription?.cancel();
    _vadSubscription?.cancel();
    _transcriptionSubscription?.cancel();
    _transcriptionController.close();
    _audioService?.dispose();
    super.dispose();
  }
}

final videoCollectorProvider = Provider<VideoFrameCollector>((ref) {
  final collector = VideoFrameCollector();
  ref.onDispose(() => collector.dispose());
  return collector;
});

final conversationModeProvider =
    StateNotifierProvider<ConversationModeNotifier, ConversationState>((ref) {
      return ConversationModeNotifier(
        videoCollector: ref.watch(videoCollectorProvider),
      );
    });
