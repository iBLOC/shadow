import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/services/app_config_service.dart';
import 'package:shadow_mobile/services/prefrontal_client.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// 「记忆面打哪台端脑」的单测。
///
/// ⚠️ 背景（2026-10-31 真机 + 代码审读）：
///
/// - **端脑面**（聊天 / 身份 / agent 管理）打的是 `TelencephalonClient`
///   ⇒ 内嵌大脑启动时会把**它**指向本机端口
///   （`EncephalonMobileNotifier._pointClientsAtAgentSurface`）
///   ⇒ ⇒ 手机上的端脑面 = **本机内嵌那台**。
/// - **记忆面**（记忆 / 任务 / 人格）打的是 `PrefrontalClient`
///   ⇒ 嵌入式端脑**不带海马体**（mobile profile 不编它 ⇒ `/hippocampus/*`
///   直接 404）⇒ ⇒ 记忆面**必须**打**另一台**——带海马体的那台。
///
/// ⇒ 所以两张面**本来就该指不同的端脑**，而且
/// ⚠️ **记忆面绝对不能跟着「端脑 client 实际在用的地址」走**（那是本机
/// 内嵌那台 ⇒ 没有海马体 ⇒ 记忆页永远是空的）。
///
/// ⇒ 记忆面跟的是**用户配置的那个地址**
/// （`telencephalonProvider` 的 state 里那个 —— 内嵌大脑改的是 client、
/// **不是** state ⇒ state 里那个**始终是用户配的那个**）。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory tmpDir;

  /// 把「存储里」的端脑地址写进配置文件（走 AppConfigService 自己的落盘
  /// 路径，不碰真机上的文件）。
  Future<void> storeEndpoint({String? baseUrl, String? adminToken}) async {
    final file = File('${tmpDir.path}/app_config.json');
    await file.writeAsString(jsonEncode({
      'telencephalonBaseUrl': ?baseUrl,
      'telencephalonAdminToken': ?adminToken,
    }));
    await AppConfigService().init();
  }

  setUp(() async {
    tmpDir = await Directory.systemTemp.createTemp('prefrontal_ep_test');
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

  /// 每个用例一个**全新的 client** —— 默认那个 `defaultTelencephalonClient`
  /// 是**全局单例** ⇒ 不隔离的话上一个用例的接管会漏到下一个用例。
  ProviderContainer newContainer() {
    final container = ProviderContainer(overrides: [
      telencephalonProvider.overrideWith(
        (ref) => TelencephalonNotifier(client: TelencephalonClient()),
      ),
    ]);
    addTearDown(container.dispose);
    return container;
  }

  test('没配远端地址时：记忆面落在默认的回环地址', () {
    final container = newContainer();

    // ⚠️ 口径与**端脑面**一致（`TelencephalonClient.defaultBaseUrl`
    // = `http://127.0.0.1:60080`）—— 两张面跟的是同一个 state 地址，
    // 不配远端时就都落在回环 ⇒ 两者等价（localhost 与 127.0.0.1 同义）。
    expect(
      container.read(prefrontalClientProvider).baseUrl,
      'http://127.0.0.1:60080',
    );
  });

  test('配了远端地址时：记忆面跟着那个地址走', () async {
    await storeEndpoint(baseUrl: 'http://192.168.1.50:60080');
    final container = newContainer();

    expect(
      container.read(prefrontalClientProvider).baseUrl,
      'http://192.168.1.50:60080',
    );
  });

  test('端脑面被内嵌大脑接管时：记忆面**配了远端就仍指远端**（显式意图优先）', () async {
    await storeEndpoint(baseUrl: 'http://192.168.1.50:60080');
    final container = newContainer();

    // 内嵌大脑启动 ⇒ 把**端脑 client** 指向本机端口（不改 state）。
    container.read(telencephalonProvider.notifier).takeOverByAgentSurface(
          'http://127.0.0.1:43210',
          shadowKey: 'shadow-key',
          adminToken: 'embedded-admin-token',
        );

    // ⇒ 端脑面 = 本机内嵌那台；记忆面 = 配的那台（用户显式配的 ⇒ 优先）。
    expect(container.read(telencephalonClientProvider).baseUrl,
        'http://127.0.0.1:43210');
    expect(container.read(prefrontalClientProvider).baseUrl,
        'http://192.168.1.50:60080');
  });

  test('**没配远端**时：记忆面指本机内嵌端脑（它带海马体）', () async {
    // ⚠️ 移动端**没有任何 UI 能改「后端地址」** ⇒ ⇒ 配置恒为 null ⇒ ⇒
    // 记忆面若仍指默认回环口 `127.0.0.1:60080` ⇒ ⇒ **手机上永远没人
    // 监听**（内嵌端脑用每次启动都变的随机端口）⇒ ⇒ 记忆页必败。
    // ⇒ ⇒ 没配 ⇒ 指本机内嵌端脑（`mobile-memory` 档下它**带海马体**）。
    final container = newContainer();

    container.read(telencephalonProvider.notifier).takeOverByAgentSurface(
          'http://127.0.0.1:43210',
          shadowKey: 'shadow-key',
          adminToken: 'embedded-admin-token',
        );

    expect(container.read(prefrontalClientProvider).baseUrl,
        'http://127.0.0.1:43210');
  });

  test('内嵌大脑放手后：记忆面回到配置里那个（没配过 ⇒ 默认回环口）',
      () async {
    final container = newContainer();
    final notifier = container.read(telencephalonProvider.notifier);

    notifier.takeOverByAgentSurface(
      'http://127.0.0.1:43210',
      shadowKey: 'shadow-key',
      adminToken: 'embedded-admin-token',
    );
    expect(container.read(prefrontalClientProvider).baseUrl,
        'http://127.0.0.1:43210');

    notifier.releaseAgentSurface();
    expect(container.read(prefrontalClientProvider).baseUrl,
        'http://127.0.0.1:60080');
  });

  test('地址变了租户也不能丢（重建实例 = 读到另一个桶）', () async {
    await storeEndpoint(baseUrl: 'http://192.168.1.50:60080');
    final container = newContainer();

    final client = container.read(prefrontalClientProvider);
    client.setTenantId('persona-abc123');

    // 换个地址 ⇒ provider 重建 ⇒ 实例必须还是同一个。
    container.read(telencephalonProvider.notifier).setBaseUrl('http://10.0.0.9:60080');
    final after = container.read(prefrontalClientProvider);

    expect(after.baseUrl, 'http://10.0.0.9:60080');
    expect(identical(after, client), isTrue, reason: '实例不能换 —— 换了租户就回 default 了');
    expect(after.tenantId, 'persona-abc123', reason: '租户不许因为换地址而丢');
  });

  test('存储里的 admin token 要真的递给端脑 client', () async {
    await storeEndpoint(baseUrl: 'http://192.168.1.50:60080', adminToken: 'tok-xyz');
    final container = newContainer();

    expect(container.read(telencephalonClientProvider).adminToken, 'tok-xyz');
  });
}
