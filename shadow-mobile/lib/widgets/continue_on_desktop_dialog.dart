import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../generated/l10n/app_localizations.dart';
import '../providers/cortex_provider.dart';
import '../services/session_transfer_service.dart';
import '../theme/app_colors.dart';

enum ContinueDesktopPhase {
  idle,
  probing,
  selecting,
  preparing,
  sending,
  success,
  failed,
}

class ContinueDesktopState {
  final List<DiscoveredPeer> peers;
  final DiscoveredPeer? selectedPeer;
  final ContinueDesktopPhase phase;
  final String? error;
  final int messageCount;
  final int payloadSize;
  final bool isLoading;
  final String sessionId;

  ContinueDesktopState({
    this.peers = const [],
    this.selectedPeer,
    this.phase = ContinueDesktopPhase.idle,
    this.error,
    this.messageCount = 0,
    this.payloadSize = 0,
    this.isLoading = true,
    this.sessionId = '',
  });

  ContinueDesktopState copyWith({
    List<DiscoveredPeer>? peers,
    DiscoveredPeer? selectedPeer,
    ContinueDesktopPhase? phase,
    String? error,
    int? messageCount,
    int? payloadSize,
    bool? isLoading,
    String? sessionId,
  }) {
    return ContinueDesktopState(
      peers: peers ?? this.peers,
      selectedPeer: selectedPeer ?? this.selectedPeer,
      phase: phase ?? this.phase,
      error: error,
      messageCount: messageCount ?? this.messageCount,
      payloadSize: payloadSize ?? this.payloadSize,
      isLoading: isLoading ?? this.isLoading,
      sessionId: sessionId ?? this.sessionId,
    );
  }
}

class ContinueDesktopNotifier extends StateNotifier<ContinueDesktopState> {
  final SessionTransferService _service;

  ContinueDesktopNotifier(this._service, String sessionId)
    : super(ContinueDesktopState(sessionId: sessionId)) {
    _discoverPeers();
  }

  Future<void> _discoverPeers() async {
    try {
      final peers = await _service.discoverPeers();
      state = state.copyWith(
        peers: peers,
        selectedPeer: peers.isNotEmpty ? peers.first : null,
        isLoading: false,
        phase: ContinueDesktopPhase.selecting,
      );
    } catch (e) {
      state = state.copyWith(
        error: e.toString(),
        isLoading: false,
        phase: ContinueDesktopPhase.failed,
      );
    }
  }

  void selectPeer(DiscoveredPeer peer) {
    state = state.copyWith(selectedPeer: peer);
  }

  Future<void> addManualPeer(String host, int port) async {
    state = state.copyWith(
      isLoading: true,
      phase: ContinueDesktopPhase.probing,
    );
    try {
      final peer = await _service.probePeer('http://$host:$port');
      final newPeers = [...state.peers, peer];
      state = state.copyWith(
        peers: newPeers,
        selectedPeer: peer,
        isLoading: false,
        phase: ContinueDesktopPhase.selecting,
      );
    } catch (e) {
      state = state.copyWith(
        error: 'Failed to connect: $e',
        isLoading: false,
        phase: ContinueDesktopPhase.failed,
      );
    }
  }

  Future<void> migrate() async {
    if (state.selectedPeer == null || state.sessionId.isEmpty) return;

    state = state.copyWith(phase: ContinueDesktopPhase.preparing, error: null);

    try {
      final export = await _service.exportSession(state.sessionId);
      final messageCount = export.messages.length;
      final sizeBytes = export.sizeBytes;

      state = state.copyWith(
        messageCount: messageCount,
        payloadSize: sizeBytes,
        phase: ContinueDesktopPhase.sending,
      );

      await _service.importSession(state.selectedPeer!.url, export);

      state = state.copyWith(phase: ContinueDesktopPhase.success);
    } catch (e) {
      state = state.copyWith(
        error: e.toString(),
        phase: ContinueDesktopPhase.failed,
      );
    }
  }

  Future<void> retry() async {
    state = state.copyWith(
      isLoading: true,
      error: null,
      phase: ContinueDesktopPhase.idle,
    );
    await _discoverPeers();
  }
}

final sessionTransferServiceProvider = Provider<SessionTransferService>((ref) {
  final cortex = ref.watch(cortexClientProvider);
  return SessionTransferService(cortex: cortex);
});

final continueDesktopProvider =
    StateNotifierProvider.autoDispose<
      ContinueDesktopNotifier,
      ContinueDesktopState
    >((ref) {
      return ContinueDesktopNotifier(SessionTransferService(), '');
    });

void initContinueDesktopDialog(WidgetRef ref, String sessionId) {
  if (ref.read(continueDesktopProvider).sessionId != sessionId) {
    ref.invalidate(continueDesktopProvider);
  }
}

class _ContinueOnDesktopDialogView extends ConsumerWidget {
  final String sessionId;

  const _ContinueOnDesktopDialogView({required this.sessionId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(continueDesktopProvider);
    final l10n = AppLocalizations.of(context)!;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize: 0.4,
      maxChildSize: 0.9,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
          ),
          child: Column(
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(
                      color: isDark
                          ? AppColors.darkBorder
                          : AppColors.lightBorder,
                    ),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.swap_horiz),
                        const SizedBox(width: 8),
                        Text(
                          l10n.continueDesktopTitle,
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      l10n.continueDesktopDescription,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: isDark
                            ? AppColors.darkTextSecondary
                            : AppColors.lightTextSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: state.isLoading
                    ? const Center(child: CircularProgressIndicator())
                    : _buildContent(context, ref, state, l10n),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildContent(
    BuildContext context,
    WidgetRef ref,
    ContinueDesktopState state,
    AppLocalizations l10n,
  ) {
    if (state.phase == ContinueDesktopPhase.failed && state.error != null) {
      return _ErrorView(
        error: state.error!,
        onRetry: ref.read(continueDesktopProvider.notifier).retry,
      );
    }

    if (state.peers.isEmpty && state.phase == ContinueDesktopPhase.selecting) {
      return _EmptyPeersView(
        onAddManually: ref.read(continueDesktopProvider.notifier).addManualPeer,
      );
    }

    if (state.phase == ContinueDesktopPhase.success) {
      return _SuccessView(peerName: state.selectedPeer?.name ?? '');
    }

    if (state.phase == ContinueDesktopPhase.preparing ||
        state.phase == ContinueDesktopPhase.sending) {
      return _ProgressView(
        phase: state.phase,
        peerName: state.selectedPeer?.name ?? '',
        messageCount: state.messageCount,
        payloadSize: state.payloadSize,
      );
    }

    final notifier = ref.read(continueDesktopProvider.notifier);
    return _PeerListView(
      peers: state.peers,
      selectedPeer: state.selectedPeer,
      onSelect: notifier.selectPeer,
      onConfirm: notifier.migrate,
      onAddManually: notifier.addManualPeer,
    );
  }
}

class _PeerListView extends StatefulWidget {
  final List<DiscoveredPeer> peers;
  final DiscoveredPeer? selectedPeer;
  final void Function(DiscoveredPeer) onSelect;
  final VoidCallback onConfirm;
  final void Function(String host, int port) onAddManually;

  const _PeerListView({
    required this.peers,
    this.selectedPeer,
    required this.onSelect,
    required this.onConfirm,
    required this.onAddManually,
  });

  @override
  State<_PeerListView> createState() => _PeerListViewState();
}

class _PeerListViewState extends State<_PeerListView> {
  final _manualController = TextEditingController();
  bool _showManualInput = false;

  @override
  void dispose() {
    _manualController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Column(
      children: [
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: widget.peers.length,
            itemBuilder: (context, index) {
              final peer = widget.peers[index];
              final isSelected = widget.selectedPeer?.id == peer.id;

              return Card(
                color: isSelected
                    ? Theme.of(context).colorScheme.primaryContainer
                    : null,
                child: ListTile(
                  leading: Icon(
                    Icons.computer,
                    color: isSelected
                        ? Theme.of(context).colorScheme.primary
                        : null,
                  ),
                  title: Text(peer.name),
                  subtitle: Text(peer.url),
                  trailing: isSelected
                      ? Icon(
                          Icons.check_circle,
                          color: Theme.of(context).colorScheme.primary,
                        )
                      : null,
                  onTap: () => widget.onSelect(peer),
                ),
              );
            },
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: OutlinedButton.icon(
            onPressed: () =>
                setState(() => _showManualInput = !_showManualInput),
            icon: const Icon(Icons.add),
            label: Text(l10n.addManually),
          ),
        ),
        if (_showManualInput)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _manualController,
                    decoration: InputDecoration(
                      hintText: '192.168.1.x:8082',
                      labelText: l10n.endpoint,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () {
                    final parts = _manualController.text.split(':');
                    if (parts.length == 2) {
                      final host = parts[0];
                      final port = int.tryParse(parts[1]) ?? 8082;
                      widget.onAddManually(host, port);
                    }
                  },
                  icon: const Icon(Icons.add),
                ),
              ],
            ),
          ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: Text(l10n.cancel),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: FilledButton(
                  onPressed: widget.selectedPeer != null
                      ? widget.onConfirm
                      : null,
                  child: Text(l10n.continueDesktopConfirm),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _EmptyPeersView extends StatelessWidget {
  final void Function(String host, int port) onAddManually;

  const _EmptyPeersView({required this.onAddManually});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final controller = TextEditingController();

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.computer_outlined,
            size: 48,
            color: isDark
                ? AppColors.darkTextSecondary
                : AppColors.lightTextSecondary,
          ),
          const SizedBox(height: 16),
          Text(
            l10n.continueDesktopNoPeers,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 24),
          TextField(
            controller: controller,
            decoration: InputDecoration(
              hintText: '192.168.1.100:8082',
              labelText: l10n.endpoint,
              suffixIcon: IconButton(
                icon: const Icon(Icons.add),
                onPressed: () {
                  final parts = controller.text.split(':');
                  if (parts.length == 2) {
                    final host = parts[0].trim();
                    final port = int.tryParse(parts[1].trim()) ?? 8082;
                    onAddManually(host, port);
                  }
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProgressView extends StatelessWidget {
  final ContinueDesktopPhase phase;
  final String peerName;
  final int messageCount;
  final int payloadSize;

  const _ProgressView({
    required this.phase,
    required this.peerName,
    required this.messageCount,
    required this.payloadSize,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final kb = (payloadSize / 1024).round();

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 24),
          if (messageCount > 0)
            Text(
              l10n.continueDesktopMessageCount(messageCount),
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          if (kb > 0)
            Text(
              l10n.continueDesktopSizeKb(kb),
              style: Theme.of(context).textTheme.bodySmall,
            ),
          const SizedBox(height: 16),
          Text(
            phase == ContinueDesktopPhase.preparing
                ? l10n.continueDesktopPreparing
                : l10n.continueDesktopInProgress(peerName),
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ],
      ),
    );
  }
}

class _SuccessView extends StatelessWidget {
  final String peerName;

  const _SuccessView({required this.peerName});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.check_circle, size: 48, color: AppColors.success),
          const SizedBox(height: 16),
          Text(
            l10n.continueDesktopSuccess(peerName),
            style: Theme.of(context).textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(l10n.confirm),
          ),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String error;
  final VoidCallback onRetry;

  const _ErrorView({required this.error, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, size: 48, color: AppColors.error),
          const SizedBox(height: 16),
          Text(
            l10n.continueDesktopError(error),
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(color: AppColors.error),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              OutlinedButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(l10n.cancel),
              ),
              const SizedBox(width: 16),
              FilledButton(onPressed: onRetry, child: Text(l10n.retry)),
            ],
          ),
        ],
      ),
    );
  }
}

Future<void> showContinueOnDesktopDialog(
  BuildContext context,
  String sessionId,
) async {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (ctx) {
      return ProviderScope(
        overrides: [
          continueDesktopProvider.overrideWith(
            (ref) =>
                ContinueDesktopNotifier(SessionTransferService(), sessionId),
          ),
        ],
        child: Builder(
          builder: (ctx) {
            return _ContinueOnDesktopDialogView(sessionId: sessionId);
          },
        ),
      );
    },
  );
}
