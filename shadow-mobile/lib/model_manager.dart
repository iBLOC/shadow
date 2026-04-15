import 'features/models/screens/model_list_screen.dart';
import 'model_config.dart';

/// Model manager for handling model loading and switching
class ModelManager {
  static final ModelManager _instance = ModelManager._internal();
  factory ModelManager() => _instance;
  ModelManager._internal();

  ModelConfig? _currentModel;
  bool _isModelLoaded = false;

  // List of all available models (local + cloud)
  final List<ModelItem> _models = [];

  // Current model configuration
  ModelConfig? _currentConfig;

  // Callback when model is loaded
  void Function(ModelItem)? onModelLoaded;

  ModelConfig? get currentModel => _currentModel;
  bool get isModelLoaded => _isModelLoaded;
  List<ModelItem> get models => List.unmodifiable(_models);
  ModelConfig? get currentConfig => _currentConfig;

  /// Initialize with default models
  void initializeDefaultModels() {
    // Add default local models
    _models.addAll([
      const ModelItem(
        id: 'local_1',
        name: 'Qwen2.5-0.5B',
        path: 'assets/models/qwen2.5-0.5b',
        type: 'text',
        size: 1024,
        isLoaded: true,
        isLocal: true,
      ),
      const ModelItem(
        id: 'local_2',
        name: 'Qwen2.5-1.5B',
        path: 'assets/models/qwen2.5-1.5b',
        type: 'text',
        size: 3072,
        isLoaded: false,
        isLocal: true,
      ),
      const ModelItem(
        id: 'local_3',
        name: 'Qwen2-VL-2B',
        path: 'assets/models/qwen2-vl-2b',
        type: 'vision',
        size: 4608,
        isLoaded: false,
        isLocal: true,
      ),
    ]);
  }

  /// Add a local running model to the list (called when MNN loads a model)
  void addLocalRunningModel({
    required String id,
    required String name,
    required String path,
    String type = 'text',
    int size = 0,
  }) {
    // Check if model already exists
    final exists = _models.any((m) => m.id == id);
    if (!exists) {
      _models.add(
        ModelItem(
          id: id,
          name: name,
          path: path,
          type: type,
          size: size,
          isLoaded: true,
          isLocal: true,
        ),
      );
      onModelLoaded?.call(_models.last);
    } else {
      // Update existing model to loaded state
      final index = _models.indexWhere((m) => m.id == id);
      if (index != -1) {
        _models[index] = _models[index].copyWith(isLoaded: true);
        onModelLoaded?.call(_models[index]);
      }
    }
  }

  /// Add a cloud model to the list
  void addCloudModel({
    required String id,
    required String name,
    required String endpoint,
    String apiKey = '',
    String model = '',
  }) {
    final exists = _models.any((m) => m.id == id);
    if (!exists) {
      _models.add(
        ModelItem(
          id: id,
          name: name,
          path: endpoint,
          type: 'text',
          size: 0,
          isLoaded: false,
          isLocal: false,
          endpoint: endpoint,
          apiKey: apiKey,
          model: model,
        ),
      );
    }
  }

  /// Remove a model from the list
  void removeModel(String id) {
    _models.removeWhere((m) => m.id == id);
  }

  /// Get model by ID
  ModelItem? getModelById(String id) {
    try {
      return _models.firstWhere((m) => m.id == id);
    } catch (_) {
      return null;
    }
  }

  /// Set current model configuration
  void setCurrentConfig(ModelConfig config) {
    _currentConfig = config;
  }

  /// Load a model configuration
  Future<bool> loadModel(ModelConfig config) async {
    _currentModel = config;
    _currentConfig = config;
    _isModelLoaded = true;

    // Auto-add to model list when loaded
    addLocalRunningModel(
      id: 'local_${DateTime.now().millisecondsSinceEpoch}',
      name: config.name,
      path: config.modelPath,
      type: config.visualModel != null ? 'vision' : 'text',
    );

    return true;
  }

  /// Unload the current model
  void unloadModel() {
    _currentModel = null;
    _currentConfig = null;
    _isModelLoaded = false;
  }

  /// Get available models from assets
  Future<List<ModelConfig>> getAvailableModels() async {
    return [ModelConfig.defaultConfig()];
  }

  /// Get backend type name
  static String getBackendName(int type) {
    switch (type) {
      case 0:
        return 'CPU';
      case 1:
        return 'OpenCL';
      case 2:
        return 'Metal';
      default:
        return 'Unknown';
    }
  }
}
