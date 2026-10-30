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

  group('set_theme 的执行契约', () {
    ClientToolRegistry registryWith({
      void Function(Color)? onColor,
      void Function(bool)? onDark,
    }) {
      return buildMobileClientTools(
        setAccentColor: (c) async => onColor?.call(c),
        setDarkMode: (d) async => onDark?.call(d),
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
