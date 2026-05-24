import 'package:flutter_riverpod/flutter_riverpod.dart';
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

/// Notifier for model store - ML Kit handles models automatically
class ModelStoreNotifier extends StateNotifier<ModelStoreState> {
  ModelStoreNotifier() : super(const ModelStoreState());

  /// Fetch available models - ML Kit manages this automatically
  Future<void> fetchAvailableModels() async {
    // ML Kit handles model availability automatically
    // No need to fetch from server
    state = state.copyWith(isLoading: false, availableModels: []);
  }

  /// Download a model - ML Kit handles this automatically
  Future<String?> downloadModel(ModelInfo model) async {
    // ML Kit handles model download automatically
    return null;
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
      return ModelStoreNotifier();
    });

/// Provider to check if a specific model is downloading
final modelDownloadProgressProvider =
    Provider.family<DownloadProgress?, String>((ref, modelId) {
      final storeState = ref.watch(modelStoreProvider);
      return storeState.downloadProgress[modelId];
    });
