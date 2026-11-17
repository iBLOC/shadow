import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:logging/logging.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../providers/model_metadata_provider.dart';
import '../../providers/telencephalon_provider.dart';
import '../../services/models/known_models.dart';
import '../../services/telencephalon/telencephalon_client.dart';
import '../../theme/app_colors.dart';

/// neuron 本地模型**下载弹窗** —— 目录（含未下载）＋ 发起下载 ＋ 进度。
///
/// ⚠️ 数据源是 neuron 目录（脑面挂载 /v1/models），不是 /models/providers
/// 内置条目的读视图 —— 那份没有发起下载要的 engine / default_repo。
///
/// ⚠️ 下载是**异步任务**（POST /v1/models/pull ⇒ 202 ＋ job_id）⇒ ⇒ 弹窗用
/// ≈2 秒一次的轮询刷新进度；任务全部结束后刷新目录（available 翻绿）。
/// 关掉弹窗任务照跑（服务端在跑）；再进来会接上还在跑的任务。
///
/// ## 「添加自持模型 ＝ 挑一个下载」（2026-11-12）
///
/// ⚠️ **参数不许用户手填** —— 下载成功的条目，客户端拿
/// [catalogDownloadMetadata]（注册表命中 ⇒ 出厂默认全套；未命中 ⇒
/// 目录自带的能力词兜底）**自动落** `model_metadata` 表 ⇒ ⇒ 用户
/// 「选一个 → 下载」就完事，没有参数表单这一步。
class NeuronDownloadSheet extends ConsumerStatefulWidget {
  const NeuronDownloadSheet({super.key});

  /// 弹出下载弹窗。
  static Future<void> show(BuildContext context) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const Padding(
        padding: EdgeInsets.only(bottom: 8),
        child: NeuronDownloadSheet(),
      ),
    );
  }

  @override
  ConsumerState<NeuronDownloadSheet> createState() =>
      _NeuronDownloadSheetState();
}

class _NeuronDownloadSheetState extends ConsumerState<NeuronDownloadSheet> {
  static final _log = Logger('NeuronDownloadSheet');

  /// neuron 目录（null = 还在拉）。
  List<NeuronCatalogEntry>? _catalog;

  /// **读不到目录**的原因（弹窗里说真话，不画成「没有模型」）。
  String? _error;

  /// 最近一次任务快照（jobId → job）。
  final Map<String, NeuronPullJob> _jobs = {};

  /// 我们发起的条目 → jobId（同名仓库兜底按 engine＋reference 匹配）。
  final Map<String, String> _jobByEntry = {};

  /// 受理中的条目（防双击重复发起）。
  final Set<String> _starting = {};

  Timer? _poll;

  TelencephalonClient get _client => ref.read(telencephalonClientProvider);

  @override
  void initState() {
    super.initState();
    _loadCatalog();
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  /// 拉目录 ＋ 顺带接上**已经在跑**的任务（弹窗重开不丢进度）。
  Future<void> _loadCatalog() async {
    setState(() => _error = null);
    try {
      final catalogFuture = _client.neuronCatalog();
      final jobsFuture = _client.neuronPullJobs();
      final catalog = await catalogFuture;
      final jobs = await jobsFuture;
      if (!mounted) return;
      setState(() {
        _catalog = catalog;
        _jobs
          ..clear()
          ..addEntries(jobs.map((j) => MapEntry(j.jobId, j)));
      });
      _syncPolling();
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  /// 有活动任务 ⇒ 保证轮询在跑；没有 ⇒ 停表。
  void _syncPolling() {
    final anyActive = _jobs.values.any((j) => j.isActive);
    if (anyActive) {
      _poll ??= Timer.periodic(
        const Duration(milliseconds: 2000),
        (_) => _tick(),
      );
    } else {
      _poll?.cancel();
      _poll = null;
    }
  }

  /// 轮询一拍：刷新任务快照；有任务刚跑到终态 ⇒ 刷目录（available 翻绿）。
  Future<void> _tick() async {
    try {
      final jobs = await _client.neuronPullJobs();
      if (!mounted) return;
      final finishedNow = jobs
          .where(
            (j) =>
                (j.isDone || j.isFailed) && _jobs[j.jobId]?.isActive == true,
          )
          .map((j) => j.jobId)
          .toList();
      setState(() {
        _jobs
          ..clear()
          ..addEntries(jobs.map((j) => MapEntry(j.jobId, j)));
      });
      if (finishedNow.isNotEmpty) {
        // ⚠️ **下载成功 ⇒ 默认参数自动落**（catalog_download 那一刀）——
        // 只挑「这一拍刚跑完且成功」的任务，失败/取消不落（盘上没有的
        // 模型不该有元数据徽章）。
        final succeeded = jobs
            .where((j) => finishedNow.contains(j.jobId) && j.isDone)
            .toList();
        for (final j in succeeded) {
          final entry = _entryForJob(j);
          if (entry != null) await _saveDefaultsFor(entry);
        }
        await _loadCatalog();
      } else {
        _syncPolling();
      }
    } catch (_) {
      // 轮询失败不弹全局错误 —— 下一拍再试（弹窗里已有任务快照可看）。
    }
  }

  /// 任务 → 目录条目（engine ＋ reference 各自对上就算同一条；目录此刻
  /// 还在手里，赶在刷新前查）。
  NeuronCatalogEntry? _entryForJob(NeuronPullJob job) {
    for (final e in _catalog ?? const <NeuronCatalogEntry>[]) {
      if (e.engine == job.engine && (e.defaultRepo ?? '') == job.reference) {
        return e;
      }
    }
    return null;
  }

  /// 默认参数落盘 —— **best-effort**：失败只记日志（徽章缺一块 ≠ 下载
  /// 失败，弹窗不该被它打断）。
  Future<void> _saveDefaultsFor(NeuronCatalogEntry entry) async {
    try {
      await ref
          .read(modelMetadataProvider.notifier)
          .save(
            catalogDownloadMetadata(
              modelId: entry.modelId,
              catalogCapabilities: entry.capabilities,
            ),
          );
    } catch (e) {
      _log.warning('目录模型默认参数落盘失败 (${entry.id}): $e');
    }
  }

  /// 发起下载：reference 用条目的 default_repo，id 用去前缀的 modelId。
  Future<void> _download(NeuronCatalogEntry entry) async {
    final reference = entry.defaultRepo;
    if (reference == null || reference.isEmpty) return;
    final key = entry.id;
    setState(() => _starting.add(key));
    try {
      final jobId = await _client.neuronPull(
        reference: reference,
        engine: entry.engine,
        id: entry.modelId,
      );
      _jobByEntry[key] = jobId;
      if (!mounted) return;
      setState(() {
        _jobs[jobId] = NeuronPullJob(
          jobId: jobId,
          status: 'pending',
          reference: reference,
          engine: entry.engine,
          bytesDownloaded: 0,
        );
      });
      _syncPolling();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _starting.remove(key));
    }
  }

  /// 取消一个任务。
  Future<void> _cancel(String jobId) async {
    try {
      await _client.neuronPullCancel(jobId);
      await _tick();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  /// 一条目录条目对应的任务（我们发起的按 jobId；接上的按 engine＋reference）。
  NeuronPullJob? _jobFor(NeuronCatalogEntry entry) {
    final mapped = _jobByEntry[entry.id];
    if (mapped != null) {
      final j = _jobs[mapped];
      if (j != null) return j;
    }
    for (final j in _jobs.values) {
      if (j.isActive &&
          j.engine == entry.engine &&
          j.reference == (entry.defaultRepo ?? '')) {
        return j;
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.85,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 8, 12),
              child: Row(
                children: [
                  const Icon(Icons.download, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      l10n.providersDownloadModels,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 20),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Flexible(child: _buildBody(context, l10n)),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(BuildContext context, AppLocalizations l10n) {
    // 读不到 ⇒ 说真话（承「读不到 ≠ 没有」—— 不画成「没有模型」）。
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off, size: 40, color: AppColors.error),
              const SizedBox(height: 12),
              Text(
                l10n.commonErrorDetail(_error!),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () {
                  setState(() => _catalog = null);
                  _loadCatalog();
                },
                icon: const Icon(Icons.refresh, size: 18),
                label: Text(l10n.commonRefresh),
              ),
            ],
          ),
        ),
      );
    }
    final catalog = _catalog;
    if (catalog == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (catalog.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            l10n.providersDownloadEmpty,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ),
      );
    }
    final downloadedCount = catalog.where((e) => e.available).length;
    // ⚠️ 两段式（2026-11-18 用户逐字：「像 qwen2.5 这类的老模型不再
    // 推荐下载 用户可以在历史支持模型库中选择下载」）：推荐档在上
    // （当前世代），老模型收进「历史支持模型库」—— **仍可下载**，
    // 只是折叠起来不占推荐位。判据来自服务端目录的 `recommended`
    // 字段（neuron LEGACY_MODEL_IDS 说了算），客户端不维护第二份清单。
    final recommended =
        catalog.where((e) => e.recommended).toList(growable: false);
    final legacy = catalog.where((e) => !e.recommended).toList(growable: false);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(
            '${l10n.providersDownloadedOnly} $downloadedCount · ${catalog.length}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
        if (recommended.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              l10n.providersDownloadRecommended,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: AppColors.darkTextSecondary,
                  ),
            ),
          ),
          ..._tierSections(context, l10n, recommended),
        ],
        if (legacy.isNotEmpty)
          Theme(
            data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
            child: ExpansionTile(
              tilePadding: EdgeInsets.zero,
              childrenPadding: const EdgeInsets.only(left: 12, bottom: 8),
              initiallyExpanded: false,
              maintainState: true,
              title: Text(
                l10n.providersDownloadLegacy(legacy.length),
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      color: AppColors.darkTextSecondary,
                    ),
              ),
              subtitle: Text(
                l10n.providersDownloadLegacyHint,
                style: Theme.of(context).textTheme.bodySmall,
              ),
              children: _tierSections(context, l10n, legacy, inset: false),
            ),
          ),
      ],
    );
  }

  /// 一个档位（推荐 / 历史库）里的条目按 engine 分组渲染 ——
  /// 保持服务端顺序，组头是 engine 名。
  List<Widget> _tierSections(
    BuildContext context,
    AppLocalizations l10n,
    List<NeuronCatalogEntry> entries, {
    bool inset = true,
  }) {
    final groups = <String, List<NeuronCatalogEntry>>{};
    for (final e in entries) {
      groups.putIfAbsent(e.engine.isEmpty ? '-' : e.engine, () => []).add(e);
    }
    return [
      for (final engine in groups.keys)
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 12, bottom: 4),
              child: Text(
                engine,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      color: AppColors.darkTextSecondary,
                    ),
              ),
            ),
            for (final e in groups[engine]!)
              Padding(
                // 历史库的 ExpansionTile 自带 childrenPadding ⇒ 不再垫一层。
                padding: EdgeInsets.only(left: inset ? 0 : 8, right: inset ? 0 : 8),
                child: _EntryTile(
                  entry: e,
                  job: _jobFor(e),
                  starting: _starting.contains(e.id),
                  onDownload: () => _download(e),
                  onCancel: () {
                    final job = _jobFor(e);
                    if (job != null) _cancel(job.jobId);
                  },
                  fmtBytes: _fmtBytes,
                  progressLabel: (received, total) => total == null
                      ? l10n.providersDownloadReceived(received)
                      : l10n.providersDownloadProgress(received, total),
                  doneLabel: l10n.providersDownloadDone,
                  failedLabel: l10n.providersDownloadFailed,
                  retryLabel: l10n.providersDownloadRetry,
                  cancelLabel: l10n.commonCancel,
                  downloadLabel: l10n.providersDownloadAction,
                  downloadingLabel: l10n.providersDownloading,
                ),
              ),
          ],
        ),
    ];
  }

  static String _fmtBytes(int? bytes) {
    if (bytes == null) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var value = bytes.toDouble();
    var unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }
    return value >= 100 || unit == 0
        ? '${value.toStringAsFixed(0)} ${units[unit]}'
        : '${value.toStringAsFixed(1)} ${units[unit]}';
  }
}

/// 目录里的一条（行级 UI ＋ 该条目的任务状态）。
class _EntryTile extends StatelessWidget {
  final NeuronCatalogEntry entry;
  final NeuronPullJob? job;
  final bool starting;
  final VoidCallback onDownload;
  final VoidCallback onCancel;
  final String Function(int?) fmtBytes;
  final String Function(int received, int? total) progressLabel;
  final String doneLabel;
  final String failedLabel;
  final String retryLabel;
  final String cancelLabel;
  final String downloadLabel;
  final String downloadingLabel;

  const _EntryTile({
    required this.entry,
    required this.job,
    required this.starting,
    required this.onDownload,
    required this.onCancel,
    required this.fmtBytes,
    required this.progressLabel,
    required this.doneLabel,
    required this.failedLabel,
    required this.retryLabel,
    required this.cancelLabel,
    required this.downloadLabel,
    required this.downloadingLabel,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final subtitle = <String>[
      // 主源亮出来（modelscope / hf-mirror / huggingface）—— 「国内
      // 模型从魔搭社区下载」在 UI 上要看得见，否则来源翻车只能猜。
      if (entry.source.isNotEmpty) entry.source,
      if (entry.sizeBytes != null) fmtBytes(entry.sizeBytes),
    ];
    return ListTile(
      dense: true,
      contentPadding: EdgeInsets.zero,
      title: Row(
        children: [
          Expanded(
            child: Text(
              entry.modelId,
              style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
            ),
          ),
          // 引擎档徽标 —— 同一个模型在不同引擎下要下载的文件不一样
          // （candle 吃 safetensors、litert 吃 tflite…），挑的必须是
          // 「引擎 × 模型」，徽标让它可见。
          if (entry.engineImpl.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(left: 8),
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: theme.colorScheme.secondaryContainer,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                entry.engineImpl,
                style: TextStyle(
                  fontSize: 10,
                  color: theme.colorScheme.onSecondaryContainer,
                ),
              ),
            ),
        ],
      ),
      subtitle: subtitle.isEmpty
          ? null
          : Text(subtitle.join(' · '), style: theme.textTheme.bodySmall),
      trailing: _buildTrailing(context),
    );
  }

  Widget? _buildTrailing(BuildContext context) {
    final theme = Theme.of(context);
    final j = job;
    if (j != null) {
      // ⚠️ 任务在跑 ⇒ 进度条 ＋ 取消；终态 ⇒ 结果 ＋（失败时）重试。
      if (j.isActive) {
        final total = j.totalBytes;
        double? progress;
        if (total != null && total > 0) {
          progress = (j.bytesDownloaded / total).clamp(0.0, 1.0).toDouble();
        }
        return SizedBox(
          width: 148,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Expanded(child: LinearProgressIndicator(value: progress)),
                  const SizedBox(width: 6),
                  InkWell(
                    onTap: onCancel,
                    child: Padding(
                      padding: const EdgeInsets.all(4),
                      child: Text(
                        cancelLabel,
                        style: TextStyle(
                          fontSize: 11,
                          color: theme.colorScheme.error,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                progress == null ? downloadingLabel : '',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.labelSmall,
              ),
            ],
          ),
        );
      }
      if (j.isDone) {
        return _StatusChip(label: doneLabel, color: AppColors.success);
      }
      if (j.isFailed) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              failedLabel,
              style: TextStyle(fontSize: 11, color: theme.colorScheme.error),
            ),
            // ⚠️ 失败要**说真话**：服务端那行错误（404 ／ 401 ／ 建目录
            // 失败 …）原样亮出来 —— 此前只画「下载失败」四个字，真原因
            // 只在日志里 ⇒ 「失败长得像成功」的反面：失败长得像谜语。
            if ((j.error ?? '').isNotEmpty)
              SizedBox(
                width: 180,
                child: Text(
                  j.error!,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.end,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.error.withValues(alpha: 0.8),
                  ),
                ),
              ),
            TextButton(
              onPressed: onDownload,
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: Text(retryLabel, style: const TextStyle(fontSize: 12)),
            ),
          ],
        );
      }
      // cancelled 或未知终态：按「未下载」落回下载按钮。
    }
    if (entry.available) {
      return const Icon(Icons.check_circle, size: 18, color: AppColors.success);
    }
    final canPull = entry.defaultRepo != null && entry.defaultRepo!.isNotEmpty;
    return starting
        ? const SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        : OutlinedButton(
            onPressed: canPull ? onDownload : null,
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: Text(downloadLabel, style: const TextStyle(fontSize: 12)),
          );
  }
}

/// 结果徽标（已完成）。
class _StatusChip extends StatelessWidget {
  final String label;
  final Color color;

  const _StatusChip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(label, style: TextStyle(fontSize: 10, color: color)),
    );
  }
}
