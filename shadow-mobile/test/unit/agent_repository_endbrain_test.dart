import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart' as http_testing;
import 'package:shadow_mobile/services/database/agent_repository.dart';
import 'package:shadow_mobile/services/database/agent_settings.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// 端脑的叶区记录长这样。
///
/// ⚠️ 判据源：`telencephalon/src/api/shadow.rs` → `lobe_to_json`
/// （端脑 `GET /shadow/v1/agents` 的每一项）。
Map<String, dynamic> _lobe({
  String name = 'temporal',
  bool enabled = true,
  String health = 'healthy',
  Map<String, dynamic> config = const <String, dynamic>{},
  List<String> skills = const <String>['chat'],
}) {
  return <String, dynamic>{
    'name': name,
    'kind': 'native',
    'url': 'http://lobe.test',
    'enabled': enabled,
    'skills': skills,
    'agent_card': <String, dynamic>{
      'name': name,
      'description': '对话与轮次',
      'version': '1',
      'url': 'http://lobe.test',
      'metadata': <String, dynamic>{},
    },
    'health_status': health,
    'config': config,
  };
}

/// 一个**记下每个请求**的端脑 client —— 断言「它到底打了什么」而不是猜。
class _Recorder {
  final List<String> calls = <String>[];
  final List<String> bodies = <String>[];

  TelencephalonClient client({
    String agentsBody = '',
    int status = 200,
  }) {
    return TelencephalonClient(
      baseUrl: 'http://endbrain.test',
      apiKey: 'the-shadow-key',
      client: http_testing.MockClient((request) async {
        calls.add('${request.method} ${request.url.path}');
        bodies.add(request.body);
        // ⚠️ **必须**给 content-type —— `http.Response` 默认按 **latin1**
        // 构造 ⇒ ⇒ body 里有中文（这里是「对话与轮次」）就**构造失败**
        // ⇒ ⇒ 报错长得像「功能坏了」，其实只是 mock 的编码默认值。
        final headers = <String, String>{
          'content-type': 'application/json; charset=utf-8',
        };
        if (request.url.path == '/shadow/v1/agents') {
          return http.Response(agentsBody, status, headers: headers);
        }
        return http.Response('{}', 200, headers: headers);
      }),
    );
  }
}

void main() {
  group('叶区仓储打的是端脑面（不是前额叶旧方言）', () {
    test('列表：GET /shadow/v1/agents ⇒ 映射成 agent 设置', () async {
      final rec = _Recorder();
      final client = rec.client(
        agentsBody: jsonEncode(<String, dynamic>{
          'telencephalon': <String, dynamic>{
            'id': 't',
            'instance_name': 'i',
            'default_agent': 'temporal',
          },
          'agents': <dynamic>[
            _lobe(
              config: <String, dynamic>{'model_name': 'MiniMax-M3'},
            ),
            _lobe(
              name: 'amygdala',
              enabled: false,
              health: 'unknown',
              skills: const <String>[],
            ),
          ],
        }),
      );

      final repo = TelencephalonAgentRepository(client: client);
      final agents = await repo.getAll();

      expect(rec.calls, contains('GET /shadow/v1/agents'));
      // ⚠️ 旧方言那族在端脑上**一律 404** ⇒ ⇒ 不许再打。
      expect(rec.calls, isNot(contains('GET /api/agents')));

      expect(agents.length, 2);
      final temporal = agents.first;
      // ⚠️ id = **名字**（端脑以名字为键：GET /shadow/v1/agents/{name}）。
      expect(temporal.id, 'temporal');
      expect(temporal.name, 'temporal');
      expect(temporal.description, '对话与轮次');
      expect(temporal.model, 'MiniMax-M3', reason: '模型来自叶区的配置袋');
      expect(temporal.skills, <String>['chat']);
      expect(temporal.isEnabled, isTrue);
      expect(temporal.isOnline, isTrue, reason: 'health_status == healthy');
      expect(temporal.isDefault, isTrue, reason: 'default_agent == temporal');
      expect(temporal.settings, <String, dynamic>{'model_name': 'MiniMax-M3'});

      final amygdala = agents.last;
      expect(amygdala.isEnabled, isFalse);
      expect(amygdala.isOnline, isFalse, reason: 'health_status != healthy');
      expect(amygdala.isDefault, isFalse);
    });

    test('保存设置：PATCH /api/telencephalon/agents/{name}/config（合并语义）', () async {
      final rec = _Recorder();
      final repo = TelencephalonAgentRepository(client: rec.client());

      await repo.update(
        AgentSettings(
          id: 'temporal',
          name: 'temporal',
          settings: const <String, dynamic>{'tone': 'warm'},
        ),
      );

      expect(
        rec.calls,
        contains('PATCH /api/telencephalon/agents/temporal/config'),
      );
      expect(
        jsonDecode(rec.bodies.last),
        <String, dynamic>{
          'config': <String, dynamic>{'tone': 'warm'},
        },
        reason: '服务端是**合并**语义 ⇒ 只传要改的键',
      );
    });

    test('删除叶区：端脑没有这张面 ⇒ 诚实报错，且**不去打**那个不存在的路由', () async {
      final rec = _Recorder();
      final repo = TelencephalonAgentRepository(client: rec.client());

      await expectLater(
        repo.delete('temporal'),
        throwsA(isA<UnsupportedError>()),
      );
      expect(
        rec.calls,
        isEmpty,
        reason: '打一个不存在的路由只会换回一句看不懂的 404 ⇒ 不打',
      );
    });

    test('启停叶区：端脑没有这张面 ⇒ 诚实报错', () async {
      final rec = _Recorder();
      final repo = TelencephalonAgentRepository(client: rec.client());

      await expectLater(
        repo.toggleAgent('temporal'),
        throwsA(isA<UnsupportedError>()),
      );
      expect(rec.calls, isEmpty);
    });
  });
}
