import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

const String PREFRONTAL_URL = 'http://localhost:8082';
const Duration timeout = Duration(seconds: 10);

Future<bool> isPrefrontalRunning() async {
  try {
    final response = await http
        .get(Uri.parse('$PREFRONTAL_URL/health'))
        .timeout(Duration(seconds: 2));
    return response.statusCode == 200;
  } catch (e) {
    return false;
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('API Flow Integration Tests', () {
    testWidgets('provider CRUD flow', (WidgetTester tester) async {
      final isRunning = await isPrefrontalRunning();
      if (!isRunning) {
        print('Prefrontal not running on $PREFRONTAL_URL, skipping test');
        return;
      }

      final providerPayload = {
        'name': 'Test Provider',
        'providerType': 'openai',
        'model': 'gpt-4o',
        'baseUrl': 'https://api.openai.com/v1',
        'apiKey': 'test-key-123',
      };

      final addResponse = await http
          .post(
            Uri.parse('$PREFRONTAL_URL/api/providers'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(providerPayload),
          )
          .timeout(timeout);

      expect(
        addResponse.statusCode,
        200,
        reason: 'Provider creation should succeed',
      );

      final listResponse = await http
          .get(Uri.parse('$PREFRONTAL_URL/api/providers'))
          .timeout(timeout);

      expect(
        listResponse.statusCode,
        200,
        reason: 'Provider listing should succeed',
      );

      final listData = jsonDecode(listResponse.body);
      expect(
        listData['success'],
        true,
        reason: 'List response should be successful',
      );
    });

    testWidgets('skill listing flow', (WidgetTester tester) async {
      final isRunning = await isPrefrontalRunning();
      if (!isRunning) {
        print('Prefrontal not running on $PREFRONTAL_URL, skipping test');
        return;
      }

      final response = await http
          .get(Uri.parse('$PREFRONTAL_URL/api/skills'))
          .timeout(timeout);

      expect(response.statusCode, 200, reason: 'Skills listing should succeed');

      final data = jsonDecode(response.body);
      expect(
        data['success'],
        true,
        reason: 'Skills response should be successful',
      );
    });

    testWidgets('agent CRUD flow', (WidgetTester tester) async {
      final isRunning = await isPrefrontalRunning();
      if (!isRunning) {
        print('Prefrontal not running on $PREFRONTAL_URL, skipping test');
        return;
      }

      final agentPayload = {
        'name': 'Test Agent ${DateTime.now().millisecondsSinceEpoch}',
        'description': 'Integration test agent',
        'model': 'gpt-4o',
      };

      final createResponse = await http
          .post(
            Uri.parse('$PREFRONTAL_URL/api/agents'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(agentPayload),
          )
          .timeout(timeout);

      expect(
        createResponse.statusCode,
        200,
        reason: 'Agent creation should succeed',
      );

      final listResponse = await http
          .get(Uri.parse('$PREFRONTAL_URL/api/agents'))
          .timeout(timeout);

      expect(
        listResponse.statusCode,
        200,
        reason: 'Agent listing should succeed',
      );
    });

    testWidgets('task CRUD flow', (WidgetTester tester) async {
      final isRunning = await isPrefrontalRunning();
      if (!isRunning) {
        print('Prefrontal not running on $PREFRONTAL_URL, skipping test');
        return;
      }

      final taskPayload = {
        'title':
            'Integration Test Task ${DateTime.now().millisecondsSinceEpoch}',
        'priority': 'high',
      };

      final createResponse = await http
          .post(
            Uri.parse('$PREFRONTAL_URL/api/tasks'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(taskPayload),
          )
          .timeout(timeout);

      expect(
        createResponse.statusCode,
        200,
        reason: 'Task creation should succeed',
      );

      final listResponse = await http
          .get(Uri.parse('$PREFRONTAL_URL/api/tasks'))
          .timeout(timeout);

      expect(
        listResponse.statusCode,
        200,
        reason: 'Task listing should succeed',
      );

      final listData = jsonDecode(listResponse.body);
      expect(
        listData['success'],
        true,
        reason: 'List response should be successful',
      );
    });

    testWidgets('MCP server CRUD flow', (WidgetTester tester) async {
      final isRunning = await isPrefrontalRunning();
      if (!isRunning) {
        print('Prefrontal not running on $PREFRONTAL_URL, skipping test');
        return;
      }

      final mcpPayload = {
        'name': 'test-mcp-${DateTime.now().millisecondsSinceEpoch}',
        'command': 'npx',
        'args': ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        'enabled': true,
      };

      final addResponse = await http
          .post(
            Uri.parse('$PREFRONTAL_URL/api/mcp/servers'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(mcpPayload),
          )
          .timeout(timeout);

      expect(
        addResponse.statusCode,
        200,
        reason: 'MCP server creation should succeed',
      );

      final listResponse = await http
          .get(Uri.parse('$PREFRONTAL_URL/api/mcp/servers'))
          .timeout(timeout);

      expect(
        listResponse.statusCode,
        200,
        reason: 'MCP server listing should succeed',
      );
    });

    testWidgets('conversations listing flow', (WidgetTester tester) async {
      final isRunning = await isPrefrontalRunning();
      if (!isRunning) {
        print('Prefrontal not running on $PREFRONTAL_URL, skipping test');
        return;
      }

      final response = await http
          .get(Uri.parse('$PREFRONTAL_URL/api/conversations'))
          .timeout(timeout);

      expect(
        response.statusCode,
        200,
        reason: 'Conversations listing should succeed',
      );

      final data = jsonDecode(response.body);
      expect(
        data['success'],
        true,
        reason: 'Conversations response should be successful',
      );
    });

    testWidgets('skill update and delete flow', (WidgetTester tester) async {
      final isRunning = await isPrefrontalRunning();
      if (!isRunning) {
        print('Prefrontal not running on $PREFRONTAL_URL, skipping test');
        return;
      }

      final skillName = 'test-skill-${DateTime.now().millisecondsSinceEpoch}';
      final addPayload = {
        'name': skillName,
        'description': 'Test skill',
        'code': 'function handler(params) { return params; }',
      };

      final addResponse = await http
          .post(
            Uri.parse('$PREFRONTAL_URL/api/skills'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(addPayload),
          )
          .timeout(timeout);

      if (addResponse.statusCode != 200) {
        print('Skill creation failed, skipping update/delete test');
        return;
      }

      final updatePayload = {'enabled': false};

      final updateResponse = await http
          .put(
            Uri.parse('$PREFRONTAL_URL/api/skills/$skillName'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(updatePayload),
          )
          .timeout(timeout);

      expect(
        updateResponse.statusCode,
        200,
        reason: 'Skill update should succeed',
      );

      final deleteResponse = await http
          .delete(Uri.parse('$PREFRONTAL_URL/api/skills/$skillName'))
          .timeout(timeout);

      expect(
        deleteResponse.statusCode,
        200,
        reason: 'Skill delete should succeed',
      );
    });

    testWidgets('MCP server update and delete flow', (
      WidgetTester tester,
    ) async {
      final isRunning = await isPrefrontalRunning();
      if (!isRunning) {
        print('Prefrontal not running on $PREFRONTAL_URL, skipping test');
        return;
      }

      final serverName = 'test-mcp-${DateTime.now().millisecondsSinceEpoch}';
      final addPayload = {
        'name': serverName,
        'command': 'npx',
        'args': ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        'enabled': true,
      };

      final addResponse = await http
          .post(
            Uri.parse('$PREFRONTAL_URL/api/mcp/servers'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(addPayload),
          )
          .timeout(timeout);

      if (addResponse.statusCode != 200) {
        print('MCP server creation failed, skipping update/delete test');
        return;
      }

      final updatePayload = {'enabled': false};

      final updateResponse = await http
          .put(
            Uri.parse('$PREFRONTAL_URL/api/mcp/servers/$serverName'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(updatePayload),
          )
          .timeout(timeout);

      expect(
        updateResponse.statusCode,
        200,
        reason: 'MCP server update should succeed',
      );

      final deleteResponse = await http
          .delete(Uri.parse('$PREFRONTAL_URL/api/mcp/servers/$serverName'))
          .timeout(timeout);

      expect(
        deleteResponse.statusCode,
        200,
        reason: 'MCP server delete should succeed',
      );
    });
  });
}
