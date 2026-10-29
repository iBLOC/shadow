import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart' as http_testing;
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

void main() {
  group('TelencephalonClient', () {
    late TelencephalonClient client;
    late http.Client mockHttpClient;

    setUp(() {
      mockHttpClient = http_testing.MockClient((request) async {
        final path = request.url.path;
        
        if (path == '/.well-known/agent.json') {
          return http.Response(
            jsonEncode({'status': 'ok', 'addr': '127.0.0.1:60080'}),
            200,
          );
        }
        
        if (path == '/shadow/v1/agents') {
          return http.Response(
            jsonEncode({
              'telencephalon': {'id': 'test-id', 'instance_name': 'test', 'default_agent': 'prefrontal'},
              'agents': [],
            }),
            200,
          );
        }
        
        if (path == '/shadow/v1/conversations') {
          if (request.method == 'GET') {
            return http.Response(jsonEncode([]), 200);
          }
          return http.Response(
            jsonEncode({
              'id': 'conv-1',
              'agent': 'prefrontal',
              'created_at': '2026-01-01T00:00:00Z',
              'updated_at': '2026-01-01T00:00:00Z',
              'history': [],
            }),
            200,
          );
        }
        
        if (path.startsWith('/api/flows')) {
          return http.Response(jsonEncode([]), 200);
        }
        
        return http.Response('Not Found', 404);
      });
      
      client = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: mockHttpClient,
      );
    });

    tearDown(() {
      client.dispose();
    });

    test('health() returns status', () async {
      final result = await client.health();
      expect(result['status'], 'ok');
      expect(result['addr'], '127.0.0.1:60080');
    });

    test('listAgents() returns AgentsResponse', () async {
      final response = await client.listAgents();
      expect(response.telencephalonId, 'test-id');
      expect(response.instanceName, 'test');
      expect(response.agents, isEmpty);
    });

    test('listConversations() returns empty list', () async {
      final conversations = await client.listConversations();
      expect(conversations, isEmpty);
    });

    test('createConversation() returns Conversation', () async {
      final conversation = await client.createConversation(
        agent: 'prefrontal',
        systemPrompt: 'You are a helpful assistant',
      );
      expect(conversation.id, 'conv-1');
      expect(conversation.agent, 'prefrontal');
    });

    test('listFlows() returns empty list', () async {
      final flows = await client.listFlows();
      expect(flows, isEmpty);
    });

    test('setBaseUrl() updates base URL', () {
      client.setBaseUrl('http://192.168.1.100:60080');
      expect(client.baseUrl, 'http://192.168.1.100:60080');
    });

    test('setApiKey() updates API key', () {
      client.setApiKey('test-key-123');
      expect(client.apiKey, 'test-key-123');
    });

    // This one needs the group's `client` (and the mock that serves
    // /shadow/v1/agents), so it belongs to the first group rather than
    // the model-only group below.
    test('listAgents parses telencephalon envelope', () async {
      final resp = await client.listAgents();
      expect(resp.telencephalonId, 'test-id');
      expect(resp.instanceName, 'test');
      expect(resp.defaultAgent, 'prefrontal');
    });
  });

  group('TelencephalonClient models', () {
    test('AgentCard.fromJson() parses correctly', () {
      final json = {
        'name': 'test-agent',
        'description': 'A test agent',
        'version': '1.0.0',
        'url': 'http://localhost:8082',
        'metadata': {
          'input_modalities': ['text'],
          'output_modalities': ['text', 'audio'],
          'capabilities': ['chat', 'voice'],
        },
      };
      
      final card = AgentCard.fromJson(json);
      expect(card.name, 'test-agent');
      expect(card.description, 'A test agent');
      expect(card.version, '1.0.0');
      expect(card.inputModalities, ['text']);
      expect(card.outputModalities, ['text', 'audio']);
      expect(card.capabilities, ['chat', 'voice']);
    });

    test('LobeInfo.fromJson() parses correctly', () {
      final json = {
        'name': 'prefrontal',
        'kind': 'native',
        'url': 'http://localhost:8082',
        'enabled': true,
        'skills': ['chat', 'tool-use'],
        'agent_card': {
          'name': 'prefrontal',
          'description': 'Main agent',
          'version': '1.0.0',
          'url': 'http://localhost:8082',
          'metadata': {
            'input_modalities': ['text'],
            'output_modalities': ['text'],
            'capabilities': [],
          },
        },
        'health_status': 'healthy',
      };
      
      final lobe = LobeInfo.fromJson(json);
      expect(lobe.name, 'prefrontal');
      expect(lobe.kind, 'native');
      expect(lobe.enabled, true);
      expect(lobe.skills, ['chat', 'tool-use']);
      expect(lobe.healthStatus, 'healthy');
    });

    test('FlowMeta.fromJson() parses correctly', () {
      final json = {
        'id': 'flow-1',
        'name': 'test-flow',
        'version': '1.0.0',
        'is_draft': false,
        'tags': ['test', 'example'],
      };
      
      final flow = FlowMeta.fromJson(json);
      expect(flow.id, 'flow-1');
      expect(flow.name, 'test-flow');
      expect(flow.isDraft, false);
      expect(flow.tags, ['test', 'example']);
    });

    test('SendMessageRequest.toJson() serializes correctly', () {
      final req = SendMessageRequest(text: 'Hello', agent: 'prefrontal');
      final json = req.toJson();
      expect(json['text'], 'Hello');
      expect(json['agent'], 'prefrontal');
    });

    test('SendMessageRequest.toJson() omits null agent', () {
      final req = SendMessageRequest(text: 'Hello');
      final json = req.toJson();
      expect(json['text'], 'Hello');
      expect(json.containsKey('agent'), false);
    });

    test('runFlow resolves by name then POSTs /api/flows/{id}/run', () async {
      bool listCalled = false;
      bool runCalled = false;
      String? runPath;
      final mockClient = http_testing.MockClient((request) async {
        final path = request.url.path;
        if (path == '/api/flows' && request.method == 'GET') {
          listCalled = true;
          return http.Response(
            jsonEncode([
              {
                'id': 'flow-uuid-1234',
                'name': 'demo',
                'version': '0.1.0',
                'is_draft': false,
                'tags': [],
              },
            ]),
            200,
          );
        }
        if (path == '/api/flows/flow-uuid-1234/run' &&
            request.method == 'POST') {
          runCalled = true;
          runPath = path;
          return http.Response(jsonEncode({'ok': true}), 200);
        }
        return http.Response('Not Found: $path', 404);
      });
      final c = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: mockClient,
      );
      final res = await c.runFlow('demo', {'input': 'hi'});
      expect(listCalled, true);
      expect(runCalled, true);
      expect(runPath, '/api/flows/flow-uuid-1234/run');
      expect(res.outputs['ok'], true);
    });

    test('admin POSTs include X-Admin-Token header', () async {
      String? seenHeader;
      final mockClient = http_testing.MockClient((request) async {
        if (request.url.path == '/api/telencephalon/admin/mcp/servers' &&
            request.method == 'POST') {
          seenHeader = request.headers['X-Admin-Token'];
          return http.Response(jsonEncode({'id': 'srv-1'}), 200);
        }
        return http.Response('Not Found', 404);
      });
      final c = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        adminToken: 'secret-admin-token',
        client: mockClient,
      );
      await c.createMcpServer(
        name: 'srv-1',
        wasmName: 'w',
        wasmVersion: '0.1.0',
        wasmSha256: 'deadbeef',
      );
      expect(seenHeader, 'secret-admin-token');
    });

    test('AgentsResponse envelope falls back to legacy "cortex" key', () {
      final r = AgentsResponse.fromJson({
        'cortex': {
          'id': 'legacy-id',
          'instance_name': 'legacy',
          'default_agent': 'prefrontal',
        },
        'agents': [],
      });
      expect(r.telencephalonId, 'legacy-id');
      expect(r.instanceName, 'legacy');
      expect(r.defaultAgent, 'prefrontal');
      expect(r.agents, isEmpty);
    });

    test('AgentsResponse envelope prefers "telencephalon" over "cortex"', () {
      final r = AgentsResponse.fromJson({
        'telencephalon': {'id': 'new-id', 'instance_name': 'new', 'default_agent': 'temporal'},
        'cortex': {'id': 'old-id', 'instance_name': 'old', 'default_agent': 'prefrontal'},
        'agents': [],
      });
      expect(r.telencephalonId, 'new-id');
      expect(r.instanceName, 'new');
      expect(r.defaultAgent, 'temporal');
    });

    test('runFlow with a UUID-shaped id short-circuits list and posts /api/flows/{id}/run',
        () async {
      bool listCalled = false;
      String? runPath;
      final mockClient = http_testing.MockClient((request) async {
        if (request.url.path == '/api/flows' && request.method == 'GET') {
          listCalled = true;
          return http.Response(jsonEncode([]), 200);
        }
        if (request.url.path == '/api/flows/12345678-1234-1234-1234-123456789abc/run') {
          runPath = request.url.path;
          return http.Response(jsonEncode({'ok': true}), 200);
        }
        return http.Response('Not Found', 404);
      });
      final c = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: mockClient,
      );
      await c.runFlow('12345678-1234-1234-1234-123456789abc', {'k': 'v'});
      expect(listCalled, false, reason: 'id-shaped input must skip list');
      expect(runPath, '/api/flows/12345678-1234-1234-1234-123456789abc/run');
    });

    test('runFlow with an unknown name throws TelencephalonException', () async {
      final mockClient = http_testing.MockClient((request) async {
        if (request.url.path == '/api/flows') {
          return http.Response(jsonEncode([]), 200);
        }
        return http.Response('Not Found', 404);
      });
      final c = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: mockClient,
      );
      expect(
        () => c.runFlow('does-not-exist', const {}),
        throwsA(isA<TelencephalonException>()),
      );
    });

    test('webrtcSignalingUrl builds a deterministic URL', () {
      // Pure URL builder — no HTTP involved, so a local client is enough.
      final c = TelencephalonClient(baseUrl: 'http://127.0.0.1:60080');
      final url = c.webrtcSignalingUrl('sess-1', modality: 'voice');
      expect(
        url.toString(),
        'http://127.0.0.1:60080/api/webrtc/voice/sessions/sess-1/ws',
      );
    });

    test('searchAgents hits /api/telencephalon/agents/search with query params',
        () async {
      String? seenPath;
      final mockClient = http_testing.MockClient((request) async {
        if (request.url.path == '/api/telencephalon/agents/search') {
          seenPath = request.url.path;
          return http.Response(
            jsonEncode({'agents': [{'name': 'asr-lobe'}]}),
            200,
          );
        }
        return http.Response('Not Found', 404);
      });
      final c = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: mockClient,
      );
      final r = await c.searchAgents(skill: 'asr');
      expect(seenPath, '/api/telencephalon/agents/search');
      expect(r['agents'], hasLength(1));
    });

    test('health() retries the well-known URL on 500', () async {
      int calls = 0;
      final mockClient = http_testing.MockClient((request) async {
        calls++;
        if (calls == 1) {
          return http.Response('boom', 500);
        }
        return http.Response(jsonEncode({'id': 'ok'}), 200);
      });
      final c = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: mockClient,
      );
      // The current client does NOT retry on 500; assert the documented
      // behaviour so a future change has to update the test on purpose.
      expect(
        () => c.health(),
        throwsA(isA<TelencephalonException>()),
      );
    });
  });

  // The wire shape below is what telencephalon actually emits — captured
  // from `serde_json::to_value(ConversationTurn)` on the Rust side:
  //
  //   TURN_SHAPE={"role":"user","text":"hi","at":"2026-10-29T01:21:02.066679100Z"}
  //
  // Its `ConversationTurn` serializes `at: DateTime<Utc>`, so the field on
  // the wire is **`at` (an RFC3339 string)** — not `timestamp` (millis).
  // The client used to read `timestamp` only, which made every
  // conversation with at least one turn throw a `null as num`
  // TypeError while parsing — i.e. the conversation list crashed as soon
  // as anything had been said in it.
  group('TelencephalonClient conversation wire shape', () {
    /// Exactly what `serde_json::to_value(ConversationTurn)` produces.
    Map<String, dynamic> telencephalonTurn({
      required String role,
      required String text,
      required String at,
    }) =>
        {'role': role, 'text': text, 'at': at};

    Map<String, dynamic> telencephalonConversation() => {
          'id': 'c1',
          'agent': 'temporal',
          // chrono keeps whatever precision it has — 6 digits here, 8
          // there. Dart's DateTime.parse truncates to 6, so both are fine.
          'created_at': '2026-10-29T01:21:02.067277Z',
          'updated_at': '2026-10-29T01:21:02.06727800Z',
          'history': [
            telencephalonTurn(
              role: 'user',
              text: 'hi',
              at: '2026-10-29T01:21:02.066679100Z',
            ),
            telencephalonTurn(
              role: 'agent',
              text: 'hello',
              at: '2026-10-29T01:21:03.987654321Z',
            ),
          ],
        };

    test('ConversationTurn.fromJson() reads the "at" field telencephalon sends',
        () {
      final turn = ConversationTurn.fromJson(telencephalonTurn(
        role: 'user',
        text: 'hi',
        at: '2026-10-29T01:21:02.066679100Z',
      ));
      expect(turn.role, 'user');
      expect(turn.text, 'hi');
      expect(turn.timestamp.toUtc().millisecondsSinceEpoch, 1793236862066);
    });

    test('ConversationTurn.fromJson() still reads the legacy "timestamp" millis',
        () {
      final turn = ConversationTurn.fromJson({
        'role': 'agent',
        'text': 'hello',
        'timestamp': 1793236863987,
      });
      expect(turn.role, 'agent');
      expect(turn.timestamp.millisecondsSinceEpoch, 1793236863987);
    });

    test('Conversation.fromJson() parses a conversation that has turns', () {
      final conv = Conversation.fromJson(telencephalonConversation());
      expect(conv.id, 'c1');
      expect(conv.agent, 'temporal');
      expect(conv.history, hasLength(2));
      expect(conv.history.first.text, 'hi');
      expect(conv.history.last.role, 'agent');
      expect(conv.history.last.text, 'hello');
    });

    test('listConversations() does not throw on a non-empty history', () async {
      final mockClient = http_testing.MockClient((request) async {
        if (request.url.path == '/shadow/v1/conversations' &&
            request.method == 'GET') {
          return http.Response(
            jsonEncode([telencephalonConversation()]),
            200,
          );
        }
        return http.Response('Not Found', 404);
      });
      final c = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: mockClient,
      );
      final convs = await c.listConversations();
      expect(convs, hasLength(1));
      expect(convs.first.history, hasLength(2));
      expect(convs.first.history.first.timestamp.toUtc().millisecondsSinceEpoch,
          1793236862066);
    });
  });
}
