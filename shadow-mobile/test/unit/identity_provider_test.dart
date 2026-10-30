import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart' as http_testing;
import 'package:shadow_mobile/providers/identity_provider.dart';
import 'package:shadow_mobile/services/app_config_service.dart';
import 'package:shadow_mobile/services/identity/tenant_migration.dart';
import 'package:shadow_mobile/services/prefrontal_client.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// 「当前是谁」这一档的行为测试。
///
/// 钉的是**语义**：
/// - 端脑说背后有人 ⇒ 租户就是那个人格（海马体的读写都落在那个桶）；
/// - 端脑说背后没人 ⇒ 退回 `"default"`（老部署不变）；
/// - 端脑连不上 ⇒ **不**标记 resolved —— 大脑起来之后会自动切过去；
/// - 并发的调用方共享同一次请求。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('IdentityNotifier', () {
    test('端脑说背后有人 ⇒ 租户就是那个人格，海马体也跟着换桶', () async {
      final prefrontal = PrefrontalClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: http_testing.MockClient((_) async => http.Response('[]', 200)),
      );
      final telencephalon = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: http_testing.MockClient(
          (request) async => http.Response(
            jsonEncode({
              'principal': 'principal:alice',
              'persona': 'persona-ada',
              'device': 'device-1',
              'identified': true,
              'personas': [
                {'persona': 'persona-ada', 'role': 'owner'},
              ],
            }),
            200,
          ),
        ),
      );

      final notifier = IdentityNotifier(telencephalon, prefrontal);
      final tenant = await notifier.resolve();

      expect(tenant, 'persona-ada');
      expect(notifier.state.identified, isTrue);
      expect(notifier.state.principal, 'principal:alice');
      expect(notifier.state.device, 'device-1');
      expect(notifier.state.resolved, isTrue);
      // 关键：租户真的落到海马体 client 上了。
      expect(prefrontal.tenantId, 'persona-ada');
    });

    test('端脑说背后没人 ⇒ 退回 default 桶（老部署不变）', () async {
      final prefrontal = PrefrontalClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: http_testing.MockClient((_) async => http.Response('[]', 200)),
      );
      final telencephalon = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: http_testing.MockClient(
          (request) async => http.Response(
            jsonEncode({
              'principal': null,
              'persona': null,
              'device': null,
              'identified': false,
              'personas': [],
            }),
            200,
          ),
        ),
      );

      final notifier = IdentityNotifier(telencephalon, prefrontal);
      final tenant = await notifier.resolve();

      expect(tenant, 'default');
      expect(notifier.state.identified, isFalse);
      expect(prefrontal.tenantId, 'default');
    });

    test('端脑连不上 ⇒ 保持兜底租户、不标记 resolved（下次还会再试）', () async {
      final prefrontal = PrefrontalClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: http_testing.MockClient((_) async => http.Response('[]', 200)),
      );
      final telencephalon = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: http_testing.MockClient(
          (request) async => throw Exception('connection refused'),
        ),
      );

      final notifier = IdentityNotifier(telencephalon, prefrontal);
      final tenant = await notifier.resolve();

      expect(tenant, 'default');
      expect(notifier.state.resolved, isFalse);
      expect(notifier.state.error, isNotNull);
    });

    test('端脑挂着不回 ⇒ 超时后回退兜底租户（不能永远挂着）', () async {
      final prefrontal = PrefrontalClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: http_testing.MockClient((_) async => http.Response('[]', 200)),
      );
      final telencephalon = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: http_testing.MockClient((request) async {
          await Future<void>.delayed(const Duration(seconds: 5));
          return http.Response('{}', 200);
        }),
      );

      final notifier = IdentityNotifier(telencephalon, prefrontal);
      final tenant = await notifier.resolve(
        timeout: const Duration(milliseconds: 50),
      );

      expect(tenant, 'default');
      expect(notifier.state.resolved, isFalse);
      expect(notifier.state.error, contains('timeout'));
    });

    test('并发的两次 resolve 只打一次端脑', () async {
      var calls = 0;
      final prefrontal = PrefrontalClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: http_testing.MockClient((_) async => http.Response('[]', 200)),
      );
      final telencephalon = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: http_testing.MockClient((request) async {
          calls++;
          await Future<void>.delayed(const Duration(milliseconds: 20));
          return http.Response(
            jsonEncode({
              'persona': 'persona-ada',
              'identified': true,
              'personas': [],
            }),
            200,
          );
        }),
      );

      final notifier = IdentityNotifier(telencephalon, prefrontal);
      final results = await Future.wait([
        notifier.resolve(),
        notifier.resolve(),
      ]);

      expect(results, ['persona-ada', 'persona-ada']);
      expect(calls, 1);
    });

    test('解析过之后再调不会重复问端脑', () async {
      var calls = 0;
      final prefrontal = PrefrontalClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: http_testing.MockClient((_) async => http.Response('[]', 200)),
      );
      final telencephalon = TelencephalonClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: http_testing.MockClient((request) async {
          calls++;
          return http.Response(
            jsonEncode({'persona': 'persona-ada', 'identified': true}),
            200,
          );
        }),
      );

      final notifier = IdentityNotifier(telencephalon, prefrontal);
      await notifier.resolve();
      await notifier.resolve();

      expect(calls, 1);
    });
  });

  group('租户迁移（default → 账号人格）', () {
    late Directory tempDir;
    late File tempFile;

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('identity_migration_');
      tempFile = File('${tempDir.path}/app_config.json');
      AppConfigService.configFileOverride = () async => tempFile;
      // 写一个空配置：AppConfigService 在**文件不存在**时会保留上一次的
      // 内存值（`init()` 只在文件存在时才覆盖字段），不写的话单例里的
      // 上一个用例留下的迁移标记会串到这里。
      await tempFile.writeAsString('{}');
      await AppConfigService().init();
    });

    tearDown(() async {
      AppConfigService.configFileOverride = null;
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });

    test('目标还是 default ⇒ 什么都不搬', () async {
      final client = PrefrontalClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: http_testing.MockClient((_) async => http.Response('[]', 200)),
      );

      final result = await migrateLegacyTenant(
        client: client,
        targetTenant: 'default',
      );

      expect(result.ran, isFalse);
      expect(result.reason, 'target-is-default');
    });

    test('记忆按 uri 去重（目标桶已有的不重复复制）', () async {
      final copied = <Map<String, dynamic>>[];
      final client = PrefrontalClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: http_testing.MockClient((request) async {
          if (request.method == 'GET') {
            final tenant = request.url.queryParameters['tenantId'];
            if (tenant == 'default') {
              return http.Response(
                jsonEncode([
                  {
                    'id': 'm1',
                    'uri': 'preference://theme/accent',
                    'content': '#ff8800',
                    'dimension': 'Agent',
                    'created_at': '2026-10-30T00:00:00Z',
                  },
                  {
                    'id': 'm2',
                    'uri': 'memory://1',
                    'content': 'likes dark mode',
                    'dimension': 'Agent',
                    'created_at': '2026-10-30T00:00:00Z',
                  },
                ]),
                200,
              );
            }
            // 目标桶里已经有主题色那条了。
            return http.Response(
              jsonEncode([
                {
                  'id': 'm3',
                  'uri': 'preference://theme/accent',
                  'content': '#ff8800',
                  'dimension': 'Agent',
                  'created_at': '2026-10-30T00:00:00Z',
                },
              ]),
              200,
            );
          }
          if (request.method == 'POST' &&
              request.url.path == '/hippocampus/api/memory') {
            copied.add(jsonDecode(request.body) as Map<String, dynamic>);
            return http.Response(jsonEncode({'id': 'new'}), 200);
          }
          return http.Response('[]', 200);
        }),
      );

      final result = await migrateLegacyTenant(
        client: client,
        targetTenant: 'persona-ada',
      );

      expect(result.ran, isTrue);
      expect(result.memoriesCopied, 1);
      expect(copied, hasLength(1));
      expect(copied.first['uri'], 'memory://1');
      expect(copied.first['tenantId'], 'persona-ada');
      // dimension 请求侧小写。
      expect(copied.first['dimension'], 'agent');
    });

    test('搬过一次就只搬一次（标记跟人格无关）', () async {
      var posted = 0;
      final client = PrefrontalClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: http_testing.MockClient((request) async {
          if (request.method == 'POST') {
            posted++;
          }
          return http.Response('[]', 200);
        }),
      );

      final first = await migrateLegacyTenant(
        client: client,
        targetTenant: 'persona-ada',
      );
      expect(first.ran, isTrue);
      expect(AppConfigService().tenantMigrationTarget, 'persona-ada');

      final second = await migrateLegacyTenant(
        client: client,
        targetTenant: 'persona-bob',
      );
      expect(second.ran, isFalse);
      expect(second.reason, 'already-migrated');
      expect(posted, 0);
    });

    test('搬的过程中出错 ⇒ 不写标记，下次还会再试', () async {
      final client = PrefrontalClient(
        baseUrl: 'http://127.0.0.1:60080',
        client: http_testing.MockClient((request) async {
          if (request.method == 'GET') {
            final tenant = request.url.queryParameters['tenantId'];
            if (tenant == 'default') {
              return http.Response(
                jsonEncode([
                  {
                    'id': 'm1',
                    'uri': 'memory://1',
                    'content': 'x',
                    'dimension': 'Agent',
                    'created_at': '2026-10-30T00:00:00Z',
                  },
                ]),
                200,
              );
            }
            // 目标桶是空的 ⇒ 那条会被复制过去（于是下面的 500 才发生）。
            return http.Response('[]', 200);
          }
          return http.Response('storage offline', 500);
        }),
      );

      final result = await migrateLegacyTenant(
        client: client,
        targetTenant: 'persona-ada',
      );

      expect(result.errors, isNotEmpty);
      expect(AppConfigService().tenantMigrationTarget, isNull);
    });
  });
}
