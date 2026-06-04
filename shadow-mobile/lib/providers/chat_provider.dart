import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import '../model_manager.dart';
import '../features/models/screens/model_list_screen.dart';
import '../litert_engine.dart';
import '../services/model_download_service.dart';
import '../tts_engine.dart';
import '../multimodal/multimodal.dart';
import '../litert_model.dart';
import '../screens/model_management_screen.dart';
import '../services/database/model_item.dart' as db;
import '../services/prefrontal_client.dart';
import 'conversation_mode_provider.dart';

/// Chat message model for the UI
class ChatMessageModel {
  final String content;
  final ChatRole role;
  final String? attachmentPath;
  final MultimodalInputType? attachmentType;

  ChatMessageModel(
    this.content,
    this.role, {
    this.attachmentPath,
    this.attachmentType,
  });
}

enum ChatRole { user, assistant, system }

/// Chat mode enum
enum ChatMode { off, litert }

/// L10n keys for provider messages (resolved in UI with AppLocalizations).
enum ChatStateL10nKey {
  modelInfoNotInitialized,
  modelLoaded,
  desktopMode,
  errorMnnInitFailed,
  errorGeneric,
  litertInitializing,
  litertReady,
  errorLitertInitFailed,
}

/// Chat state
class ChatState {
  final List<ChatMessageModel> messages;
  final bool isLoading;
  final bool isInitialized;
  final String modelInfo;
  final String? errorMessage;
  final ChatStateL10nKey? modelInfoL10nKey;
  final ChatStateL10nKey? errorMessageL10nKey;
  final String? errorMessageArg;
  final ChatMode mode;
  final bool isLitertReady;
  final bool isRecordingAudio;
  final List<MultimodalInput> attachments;
  final double downloadProgress;
  final Agent currentAgent;
  final bool isDownloading;
  final VoiceState voiceState;
  final bool modelNotFound;
  final String streamingText;

  const ChatState({
    this.messages = const [],
    this.isLoading = false,
    this.isInitialized = false,
    this.modelInfo = 'Not initialized',
    this.errorMessage,
    this.modelInfoL10nKey = ChatStateL10nKey.modelInfoNotInitialized,
    this.errorMessageL10nKey,
    this.errorMessageArg,
    this.mode = ChatMode.off,
    this.isLitertReady = false,
    this.isRecordingAudio = false,
    this.attachments = const [],
    this.downloadProgress = -1.0,
    this.currentAgent = Agents.chatAgent,
    this.isDownloading = false,
    this.voiceState = VoiceState.idle,
    this.modelNotFound = false,
    this.streamingText = '',
  });

  static const _omit = _CopyWithOmit();

  ChatState copyWith({
    List<ChatMessageModel>? messages,
    bool? isLoading,
    bool? isInitialized,
    String? modelInfo,
    Object? errorMessage = _omit,
    ChatStateL10nKey? modelInfoL10nKey,
    Object? errorMessageL10nKey = _omit,
    Object? errorMessageArg = _omit,
    ChatMode? mode,
    bool? isLitertReady,
    bool? isRecordingAudio,
    List<MultimodalInput>? attachments,
    double? downloadProgress,
    Agent? currentAgent,
    bool? isDownloading,
    VoiceState? voiceState,
    bool? modelNotFound,
    String? streamingText,
  }) {
    final explicitError = !identical(errorMessage, _omit);
    final clearError = explicitError && errorMessage == null;
    return ChatState(
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
      isInitialized: isInitialized ?? this.isInitialized,
      modelInfo: modelInfo ?? this.modelInfo,
      errorMessage: explicitError ? errorMessage as String? : this.errorMessage,
      modelInfoL10nKey: modelInfoL10nKey ?? this.modelInfoL10nKey,
      errorMessageL10nKey: clearError
          ? null
          : (identical(errorMessageL10nKey, _omit)
                ? this.errorMessageL10nKey
                : errorMessageL10nKey as ChatStateL10nKey?),
      errorMessageArg: clearError
          ? null
          : (identical(errorMessageArg, _omit)
                ? this.errorMessageArg
                : errorMessageArg as String?),
      mode: mode ?? this.mode,
      isLitertReady: isLitertReady ?? this.isLitertReady,
      isRecordingAudio: isRecordingAudio ?? this.isRecordingAudio,
      attachments: attachments ?? this.attachments,
      downloadProgress: downloadProgress ?? this.downloadProgress,
      currentAgent: currentAgent ?? this.currentAgent,
      isDownloading: isDownloading ?? this.isDownloading,
      voiceState: voiceState ?? this.voiceState,
      modelNotFound: modelNotFound ?? this.modelNotFound,
      streamingText: streamingText ?? this.streamingText,
    );
  }
}

class _CopyWithOmit {
  const _CopyWithOmit();
}

/// Chat notifier
class ChatNotifier extends StateNotifier<ChatState> {
  final LitertEngine _litertEngine;
  final TtsEngine _ttsEngine;
  final PrefrontalClient _prefrontalClient;
  final MultimodalInputManager _multimodalManager = MultimodalInputManager();
  final LiteRTDownloadService _downloadService = LiteRTDownloadService();
  final ModelsNotifier? _modelsNotifier;
  String? _currentSessionId;

  bool _isDownloading = false;

  ChatNotifier(
    this._litertEngine,
    this._ttsEngine,
    this._prefrontalClient, {
    bool skipInit = false,
    bool litertReady = false,
    ModelsNotifier? modelsNotifier,
  }) : _modelsNotifier = modelsNotifier,
       super(const ChatState()) {
    if (!skipInit) {
      Future.microtask(() => _initLiteRT());
    } else if (litertReady) {
      state = state.copyWith(isLitertReady: true);
    }
  }

  void selectAgent(Agent agent) {
    _litertEngine.setModel(agent.model);
    // ML Kit handles model selection automatically
    state = state.copyWith(
      currentAgent: agent,
      isLitertReady: false,
      isDownloading: false,
      downloadProgress: -1.0,
      modelInfo: '${agent.type.displayName}: ${agent.model.displayName}',
    );
  }

  Future<void> _initLiteRT() async {
    final agent = state.currentAgent;
    state = state.copyWith(
      mode: ChatMode.litert,
      messages: [
        ...state.messages,
        ChatMessageModel(
          'Checking ${agent.model.displayName}...',
          ChatRole.system,
        ),
      ],
    );

    // 检查模型文件是否存在
    final modelPath = await _getModelPath(agent.model);
    final file = File(modelPath);
    final exists = await file.exists();

    if (!exists) {
      state = state.copyWith(
        modelInfo: 'Model not found, ready to download',
        isLitertReady: false,
        isDownloading: false,
        downloadProgress: -1.0,
        modelNotFound: true,
      );
      return;
    }

    state = state.copyWith(modelNotFound: false);

    // 模型存在，正常初始化
    await initLitert();
  }

  /// 获取模型的本地路径
  Future<String> _getModelPath(LiteRTModel model) async {
    final appDir = await getApplicationDocumentsDirectory();
    final modelDir = Directory('${appDir.path}/models');
    if (!await modelDir.exists()) {
      await modelDir.create(recursive: true);
    }
    return '${modelDir.path}/${model.name}.litertlm';
  }

  Future<void> downloadModel() async {
    // 检查是否正在下载，防止重复调用
    if (_isDownloading) {
      return;
    }
    _isDownloading = true;

    final agent = state.currentAgent;
    state = state.copyWith(
      isDownloading: true,
      downloadProgress: 0.0, // 立即设置为0，让UI正确检测到下载开始
      messages: [
        ...state.messages,
        ChatMessageModel(
          'Downloading ${agent.model.displayName} (${agent.model.sizeString}) from hf-mirror.com...',
          ChatRole.system,
        ),
      ],
      modelInfo: 'Downloading...',
    );

    try {
      // 获取模型路径和下载URL
      final modelPath = await _getModelPath(agent.model);
      final downloadUrl = _getModelDownloadUrl(agent.model.id);

      final path = await _downloadService.downloadModel(
        modelPath: modelPath,
        downloadUrl: downloadUrl,
        onProgress: (progress) {
          final percent = (progress * 100).toStringAsFixed(1);
          state = state.copyWith(
            modelInfo: 'Downloading... $percent%',
            downloadProgress: progress,
          );
        },
      );

      if (path != null) {
        state = state.copyWith(
          modelInfo: 'Download complete, initializing...',
          downloadProgress: 1.0,
          messages: [
            ...state.messages,
            ChatMessageModel(
              'Download complete! Initializing engine...',
              ChatRole.system,
            ),
          ],
        );
        await initLitert();
      } else {
        final error = _downloadService.lastError ?? 'Unknown error';
        state = state.copyWith(
          errorMessage: 'Download failed: $error',
          errorMessageL10nKey: ChatStateL10nKey.errorGeneric,
          downloadProgress: -1.0,
          isDownloading: false,
          messages: [
            ...state.messages,
            ChatMessageModel('Download failed: $error', ChatRole.system),
          ],
        );
      }
    } catch (e) {
      state = state.copyWith(
        errorMessage: 'Download error: $e',
        errorMessageL10nKey: ChatStateL10nKey.errorGeneric,
        downloadProgress: -1.0,
        isDownloading: false,
        messages: [
          ...state.messages,
          ChatMessageModel('Download error: $e', ChatRole.system),
        ],
      );
    } finally {
      // 确保下载锁被释放
      _isDownloading = false;
    }
  }

  /// 获取模型下载URL（优先 ModelScope，其次 HuggingFace）
  String _getModelDownloadUrl(String modelId) {
    // 模型ID到下载URL的映射
    // 优先使用 ModelScope（国内镜像，速度更快）
    final modelUrls = {
      'gemma4-e4b':
          // ModelScope 镜像
          'https://modelscope.cn/models/litert-community/gemma-4-E2B-it-litert-lm/resolve/master/gemma-4-E2B-it.litertlm',
      'gemma3-1b':
          // ModelScope 镜像
          'https://modelscope.cn/models/litert-community/gemma-3-E2B-it-litert-lm/resolve/master/gemma-3-E2B-it.litertlm',
    };

    final url = modelUrls[modelId];
    if (url != null) return url;

    // 备用：HuggingFace 原站
    return 'https://huggingface.co/litert-community/$modelId/resolve/main/gemma-4-E2B-it.litertlm';
  }

  Future<void> initLitert() async {
    final agent = state.currentAgent;
    state = state.copyWith(
      modelInfoL10nKey: ChatStateL10nKey.litertInitializing,
      messages: [
        ...state.messages,
        ChatMessageModel(
          'Initializing ${agent.model.displayName}...',
          ChatRole.system,
        ),
      ],
    );

    try {
      _litertEngine.setModel(agent.model);
      final modelPath = await _getModelPath(agent.model);

      // First call diagnose BEFORE attempting initialize
      final diagnosis = await _litertEngine.diagnoseModelDirectory(modelPath);
      final recommendation =
          diagnosis['recommendation'] as String? ?? 'download';

      // Log diagnostic result
      // ignore: avoid_print
      print(
        'LiteRT Diagnostic: exists=${diagnosis['exists']}, '
        'dispatchLibraryPresent=${diagnosis['dispatchLibraryPresent']}, '
        'recommendation=$recommendation, '
        'files=${diagnosis['modelFiles']}',
      );

      // If diagnosis says download or wrong-format, bail early
      if (recommendation == 'download' || recommendation == 'wrong-format') {
        state = state.copyWith(
          modelNotFound: true,
          isLitertReady: false,
          modelInfo: recommendation == 'download'
              ? 'No model found, please download'
              : 'Model format incorrect, please download',
          errorMessage: recommendation == 'download'
              ? 'No model found in $modelPath'
              : 'Model files present but format incorrect',
          errorMessageL10nKey: ChatStateL10nKey.errorLitertInitFailed,
          messages: [
            ...state.messages,
            ChatMessageModel(
              recommendation == 'download'
                  ? 'No model found, downloading required'
                  : 'Model format incorrect, downloading required',
              ChatRole.system,
            ),
          ],
        );
        return;
      }

      // Try initialize with timeout
      final success = await _litertEngine
          .initialize(modelPath: modelPath)
          .timeout(
            const Duration(seconds: 15),
            onTimeout: () {
              _litertEngine.release();
              return false;
            },
          );

      if (success) {
        final testResult = await _testLitertEngine();
        if (testResult) {
          state = state.copyWith(
            isLitertReady: true,
            modelInfo: '${agent.model.displayName} ready',
            modelInfoL10nKey: ChatStateL10nKey.litertReady,
            messages: [
              ...state.messages,
              ChatMessageModel(
                '${agent.model.displayName} engine ready!',
                ChatRole.system,
              ),
            ],
          );
        } else {
          state = state.copyWith(
            modelNotFound: true,
            isLitertReady: false,
            modelInfo: 'Model test failed, please download',
            errorMessage: 'Engine initialized but test generation failed',
            errorMessageL10nKey: ChatStateL10nKey.errorLitertInitFailed,
          );
        }
      } else {
        final errorMsg = _litertEngine.lastError ?? 'Unknown error';
        state = state.copyWith(
          errorMessage: 'Failed to initialize LiteRT engine: $errorMsg',
          errorMessageL10nKey: ChatStateL10nKey.errorLitertInitFailed,
          modelNotFound: true,
          isLitertReady: false,
        );
      }
    } catch (e) {
      state = state.copyWith(
        errorMessage: 'Error: ${e.toString()}',
        errorMessageL10nKey: ChatStateL10nKey.errorGeneric,
        modelNotFound: true,
        isLitertReady: false,
      );
    }
  }

  Future<void> runLiteRTDiagnostic() async {
    final agent = state.currentAgent;
    try {
      final modelPath = await _getModelPath(agent.model);
      final diagnosis = await _litertEngine.diagnoseModelDirectory(modelPath);
      final recommendation =
          diagnosis['recommendation'] as String? ?? 'download';

      final message =
          'LiteRT Diagnostic: '
          'directory exists=${diagnosis['exists']}, '
          'dispatch library present=${diagnosis['dispatchLibraryPresent']}, '
          'recommendation=$recommendation, '
          'total size=${diagnosis['totalSize']} bytes, '
          'files=${(diagnosis['modelFiles'] as List?)?.length ?? 0}';

      state = state.copyWith(
        modelInfo: message,
        isLitertReady: recommendation == 'ready',
        modelNotFound: recommendation == 'download',
        messages: [
          ...state.messages,
          ChatMessageModel(message, ChatRole.system),
        ],
      );
    } catch (e) {
      state = state.copyWith(
        errorMessage: 'Diagnostic failed: $e',
        errorMessageL10nKey: ChatStateL10nKey.errorGeneric,
      );
    }
  }

  Future<bool> _testLitertEngine() async {
    await Future.delayed(const Duration(milliseconds: 100));
    try {
      final result = await _litertEngine.generateContent('Hi');
      return result.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  // Multimodal input methods
  Future<void> pickImage() async {
    final input = await _multimodalManager.pickImageFromGallery();
    if (input != null) {
      state = state.copyWith(attachments: [...state.attachments, input]);
    }
  }

  Future<void> captureImage() async {
    final input = await _multimodalManager.captureImage();
    if (input != null) {
      state = state.copyWith(attachments: [...state.attachments, input]);
    }
  }

  Future<void> pickFile() async {
    final input = await _multimodalManager.pickFile();
    if (input != null) {
      state = state.copyWith(attachments: [...state.attachments, input]);
    }
  }

  void setAudioChunkCallback(void Function(Uint8List)? callback) {
    _multimodalManager.setAudioChunkCallback(callback);
  }

  Future<void> startAudioRecording() async {
    final hasPermission = await _multimodalManager.hasAudioPermission();
    if (!hasPermission) {
      state = state.copyWith(errorMessage: 'Microphone permission denied');
      return;
    }
    final path = await _multimodalManager.startAudioRecording();
    if (path != null) {
      state = state.copyWith(isRecordingAudio: true);
    }
  }

  Future<void> stopAudioRecording() async {
    final input = await _multimodalManager.stopAudioRecording();
    state = state.copyWith(isRecordingAudio: false);
    if (input != null) {
      state = state.copyWith(attachments: [...state.attachments, input]);
    }
  }

  void removeAttachment(int index) {
    final attachments = List<MultimodalInput>.from(state.attachments);
    if (index >= 0 && index < attachments.length) {
      attachments.removeAt(index);
      state = state.copyWith(attachments: attachments);
    }
  }

  void clearAttachments() {
    state = state.copyWith(attachments: []);
  }

  void sendGreeting() {
    const greeting = '你好，我是Shadow，有什么可以帮你的吗？';
    state = state.copyWith(
      messages: [
        ...state.messages,
        ChatMessageModel(greeting, ChatRole.assistant),
      ],
    );
  }

  Future<void> generateResponse(String prompt) async {
    if (prompt.isEmpty || state.isLoading) return;

    if (state.mode == ChatMode.litert && state.isLitertReady) {
      await _generateLitertResponse(prompt, []);
    }
  }

  Future<void> generateResponseWithAttachments(
    String prompt,
    List<MultimodalInput> attachments,
  ) async {
    if (state.isLoading) return;

    if (state.mode == ChatMode.litert && state.isLitertReady) {
      final hasImage = attachments.any(
        (a) =>
            a.type == MultimodalInputType.image ||
            a.type == MultimodalInputType.camera,
      );
      if (hasImage) {
        state = state.copyWith(
          errorMessage: 'LiteRT 图片功能暂时不可用，请等待版本更新',
          errorMessageL10nKey: ChatStateL10nKey.errorGeneric,
        );
        return;
      }
      await _generateLitertResponse(prompt, attachments);
    }
  }

  Future<void> processAudioSegment(List<double> audioSamples) async {
    if (state.isLoading) return;
    if (!state.isLitertReady) return;

    final audioLength = audioSamples.length;
    state = state.copyWith(
      messages: [
        ...state.messages,
        ChatMessageModel('[Voice: $audioLength samples]', ChatRole.user),
      ],
    );

    state = state.copyWith(isLoading: true);

    String response;
    try {
      if (_litertEngine.isInitialized) {
        response = await _litertEngine.generateContent('请简短回复: 用户发送了语音消息');
      } else {
        response = '语音功能需要先加载模型';
      }
    } catch (e) {
      response = '抱歉，发生了错误: $e';
    }

    state = state.copyWith(
      messages: [
        ...state.messages,
        ChatMessageModel(response, ChatRole.assistant),
      ],
      isLoading: false,
    );

    await _ttsEngine.speak(response);
  }

  Future<void> processAudioSegmentAndContinue(
    List<double> audioSamples,
    Future<void> Function() onComplete,
  ) async {
    if (state.isLoading) return;
    if (!state.isLitertReady) return;

    final audioLength = audioSamples.length;
    state = state.copyWith(
      messages: [
        ...state.messages,
        ChatMessageModel('[Voice: $audioLength samples]', ChatRole.user),
      ],
    );

    state = state.copyWith(isLoading: true, voiceState: VoiceState.processing);

    String response;
    try {
      if (_litertEngine.isInitialized) {
        response = await _litertEngine.generateContent('用户发送了语音消息，请简短回复');
      } else {
        response = '语音功能需要先加载模型';
      }
    } catch (e) {
      response = '抱歉，发生了错误';
    }

    state = state.copyWith(
      messages: [
        ...state.messages,
        ChatMessageModel(response, ChatRole.assistant),
      ],
      isLoading: false,
      voiceState: VoiceState.speaking,
    );

    await _ttsEngine.speak(response);
    state = state.copyWith(voiceState: VoiceState.idle);
    await onComplete();
  }

  Future<void> _generateLitertResponse(
    String prompt,
    List<MultimodalInput> attachments,
  ) async {
    String displayContent = prompt;
    String? attachmentPath;
    MultimodalInputType? attachmentType;

    if (attachments.isNotEmpty) {
      final first = attachments.first;
      attachmentPath = first.path;
      attachmentType = first.type;
      if (prompt.isEmpty) {
        switch (first.type) {
          case MultimodalInputType.audio:
            displayContent = '[Audio]';
            break;
          case MultimodalInputType.voice:
            displayContent = '[Voice]';
            break;
          case MultimodalInputType.image:
          case MultimodalInputType.camera:
            displayContent = '[Image]';
            break;
          case MultimodalInputType.video:
            displayContent = '[Video]';
            break;
          case MultimodalInputType.file:
            final fileName = first.path?.split('/').last;
            displayContent = fileName ?? '[File]';
            break;
        }
      }
    }

    state = state.copyWith(
      messages: [
        ...state.messages,
        ChatMessageModel(
          displayContent,
          ChatRole.user,
          attachmentPath: attachmentPath,
          attachmentType: attachmentType,
        ),
      ],
      isLoading: true,
      errorMessage: null,
    );

    try {
      String response = '';
      bool httpSuccess = false;

      if (attachments.isEmpty) {
        try {
          _currentSessionId ??= (await _prefrontalClient.createSession()).id;
          if (_currentSessionId != null) {
            await _prefrontalClient.addSessionMessage(
              sessionId: _currentSessionId!,
              role: 'user',
              content: prompt,
            );

            StringBuffer streamedResponse = StringBuffer();
            state = state.copyWith(streamingText: '');

            await for (final chunk in _prefrontalClient.processMessageStream(
              sessionId: _currentSessionId!,
              message: prompt,
              useTools: false,
            )) {
              if (chunk.startsWith('error:')) {
                throw Exception(chunk);
              }
              streamedResponse.write(chunk);
              state = state.copyWith(
                streamingText: streamedResponse.toString(),
              );
            }

            response = streamedResponse.toString();
            httpSuccess = true;
          }
        } catch (e) {
          state = state.copyWith(streamingText: '');
        }
      }

      if (!httpSuccess) {
        if (attachments.isNotEmpty) {
          final attachmentData = await _convertAttachmentsToLitertFormat(
            attachments,
          );
          response = await _litertEngine.generateContentWithAttachments(
            prompt,
            attachmentData,
          );
        } else {
          response = await _litertEngine.generateContent(prompt);
        }
      }

      state = state.copyWith(
        messages: [
          ...state.messages,
          ChatMessageModel(response, ChatRole.assistant),
        ],
        isLoading: false,
        attachments: [],
        streamingText: '',
      );
      await _ttsEngine.speak(response);
    } catch (e) {
      state = state.copyWith(
        errorMessage: 'Error: $e',
        errorMessageL10nKey: ChatStateL10nKey.errorGeneric,
        errorMessageArg: e.toString(),
        messages: [
          ...state.messages,
          ChatMessageModel('Error: $e', ChatRole.system),
        ],
        isLoading: false,
        attachments: [],
        streamingText: '',
      );
    }
  }

  Future<List<Map<String, dynamic>>> _convertAttachmentsToLitertFormat(
    List<MultimodalInput> attachments,
  ) async {
    final result = <Map<String, dynamic>>[];

    for (final attachment in attachments) {
      Uint8List? bytes;

      if (attachment.data is Uint8List) {
        bytes = attachment.data as Uint8List;
      } else if (attachment.path != null) {
        final file = File(attachment.path!);
        if (await file.exists()) {
          bytes = await file.readAsBytes();
        }
      }

      if (bytes != null) {
        final base64Data = base64Encode(bytes);

        switch (attachment.type) {
          case MultimodalInputType.audio:
            result.add({'audio': base64Data, 'mimeType': 'audio/pcm'});
            break;
          case MultimodalInputType.image:
          case MultimodalInputType.camera:
            result.add({'image': base64Data, 'mimeType': 'image/jpeg'});
            break;
          default:
            break;
        }
      }
    }

    return result;
  }

  Future<void> speakLastResponse() async {
    final lastAssistant = state.messages.lastWhere(
      (m) => m.role == ChatRole.assistant,
      orElse: () => ChatMessageModel('', ChatRole.assistant),
    );
    if (lastAssistant.content.isNotEmpty) {
      await _ttsEngine.speak(lastAssistant.content);
    }
  }

  Future<void> playVoiceMessage(int index) async {
    if (index < 0 || index >= state.messages.length) return;
    final message = state.messages[index];
    if (message.attachmentType != MultimodalInputType.voice &&
        message.attachmentType != MultimodalInputType.audio) {
      return;
    }
    await _ttsEngine.speak(
      message.content.isNotEmpty ? message.content : 'Audio message',
    );
  }

  Future<void> setMode(ChatMode mode) async {
    if (mode == ChatMode.litert && !state.isLitertReady) {
      await initLitert();
    }
    state = state.copyWith(mode: mode);
  }

  Future<void> reset() async {
    await _litertEngine.release();
    await _multimodalManager.dispose();
    state = const ChatState();
    await _initLiteRT();
  }

  void clearError() {
    state = state.copyWith(errorMessage: null);
  }
}

/// Provider for ModelManager (singleton)
final modelManagerProvider = Provider<ModelManager>((ref) {
  return ModelManager();
});

/// Provider for LitertEngine
final litertEngineProvider = Provider<LitertEngine>((ref) {
  return LitertEngine();
});

/// Provider for TtsEngine
final ttsEngineProvider = Provider<TtsEngine>((ref) {
  return TtsEngine();
});

/// Provider for ChatNotifier
final chatProvider = StateNotifierProvider<ChatNotifier, ChatState>((ref) {
  return ChatNotifier(
    ref.watch(litertEngineProvider),
    ref.watch(ttsEngineProvider),
    ref.watch(prefrontalClientProvider),
  );
});

/// Provider for MultimodalInputManager
final multimodalInputManagerProvider = Provider<MultimodalInputManager>((ref) {
  return MultimodalInputManager();
});

/// Provider for selected model ID
final selectedModelIdProvider = StateProvider<String?>((ref) => null);

/// Provider for model list (notifies on changes)
final modelListProvider = Provider<List<ModelItem>>((ref) {
  final modelManager = ref.watch(modelManagerProvider);
  return modelManager.models;
});

/// Provider for available agents
final availableAgentsProvider = Provider<List<Agent>>((ref) {
  return Agents.allAgents;
});
