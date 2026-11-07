import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/app_config_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory tempDir;
  late File tempFile;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('app_config_test_');
    tempFile = File('${tempDir.path}/app_config.json');
    AppConfigService.configFileOverride = () async => tempFile;
  });

  tearDown(() async {
    AppConfigService.configFileOverride = null;
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  group('AppConfigService — telencephalon config', () {
    test('defaults are null when no config file exists', () async {
      final cfg = AppConfigService();
      await cfg.init();
      expect(cfg.telencephalonBaseUrl, isNull);
      expect(cfg.telencephalonAdminToken, isNull);
    });

    test('setTelencephalonBaseUrl persists across reload', () async {
      final cfg = AppConfigService();
      await cfg.init();
      await cfg.setTelencephalonBaseUrl('http://192.168.1.50:60080');
      expect(cfg.telencephalonBaseUrl, 'http://192.168.1.50:60080');

      // init() always re-reads the file, so this is a real reload
      final cfg2 = AppConfigService();
      await cfg2.init();
      expect(cfg2.telencephalonBaseUrl, 'http://192.168.1.50:60080');
    });

    test('setTelencephalonAdminToken persists across reload', () async {
      final cfg = AppConfigService();
      await cfg.init();
      await cfg.setTelencephalonAdminToken('secret-token-xyz');
      expect(cfg.telencephalonAdminToken, 'secret-token-xyz');

      final cfg2 = AppConfigService();
      await cfg2.init();
      expect(cfg2.telencephalonAdminToken, 'secret-token-xyz');
    });

    test('passing empty/blank URL clears the persisted value', () async {
      final cfg = AppConfigService();
      await cfg.init();
      await cfg.setTelencephalonBaseUrl('http://example.com:60080');
      expect(cfg.telencephalonBaseUrl, 'http://example.com:60080');

      await cfg.setTelencephalonBaseUrl('');
      expect(cfg.telencephalonBaseUrl, isNull);

      final cfg2 = AppConfigService();
      await cfg2.init();
      expect(cfg2.telencephalonBaseUrl, isNull);
    });

    test('passing empty/blank token clears the persisted value', () async {
      final cfg = AppConfigService();
      await cfg.init();
      await cfg.setTelencephalonAdminToken('first-token');
      await cfg.setTelencephalonAdminToken('');
      expect(cfg.telencephalonAdminToken, isNull);
    });

    test('malformed JSON file does not crash; defaults are kept', () async {
      await tempFile.writeAsString('this is not valid json');
      final cfg = AppConfigService();
      await cfg.init();
      expect(cfg.telencephalonBaseUrl, isNull);
      expect(cfg.telencephalonAdminToken, isNull);
    });

    test('concurrent reloads from the same file do not lose data', () async {
      final cfg = AppConfigService();
      await cfg.init();
      await cfg.setTelencephalonBaseUrl('http://localhost:60080');
      await cfg.setTelencephalonAdminToken('admin-token');

      // Simulate two parallel re-reads
      final cfgA = AppConfigService();
      final cfgB = AppConfigService();
      await Future.wait([cfgA.init(), cfgB.init()]);
      expect(cfgA.telencephalonBaseUrl, 'http://localhost:60080');
      expect(cfgB.telencephalonBaseUrl, 'http://localhost:60080');
      expect(cfgA.telencephalonAdminToken, 'admin-token');
      expect(cfgB.telencephalonAdminToken, 'admin-token');
    });
  });
}