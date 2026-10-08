import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/telencephalon/telencephalon_client.dart';
import 'telencephalon_provider.dart';

enum FlowsStatus { idle, loading, loaded, error }

class FlowsState {
  final FlowsStatus status;
  final List<FlowMeta> flows;
  final List<FlowDefinition> drafts;
  final String? error;

  const FlowsState({
    this.status = FlowsStatus.idle,
    this.flows = const [],
    this.drafts = const [],
    this.error,
  });

  FlowsState copyWith({
    FlowsStatus? status,
    List<FlowMeta>? flows,
    List<FlowDefinition>? drafts,
    String? error,
    bool clearError = false,
  }) =>
      FlowsState(
        status: status ?? this.status,
        flows: flows ?? this.flows,
        drafts: drafts ?? this.drafts,
        error: clearError ? null : (error ?? this.error),
      );
}

class FlowsNotifier extends StateNotifier<FlowsState> {
  final Ref _ref;
  FlowsNotifier(this._ref) : super(const FlowsState());

  TelencephalonClient get _client => _ref.read(telencephalonClientProvider);

  Future<void> refresh() async {
    state = state.copyWith(status: FlowsStatus.loading, clearError: true);
    try {
      final flows = await _client.listFlows();
      final drafts = await _client.listDrafts();
      state = state.copyWith(
        status: FlowsStatus.loaded,
        flows: flows,
        drafts: drafts,
        clearError: true,
      );
    } catch (e) {
      state = state.copyWith(
        status: FlowsStatus.error,
        error: e.toString(),
      );
    }
  }

  Future<FlowRunResult> runFlow(String flowIdOrName, Map<String, dynamic> inputs) async {
    return _client.runFlow(flowIdOrName, inputs);
  }

  Future<void> promoteDraft(String draftId) async {
    await _client.promoteDraft(draftId);
    await refresh();
  }

  Future<void> rejectDraft(String draftId) async {
    await _client.rejectDraft(draftId);
    await refresh();
  }
}

final flowsProvider = StateNotifierProvider<FlowsNotifier, FlowsState>((ref) {
  return FlowsNotifier(ref);
});
