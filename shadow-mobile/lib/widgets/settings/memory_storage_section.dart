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
const _mask = '***';

enum _Backend { local, s3, oss }

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

  _Backend _backendOf(String uri) {
    if (uri.startsWith('oss://')) return _Backend.oss;
    if (uri.startsWith('s3://') || uri.startsWith('s3a://')) return _Backend.s3;
    return _Backend.local;
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _unreadable = null;
    });
    try {
      final view = await ref.read(telencephalonClientProvider).configSection(_section);
      final entries = (view['entries'] as List?) ?? const [];
      final uri = _valueOf(entries, _keyUri);
      final access = _valueOf(entries, _keyAccess);
      final secret = _valueOf(entries, _keySecret);
      if (!mounted) return;
      setState(() {
        _configured = uri.isNotEmpty;
        _storedUri = uri;
        _backend = _backendOf(uri);
        _location.text = uri;
        _endpoint.text = _valueOf(entries, _keyEndpoint);
        _region.text = _valueOf(entries, _keyRegion);
        // 服务端对秘密回掩码 ⇒ 原样显示成「已配置」，保存时跳过。
        _accessKey.text = access.isEmpty ? '' : _mask;
        _secretKey.text = secret.isEmpty ? '' : _mask;
        _allowHttp = _valueOf(entries, _keyAllowHttp) == 'true';
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
    if (loc.isEmpty) return l10n.memoryStorageInvalidLocation;
    if (_backend != _Backend.local) {
      final prefix = _backend == _Backend.oss ? 'oss://' : 's3://';
      final ok = loc.startsWith(prefix) ||
          (_backend == _Backend.s3 && loc.startsWith('s3a://'));
      if (!ok) return l10n.memoryStorageInvalidScheme(prefix);
    }
    if (_backend == _Backend.oss && _endpoint.text.trim().isEmpty) {
      return l10n.memoryStorageInvalidOssEndpoint;
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
    final target = _location.text.trim();
    String trimSlashes(String v) => v.replaceFirst(RegExp(r'/+$'), '');
    final switchingRoot = _storedUri.isNotEmpty &&
        trimSlashes(_storedUri.trim()) != trimSlashes(target);
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
              ButtonSegment(value: _Backend.s3, label: Text(l10n.memoryStorageBackendS3)),
              ButtonSegment(value: _Backend.oss, label: Text(l10n.memoryStorageBackendOss)),
            ],
            selected: {_backend},
            onSelectionChanged: (s) => setState(() {
              _backend = s.first;
              _savedNote = null;
            }),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _location,
            decoration: InputDecoration(
              labelText: l10n.memoryStorageLocation,
              helperText: _backend == _Backend.local
                  ? l10n.memoryStorageLocationLocalHint
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
