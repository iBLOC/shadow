import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/telencephalon/telencephalon_client.dart';

enum TelencephalonStatus { stopped, starting, running, unreachable, error }

class TelencephalonState {
  final TelencephalonConnection connection;
  final TelencephalonStatus status;
  final String? telencephalonId;
  final String? defaultAgent;
  final List<LobeInfo> lobes;
  final DateTime? lastCheck;
  final String? error;

  const TelencephalonState({
    this.connection = const TelencephalonConnection(baseUrl: 'http://127.0.0.1:60080'),
    this.status = TelencephalonStatus.stopped,
    this.telencephalonId,
    this.defaultAgent,
    this.lobes = const [],
    this.lastCheck,
    this.error,
  });

  TelencephalonState copyWith({
    TelencephalonConnection? connection,
    TelencephalonStatus? status,
    String? telencephalonId,
    String? defaultAgent,
    List<LobeInfo>? lobes,
    DateTime? lastCheck,
    String? error,
    bool clearError = false,
  }) {
    return TelencephalonState(
      connection: connection ?? this.connection,
      status: status ?? this.status,
      telencephalonId: telencephalonId ?? this.telencephalonId,
      defaultAgent: defaultAgent ?? this.defaultAgent,
      lobes: lobes ?? this.lobes,
      lastCheck: lastCheck ?? this.lastCheck,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class TelencephalonNotifier extends StateNotifier<TelencephalonState> {
  final TelencephalonClient _client;

  TelencephalonNotifier({TelencephalonClient? client})
      : _client = client ?? defaultTelencephalonClient,
        super(const TelencephalonState());

  TelencephalonClient get client => _client;

  void setBaseUrl(String url) {
    _client.setBaseUrl(url);
    state = state.copyWith(connection: TelencephalonConnection(baseUrl: url, apiKey: state.connection.apiKey));
  }

  void setApiKey(String? key) {
    _client.setApiKey(key);
    state = state.copyWith(connection: TelencephalonConnection(baseUrl: state.connection.baseUrl, apiKey: key));
  }

  void setAdminToken(String? token) {
    _client.setAdminToken(token);
  }

  Future<void> refreshStatus() async {
    state = state.copyWith(status: TelencephalonStatus.starting, clearError: true);
    try {
      final resp = await _client.health();
      final id = (resp['id'] as String?) ?? 'telencephalon';
      state = state.copyWith(
        status: TelencephalonStatus.running,
        telencephalonId: id,
        lastCheck: DateTime.now(),
      );
    } catch (e) {
      state = state.copyWith(
        status: TelencephalonStatus.unreachable,
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
        telencephalonId: resp.telencephalonId.isNotEmpty ? resp.telencephalonId : state.telencephalonId,
        defaultAgent: resp.defaultAgent.isNotEmpty ? resp.defaultAgent : state.defaultAgent,
        lastCheck: DateTime.now(),
        clearError: true,
      );
    } catch (e) {
      state = state.copyWith(error: e.toString(), lastCheck: DateTime.now());
    }
  }
}

final telencephalonProvider = StateNotifierProvider<TelencephalonNotifier, TelencephalonState>((ref) {
  return TelencephalonNotifier();
});

final telencephalonClientProvider = Provider<TelencephalonClient>((ref) {
  return ref.watch(telencephalonProvider.notifier).client;
});
