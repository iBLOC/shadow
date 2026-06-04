import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'prefrontal_client.dart';

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

class SessionExport {
  final String sessionId;
  final List<Map<String, dynamic>> messages;
  final int sizeBytes;

  SessionExport({
    required this.sessionId,
    required this.messages,
    required this.sizeBytes,
  });

  factory SessionExport.fromJson(Map<String, dynamic> json) {
    return SessionExport(
      sessionId: json['session_id'] ?? json['id'] ?? '',
      messages:
          (json['messages'] as List<dynamic>?)
              ?.map((e) => Map<String, dynamic>.from(e as Map))
              .toList() ??
          [],
      sizeBytes: json['size_bytes'] ?? 0,
    );
  }
}

class SessionTransferService {
  final http.Client _client;
  final PrefrontalClient _prefrontalClient;
  final String _localUrl;

  SessionTransferService({http.Client? client, String? baseUrl})
    : _client = client ?? http.Client(),
      _prefrontalClient = PrefrontalClient(baseUrl: baseUrl),
      _localUrl = baseUrl ?? 'http://localhost:8082';

  String get localBaseUrl => _localUrl;

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

  Future<Map<String, dynamic>> importSession(
    String peerUrl,
    SessionExport export,
  ) async {
    final payload = {
      'messages': export.messages,
      'session_id': export.sessionId,
    };

    final response = await _client.post(
      Uri.parse('$peerUrl/api/sessions/import'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(payload),
    );

    if (response.statusCode != 200) {
      throw Exception('Failed to import session: ${response.statusCode}');
    }

    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  void dispose() {
    _client.close();
  }
}
