import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

const String TELE_ULR = 'http://localhost:60080';
const Duration timeout = Duration(seconds: 10);

Future<bool> isTelencephalonReachable() async {
  try {
    final response = await http
        .get(Uri.parse('$TELE_ULR/health'))
        .timeout(Duration(seconds: 2));
    return response.statusCode == 200;
  } catch (e) {
    return false;
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Memory Flow Integration Tests', () {
    testWidgets('memory search via Prefrontal', (WidgetTester tester) async {
      final isRunning = await isTelencephalonReachable();
      if (!isRunning) {
        print('Telencephalon not reachable on $TELE_ULR, skipping test');
        return;
      }

      final response = await http
          .get(Uri.parse('$TELE_ULR/api/memory/search?q=test&limit=5'))
          .timeout(timeout);

      expect(response.statusCode, 200, reason: 'Memory search should succeed');

      final data = jsonDecode(response.body);
      expect(
        data['success'],
        true,
        reason: 'Search response should be successful',
      );
    });

    testWidgets('session creation and memory association flow', (
      WidgetTester tester,
    ) async {
      final isRunning = await isTelencephalonReachable();
      if (!isRunning) {
        print('Telencephalon not reachable on $TELE_ULR, skipping test');
        return;
      }

      final sessionPayload = {
        'name': 'Memory Test Session ${DateTime.now().millisecondsSinceEpoch}',
      };

      final sessionResponse = await http
          .post(
            Uri.parse('$TELE_ULR/api/sessions'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(sessionPayload),
          )
          .timeout(timeout);

      expect(
        sessionResponse.statusCode,
        200,
        reason: 'Session creation should succeed',
      );

      final sessionData = jsonDecode(sessionResponse.body);
      expect(
        sessionData['success'],
        true,
        reason: 'Session creation response should be successful',
      );

      if (sessionData['data'] != null) {
        final sessionId = sessionData['data']['id'];

        final messagePayload = {
          'role': 'user',
          'content': 'Test memory message',
        };

        final messageResponse = await http
            .post(
              Uri.parse('$TELE_ULR/api/sessions/$sessionId/messages'),
              headers: {'Content-Type': 'application/json'},
              body: jsonEncode(messagePayload),
            )
            .timeout(timeout);

        expect(
          messageResponse.statusCode,
          200,
          reason: 'Message addition should succeed',
        );

        final deleteResponse = await http
            .delete(Uri.parse('$TELE_ULR/api/sessions/$sessionId'))
            .timeout(timeout);

        expect(
          deleteResponse.statusCode,
          200,
          reason: 'Session deletion should succeed',
        );
      }
    });

    testWidgets('conversations listing flow', (WidgetTester tester) async {
      final isRunning = await isTelencephalonReachable();
      if (!isRunning) {
        print('Telencephalon not reachable on $TELE_ULR, skipping test');
        return;
      }

      final createPayload = {
        'name': 'Conv Test Session ${DateTime.now().millisecondsSinceEpoch}',
      };

      await http
          .post(
            Uri.parse('$TELE_ULR/api/sessions'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(createPayload),
          )
          .timeout(timeout);

      final response = await http
          .get(Uri.parse('$TELE_ULR/api/conversations'))
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

    testWidgets('multiple session lifecycle flow', (WidgetTester tester) async {
      final isRunning = await isTelencephalonReachable();
      if (!isRunning) {
        print('Telencephalon not reachable on $TELE_ULR, skipping test');
        return;
      }

      final sessionIds = <String>[];

      for (int i = 0; i < 3; i++) {
        final sessionPayload = {
          'name':
              'Multi Session Test ${DateTime.now().millisecondsSinceEpoch}-$i',
        };

        final createResponse = await http
            .post(
              Uri.parse('$TELE_ULR/api/sessions'),
              headers: {'Content-Type': 'application/json'},
              body: jsonEncode(sessionPayload),
            )
            .timeout(timeout);

        if (createResponse.statusCode == 200) {
          final data = jsonDecode(createResponse.body);
          if (data['data'] != null) {
            sessionIds.add(data['data']['id']);
          }
        }
      }

      expect(
        sessionIds.length,
        greaterThan(0),
        reason: 'Should create at least one session',
      );

      final listResponse = await http
          .get(Uri.parse('$TELE_ULR/api/sessions'))
          .timeout(timeout);

      expect(
        listResponse.statusCode,
        200,
        reason: 'Session listing should succeed',
      );

      for (final sessionId in sessionIds) {
        await http
            .delete(Uri.parse('$TELE_ULR/api/sessions/$sessionId'))
            .timeout(timeout);
      }
    });
  });
}
