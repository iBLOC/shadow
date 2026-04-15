import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import '../services/model_download_service.dart';
import '../services/app_config_service.dart';

/// State for a single model's download progress
class DownloadProgress {
  final String modelId;
  final String modelName;
  final double progress;
  final bool isDownloading;
  final bool isComplete;
  final String? error;

  const DownloadProgress({
    required this.modelId,
    required this.modelName,
    this.progress = 0.0,
    this.isDownloading = false,
    this.isComplete = false,
    this.error,
  });

  DownloadProgress copyWith({
    double? progress,
    bool? isDownloading,
    bool? isComplete,
    String? error,
  }) {
    return DownloadProgress(
      modelId: modelId,
      modelName: modelName,
      progress: progress ?? this.progress,
      isDownloading: isDownloading ?? this.isDownloading,
      isComplete: isComplete ?? this.isComplete,
      error: error,
    );
  }
}

/// State for the model store (server-available models)
class ModelStoreState {
  final List<ModelInfo> availableModels;
  final bool isLoading;
  final String? error;
  final Map<String, DownloadProgress> downloadProgress;

  const ModelStoreState({
    this.availableModels = const [],
    this.isLoading = false,
    this.error,
    this.downloadProgress = const {},
  });

  ModelStoreState copyWith({
    List<ModelInfo>? availableModels,
    bool? isLoading,
    String? error,
    Map<String, DownloadProgress>? downloadProgress,
  }) {
    return ModelStoreState(
      availableModels: availableModels ?? this.availableModels,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      downloadProgress: downloadProgress ?? this.downloadProgress,
    );
  }
}

/// Notifier for model store (fetching and downloading server models)
class ModelStoreNotifier extends StateNotifier<ModelStoreState> {
  final ModelDownloadService _downloadService;

  ModelStoreNotifier(this._downloadService) : super(const ModelStoreState());

  /// Fetch available models from the server
  Future<void> fetchAvailableModels() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final models = await _downloadService.fetchModelList();
      state = state.copyWith(availableModels: models, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// Download a model
  Future<String?> downloadModel(ModelInfo model) async {
    final modelId = model.modelId;

    // Initialize progress tracking
    state = state.copyWith(
      downloadProgress: {
        ...state.downloadProgress,
        modelId: DownloadProgress(
          modelId: modelId,
          modelName: model.name,
          isDownloading: true,
        ),
      },
    );

    try {
      // Get the app's documents directory for storing models
      final appDir = await getApplicationDocumentsDirectory();
      final modelDir = '${appDir.path}/models/${model.modelName}';

      // Download the model
      await _downloadService.downloadModel(
        model.url,
        modelDir,
        model.modelName,
        (received, total) {
          // Update progress
          final progress = total > 0 ? received / total : 0.0;
          state = state.copyWith(
            downloadProgress: {
              ...state.downloadProgress,
              modelId: state.downloadProgress[modelId]!.copyWith(
                progress: progress,
              ),
            },
          );
        },
      );

      // Mark as complete
      state = state.copyWith(
        downloadProgress: {
          ...state.downloadProgress,
          modelId: state.downloadProgress[modelId]!.copyWith(
            isDownloading: false,
            isComplete: true,
            progress: 1.0,
          ),
        },
      );

      return modelDir;
    } catch (e) {
      // Mark as error
      state = state.copyWith(
        downloadProgress: {
          ...state.downloadProgress,
          modelId: state.downloadProgress[modelId]!.copyWith(
            isDownloading: false,
            error: e.toString(),
          ),
        },
      );
      return null;
    }
  }

  /// Get download progress for a specific model
  DownloadProgress? getProgress(String modelId) {
    return state.downloadProgress[modelId];
  }

  /// Clear a completed download from tracking
  void clearDownload(String modelId) {
    final newProgress = Map<String, DownloadProgress>.from(
      state.downloadProgress,
    );
    newProgress.remove(modelId);
    state = state.copyWith(downloadProgress: newProgress);
  }
}

/// Provider for ModelDownloadService
final modelDownloadServiceProvider = Provider<ModelDownloadService>((ref) {
  final config = AppConfigService();
  return ModelDownloadService(baseUrl: config.modelStoreUrl);
});

/// Provider for AppConfigService
final appConfigServiceProvider = Provider<AppConfigService>((ref) {
  return AppConfigService();
});

/// Provider for ModelStoreNotifier
final modelStoreProvider =
    StateNotifierProvider<ModelStoreNotifier, ModelStoreState>((ref) {
      final downloadService = ref.watch(modelDownloadServiceProvider);
      return ModelStoreNotifier(downloadService);
    });

/// Provider to check if a specific model is downloading
final modelDownloadProgressProvider =
    Provider.family<DownloadProgress?, String>((ref, modelId) {
      final storeState = ref.watch(modelStoreProvider);
      return storeState.downloadProgress[modelId];
    });
