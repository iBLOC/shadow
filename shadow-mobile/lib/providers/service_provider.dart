import 'dart:async';
import 'package:http/http.dart' as http;
import 'package:flutter_riverpod/flutter_riverpod.dart';

enum ServiceStatus { unknown, checking, healthy, unhealthy, offline }

class ServiceInfo {
  final String name;
  final String displayName;
  final String host;
  final int port;
  final String path;
  ServiceStatus status;
  int? latencyMs;
  String? error;
  DateTime? lastCheck;

  ServiceInfo({
    required this.name,
    required this.displayName,
    required this.host,
    required this.port,
    this.path = '/health',
    this.status = ServiceStatus.unknown,
    this.latencyMs,
    this.error,
    this.lastCheck,
  });

  String get url => 'http://$host:$port$path';
}

class ServiceNotifier extends StateNotifier<List<ServiceInfo>> {
  ServiceNotifier()
    : super([
        ServiceInfo(
          name: 'resonance',
          displayName: 'Resonance',
          host: 'localhost',
          port: 8080,
        ),
        ServiceInfo(
          name: 'telencephalon',
          displayName: 'Telencephalon',
          host: 'localhost',
          port: 60080,
        ),
        ServiceInfo(
          name: 'hippocampus',
          displayName: 'Hippocampus',
          host: 'localhost',
          port: 8081,
        ),
      ]);

  Future<void> checkAll() async {
    state = state
        .map(
          (s) => ServiceInfo(
            name: s.name,
            displayName: s.displayName,
            host: s.host,
            port: s.port,
            path: s.path,
            status: ServiceStatus.checking,
          ),
        )
        .toList();

    await Future.wait(state.map((s) => _checkService(s)));

    state = [...state];
  }

  Future<void> _checkService(ServiceInfo service) async {
    final endpoints = ['/health', '/api/health', '/api/v1/health', '/'];
    ServiceInfo updated = service;

    for (final endpoint in endpoints) {
      final result = await _checkEndpoint(service.host, service.port, endpoint);
      if (result.ok) {
        updated = ServiceInfo(
          name: service.name,
          displayName: service.displayName,
          host: service.host,
          port: service.port,
          path: endpoint,
          status: ServiceStatus.healthy,
          latencyMs: result.latencyMs,
          lastCheck: DateTime.now(),
        );
        break;
      } else if (endpoint == endpoints.last) {
        updated = ServiceInfo(
          name: service.name,
          displayName: service.displayName,
          host: service.host,
          port: service.port,
          path: endpoint,
          status: ServiceStatus.offline,
          error: result.error,
          lastCheck: DateTime.now(),
        );
      }
    }

    state = state.map((s) => s.name == updated.name ? updated : s).toList();
  }

  Future<({bool ok, int? latencyMs, String? error})> _checkEndpoint(
    String host,
    int port,
    String path,
  ) async {
    final stopwatch = Stopwatch()..start();
    try {
      final uri = Uri.parse('http://$host:$port$path');
      final response = await http.get(uri).timeout(const Duration(seconds: 3));
      stopwatch.stop();

      if (response.statusCode >= 200 && response.statusCode < 400) {
        return (
          ok: true,
          latencyMs: stopwatch.elapsedMilliseconds,
          error: null,
        );
      }
      return (
        ok: false,
        latencyMs: stopwatch.elapsedMilliseconds,
        error: 'HTTP ${response.statusCode}',
      );
    } on TimeoutException {
      stopwatch.stop();
      return (
        ok: false,
        latencyMs: stopwatch.elapsedMilliseconds,
        error: 'Timeout',
      );
    } catch (e) {
      stopwatch.stop();
      return (
        ok: false,
        latencyMs: stopwatch.elapsedMilliseconds,
        error: e.toString(),
      );
    }
  }
}

final serviceProvider =
    StateNotifierProvider<ServiceNotifier, List<ServiceInfo>>((ref) {
      return ServiceNotifier();
    });
