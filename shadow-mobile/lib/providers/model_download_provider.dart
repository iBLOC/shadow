import 'dart:io';
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

/// Notifier for model store - handles model downloads
class ModelStoreNotifier extends StateNotifier<ModelStoreState> {
  final LiteRTDownloadService _downloadService = LiteRTDownloadService();

  // Lock set to prevent concurrent downloads of the same model
  final Set<String> _downloadLocks = {};

  ModelStoreNotifier() : super(const ModelStoreState());

  /// Fetch available models
  Future<void> fetchAvailableModels() async {
    state = state.copyWith(isLoading: false, availableModels: []);
  }

  /// Download a model with progress tracking
  Future<String?> downloadModel(ModelInfo model) async {
    // 使用锁防止同一模型的并发下载
    if (_downloadLocks.contains(model.modelId)) {
      return null; // 已在下载中
    }
    _downloadLocks.add(model.modelId);

    try {
      // Check if already downloading
      final existingProgress = state.downloadProgress[model.modelId];
      if (existingProgress?.isDownloading == true) {
        return null; // Already downloading
      }

      // Initialize progress state
      final initialProgress = DownloadProgress(
        modelId: model.modelId,
        modelName: model.name,
        isDownloading: true,
        progress: 0.0,
      );

      final newProgressMap = Map<String, DownloadProgress>.from(
        state.downloadProgress,
      );
      newProgressMap[model.modelId] = initialProgress;
      state = state.copyWith(downloadProgress: newProgressMap);

      try {
        // Get model path and download URL
        final modelPath = await _getModelPath(model);
        final downloadUrl = model.url.isNotEmpty
            ? model.url
            : _buildDownloadUrl(model.modelId);

        final path = await _downloadService.downloadModel(
          modelPath: modelPath,
          downloadUrl: downloadUrl,
          onProgress: (progress) {
            _updateProgress(model.modelId, progress: progress);
          },
        );

        if (path != null) {
          _updateProgress(model.modelId, progress: 1.0, isComplete: true);
          return path;
        } else {
          final error = _downloadService.lastError ?? 'Unknown error';
          _updateProgress(model.modelId, error: error, isDownloading: false);
          return null;
        }
      } catch (e) {
        _updateProgress(
          model.modelId,
          error: e.toString(),
          isDownloading: false,
        );
        return null;
      }
    } finally {
      _downloadLocks.remove(model.modelId);
    }
  }

  void _updateProgress(
    String modelId, {
    double? progress,
    bool? isDownloading,
    bool? isComplete,
    String? error,
    String? modelName,
  }) {
    final existing = state.downloadProgress[modelId];

    // 防御性检查：如果不存在，创建一个新的
    DownloadProgress updated;
    if (existing == null) {
      // 创建一个新的 DownloadProgress
      updated = DownloadProgress(
        modelId: modelId,
        modelName: modelName ?? 'Unknown',
        progress: progress ?? 0.0,
        isDownloading: isDownloading ?? false,
        isComplete: isComplete ?? false,
        error: error,
      );
    } else {
      updated = existing.copyWith(
        progress: progress,
        isDownloading: isDownloading,
        isComplete: isComplete,
        error: error,
      );
    }

    final newProgressMap = Map<String, DownloadProgress>.from(
      state.downloadProgress,
    );
    newProgressMap[modelId] = updated;
    state = state.copyWith(downloadProgress: newProgressMap);
  }

  Future<String> _getModelPath(ModelInfo model) async {
    // Import path_provider at top of file
    final appDir = await getApplicationDocumentsDirectory();
    final modelDir = Directory('${appDir.path}/models');
    if (!await modelDir.exists()) {
      await modelDir.create(recursive: true);
    }
    return '${modelDir.path}/${model.modelName}.litertlm';
  }

  String _buildDownloadUrl(String modelId) {
    // 优先使用 ModelScope（国内镜像，速度更快）
    // HuggingFace 仓库: litert-community/gemma-4-E2B-it-litert-lm
    return 'https://modelscope.cn/models/litert-community/gemma-4-E2B-it-litert-lm/resolve/master/gemma-4-E2B-it.litertlm';
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
