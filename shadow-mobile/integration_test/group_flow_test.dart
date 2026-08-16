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

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Group Flow Integration Tests', () {
    testWidgets('group create flow', (WidgetTester tester) async {
      final isRunning = await isPrefrontalRunning();
      if (!isRunning) {
        print('Prefrontal not running on $PREFRONTAL_URL, skipping test');
        return;
      }

      final pin = generateTestPin();
      final pubkey = generateTestPubkey();

      final createPayload = {
        'pin': pin,
        'deviceName': 'Flutter Test Device',
        'pubkey': pubkey,
      };

      final response = await http
          .post(
            Uri.parse('$PREFRONTAL_URL/api/group/create'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(createPayload),
          )
          .timeout(timeout);

      expect(response.statusCode, 200, reason: 'Group creation should succeed');

      final data = jsonDecode(response.body);
      expect(
        data['success'],
        true,
        reason: 'Group creation response should be successful',
      );

      await http
          .post(Uri.parse('$PREFRONTAL_URL/api/group/leave'))
          .timeout(timeout);
    });

    testWidgets('group create and leave flow', (WidgetTester tester) async {
      final isRunning = await isPrefrontalRunning();
      if (!isRunning) {
        print('Prefrontal not running on $PREFRONTAL_URL, skipping test');
        return;
      }

      final pin = generateTestPin();
      final pubkey = generateTestPubkey();

      final createPayload = {
        'pin': pin,
        'deviceName': 'Leave Test Device',
        'pubkey': pubkey,
      };

      final createResponse = await http
          .post(
            Uri.parse('$PREFRONTAL_URL/api/group/create'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(createPayload),
          )
          .timeout(timeout);

      expect(
        createResponse.statusCode,
        200,
        reason: 'Group creation should succeed',
      );

      final leaveResponse = await http
          .post(Uri.parse('$PREFRONTAL_URL/api/group/leave'))
          .timeout(timeout);

      expect(
        leaveResponse.statusCode,
        200,
        reason: 'Group leave should succeed',
      );
    });

    testWidgets('group members listing flow', (WidgetTester tester) async {
      final isRunning = await isPrefrontalRunning();
      if (!isRunning) {
        print('Prefrontal not running on $PREFRONTAL_URL, skipping test');
        return;
      }

      final pin = generateTestPin();
      final pubkey = generateTestPubkey();

      final createPayload = {
        'pin': pin,
        'deviceName': 'Members Test Device',
        'pubkey': pubkey,
      };

      await http
          .post(
            Uri.parse('$PREFRONTAL_URL/api/group/create'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(createPayload),
          )
          .timeout(timeout);

      final membersResponse = await http
          .get(Uri.parse('$PREFRONTAL_URL/api/group/members'))
          .timeout(timeout);

      expect(
        membersResponse.statusCode,
        200,
        reason: 'Members listing should succeed',
      );

      await http
          .post(Uri.parse('$PREFRONTAL_URL/api/group/leave'))
          .timeout(timeout);
    });

    testWidgets('group QR data generation flow', (WidgetTester tester) async {
      final isRunning = await isPrefrontalRunning();
      if (!isRunning) {
        print('Prefrontal not running on $PREFRONTAL_URL, skipping test');
        return;
      }

      final pin = generateTestPin();
      final pubkey = generateTestPubkey();

      final createPayload = {
        'pin': pin,
        'deviceName': 'QR Test Device',
        'pubkey': pubkey,
      };

      await http
          .post(
            Uri.parse('$PREFRONTAL_URL/api/group/create'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(createPayload),
          )
          .timeout(timeout);

      final qrResponse = await http
          .get(Uri.parse('$PREFRONTAL_URL/api/group/qr'))
          .timeout(timeout);

      expect(
        qrResponse.statusCode,
        200,
        reason: 'QR data generation should succeed',
      );

      final data = jsonDecode(qrResponse.body);
      expect(data['success'], true, reason: 'QR response should be successful');

      await http
          .post(Uri.parse('$PREFRONTAL_URL/api/group/leave'))
          .timeout(timeout);
    });

    testWidgets('group join with valid PIN flow', (WidgetTester tester) async {
      final isRunning = await isPrefrontalRunning();
      if (!isRunning) {
        print('Prefrontal not running on $PREFRONTAL_URL, skipping test');
        return;
      }

      final pin = generateTestPin();
      final pubkey1 = generateTestPubkey();
      final pubkey2 = generateTestPubkey();

      final createPayload = {
        'pin': pin,
        'deviceName': 'Join Test Device 1',
        'pubkey': pubkey1,
      };

      final createResponse = await http
          .post(
            Uri.parse('$PREFRONTAL_URL/api/group/create'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(createPayload),
          )
          .timeout(timeout);

      if (createResponse.statusCode != 200) {
        print('Group creation failed, skipping join test');
        return;
      }

      final joinPayload = {
        'pin': pin,
        'deviceName': 'Join Test Device 2',
        'pubkey': pubkey2,
      };

      final joinResponse = await http
          .post(
            Uri.parse('$PREFRONTAL_URL/api/group/join'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(joinPayload),
          )
          .timeout(timeout);

      expect(joinResponse.statusCode, 200, reason: 'Group join should succeed');

      await http
          .post(Uri.parse('$PREFRONTAL_URL/api/group/leave'))
          .timeout(timeout);
    });
  });
}
