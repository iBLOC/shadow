import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/providers/telencephalon_provider.dart';
import 'package:shadow_mobile/screens/settings_screen.dart';
import 'package:shadow_mobile/services/app_config_service.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';

import 'test_helper.dart';

/// 「外部端脑的影子锁」在设置页上**有入口**。
///
/// ⚠️ 为什么这条要单独钉：端脑面（`TelencephalonClient`）的读门是
/// **影子锁 ∪ admin token** ⇒ ⇒ 只配了地址 + admin token 的用户，
/// 端脑面的读请求**照样 401** ⇒ 而界面把它画成「没有 / 连不上」
/// ⇒ **失败长得像成功**。
///
/// ⇒ 影子锁今天**存不了、也输不进去** ⇒ 「配了不能生效」的同一族：
/// 有 setter、有持久化位，**只差一个输入框** ⇒ ⇒ 补入口比补 setter 更靠近
/// 用户可感知的失败。
void main() {
  testSetup();

  late Directory tmpDir;

  setUp(() async {
    tmpDir = await Directory.systemTemp.createTemp('backend_shadow_key_test');
    AppConfigService.configFileOverride = () async =>
        File('${tmpDir.path}/app_config.json');
  });

  tearDown(() async {
    AppConfigService.configFileOverride = null;
    if (tmpDir.existsSync()) {
      try {
        await tmpDir.delete(recursive: true);
      } catch (_) {
        // Windows 上刚写过的文件可能还被句柄占着 ⇒ 删不掉就留着
        // （在 TEMP 里，不污染仓库）⇒ 不要让清理失败盖掉测试结论。
      }
    }
  });

  Future<void> storeConfig(
    WidgetTester tester, {
    String? baseUrl,
    String? adminToken,
    String? shadowKey,
  }) async {
    await tester.runAsync(() async {
      final file = File('${tmpDir.path}/app_config.json');
      await file.writeAsString(jsonEncode({
        'telencephalonBaseUrl': ?baseUrl,
        'telencephalonAdminToken': ?adminToken,
        'telencephalonShadowKey': ?shadowKey,
      }));
      await AppConfigService().init();
    });
  }

  Future<Map<String, dynamic>> readConfig(WidgetTester tester) async {
    late Map<String, dynamic> raw;
    await tester.runAsync(() async {
      raw = jsonDecode(
        await File('${tmpDir.path}/app_config.json').readAsString(),
      ) as Map<String, dynamic>;
    });
    return raw;
  }

  /// 把**真实 I/O 的 await 链**走完（假时钟里的续体要靠 pump 推进）。
  Future<void> settleIo(WidgetTester tester, {int rounds = 12}) async {
    for (var i = 0; i < rounds; i++) {
      await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 5)));
      await tester.pump();
    }
  }

  /// 等到**条件成立**为止（不猜轮数）。
  ///
  /// ⚠️ 为什么不能只靠固定轮数：`_save()` 里的**每一次**落盘都是真实 I/O
  /// ⇒ 续体排在**假时钟**的微任务队列里 ⇒ 每一步 await 都要一轮
  /// 「真实时间让 I/O 落地」＋「pump 让续体跑」⇒ ⇒ 落盘次数一多，
  /// 固定轮数就不够了（⇒ 断言在「还没走到那一步」时失败 ⇒ 看着像实现坏了）。
  Future<void> waitFor(
    WidgetTester tester,
    bool Function() done, {
    int maxRounds = 60,
  }) async {
    for (var i = 0; i < maxRounds; i++) {
      if (done()) return;
      await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 5)));
      await tester.pump();
    }
  }

  ProviderContainer newContainer() {
    final container = ProviderContainer(overrides: [
      telencephalonProvider.overrideWith(
        (ref) => TelencephalonNotifier(client: TelencephalonClient()),
      ),
    ]);
    addTearDown(container.dispose);
    return container;
  }

  Future<ProviderContainer> pumpCard(
    WidgetTester tester, {
    ProviderContainer? container,
  }) async {
    final c = container ?? newContainer();
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: c,
        child: withShadTheme(
          MaterialApp(
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
            ],
            supportedLocales: const [Locale('en')],
            locale: const Locale('en'),
            home: const Scaffold(body: BackendSettingsCard()),
          ),
        ),
      ),
    );
    await tester.pump();
    await settleIo(tester);
    return c;
  }

  /// ⚠️ `ShadInput` 渲染的是 **`EditableText`**（不是 `TextField`）。
  String fieldText(WidgetTester tester, int index) {
    final fields = find.byType(EditableText);
    return tester.widget<EditableText>(fields.at(index)).controller.text;
  }

  testWidgets('卡片有第三个输入框（影子锁），显示的是配置里那把',
      (tester) async {
    await storeConfig(
      tester,
      baseUrl: 'http://192.168.1.50:60080',
      shadowKey: 'sk-ext',
    );

    await pumpCard(tester);

    expect(find.byType(EditableText), findsNWidgets(3));
    expect(fieldText(tester, 2), 'sk-ext');
  });

  testWidgets('Save 把影子锁落进持久化配置，并让端脑面拿到那把',
      (tester) async {
    await storeConfig(tester);
    final container = await pumpCard(tester);

    await tester.enterText(find.byType(EditableText).at(2), 'sk-new');
    await tester.tap(find.byType(ShadButton));
    await tester.pump();
    // 等「端脑面真的拿到那把」——`_save()` 是「先落盘、再应用」⇒
    // 落盘是真实 I/O ⇒ 续体要一轮轮 pump 才走得过去。
    await waitFor(tester,
        () => container.read(telencephalonClientProvider).apiKey == 'sk-new');
    await settleIo(tester);

    final raw = await readConfig(tester);
    // ⚠️ 落盘失败必须**自带真因** ⇒ ⇒ 否则「值没落盘」只剩一句
    //   「Actual: null」⇒ ⇒ 看起来像实现坏了 ⇒ ⇒ 真因被埋掉。
    expect(AppConfigService().lastSaveError, isNull,
        reason: '落盘失败 ⇒ ⇒ 真因：${AppConfigService().lastSaveError}');
    expect(raw['telencephalonShadowKey'], 'sk-new',
        reason: '盘上落的是：$raw');
    expect(container.read(telencephalonClientProvider).apiKey, 'sk-new');
  });

  testWidgets('Save 不会把内嵌那把影子锁写进持久化配置', (tester) async {
    await storeConfig(tester, baseUrl: 'http://192.168.1.50:60080');

    final container = newContainer();
    container.read(telencephalonProvider.notifier).takeOverByAgentSurface(
          'http://127.0.0.1:43210',
          shadowKey: 'sk-embedded',
          adminToken: 'admin-embedded',
        );

    await pumpCard(tester, container: container);

    await tester.tap(find.byType(ShadButton));
    await tester.pump();
    await settleIo(tester);

    final raw = await readConfig(tester);
    expect(raw['telencephalonShadowKey'], isNot('sk-embedded'));
    expect(
      raw['telencephalonShadowKey'],
      isNull,
      reason: '用户从没配过外部影子锁 ⇒ Save 不该凭空多出一把',
    );
  });
}
