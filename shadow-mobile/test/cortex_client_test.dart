import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart' as http_testing;
import 'package:shadow_mobile/services/cortex/cortex_client.dart';

void main() {
  group('CortexClient', () {
    late CortexClient client;
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
              'cortex': {'id': 'test-id', 'instance_name': 'test', 'default_agent': 'prefrontal'},
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
      
      client = CortexClient(
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
      expect(response.cortexId, 'test-id');
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
  });

  group('CortexClient models', () {
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
  });
}
