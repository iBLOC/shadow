import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// 供应商接口的**契约测试** —— ⚠️ 钉的是「手机打的是**大脑**那张面」。
///
/// ⚠️ 旧实现打的是前额叶方言 `/api/providers` ⇒ ⇒ 端脑不提供 ⇒ 404 ⇒
/// ⇒ 界面永远画成「还没有供应商」⇒ ⇒ 失败长得像成功。
void main() {
  TelencephalonClient clientReturning(
    http.Response Function(http.Request req) handler,
  ) {
    return TelencephalonClient(
      baseUrl: 'http://127.0.0.1:60080',
      client: MockClient((req) async => handler(req)),
    );
  }

  test('列表打的是大脑那张面 /models/providers（不是前额叶方言）', () async {
    final seen = <String>[];
    final client = clientReturning((req) {
      seen.add('${req.method} ${req.url.path}');
      return http.Response(
        jsonEncode([
          {
            'id': 'prov-1',
            'name': 'OpenAI',
            'provider_type': 'openai',
            'api_base': 'https://api.openai.com/v1',
            'base_url': 'https://api.openai.com/v1',
            'api_standard': 'openai',
            'enabled': true,
            'selected_model': 'gpt-4o',
            'preset_id': 'openai',
            'api_key': '********',
            'models': [
              {'id': 'gpt-4o', 'name': 'GPT-4o'},
            ],
            'last_error': null,
            'last_refreshed_at': null,
          },
        ]),
        200,
        headers: {'content-type': 'application/json'},
      );
    });

    final providers = await client.listProviders();

    expect(seen, ['GET /models/providers']);
    expect(providers.length, 1);
    final p = providers.first;
    expect(p.id, 'prov-1');
    expect(p.baseUrl, 'https://api.openai.com/v1');
    expect(p.apiStandard, 'openai');
    expect(p.enabled, isTrue);
    expect(p.selectedModel, 'gpt-4o');
    expect(p.presetId, 'openai');
    expect(p.models.first.id, 'gpt-4o');
  });

  test('没给 api_standard 时按 provider_type 派生（存量 openai_compatible）', () async {
    final client = clientReturning((req) {
      return http.Response(
        jsonEncode([
          {
            'id': 'legacy',
            'name': 'Legacy',
            'provider_type': 'openai_compatible',
            'api_base': 'https://gw.example.com/v1',
            'models': <Object>[],
          },
        ]),
        200,
      );
    });

    final p = (await client.listProviders()).first;
    expect(p.apiStandard, 'openai');
    expect(p.enabled, isTrue, reason: '没写 enabled ⇒ 默认启用');
    expect(p.baseUrl, 'https://gw.example.com/v1');
  });

  test('预设目录打的是 /models/providers/presets', () async {
    final seen = <String>[];
    final client = clientReturning((req) {
      seen.add('${req.method} ${req.url.path}');
      return http.Response(
        jsonEncode([
          {
            'id': 'openai',
            'name': 'OpenAI',
            'base_url': 'https://api.openai.com/v1',
            'api_standard': 'openai',
            'default_model': 'gpt-4o',
            'requires_key': true,
          },
        ]),
        200,
      );
    });

    final presets = await client.listProviderPresets();
    expect(seen, ['GET /models/providers/presets']);
    expect(presets.first.id, 'openai');
    expect(presets.first.requiresKey, isTrue);
    expect(presets.first.defaultModel, 'gpt-4o');
  });

  test('按预设添加 = 只给 preset_id 与 api_key', () async {
    Map<String, dynamic>? body;
    var path = '';
    final client = clientReturning((req) {
      path = req.url.path;
      body = jsonDecode(req.body) as Map<String, dynamic>;
      return http.Response(
        jsonEncode({'id': 'prov-2', 'name': 'OpenAI', 'enabled': true}),
        201,
      );
    });

    await client.addProvider(presetId: 'openai', apiKey: 'sk-x');

    expect(path, '/models/providers');
    expect(body!['preset_id'], 'openai');
    expect(body!['api_key'], 'sk-x');
    expect(body!.containsKey('base_url'), isFalse, reason: 'base URL 由大脑的目录给');
  });

  test('启停与选模型走 PUT /models/providers/{id}', () async {
    Map<String, dynamic>? body;
    var method = '';
    var path = '';
    final client = clientReturning((req) {
      method = req.method;
      path = req.url.path;
      body = jsonDecode(req.body) as Map<String, dynamic>;
      return http.Response(jsonEncode({'id': 'prov-1'}), 200);
    });

    await client.updateProvider('prov-1', enabled: false, selectedModel: 'gpt-4o');

    expect(method, 'PUT');
    expect(path, '/models/providers/prov-1');
    expect(body!['enabled'], false);
    expect(body!['selected_model'], 'gpt-4o');
  });

  test('删除打的是 DELETE /models/providers/{id}', () async {
    var method = '';
    var path = '';
    final client = clientReturning((req) {
      method = req.method;
      path = req.url.path;
      return http.Response('', 204);
    });

    await client.deleteProvider('prov-1');
    expect(method, 'DELETE');
    expect(path, '/models/providers/prov-1');
  });

  test('⚠️ 读不到要**抛出来** —— 绝不能变成空列表（失败长得像成功）', () async {
    final client = clientReturning((req) => http.Response('nope', 500));

    await expectLater(
      client.listProviders(),
      throwsA(isA<TelencephalonException>()),
    );
  });

  test('⚠️ 门挡住（401）也要**抛出来**', () async {
    final client = clientReturning((req) => http.Response('unauthorized', 401));

    await expectLater(
      client.listProviders(),
      throwsA(isA<TelencephalonException>()),
    );
  });
}
