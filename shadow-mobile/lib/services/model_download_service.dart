import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

enum NetworkType { wifi, mobile, unknown }

class NetworkUtils {
  static Future<NetworkType> getNetworkType() async {
    final connectivity = await Connectivity().checkConnectivity();
    if (connectivity.contains(ConnectivityResult.wifi)) {
      return NetworkType.wifi;
    } else if (connectivity.contains(ConnectivityResult.mobile)) {
      return NetworkType.mobile;
    }
    return NetworkType.unknown;
  }

  static Future<bool> isWifi() async {
    return await getNetworkType() == NetworkType.wifi;
  }

  static Stream<List<ConnectivityResult>> watchConnectivity() {
    return Connectivity().onConnectivityChanged;
  }
}

class LiteRTDownloadService {
  bool _isDownloading = false;
  double _progress = 0.0;
  String? _lastError;
  String? _downloadPath;
  http.Client? _client;
  int _totalBytes = 0;
  int _downloadedBytes = 0;

  bool get isDownloading => _isDownloading;
  double get progress => _progress;
  String? get lastError => _lastError;
  String? get downloadPath => _downloadPath;
  int get totalBytes => _totalBytes;
  int get downloadedBytes => _downloadedBytes;

  /// 检查模型文件是否存在且完整
  Future<bool> isModelDownloaded(String modelPath) async {
    final file = File(modelPath);
    return await file.exists();
  }

  /// 获取已下载的文件大小（用于断点续传）
  Future<int> getDownloadedBytes(String modelPath) async {
    final file = File(modelPath);
    if (await file.exists()) {
      return await file.length();
    }
    return 0;
  }

  /// 删除不完整的下载文件
  Future<void> deleteIncompleteFile(String modelPath) async {
    final file = File(modelPath);
    if (await file.exists()) {
      await file.delete();
    }
  }

  /// 检查文件是否完整（通过比较文件大小与Content-Length）
  Future<bool> isFileComplete(String modelPath, int expectedSize) async {
    final file = File(modelPath);
    if (!await file.exists()) return false;
    final actualSize = await file.length();
    return actualSize >= expectedSize;
  }

  /// 从hf-mirror.com下载模型
  /// [modelPath] - 本地保存路径
  /// [downloadUrl] - hf-mirror.com上的模型URL
  /// [onProgress] - 进度回调 0.0-1.0
  /// [deleteIncompleteOnFailure] - 下载失败时是否删除不完整文件
  Future<String?> downloadModel({
    required String modelPath,
    required String downloadUrl,
    void Function(double progress)? onProgress,
    bool deleteIncompleteOnFailure = true,
  }) async {
    // 防止并发下载 - 使用立即设置标志来避免竞态条件
    if (_isDownloading) {
      _lastError = 'Download already in progress';
      return null;
    }

    // 立即设置标志，防止后续调用通过检查
    _isDownloading = true;
    _progress = 0.0;
    _lastError = null;
    _downloadPath = modelPath;
    _totalBytes = 0;
    _downloadedBytes = 0;

    try {
      _client = http.Client();

      // 获取app文件目录
      final appDir = await getApplicationDocumentsDirectory();
      final modelDir = Directory('${appDir.path}/models');
      if (!await modelDir.exists()) {
        await modelDir.create(recursive: true);
      }

      final localFile = File(modelPath);
      var existingBytes = await getDownloadedBytes(modelPath);

      // 发送HTTP请求，支持断点续传
      Map<String, String> headers = {};

      if (existingBytes > 0) {
        // 有已下载的部分，尝试从断点继续下载
        headers['Range'] = 'bytes=$existingBytes-';
      }

      // 使用流式下载避免内存溢出
      final request = http.Request('GET', Uri.parse(downloadUrl));
      if (existingBytes > 0) {
        request.headers['Range'] = 'bytes=$existingBytes-';
      }

      final streamedResponse = await _client!.send(request);

      if (streamedResponse.statusCode == 200 ||
          streamedResponse.statusCode == 206) {
        // 200 OK 或 206 Partial Content
        if (streamedResponse.statusCode == 200 && existingBytes > 0) {
          // 200 但有已下载部分，说明服务端不支持断点续传，删除旧文件
          await deleteIncompleteFile(modelPath);
          existingBytes = 0;
        }

        final contentLength = streamedResponse.contentLength ?? 0;
        _totalBytes = existingBytes + contentLength;
        _downloadedBytes = existingBytes;

        // 使用流式写入文件
        final raf = await localFile.open(
          mode: existingBytes > 0 ? FileMode.append : FileMode.write,
        );

        try {
          int receivedBytes = 0;
          await for (final chunk in streamedResponse.stream) {
            // 检查是否被取消
            if (!_isDownloading) {
              await raf.close();
              throw Exception('Download cancelled');
            }

            await raf.writeFrom(chunk);
            receivedBytes += chunk.length;
            _downloadedBytes = existingBytes + receivedBytes;

            // 更新进度
            if (contentLength > 0) {
              _progress = _downloadedBytes / _totalBytes;
            } else {
              _progress = 0.0; // 未知大小时不显示进度
            }
            onProgress?.call(_progress);
          }
        } finally {
          await raf.close();
        }

        _isDownloading = false;
        return modelPath;
      } else if (streamedResponse.statusCode == 416) {
        // Range Not Satisfiable，文件可能已下载完成
        _progress = 1.0;
        onProgress?.call(1.0);
        _isDownloading = false;
        return modelPath;
      } else {
        if (deleteIncompleteOnFailure && existingBytes > 0) {
          await deleteIncompleteFile(modelPath);
        }
        _lastError = 'Download failed: HTTP ${streamedResponse.statusCode}';
        _isDownloading = false;
        return null;
      }
    } catch (e) {
      if (deleteIncompleteOnFailure) {
        // 下载异常且有部分文件，删除不完整文件
        final existingBytes = await getDownloadedBytes(modelPath);
        if (existingBytes > 0) {
          await deleteIncompleteFile(modelPath);
        }
      }
      _lastError = 'Download error: $e';
      _isDownloading = false;
      return null;
    } finally {
      _client?.close();
      _client = null;
      _isDownloading = false;
    }
  }

  /// 取消下载
  void cancel() {
    _client?.close();
    _client = null;
    _isDownloading = false;
  }
}

class ModelDownloadService {
  // hf-mirror.com 镜像
  static const String _hfMirrorBase = 'https://hf-mirror.com';

  final String _baseUrl;

  ModelDownloadService({String? baseUrl}) : _baseUrl = baseUrl ?? _hfMirrorBase;

  /// 获取模型的下载URL
  /// [modelId] - 模型ID，如 "google/gemma-4-e4b-it"
  String getModelDownloadUrl(String modelId) {
    return '$_baseUrl/$modelId/resolve/main/gemma-4-e4b-it.litertlm';
  }

  /// 获取模型文件名
  String getModelFileName(String modelId) {
    return '${modelId.split('/').last}.litertlm';
  }
}

class ModelInfo {
  final String name;
  final String url;
  final String modelName;
  final String vendor;
  final double sizeGb;
  final List<String> tags;
  final List<String> categories;
  final String modelId;

  const ModelInfo({
    required this.name,
    required this.url,
    required this.modelName,
    required this.vendor,
    required this.sizeGb,
    required this.tags,
    required this.categories,
    required this.modelId,
  });

  factory ModelInfo.fromJson(Map<String, dynamic> json) {
    return ModelInfo(
      name: json['name'] ?? '',
      url: json['url'] ?? '',
      modelName: json['modelName'] ?? json['model_name'] ?? '',
      vendor: json['vendor'] ?? '',
      sizeGb: (json['size_gb'] ?? json['sizeGb'] ?? 0).toDouble(),
      tags: List<String>.from(json['tags'] ?? []),
      categories: List<String>.from(json['categories'] ?? []),
      modelId: json['modelId'] ?? json['model_id'] ?? '',
    );
  }

  bool get isRecommended => categories.contains('recommended');
  bool get supportsThinking => tags.contains('Think');
}
