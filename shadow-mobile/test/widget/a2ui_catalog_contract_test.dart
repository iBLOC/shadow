import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/a2ui/shadow_catalog.dart';

import '../support/a2ui_fixture.dart';

/// **发布出去**的那份目录契约（父仓 `a2ui/catalogs/v1/catalog.json`）。
///
/// ⚠️ **它不是手写的** —— 它是本仓**发布**出去的那份目录契约
/// （端脑在每个业务组件上写 `catalogId` 指它）。
/// ⇒ ⇒ 而两个客户端各自在**代码里**注册了同一份目录
/// （移动端 `shadow_catalog.dart`、桌面端 `a2uiProtocol.ts`）
/// ⇒ ⇒ **三份必须逐字一致**，否则：
///
///   · 外部消费者按**发布那份**渲染 ⇒ 端脑发来的一个枚举值被目录拒掉
///     ⇒ ⇒ 官方 SDK 整条拒收 ⇒ ⇒ **界面什么都没有，且不报错**；
///   · 客户端按**自己那份**校验 ⇒ 于是「发布出去的契约」在骗人。
Map<String, Object?> readPublishedCatalog() {
  const relative = 'a2ui/catalogs/v1/catalog.json';
  final candidates = <File>[
    File('../$relative'),
    File('../../$relative'),
    File(relative),
  ];
  for (final candidate in candidates) {
    if (candidate.existsSync()) {
      final decoded = jsonDecode(candidate.readAsStringSync());
      if (decoded is Map) return Map<String, Object?>.from(decoded);
    }
  }
  throw StateError(
    '找不到发布目录契约。试过：${candidates.map((f) => f.path).join(' | ')}'
    '（当前工作目录 ${Directory.current.path}）',
  );
}

/// 端脑真字节里的**每一个组件**（含官方基础目录的那些）。
List<Map<String, Object?>> componentsOfRealBytes() {
  final out = <Map<String, Object?>>[];
  for (final event in a2uiFixtureEvents()) {
    final result = event['result'];
    if (result is! Map) continue;
    final status = result['status'];
    if (status is! Map) continue;
    final message = status['message'];
    if (message is! Map) continue;
    final parts = message['parts'];
    if (parts is! List) continue;
    for (final part in parts) {
      if (part is! Map) continue;
      if (part['kind'] != 'data') continue;
      final data = part['data'];
      if (data is! Map) continue;
      final create = data['createSurface'];
      if (create is! Map) continue;
      final components = create['components'];
      if (components is! List) continue;
      for (final component in components) {
        if (component is Map) out.add(Map<String, Object?>.from(component));
      }
    }
  }
  return out;
}

void main() {
  final published = readPublishedCatalog();
  final catalog = shadowCatalog();
  final publishedComponents = (published['components'] as Map<String, Object?>);

  group('发布目录契约（a2ui/catalogs/v1/catalog.json）', () {
    test('catalogId 与移动端注册的那份逐字一致', () {
      expect(published['catalogId'], shadowCatalogId);
      expect(catalog.id, shadowCatalogId);
    });

    test('协议版本是裸 semver「1.0」（官方 CatalogApi.fromJson 的形状）', () {
      expect(published['protocolVersion'], '1.0');
    });

    test('组件集合与移动端目录一致', () {
      expect(
        publishedComponents.keys.toSet(),
        catalog.components.keys.toSet(),
        reason: '发布出去的目录与移动端注册的目录必须是一份',
      );
    });

    test('每个组件的属性集 / 必填集 / 枚举 与移动端实现一致', () {
      for (final entry in catalog.components.entries) {
        final schema = Map<String, Object?>.from(entry.value.schema.value);
        final properties = Map<String, Object?>.from(schema['properties'] as Map);
        final publishedSchema =
            Map<String, Object?>.from(publishedComponents[entry.key] as Map);
        final publishedProperties =
            Map<String, Object?>.from(publishedSchema['properties'] as Map);

        expect(
          publishedProperties.keys.toSet(),
          properties.keys.toSet(),
          reason: '${entry.key} 的属性集',
        );
        expect(
          (publishedSchema['required'] as List).toSet(),
          (schema['required'] as List).toSet(),
          reason: '${entry.key} 的必填集',
        );
        for (final property in properties.entries) {
          final local = Map<String, Object?>.from(property.value as Map);
          if (!local.containsKey('enum')) continue;
          final remote =
              Map<String, Object?>.from(publishedProperties[property.key] as Map);
          expect(
            (remote['enum'] as List).toList(),
            (local['enum'] as List).toList(),
            reason: '${entry.key}.${property.key} 的枚举',
          );
        }
      }
    });

    test('发布契约**接受**端脑真字节里的每一个业务组件', () {
      final business = componentsOfRealBytes()
          .where((c) => c['catalogId'] == shadowCatalogId)
          .toList();
      expect(business, isNotEmpty, reason: '真字节里至少要有一个业务组件');

      for (final component in business) {
        final type = component['component'] as String;
        final schema = publishedComponents[type];
        expect(schema, isNotNull, reason: '发布目录里必须有 $type');

        final publishedSchema = Map<String, Object?>.from(schema as Map);
        final properties = Map<String, Object?>.from(publishedSchema['properties'] as Map);

        // ① 类型自证：目录里声明的 component 常量必须就是那个类型。
        final declared =
            Map<String, Object?>.from(properties['component'] as Map);
        expect(declared['const'], type, reason: '$type 的 component 常量');

        // ② 必填都在。
        for (final required in publishedSchema['required'] as List) {
          expect(
            component.containsKey(required),
            isTrue,
            reason: '$type 少了必填字段 $required',
          );
        }

        // ③ 每个取值都在枚举里（枚举少一档 ⇒ 官方 SDK 整条拒收）。
        for (final property in properties.entries) {
          final declaredSchema = Map<String, Object?>.from(property.value as Map);
          if (!declaredSchema.containsKey('enum')) continue;
          if (!component.containsKey(property.key)) continue;
          final values = (declaredSchema['enum'] as List).map((v) => v.toString());
          expect(
            values,
            contains(component[property.key].toString()),
            reason: '$type.${property.key} 的取值不在发布枚举里',
          );
        }
      }
    });
  });
}
