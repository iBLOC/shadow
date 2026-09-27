import 'dart:convert';
import 'dart:io';
import 'package:path_provider/path_provider.dart';

/// 应用配置服务
/// 支持存储和读取可配置的参数，如模型下载服务器地址
class AppConfigService {
  static const String _configFileName = 'app_config.json';
  static const String _defaultModelStoreHost = 'modelscope.cn';
  static const String _defaultModelStoreUrl =
      'https://$_defaultModelStoreHost/api/v1';

  // 配置项
  String? _modelStoreUrl;
  String? _telencephalonBaseUrl;
  String? _telencephalonAdminToken;
  bool _isInitialized = false;

  // 单例
  static final AppConfigService _instance = AppConfigService._internal();
  factory AppConfigService() => _instance;
  AppConfigService._internal();

  /// 获取模型下载服务器地址
  String get modelStoreUrl => _modelStoreUrl ?? _defaultModelStoreUrl;

  /// 是否使用默认地址
  bool get isUsingDefaultModelStore => _modelStoreUrl == null;

  /// Telencephalon (a.k.a. cortex) base URL — null means use the
  /// client default (`http://127.0.0.1:60080`).
  String? get telencephalonBaseUrl => _telencephalonBaseUrl;

  /// Telencephalon admin token — null means do not send `X-Admin-Token`.
  String? get telencephalonAdminToken => _telencephalonAdminToken;

  /// 初始化配置服务
  Future<void> init() async {
    if (_isInitialized) return;
    await _loadConfig();
    _isInitialized = true;
  }

  /// 从文件加载配置
  Future<void> _loadConfig() async {
    try {
      final file = await _getConfigFile();
      if (await file.exists()) {
        final contents = await file.readAsString();
        final config = json.decode(contents) as Map<String, dynamic>;
        _modelStoreUrl = config['modelStoreUrl'] as String?;
        _telencephalonBaseUrl = config['telencephalonBaseUrl'] as String?;
        _telencephalonAdminToken = config['telencephalonAdminToken'] as String?;
      }
    } catch (e) {
      // 配置文件读取失败，使用默认值
      _modelStoreUrl = null;
    }
  }

  /// 保存配置到文件
  Future<void> _saveConfig() async {
    try {
      final file = await _getConfigFile();
final config = {
      if (_modelStoreUrl != null) 'modelStoreUrl': _modelStoreUrl,
      if (_telencephalonBaseUrl != null)
        'telencephalonBaseUrl': _telencephalonBaseUrl,
      if (_telencephalonAdminToken != null)
        'telencephalonAdminToken': _telencephalonAdminToken,
    };
      await file.writeAsString(json.encode(config));
    } catch (e) {
      // 配置保存失败，忽略错误
    }
  }

  /// 获取配置文件
  ///
  /// Tests can override [configFileOverride] to redirect persistence to a
  /// temporary file without depending on `path_provider_platform_interface`.
  static Future<File> Function()? configFileOverride;

  Future<File> _getConfigFile() async {
    if (configFileOverride != null) {
      return configFileOverride!();
    }
    final directory = await getApplicationDocumentsDirectory();
    return File('${directory.path}/$_configFileName');
  }

  /// 设置模型下载服务器地址
  /// [url] 新的服务器地址，如果为 null 则使用默认地址
  Future<void> setModelStoreUrl(String? url) async {
    _modelStoreUrl = url;
    await _saveConfig();
  }

  /// 重置为默认模型下载服务器地址
  Future<void> resetModelStoreUrl() async {
    _modelStoreUrl = null;
    await _saveConfig();
  }

  /// Set telencephalon base URL (persisted). Pass null to fall back to
  /// the client default `http://127.0.0.1:60080`.
  Future<void> setTelencephalonBaseUrl(String? url) async {
    _telencephalonBaseUrl = (url == null || url.isEmpty) ? null : url;
    await _saveConfig();
  }

  /// Set telencephalon admin token (persisted). Pass null/empty to
  /// stop sending the `X-Admin-Token` header.
  Future<void> setTelencephalonAdminToken(String? token) async {
    _telencephalonAdminToken = (token == null || token.isEmpty) ? null : token;
    await _saveConfig();
  }
}
