import 'dart:convert';
import 'dart:io';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/capabilities/capability_declaration.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';

/// **真模型输出 × 真判据** —— 把真模型填出来的声明喂进**真**闸。
///
/// ⚠️ 为什么把真模型的输出**固化成 fixture**：
/// 那次调用是**离线一次性**的（要凭据、要网络）⇒ ⇒ CI 上跑不了
/// ⇒ ⇒ 但「模型到底会不会填这一栏、填对不对」这件事
/// **不能只靠一次实测**就当结论 ⇒ ⇒ 把那次**真**输出逐字存下来
/// ⇒ ⇒ 当成 golden ⇒ ⇒ 以后只要**参数表**或**判据**动了 ⇒ ⇒ 这条回归就会红。
///
/// ⚠️ fixture 里的每一行都是模型**原样返回**的 arguments
/// ⇒ ⇒ **不是**手写的期望值 ⇒ ⇒ 它记的是「模型**实际**会怎么填」。
File _fixtureFile() {
  const rel = 'test/fixtures/capability_declaration_model_outputs.json';
  final candidates = <File>[
    File(rel),
    File('../$rel'),
    File('shadow-mobile/$rel'),
  ];
  for (final c in candidates) {
    if (c.existsSync()) return c;
  }
  throw StateError(
    '找不到 fixture「$rel」⇒ ⇒ 试过：'
    '${candidates.map((c) => c.path).join(' / ')}',
  );
}

ClientToolRegistry _registry() => buildMobileClientTools(
  setAccentColor: (Color c) async {},
  setDarkMode: (bool b) async {},
  fetchSurfaceEvents: (String view) async => const <Map<String, Object?>>[],
  // 图片生成的**纯运输**那一半 —— 单测给空壳（真调用在 generate_image 自己的测试里 mock）。
  generateImage: (_) async => <String, dynamic>{},
);

void main() {
  group('真模型输出（golden fixture）', () {
    test('八条真模型输出（六档能力）⇒ 真模型的声明**全部**被真闸放行', () {
      final data = jsonDecode(_fixtureFile().readAsStringSync());
      final cases = (data['cases'] as List).cast<Map<String, dynamic>>();
      expect(cases, hasLength(8), reason: '六档能力都要有真模型的实测输出');

      final registry = _registry();
      for (final c in cases) {
        final call = jsonDecode(c['raw'] as String) as Map<String, dynamic>;
        final name = call['name'] as String;
        final args = Map<String, dynamic>.from(call['arguments'] as Map);
        final tool = registry.lookup(name);
        expect(tool, isNotNull, reason: '模型叫了注册表里没有的工具：$name');

        final declared = declaredPermissionsOf(args);
        final verdict = evaluatePermissionDeclaration(
          capability: tool!.capability,
          declared: declared,
        );
        expect(
          verdict.ok,
          isTrue,
          reason: '真模型的声明被判成对不上：${c['id']}'
              ' ⇒ 结论=${verdict.verdict.name}'
              '（这个工具真正要的是 ${verdict.required}，模型说的是 $declared）',
        );
        expect(
          verdict.verdict,
          PermissionDeclarationVerdict.matched,
          reason: '真模型声明的是：$declared（要的是 ${verdict.required}）',
        );
      }
    });

    test('fixture 覆盖了**全部六档**能力（含「手机操作」那一档）', () {
      final data = jsonDecode(_fixtureFile().readAsStringSync());
      final cases = (data['cases'] as List).cast<Map<String, dynamic>>();
      final registry = _registry();
      final covered = <String>{};
      for (final c in cases) {
        final call = jsonDecode(c['raw'] as String) as Map<String, dynamic>;
        covered.add(registry.lookup(call['name'] as String)!.capability!.wire);
      }
      expect(covered, {
        'calendar_read',
        'calendar_write',
        'contacts',
        'sms',
        'photos',
        'mobile_use',
      });
    });
  });

  group('发给模型的那一份 tools 数组', () {
    test('每个能力工具都带 required_permissions，且 enum 就是它真实要的那一档', () {
      final registry = _registry();
      final tools = toOpenAiTools(registry);
      var checked = 0;
      final covered = <String>{};
      for (final t in tools) {
        final fn = (t['function'] as Map)['name'] as String;
        final capability = registry.lookup(fn)?.capability;
        if (capability == null) continue;
        checked++;
        covered.add(capability.wire);
        final params = (t['function'] as Map)['parameters'] as Map;
        final props = params['properties'] as Map;
        final decl = props[declaredPermissionsKey] as Map;
        final items = decl['items'] as Map;
        expect(
          items['enum'],
          requiredPermissionsOf(capability),
          reason: '$fn 的声明 enum 与它真实要的那一档对不上',
        );
      }
      expect(checked, 12, reason: '**每一个**能力工具都要被这一格点到');
      expect(
        covered,
        {
          'calendar_read',
          'calendar_write',
          'contacts',
          'sms',
          'photos',
          'notifications_read',
          'mobile_use',
        },
        reason: '七档能力都要在 tools 数组里向模型说清「要哪一档」',
      );
    });

    test('手机操作那 **6 个**工具**逐个**都带声明（不许只改一个）', () {
      final registry = _registry();
      final tools = toOpenAiTools(registry);
      final mobileUse = <String>{};
      for (final t in tools) {
        final fn = (t['function'] as Map)['name'] as String;
        final capability = registry.lookup(fn)?.capability;
        if (capability == null || capability.wire != 'mobile_use') continue;
        mobileUse.add(fn);
        final props =
            ((t['function'] as Map)['parameters'] as Map)['properties'] as Map;
        final decl = props[declaredPermissionsKey] as Map;
        expect(
          (decl['items'] as Map)['enum'],
          ['mobile_use'],
          reason: '\$fn 的声明 enum 与「手机操作」那一档对不上',
        );
      }
      expect(mobileUse, hasLength(6));
    });
    test('普通工具**不带**这一栏（它没有权限概念）', () {
      final registry = _registry();
      final tools = toOpenAiTools(registry);
      final theme = tools.firstWhere(
        (t) => (t['function'] as Map)['name'] == 'set_theme',
      );
      final props =
          ((theme['function'] as Map)['parameters'] as Map)['properties'] as Map;
      expect(props.containsKey(declaredPermissionsKey), isFalse);
    });
  });
}
