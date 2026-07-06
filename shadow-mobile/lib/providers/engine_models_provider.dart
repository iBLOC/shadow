import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

/// Phase of a model download task, as reported by 前额叶.
enum ModelDownloadPhase {
  pending,
  downloading,
  verifying,
  loading,
  ready,
  failed,
  unknown;

  static ModelDownloadPhase fromString(String s) {
    switch (s) {
      case 'pending':
        return ModelDownloadPhase.pending;
      case 'downloading':
        return ModelDownloadPhase.downloading;
      case 'verifying':
        return ModelDownloadPhase.verifying;
      case 'loading':
        return ModelDownloadPhase.loading;
      case 'ready':
        return ModelDownloadPhase.ready;
      case 'failed':
        return ModelDownloadPhase.failed;
      default:
        return ModelDownloadPhase.unknown;
    }
  }
}

/// A model that 前额叶 reports as loaded.
class EngineModel {
  final String modelId;
  final String engine;
  final String? localPath;
  final int sizeBytes;
  final DateTime loadedAt;
  final String source;

  EngineModel({
    required this.modelId,
    required this.engine,
    required this.localPath,
    required this.sizeBytes,
    required this.loadedAt,
    required this.source,
  });

  factory EngineModel.fromJson(Map<String, dynamic> j) {
    return EngineModel(
      modelId: j['model_id'] as String,
      engine: j['engine'] as String? ?? 'unknown',
      localPath: j['local_path'] as String?,
      sizeBytes: (j['size_bytes'] as num?)?.toInt() ?? 0,
      loadedAt: DateTime.tryParse(j['loaded_at'] as String? ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      source: j['source'] as String? ?? 'unknown',
    );
  }
}

/// A download task tracked by 前额叶.
class ModelDownloadTask {
  final String taskId;
  final String modelId;
  final String engine;
  final String reference;
  final ModelDownloadPhase phase;
  final double progress;
  final String? error;
  final String? localPath;
  final DateTime startedAt;
  final DateTime updatedAt;

  ModelDownloadTask({
    required this.taskId,
    required this.modelId,
    required this.engine,
    required this.reference,
    required this.phase,
    required this.progress,
    required this.error,
    required this.localPath,
    required this.startedAt,
    required this.updatedAt,
  });

  factory ModelDownloadTask.fromJson(Map<String, dynamic> j) {
    return ModelDownloadTask(
      taskId: j['task_id'] as String,
      modelId: j['model_id'] as String? ?? '',
      engine: j['engine'] as String? ?? '',
      reference: j['reference'] as String? ?? '',
      phase: ModelDownloadPhase.fromString(j['phase'] as String? ?? ''),
      progress: (j['progress'] as num?)?.toDouble() ?? 0.0,
      error: j['error'] as String?,
      localPath: j['local_path'] as String?,
      startedAt: DateTime.tryParse(j['started_at'] as String? ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      updatedAt: DateTime.tryParse(j['updated_at'] as String? ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
    );
  }
}

class EngineModelsState {
  final List<EngineModel> models;
  final List<ModelDownloadTask> tasks;
  final bool isLoading;
  final String? error;

  const EngineModelsState({
    this.models = const [],
    this.tasks = const [],
    this.isLoading = false,
    this.error,
  });

  EngineModelsState copyWith({
    List<EngineModel>? models,
    List<ModelDownloadTask>? tasks,
    bool? isLoading,
    String? error,
  }) {
    return EngineModelsState(
      models: models ?? this.models,
      tasks: tasks ?? this.tasks,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class EngineModelsNotifier extends StateNotifier<EngineModelsState> {
  final String _baseUrl;
  final http.Client _client;

  EngineModelsNotifier({String? baseUrl, http.Client? client})
      : _baseUrl = (baseUrl ?? _deriveBaseUrl()).replaceAll(RegExp(r'/+$'), ''),
        _client = client ?? http.Client(),
        super(const EngineModelsState());

  static String _deriveBaseUrl() {
    // Cortex is the single platform entry point (port 60000).
    // Neure is embedded at root: /v1/models, /v1/chat/completions, etc.
    return 'http://localhost:60000';
  }

  Future<void> refresh() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final models = await _listLoaded();
      final tasks = await _listTasks();
      state = state.copyWith(
        models: models,
        tasks: tasks,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<List<EngineModel>> _listLoaded() async {
    // Neure is embedded in cortex at root: /v1/models
    final r = await _client.get(Uri.parse('$_baseUrl/v1/models'));
    if (r.statusCode == 404) return const [];
    if (r.statusCode >= 400) {
      throw HttpException(r.statusCode, r.body);
    }
    final body = jsonDecode(r.body) as Map<String, dynamic>;
    final data = (body['data'] as List?) ?? const [];
    return data
        .cast<Map<String, dynamic>>()
        .map(EngineModel.fromJson)
        .toList();
  }

  Future<List<ModelDownloadTask>> _listTasks() async {
    // Tasks endpoint: poll the in-flight task list. Currently 前额叶
    // does not expose this as a list endpoint; we filter from the
    // streamed `started_at`-tagged tasks via the individual status
    // endpoint. For a v1 implementation, we simply read tasks from
    // each known id we tracked; since 前额叶 doesn't yet list
    // tasks, this returns empty. v2: add `GET /api/engine-models/tasks`.
    return const [];
  }

  Future<ModelDownloadTask> startDownload({
    String? modelId,
    required String engine,
    required String reference,
    String? revision,
    String? sha256,
  }) async {
    // Neure's POST /v1/models/pull returns { job_id, status }.
    final r = await _client.post(
      Uri.parse('$_baseUrl/v1/models/pull'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'id': modelId ?? '',
        'engine': engine,
        'reference': reference,
        if (revision != null) 'revision': revision,
      }),
    );
    if (r.statusCode >= 400) {
      throw HttpException(r.statusCode, r.body);
    }
    final body = jsonDecode(r.body) as Map<String, dynamic>;
    final task = ModelDownloadTask.fromJson(body);
    state = state.copyWith(tasks: [...state.tasks, task]);
    return task;
  }

  Future<ModelDownloadTask> pollDownload(String taskId) async {
    final r = await _client.get(
      Uri.parse('$_baseUrl/v1/models/pull/$taskId'),
    );
    if (r.statusCode == 404) {
      throw HttpException(404, 'task $taskId not found');
    }
    if (r.statusCode >= 400) {
      throw HttpException(r.statusCode, r.body);
    }
    final body = jsonDecode(r.body) as Map<String, dynamic>;
    return ModelDownloadTask.fromJson(body);
  }

  Future<void> releaseModel(String modelId) async {
    // Neure's DELETE /v1/models/all/{id} removes a downloaded model.
    final r = await _client.delete(
      Uri.parse('$_baseUrl/v1/models/all/$modelId'),
    );
    if (r.statusCode >= 400) {
      throw HttpException(r.statusCode, r.body);
    }
    state = state.copyWith(
      models: state.models.where((m) => m.modelId != modelId).toList(),
    );
  }

  Future<void> loadModel(String modelId) async {
    final r = await _client.post(
      Uri.parse('$_baseUrl/v1/models/$modelId/load'),
    );
    if (r.statusCode >= 400) {
      throw HttpException(r.statusCode, r.body);
    }
    await refresh();
  }
}

class HttpException implements Exception {
  final int statusCode;
  final String body;
  HttpException(this.statusCode, this.body);

  @override
  String toString() => 'HTTP $statusCode: $body';
}

final engineModelsProvider =
    StateNotifierProvider<EngineModelsNotifier, EngineModelsState>((ref) {
  final baseUrl = ref.watch(prefrontalBaseUrlProvider);
  return EngineModelsNotifier(baseUrl: baseUrl);
});

final prefrontalBaseUrlProvider = StateProvider<String>((ref) => 'http://localhost:60000');
