import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart' as http_testing;
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

void main() {
  group('TelencephalonNotifier', () {
    late http.Client mockClient;
    late TelencephalonClient client;

    setUp(() {
      mockClient = http_testing.MockClient((request) async {
        final path = request.url.path;
        if (path == '/.well-known/agent.json') {
          return http.Response(
            jsonEncode({'id': 'tele-1', 'name': 'test-telencephalon'}),
            200,
          );
        }
        if (path == '/shadow/v1/agents') {
          return http.Response(
            jsonEncode({
              'telencephalon': {
                'id': 'tele-1',
                'instance_name': 'inst',
                'default_agent': 'prefrontal',
              },
              'agents': [],
            }),
            200,
          );
        }
        return http.Response('Not Found', 404);
      });
      client = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: mockClient,
      );
    });

    test('initial state is stopped with default connection', () {
      final notifier = TelencephalonNotifier(client: client);
      expect(notifier.state.status, TelencephalonStatus.stopped);
      expect(notifier.state.connection.baseUrl, 'http://127.0.0.1:60080');
      expect(notifier.state.telencephalonId, isNull);
    });

    test('setBaseUrl updates client and state', () {
      final notifier = TelencephalonNotifier(client: client);
      notifier.setBaseUrl('http://10.0.0.5:60080');
      expect(notifier.state.connection.baseUrl, 'http://10.0.0.5:60080');
      expect(client.baseUrl, 'http://10.0.0.5:60080');
    });

    test('setAdminToken updates client (no state field exposed)', () {
      final notifier = TelencephalonNotifier(client: client);
      notifier.setAdminToken('top-secret');
      expect(client.adminToken, 'top-secret');
    });

    test('setAdminToken(null) clears the token', () {
      final notifier = TelencephalonNotifier(client: client);
      notifier.setAdminToken('first');
      notifier.setAdminToken(null);
      expect(client.adminToken, isNull);
    });

    test('refreshStatus marks running on 200 and records telencephalon id',
        () async {
      final notifier = TelencephalonNotifier(client: client);
      await notifier.refreshStatus();
      expect(notifier.state.status, TelencephalonStatus.running);
      expect(notifier.state.telencephalonId, 'tele-1');
      expect(notifier.state.lastCheck, isNotNull);
      expect(notifier.state.error, isNull);
    });

    test('refreshStatus marks unreachable on transport failure', () async {
      final failingClient = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:1',
        client: http_testing.MockClient(
          (request) async => throw Exception('connection refused'),
        ),
      );
      final notifier = TelencephalonNotifier(client: failingClient);
      await notifier.refreshStatus();
      expect(notifier.state.status, TelencephalonStatus.unreachable);
      expect(notifier.state.error, isNotNull);
      expect(notifier.state.lastCheck, isNotNull);
    });

    test('refreshLobes parses telencephalon envelope', () async {
      final notifier = TelencephalonNotifier(client: client);
      await notifier.refreshLobes();
      expect(notifier.state.telencephalonId, 'tele-1');
      expect(notifier.state.defaultAgent, 'prefrontal');
      expect(notifier.state.lobes, isEmpty);
    });

    test('refreshLobes marks error on failure but does not flip status', () async {
      final failingClient = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:1',
        client: http_testing.MockClient(
          (request) async => throw Exception('boom'),
        ),
      );
      final notifier = TelencephalonNotifier(client: failingClient);
      await notifier.refreshLobes();
      expect(notifier.state.error, isNotNull);
      expect(notifier.state.status, TelencephalonStatus.stopped);
    });
  });
}