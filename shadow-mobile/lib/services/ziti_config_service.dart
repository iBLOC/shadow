import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// 零信任模式 —— 这台手机在零信任网里扮演什么角色。
enum ZitiMode {
  /// 不走零信任（默认）：本地跑自己的大脑。
  off,

  /// 连远端大脑：本地**不起**大脑，那个端口上坐的是零信任代理。
  client,

  /// 发布本机大脑：手机把自己的脑面发到零信任网（别的设备反过来用它的脑子）。
  server,
}

/// 模式在**配置文件**里的字面量。
///
/// ⚠️ **别用 ZitiMode.values.index** —— 那是位置不是身份 ⇒ ⇒ 以后
/// 调整枚举顺序，历史配置文件会**静默变成另一种模式**。
String zitiModeWire(ZitiMode mode) {
  switch (mode) {
    case ZitiMode.off:
      return 'off';
    case ZitiMode.client:
      return 'client';
    case ZitiMode.server:
      return 'server';
  }
}

/// 字面量 → 模式。认不得 ⇒ ⇒ null（调用方回落 off，**不猜**）。
ZitiMode? zitiModeFromWire(String? wire) {
  switch (wire) {
    case 'off':
      return ZitiMode.off;
    case 'client':
      return ZitiMode.client;
    case 'server':
      return ZitiMode.server;
    default:
      return null;
  }
}

/// 一份零信任配置（**不含秘密**）。
///
/// ⚠️ 这里只有**路径**，没有身份内容 —— 身份文件本身是这台机器在网上的
/// 身份（含私钥）⇒ ⇒ 单独放在 App 私有目录，不进这份配置。
class ZitiConfig {
  /// 这台手机扮演什么角色。
  final ZitiMode mode;

  /// 要拨／要发布的那条零信任服务名。
  final String service;

  /// 身份文件路径（null = 还没导入身份）。
  final String? identityPath;

  const ZitiConfig({
    this.mode = ZitiMode.off,
    this.service = '',
    this.identityPath,
  });

  /// 身份在不在。
  bool get hasIdentity => (identityPath ?? '').trim().isNotEmpty;

  /// 配置**完整**吗（模式 + 服务名 + 身份三者齐）。
  ///
  /// ⚠️ 不齐**不半生效** —— 宿主侧会明确报错并回落「不走零信任」。
  bool get isComplete =>
      mode != ZitiMode.off && service.trim().isNotEmpty && hasIdentity;
}

/// 一份身份的**非秘密**摘要 —— 界面显示「这份身份里有什么」用的。
///
/// ⚠️ **不许**把证书／私钥／CA 的内容放进这里。
class ZitiIdentitySummary {
  /// 控制器客户端 API 根。
  final String ztApi;

  /// 控制器分配的身份 id（可能有）。
  final String? id;

  final bool hasCa;
  final bool hasCert;
  final bool hasKey;

  const ZitiIdentitySummary({
    required this.ztApi,
    this.id,
    required this.hasCa,
    required this.hasCert,
    required this.hasKey,
  });
}

/// 一次导入的结果 —— **身份文件路径** ＋ **非秘密摘要**。
class ZitiImportResult {
  /// 落盘的身份文件路径（id.json）。
  final String identityPath;

  /// 这份身份里有什么（非秘密）。
  final ZitiIdentitySummary summary;

  const ZitiImportResult({required this.identityPath, required this.summary});
}

/// 配置面里的**明确失败**（用户看得见的）。
///
/// ⚠️ 不把它做成「静默回落」—— 「导入没成功」长得像成功 ⇒ ⇒ 用户以为
/// 自己已经进了零信任网。
class ZitiConfigException implements Exception {
  final String message;
  const ZitiConfigException(this.message);

  @override
  String toString() => message;
}

/// 零信任配置的**持久化**面（纯 Dart，测试可注入目录）。
///
/// ## 落盘在哪
///
/// App 私有目录下的 ziti.json —— Android 上 App 私有目录就是
/// context.filesDir ⇒ ⇒ **与宿主（Kotlin）读的是同一处**。
///
/// ⚠️ **为什么必须是同一处**：Dart 写、宿主读 ⇒ ⇒ 两边路径口径对不上
/// ⇒ ⇒ 「保存了但没生效」⇒ ⇒ 失败长得像成功。
/// ⇒ ⇒ Dart 侧用的是 getApplicationSupportDirectory()
/// （path_provider_android：它映射的就是 filesDir），
/// 而 App 现有的 app_config.json 在 **documents 目录**（另一个位置）——
/// ⚠️ **这里不能跟着它抄**，抄了就对不上。
class ZitiConfigService {
  static final ZitiConfigService _instance = ZitiConfigService._internal();
  factory ZitiConfigService() => _instance;
  ZitiConfigService._internal();

  /// 测试可注入（与 AppConfigService.configFileOverride 同款思路）。
  static Future<Directory> Function()? rootDirOverride;

  /// 配置文件名（在 App 私有目录根下）。
  static const String configFileName = 'ziti.json';

  /// 身份文件目录名（在 App 私有目录根下）。
  static const String identityDirName = 'ziti';

  /// App 私有目录。
  Future<Directory> _rootDir() async {
    final override = rootDirOverride;
    if (override != null) {
      return await override();
    }
    return await getApplicationSupportDirectory();
  }

  Future<File> _configFile() async {
    final dir = await _rootDir();
    return File('${dir.path}/$configFileName');
  }

  Future<Directory> _identityDir() async {
    final dir = await _rootDir();
    return Directory('${dir.path}/$identityDirName');
  }

  /// 读当前配置。没配过 / 文件坏了 ⇒ ⇒ 默认（不走零信任）。
  ///
  /// ⚠️ **坏文件当成「没配」**，绝不 panic、也绝不半生效。
  Future<ZitiConfig> load() async {
    final file = await _configFile();
    if (!await file.exists()) {
      return const ZitiConfig();
    }
    try {
      final decoded = jsonDecode(await file.readAsString());
      if (decoded is! Map) {
        return const ZitiConfig();
      }
      final mode = zitiModeFromWire(decoded['mode'] as String?) ?? ZitiMode.off;
      final service = (decoded['service'] as String?)?.trim() ?? '';
      final rawPath = (decoded['identityPath'] as String?)?.trim() ?? '';
      return ZitiConfig(
        mode: mode,
        service: service,
        identityPath: rawPath.isEmpty ? null : rawPath,
      );
    } catch (_) {
      return const ZitiConfig();
    }
  }

  /// 写配置（**只落盘**，运行中不换面 —— 生效要重启 App）。
  Future<void> save(ZitiConfig config) async {
    final file = await _configFile();
    await file.parent.create(recursive: true);
    final payload = <String, dynamic>{
      'mode': zitiModeWire(config.mode),
      'service': config.service.trim(),
    };
    final identityPath = (config.identityPath ?? '').trim();
    if (identityPath.isNotEmpty) {
      payload['identityPath'] = identityPath;
    }
    await file.writeAsString(jsonEncode(payload));
  }

  /// 导入一份身份（**粘贴一段身份 JSON**）。
  ///
  /// ## 形状
  ///
  /// 四个键：ztAPI（控制器地址）／ id（可选）／ ca ／ cert ／ key，
  /// 后三个是**内联的 PEM 文本**。
  ///
  /// ⚠️ **只接受内联 PEM**：如果某一项写的是**文件路径** ⇒ ⇒ 明确报错
  /// （那个路径是别的机器上的 ⇒ ⇒ 这台机器上没有那个文件 ⇒ ⇒ 静默
  /// 当成空 ⇒ ⇒ 「进了网络但没身份」）。
  ///
  /// ## 落盘
  ///
  /// 落成**标准身份文件**形状：id.json + ca.pem/cert.pem/key.pem
  /// （id.json 里用**相对路径**引用那三个文件）⇒ ⇒ Rust 侧
  /// Identity::load 原样就能读（相对路径相对身份文件所在目录解析）。
  Future<ZitiImportResult> importIdentity(String pasted) async {
    final trimmed = pasted.trim();
    if (trimmed.isEmpty) {
      throw const ZitiConfigException('请粘贴身份 JSON（没有内容）。');
    }

    Object? decoded;
    try {
      decoded = jsonDecode(trimmed);
    } catch (e) {
      throw ZitiConfigException('这段不是合法 JSON：$e');
    }
    if (decoded is! Map) {
      throw const ZitiConfigException('身份 JSON 必须是一个对象。');
    }

    final ztApi = (decoded['ztAPI'] as String?)?.trim() ?? '';
    if (ztApi.isEmpty) {
      throw const ZitiConfigException('身份 JSON 缺 ztAPI（控制器地址）。');
    }
    final id = (decoded['id'] as String?)?.trim();

    final pems = <String, String>{};
    for (final key in const ['ca', 'cert', 'key']) {
      final value = decoded[key];
      if (value is! String || value.trim().isEmpty) {
        throw ZitiConfigException('身份 JSON 缺 $key。');
      }
      final pem = value.trim();
      if (!pem.startsWith('-----BEGIN')) {
        throw ZitiConfigException(
          '$key 写的是文件路径（$pem）—— 这台机器上没有那个文件 ⇒ '
          '请把 PEM 内容直接粘进来。',
        );
      }
      pems[key] = pem;
    }

    final dir = await _identityDir();
    await dir.create(recursive: true);
    await File('${dir.path}/ca.pem').writeAsString(pems['ca']!);
    await File('${dir.path}/cert.pem').writeAsString(pems['cert']!);
    await File('${dir.path}/key.pem').writeAsString(pems['key']!);
    final idJson = <String, dynamic>{
      'ztAPI': ztApi,
      if (id != null && id.isNotEmpty) 'id': id,
      'ca': 'ca.pem',
      'cert': 'cert.pem',
      'key': 'key.pem',
    };
    final idFile = File('${dir.path}/id.json');
    await idFile.writeAsString(jsonEncode(idJson));

    return ZitiImportResult(
      identityPath: idFile.path,
      summary: ZitiIdentitySummary(
        ztApi: ztApi,
        id: id,
        hasCa: true,
        hasCert: true,
        hasKey: true,
      ),
    );
  }

  /// 已导入身份的**非秘密**摘要（没导入 ⇒ null）。
  Future<ZitiIdentitySummary?> currentIdentitySummary() async {
    final config = await load();
    final path = config.identityPath;
    if (path == null || path.isEmpty) {
      return null;
    }
    final file = File(path);
    if (!await file.exists()) {
      return null;
    }
    try {
      final decoded = jsonDecode(await file.readAsString());
      if (decoded is! Map) {
        return null;
      }
      return ZitiIdentitySummary(
        ztApi: (decoded['ztAPI'] as String?)?.trim() ?? '',
        id: (decoded['id'] as String?)?.trim(),
        hasCa: _pemPresent(decoded['ca'], path),
        hasCert: _pemPresent(decoded['cert'], path),
        hasKey: _pemPresent(decoded['key'], path),
      );
    } catch (_) {
      return null;
    }
  }

  /// 删掉身份文件（模式与服务名保留）。
  Future<void> clearIdentity() async {
    final dir = await _identityDir();
    if (await dir.exists()) {
      await dir.delete(recursive: true);
    }
    final config = await load();
    await save(ZitiConfig(mode: config.mode, service: config.service));
  }

  /// 这个键值**在不在**（内联 PEM 或磁盘上真的有的文件）。
  ///
  /// ⚠️ **相对路径相对身份文件所在目录解析**（与 Rust 侧 Identity::load
  /// 同一口径）⇒ ⇒ **绝不按进程当前工作目录解析** —— 那会读不到
  /// ⇒ ⇒ 「明明有私钥，摘要却说没有」⇒ ⇒ 失败长得像成功。
  static bool _pemPresent(Object? value, String? identityPath) {
    if (value is! String) {
      return false;
    }
    final text = value.trim();
    if (text.isEmpty) {
      return false;
    }
    if (text.startsWith('-----BEGIN')) {
      return true;
    }
    final file = File(text);
    if (file.isAbsolute) {
      return file.existsSync();
    }
    if (identityPath == null) {
      return false;
    }
    final base = File(identityPath).parent;
    return File('${base.path}/$text').existsSync();
  }
}
