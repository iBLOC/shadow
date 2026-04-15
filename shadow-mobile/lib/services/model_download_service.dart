import 'dart:io';
import 'package:http/http.dart' as http;
import 'dart:convert';

class ModelDownloadService {
  static const String _defaultModelStoreHost = 'modelscope.cn';

  final String _baseUrl;
  final http.Client _client;

  ModelDownloadService({String? baseUrl, http.Client? client})
    : _baseUrl = baseUrl ?? 'https://$_defaultModelStoreHost/api/v1',
      _client = client ?? http.Client();

  String get modelListUrl => '$_baseUrl/models.json';

  Future<List<ModelInfo>> fetchModelList() async {
    final response = await _client.get(Uri.parse(modelListUrl));
    if (response.statusCode == 200) {
      final Map<String, dynamic> data = json.decode(response.body);
      final List<dynamic> models = data['models'] ?? [];
      return models.map((m) => ModelInfo.fromJson(m)).toList();
    }
    throw Exception('Failed to load model list: ${response.statusCode}');
  }

  Future<Directory> downloadModel(
    String url,
    String saveDir,
    String modelName,
    void Function(int received, int total)? onProgress,
  ) async {
    final dir = Directory(saveDir);
    if (!await dir.exists()) {
      await dir.create(recursive: true);
    }

    final filePath = '$saveDir/$modelName.zip';
    final file = File(filePath);
    final sink = file.openWrite();

    final request = http.Request('GET', Uri.parse(url));
    final response = await _client.send(request);
    final contentLength = response.contentLength ?? 0;

    int received = 0;
    await for (final chunk in response.stream) {
      sink.add(chunk);
      received += chunk.length;
      if (contentLength > 0) {
        onProgress?.call(received, contentLength);
      }
    }

    await sink.close();
    return dir;
  }

  void dispose() {
    _client.close();
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
