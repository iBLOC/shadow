import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart' as http_testing;
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/services/app_config_service.dart';
import 'package:shadow_mobile/services/prefrontal_client.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// 「记忆面**带不带门闩**」的单测。
///
/// ⚠️ **为什么这道判据存在**（2026-11-17）：
///
/// 端脑的门型表（`telencephalon/src/api/door_policy.txt`）有一条
/// `/hippocampus/*  *  auto` ⇒ ⇒
///   - 读（`/api/memory`、`/api/search`）落**读门**（shadow key ∪ admin token）
///   - 写（upsert / DELETE）落**写门**（**只认** admin token）
///
/// ⇒ ⇒ 而**内嵌端脑的 shadow key 一定非空**（宿主 `ensure_secret` 生成
/// `<filesDir>/shadow.key` 并递进端脑）⇒ ⇒ **不带钥匙 ⇒ 401**。
///
/// ⇒ ⇒ 于是手机端带上本机海马体（`mobile-memory` 档）之后，如果记忆面
/// 仍不带钥匙 ⇒ ⇒ **海马体建好了、路由挂上了、客户端却被门挡在外面**
/// ⇒ ⇒ 记忆页还是「读不到」—— **失败长得像成功**。
///
/// ⇒ ⇒ 所以这里钉三件事：
///   ❶ 记忆面**带**门闩（内嵌端脑那把）；
///   ❷ 记忆面**也带** admin token（写门只认它 ⇒ 只带一把 ⇒ 写不过）；
///   ❸ 空值**绝不下发**（塞空串头 ⇒ 401 且看不出原因）。
///
/// ⇒ ⇒ 全部用 `MockClient` 注入（仓内既有做法，见
/// `test/unit/telencephalon_client_test.dart`）⇒ ⇒ **不碰真网络**。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory tmpDir;
  late List<http.Request> seen;

  /// 一个只记录请求头的假端脑（返回 `[]` ⇒ 海马体的「列出记忆」形状）。
  http.Client fakeBrain() => http_testing.MockClient((req) async {
        seen.add(req);
        return http.Response('[]', 200,
            headers: {'content-type': 'application/json; charset=utf-8'});
      });

  Future<void> storeEndpoint({String? baseUrl, String? adminToken}) async {
    final file = File('${tmpDir.path}/app_config.json');
    await file.writeAsString(jsonEncode({
      'telencephalonBaseUrl': ?baseUrl,
      'telencephalonAdminToken': ?adminToken,
    }));
    await AppConfigService().init();
  }

  setUp(() async {
    seen = [];
    tmpDir = await Directory.systemTemp.createTemp('prefrontal_door_test');
    AppConfigService.configFileOverride = () async =>
        File('${tmpDir.path}/app_config.json');
    await storeEndpoint();
  });

  tearDown(() async {
    AppConfigService.configFileOverride = null;
    if (tmpDir.existsSync()) {
      await tmpDir.delete(recursive: true);
    }
  });

  test('❶ 记忆面带门闩：没有它，`/hippocampus/*` 的读门会 401', () async {
    final client = PrefrontalClient(client: fakeBrain());
    client.setShadowKey('shadow-key-abc');

    await client.listMemories();

    expect(seen, isNotEmpty, reason: '请求必须真的发出去了');
    expect(seen.first.headers['X-Shadow-Key'], 'shadow-key-abc');
  });

  test('❷ 写门只认 admin token ⇒ ⇒ 写操作要带 admin token', () async {
    final client = PrefrontalClient(client: fakeBrain());
    client.setShadowKey('shadow-key-abc');
    client.setAdminToken('admin-token-xyz');

    await client.addMemory(
      AddMemoryRequest(uri: 'u://1', content: 'c', dimension: 'agent'),
    );

    expect(seen, isNotEmpty);
    expect(seen.first.headers['X-Admin-Token'], 'admin-token-xyz');
    expect(seen.first.headers['X-Shadow-Key'], 'shadow-key-abc');
  });

  test('❸ 空值绝不下发：塞空串头 ⇒ 401 且看不出原因', () async {
    final client = PrefrontalClient(client: fakeBrain());
    // 空串 ⇒ 必须当成「没有」⇒ ⇒ 头**不许出现**。
    client.setShadowKey('');
    client.setAdminToken('');

    await client.listMemories();

    expect(seen, isNotEmpty);
    expect(seen.first.headers['X-Shadow-Key'], isNull,
        reason: '空串门闩不许下发 —— 空串头会被判成「带了一个空的门闩」');
    expect(seen.first.headers['X-Admin-Token'], isNull);
  });

  test('❹ 端脑面被内嵌大脑接管时：记忆面拿到的门闩是**内嵌那把**', () async {
    final container = ProviderContainer(overrides: [
      telencephalonProvider.overrideWith(
        (ref) => TelencephalonNotifier(client: TelencephalonClient()),
      ),
    ]);
    addTearDown(container.dispose);

    // 内嵌大脑接管 ⇒ 把**端脑 client** 指向本机端口。
    container.read(telencephalonProvider.notifier).takeOverByAgentSurface(
          'http://127.0.0.1:43210',
          shadowKey: 'embedded-shadow-key',
          adminToken: 'embedded-admin-token',
        );

    final client = container.read(prefrontalClientProvider);
    // ⇒ ⇒ 门闩要被递到记忆面上（否则本机海马体建好了也读不到）。
    expect(client.shadowKey, 'embedded-shadow-key');
    expect(client.adminToken, 'embedded-admin-token');
    // ⇒ ⇒ 而且**地址也跟着指本机**（没配远端时）。
    expect(client.baseUrl, 'http://127.0.0.1:43210');
  });

  test('❺ 配了远端时：记忆面仍指远端、用远端那把钥匙（显式意图优先）',
      () async {
    await storeEndpoint(
      baseUrl: 'http://192.168.1.50:60080',
      adminToken: 'external-admin-token',
    );
    final container = ProviderContainer(overrides: [
      telencephalonProvider.overrideWith(
        (ref) => TelencephalonNotifier(client: TelencephalonClient()),
      ),
    ]);
    addTearDown(container.dispose);

    container.read(telencephalonProvider.notifier).takeOverByAgentSurface(
          'http://127.0.0.1:43210',
          shadowKey: 'embedded-shadow-key',
          adminToken: 'embedded-admin-token',
        );

    final client = container.read(prefrontalClientProvider);
    expect(client.baseUrl, 'http://192.168.1.50:60080',
        reason: '用户显式配了远端 ⇒ 记忆面仍指远端');
    expect(client.adminToken, 'external-admin-token',
        reason: '远端端脑用自己的 admin token，不是内嵌那把');
  });
}
