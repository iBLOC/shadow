import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations_en.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations_zh.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';

/// 客户端工具 `generate_image` —— **「模型在对话里点名要画一张图」**那条路。
///
/// ## 为什么钉它
///
/// 端脑把客户端声明的 `tools` 交给模型，模型决定调用时端脑发 `tool_call`，
/// **设备执行**（这里 = 打端脑的图片生成门面），结果回传端脑喂回模型。
///
/// ⚠️ **契约**（两端逐字一致）：
/// 执行结果 = `{ report, images }`
/// ⇒ `images` 是**给界面**的那一半（`tool_call_card` 渲染）；
/// `report` 是**给模型**的那一句（`pickReportPayload` 只放行它）
/// ⇒ **base64 不进模型上下文**。
///
/// ⚠️ **report 走真 l10n**（用户也看得见）⇒ 与桌面端
/// `clientTools.imageGenerated` 同键同文（桌面 vitest 会互读比对）。
void main() {
  ClientToolRegistry registryWith({
    required Future<Map<String, dynamic>> Function(Map<String, dynamic> body) generateImage,
    AppLocalizations Function()? l10nProvider,
  }) {
    return buildMobileClientTools(
      setAccentColor: (_) async {},
      setDarkMode: (_) async {},
      fetchSurfaceEvents: (_) async => const [],
      l10nProvider: l10nProvider,
      generateImage: generateImage,
    );
  }

  group('generate_image', () {
    test('进了注册表，且导出参数表带必填 prompt', () {
      final registry = registryWith(generateImage: (_) async => <String, dynamic>{});
      final tool = registry.lookup('generate_image');
      expect(tool, isNotNull);
      final openai = toOpenAiTools(registry).firstWhere(
        (t) => t['function']['name'] == 'generate_image',
      );
      final params = openai['function']['parameters'] as Map<String, dynamic>;
      expect(params['type'], 'object');
      expect((params['properties'] as Map).keys.toSet(), {'prompt', 'size', 'model'});
      expect(params['required'], ['prompt']);
    });

    test('执行成功：report = l10n 那一句（不带 base64），images 带字节形状', () async {
      final requests = <Map<String, dynamic>>[];
      final registry = registryWith(
        l10nProvider: AppLocalizationsZh.new,
        generateImage: (body) async {
          requests.add(body);
          return {
            'created': 1,
            'data': [
              {'b64_json': 'QUJD', 'size': '512x512', 'seed': 1},
            ],
          };
        },
      );
      final result = await registry.lookup('generate_image')!.execute({
        'prompt': '一只青色的日蚀',
        'size': '512x512',
      }) as Map<String, dynamic>;

      // ⚠️ 调的是**端脑门面**的运输那一半，body 原样带上（size 给了才带）。
      expect(requests, hasLength(1));
      expect(requests.single['prompt'], '一只青色的日蚀');
      expect(requests.single['size'], '512x512');
      expect(requests.single.containsKey('model'), isFalse);

      final report = result['report'] as String;
      expect(report, AppLocalizationsZh().clientToolsImageGenerated(1, '512x512'));
      // ⚠️ **base64 不许混进 report**（那一半走 images 给界面）。
      expect(report.contains('QUJD'), isFalse);

      final images = result['images'] as List;
      expect(images, hasLength(1));
      expect(images.first, {
        'b64': 'QUJD',
        'size': '512x512',
        'mime': 'image/png',
      });
    });

    test('report 随语言走（英文系统 ⇒ 英文那句）', () async {
      final registry = registryWith(
        l10nProvider: AppLocalizationsEn.new,
        generateImage: (_) async => {
          'created': 1,
          'data': [
            {'b64_json': 'QUJD', 'size': '1024x1024', 'seed': 2},
          ],
        },
      );
      final result = await registry.lookup('generate_image')!.execute(
        {'prompt': 'x'},
      ) as Map<String, dynamic>;
      expect(
        result['report'],
        AppLocalizationsEn().clientToolsImageGenerated(1, '1024x1024'),
      );
    });

    test('size / model 空白 ⇒ 不带（本地默认值不外塞）', () async {
      final requests = <Map<String, dynamic>>[];
      final registry = registryWith(generateImage: (body) async {
        requests.add(body);
        return {'created': 1, 'data': const []};
      });
      await registry.lookup('generate_image')!.execute({
        'prompt': 'x',
        'size': '   ',
        'model': '  ',
      });
      expect(requests.single.containsKey('size'), isFalse);
      expect(requests.single.containsKey('model'), isFalse);
    });

    test('空 prompt ⇒ 明确失败（不默默什么也不做）', () async {
      var called = 0;
      final registry = registryWith(generateImage: (_) async {
        called += 1;
        return <String, dynamic>{};
      });
      await expectLater(
        registry.lookup('generate_image')!.execute({}),
        throwsFormatException,
      );
      await expectLater(
        registry.lookup('generate_image')!.execute({'prompt': '   '}),
        throwsFormatException,
      );
      expect(called, 0, reason: '失败发生在打端脑**之前**');
    });
  });

  group('imageAttachmentBytesOf（图片附件解字节）', () {
    test('认 { images: [{b64}] }，解不动的跳过', () {
      final valid = 'QUJD'; // "ABC"
      final bytes = imageAttachmentBytesOf({
        'images': [
          {'b64': valid},
          {'b64': '!!!不是base64!!!'},
          null,
          'junk',
          {'size': 'no-b64'},
        ],
      });
      expect(bytes, hasLength(1));
    });

    test('非对象 / 没有 images ⇒ 空列表（不是抛错）', () {
      expect(imageAttachmentBytesOf(null), isEmpty);
      expect(imageAttachmentBytesOf('text'), isEmpty);
      expect(imageAttachmentBytesOf(<String, dynamic>{}), isEmpty);
      expect(imageAttachmentBytesOf({'images': 'nope'}), isEmpty);
    });
  });
}
