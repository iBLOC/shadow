import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/services/app_config_service.dart';
import 'package:shadow_mobile/widgets/config_save_error_banner.dart';

/// **「写不进 ≠ 写进了」** —— 配置写盘失败的诚实性。
///
/// 这条纪律的形状：写盘失败**没有**「长得像成功」的形状（界面不会因此
/// 显示成功）⇒ ⇒ 形状闸抓不到它 ⇒ ⇒ 只能靠**行为断言**钉住：
///   ❶ 失败被**记下来**（有真因，不是被重包成一句话）；
///   ❷ 内存回到**文件里的真值**（不许「内存新值 / 文件旧值」分裂）；
///   ❸ 用户**看得见**（全局横幅）。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory tempDir;
  late File tempFile;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('config_save_fail_');
    tempFile = File('${tempDir.path}/app_config.json');
    AppConfigService.configFileOverride = () async => tempFile;
  });

  tearDown(() async {
    AppConfigService.configFileOverride = null;
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  group('AppConfigService — 写盘失败', () {
    test('写失败被记下来（带真因），不是被吞', () async {
      final cfg = AppConfigService();
      await cfg.init();

      // 让写盘**必然失败**：把配置文件的父目录换成一个**不存在的目录**。
      final broken = File('${tempDir.path}/no-such-dir/app_config.json');
      AppConfigService.configFileOverride = () async => broken;

      await cfg.setTelencephalonBaseUrl('http://192.168.1.50:60080');

      expect(cfg.lastSaveError, isNotNull);
      expect(cfg.lastSaveError, isNotEmpty);
      // ⚠️ 真因是**原文**（含系统信息），不是被重包成一句话。
      expect(cfg.lastSaveError, contains('PathNotFoundException'));
    });

    test('写失败 ⇒ 内存回到文件里的真值（不许「内存新值/文件旧值」分裂）',
        () async {
      final cfg = AppConfigService();
      await cfg.init();
      await cfg.setTelencephalonBaseUrl('http://old.example.com:60080');
      expect(cfg.telencephalonBaseUrl, 'http://old.example.com:60080');

      final broken = File('${tempDir.path}/no-such-dir/app_config.json');
      AppConfigService.configFileOverride = () async => broken;

      await cfg.setTelencephalonBaseUrl('http://new.example.com:60080');

      // ⚠️ 关键断言：**内存不是新值** ⇒ ⇒ 界面不会显示「我改了」
      // 而文件里其实没改 ⇒ ⇒ 那才是「失败长得像成功」。
      expect(cfg.telencephalonBaseUrl, 'http://old.example.com:60080');

      // 文件里也确实是旧值（真值只有一个）。
      final onDisk = jsonDecode(await tempFile.readAsString())
          as Map<String, dynamic>;
      expect(onDisk['telencephalonBaseUrl'], 'http://old.example.com:60080');
    });

    test('写失败**且读也失败** ⇒ 回滚到快照，不把别的设置抹成默认',
        () async {
      // ⚠️ 这一条钉的是「**回滚基准不是磁盘**」这个设计决定：
      // 写失败的原因（路径不存在 / 权限）常常**让读也失败**
      // ⇒ ⇒ 若回滚靠「再读一次磁盘」⇒ ⇒ 读到「什么都没有」
      // ⇒ ⇒ 用户**其它正常设置**会被一起抹掉 ⇒ ⇒ 比不回滚还糟。
      final cfg = AppConfigService();
      await cfg.init();
      await cfg.setTelencephalonBaseUrl('http://old.example.com:60080');
      await cfg.setAccentColor(0xFF00FF00);
      expect(cfg.accentColorValue, 0xFF00FF00);

      // 路径整个坏掉 ⇒ ⇒ **读也失败**。
      final broken = File('${tempDir.path}/no-such-dir/app_config.json');
      AppConfigService.configFileOverride = () async => broken;

      await cfg.setTelencephalonBaseUrl('http://new.example.com:60080');

      expect(cfg.lastSaveError, isNotNull);
      // ⚠️ 关键：**没被抹掉** ⇒ ⇒ 回滚到了「最后一次确认落盘的快照」。
      expect(cfg.accentColorValue, 0xFF00FF00);
      expect(cfg.telencephalonBaseUrl, 'http://old.example.com:60080');
    });

    test('孪生：写成功 ⇒ 没有错误（别把「没存上」当成常态）', () async {
      final cfg = AppConfigService();
      await cfg.init();
      await cfg.setTelencephalonBaseUrl('http://ok.example.com:60080');
      expect(cfg.lastSaveError, isNull);
      expect(cfg.telencephalonBaseUrl, 'http://ok.example.com:60080');
    });

    test('写失败后的一次成功写 ⇒ 错误被清掉（横幅不会赖着不走）',
        () async {
      final cfg = AppConfigService();
      await cfg.init();

      final broken = File('${tempDir.path}/no-such-dir/app_config.json');
      AppConfigService.configFileOverride = () async => broken;
      await cfg.setTelencephalonBaseUrl('http://x.example.com:60080');
      expect(cfg.lastSaveError, isNotNull);

      AppConfigService.configFileOverride = () async => tempFile;
      await cfg.setTelencephalonBaseUrl('http://y.example.com:60080');
      expect(cfg.lastSaveError, isNull);
    });
  });

  group('ConfigSaveErrorBanner', () {
    testWidgets('没有错误 ⇒ 不显示任何东西', (tester) async {
      AppConfigService().clearSaveError();
      await tester.pumpWidget(
        const MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(body: ConfigSaveErrorBanner()),
        ),
      );
      await tester.pump();
      expect(find.byType(ConfigSaveErrorBanner), findsOneWidget);
      expect(find.byIcon(Icons.error_outline), findsNothing);
    });

    testWidgets('有错误 ⇒ 显示出来（含原因），关掉后消失', (tester) async {
      // ⚠️ **真触发一次写失败**（不是往私有字段里塞值）⇒ ⇒
      // 横幅显示的是**真实链路**上的东西。
      //
      // ⚠️ **真实文件 IO 必须包在 [tester.runAsync] 里** —— testWidgets
      // 跑在 FakeAsync 里 ⇒ ⇒ 直接 await 文件操作会**永久挂住**
      // （flutter_tester 起来了、CPU 为 0 ⇒ ⇒ 看着像「在编译」）。
      final cfg = AppConfigService();
      await tester.runAsync(() async {
        await cfg.init();
        final broken = File('${tempDir.path}/no-such-dir/app_config.json');
        AppConfigService.configFileOverride = () async => broken;
        await cfg.setTelencephalonBaseUrl('http://x.example.com:60080');
      });
      expect(cfg.lastSaveError, isNotNull);

      await tester.pumpWidget(
        const MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(body: ConfigSaveErrorBanner()),
        ),
      );
      await tester.pump();

      expect(find.byIcon(Icons.error_outline), findsOneWidget);
      // ⚠️ 原因**原文**出现在界面上 ⇒ ⇒ 用户能据此判断（磁盘满？权限？）
      expect(find.textContaining('PathNotFoundException'), findsOneWidget);

      await tester.tap(find.byIcon(Icons.close));
      await tester.pump();
      expect(find.byIcon(Icons.error_outline), findsNothing);
    });

    testWidgets('写失败发生在横幅挂上之后 ⇒ 横幅也会亮（补挂的那一刀）',
        (tester) async {
      AppConfigService().clearSaveError();
      await tester.pumpWidget(
        const MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(body: ConfigSaveErrorBanner()),
        ),
      );
      await tester.pump();
      expect(find.byIcon(Icons.error_outline), findsNothing);

      // 横幅**已经**在树上 ⇒ ⇒ 之后的失败必须也能亮起来。
      final cfg = AppConfigService();
      await tester.runAsync(() async {
        await cfg.init();
        final broken = File('${tempDir.path}/no-such-dir/app_config.json');
        AppConfigService.configFileOverride = () async => broken;
        await cfg.setTelencephalonBaseUrl('http://y.example.com:60080');
      });

      await tester.pump();
      expect(find.byIcon(Icons.error_outline), findsOneWidget);
    });
  });
}
