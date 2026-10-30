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
    String? error,
    String? searchQuery,
    String? selectedDimension,
  }) {
    return MemoryState(
      memories: memories ?? this.memories,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      searchQuery: searchQuery ?? this.searchQuery,
      selectedDimension: selectedDimension,
    );
  }

  List<MemoryInfo> get filteredMemories {
    return memories.where((m) {
      if (selectedDimension != null && m.dimension != selectedDimension) {
        return false;
      }
      if (searchQuery.isNotEmpty) {
        return m.content.toLowerCase().contains(searchQuery.toLowerCase());
      }
      return true;
    }).toList();
  }
}

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
      final results = await _client.searchMemory('');
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
