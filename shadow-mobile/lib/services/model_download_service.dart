import 'dart:io';
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
  // ML Kit handles model download automatically
  // This class is kept for compatibility but model download is no-op

  bool _isDownloading = false;
  double _progress = 0.0;
  String? _lastError;

  bool get isDownloading => _isDownloading;
  double get progress => _progress;
  String? get lastError => _lastError;

  Future<bool> isModelDownloaded() async {
    // ML Kit manages model availability via Google Play Services
    // Always return true here - ML Kit will handle download status
    return true;
  }

  Future<String?> downloadModel({
    void Function(double progress)? onProgress,
  }) async {
    // ML Kit handles model download automatically
    // No manual download needed
    _lastError = 'Not needed - ML Kit handles downloads automatically';
    return null;
  }

  void cancel() {
    _isDownloading = false;
  }
}

class ModelDownloadService {
  // Kept for API compatibility - ML Kit handles model management
  static const String _defaultModelStoreHost = 'modelscope.cn';

  final String _baseUrl;

  ModelDownloadService({String? baseUrl})
    : _baseUrl = baseUrl ?? 'https://$_defaultModelStoreHost/api/v1';

  String get modelListUrl => '$_baseUrl/models.json';
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

  ModelInfo({
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
