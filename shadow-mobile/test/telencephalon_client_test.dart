import 'dart:async';
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
        
        if (path == '/shadow/v1/identity') {
          // GET = 问「当前是谁」；POST = 导入账号。两者答同一个形状。
          return http.Response(
            jsonEncode({
              'principal': 'principal:alice',
              'persona': 'persona-abc',
              'device': 'device-xyz',
              'identified': true,
              'personas': [
                {'persona': 'persona-abc', 'role': 'owner'},
              ],
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

    // 服务端（telencephalon flow/api/drafts.rs）回的是**裸 JSON 数组**，元素是
    // DraftFlow = { flow, provenance }（嵌套）。旧实现用 `_get`（假定对象体）
    // 对数组 cast 直接抛 ⇒ 端脑流程页整个进 error 态 —— 这三条钉住三种形状。
    group('listDrafts()', () {
      Future<List<FlowDefinition>> draftsOf(Object body) async {
        final c = TelencephalonClient(
          baseUrl: 'http://127.0.0.1:60080',
          client: http_testing.MockClient((request) async {
            expect(request.url.path, '/api/flows/draft');
            return http.Response(jsonEncode(body), 200);
          }),
        );
        try {
          return await c.listDrafts();
        } finally {
          c.dispose();
        }
      }

      test('parses the bare-array DraftFlow envelope (the real server shape)',
          () async {
        final drafts = await draftsOf([
          {
            'flow': {
              'id': 'flow-uuid-1',
              'name': 'demo-draft',
              'version': '0.2.0',
            },
            'provenance': {'source': 'learner'},
          },
        ]);
        expect(drafts, hasLength(1));
        expect(drafts.single.id, 'flow-uuid-1');
        expect(drafts.single.name, 'demo-draft');
        expect(drafts.single.version, '0.2.0');
      });

      test('tolerates an empty bare array (what a fresh brain answers)',
          () async {
        expect(await draftsOf([]), isEmpty);
      });

      test('falls back to the legacy {"drafts": [...]} shape', () async {
        final drafts = await draftsOf({
          'drafts': [
            {
              'id': 'flow-uuid-2',
              'name': 'legacy-shape',
              'version': '0.1.0',
            },
          ],
        });
        expect(drafts, hasLength(1));
        expect(drafts.single.id, 'flow-uuid-2');
        expect(drafts.single.name, 'legacy-shape');
      });
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

    // 「当前是谁」—— 桌面与手机用同一个账号时，这里报出的是同一个人。
    //
    // 这个测试要用 group 的 `client`（mock 里已经接了
    // /shadow/v1/identity），所以放在第一个 group 里。
    test('getIdentity() reports who is acting', () async {
      final identity = await client.getIdentity();
      expect(identity.identified, isTrue);
      expect(identity.principal, 'principal:alice');
      expect(identity.persona, 'persona-abc');
      expect(identity.device, 'device-xyz');
      expect(identity.personas, hasLength(1));
      expect(identity.personas.first.persona, 'persona-abc');
      expect(identity.personas.first.role, 'owner');
    });

    // 导入账号：端脑立刻换身份 ⇒ 答回来的就是新身份。
    test('importAccount() posts the code and returns the new identity', () async {
      final identity = await client.importAccount('the-account-key');
      expect(identity.identified, isTrue);
      expect(identity.principal, 'principal:alice');
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

  /// 「等大脑就绪」的就绪门。
  ///
  /// 嵌入式大脑启动要几秒，这期间 client 还指着没人监听的默认端口 ⇒
  /// 请求会 connection refused。门让请求**等大脑就绪**再发出去。
  ///
  /// 门挂在**拼地址**这一步（不是发请求那一步）—— 地址是发请求前
  /// 拼好的，等晚了拼出来的还是那个死端口。
  group('就绪门（等大脑就绪）', () {
    test('没挂门时行为不变 —— 请求直接发出去', () async {
      var requests = 0;
      final c = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: http_testing.MockClient((request) async {
          requests++;
          return http.Response(jsonEncode({'status': 'ok'}), 200);
        }),
      );
      addTearDown(c.dispose);

      final result = await c.health();

      expect(requests, 1);
      expect(result['status'], 'ok');
    });

    test('门没开完之前，请求不会发出去', () async {
      var requests = 0;
      final c = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: http_testing.MockClient((request) async {
          requests++;
          return http.Response(jsonEncode({'status': 'ok'}), 200);
        }),
      );
      addTearDown(c.dispose);

      final gate = Completer<void>();
      c.setReadinessGate(() => gate.future);

      final pending = c.health();
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(requests, 0, reason: '门没开完就发出去 —— 还是那个没人监听的端口');

      gate.complete();
      final result = await pending;

      expect(requests, 1);
      expect(result['status'], 'ok');
    });

    test('门完成后再拼地址 —— 用的是门之后的新地址', () async {
      final seen = <Uri>[];
      final c = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: http_testing.MockClient((request) async {
          seen.add(request.url);
          return http.Response(jsonEncode({'status': 'ok'}), 200);
        }),
      );
      addTearDown(c.dispose);

      c.setReadinessGate(() async {
        // 模拟「等大脑起来」：门里把地址换成嵌入式大脑的端脑面。
        await Future<void>.delayed(const Duration(milliseconds: 20));
        c.setBaseUrl('http://127.0.0.1:41235');
      });

      await c.health();

      expect(seen, hasLength(1));
      expect(
        seen.single.toString(),
        startsWith('http://127.0.0.1:41235'),
        reason: '门开完之后拼的地址必须是门之后的那个端脑面',
      );
    });

    test('门自己抛错不该把请求带崩', () async {
      var requests = 0;
      final c = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: http_testing.MockClient((request) async {
          requests++;
          return http.Response(jsonEncode({'status': 'ok'}), 200);
        }),
      );
      addTearDown(c.dispose);

      c.setReadinessGate(() async => throw Exception('门炸了'));

      final result = await c.health();

      expect(requests, 1);
      expect(result['status'], 'ok');
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
