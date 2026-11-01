import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart' as http_testing;
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/services/app_config_service.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// 「客户端读面的凭据集合必须与门形一致」—— 移动端这一侧。
///
/// ⚠️ 门形（判据源：`telencephalon/src/api/door_policy.txt`）：
/// `/shadow/v1/*` = **read** ⇒ 读门 = **影子锁 ∪ admin token**（任一把就开，
/// 判据实现 `security/api_key.rs::verify_read_credential`）。
///
/// ⇒ 客户端读面**必须递它手里有的全部钥匙** ⇒ 只递一把 ⇒ 在「那台端脑
/// 只认另一把」时 ⇒ **401** ⇒ 而界面把它画成「没有 / 连不上」
/// ⇒ **失败长得像成功**。
///
/// ⚠️ **绝不塞空串**：空串与空串 `ct_eq` 相等 ⇒ 等于把门骗开
/// （`security/api_key.rs::verify_admin_token`）⇒ ⇒ 拿不到就**不带那个头**。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late List<http.Request> seen;
  late http.Client mock;

  setUp(() {
    seen = <http.Request>[];
    mock = http_testing.MockClient((req) async {
      seen.add(req);
      switch (req.url.path) {
        case '/shadow/v1/agents':
          return http.Response(
            jsonEncode({
              'telencephalon': {
                'id': 'tele-1',
                'instance_name': 'inst',
                'default_agent': 'prefrontal',
              },
              'agents': <dynamic>[],
            }),
            200,
          );
        case '/api/telencephalon/mcp/servers':
          return http.Response(jsonEncode({'servers': <dynamic>[]}), 200);
      }
      return http.Response('Not Found', 404);
    });
  });

  /// 头名大小写不敏感 —— `package:http` 把头键统一小写，
  /// 但断言不该依赖这个实现细节。
  String? headerOf(http.Request r, String name) {
    for (final entry in r.headers.entries) {
      if (entry.key.toLowerCase() == name.toLowerCase()) return entry.value;
    }
    return null;
  }

  group('读面的凭据集合（= 门形）', () {
    test('读面递两把：影子锁 + admin token 都在', () async {
      final client = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        apiKey: 'sk-1',
        adminToken: 'admin-1',
        client: mock,
      );

      await client.listAgents();

      expect(headerOf(seen.last, 'x-shadow-key'), 'sk-1');
      expect(headerOf(seen.last, 'x-admin-token'), 'admin-1');
    });

    test('只有影子锁时：不许带一个空的 X-Admin-Token 头', () async {
      final client = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        apiKey: 'sk-1',
        client: mock,
      );

      await client.listAgents();

      expect(headerOf(seen.last, 'x-shadow-key'), 'sk-1');
      expect(
        headerOf(seen.last, 'x-admin-token'),
        isNull,
        reason: '空串与空串 ct_eq 相等 ⇒ 等于把门骗开',
      );
    });

    test('只有 admin token 时：不许带一个空的 X-Shadow-Key 头', () async {
      final client = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        adminToken: 'admin-1',
        client: mock,
      );

      await client.listAgents();

      expect(headerOf(seen.last, 'x-admin-token'), 'admin-1');
      expect(headerOf(seen.last, 'x-shadow-key'), isNull);
    });

    test('一把都没有时：一个凭据头都不许有', () async {
      final client = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: mock,
      );

      await client.listAgents();

      expect(headerOf(seen.last, 'x-shadow-key'), isNull);
      expect(headerOf(seen.last, 'x-admin-token'), isNull);
    });

    test('写面（admin 门）仍然带 admin token', () async {
      final client = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        apiKey: 'sk-1',
        adminToken: 'admin-1',
        client: mock,
      );

      await client.listMcpServers();

      expect(headerOf(seen.last, 'x-admin-token'), 'admin-1');
    });
  });

  group('外部端脑的影子锁（入口 + 应用）', () {
    late Directory tmpDir;

    /// 把「存储里」的端脑配置写进配置文件（走 AppConfigService 自己的落盘
    /// 路径，不碰真机上的文件）。
    Future<void> storeConfig({
      String? baseUrl,
      String? adminToken,
      String? shadowKey,
    }) async {
      final file = File('${tmpDir.path}/app_config.json');
      await file.writeAsString(jsonEncode({
        'telencephalonBaseUrl': ?baseUrl,
        'telencephalonAdminToken': ?adminToken,
        'telencephalonShadowKey': ?shadowKey,
      }));
      await AppConfigService().init();
    }

    setUp(() async {
      tmpDir = await Directory.systemTemp.createTemp('tel_read_cred_test');
      AppConfigService.configFileOverride = () async =>
          File('${tmpDir.path}/app_config.json');
      await storeConfig();
    });

    tearDown(() async {
      AppConfigService.configFileOverride = null;
      if (tmpDir.existsSync()) {
        await tmpDir.delete(recursive: true);
      }
    });

    /// 每个用例一个**全新的 client** —— 默认那个
    /// `defaultTelencephalonClient` 是**全局单例** ⇒ 不隔离的话上一个
    /// 用例的接管会漏到下一个用例 ⇒ 测试之间互相污染 ⇒ 「绿」也不可信。
    ProviderContainer newContainer() {
      final container = ProviderContainer(overrides: [
        telencephalonProvider.overrideWith(
          (ref) => TelencephalonNotifier(client: TelencephalonClient()),
        ),
      ]);
      addTearDown(container.dispose);
      return container;
    }

    test('存储里的影子锁在**构造时**就应用给 client（重启后不丢）', () async {
      await storeConfig(
        baseUrl: 'http://192.168.1.50:60080',
        shadowKey: 'sk-ext',
      );
      final container = newContainer();

      expect(container.read(telencephalonClientProvider).apiKey, 'sk-ext');
    });

    test('内嵌大脑放手后：端脑面用的是**外部那把**影子锁', () async {
      await storeConfig(
        baseUrl: 'http://192.168.1.50:60080',
        shadowKey: 'sk-ext',
      );
      final container = newContainer();

      final notifier = container.read(telencephalonProvider.notifier);
      notifier.takeOverByAgentSurface(
        'http://127.0.0.1:43210',
        shadowKey: 'sk-embedded',
        adminToken: 'admin-embedded',
      );
      expect(container.read(telencephalonClientProvider).apiKey, 'sk-embedded');

      notifier.releaseAgentSurface();

      expect(
        container.read(telencephalonClientProvider).apiKey,
        'sk-ext',
        reason: '外部端脑要的是**它自己**那把 ⇒ 内嵌那把不许带过去',
      );
    });

    test('没配外部影子锁时：放手后仍是空（内嵌那把不许带过去）', () async {
      await storeConfig(baseUrl: 'http://192.168.1.50:60080');
      final container = newContainer();

      final notifier = container.read(telencephalonProvider.notifier);
      notifier.takeOverByAgentSurface(
        'http://127.0.0.1:43210',
        shadowKey: 'sk-embedded',
      );
      notifier.releaseAgentSurface();

      expect(container.read(telencephalonClientProvider).apiKey, isNull);
    });

    test('改配置时影子锁跟着改（没接管端脑面时）', () async {
      final container = newContainer();

      container.read(telencephalonProvider.notifier).setConfiguredEndpoint(
            'http://10.0.0.9:60080',
            'tok-xyz',
            shadowKey: 'sk-new',
          );

      expect(container.read(telencephalonClientProvider).apiKey, 'sk-new');
    });

    test('改地址不许把钥匙清掉（setBaseUrl 只改地址）', () async {
      final container = newContainer();
      final notifier = container.read(telencephalonProvider.notifier);
      notifier.setAdminToken('admin-1');
      notifier.setApiKey('sk-1');

      notifier.setBaseUrl('http://10.0.0.9:60080');

      expect(container.read(telencephalonClientProvider).baseUrl,
          'http://10.0.0.9:60080');
      expect(
        container.read(telencephalonClientProvider).adminToken,
        'admin-1',
        reason: '「改个地址」顺手把钥匙清了 ⇒ 读面 401 ⇒ 失败长得像成功',
      );
      expect(container.read(telencephalonClientProvider).apiKey, 'sk-1');
    });

    test('AppConfigService：影子锁落盘、重载还在、空值清掉', () async {
      final cfg = AppConfigService();
      await cfg.init();
      await cfg.setTelencephalonShadowKey('sk-1');
      expect(cfg.telencephalonShadowKey, 'sk-1');

      await cfg.init();
      expect(cfg.telencephalonShadowKey, 'sk-1');

      await cfg.setTelencephalonShadowKey('');
      expect(cfg.telencephalonShadowKey, isNull);
    });
  });
}
