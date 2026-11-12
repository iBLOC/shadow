import 'dart:ui' show Color;

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';

/// 客户端工具注册表 —— **纯逻辑**那几块。
///
/// 这批代码（注册表 + 参数解析 + 颜色解析）没有 UI 依赖 ⇒ 可以直接
/// 单元测试，不用起 App、不用连端脑。
///
/// ⚠️ 测这几块的理由不是「覆盖率」，是**认错的后果太具体**：
/// - 参数形态认错 ⇒ 「把主题换成靛蓝」退化成「换成默认色」，**看不出哪里错了**；
/// - 颜色名乱猜 ⇒ 用户看到的主题色和模型说的完全不是一回事，而模型以为自己成功了。
void main() {
  group('parseToolArgs', () {
    test('字符串（JSON 文本）—— 端脑 `ToolCall.args` 的线上形态', () {
      final args = parseToolArgs('{"color":"#71717A"}');
      expect(args['color'], '#71717A');
    });

    test('对象 —— 有些路径传的是已经拆好的 map', () {
      final args = parseToolArgs({'color': '#71717A'});
      expect(args['color'], '#71717A');
    });

    test('空 / null ⇒ 空参数表（不是异常）', () {
      expect(parseToolArgs(null), isEmpty);
      expect(parseToolArgs(''), isEmpty);
      expect(parseToolArgs('   '), isEmpty);
    });

    test('不是 JSON 的字符串 ⇒ 当成纯文本参数，**不丢掉整个调用**', () {
      final args = parseToolArgs('靛蓝');
      expect(args['value'], '靛蓝');
    });

    test('JSON 但不是对象 ⇒ 同样包成 value', () {
      final args = parseToolArgs('123');
      expect(args['value'], 123);
    });
  });

  group('ClientToolRegistry', () {
    test('按名字查工具；查不到就是查不到', () {
      final registry = ClientToolRegistry([
        ClientTool(name: 'set_theme', description: 'x', execute: (_) async => null),
      ]);
      expect(registry.lookup('set_theme'), isNotNull);
      expect(registry.supports('set_theme'), isTrue);
      expect(registry.lookup('set_wallpaper'), isNull);
      expect(registry.supports('set_wallpaper'), isFalse);
      expect(registry.names, contains('set_theme'));
    });

    test('空注册表 ⇒ 什么都不会', () {
      final registry = ClientToolRegistry();
      expect(registry.names, isEmpty);
      expect(registry.supports('set_theme'), isFalse);
    });
  });

  /// 客户端工具的 **JSON Schema** —— 发给模型的那一份。
  ///
  /// 没有它，模型只知道有 `set_theme` 这个工具，不知道它要一个 `color`
  /// 还是 `dark` ⇒ 只能瞎猜，或者干脆不调。
  group('toOpenAiTools', () {
    ClientToolRegistry mobileRegistry() {
      return buildMobileClientTools(
        setAccentColor: (_) async {},
        setDarkMode: (_) async {},
        // ⚠️ 「取 surface」那一半在**另一个文件**里测（带真实 fixture）
        // ⇒ 这里给个空壳就够（这份只关心 `set_theme` 的形状）。
        fetchSurfaceEvents: (_) async => const [],
        // 图片生成的**纯运输**那一半 —— 同理给空壳（真调用在 generate_image 自己的测试里 mock）。
        generateImage: (_) async => <String, dynamic>{},
      );
    }

    test('导出成 OpenAI 的 function 形状', () {
      final tools = toOpenAiTools(mobileRegistry());
      expect(tools, isNotEmpty);
      for (final tool in tools) {
        expect(tool['type'], 'function');
        final fn = tool['function'] as Map;
        expect(fn['name'], isA<String>());
        expect(fn['description'], isA<String>());
        expect((fn['parameters'] as Map)['type'], 'object');
      }
    });

    /// ⚠️ **这段字面量是跨端的契约** —— 桌面端
    /// `src/lib/__tests__/clientTools.test.ts` 里有**一模一样**的一份。
    /// 两端发给模型的东西不一样 ⇒ 同一个模型在手机上和桌面上行为不一样
    /// ⇒ 哪一端漂移了，哪一端的这条测试就红。
    test('set_theme 的参数声明 —— color 是字符串、dark 是布尔', () {
      final tools = toOpenAiTools(mobileRegistry());
      final tool = tools.firstWhere((t) => (t['function'] as Map)['name'] == 'set_theme');
      final parameters = (tool['function'] as Map)['parameters'] as Map;

      expect(parameters, {
        'type': 'object',
        'properties': {
          'color': {
            'type': 'string',
            'description':
                'Hex colour in #RRGGBB form, e.g. #4F46E5. Use this to change the accent colour.',
          },
          'dark': {
            'type': 'boolean',
            'description':
                'true = switch to dark mode, false = switch to light mode. Use this when the user only asks for light/dark.',
          },
        },
      });
    });

    test('color 和 dark **都不是必填** —— 给哪个都算一次合法调用', () {
      final tools = toOpenAiTools(mobileRegistry());
      final tool = tools.firstWhere((t) => (t['function'] as Map)['name'] == 'set_theme');
      final parameters = (tool['function'] as Map)['parameters'] as Map;

      expect(parameters.containsKey('required'), isFalse);
    });

    test('没有 parameters 的工具 ⇒ 参数表是空的（不是 undefined）', () {
      final registry = ClientToolRegistry([
        ClientTool(name: 'ping', description: 'x', execute: (_) async => null),
      ]);
      final tools = toOpenAiTools(registry);

      expect((tools.first['function'] as Map)['parameters'], {
        'type': 'object',
        'properties': {},
      });
    });

    test('注册表是空的 ⇒ 没有工具可导出', () {
      expect(toOpenAiTools(ClientToolRegistry()), isEmpty);
    });
  });

  group('set_theme 的执行契约', () {
    ClientToolRegistry registryWith({
      void Function(Color)? onColor,
      void Function(bool)? onDark,
    }) {
      return buildMobileClientTools(
        setAccentColor: (c) async => onColor?.call(c),
        setDarkMode: (d) async => onDark?.call(d),
        fetchSurfaceEvents: (_) async => const [],
        generateImage: (_) async => <String, dynamic>{},
      );
    }

    test('带合法颜色 ⇒ 换主题色', () async {
      Color? applied;
      final registry = registryWith(onColor: (c) => applied = c);

      final tool = registry.lookup('set_theme')!;
      final result = await tool.execute({'color': '#71717A'});

      expect(applied, isNotNull);
      expect(applied!.toARGB32(), const Color(0xFF71717A).toARGB32());
      expect((result as Map)['applied'], 'accent');
    });

    test('不带 `#` 的 6 位 hex 也认', () async {
      Color? applied;
      final registry = registryWith(onColor: (c) => applied = c);

      await registry.lookup('set_theme')!.execute({'color': '71717A'});
      expect(applied!.toARGB32(), const Color(0xFF71717A).toARGB32());
    });

    test('8 位（ARGB）**丢掉 alpha** —— 与桌面端 `parseHexColor` 一致', () async {
      Color? applied;
      final registry = registryWith(onColor: (c) => applied = c);

      await registry.lookup('set_theme')!.execute({'color': '#80717A7A'});

      // 两端必须一样：桌面端把 `#AARRGGBB` 归一成 `#RRGGBB`
      // （主题色带透明度没有意义 —— 会跟背景混色）。
      // 以前移动端保留 alpha、桌面端丢掉 ⇒ 同一个颜色两端显示不一样。
      expect(applied!.toARGB32(), const Color(0xFF717A7A).toARGB32());
    });

    test('`dark` ⇒ 切明暗（不走换色那条路）', () async {
      var darkApplied = false;
      final registry = registryWith(onDark: (d) => darkApplied = d);

      final result = await registry.lookup('set_theme')!.execute({'dark': true});
      expect(darkApplied, isTrue);
      expect((result as Map)['applied'], 'mode');
    });

    test('参数认不出来 ⇒ **明确失败**，不默默什么也不做', () async {
      final registry = registryWith();

      // ⚠️ 抛异常 = 执行失败 ⇒ 错误会回传给端脑，模型知道自己这条路走不通，
      // 而不是卡在等结果上。
      expect(
        () => registry.lookup('set_theme')!.execute({'nope': 1}),
        throwsA(isA<FormatException>()),
      );
    });

    test('认不出的颜色名**不猜** ⇒ 报错，而不是换个默认色', () async {
      Color? applied;
      final registry = registryWith(onColor: (c) => applied = c);

      expect(
        () => registry.lookup('set_theme')!.execute({'color': 'indigo'}),
        throwsA(isA<FormatException>()),
      );
      expect(applied, isNull, reason: '猜错一次，用户看到的主题色就和模型说的不是一回事');
    });
  });
}
