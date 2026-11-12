import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart' as http_testing;
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// `TelencephalonClient.generateImage` —— 图片生成门面的**运输那一半**。
///
/// ⚠️ 钉三格：
/// ① 打的是 `/api/telencephalon/images/generations`（端脑门面，不是绕过去
///    直连供应商 / 直连 neuron 的 `/v1/images/generations`）；
/// ② **admin 门** ⇒ `X-Admin-Token` 必须真的带上（空串会骗开门的纪律见
///    client 的 `_headers`）；
/// ③ 响应 JSON 原样解出（`data[].b64_json` 是工具那一半要的东西）。
void main() {
  test('generateImage：POST 门面端点，带 admin 钥匙，响应原样解出', () async {
    Uri? capturedUrl;
    Map<String, String>? capturedHeaders;
    String? capturedBody;

    final client = TelencephalonClient(
      baseUrl: 'http://127.0.0.1:60080',
      adminToken: 'test-admin-token',
      client: http_testing.MockClient((request) async {
        capturedUrl = request.url;
        capturedHeaders = request.headers;
        capturedBody = request.body;
        return http.Response(
          jsonEncode({
            'created': 1,
            'data': [
              {'b64_json': 'QUJD', 'size': '1024x1024', 'seed': 7},
            ],
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    final resp = await client.generateImage({'prompt': 'a teal eclipse'});

    expect(capturedUrl!.path, '/api/telencephalon/images/generations');
    expect(capturedHeaders!['X-Admin-Token'], 'test-admin-token');
    final body = jsonDecode(capturedBody!) as Map<String, dynamic>;
    expect(body['prompt'], 'a teal eclipse');

    final data = resp['data'] as List;
    expect(data, hasLength(1));
    expect(data.first['b64_json'], 'QUJD');
    expect(data.first['size'], '1024x1024');
  });

  test('generateImage：5xx ⇒ 抛 TelencephalonException，错误体带着结构化信封', () async {
    final client = TelencephalonClient(
      baseUrl: 'http://127.0.0.1:60080',
      client: http_testing.MockClient((request) async {
        // 端脑 `ApiError` 的形状：{ "error": { "code", "message" } }。
        return http.Response(
          jsonEncode({
            'error': {
              'code': 5003,
              'message':
                  "neuron imagegen (capability default 'image_gen' -> moss-image): "
                  'ModelNotRegistered: moss-image',
            },
          }),
          500,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await expectLater(
      client.generateImage({'prompt': 'x'}),
      throwsA(
        isA<TelencephalonException>().having(
          (e) => e.message,
          'message',
          contains('ModelNotRegistered'),
        ),
      ),
    );
  });
}
