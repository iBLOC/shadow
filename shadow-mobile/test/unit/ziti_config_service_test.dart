import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/ziti_config_service.dart';

/// 身份 JSON 的最小可用形状（三个 PEM 全内联）。
String identityJson({
  String ztApi = 'https://ctl:1280/edge/client/v1',
  String? id = 'abc',
  String ca = '-----BEGIN CERTIFICATE-----\nCA\n-----END CERTIFICATE-----',
  String cert = '-----BEGIN CERTIFICATE-----\nCERT\n-----END CERTIFICATE-----',
  String key = '-----BEGIN EC PRIVATE KEY-----\nKEY\n-----END EC PRIVATE KEY-----',
}) {
  final map = <String, dynamic>{
    'ztAPI': ztApi,
    'ca': ca,
    'cert': cert,
    'key': key,
  };
  if (id != null) {
    map['id'] = id;
  }
  return jsonEncode(map);
}

void main() {
  late Directory tempDir;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('ziti-config-test');
    ZitiConfigService.rootDirOverride = () async => tempDir;
  });

  tearDown(() async {
    ZitiConfigService.rootDirOverride = null;
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  group('ZitiConfigService —— 落盘与读取', () {
    test('没配过时是「不走零信任」', () async {
      final config = await ZitiConfigService().load();
      expect(config.mode, ZitiMode.off);
      expect(config.service, '');
      expect(config.identityPath, isNull);
      expect(config.hasIdentity, isFalse);
      expect(config.isComplete, isFalse);
    });

    test('save 后 load 回来一样（模式 + 服务名 + 身份路径）', () async {
      final service = ZitiConfigService();
      await service.save(
        const ZitiConfig(
          mode: ZitiMode.client,
          service: 'shadow-brain',
          identityPath: '/data/x/id.json',
        ),
      );
      final loaded = await service.load();
      expect(loaded.mode, ZitiMode.client);
      expect(loaded.service, 'shadow-brain');
      expect(loaded.identityPath, '/data/x/id.json');
      expect(loaded.isComplete, isTrue);
    });

    test('坏文件当成「没配」（不抛、不半生效）', () async {
      await File('${tempDir.path}/ziti.json').writeAsString('{not json');
      final config = await ZitiConfigService().load();
      expect(config.mode, ZitiMode.off);
      expect(config.isComplete, isFalse);
    });

    test('认不得的 mode 一律回落 off（不猜）', () async {
      await File('${tempDir.path}/ziti.json').writeAsString(
        jsonEncode({'mode': 'publish-everything', 'service': 'x'}),
      );
      final config = await ZitiConfigService().load();
      expect(config.mode, ZitiMode.off);
    });

    test('模式字面量是固定的那三个（不靠 enum 顺序）', () {
      expect(zitiModeWire(ZitiMode.off), 'off');
      expect(zitiModeWire(ZitiMode.client), 'client');
      expect(zitiModeWire(ZitiMode.server), 'server');
      expect(zitiModeFromWire('client'), ZitiMode.client);
      expect(zitiModeFromWire('nope'), isNull);
    });
  });

  group('ZitiConfigService —— 粘贴导入身份', () {
    test('内联 PEM 的身份能导入，并落成标准身份文件', () async {
      final service = ZitiConfigService();
      final result = await service.importIdentity(identityJson());

      expect(result.summary.ztApi, 'https://ctl:1280/edge/client/v1');
      expect(result.summary.id, 'abc');
      expect(result.summary.hasCa, isTrue);
      expect(result.summary.hasCert, isTrue);
      expect(result.summary.hasKey, isTrue);

      // ⚠️ 落成的是**标准形状**：id.json + 三个 PEM，id.json 用相对路径引用
      // ⇒ ⇒ Rust 侧 Identity::load 原样就能读。
      final idFile = File(result.identityPath);
      expect(await idFile.exists(), isTrue);
      final decoded = jsonDecode(await idFile.readAsString());
      expect(decoded['ztAPI'], 'https://ctl:1280/edge/client/v1');
      expect(decoded['ca'], 'ca.pem');
      expect(decoded['cert'], 'cert.pem');
      expect(decoded['key'], 'key.pem');

      for (final name in ['ca.pem', 'cert.pem', 'key.pem']) {
        final f = File('${tempDir.path}/ziti/$name');
        expect(await f.exists(), isTrue, reason: '$name 应该落盘');
      }
      expect(
        (await File('${tempDir.path}/ziti/ca.pem').readAsString())
            .startsWith('-----BEGIN CERTIFICATE-----'),
        isTrue,
      );
    });

    test('导入完摘要能被读回来（非秘密）', () async {
      final service = ZitiConfigService();
      final result = await service.importIdentity(identityJson());
      await service.save(
        ZitiConfig(
          mode: ZitiMode.client,
          service: 'shadow-brain',
          identityPath: result.identityPath,
        ),
      );
      final summary = await service.currentIdentitySummary();
      expect(summary, isNotNull);
      expect(summary!.ztApi, 'https://ctl:1280/edge/client/v1');
      expect(summary.id, 'abc');
      expect(summary.hasKey, isTrue);
    });

    test('不是 JSON ⇒ 明确报错', () async {
      expect(
        () => ZitiConfigService().importIdentity('hello'),
        throwsA(isA<ZitiConfigException>()),
      );
    });

    test('缺 ztAPI ⇒ 明确报错（不静默）', () async {
      expect(
        () => ZitiConfigService().importIdentity(
          jsonEncode({'ca': '-----BEGIN CERTIFICATE-----', 'cert': '-----BEGIN CERTIFICATE-----', 'key': '-----BEGIN EC PRIVATE KEY-----'}),
        ),
        throwsA(
          isA<ZitiConfigException>().having(
            (e) => e.message,
            'message',
            contains('ztAPI'),
          ),
        ),
      );
    });

    test('缺 key ⇒ 明确报错并点名是哪个键', () async {
      expect(
        () => ZitiConfigService().importIdentity(
          jsonEncode({'ztAPI': 'https://ctl:1280', 'ca': '-----BEGIN CERTIFICATE-----', 'cert': '-----BEGIN CERTIFICATE-----'}),
        ),
        throwsA(
          isA<ZitiConfigException>().having(
            (e) => e.message,
            'message',
            contains('key'),
          ),
        ),
      );
    });

    test('⚠️ 写成文件路径的 ca ⇒ 明确报错（那台机器上没有那个文件）', () async {
      expect(
        () => ZitiConfigService().importIdentity(
          identityJson(ca: 'ca.pem'),
        ),
        throwsA(
          isA<ZitiConfigException>().having(
            (e) => e.message,
            'message',
            contains('ca'),
          ),
        ),
      );
    });

    test('空内容 ⇒ 明确报错', () async {
      expect(
        () => ZitiConfigService().importIdentity('   '),
        throwsA(isA<ZitiConfigException>()),
      );
    });
  });

  group('ZitiConfigService —— 删除身份', () {
    test('删完身份文件没了，模式与服务名留着', () async {
      final service = ZitiConfigService();
      final result = await service.importIdentity(identityJson());
      await service.save(
        ZitiConfig(
          mode: ZitiMode.server,
          service: 'shadow-brain',
          identityPath: result.identityPath,
        ),
      );

      await service.clearIdentity();

      final config = await service.load();
      expect(config.mode, ZitiMode.server);
      expect(config.service, 'shadow-brain');
      expect(config.identityPath, isNull);
      expect(await File(result.identityPath).exists(), isFalse);
      expect(await service.currentIdentitySummary(), isNull);
    });
  });
}
