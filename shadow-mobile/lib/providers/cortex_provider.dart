import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/cortex/cortex_client.dart';

enum CortexStatus { stopped, starting, running, unreachable, error }

class CortexState {
  final CortexConnection connection;
  final CortexStatus status;
  final String? cortexId;
  final String? defaultAgent;
  final List<LobeInfo> lobes;
  final DateTime? lastCheck;
  final String? error;

  const CortexState({
    this.connection = const CortexConnection(baseUrl: 'http://127.0.0.1:8443'),
    this.status = CortexStatus.stopped,
    this.cortexId,
    this.defaultAgent,
    this.lobes = const [],
    this.lastCheck,
    this.error,
  });

  CortexState copyWith({
    CortexConnection? connection,
    CortexStatus? status,
    String? cortexId,
    String? defaultAgent,
    List<LobeInfo>? lobes,
    DateTime? lastCheck,
    String? error,
    bool clearError = false,
  }) {
    return CortexState(
      connection: connection ?? this.connection,
      status: status ?? this.status,
      cortexId: cortexId ?? this.cortexId,
      defaultAgent: defaultAgent ?? this.defaultAgent,
      lobes: lobes ?? this.lobes,
      lastCheck: lastCheck ?? this.lastCheck,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class CortexNotifier extends StateNotifier<CortexState> {
  final CortexClient _client;

  CortexNotifier({CortexClient? client})
      : _client = client ?? defaultCortexClient,
        super(const CortexState());

  CortexClient get client => _client;

  void setBaseUrl(String url) {
    _client.setBaseUrl(url);
    state = state.copyWith(connection: CortexConnection(baseUrl: url, apiKey: state.connection.apiKey));
  }

  void setApiKey(String? key) {
    _client.setApiKey(key);
    state = state.copyWith(connection: CortexConnection(baseUrl: state.connection.baseUrl, apiKey: key));
  }

  Future<void> refreshStatus() async {
    state = state.copyWith(status: CortexStatus.starting, clearError: true);
    try {
      final resp = await _client.health();
      final id = (resp['id'] as String?) ?? 'cortex';
      state = state.copyWith(
        status: CortexStatus.running,
        cortexId: id,
        lastCheck: DateTime.now(),
      );
    } catch (e) {
      state = state.copyWith(
        status: CortexStatus.unreachable,
        error: e.toString(),
        lastCheck: DateTime.now(),
      );
    }
  }

  Future<void> refreshLobes() async {
    try {
      final resp = await _client.listAgents();
      state = state.copyWith(
        lobes: resp.agents,
        cortexId: resp.cortexId.isNotEmpty ? resp.cortexId : state.cortexId,
        defaultAgent: resp.defaultAgent.isNotEmpty ? resp.defaultAgent : state.defaultAgent,
        lastCheck: DateTime.now(),
        clearError: true,
      );
    } catch (e) {
      state = state.copyWith(error: e.toString(), lastCheck: DateTime.now());
    }
  }
}

final cortexProvider = StateNotifierProvider<CortexNotifier, CortexState>((ref) {
  return CortexNotifier();
});
