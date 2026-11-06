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

/// 「后端设置」卡片的契约。
///
/// ⚠️ 这张卡是**记忆面唯一的配置入口**（记忆面打哪台端脑 = 这里填的地址）
/// ⇒ ⇒ 它显示的必须是「**用户配置的那个**」⇒ 而不是「client 此刻在用的那个」。
///
/// 为什么这两个不一样：client 会被**内嵌大脑接管**（地址换成
/// `127.0.0.1:<agentPort>`、admin token 换成内嵌那把）⇒ ⇒ 读 client 就是
/// 显示**内嵌那台**⇒ 用户配的远端地址在界面上「消失了」⇒ 而他**一点 Save**
/// 就把内嵌的地址/token **写进持久化配置** ⇒ ⇒ 用户配的远端**被覆盖**
/// ⇒ 「配了、存了、界面里还显示着、重启后却不生效」⇒ **失败长得像成功**。
///
/// ⚠️ **为什么要用 `tester.runAsync` 承接真实文件 I/O**：
/// `testWidgets` 的测试体跑在**假时钟**区里 ⇒ `await` 一个真实 I/O
/// （`File.writeAsString` / `File.readAsString`）时，续体排在假时钟上
/// ⇒ 不 pump 就**永远不醒** ⇒ 测试**死等**（而不是报错）。
/// ⇒ 真实 I/O 一律包进 `tester.runAsync`；假时钟里的续体再靠 `pump` 推进。
void main() {
  testSetup();

  late Directory tmpDir;

  setUp(() async {
    tmpDir = await Directory.systemTemp.createTemp('backend_card_test');
    AppConfigService.configFileOverride = () async =>
        File('${tmpDir.path}/app_config.json');
  });

  tearDown(() async {
    AppConfigService.configFileOverride = null;
    if (tmpDir.existsSync()) {
      try {
        await tmpDir.delete(recursive: true);
      } catch (_) {
        // ⚠️ Windows 上刚写过的文件可能还被句柄占着 ⇒ 删不掉就留着
        // （在 TEMP 里，不污染仓库）⇒ **不要**让清理失败盖掉测试结论。
      }
    }
  });

  /// 真实 I/O ⇒ 必须走 `runAsync`（见文件头注释）。
  Future<void> storeEndpoint(
    WidgetTester tester, {
    String? baseUrl,
    String? adminToken,
  }) async {
    await tester.runAsync(() async {
      final file = File('${tmpDir.path}/app_config.json');
      await file.writeAsString(jsonEncode({
        'telencephalonBaseUrl': ?baseUrl,
        'telencephalonAdminToken': ?adminToken,
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

  /// 轮询谓词用的读法：文件还没落盘（`_save()` 那条链还没跑到）时返回
  /// **null** 而不是抛 —— 轮询谓词要表达的是「**还没跟上**」，不是「炸了」。
  Future<Map<String, dynamic>?> tryReadConfig(WidgetTester tester) async {
    Map<String, dynamic>? raw;
    await tester.runAsync(() async {
      final file = File('${tmpDir.path}/app_config.json');
      if (!await file.exists()) return;
      raw = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
    });
    return raw;
  }

  /// 轮询直到谓词满足 —— **而不是数固定轮数**。
  ///
  /// ⚠️ 为什么不再用定长轮（原 16×5ms）：CI 机器慢 ⇒ 每轮 5ms 的真实时间
  /// 里 I/O 未必落地 ⇒「这台机器 16 轮够、那台不够」⇒ 时序 flake（CI run
  /// 42137603583 的 mobile-test 就红在这：Save 后「端脑面跟着走」没走到；
  /// 本机快，复跑绿 ⇒ 典型形状）。⇒ 改成「**轮询直到跟上**」：每轮给一轮
  /// 真实时间＋一次 pump，谓词满足即停 ⇒ 机器慢只影响**等多久**，
  /// 不影响**等不等得到**。超时才红 ⇒ 红 = 链真的没走到谓词那一步，
  /// 不是「轮数差一轮」的假红。
  Future<void> settleUntil(
    WidgetTester tester,
    Future<bool> Function() ready, {
    required String label,
    int maxRounds = 600,
  }) async {
    for (var i = 0; i < maxRounds; i++) {
      await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 5)));
      await tester.pump();
      if (await ready()) return;
    }
    fail('settleUntil($label): $maxRounds 轮 × 5ms 后仍未跟上 —— '
        '不是「轮数不够」（轮询没有轮数这个轴），是链真的没走到谓词那一步');
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
    required Future<bool> Function() until,
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
    // 帧 1 ⇒ post-frame ⇒ `_hydrate()` 起跑（它 `await cfg.init()` ⇒ 真实 I/O）。
    await tester.pump();
    // 轮询到 hydrate 真完成（调用方给「输入框拿到配置里那个」的谓词）
    // ⇒ 不数固定轮数（CI 慢机器上定长轮 = 时序 flake，见 settleUntil 注释）。
    await settleUntil(tester, until, label: 'hydrate');
    return c;
  }

  /// ⚠️ `ShadInput` 渲染的是 **`EditableText`**（不是 `TextField`）
  /// ⇒ 找 `TextField` 会得到「0 个」⇒ 看着像「卡片没渲染出来」。
  String urlFieldText(WidgetTester tester) {
    final fields = find.byType(EditableText);
    // ⚠️ 卡片现在有**三个**输入框（地址 / admin token / 影子锁）——
    // 影子锁那个是端脑面读门的另一半（读门 = 影子锁 ∪ admin token）。
    expect(fields, findsNWidgets(3));
    return tester.widget<EditableText>(fields.first).controller.text;
  }

  String tokenFieldText(WidgetTester tester) {
    final fields = find.byType(EditableText);
    return tester.widget<EditableText>(fields.at(1)).controller.text;
  }

  testWidgets('显示的是配置里的地址，不是被内嵌大脑接管的 client 地址',
      (tester) async {
    await storeEndpoint(
      tester,
      baseUrl: 'http://192.168.1.50:60080',
      adminToken: 'external-token',
    );

    // 内嵌大脑接管端脑面（client 指向本机内嵌那台 + 内嵌那把 token）。
    final container = newContainer();
    container.read(telencephalonProvider.notifier).takeOverByAgentSurface(
          'http://127.0.0.1:43210',
          shadowKey: 'shadow-key',
          adminToken: 'embedded-admin-token',
        );

    await pumpCard(
      tester,
      container: container,
      until: () async =>
          urlFieldText(tester) == 'http://192.168.1.50:60080' &&
          tokenFieldText(tester) == 'external-token',
    );

    // ⇒ 卡片显示的必须是**配置那个**（不是 127.0.0.1:43210）。
    expect(urlFieldText(tester), 'http://192.168.1.50:60080');
    expect(tokenFieldText(tester), 'external-token');
  });

  testWidgets('Save 把地址落进持久化配置，并让端脑面（没人接管时）跟着走',
      (tester) async {
    await storeEndpoint(tester);
    // 空配置 ⇒ hydrate 后地址字段拿到的是「client 此刻的默认」
    // （`cfg.telencephalonBaseUrl ?? default`）⇒ 谓词用它当「已跟上」标志。
    final container = await pumpCard(
      tester,
      until: () async => urlFieldText(tester) == 'http://127.0.0.1:60080',
    );

    await tester.enterText(
        find.byType(EditableText).first, 'http://10.0.0.9:60080');
    await tester.enterText(find.byType(EditableText).at(1), 'tok-xyz');
    await tester.tap(find.byType(ShadButton));
    await tester.pump();

    // `_save()` 是真实 I/O ⇒ 轮询到「**端脑面跟上**」（链尾标志：
    // `setConfiguredEndpoint` 在三次落盘**之后**才更新面 ⇒ 面跟上 =
    // 全链走完）＋落盘完整。没人接管 ⇒ 面跟着配置走。
    Future<bool> savedAndFollowed() async {
      if (container.read(telencephalonClientProvider).baseUrl !=
          'http://10.0.0.9:60080') {
        return false;
      }
      if (container.read(telencephalonProvider).connection.baseUrl !=
          'http://10.0.0.9:60080') {
        return false;
      }
      final raw = await tryReadConfig(tester);
      return raw != null &&
          raw['telencephalonBaseUrl'] == 'http://10.0.0.9:60080' &&
          raw['telencephalonAdminToken'] == 'tok-xyz';
    }

    await settleUntil(tester, savedAndFollowed, label: 'save');

    // 落盘了（轮询已确认；最终断言再读一遍作为凭证）。
    final raw = await readConfig(tester);
    expect(raw['telencephalonBaseUrl'], 'http://10.0.0.9:60080');
    expect(raw['telencephalonAdminToken'], 'tok-xyz');

    // 端脑面（此时没人接管）跟着走了。
    expect(container.read(telencephalonClientProvider).baseUrl,
        'http://10.0.0.9:60080');
    expect(container.read(telencephalonProvider).connection.baseUrl,
        'http://10.0.0.9:60080');
  });

  testWidgets('Save 不会把内嵌那把 admin token 写进持久化配置',
      (tester) async {
    // 用户**从没配过**外部 admin token ⇒ 配置里就是空的。
    await storeEndpoint(tester, baseUrl: 'http://192.168.1.50:60080');

    final container = newContainer();
    container.read(telencephalonProvider.notifier).takeOverByAgentSurface(
          'http://127.0.0.1:43210',
          shadowKey: 'shadow-key',
          adminToken: 'embedded-admin-token',
        );

    await pumpCard(
      tester,
      container: container,
      until: () async => urlFieldText(tester) == 'http://192.168.1.50:60080',
    );

    // 只改地址，不碰 token ⇒ Save 不该凭空多出 token。
    await tester.enterText(
        find.byType(EditableText).first, 'http://10.0.0.9:60080');
    await tester.tap(find.byType(ShadButton));
    await tester.pump();

    // 链尾标志：state 面（记忆面）**无条件**跟配置走（`setConfiguredEndpoint`
    // 的 `copyWith` 在接管判断**之外**）⇒ 它跟上 = 全链走完；端脑面（client）
    // 被**内嵌接管** ⇒ **不该**跟 ⇒ 谓词不判它。
    Future<bool> savedAndFollowed() async {
      if (container.read(telencephalonProvider).connection.baseUrl !=
          'http://10.0.0.9:60080') {
        return false;
      }
      final raw = await tryReadConfig(tester);
      return raw != null &&
          raw['telencephalonBaseUrl'] == 'http://10.0.0.9:60080';
    }

    await settleUntil(tester, savedAndFollowed, label: 'save-no-token');

    final raw = await readConfig(tester);
    expect(raw['telencephalonBaseUrl'], 'http://10.0.0.9:60080');
    expect(raw.containsKey('telencephalonAdminToken'), isFalse);
    expect(raw['telencephalonAdminToken'], isNot('embedded-admin-token'));
  });
}
