import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../services/app_config_service.dart';
import '../services/telencephalon/telencephalon_client.dart';
import 'telencephalon_provider.dart';

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
      loadedAt:
          DateTime.tryParse(j['loaded_at'] as String? ?? '') ??
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
      startedAt:
          DateTime.tryParse(j['started_at'] as String? ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      updatedAt:
          DateTime.tryParse(j['updated_at'] as String? ?? '') ??
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

/// 带上**全部**钥匙的 `http.Client` —— 这一半（`/v1/models*`）用的是**裸**

/// `http.Client`，而门现在罩住**整张面**（含 neuron's `/v1/*`）⇒ ⇒ 不递钥匙

/// 就是 401 ⇒ ⇒ 钥匙必须与**门形**一致（读门 = 影子锁 ∪ admin token）。

///

/// ⚠️ **一条规则、一处实现** —— 判据源 `telencephalon/src/api/door_policy.txt`

/// ⇒ 实现 `telencephalon::api::door`。

///

/// ⚠️ **拿不到就不带那个头** —— 绝不塞空串（空串会把门骗开）。

class _DoorClient extends http.BaseClient {

_DoorClient(this._inner);



final http.Client _inner;



Map<String, String> _doorHeaders() {

  final cfg = AppConfigService();

  final h = <String, String>{};

  final shadow = cfg.telencephalonShadowKey?.trim();

  if (shadow != null && shadow.isNotEmpty) h['X-Shadow-Key'] = shadow;

  final admin = cfg.telencephalonAdminToken?.trim();

  if (admin != null && admin.isNotEmpty) h['X-Admin-Token'] = admin;

  return h;

}



@override

Future<http.StreamedResponse> send(http.BaseRequest request) {

  request.headers.addAll(_doorHeaders());

  return _inner.send(request);

}

}

class EngineModelsNotifier extends StateNotifier<EngineModelsState> {
  /// 显式给定的大脑地址（测试用）。
  final String? _baseUrl;

  /// 动态取大脑地址的回调 —— 生产路径走它。
  ///
  /// ⚠️ **为什么不能把它定在构造那一刻**：端脑面的地址会变（内嵌大脑接管
  /// ⇒ 随机端口；用户改配置 ⇒ 换一台）⇒ 而 client 对象**恒定**
  /// （`telencephalonClientProvider` 返回同一个单例）⇒ ⇒ 若在构造时把
  /// 地址**读死**，用户改完设置这一半还在打老地址 ⇒ 「供应商来自新大脑、
  /// 本地模型来自老机器」—— 同一个页面两张脸。
  final String Function()? _baseUrlFn;

  final http.Client _client;

  EngineModelsNotifier({
    String? baseUrl,
    String Function()? baseUrlFn,
    http.Client? client,
  })  : _baseUrl = baseUrl,
        _baseUrlFn = baseUrlFn,
        _client = client ?? _DoorClient(http.Client()),
        super(const EngineModelsState());

  /// 当前的大脑地址 —— **现取**，不是构造时定死。
  String _base() {
    final raw = _baseUrl ?? _baseUrlFn?.call() ?? _deriveBaseUrl();
    return raw.replaceAll(RegExp(r'/+$'), '');
  }

/// 这一半正在打的大脑地址（给界面与测试看）。
  String get baseUrl => _base();

  /// 没给地址时的回退 —— 与 `telencephalonProvider` 的初始值**同源**
  /// （用户配了地址就用配的，没配才用回环默认值）。
  static String _deriveBaseUrl() {
    return AppConfigService().telencephalonBaseUrl ??
        TelencephalonClient.defaultBaseUrl;
  }

  Future<void> refresh() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final models = await _listLoaded();
      final tasks = await _listTasks();
      state = state.copyWith(models: models, tasks: tasks, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<List<EngineModel>> _listLoaded() async {
    // Neuron is embedded in telencephalon at root: /v1/models
    final r = await _client.get(Uri.parse('${_base()}/v1/models'));
    if (r.statusCode == 404) return const [];
    if (r.statusCode >= 400) {
      throw HttpException(r.statusCode, r.body);
    }
    final body = jsonDecode(r.body) as Map<String, dynamic>;
    final data = (body['data'] as List?) ?? const [];
    return data.cast<Map<String, dynamic>>().map(EngineModel.fromJson).toList();
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
    // Neuron's POST /v1/models/pull returns { job_id, status }.
    final r = await _client.post(
      Uri.parse('${_base()}/v1/models/pull'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'id': modelId ?? '',
        'engine': engine,
        'reference': reference,
        'revision': ?revision,
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
    final r = await _client.get(Uri.parse('${_base()}/v1/models/pull/$taskId'));
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
    // Neuron's DELETE /v1/models/all/{id} removes a downloaded model.
    final r = await _client.delete(
      Uri.parse('${_base()}/v1/models/all/$modelId'),
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
      Uri.parse('${_base()}/v1/models/$modelId/load'),
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

/// 本地模型面（neuron's `/v1/models*`）—— **端脑面**的一张面。
///
/// ⚠️ 地址**不许写死**（以前写死 `http://localhost:60080`）⇒ ⇒ ① 内嵌大脑
/// 接管时端脑面在**随机端口**上 ⇒ 这一半打错；② 用户把大脑配到远端 ⇒
/// 这一半还在打本机 ⇒ 「供应商来自新大脑、本地模型来自老机器」。
///
/// ⇒ ⇒ 跟**端脑面的真相源**走（与桌面的 `telencephalonClient.getBaseUrl()`
/// 同构）：client 对象恒定、地址可变 ⇒ ⇒ 用**回调**现取，不能构造时定死。
final engineModelsProvider =
    StateNotifierProvider<EngineModelsNotifier, EngineModelsState>((ref) {
      final client = ref.read(telencephalonClientProvider);
      return EngineModelsNotifier(baseUrlFn: () => client.baseUrl);
    });
