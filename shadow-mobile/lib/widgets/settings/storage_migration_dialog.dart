import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../providers/telencephalon_provider.dart';

/// **迁移结束后**由调用方决定做什么（重启大脑 / 留原样）。
enum StorageMigrationOutcome { done, failed, aborted }

/// **迁移中的阻塞对话框** —— 搬家没完之前不许操作。
///
/// ## 为什么不可关
///
/// 迁移期间大脑把 `/hippocampus/*` 与 `/shadow/v1/conversations*` 全挡成
/// 503（`storage_migration_in_progress`）⇒ ⇒ 让用户回到界面只会撞上一串
/// 「请求失败」⇒ ⇒ 把**维护状态画成故障**。所以这里 `barrierDismissible:
/// false` ＋ `PopScope(canPop: false)`（返回键也不关）。
///
/// ## 轮询
///
/// 每秒读一次 `GET …/storage-migration`（与桌面端同一节奏）：
/// - `copying` / `flipping` ⇒ 进度（字节百分比 ＋ 数据集 i/N ＋ 当前数据集）；
/// - `done` ⇒ `Navigator.pop(done)`（调用方重启大脑）；
/// - `failed` / `aborted` ⇒ 停轮询，显示**后端原话** ＋ [重试] [放弃]。
class StorageMigrationDialog extends ConsumerStatefulWidget {
  const StorageMigrationDialog({super.key, this.initial});

  /// 发起迁移时后端回的那一份（`needs_migration:false` ⇒ 直接 done）。
  final Map<String, dynamic>? initial;

  @override
  ConsumerState<StorageMigrationDialog> createState() =>
      _StorageMigrationDialogState();
}

class _StorageMigrationDialogState extends ConsumerState<StorageMigrationDialog> {
  Timer? _timer;
  Map<String, dynamic> _status = const {};
  bool _busy = false;

  String get _state => '${_status['state'] ?? 'copying'}';
  bool get _running => _state == 'copying' || _state == 'flipping';
  bool get _failed => _state == 'failed' || _state == 'aborted';

  @override
  void initState() {
    super.initState();
    _status = widget.initial ?? const {'state': 'copying'};
    if (_state == 'done') {
      // 源里没有数据 ⇒ 配置已经切好，只差重启。
      WidgetsBinding.instance.addPostFrameCallback((_) => _finish());
    } else {
      _timer = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _tick() async {
    if (_busy) return;
    try {
      final next =
          await ref.read(telencephalonClientProvider).storageMigration();
      if (!mounted) return;
      setState(() => _status = next);
      if (_state == 'done') {
        _timer?.cancel();
        await _finish();
      } else if (_failed) {
        _timer?.cancel();
      }
    } catch (e) {
      if (!mounted) return;
      // ⚠️ 读不到就说真话（不静默重试到天荒地老）：状态面本身不受维护闸
      // 影响 ⇒ 它读不到 = 大脑真的没了。
      setState(() {
        _status = {
          ..._status,
          'state': 'failed',
          'error': '$e',
        };
      });
      _timer?.cancel();
    }
  }

  Future<void> _finish() async {
    if (!mounted) return;
    Navigator.of(context).pop(StorageMigrationOutcome.done);
  }

  Future<void> _retry() async {
    setState(() => _busy = true);
    try {
      // 重试 = 清掉旧记录再让调用方重发（这里只负责关闭，重发在调用方）。
      await ref.read(telencephalonClientProvider).cancelStorageMigration();
    } catch (_) {
      // 没有记录可取消也无所谓 —— 目标就是「回到可以重发的状态」。
    }
    if (!mounted) return;
    Navigator.of(context).pop(StorageMigrationOutcome.aborted);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final theme = Theme.of(context);
    final total = (_status['datasets_total'] as num?)?.toInt() ?? 0;
    final done = (_status['datasets_done'] as num?)?.toInt() ?? 0;
    final bytesTotal = (_status['bytes_total'] as num?)?.toInt() ?? 0;
    final bytesDone = (_status['bytes_done'] as num?)?.toInt() ?? 0;
    final pct = bytesTotal > 0
        ? (bytesDone / bytesTotal).clamp(0.0, 1.0)
        : (total > 0 ? done / total : 0.0);
    final current = _status['current'] as String?;
    final error = _status['error'] as String?;

    // ⚠️ `PopScope(canPop: false)` —— 返回键不关（迁移没结束时）。
    return PopScope(
      canPop: false,
      child: AlertDialog(
        title: Text(l10n.memoryStorageMigrationTitle),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _failed
                  ? l10n.memoryStorageMigrationFailedHint
                  : l10n.memoryStorageMigrationRunningHint,
              style: theme.textTheme.bodySmall,
            ),
            if (_running) ...[
              const SizedBox(height: 12),
              LinearProgressIndicator(value: pct == 0 ? null : pct),
              const SizedBox(height: 6),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    l10n.memoryStorageMigrationDatasets(done, total),
                    style: theme.textTheme.bodySmall,
                  ),
                  Text(
                    '${(pct * 100).round()}%',
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
              if (current != null)
                Text(
                  l10n.memoryStorageMigrationCurrent(current),
                  style: theme.textTheme.bodySmall,
                ),
            ],
            if (_failed && error != null) ...[
              const SizedBox(height: 12),
              Text(
                error,
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: theme.colorScheme.error),
              ),
            ],
          ],
        ),
        actions: _failed
            ? [
                TextButton(
                  onPressed: _busy ? null : () => Navigator.of(context).pop(
                        StorageMigrationOutcome.aborted,
                      ),
                  child: Text(l10n.memoryStorageMigrationAbort),
                ),
                FilledButton(
                  onPressed: _busy ? null : _retry,
                  child: Text(l10n.memoryStorageMigrationRetry),
                ),
              ]
            : null,
      ),
    );
  }
}
