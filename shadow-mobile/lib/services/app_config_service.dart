import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import 'capabilities/capability.dart';

/// 应用配置服务
class AppConfigService {
  static const String _configFileName = 'app_config.json';

  // 配置项
  String? _telencephalonBaseUrl;
  String? _telencephalonAdminToken;
  String? _telencephalonShadowKey;

  // TTS 引擎（'android' / 'rust' / 'external'）—— null = 默认（Android 内置）。
  //
  // ⚠️ **为什么必须有它**（2026-11-09 实测）：引擎选择以前**只存在内存里**
  // ⇒ ⇒ 设置页每个 widget 都 new 一个 TtsEngine ⇒ ⇒ 选完就丢
  // ⇒ ⇒ 而且**说话那条路**用的是**另一个实例** ⇒ ⇒ 用户选了「Rust」、
  // 实际说话还是 Android 内置 ⇒ ⇒ **配了等于没配**（「写不进 ≠ 写进了」）。
  String? _ttsEngineType;

  // 外部 TTS 服务地址（仅 engineType == 'external' 时有意义）。
  String? _ttsExternalUrl;

  // 「用户主动停过大脑」—— **持久偏好**，不是会话状态。
  //
  // 为什么必须落盘：那个标记若只活在内存里 ⇒ Activity 被重建（新 Dart
  // isolate）它就归零 ⇒ ⇒ 大脑会自己回来 ⇒ ⇒「用户喊停」就没赢。
  bool _brainStoppedByUser = false;

  // 「后台常驻」（前台服务保活）—— **持久偏好**，默认开。
  //
  // 客户端要求「支持后台运行」：端脑与本地引擎都活在 App 进程里，
  // 默认就该在前台服务的保护下常驻；关掉它的人是明确不要后台的
  // ⇒ 存 false，其余（键缺失 / 值异常）一律回到默认 true。
  bool _backgroundKeepAlive = true;

  // 外观偏好（个人助理的外观是用户自己的）
  int? _accentColorValue;
  double? _glassIntensity;
  int? _surfaceOverrideValue;

  // 聊天页背景图（落盘路径）。只存路径不存字节 —— 图跟着设备走。
  String? _chatBackgroundPath;

  // 「`default` 桶 → 账号人格桶」的一次性迁移标记。
  //
  // 存的是**搬给谁**（那个人格），但语义是**这台设备已经搬过一次** ——
  // 换账号也不该把旧桶的遗留数据再搬进新账号（那是上一个账号的东西）。
  String? _tenantMigrationTarget;

  // 能力授权（每个能力一档：每次询问 / 完全访问）。
  //
  // 空 = 一个都没显式配过 = 全走默认档（每次询问）⇒ ⇒
  // 配置文件里**没有**这个键，与「配成空」是同一件事。
  Map<String, String> _capabilityModes = {};

  // ⚠️ **最近一次写盘失败的真因**（null = 上次写成功）。
  //
  // 为什么单独一个字段：写盘失败**没有**「长得像成功」的形状
  // （界面不会因此显示成功）⇒ ⇒ 形状闸抓不到它
  // ⇒ ⇒ 只能靠**一条真的通路**把它送到用户眼前。
  //
  // ⚠️ 原文（不重包）：「没存上」的原因分三类（磁盘满 / 权限 / 路径不存在）
  // ⇒ ⇒ 处置完全不同 ⇒ ⇒ 重包成一句话等于把线索扔掉。
  //
  // ⚠️ 为什么是**广播流**而不是普通字段：**写盘是单例上的全局操作**
  // ⇒ ⇒ 调用方散落在设置页 / 外观 / 后台开关 / 端脑页
  // ⇒ ⇒ 每个页面各写一遍「怎么报错」必然漏掉几个
  // ⇒ ⇒ 一处广播 ⇒ ⇒ App 根部挂一个横幅 ⇒ ⇒ **任何一处写失败都看得见**。
  //
  // ⚠️ 为什么不用 ValueNotifier：这个 service 是**纯 Dart**（不 import
  // Flutter ⇒ ⇒ 后台 isolate / 无 Flutter 绑定的场景也能用）
  // ⇒ ⇒ 通知机制也必须是纯 Dart 的。
  final _saveErrorController = StreamController<String>.broadcast();

  /// **写盘失败**的广播流（每次失败推一次**真因**）。
  ///
  /// UI 挂上它就能说「没存上」⇒ ⇒ 不依赖「谁记得处理」。
  Stream<String> get saveFailures => _saveErrorController.stream;

  /// 最近一次写盘失败的真因（null = 上次写成功）。
  ///
  /// ⚠️ 与 [saveFailures] 广播**同一份真相** ⇒ ⇒ 不许各存一份。
  String? _lastSaveError;
  String? get lastSaveError => _lastSaveError;

  /// 用户手动关掉横幅（**关掉 ≠ 问题已解决** ⇒ 下次写失败还会再报）。
  void clearSaveError() => _lastSaveError = null;

  // ⚠️ **最后一次确认落盘的配置**（读到的，或写成功的）。
  //
  // 为什么需要它：写失败后要**回滚内存**，而回滚的基准必须是
  // 「**磁盘上真正的那个值**」⇒ ⇒ 那就得有一份**已确认**的快照。
  //
  // ⚠️ 为什么**不能**靠「失败后再读一次磁盘」：写失败的原因常常
  // （磁盘满 / 权限 / 路径不存在）**让读也失败** ⇒ ⇒ 那时读到的是
  // 「什么都没有」⇒ ⇒ 回滚成默认值 ⇒ ⇒ **把用户其它正常设置一起抹掉**
  // ⇒ ⇒ 比不回滚还糟。⇒ ⇒ 回滚基准必须是**上一次确认落盘的快照**。
  Map<String, dynamic> _persisted = {};

  /// 已经搬过一次？（值 = 搬给谁的人格；null = 没搬过）
  String? get tenantMigrationTarget => _tenantMigrationTarget;

  /// 能力授权档位（能力 wire → 档位 wire）。
  ///
  /// 返回的是**防御性副本** —— 调用方改它不会影响仓库。
  Map<String, String> get capabilityModes => Map.unmodifiable(_capabilityModes);

  // 单例
  static final AppConfigService _instance = AppConfigService._internal();
  factory AppConfigService() => _instance;
  AppConfigService._internal();

  /// Telencephalon base URL — null means use the
  /// client default (`http://127.0.0.1:60080`).
  String? get telencephalonBaseUrl => _telencephalonBaseUrl;

  /// Telencephalon admin token — null means do not send `X-Admin-Token`.
  String? get telencephalonAdminToken => _telencephalonAdminToken;

  /// Telencephalon shadow key — null means do not send `X-Shadow-Key`.
  String? get telencephalonShadowKey => _telencephalonShadowKey;

  /// TTS 引擎（'android' / 'rust' / 'external'）—— null = 默认（Android 内置）。
  String? get ttsEngineType => _ttsEngineType;

  /// 外部 TTS 服务地址 —— null = 没配。
  String? get ttsExternalUrl => _ttsExternalUrl;

  /// 用户主动停过大脑？
  ///
  /// true = 别自动拉起来（等用户点「启动大脑」）；false = 从没喊停过。
  bool get brainStoppedByUser => _brainStoppedByUser;

  /// 后台常驻（前台服务保活）开着吗？默认开。
  bool get backgroundKeepAlive => _backgroundKeepAlive;

  /// 用户选的主题色（ARGB int）— null 表示用默认中性色。
  int? get accentColorValue => _accentColorValue;

  /// 玻璃（半影层）强度 0..1 — null 表示默认全强度。
  double? get glassIntensity => _glassIntensity;

  /// 对话框 / 面板背景覆盖（ARGB int）— null 表示跟随主题。
  int? get surfaceOverrideValue => _surfaceOverrideValue;

  /// 聊天页背景图（落盘路径）— null 表示用默认渐变底。
  String? get chatBackgroundPath => _chatBackgroundPath;

  /// 初始化配置服务
  ///
  /// Always (re)reads the config file. The settings screen hydrates through
  /// this method every time it opens, and a cached in-memory copy would
  /// survive a corrupted or externally edited file.
  Future<void> init() async {
    await _loadConfig();
  }

  /// 从文件加载配置
  ///
  /// ⚠️ **读失败也是「失败」** —— 但这里的失败**没有**「长得像成功」的
  /// 形状（读不到 ⇒ 全部回到默认 ⇒ 界面显示的是「什么都没配」）⇒ ⇒
  /// **诚实**（不谎称有配置）⇒ ⇒ 但**授权绝不因此放宽**。
  ///
  /// ⚠️ 与 [_reloadFromDisk] 同一套「读不到 ⇒ 默认」的规矩 ⇒ ⇒
  /// 两个入口共用一份实现（别让两条路读出**两个**真相）。
  Future<void> _loadConfig() async {
    await _reloadFromDisk();
  }

  /// 保存配置到文件
  Future<void> _saveConfig() async {
    try {
      final file = await _getConfigFile();
      final config = {
        if (_telencephalonBaseUrl != null)
          'telencephalonBaseUrl': _telencephalonBaseUrl,
        if (_telencephalonAdminToken != null)
          'telencephalonAdminToken': _telencephalonAdminToken,
        if (_telencephalonShadowKey != null)
          'telencephalonShadowKey': _telencephalonShadowKey,
        if (_brainStoppedByUser) 'brainStoppedByUser': true,
        // 默认 true 的键只在**关**时落盘（与上面 brainStoppedByUser 同一
        // 套「只写非默认」的规矩，配置文件里不留默认壳）。
        if (!_backgroundKeepAlive) 'backgroundKeepAlive': false,
        if (_accentColorValue != null) 'accentColor': _accentColorValue,
        if (_glassIntensity != null) 'glassIntensity': _glassIntensity,
        if (_surfaceOverrideValue != null)
          'surfaceOverride': _surfaceOverrideValue,
        if (_chatBackgroundPath != null)
          'chatBackgroundPath': _chatBackgroundPath,
        if (_tenantMigrationTarget != null)
          'tenantMigrationTarget': _tenantMigrationTarget,
        // ⚠️ **只写非默认** —— 默认引擎是 android ⇒ ⇒ 配置文件里不留默认壳。
        if (_ttsEngineType != null && _ttsEngineType != 'android')
          'ttsEngineType': _ttsEngineType,
        if (_ttsExternalUrl != null && _ttsExternalUrl!.isNotEmpty)
          'ttsExternalUrl': _ttsExternalUrl,
      };
      // ⚠️ 能力授权：**空 map 不写** ⇒ ⇒ 配置文件里不留空壳。
      CapabilityPolicyStore.write(_capabilityModes, config);
      // ⚠️⚠️ **原子落盘**（2026-11-09 实测修掉的一族）：`file.writeAsString(...)` 是
      //   「**先截断再写**」⇒ ⇒ 写到一半被杀 ⇒ ⇒ 磁盘上留下**半个文件** ⇒ ⇒
      //   下次 `_reloadFromDisk()` 的 `json.decode` 抛错 ⇒ ⇒ **静默回落默认值**
      //   ⇒ ⇒ **用户的全部配置被清空**（而界面什么也不说）⇒ ⇒ 「失败长得像成功」。
      //   ⇒ ⇒ 改成：**临时文件 ＋ rename 原子替换** ⇒ ⇒ 目标文件要么是**旧的完整值**、
      //   要么是**新的完整值**，**永远不会是半个**。
      //   ⚠️ 实测症状：主 CI 的 `backend_shadow_key_entry_test.dart` **偶发**红
      //   （`FormatException: Unexpected end of input (at character 1)`）。
      await _writeAtomically(file, json.encode(config));
      // ⚠️ 写成功 ⇒ ⇒ 这一份**就是**磁盘上的真值了 ⇒ ⇒ 快照更新。
      _persisted = config;
      // 写成功 ⇒ ⇒ 上次的失败不再成立（否则 UI 会一直说「没存上」）。
      _lastSaveError = null;
    } catch (e) {
      // ⚠️⚠️ **写失败不许长得像成功**。
      //
      // 原来这里是空 catch ⇒ ⇒ 写盘失败被吞 ⇒ ⇒ **内存里已经是新值、
      // 文件里还是旧值** ⇒ ⇒ 用户以为设置存下来了，重启就没。
      // ⇒ ⇒ 这一族里最阴的一种：**界面完全正常**，只是重启后消失。
      //
      // 现在做三件事：
      // ❶ **记下真因**（原文，不重包）⇒ UI 能说出「为什么没存上」。
      // ❷ **回滚内存** ⇒ 内存重新等于**最后确认落盘的那份** ⇒
      //    「内存说 A、文件说 B」这个分裂不允许存在。
      //    （不抛异常 ⇒ 不打断既有调用方的 await 语义。）
      // ❸ **通知 UI** ⇒ App 根部的横幅让用户看见「没存上」。
      final reason = e.toString();
      // ⚠️ 回滚到**最后一次确认落盘的快照**（不是「再读一次磁盘」——
      // 写失败的原因常常让读也失败 ⇒ ⇒ 那会把正常设置一起抹掉）。
      _applyConfig(_persisted);
      _lastSaveError = reason;
      if (!_saveErrorController.isClosed) _saveErrorController.add(reason);
    }
  }

  /// **原子写**：先写同目录的临时文件，再 rename 覆盖目标。
  ///
  /// ⚠️ **同目录** ⇒ ⇒ rename 不跨卷（跨卷会失败）⇒ ⇒ 临时文件必须在目标旁边。
  /// ⚠️ `flush: true` ⇒ ⇒ 数据先落到盘上再 rename ⇒ ⇒ 掉电也不会出现
  ///    「已经 rename、但内容没落盘」的鬼文件。
  /// ⚠️ rename 在 Windows / Android 上都会**覆盖**既有目标（Dart 用 REPLACE_EXISTING）
  ///    ⇒ ⇒ 不用先删目标。
  /// ⚠️ 失败时把临时文件清掉 ⇒ ⇒ 配置目录里不留半成品
  ///    （清不掉就留着 —— 它**不是**目标文件 ⇒ ⇒ 读面看不到它）。
  static Future<void> _writeAtomically(File file, String content) async {
    final tmp = File('${file.path}.tmp');
    try {
      await tmp.writeAsString(content, flush: true);
    } catch (_) {
      await _discardTempFile(tmp);
      rethrow;
    }
    // ⚠️ **rename 覆盖**时会撞**共享冲突**：Windows 上若目标正被**另一个句柄**
    //   打开着（读面 / 索引器 / 杀毒软件）⇒ ⇒ rename 报 ERROR_SHARING_VIOLATION
    //   （Dart 映射成 [PathAccessException]）⇒ ⇒ 那是**瞬时**的 ⇒ ⇒ 有限重试即可。
    //   ⚠️ 只重试这一类 ⇒ ⇒ 别的失败（磁盘满 / 权限 / 路径不存在）**立即**失败
    //   ⇒ ⇒ 不许把真失败拖成慢失败，也不许把它重试成「成功」。
    Object? lastError;
    for (var attempt = 0; attempt < 8; attempt++) {
      try {
        await tmp.rename(file.path);
        return;
      } on PathAccessException catch (e) {
        lastError = e;
        await Future<void>.delayed(const Duration(milliseconds: 25));
      }
    }
    await _discardTempFile(tmp);
    throw lastError!;
  }

  /// 丢掉临时文件（尽力而为 ⇒ ⇒ 失败不许盖掉真正的失败）。
  static Future<void> _discardTempFile(File tmp) async {
    try {
      if (await tmp.exists()) await tmp.delete();
    } catch (e) {
      // ⚠️ 「删不掉」这件事**不许静默** ⇒ ⇒ 留一条诊断痕。
      //   （临时文件留着本身无害：它**不是**目标文件 ⇒ ⇒ 读面看不到它。）
      developer.log('落盘临时文件删不掉（已保留）：$e', name: 'app_config');
    }
  }

  /// **从磁盘重读** ⇒ 让内存回到**文件里的真值**。
  ///
  /// ⚠️ 读不到 ⇒ ⇒ 全部回默认（与 [init] 同一条规矩：授权档位回到
  /// 「什么都没配」⇒ ⇒ 绝不因为读不到就放宽授权）。
  ///
  /// ⚠️ **读成功** ⇒ ⇒ 快照更新（这一份就是磁盘上的真值了）。
  ///
  /// ⚠️ **读失败** ⇒ ⇒ 快照**不动**（它还是上一次确认落盘的那份）
  /// ⇒ ⇒ 后面写失败时的回滚基准不会退化成「什么都没有」。
  Future<void> _reloadFromDisk() async {
    try {
      final file = await _getConfigFile();
      if (!await file.exists()) {
        _resetToDefaults();
        // ⚠️ 文件不存在 ⇒ ⇒ 磁盘上的真值就是「什么都没配」。
        _persisted = {};
        return;
      }
      final contents = await file.readAsString();
      final config = json.decode(contents) as Map<String, dynamic>;
      _applyConfig(config);
      _persisted = config;
    } catch (_) {
      _resetToDefaults();
    }
  }

  /// 把一份配置**套到内存**上。
  ///
  /// ⚠️ 读盘与回滚**共用**这一份 ⇒ ⇒ 别让两条路读出**两个**真相。
  void _applyConfig(Map<String, dynamic> config) {
    _telencephalonBaseUrl = config['telencephalonBaseUrl'] as String?;
    _telencephalonAdminToken = config['telencephalonAdminToken'] as String?;
    _telencephalonShadowKey = config['telencephalonShadowKey'] as String?;
    _brainStoppedByUser = config['brainStoppedByUser'] == true;
    // ⚠️ 只有**显式 false** 才算关 —— 键缺失 / 值异常（旧文件没这键）
    // 一律回到默认 true（与字段初始值同源，别让损坏文件悄悄关掉常驻）。
    final keepAlive = config['backgroundKeepAlive'];
    _backgroundKeepAlive = keepAlive is bool ? keepAlive : true;
    _accentColorValue = config['accentColor'] as int?;
    _glassIntensity = (config['glassIntensity'] as num?)?.toDouble();
    _surfaceOverrideValue = config['surfaceOverride'] as int?;
    _chatBackgroundPath = config['chatBackgroundPath'] as String?;
    _ttsEngineType = config['ttsEngineType'] as String?;
    _ttsExternalUrl = config['ttsExternalUrl'] as String?;
    _tenantMigrationTarget = config['tenantMigrationTarget'] as String?;
    _capabilityModes = CapabilityPolicyStore.read(config);
  }

  /// 内存回到「什么都没配」的默认态（读不到时的安全回落）。
  void _resetToDefaults() {
    _telencephalonBaseUrl = null;
    _telencephalonAdminToken = null;
    _telencephalonShadowKey = null;
    _brainStoppedByUser = false;
    _backgroundKeepAlive = true;
    _accentColorValue = null;
    _glassIntensity = null;
    _surfaceOverrideValue = null;
    _chatBackgroundPath = null;
    _tenantMigrationTarget = null;
    _ttsEngineType = null;
    _ttsExternalUrl = null;
    // ⚠️ 读不到 ⇒ ⇒ 授权档位回到「什么都没配」⇒ ⇒ 全部按
    // 「每次询问」处理 ⇒ ⇒ **绝不会因为文件坏了就放宽授权**。
    _capabilityModes = {};
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

  /// 设置 TTS 引擎（持久）。null / 空 ⇒ 回到默认（Android 内置）。
  ///
  /// ⚠️ **必须落盘** —— 只改内存 ⇒ ⇒ 设置页一销毁就没了 ⇒ ⇒
  /// 而且说话那条路用的是**另一个实例** ⇒ ⇒ 用户的选择**从来没生效过**。
  Future<void> setTtsEngineType(String? type) async {
    _ttsEngineType = (type == null || type.isEmpty) ? null : type;
    await _saveConfig();
  }

  /// 设置外部 TTS 服务地址（持久）。null / 空 ⇒ 抹掉（不落空壳）。
  Future<void> setTtsExternalUrl(String? url) async {
    _ttsExternalUrl = (url == null || url.isEmpty) ? null : url;
    await _saveConfig();
  }

  /// 记下「用户主动停过大脑」（持久）。
  ///
  /// true = 别自动拉起来（等用户点「启动大脑」）；false = 抹掉标记
  /// ⇒ 恢复「默认启动」。
  Future<void> setBrainStoppedByUser(bool value) async {
    _brainStoppedByUser = value;
    await _saveConfig();
  }

  /// 记下「后台常驻」开关（持久）。关 ⇒ 前台服务停掉、也不再自动拉起。
  Future<void> setBackgroundKeepAlive(bool value) async {
    _backgroundKeepAlive = value;
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

  /// 设置聊天背景图路径。传 null / 空串恢复默认渐变底（不落空壳）。
  Future<void> setChatBackgroundPath(String? value) async {
    _chatBackgroundPath = (value == null || value.isEmpty) ? null : value;
    await _saveConfig();
  }

  /// 记下「`default` 桶 → 账号人格桶」已经搬过一次（值 = 搬给谁）。
  ///
  /// 传 null = 抹掉标记（下次还会再搬）—— 只在明确要重来时才这么做。
  Future<void> setTenantMigrationTarget(String? target) async {
    _tenantMigrationTarget = (target == null || target.isEmpty) ? null : target;
    await _saveConfig();
  }

  /// 记下「能力 → 授权档位」（持久）。
  ///
  /// 空 map = 回到「什么都没配」= 全部按「每次询问」处理。
  Future<void> setCapabilityModes(Map<String, String> modes) async {
    _capabilityModes = Map<String, String>.from(modes);
    await _saveConfig();
  }
}
