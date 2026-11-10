import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/capabilities/capability.dart';
import 'package:shadow_mobile/services/capabilities/capability_declaration.dart';

/// **权限声明** —— agent 自己声明「这次需要哪些权限」，客户端**核对**它。
///
/// ⚠️ 这一层的**承重墙**是「声明**不能**放大权限」：
/// 真正要哪一档，永远由**工具**说了算 ⇒ ⇒ 声明只是核对，不是授权。
void main() {
  group('声明的词汇表', () {
    test('能力 → token 就是能力名（与落盘的、发给端脑的同源）', () {
      expect(capabilityPermissionToken(Capability.calendarRead), 'calendar_read');
      expect(capabilityPermissionToken(Capability.sms), 'sms');
    });

    test('普通工具 ⇒ 没有权限可要', () {
      expect(requiredPermissionsOf(null), isEmpty);
    });

    test('「手机操作」也是一档（它要的是无障碍服务那个开关）', () {
      expect(requiredPermissionsOf(Capability.mobileUse), ['mobile_use']);
    });
  });

  group('从参数里读声明', () {
    test('数组 ⇒ 逐个读', () {
      expect(
        declaredPermissionsOf({'required_permissions': ['calendar_read']}),
        ['calendar_read'],
      );
    });

    test('字符串 ⇒ 也认（模型偶尔只给一个）', () {
      expect(
        declaredPermissionsOf({'required_permissions': 'calendar_read'}),
        ['calendar_read'],
      );
    });

    test('乱填的类型 ⇒ 当作**没声明**（宽容，不惩罚老实人）', () {
      expect(declaredPermissionsOf({'required_permissions': 42}), isEmpty);
      expect(declaredPermissionsOf({'required_permissions': <String>['']}), isEmpty);
      expect(declaredPermissionsOf({}), isEmpty);
    });
  });

  group('核对声明', () {
    test('对得上 ⇒ matched', () {
      final d = evaluatePermissionDeclaration(
        capability: Capability.calendarRead,
        declared: ['calendar_read'],
      );
      expect(d.verdict, PermissionDeclarationVerdict.matched);
      expect(d.ok, isTrue);
    });

    test('没声明 ⇒ missing（老模型不知道有这一栏，不罚它）', () {
      final d = evaluatePermissionDeclaration(
        capability: Capability.calendarRead,
        declared: const [],
      );
      expect(d.verdict, PermissionDeclarationVerdict.missing);
      expect(d.ok, isTrue);
      expect(d.required, ['calendar_read']);
    });

    test('声明了**别的**那一档 ⇒ mismatch（越权，当场拦住）', () {
      final d = evaluatePermissionDeclaration(
        capability: Capability.calendarRead,
        declared: ['calendar_write'],
      );
      expect(d.verdict, PermissionDeclarationVerdict.mismatch);
      expect(d.ok, isFalse);
      expect(d.extra, ['calendar_write']);
      expect(d.required, ['calendar_read']);
    });

    test('普通工具声明了权限 ⇒ mismatch（它压根没有权限概念）', () {
      final d = evaluatePermissionDeclaration(
        capability: null,
        declared: ['calendar_read'],
      );
      expect(d.verdict, PermissionDeclarationVerdict.mismatch);
    });

    test('认不出来的 token ⇒ **宽容**（模型拼错了，不该断掉用户的请求）', () {
      final d = evaluatePermissionDeclaration(
        capability: Capability.calendarRead,
        declared: ['calender'],
      );
      expect(d.verdict, PermissionDeclarationVerdict.missing);
      expect(d.ok, isTrue);
      expect(d.extra, isEmpty);
      expect(d.unknown, ['calender']);
    });

    test('拼错了**又**越权 ⇒ 仍然 mismatch（越权那一半不能被宽容吞掉）', () {
      final d = evaluatePermissionDeclaration(
        capability: Capability.calendarRead,
        declared: ['calender', 'calendar_write'],
      );
      expect(d.verdict, PermissionDeclarationVerdict.mismatch);
      expect(d.ok, isFalse);
      expect(d.extra, ['calendar_write']);
      expect(d.unknown, ['calender']);
    });

    test('认对了、只是多带一个认不出来的 ⇒ 仍 matched（宽容那部分不拖累）', () {
      final d = evaluatePermissionDeclaration(
        capability: Capability.calendarRead,
        declared: ['calendar_read', 'calender'],
      );
      expect(d.verdict, PermissionDeclarationVerdict.matched);
      expect(d.ok, isTrue);
      expect(d.unknown, ['calender']);
    });
  });
}
