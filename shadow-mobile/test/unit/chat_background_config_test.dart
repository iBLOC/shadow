import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/app_config_service.dart';

/// chatBackgroundPath 的落盘往返 —— 与 test/app_config_service_test.dart
/// 同一范式：configFileOverride 指临时文件，init() 强制重读 ⇒ 真读盘。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory tempDir;
  late File tempFile;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('chat_bg_config_test_');
    tempFile = File('${tempDir.path}/app_config.json');
    AppConfigService.configFileOverride = () async => tempFile;
  });

  tearDown(() async {
    AppConfigService.configFileOverride = null;
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  group('AppConfigService — chatBackgroundPath', () {
    test('defaults to null when no config file exists', () async {
      final cfg = AppConfigService();
      await cfg.init();
      expect(cfg.chatBackgroundPath, isNull);
    });

    test('setChatBackgroundPath persists across reload', () async {
      const path = '/data/user/0/com.ibloc.shadow/app_flutter/bg.webp';
      final cfg = AppConfigService();
      await cfg.init();
      await cfg.setChatBackgroundPath(path);
      expect(cfg.chatBackgroundPath, path);

      // init() always re-reads the file, so this is a real reload.
      final cfg2 = AppConfigService();
      await cfg2.init();
      expect(cfg2.chatBackgroundPath, path);
    });

    test('empty string clears the persisted value (no empty shell)', () async {
      final cfg = AppConfigService();
      await cfg.init();
      await cfg.setChatBackgroundPath('/tmp/bg.webp');
      await cfg.setChatBackgroundPath('');
      expect(cfg.chatBackgroundPath, isNull);

      final cfg2 = AppConfigService();
      await cfg2.init();
      expect(cfg2.chatBackgroundPath, isNull);
    });

    test('null clears the persisted value', () async {
      final cfg = AppConfigService();
      await cfg.init();
      await cfg.setChatBackgroundPath('/tmp/bg.webp');
      await cfg.setChatBackgroundPath(null);
      expect(cfg.chatBackgroundPath, isNull);
    });

    test('clearing the background keeps other config keys intact', () async {
      final cfg = AppConfigService();
      await cfg.init();
      await cfg.setTelencephalonBaseUrl('http://192.168.1.50:60080');
      await cfg.setChatBackgroundPath('/tmp/bg.webp');
      await cfg.setChatBackgroundPath(null);

      final cfg2 = AppConfigService();
      await cfg2.init();
      expect(cfg2.telencephalonBaseUrl, 'http://192.168.1.50:60080');
      expect(cfg2.chatBackgroundPath, isNull);
    });

    test(
      'missing chatBackgroundPath key in an existing file is fine',
      () async {
        await tempFile.writeAsString('{"telencephalonBaseUrl": "http://x:1"}');
        final cfg = AppConfigService();
        await cfg.init();
        expect(cfg.chatBackgroundPath, isNull);
        expect(cfg.telencephalonBaseUrl, 'http://x:1');
      },
    );
  });
}
