/// Model configuration for MNN LLM
/// Based on MNN example's ModelConfig
class ModelConfig {
  // Model paths
  final String name;
  final String modelPath;
  final String? configPath;

  // Model settings
  final String? llmModel;
  final String? llmWeight;
  final String? backendType; // CPU, OpenCL, Metal
  final int threadNum;
  final String? precision; // low, medium, high
  final bool useMmap;
  final String? memory;

  // Sampling settings
  final String? samplerType;
  final List<String>? mixedSamplers;
  final double temperature;
  final double topP;
  final int topK;
  final double minP;
  final double? tfsZ;
  final double? typical;
  final double? penalty;
  final int? nGram;
  final double? nGramFactor;

  // Generation settings
  final int maxNewTokens;
  final String? systemPrompt;
  final String? assistantPromptTemplate;
  final String? penaltySampler;

  // Thinking settings
  final bool enableThinking;

  // Vision/Diffusion settings (for VLM models)
  final String? visualModel;
  final String? diffusionMemoryMode;
  final int? diffusionSteps;
  final int? imageWidth;
  final int? imageHeight;
  final int? diffusionSeed;
  final String? cfgPrompt;
  final int? gridSize;

  const ModelConfig({
    required this.name,
    required this.modelPath,
    this.configPath,
    this.llmModel,
    this.llmWeight,
    this.backendType,
    this.threadNum = 4,
    this.precision,
    this.useMmap = false,
    this.memory,
    this.samplerType,
    this.mixedSamplers,
    this.temperature = 0.6,
    this.topP = 0.95,
    this.topK = 20,
    this.minP = 0.05,
    this.tfsZ,
    this.typical,
    this.penalty,
    this.nGram,
    this.nGramFactor,
    this.maxNewTokens = 2048,
    this.systemPrompt,
    this.assistantPromptTemplate,
    this.penaltySampler,
    this.enableThinking = false,
    this.visualModel,
    this.diffusionMemoryMode,
    this.diffusionSteps,
    this.imageWidth,
    this.imageHeight,
    this.diffusionSeed,
    this.cfgPrompt,
    this.gridSize,
  });

  Map<String, dynamic> toJson() => {
    'name': name,
    'modelPath': modelPath,
    if (configPath != null) 'configPath': configPath,
    if (llmModel != null) 'llmModel': llmModel,
    if (llmWeight != null) 'llmWeight': llmWeight,
    if (backendType != null) 'backendType': backendType,
    'threadNum': threadNum,
    if (precision != null) 'precision': precision,
    'useMmap': useMmap,
    if (memory != null) 'memory': memory,
    if (samplerType != null) 'samplerType': samplerType,
    if (mixedSamplers != null) 'mixedSamplers': mixedSamplers,
    'temperature': temperature,
    'topP': topP,
    'topK': topK,
    'minP': minP,
    if (tfsZ != null) 'tfsZ': tfsZ,
    if (typical != null) 'typical': typical,
    if (penalty != null) 'penalty': penalty,
    if (nGram != null) 'nGram': nGram,
    if (nGramFactor != null) 'ngramFactor': nGramFactor,
    'maxNewTokens': maxNewTokens,
    if (systemPrompt != null) 'systemPrompt': systemPrompt,
    if (assistantPromptTemplate != null)
      'assistantPromptTemplate': assistantPromptTemplate,
    if (penaltySampler != null) 'penaltySampler': penaltySampler,
    'enableThinking': enableThinking,
    if (visualModel != null) 'visualModel': visualModel,
    if (diffusionMemoryMode != null) 'diffusionMemoryMode': diffusionMemoryMode,
    if (diffusionSteps != null) 'diffusionSteps': diffusionSteps,
    if (imageWidth != null) 'imageWidth': imageWidth,
    if (imageHeight != null) 'imageHeight': imageHeight,
    if (diffusionSeed != null) 'diffusionSeed': diffusionSeed,
    if (cfgPrompt != null) 'cfgPrompt': cfgPrompt,
    if (gridSize != null) 'gridSize': gridSize,
  };

  factory ModelConfig.fromJson(Map<String, dynamic> json) => ModelConfig(
    name: json['name'] as String,
    modelPath: json['modelPath'] as String,
    configPath: json['configPath'] as String?,
    llmModel: json['llmModel'] as String?,
    llmWeight: json['llmWeight'] as String?,
    backendType: json['backendType'] as String?,
    threadNum: json['threadNum'] as int? ?? 4,
    precision: json['precision'] as String?,
    useMmap: json['useMmap'] as bool? ?? false,
    memory: json['memory'] as String?,
    samplerType: json['samplerType'] as String?,
    mixedSamplers: (json['mixedSamplers'] as List<dynamic>?)?.cast<String>(),
    temperature: (json['temperature'] as num?)?.toDouble() ?? 0.6,
    topP: (json['topP'] as num?)?.toDouble() ?? 0.95,
    topK: json['topK'] as int? ?? 20,
    minP: (json['minP'] as num?)?.toDouble() ?? 0.05,
    tfsZ: (json['tfsZ'] as num?)?.toDouble(),
    typical: (json['typical'] as num?)?.toDouble(),
    penalty: (json['penalty'] as num?)?.toDouble(),
    nGram: json['nGram'] as int?,
    nGramFactor: (json['ngramFactor'] as num?)?.toDouble(),
    maxNewTokens: json['maxNewTokens'] as int? ?? 2048,
    systemPrompt: json['systemPrompt'] as String?,
    assistantPromptTemplate: json['assistantPromptTemplate'] as String?,
    penaltySampler: json['penaltySampler'] as String?,
    enableThinking: json['enableThinking'] as bool? ?? false,
    visualModel: json['visualModel'] as String?,
    diffusionMemoryMode: json['diffusionMemoryMode'] as String?,
    diffusionSteps: json['diffusionSteps'] as int?,
    imageWidth: json['imageWidth'] as int?,
    imageHeight: json['imageHeight'] as int?,
    diffusionSeed: json['diffusionSeed'] as int?,
    cfgPrompt: json['cfgPrompt'] as String?,
    gridSize: json['gridSize'] as int?,
  );

  ModelConfig copyWith({
    String? name,
    String? modelPath,
    String? configPath,
    String? llmModel,
    String? llmWeight,
    String? backendType,
    int? threadNum,
    String? precision,
    bool? useMmap,
    String? memory,
    String? samplerType,
    List<String>? mixedSamplers,
    double? temperature,
    double? topP,
    int? topK,
    double? minP,
    double? tfsZ,
    double? typical,
    double? penalty,
    int? nGram,
    double? nGramFactor,
    int? maxNewTokens,
    String? systemPrompt,
    String? assistantPromptTemplate,
    String? penaltySampler,
    bool? enableThinking,
    String? visualModel,
    String? diffusionMemoryMode,
    int? diffusionSteps,
    int? imageWidth,
    int? imageHeight,
    int? diffusionSeed,
    String? cfgPrompt,
    int? gridSize,
  }) {
    return ModelConfig(
      name: name ?? this.name,
      modelPath: modelPath ?? this.modelPath,
      configPath: configPath ?? this.configPath,
      llmModel: llmModel ?? this.llmModel,
      llmWeight: llmWeight ?? this.llmWeight,
      backendType: backendType ?? this.backendType,
      threadNum: threadNum ?? this.threadNum,
      precision: precision ?? this.precision,
      useMmap: useMmap ?? this.useMmap,
      memory: memory ?? this.memory,
      samplerType: samplerType ?? this.samplerType,
      mixedSamplers: mixedSamplers ?? this.mixedSamplers,
      temperature: temperature ?? this.temperature,
      topP: topP ?? this.topP,
      topK: topK ?? this.topK,
      minP: minP ?? this.minP,
      tfsZ: tfsZ ?? this.tfsZ,
      typical: typical ?? this.typical,
      penalty: penalty ?? this.penalty,
      nGram: nGram ?? this.nGram,
      nGramFactor: nGramFactor ?? this.nGramFactor,
      maxNewTokens: maxNewTokens ?? this.maxNewTokens,
      systemPrompt: systemPrompt ?? this.systemPrompt,
      assistantPromptTemplate:
          assistantPromptTemplate ?? this.assistantPromptTemplate,
      penaltySampler: penaltySampler ?? this.penaltySampler,
      enableThinking: enableThinking ?? this.enableThinking,
      visualModel: visualModel ?? this.visualModel,
      diffusionMemoryMode: diffusionMemoryMode ?? this.diffusionMemoryMode,
      diffusionSteps: diffusionSteps ?? this.diffusionSteps,
      imageWidth: imageWidth ?? this.imageWidth,
      imageHeight: imageHeight ?? this.imageHeight,
      diffusionSeed: diffusionSeed ?? this.diffusionSeed,
      cfgPrompt: cfgPrompt ?? this.cfgPrompt,
      gridSize: gridSize ?? this.gridSize,
    );
  }

  /// Default configuration for new models
  static ModelConfig defaultConfig() => const ModelConfig(
    name: 'Default Model',
    modelPath: 'assets/models',
    configPath: 'assets/models/config.json',
    threadNum: 4,
    precision: 'low',
    useMmap: false,
    samplerType: 'topK',
    mixedSamplers: ['topK', 'topP', 'minP', 'temperature'],
    temperature: 0.6,
    topP: 0.95,
    topK: 20,
    minP: 0.05,
    tfsZ: 1.0,
    typical: 0.95,
    penalty: 1.02,
    nGram: 8,
    nGramFactor: 1.02,
    maxNewTokens: 2048,
    systemPrompt: 'You are a helpful assistant.',
    penaltySampler: 'greedy',
    enableThinking: false,
  );

  /// Convert to MNN config JSON format
  String toMnnConfigJson() {
    final Map<String, dynamic> config = {
      if (llmModel != null) 'llm_model': llmModel,
      if (llmWeight != null) 'llm_weight': llmWeight,
      if (backendType != null) 'backend_type': backendType,
      'thread_num': threadNum,
      if (precision != null) 'precision': precision,
      'use_mmap': useMmap,
      if (memory != null) 'memory': memory,
      if (systemPrompt != null) 'system_prompt': systemPrompt,
      if (samplerType != null) 'sampler_type': samplerType,
      if (mixedSamplers != null) 'mixed_samplers': mixedSamplers,
      'temperature': temperature,
      'topP': topP,
      'topK': topK,
      'minP': minP,
      if (tfsZ != null) 'tfsZ': tfsZ,
      if (typical != null) 'typical': typical,
      if (penalty != null) 'penalty': penalty,
      if (nGram != null) 'n_gram': nGram,
      if (nGramFactor != null) 'ngram_factor': nGramFactor,
      'max_new_tokens': maxNewTokens,
      if (assistantPromptTemplate != null)
        'assistant_prompt_template': assistantPromptTemplate,
      if (penaltySampler != null) 'penalty_sampler': penaltySampler,
      if (visualModel != null) 'visual_model': visualModel,
      if (diffusionMemoryMode != null)
        'diffusion_memory_mode': diffusionMemoryMode,
      if (diffusionSteps != null) 'diffusion_steps': diffusionSteps,
      if (imageWidth != null) 'image_width': imageWidth,
      if (imageHeight != null) 'image_height': imageHeight,
      if (diffusionSeed != null) 'diffusion_seed': diffusionSeed,
      if (cfgPrompt != null) 'cfg_prompt': cfgPrompt,
      if (gridSize != null) 'grid_size': gridSize,
    };

    // Add thinking config if enabled
    if (enableThinking) {
      config['jinja'] = {
        'context': {'enable_thinking': true},
      };
    }

    return _encodeJson(config);
  }

  String _encodeJson(Map<String, dynamic> map) {
    final buffer = StringBuffer();
    _writeJson(buffer, map, 0);
    return buffer.toString();
  }

  void _writeJson(StringBuffer buffer, dynamic value, int indent) {
    final prefix = '  ' * indent;
    if (value == null) {
      buffer.write('null');
    } else if (value is bool) {
      buffer.write(value.toString());
    } else if (value is num) {
      buffer.write(value.toString());
    } else if (value is String) {
      buffer.write('"$value"');
    } else if (value is List) {
      buffer.write('[\n');
      for (var i = 0; i < value.length; i++) {
        buffer.write('$prefix  ');
        _writeJson(buffer, value[i], indent + 1);
        if (i < value.length - 1) buffer.write(',');
        buffer.write('\n');
      }
      buffer.write('$prefix]');
    } else if (value is Map) {
      buffer.write('{\n');
      final entries = value.entries.toList();
      for (var i = 0; i < entries.length; i++) {
        buffer.write('$prefix  "${entries[i].key}": ');
        _writeJson(buffer, entries[i].value, indent + 1);
        if (i < entries.length - 1) buffer.write(',');
        buffer.write('\n');
      }
      buffer.write('$prefix}');
    }
  }
}

/// Backend type enum
enum BackendType {
  cpu(0, 'CPU'),
  opencl(1, 'OpenCL'),
  metal(2, 'Metal');

  final int value;
  final String name;
  const BackendType(this.value, this.name);

  static BackendType fromValue(int value) {
    return BackendType.values.firstWhere(
      (e) => e.value == value,
      orElse: () => BackendType.cpu,
    );
  }
}

/// Model type enum
enum ModelType {
  text('text', 'Text Model'),
  vision('vision', 'Vision Model'),
  diffusion('diffusion', 'Diffusion Model'),
  asr('asr', 'ASR Model');

  final String value;
  final String displayName;
  const ModelType(this.value, this.displayName);
}
