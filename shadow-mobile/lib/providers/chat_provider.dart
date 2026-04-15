import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../mnn_engine.dart';
import '../model_manager.dart';
import '../features/models/screens/model_list_screen.dart';

/// Chat message model for the UI
class ChatMessageModel {
  final String content;
  final ChatRole role;

  ChatMessageModel(this.content, this.role);
}

enum ChatRole { user, assistant, system }

/// L10n keys for provider messages (resolved in UI with AppLocalizations).
enum ChatStateL10nKey {
  modelInfoNotInitialized,
  modelLoaded,
  desktopMode,
  errorMnnInitFailed,
  errorGeneric,
}

/// Chat state
class ChatState {
  final List<ChatMessageModel> messages;
  final bool isLoading;
  final bool isInitialized;
  final String modelInfo;
  final String? errorMessage;

  /// When set, UI should display modelInfo via l10n[modelInfoL10nKey].
  final ChatStateL10nKey? modelInfoL10nKey;

  /// When set, UI should display error via l10n (errorMessageL10nKey + errorMessageArg).
  final ChatStateL10nKey? errorMessageL10nKey;
  final String? errorMessageArg;

  const ChatState({
    this.messages = const [],
    this.isLoading = false,
    this.isInitialized = false,
    this.modelInfo = 'Not initialized',
    this.errorMessage,
    this.modelInfoL10nKey = ChatStateL10nKey.modelInfoNotInitialized,
    this.errorMessageL10nKey,
    this.errorMessageArg,
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
    );
  }
}

class _CopyWithOmit {
  const _CopyWithOmit();
}

/// Chat notifier
class ChatNotifier extends StateNotifier<ChatState> {
  final ModelManager _modelManager;

  ChatNotifier(this._modelManager) : super(const ChatState()) {
    _initMNN();
  }

  Future<void> _initMNN() async {
    if (!MNNEngine.isSupported) {
      state = state.copyWith(
        messages: [
          ...state.messages,
          ChatMessageModel(
            'MNN engine is only available on Android.\n'
            'This is a desktop build - local LLM features are disabled.\n'
            'You can still use cloud models.',
            ChatRole.system,
          ),
        ],
        isInitialized: false,
        modelInfo: 'Desktop mode (Android only)',
        modelInfoL10nKey: ChatStateL10nKey.desktopMode,
      );
      return;
    }

    state = state.copyWith(
      messages: [
        ...state.messages,
        ChatMessageModel('Initializing MNN engine...', ChatRole.system),
      ],
    );

    try {
      final success = await MNNEngine.initialize(
        modelPath: 'assets/models',
        threadNum: 4,
        backendType: 0,
      );

      if (success) {
        final modelLoaded = await MNNEngine.loadModel(
          'assets/models/config.json',
        );

        if (!modelLoaded) {
          state = state.copyWith(
            errorMessage: 'Failed to load MNN model',
            errorMessageL10nKey: ChatStateL10nKey.errorGeneric,
            messages: [
              ...state.messages,
              ChatMessageModel('Failed to load MNN model', ChatRole.system),
            ],
          );
          return;
        }

        final modelPath = 'assets/models';
        final modelName = modelPath.split('/').last;
        _modelManager.addLocalRunningModel(
          id: 'local_loaded',
          name: modelName,
          path: modelPath,
          type: 'text',
        );
        state = state.copyWith(
          isInitialized: true,
          modelInfo: 'Model loaded',
          modelInfoL10nKey: ChatStateL10nKey.modelLoaded,
          messages: [
            ...state.messages,
            ChatMessageModel(
              'MNN engine initialized successfully!\n'
              'Model loaded\n'
              'You can now start chatting.',
              ChatRole.system,
            ),
          ],
        );
      } else {
        state = state.copyWith(
          errorMessage: 'Failed to initialize MNN engine',
          errorMessageL10nKey: ChatStateL10nKey.errorMnnInitFailed,
          messages: [
            ...state.messages,
            ChatMessageModel(
              'Failed to initialize MNN engine',
              ChatRole.system,
            ),
          ],
        );
      }
    } catch (e) {
      state = state.copyWith(
        errorMessage: 'Error: $e',
        errorMessageL10nKey: ChatStateL10nKey.errorGeneric,
        errorMessageArg: e.toString(),
        messages: [
          ...state.messages,
          ChatMessageModel('Error: $e', ChatRole.system),
        ],
      );
    }
  }

  Future<void> generateResponse(String prompt) async {
    if (prompt.isEmpty || state.isLoading || !state.isInitialized) return;

    state = state.copyWith(
      messages: [...state.messages, ChatMessageModel(prompt, ChatRole.user)],
      isLoading: true,
      errorMessage: null,
    );

    try {
      final response = await MNNEngine.generate(prompt);
      state = state.copyWith(
        messages: [
          ...state.messages,
          ChatMessageModel(response, ChatRole.assistant),
        ],
        isLoading: false,
      );
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
      );
    }
  }

  Future<void> reset() async {
    await MNNEngine.release();
    state = const ChatState();
    await _initMNN();
  }

  void clearError() {
    state = state.copyWith(errorMessage: null);
  }
}

/// Provider for ModelManager (singleton)
final modelManagerProvider = Provider<ModelManager>((ref) {
  return ModelManager();
});

/// Provider for ChatNotifier
final chatProvider = StateNotifierProvider<ChatNotifier, ChatState>((ref) {
  final modelManager = ref.watch(modelManagerProvider);
  return ChatNotifier(modelManager);
});

/// Provider for selected model ID
final selectedModelIdProvider = StateProvider<String?>((ref) => null);

/// Provider for model list (notifies on changes)
final modelListProvider = Provider<List<ModelItem>>((ref) {
  final modelManager = ref.watch(modelManagerProvider);
  return modelManager.models;
});
