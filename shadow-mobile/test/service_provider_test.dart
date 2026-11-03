import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shadow_mobile/providers/service_provider.dart';

void main() {
  group('ServiceInfo', () {
    test('creates with required fields', () {
      final service = ServiceInfo(
        name: 'test',
        displayName: 'Test Service',
        host: 'localhost',
        port: 8080,
      );

      expect(service.name, 'test');
      expect(service.displayName, 'Test Service');
      expect(service.host, 'localhost');
      expect(service.port, 8080);
      expect(service.path, '/health');
      expect(service.status, ServiceStatus.unknown);
    });

    test('generates correct url', () {
      final service = ServiceInfo(
        name: 'test',
        displayName: 'Test',
        host: 'localhost',
        port: 8080,
        path: '/health',
      );

      expect(service.url, 'http://localhost:8080/health');
    });

    test('generates url with default path', () {
      final service = ServiceInfo(
        name: 'test',
        displayName: 'Test',
        host: 'example.com',
        port: 3000,
      );

      expect(service.url, 'http://example.com:3000/health');
    });
  });

  group('ServiceStatus', () {
    test('has correct enum values', () {
      expect(ServiceStatus.values, contains(ServiceStatus.unknown));
      expect(ServiceStatus.values, contains(ServiceStatus.checking));
      expect(ServiceStatus.values, contains(ServiceStatus.healthy));
      expect(ServiceStatus.values, contains(ServiceStatus.unhealthy));
      expect(ServiceStatus.values, contains(ServiceStatus.offline));
    });
  });

  // ⚠️ **病史（2026-11-01 真机修复）**：这里探的曾是写死的桌面拓扑
  // 三件套（localhost:8080/60080/8081）—— 手机上一个都不存在 ⇒ 三行
  // **永远「离线」**，而活着的嵌入式大脑没人探。旧测试把那个病态当
  // 期望钉死了（断言 3 个服务、60080 是「唯一平台入口」）—— 恒绿的
  // 测试比没有测试更坏。现在钉的是**新形状**：一行 Encephalon、探
  // 动态端口上的 agent.json。
  group('ServiceNotifier（真实拓扑）', () {
    test('大脑没在跑 ⇒ 一行 Encephalon：unknown + 「未启动」，不说「离线」', () async {
      final notifier = ServiceNotifier(
        isRunningResolver: () => false,
        agentPortResolver: () => null,
        client: MockClient((request) async => http.Response('{}', 200)),
      );

      await notifier.checkAll();

      expect(notifier.state.length, 1);
      final row = notifier.state.single;
      expect(row.name, 'encephalon');
      expect(
        row.status,
        ServiceStatus.unknown,
        reason: '大脑没启动没有任何「该活的东西死了」—— 不许报 offline 吓人',
      );
      expect(row.port, 0);
      expect(row.error, contains('未启动'));
      notifier.dispose();
    });

    test('大脑在跑 ⇒ 探真实端口上的 agent.json，200 ⇒ healthy + 延迟', () async {
      final uris = <Uri>[];
      final notifier = ServiceNotifier(
        isRunningResolver: () => true,
        agentPortResolver: () => 40771,
        client: MockClient((request) async {
          uris.add(request.url);
          return http.Response('{"name":"shadow"}', 200);
        }),
      );

      await notifier.checkAll();

      final row = notifier.state.single;
      expect(row.status, ServiceStatus.healthy);
      expect(row.port, 40771);
      expect(row.latencyMs, isNotNull);
      expect(row.error, isNull);
      // 探针必须打在**动态端口 + 免鉴权端点**上 ——
      // `/health` 在端脑面上是 404（真机实测），别退回去。
      expect(
        uris.single.toString(),
        'http://127.0.0.1:40771/.well-known/agent.json',
      );
      notifier.dispose();
    });

    test('大脑在跑但探不通（拒绝连接）⇒ unhealthy + 错误信息', () async {
      final notifier = ServiceNotifier(
        isRunningResolver: () => true,
        agentPortResolver: () => 40771,
        client: MockClient(
          (request) async => throw const SocketException('refused'),
        ),
      );

      await notifier.checkAll();

      final row = notifier.state.single;
      expect(row.status, ServiceStatus.unhealthy);
      expect(row.error, isNotNull);
      notifier.dispose();
    });

    test('探针拿到非 2xx ⇒ unhealthy + HTTP 状态码', () async {
      final notifier = ServiceNotifier(
        isRunningResolver: () => true,
        agentPortResolver: () => 40771,
        client: MockClient((request) async => http.Response('nope', 503)),
      );

      await notifier.checkAll();

      final row = notifier.state.single;
      expect(row.status, ServiceStatus.unhealthy);
      expect(row.error, contains('503'));
      notifier.dispose();
    });

    test('这块板只报真实存在的东西 —— 不再有桌面拓扑三件套', () async {
      final notifier = ServiceNotifier(
        isRunningResolver: () => true,
        agentPortResolver: () => 40771,
        client: MockClient((request) async => http.Response('{}', 200)),
      );

      await notifier.checkAll();

      final names = notifier.state.map((s) => s.name).toSet();
      expect(
        names,
        {'encephalon'},
        reason:
            'Resonance / 桌面 sidecar 端脑(60080) / 本地海马体(8081) '
            '在手机上一个都不存在 —— 探它们只会产出假「离线」',
      );
      notifier.dispose();
    });
  });
}
