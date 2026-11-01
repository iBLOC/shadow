import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart' as http_testing;
import 'package:shadow_mobile/services/genui/shadow_key_sse_transport.dart';

/// A2UI 那条 SSE 路**也是读面** ⇒ 它的凭据集合也得与门形一致。
///
/// ⚠️ `POST /a2a` 在门形表里是 **read** ⇒ 读门 = **影子锁 ∪ admin token**
/// ⇒ ⇒ 只递影子锁 ⇒ 在「外部端脑只认 admin token」时 ⇒ **401**
/// ⇒ 而 A2UI 那侧把它画成「连不上」。
///
/// ⚠️ 这条路**不走** `TelencephalonClient._headers()` ⇒ 它自己带钥匙
/// ⇒ ⇒ 改 client 不会顺带修好它 ⇒ 必须单独钉。
void main() {
  test('SSE 请求递两把钥匙', () async {
    late http.Request seen;
    final mock = http_testing.MockClient((req) async {
      seen = req;
      return http.Response('', 200);
    });

    final transport = ShadowKeySseTransport(
      url: 'http://127.0.0.1:60080/a2a',
      shadowKeyProvider: () => 'sk-1',
      adminTokenProvider: () => 'admin-1',
      client: mock,
    );

    await transport.sendStream({'message': 'hi'}).toList();

    expect(seen.headers['x-shadow-key'], 'sk-1');
    expect(seen.headers['x-admin-token'], 'admin-1');
  });

  test('拿不到 admin token 时：不许带一个空的头', () async {
    late http.Request seen;
    final mock = http_testing.MockClient((req) async {
      seen = req;
      return http.Response('', 200);
    });

    final transport = ShadowKeySseTransport(
      url: 'http://127.0.0.1:60080/a2a',
      shadowKeyProvider: () => 'sk-1',
      adminTokenProvider: () => null,
      client: mock,
    );

    await transport.sendStream({'message': 'hi'}).toList();

    expect(seen.headers['x-shadow-key'], 'sk-1');
    expect(
      seen.headers.containsKey('x-admin-token'),
      isFalse,
      reason: '空串与空串 ct_eq 相等 ⇒ 等于把门骗开',
    );
  });
}
