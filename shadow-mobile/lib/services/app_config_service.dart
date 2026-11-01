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
  String? _telencephalonShadowKey;

  // 外观偏好（个人助理的外观是用户自己的）
  int? _accentColorValue;
  double? _glassIntensity;
  int? _surfaceOverrideValue;

  // 「`default` 桶 → 账号人格桶」的一次性迁移标记。
  //
  // 存的是**搬给谁**（那个人格），但语义是**这台设备已经搬过一次** ——
  // 换账号也不该把旧桶的遗留数据再搬进新账号（那是上一个账号的东西）。
  String? _tenantMigrationTarget;

  /// 已经搬过一次？（值 = 搬给谁的人格；null = 没搬过）
  String? get tenantMigrationTarget => _tenantMigrationTarget;

  // 单例
  static final AppConfigService _instance = AppConfigService._internal();
  factory AppConfigService() => _instance;
  AppConfigService._internal();

  /// 获取模型下载服务器地址
  String get modelStoreUrl => _modelStoreUrl ?? _defaultModelStoreUrl;

  /// 是否使用默认地址
  bool get isUsingDefaultModelStore => _modelStoreUrl == null;

  /// Telencephalon base URL — null means use the
  /// client default (`http://127.0.0.1:60080`).
  String? get telencephalonBaseUrl => _telencephalonBaseUrl;

  /// Telencephalon admin token — null means do not send `X-Admin-Token`.
  String? get telencephalonAdminToken => _telencephalonAdminToken;

  /// Telencephalon shadow key — null means do not send `X-Shadow-Key`.
  String? get telencephalonShadowKey => _telencephalonShadowKey;

  /// 用户选的主题色（ARGB int）— null 表示用默认中性色。
  int? get accentColorValue => _accentColorValue;

  /// 玻璃（半影层）强度 0..1 — null 表示默认全强度。
  double? get glassIntensity => _glassIntensity;

  /// 对话框 / 面板背景覆盖（ARGB int）— null 表示跟随主题。
  int? get surfaceOverrideValue => _surfaceOverrideValue;

  /// 初始化配置服务
  ///
  /// Always (re)reads the config file. The settings screen hydrates through
  /// this method every time it opens, and a cached in-memory copy would
  /// survive a corrupted or externally edited file.
  Future<void> init() async {
    await _loadConfig();
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
        _telencephalonShadowKey = config['telencephalonShadowKey'] as String?;
        _accentColorValue = config['accentColor'] as int?;
        _glassIntensity = (config['glassIntensity'] as num?)?.toDouble();
        _surfaceOverrideValue = config['surfaceOverride'] as int?;
        _tenantMigrationTarget = config['tenantMigrationTarget'] as String?;
      }
    } catch (e) {
      // 配置文件读取失败，使用默认值
      _modelStoreUrl = null;
      _telencephalonBaseUrl = null;
      _telencephalonAdminToken = null;
      _telencephalonShadowKey = null;
      _accentColorValue = null;
      _glassIntensity = null;
      _surfaceOverrideValue = null;
      _tenantMigrationTarget = null;
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
      if (_telencephalonShadowKey != null)
        'telencephalonShadowKey': _telencephalonShadowKey,
      if (_accentColorValue != null) 'accentColor': _accentColorValue,
      if (_glassIntensity != null) 'glassIntensity': _glassIntensity,
      if (_surfaceOverrideValue != null)
        'surfaceOverride': _surfaceOverrideValue,
      if (_tenantMigrationTarget != null)
        'tenantMigrationTarget': _tenantMigrationTarget,
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

  /// Set telencephalon shadow key (persisted). Pass null/empty to
  /// stop sending the `X-Shadow-Key` header.
  Future<void> setTelencephalonShadowKey(String? key) async {
    _telencephalonShadowKey = (key == null || key.isEmpty) ? null : key;
    await _saveConfig();
  }

  /// 设置用户选的主题色（ARGB int）。传 null 恢复默认中性色。
  Future<void> setAccentColor(int? value) async {
    _accentColorValue = value;
    await _saveConfig();
  }

  /// 设置玻璃（半影层）强度 0..1。传 null 恢复默认。
  Future<void> setGlassIntensity(double? value) async {
    _glassIntensity = value;
    await _saveConfig();
  }

  /// 设置对话框 / 面板背景覆盖（ARGB int）。传 null 恢复跟随主题。
  Future<void> setSurfaceOverride(int? value) async {
    _surfaceOverrideValue = value;
    await _saveConfig();
  }

  /// 记下「`default` 桶 → 账号人格桶」已经搬过一次（值 = 搬给谁）。
  ///
  /// 传 null = 抹掉标记（下次还会再搬）—— 只在明确要重来时才这么做。
  Future<void> setTenantMigrationTarget(String? target) async {
    _tenantMigrationTarget = (target == null || target.isEmpty) ? null : target;
    await _saveConfig();
  }
}
