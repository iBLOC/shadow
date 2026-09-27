import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;

import 'cortex/cortex_client.dart';

class DiscoveredPeer {
  final String id;
  final String name;
  final String host;
  final int port;
  final List<String> capabilities;
  final DateTime lastSeen;
  final bool isLocal;

  DiscoveredPeer({
    required this.id,
    required this.name,
    required this.host,
    required this.port,
    this.capabilities = const [],
    DateTime? lastSeen,
    this.isLocal = false,
  }) : lastSeen = lastSeen ?? DateTime.now();

  String get url => 'http://$host:$port';

  factory DiscoveredPeer.fromModelsResponse(
    Map<String, dynamic> json,
    String host,
    int port,
  ) {
    final caps =
        (json['data'] as List<dynamic>?)
            ?.map((e) => (e as Map<String, dynamic>)['id'] as String?)
            .whereType<String>()
            .toList() ??
        [];

    return DiscoveredPeer(
      id: '$host:$port',
      name:
          'Shadow ($host:${port.toString().substring(port.toString().length - 3)})',
      host: host,
      port: port,
      capabilities: caps,
    );
  }
}

class SessionTransferService {
  final http.Client _client;
  final String _localUrl;
  final CortexClient? _cortex;

  SessionTransferService({http.Client? client, String? baseUrl, CortexClient? cortex})
    : _client = client ?? http.Client(),
      _localUrl = baseUrl ?? 'http://localhost:60080',
      _cortex = cortex;

  String get localBaseUrl => _localUrl;
  CortexClient? get cortexClient => _cortex;

  Future<DiscoveredPeer> probePeer(String url) async {
    final uri = Uri.parse('$url/v1/models');
    final response = await _client.get(uri);

    if (response.statusCode != 200) {
      throw Exception('Failed to probe peer: ${response.statusCode}');
    }

    final json = jsonDecode(response.body) as Map<String, dynamic>;
    final uriObj = uri;
    final host = uriObj.host;
    final port = uriObj.port;

    return DiscoveredPeer.fromModelsResponse(json, host, port);
  }

  Future<List<DiscoveredPeer>> discoverPeers({
    Duration timeout = const Duration(seconds: 5),
  }) async {
    final peers = <DiscoveredPeer>[];

    final localPeer = DiscoveredPeer(
      id: 'local',
      name: '本机',
      host: 'localhost',
      port: 8082,
      capabilities: [],
      isLocal: true,
    );
    peers.add(localPeer);

    if (_cortex != null) {
      try {
        final agents = await _cortex.listAgents();
        for (final lobe in agents.agents) {
          if (!lobe.enabled) continue;
          final uri = Uri.tryParse(lobe.url);
          if (uri == null) continue;
          final host = uri.host;
          final port = uri.hasPort ? uri.port : (uri.scheme == 'https' ? 443 : 80);
          if (host.isEmpty || port <= 0) continue;
          if (peers.any((p) => p.host == host && p.port == port)) continue;
          peers.add(
            DiscoveredPeer(
              id: 'telencephalon:${lobe.name}',
              name: lobe.agentCard.name.isNotEmpty ? lobe.agentCard.name : lobe.name,
              host: host,
              port: port,
              capabilities: lobe.skills,
            ),
          );
        }
      } catch (_) {
        // telencephalon unreachable — fall back to local-only discovery
      }
    }

    return peers;
  }

  Future<SessionExport> exportSession(String sessionId) async {
    final response = await _client.get(
      Uri.parse('$_localUrl/api/sessions/$sessionId/export'),
      headers: {'Content-Type': 'application/json'},
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to export session: ${response.statusCode}');
    }

    final json = jsonDecode(response.body) as Map<String, dynamic>;
    return SessionExport.fromJson(json);
  }

  Future<Map<String, dynamic>> importSession(SessionExport export) async {
    if (_cortex == null) {
      throw StateError('telencephalon is required for session transfer; configure it in the backend settings');
    }
    final convo = await _cortex.importSessionAsConversation(export: export);
    return {
      'conversation_id': convo.id,
      'telencephalon_url': _cortex.baseUrl,
      'transferred_via': 'telencephalon',
    };
  }

  void dispose() {
    _client.close();
  }
}
