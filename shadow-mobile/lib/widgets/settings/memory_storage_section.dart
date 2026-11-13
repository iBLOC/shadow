import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../providers/telencephalon_provider.dart';
import '../../services/encephalon/encephalon_mobile_provider.dart';
import 'storage_migration_dialog.dart';

/// **记忆存储** —— 长期记忆（海马体 / Lance 数据集）落在哪里。
///
/// ## 真相源
///
/// 端脑的**配置中心**（`hippocampus` 段），写入走
/// `/api/telencephalon/config/hippocampus/*`。优先级：
/// **配置中心 → 宿主目录 → 环境 → 平台默认**（端脑 boot 里那一格）。
///
/// ## 支持集由 Lance 的构建特性决定（不是「对象存储有什么」）
///
/// * `file://` / 裸路径 —— 本地目录（**手机上会被 SELinux 的硬链接限制挡掉**）
/// * `s3://` —— AWS S3 及所有 S3 兼容（MinIO / RustFS / COS S3 模式）
/// * `oss://` —— 阿里云 OSS（endpoint 必填）
///
/// ## 两句必须说清楚的话
///
/// 1. 改存储 **要重启大脑** 才生效（配置在 boot 时读一次）；
/// 2. 换存储 **不迁移** 已有记忆（Lance 数据集首次创建后就地生根）。
///
/// ## 诚实边界
///
/// 默认 `mobile` 构建**没编海马体**（要 `mobile-memory` 构建）⇒ ⇒ 这里配好
/// 了也只会在**编了记忆体的构建**里生效；界面上直说，不让用户配一个
/// 不会生效的东西还以为成了。
class MemoryStorageSection extends ConsumerStatefulWidget {
  const MemoryStorageSection({super.key});

  @override
  ConsumerState<MemoryStorageSection> createState() => _MemoryStorageSectionState();
}

const _section = 'hippocampus';
const _keyUri = 'storage_uri';
const _keyAccess = 'storage_access_key';
const _keySecret = 'storage_secret_key';
const _keyRegion = 'storage_region';
const _keyEndpoint = 'storage_endpoint';
const _keyAllowHttp = 'storage_allow_http';
const _keyCopyIfNotExists = 'storage_copy_if_not_exists';
const _mask = '***';

enum _Backend { local, rustfs, s3, oss }

/// **RustFS 预设**（2026-11-13）—— S3 兼容服务，协议上仍是 `s3://`，但三样
/// 最容易填错的东西不同：endpoint 必填、常用 http、`If-None-Match: *` 支持。
const _rustfsDefaultEndpoint = 'http://127.0.0.1:9000';
const _rustfsCopyHeader = 'header: if-none-match: *';

class _MemoryStorageSectionState extends ConsumerState<MemoryStorageSection> {
  bool _loading = true;
  bool _saving = false;
  String? _unreadable;
  String? _error;
  String? _savedNote;

  bool _configured = false;
  /// **当前生效的根**（`_load` 时读回来的那份）—— 与用户输入比较：
  /// 不同 ⇒ 换根 ⇒ 走迁移（不是改一行配置）。
  String _storedUri = '';
  _Backend _backend = _Backend.local;
  final _location = TextEditingController();
  final _endpoint = TextEditingController();
  final _region = TextEditingController();
  final _accessKey = TextEditingController();
  final _secretKey = TextEditingController();
  bool _allowHttp = false;
  final _copyIfNotExists = TextEditingController();
  /// 大脑给的**本地默认根**（留空时落这儿）。
  String? _defaultRoot;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _location.dispose();
    _endpoint.dispose();
    _region.dispose();
    _accessKey.dispose();
    _secretKey.dispose();
    _copyIfNotExists.dispose();
    super.dispose();
  }

  String _valueOf(List<dynamic> entries, String key) {
    for (final e in entries) {
      if (e is Map && e['key'] == key) {
        final v = e['value'];
        if (v is String) return v;
        if (v is bool) return v ? 'true' : 'false';
        return v?.toString() ?? '';
      }
    }
    return '';
  }

  /// ⚠️ RustFS 与 S3 在磁盘上**同一个 scheme**（`s3://`）⇒ 只能从「我们写
  /// 的那个 copy 头」反推；认不准时落到 `s3`（不影响保存结果，写的是同一组键）。
  _Backend _backendOf(String uri, String copyHeader) {
    if (uri.startsWith('oss://')) return _Backend.oss;
    if (uri.startsWith('s3://') || uri.startsWith('s3a://')) {
      return copyHeader.trim() == _rustfsCopyHeader ? _Backend.rustfs : _Backend.s3;
    }
    return _Backend.local;
  }

  /// 「留空」= 用大脑的默认位置 ⇒ 比较与迁移都需要一个具体 URI。
  String _effectiveUri() {
    final loc = _location.text.trim();
    if (loc.isNotEmpty) return loc;
    if (_backend == _Backend.local && _defaultRoot != null && _defaultRoot!.isNotEmpty) {
      final normalized = _defaultRoot!.replaceAll(r'\', '/');
      return normalized.startsWith('file://') ? normalized : 'file://$normalized';
    }
    return '';
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _unreadable = null;
    });
    try {
      final client = ref.read(telencephalonClientProvider);
      final view = await client.configSection(_section);
      // ⚠️ 默认地址读不到不挡卡片（它只是提示）。
      Map<String, dynamic>? defaults;
      try {
        defaults = await client.storageDefaults();
      } catch (_) {
        defaults = null;
      }
      final entries = (view['entries'] as List?) ?? const [];
      final uri = _valueOf(entries, _keyUri);
      final access = _valueOf(entries, _keyAccess);
      final secret = _valueOf(entries, _keySecret);
      if (!mounted) return;
      setState(() {
        _configured = uri.isNotEmpty;
        _storedUri = uri;
        _defaultRoot = defaults?['local_default_root'] as String?;
        _backend = _backendOf(uri, _valueOf(entries, 'storage_copy_if_not_exists'));
        _location.text = uri;
        _endpoint.text = _valueOf(entries, _keyEndpoint);
        _region.text = _valueOf(entries, _keyRegion);
        // 服务端对秘密回掩码 ⇒ 原样显示成「已配置」，保存时跳过。
        _accessKey.text = access.isEmpty ? '' : _mask;
        _secretKey.text = secret.isEmpty ? '' : _mask;
        _allowHttp = _valueOf(entries, _keyAllowHttp) == 'true';
        _copyIfNotExists.text = _valueOf(entries, _keyCopyIfNotExists);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _unreadable = '$e';
        _loading = false;
      });
    }
  }

  String? _validate(AppLocalizations l10n) {
    final loc = _location.text.trim();
    // 本地目录**允许留空**（= 用大脑的默认位置）。
    if (_backend == _Backend.local) return null;
    if (loc.isEmpty) return l10n.memoryStorageInvalidLocation;
    {
      final prefix = _backend == _Backend.oss ? 'oss://' : 's3://';
      final ok = loc.startsWith(prefix) ||
          (_backend == _Backend.s3 && loc.startsWith('s3a://'));
      if (!ok) return l10n.memoryStorageInvalidScheme(prefix);
    }
    if (_backend == _Backend.oss && _endpoint.text.trim().isEmpty) {
      return l10n.memoryStorageInvalidOssEndpoint;
    }
    if (_backend == _Backend.rustfs && _endpoint.text.trim().isEmpty) {
      return l10n.memoryStorageInvalidRustfsEndpoint;
    }
    return null;
  }

  Future<void> _putOrDelete(String key, String value, {bool secret = false}) async {
    final client = ref.read(telencephalonClientProvider);
    final v = value.trim();
    if (v.isEmpty) {
      await client.deleteConfig(_section, key);
      return;
    }
    await client.putConfig(_section, key, v, secret: secret);
  }

  Future<void> _save() async {
    final l10n = AppLocalizations.of(context)!;
    final problem = _validate(l10n);
    if (problem != null) {
      setState(() {
        _error = problem;
        _savedNote = null;
      });
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
      _savedNote = null;
    });
    // ⚠️ **换根要搬数据**（2026-11-13 用户拍板）：目标与当前不同 ⇒ 不要只改
    // 一行 `storage_uri`（新根会是空库、旧数据留在原处）⇒ 交给大脑的迁移面。
    final target = _effectiveUri();
    String trimSlashes(String v) => v.replaceFirst(RegExp(r'/+$'), '');
    final baseline = _storedUri.trim().isNotEmpty ? _storedUri.trim() : target;
    final switchingRoot = baseline.isNotEmpty &&
        trimSlashes(baseline) != trimSlashes(target);
    if (switchingRoot) {
      await _startMigration(target);
      return;
    }
    try {
      await _putOrDelete(_keyUri, _location.text);
      await _putOrDelete(
        _keyEndpoint,
        _backend == _Backend.local ? '' : _endpoint.text,
      );
      await _putOrDelete(
        _keyRegion,
        _backend == _Backend.s3 ? _region.text : '',
      );
      if (_backend != _Backend.local) {
        await _putOrDelete(_keyAllowHttp, _allowHttp ? 'true' : '');
        await _putOrDelete(_keyCopyIfNotExists, _copyIfNotExists.text);
      }
      // ⚠️ 秘密只在**真的输入了新值**时写（掩码/空 ⇒ 保留原值）。
      if (_accessKey.text.isNotEmpty && _accessKey.text != _mask) {
        await _putOrDelete(_keyAccess, _accessKey.text, secret: true);
      }
      if (_secretKey.text.isNotEmpty && _secretKey.text != _mask) {
        await _putOrDelete(_keySecret, _secretKey.text, secret: true);
      }
      if (!mounted) return;
      setState(() {
        _saving = false;
        // `hippocampus` 段的 `applies_when` 是 restart ⇒ 一律说「重启后生效」。
        _savedNote = l10n.memoryStorageSavedPending;
      });
      await _load();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = '$e';
      });
    }
  }

  /// 发起换根迁移 ＋ 阻塞对话框 ＋ 完成后重启大脑。
  Future<void> _startMigration(String target) async {
    final l10n = AppLocalizations.of(context)!;
    setState(() {
      _saving = true;
      _error = null;
      _savedNote = null;
    });
    Map<String, dynamic> started;
    try {
      final client = ref.read(telencephalonClientProvider);
      started = await client.startStorageMigration({
        'uri': target,
        if (_backend != _Backend.local) 'endpoint': _endpoint.text.trim(),
        if (_backend == _Backend.s3) 'region': _region.text.trim(),
        if (_backend != _Backend.local) 'allow_http': _allowHttp,
        if (_backend != _Backend.local && _copyIfNotExists.text.trim().isNotEmpty)
          'copy_if_not_exists': _copyIfNotExists.text.trim(),
        // 秘密只在**真的输入了新值**时带上（掩码 / 空 ⇒ 用已存的）。
        if (_accessKey.text.isNotEmpty && _accessKey.text != _mask)
          'access_key': _accessKey.text,
        if (_secretKey.text.isNotEmpty && _secretKey.text != _mask)
          'secret_key': _secretKey.text,
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = '$e';
      });
      return;
    }
    if (!mounted) return;
    setState(() => _saving = false);

    final outcome = await showDialog<StorageMigrationOutcome>(
      context: context,
      // ⚠️ 迁移期记忆面与会话落盘都是 503 ⇒ 关掉对话框只会撞一串「请求失败」
      // ⇒ ⇒ 不可点遮罩关闭（对话框自己也 `PopScope(canPop:false)`）。
      barrierDismissible: false,
      builder: (_) => StorageMigrationDialog(initial: started),
    );
    if (!mounted) return;

    if (outcome == StorageMigrationOutcome.done) {
      // **重启大脑**让新根生效（手机上 stop+start 就够了 —— 大脑随 App 起停）。
      setState(() => _savedNote = l10n.memoryStorageMigrationRestarting);
      final notifier = ref.read(encephalonMobileProvider.notifier);
      await notifier.stop();
      await notifier.start();
      if (!mounted) return;
      setState(() => _savedNote = l10n.memoryStorageSavedPending);
      await _load();
      return;
    }
    // failed / aborted：源没动过 ⇒ 重新读一次真实状态。
    await _load();
    setState(() => _savedNote = null);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;

    if (_loading) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (_unreadable != null) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.cloud_off_outlined, size: 18, color: scheme.error),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    l10n.memoryStorageUnreadable,
                    style: TextStyle(fontWeight: FontWeight.w600, color: scheme.onSurface),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              l10n.memoryStorageBuildHint,
              style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 4),
            Text(
              _unreadable!,
              style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 8),
            TextButton(onPressed: _load, child: Text(l10n.memoryStorageRetry)),
          ],
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _configured ? l10n.memoryStorageConfigured : l10n.memoryStorageNotConfigured,
            style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 12),
          SegmentedButton<_Backend>(
            segments: [
              ButtonSegment(value: _Backend.local, label: Text(l10n.memoryStorageBackendLocal)),
              ButtonSegment(value: _Backend.rustfs, label: Text(l10n.memoryStorageBackendRustfs)),
              ButtonSegment(value: _Backend.s3, label: Text(l10n.memoryStorageBackendS3)),
              ButtonSegment(value: _Backend.oss, label: Text(l10n.memoryStorageBackendOss)),
            ],
            selected: {_backend},
            onSelectionChanged: (sel) => setState(() {
              _backend = sel.first;
              _savedNote = null;
              // **RustFS 预设**：协议仍是 s3://，把三样最容易填错的填好
              // （endpoint 本机、允许 http、copy 头能开）；用户仍可改。
              if (_backend == _Backend.rustfs) {
                if (_endpoint.text.trim().isEmpty) {
                  _endpoint.text = _rustfsDefaultEndpoint;
                }
                _allowHttp = true;
                _copyIfNotExists.text = _rustfsCopyHeader;
              }
            }),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _location,
            decoration: InputDecoration(
              labelText: l10n.memoryStorageLocation,
              helperText: _backend == _Backend.local
                  ? (_defaultRoot != null && _defaultRoot!.isNotEmpty
                      ? l10n.memoryStorageDefaultRootHint(_defaultRoot!)
                      : l10n.memoryStorageLocationLocalHint)
                  : l10n.memoryStorageLocationRemoteHint,
            ),
          ),
          if (_backend != _Backend.local) ...[
            const SizedBox(height: 10),
            TextField(
              controller: _endpoint,
              decoration: InputDecoration(
                labelText: l10n.memoryStorageEndpoint,
                helperText: l10n.memoryStorageEndpointHint,
              ),
            ),
            if (_backend == _Backend.s3) ...[
              const SizedBox(height: 10),
              TextField(
                controller: _region,
                decoration: InputDecoration(labelText: l10n.memoryStorageRegion),
              ),
            ],
            const SizedBox(height: 10),
            TextField(
              controller: _accessKey,
              obscureText: true,
              decoration: InputDecoration(
                labelText: l10n.memoryStorageAccessKey,
                helperText: l10n.memoryStorageSecretHint,
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _secretKey,
              obscureText: true,
              decoration: InputDecoration(
                labelText: l10n.memoryStorageSecretKey,
                helperText: l10n.memoryStorageSecretHint,
              ),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _allowHttp,
              onChanged: (v) => setState(() => _allowHttp = v),
              title: Text(l10n.memoryStorageAllowHttp, style: const TextStyle(fontSize: 13)),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _copyIfNotExists,
              decoration: InputDecoration(
                labelText: l10n.memoryStorageCopyIfNotExists,
                helperText: l10n.memoryStorageCopyIfNotExistsHint,
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              FilledButton(
                onPressed: _saving ? null : _save,
                child: Text(_saving ? l10n.memoryStorageSaving : l10n.memoryStorageSave),
              ),
              const SizedBox(width: 12),
              if (_savedNote != null)
                Expanded(
                  child: Text(
                    _savedNote!,
                    style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
                  ),
                ),
            ],
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: TextStyle(fontSize: 12, color: scheme.error)),
          ],
          const SizedBox(height: 12),
          Text(
            l10n.memoryStoragePendingHint,
            style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 4),
          Text(
            l10n.memoryStorageMigrationHint,
            style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 4),
          Text(
            l10n.memoryStorageBuildHint,
            style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}
