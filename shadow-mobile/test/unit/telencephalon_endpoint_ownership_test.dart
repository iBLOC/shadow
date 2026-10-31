import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/services/app_config_service.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

/// 「端脑面归谁管」的单测 —— 所有权模型。
///
/// ⚠️ 背景（2026-10-31 真机 + 代码审读）：
///
/// 端脑面（`TelencephalonClient`）的地址有**两个**竞争的主张：
///
/// - 内嵌大脑（手机上的那台，端脑面 = `127.0.0.1:<agentPort>`）；
/// - 用户配置（设置页「后端地址」里填的那个）。
///
/// 以前是**各改各的**（内嵌大脑直接改 client，设置页也直接改 client，
/// 而「配置」只在 `AppConfigService` 里躺着没人读）⇒ ⇒ 三件事同时成立：
///
/// 1. **设置页显示的是被接管的地址** ⇒ 用户配了远端，打开设置页看到的却是
///    `127.0.0.1:<agentPort>` ⇒ 一点 Save 就把**内嵌的地址写进持久化配置**
///    ⇒ 用户配的远端**被覆盖**（失败长得像成功）。
/// 2. **内嵌大脑一停，client 被拽回 `TelencephalonClient.defaultBaseUrl`**
///    （那是「没配过」的默认值）⇒ 配了远端也白配。
/// 3. **配置里的 admin token 会被内嵌那把顶掉**，而顶掉之后**回不去**
///    （复原时放的是「接管那一刻 client 上的值」，可能已经是内嵌那把）。
///
/// ⇒ 现在的模型是**同一时刻只有一个主人**：
///
/// | 内嵌大脑 | 端脑面（client）归谁 | 记忆面（state）归谁 |
/// |---|---|---|
/// | 在跑 | 内嵌大脑 | 配置 |
/// | 没跑 | 配置 | 配置 |
///
/// ⇒ 记忆面**永远**是配置说了算（它要打的是**带海马体的那台**）。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory tmpDir;

  Future<void> storeEndpoint({String? baseUrl, String? adminToken}) async {
    final file = File('${tmpDir.path}/app_config.json');
    await file.writeAsString(jsonEncode({
      'telencephalonBaseUrl': ?baseUrl,
      'telencephalonAdminToken': ?adminToken,
    }));
    await AppConfigService().init();
  }

  setUp(() async {
    tmpDir = await Directory.systemTemp.createTemp('tel_ownership_test');
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
  /// 是**全局单例** ⇒ 不隔离的话上一个用例的接管会漏到下一个用例
  /// ⇒ 测试之间互相污染 ⇒ 「绿」也不可信。
  ProviderContainer newContainer() {
    final container = ProviderContainer(overrides: [
      telencephalonProvider.overrideWith(
        (ref) => TelencephalonNotifier(client: TelencephalonClient()),
      ),
    ]);
    addTearDown(container.dispose);
    return container;
  }

  test('没人接管时：改配置 ⇒ 端脑面（client）跟着走', () async {
    await storeEndpoint(baseUrl: 'http://192.168.1.50:60080');
    final container = newContainer();

    container.read(telencephalonProvider.notifier).setConfiguredEndpoint(
          'http://10.0.0.9:60080',
          'tok-xyz',
        );

    expect(container.read(telencephalonClientProvider).baseUrl,
        'http://10.0.0.9:60080');
    expect(container.read(telencephalonClientProvider).adminToken, 'tok-xyz');
  });

  test('内嵌大脑接管期间：改配置 **不动** 端脑面（聊天面不被拽走）', () async {
    await storeEndpoint(baseUrl: 'http://192.168.1.50:60080');
    final container = newContainer();

    final notifier = container.read(telencephalonProvider.notifier);
    notifier.takeOverByAgentSurface(
      'http://127.0.0.1:43210',
      shadowKey: 'shadow-key',
      adminToken: 'embedded-admin-token',
    );

    // 用户改配置（把远端换成另一台）。
    notifier.setConfiguredEndpoint('http://10.0.0.9:60080', 'tok-xyz');

    // ⇒ 端脑面**不动**：它归内嵌大脑管（改了就会被拽走 ⇒ 聊天 401）。
    expect(container.read(telencephalonClientProvider).baseUrl,
        'http://127.0.0.1:43210');
    expect(container.read(telencephalonClientProvider).adminToken,
        'embedded-admin-token');
    // ⇒ 但 state（= 记忆面跟的那个）**跟着变**。
    expect(container.read(telencephalonProvider).connection.baseUrl,
        'http://10.0.0.9:60080');
  });

  test('内嵌大脑放手后：端脑面回到 **配置里那个**，不是默认地址', () async {
    await storeEndpoint(
      baseUrl: 'http://192.168.1.50:60080',
      adminToken: 'external-token',
    );
    final container = newContainer();

    final notifier = container.read(telencephalonProvider.notifier);
    notifier.takeOverByAgentSurface(
      'http://127.0.0.1:43210',
      shadowKey: 'shadow-key',
      adminToken: 'embedded-admin-token',
    );
    expect(container.read(telencephalonClientProvider).baseUrl,
        'http://127.0.0.1:43210');

    notifier.releaseAgentSurface();

    // ⚠️ 不是 `TelencephalonClient.defaultBaseUrl`（= 没配过的默认值）。
    expect(container.read(telencephalonClientProvider).baseUrl,
        'http://192.168.1.50:60080');
    // admin token 也回到**外部那把**（内嵌那把只对内嵌端脑有效）。
    expect(container.read(telencephalonClientProvider).adminToken,
        'external-token');
    // 影子锁是内嵌端脑的 ⇒ 放手后清掉（外部端脑的影子锁移动端没配过）。
    expect(container.read(telencephalonClientProvider).apiKey, isNull);
  });

  test('放手后再改配置 ⇒ 端脑面继续跟着走（没有「幽灵主人」）', () async {
    await storeEndpoint(baseUrl: 'http://192.168.1.50:60080');
    final container = newContainer();

    final notifier = container.read(telencephalonProvider.notifier);
    notifier.takeOverByAgentSurface('http://127.0.0.1:43210');
    notifier.releaseAgentSurface();

    notifier.setConfiguredEndpoint('http://10.0.0.9:60080', null);
    expect(container.read(telencephalonClientProvider).baseUrl,
        'http://10.0.0.9:60080');
  });

  test('没配过任何地址时：两端面都落在同一个回环默认值上', () {
    final container = newContainer();

    expect(container.read(telencephalonProvider).connection.baseUrl,
        'http://127.0.0.1:60080');
    expect(container.read(telencephalonClientProvider).baseUrl,
        'http://127.0.0.1:60080');
  });

  test('存储里的地址/token 在**构造时**就应用给 client（重启后不丢）', () async {
    await storeEndpoint(
      baseUrl: 'http://192.168.1.50:60080',
      adminToken: 'tok-from-disk',
    );
    final container = newContainer();

    expect(container.read(telencephalonClientProvider).baseUrl,
        'http://192.168.1.50:60080');
    expect(container.read(telencephalonClientProvider).adminToken,
        'tok-from-disk');
  });
}
