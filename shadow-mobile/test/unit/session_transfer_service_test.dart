import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shadow_mobile/services/cortex/cortex_client.dart';
import 'package:shadow_mobile/services/session_transfer_service.dart';

void main() {
  group('SessionTransferService.importSession', () {
    test('uses cortex and returns conversation_id, cortex_url, transferred_via', () async {
      final mockClient = MockClient((request) async {
        if (request.url.path.contains('/shadow/v1/conversations/')) {
          final body = request.body;
          expect(body.contains('"history"'), isTrue);
          return http.Response(
            '{"id": "conv-prefrontal-test", "agent": "prefrontal", "created_at": "2026-07-05T00:00:00.000Z", "updated_at": "2026-07-05T00:00:00.000Z", "history": []}',
            200,
          );
        }
        return http.Response('{}', 404);
      });

      final cortex = CortexClient(
        baseUrl: 'http://localhost:8443',
        client: mockClient,
      );

      final service = SessionTransferService(
        client: mockClient,
        cortex: cortex,
      );

      final export = SessionExport(
        sessionId: 'test-session-123',
        messages: [
          {'role': 'user', 'text': 'Hello', 'timestamp': DateTime.now().millisecondsSinceEpoch},
          {'role': 'assistant', 'text': 'Hi there', 'timestamp': DateTime.now().millisecondsSinceEpoch},
        ],
        sizeBytes: 1024,
      );

      final result = await service.importSession(export);

      expect(result['conversation_id'], startsWith('conv-'));
      expect(result['cortex_url'], 'http://localhost:8443');
      expect(result['transferred_via'], 'cortex');
    });

    test('throws StateError when cortex is null', () async {
      final service = SessionTransferService();

      final export = SessionExport(
        sessionId: 'test-session-123',
        messages: [],
        sizeBytes: 0,
      );

      expect(
        () => service.importSession(export),
        throwsA(isA<StateError>()),
      );
    });
  });
}
