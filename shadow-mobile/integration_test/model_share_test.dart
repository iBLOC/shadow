import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'dart:math';

const String PREFRONTAL_URL = 'http://localhost:8082';
const Duration timeout = Duration(seconds: 10);

String generateTestPin() {
  final random = Random();
  return (100000 + random.nextInt(900000)).toString();
}

String generateTestPubkey() {
  final random = Random();
  final bytes = List<int>.generate(32, (_) => random.nextInt(256));
  return base64Encode(bytes);
}

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

Future<void> createTestGroup() async {
  final pin = generateTestPin();
  final pubkey = generateTestPubkey();

  final createPayload = {
    'pin': pin,
    'deviceName': 'Model Share Test Device',
    'pubkey': pubkey,
  };

  await http.post(
    Uri.parse('$PREFRONTAL_URL/api/group/create'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode(createPayload),
  );
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Model Share Flow Integration Tests', () {
    testWidgets('model registration flow', (WidgetTester tester) async {
      final isRunning = await isPrefrontalRunning();
      if (!isRunning) {
        print('Prefrontal not running on $PREFRONTAL_URL, skipping test');
        return;
      }

      await createTestGroup();

      final modelId = 'model-${DateTime.now().millisecondsSinceEpoch}';
      final modelsPayload = {
        'models': [
          {
            'id': modelId,
            'name': 'Test Model',
            'sizeParams': '1.5B',
            'quantization': 'Q4',
            'capabilities': ['text', 'chat'],
            'endpoint': 'http://localhost:8080',
          },
        ],
      };

      final response = await http
          .post(
            Uri.parse('$PREFRONTAL_URL/api/models/register'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(modelsPayload),
          )
          .timeout(timeout);

      expect(
        response.statusCode,
        200,
        reason: 'Model registration should succeed',
      );

      await http
          .post(Uri.parse('$PREFRONTAL_URL/api/group/leave'))
          .timeout(timeout);
    });

    testWidgets('model advertisement flow', (WidgetTester tester) async {
      final isRunning = await isPrefrontalRunning();
      if (!isRunning) {
        print('Prefrontal not running on $PREFRONTAL_URL, skipping test');
        return;
      }

      await createTestGroup();

      final advertisementPayload = {
        'fromDevice': 'test-device',
        'advertisement': {
          'deviceId': 'device-${DateTime.now().millisecondsSinceEpoch}',
          'deviceName': 'Remote Test Device',
          'models': [
            {
              'id': 'remote-model-${DateTime.now().millisecondsSinceEpoch}',
              'name': 'Remote Test Model',
              'sizeParams': '2B',
              'quantization': 'Q8',
              'capabilities': ['text', 'code'],
              'endpoint': 'http://localhost:8080',
            },
          ],
        },
      };

      final response = await http
          .post(
            Uri.parse('$PREFRONTAL_URL/api/models/advertise'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(advertisementPayload),
          )
          .timeout(timeout);

      expect(
        response.statusCode,
        200,
        reason: 'Model advertisement should succeed',
      );

      await http
          .post(Uri.parse('$PREFRONTAL_URL/api/group/leave'))
          .timeout(timeout);
    });

    testWidgets('model listing flow', (WidgetTester tester) async {
      final isRunning = await isPrefrontalRunning();
      if (!isRunning) {
        print('Prefrontal not running on $PREFRONTAL_URL, skipping test');
        return;
      }

      await createTestGroup();

      final response = await http
          .get(Uri.parse('$PREFRONTAL_URL/api/models'))
          .timeout(timeout);

      expect(response.statusCode, 200, reason: 'Model listing should succeed');

      final data = jsonDecode(response.body);
      expect(
        data['success'],
        true,
        reason: 'Model listing response should be successful',
      );

      await http
          .post(Uri.parse('$PREFRONTAL_URL/api/group/leave'))
          .timeout(timeout);
    });

    testWidgets('local models retrieval flow', (WidgetTester tester) async {
      final isRunning = await isPrefrontalRunning();
      if (!isRunning) {
        print('Prefrontal not running on $PREFRONTAL_URL, skipping test');
        return;
      }

      await createTestGroup();

      final response = await http
          .get(Uri.parse('$PREFRONTAL_URL/api/models/local'))
          .timeout(timeout);

      expect(
        response.statusCode,
        200,
        reason: 'Local models retrieval should succeed',
      );

      await http
          .post(Uri.parse('$PREFRONTAL_URL/api/group/leave'))
          .timeout(timeout);
    });

    testWidgets('discovery start and stop flow', (WidgetTester tester) async {
      final isRunning = await isPrefrontalRunning();
      if (!isRunning) {
        print('Prefrontal not running on $PREFRONTAL_URL, skipping test');
        return;
      }

      await createTestGroup();

      final deviceId = 'device-${DateTime.now().millisecondsSinceEpoch}';
      final startPayload = {
        'deviceId': deviceId,
        'deviceName': 'Discovery Test Device',
        'port': 8082,
      };

      final startResponse = await http
          .post(
            Uri.parse('$PREFRONTAL_URL/api/discovery/start'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(startPayload),
          )
          .timeout(timeout);

      expect(
        startResponse.statusCode,
        200,
        reason: 'Discovery start should succeed',
      );

      final stopResponse = await http
          .post(Uri.parse('$PREFRONTAL_URL/api/discovery/stop'))
          .timeout(timeout);

      expect(
        stopResponse.statusCode,
        200,
        reason: 'Discovery stop should succeed',
      );

      await http
          .post(Uri.parse('$PREFRONTAL_URL/api/group/leave'))
          .timeout(timeout);
    });

    testWidgets('discovery broadcast and devices flow', (
      WidgetTester tester,
    ) async {
      final isRunning = await isPrefrontalRunning();
      if (!isRunning) {
        print('Prefrontal not running on $PREFRONTAL_URL, skipping test');
        return;
      }

      await createTestGroup();

      final deviceId = 'device-${DateTime.now().millisecondsSinceEpoch}';
      final startPayload = {
        'deviceId': deviceId,
        'deviceName': 'Broadcast Test Device',
        'port': 8082,
      };

      await http
          .post(
            Uri.parse('$PREFRONTAL_URL/api/discovery/start'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(startPayload),
          )
          .timeout(timeout);

      final broadcastResponse = await http
          .post(Uri.parse('$PREFRONTAL_URL/api/discovery/broadcast'))
          .timeout(timeout);

      expect(
        broadcastResponse.statusCode,
        200,
        reason: 'Broadcast should succeed',
      );

      final devicesResponse = await http
          .get(Uri.parse('$PREFRONTAL_URL/api/discovery/devices'))
          .timeout(timeout);

      expect(
        devicesResponse.statusCode,
        200,
        reason: 'Get devices should succeed',
      );

      final allResponse = await http
          .get(Uri.parse('$PREFRONTAL_URL/api/discovery/all'))
          .timeout(timeout);

      expect(
        allResponse.statusCode,
        200,
        reason: 'Get all discovered should succeed',
      );

      await http
          .post(Uri.parse('$PREFRONTAL_URL/api/discovery/stop'))
          .timeout(timeout);

      await http
          .post(Uri.parse('$PREFRONTAL_URL/api/group/leave'))
          .timeout(timeout);
    });
  });
}
