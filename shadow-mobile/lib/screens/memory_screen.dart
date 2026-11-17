import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../generated/l10n/app_localizations.dart';
import '../services/prefrontal_client.dart';
import '../widgets/empty_state.dart';

final memoryNotifierProvider =
    StateNotifierProvider<MemoryNotifier, MemoryState>((ref) {
      return MemoryNotifier(ref.watch(prefrontalClientProvider));
    });

class MemoryState {
  final List<MemoryInfo> memories;
  final bool isLoading;
  final String? error;
  final String searchQuery;
  final String? selectedDimension;

  const MemoryState({
    this.memories = const [],
    this.isLoading = false,
    this.error,
    this.searchQuery = '',
    this.selectedDimension,
  });

  MemoryState copyWith({
    List<MemoryInfo>? memories,
    bool? isLoading,
    Object? error = _omit,
    String? searchQuery,
    Object? selectedDimension = _omit,
  }) {
    return MemoryState(
      memories: memories ?? this.memories,
      isLoading: isLoading ?? this.isLoading,
      // ⚠️⚠️ **哨兵**（2026-11-17 修）—— 以前写的是 `error: error`
      // ⇒ ⇒ 任何一次**没提 error** 的更新都把错误**清成 null**
      // ⇒ ⇒ 「加载失败」那条横幅**下一次更新就没了**⇒ ⇒ 用户只看到
      // ⇒ ⇒ 「空的记忆列表」⇒ ⇒ **失败长得像成功**。
      // ⇒ ⇒ 与 `ChatState.copyWith` 同一族（那边早就是哨兵了）。
      error: identical(error, _omit) ? this.error : error as String?,
      searchQuery: searchQuery ?? this.searchQuery,
      // ⚠️ **同一族**：以前写的是 `selectedDimension: selectedDimension`
      // ⇒ ⇒ 任何一次更新都把**维度筛选**悄悄重置回 null
      // ⇒ ⇒ 用户选完维度、列表一刷新就没了。
      selectedDimension: identical(selectedDimension, _omit)
          ? this.selectedDimension
          : selectedDimension as String?,
    );
  }

  List<MemoryInfo> get filteredMemories {
    // ⚠️⚠️ **维度名的大小写**（2026-11-17 修）——
    // 界面上的筛选值是 **'User'／'Agent'／'Session'**（首字母大写），
    // 而海马体给回来的 `dimension` 是**小写**（`user`／`agent`／`session`
    // —— 服务端那一侧认的也是小写）⇒ ⇒ 直接 `!=` 比 ⇒ ⇒ **一条都对不上**
    // ⇒ ⇒ ⇒ 用户一点「用户」维度，列表**整个空了**（而记忆还在）
    // ⇒ ⇒ ⇒ **失败长得像成功**。
    //
    // ⚠️⚠️ **归一只有一处**（2026-11-17 自曝）—— 头一版是「两边各归一
    // 一次」（`wanted` 归一 + `m.dimension` 归一）⇒ ⇒ 那条规则有**两份
    // 实现** ⇒ ⇒ 改一边、另一边还在 ⇒ ⇒ 「大小写无关」**没有真的被改掉**
    // ⇒ ⇒ 变异打掉其中一份**测不出来** ⇒ ⇒ **尺子钝了没人知道**
    // ⇒ ⇒ 现在归一走**同一个函数** ⇒ ⇒ 一处错 ⇒ ⇒ 两边一起错 ⇒ ⇒ 判据
    // 能逮到。
    final wanted = selectedDimension == null
        ? null
        : normalizeDimension(selectedDimension!);
    return memories.where((m) {
      if (wanted != null && normalizeDimension(m.dimension) != wanted) {
        return false;
      }
      if (searchQuery.isNotEmpty) {
        return m.content.toLowerCase().contains(searchQuery.toLowerCase());
      }
      return true;
    }).toList();
  }
}

/// 维度名**归一** —— **一处**实现（两边都走它）。
///
/// ⚠️ 为什么住在**外面**（而不是 `MemoryState` 的私有静态）：判据要能
/// 直接问它 ⇒ ⇒ 「这条规则现在是什么形状」必须是**可问的**，不是「藏在
/// 两个调用点里、每个都归一一次」。
String normalizeDimension(String dimension) => dimension.trim().toLowerCase();

/// 「**没传**」的哨兵 —— 让 `copyWith` 能**显式**把某格置空。
class _CopyWithOmit {
  const _CopyWithOmit();
}

const _omit = _CopyWithOmit();

class MemoryInfo {
  final String id;
  final String content;
  final String dimension;
  final DateTime createdAt;
  final double? score;

  MemoryInfo({
    required this.id,
    required this.content,
    required this.dimension,
    required this.createdAt,
    this.score,
  });

  factory MemoryInfo.fromJson(Map<String, dynamic> json) {
    return MemoryInfo(
      id: json['id'] ?? '',
      content: json['content'] ?? '',
      dimension: json['dimension'] ?? 'Agent',
      createdAt: DateTime.tryParse(json['created_at'] ?? '') ?? DateTime.now(),
      score: json['score']?.toDouble(),
    );
  }
}

class MemoryNotifier extends StateNotifier<MemoryState> {
  final PrefrontalClient _client;

  MemoryNotifier(this._client) : super(const MemoryState()) {
    loadMemories();
  }

  Future<void> loadMemories() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      // ⚠️⚠️ **列表走 `GET /api/memory`**（2026-11-17 修）——
      // 以前这里打的是 `searchMemory('')`（**空查询的搜索**）⇒ ⇒
      // ⇒ ① 空查询在混合检索里**没有词**⇒ ⇒ 得分低于服务端的 `min_score`
      // ⇒ ⇒ 整条被滤掉 ⇒ ⇒ ② 就算不过滤，「搜索」也不是「列表」这一格
      // ⇒ ⇒ ⇒ **界面上「一条记忆都没有」，明明有**⇒ ⇒ **失败长得像成功**。
      // ⇒ ⇒ 桌面端列的就是 `listMemories`（同一口径，桌面端是对的）。
      final results = await _client.listMemories(
        dimension: state.selectedDimension,
      );
      state = state.copyWith(
        memories: results
            .map(
              (m) => MemoryInfo.fromJson({
                'id': m.id,
                'content': m.content,
                'dimension': m.dimension,
                'created_at': m.createdAt.toIso8601String(),
                'score': m.score,
              }),
            )
            .toList(),
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> search(String query) async {
    state = state.copyWith(searchQuery: query);
    if (query.isEmpty) {
      await loadMemories();
      return;
    }
    try {
      final results = await _client.searchMemory(query);
      state = state.copyWith(
        memories: results
            .map(
              (m) => MemoryInfo.fromJson({
                'id': m.id,
                'content': m.content,
                'dimension': m.dimension,
                'created_at': m.createdAt.toIso8601String(),
                'score': m.score,
              }),
            )
            .toList(),
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  void setDimension(String? dimension) {
    state = state.copyWith(selectedDimension: dimension);
  }
}

class MemoryScreen extends ConsumerWidget {
  const MemoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final memoryState = ref.watch(memoryNotifierProvider);

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(l10n.memory),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () =>
                ref.read(memoryNotifierProvider.notifier).loadMemories(),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              decoration: InputDecoration(
                hintText: l10n.searchModels,
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                filled: true,
              ),
              onChanged: (value) =>
                  ref.read(memoryNotifierProvider.notifier).search(value),
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                FilterChip(
                  label: Text(l10n.filterAll),
                  selected: memoryState.selectedDimension == null,
                  onSelected: (_) => ref
                      .read(memoryNotifierProvider.notifier)
                      .setDimension(null),
                ),
                const SizedBox(width: 8),
                FilterChip(
                  label: Text(l10n.dimensionUser),
                  selected: memoryState.selectedDimension == 'User',
                  onSelected: (_) => ref
                      .read(memoryNotifierProvider.notifier)
                      .setDimension('User'),
                ),
                const SizedBox(width: 8),
                FilterChip(
                  label: Text(l10n.dimensionAgent),
                  selected: memoryState.selectedDimension == 'Agent',
                  onSelected: (_) => ref
                      .read(memoryNotifierProvider.notifier)
                      .setDimension('Agent'),
                ),
                const SizedBox(width: 8),
                FilterChip(
                  label: Text(l10n.dimensionSession),
                  selected: memoryState.selectedDimension == 'Session',
                  onSelected: (_) => ref
                      .read(memoryNotifierProvider.notifier)
                      .setDimension('Session'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: memoryState.isLoading
                ? const Center(child: CircularProgressIndicator())
                // ⚠️ **三态，不是两态**（2026-11-12）：以前只有
                // 「加载中 / 空」⇒ ⇒ 请求 404 / 网络失败也画成「暂无记忆」
                // ⇒ ⇒ **读不到长得像没有**。手机上的内置大脑是 `mobile`
                // profile（不含 hippocampus）⇒ `/hippocampus/api/search`
                // 根本没挂 ⇒ 这条分支就是手机上**必然**走的那一条。
                : memoryState.error != null
                ? _buildUnavailableState(context, memoryState.error!)
                : memoryState.filteredMemories.isEmpty
                ? _buildEmptyState(context)
                : _buildMemoryList(context, memoryState.filteredMemories),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    return EmptyState(icon: Icons.psychology_outlined, title: AppLocalizations.of(context)!.memoryEmpty);
  }

  /// 「读不到」的第三态 —— **说真话**：这台设备的记忆面没挂 / 请求失败。
  ///
  /// ⚠️ 与 [`_buildEmptyState`] 分开是这一格的全部意义：**空 ≠ 读不到**。
  Widget _buildUnavailableState(BuildContext context, String reason) {
    final l10n = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_outlined, size: 48, color: scheme.outline),
            const SizedBox(height: 12),
            Text(
              l10n.memoryUnavailable,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: scheme.onSurface),
            ),
            const SizedBox(height: 8),
            Text(
              l10n.memoryUnavailableHint('端脑', reason),
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMemoryList(BuildContext context, List<MemoryInfo> memories) {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      itemCount: memories.length,
      itemBuilder: (context, index) {
        final memory = memories[index];
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: _MemoryCard(memory: memory),
        );
      },
    );
  }
}

class _MemoryCard extends StatelessWidget {
  final MemoryInfo memory;

  const _MemoryCard({required this.memory});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: _getDimensionColor(memory.dimension),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    memory.dimension,
                    style: const TextStyle(color: Colors.white, fontSize: 12),
                  ),
                ),
                const SizedBox(width: 8),
                if (memory.score != null)
                  Text(
                    'Score: ${memory.score!.toStringAsFixed(2)}',
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.outline,
                      fontSize: 12,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(memory.content),
          ],
        ),
      ),
    );
  }

  Color _getDimensionColor(String dimension) {
    switch (dimension) {
      case 'User':
        return Colors.blue;
      case 'Agent':
        return Colors.purple;
      case 'Session':
        return Colors.green;
      case 'Resources':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }
}
