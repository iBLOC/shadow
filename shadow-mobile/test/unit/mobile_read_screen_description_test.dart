import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/services/capabilities/capability_tools.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';

/// **工具描述的口径** —— 模型**唯一**能看到的说明。
///
/// ## 为什么这组用例存在
///
/// 2026-11-11 真机实测（odin ee6b4832 · MIUI 14）打掉了一条老假设：
/// **自家 app 在前台时，读屏走的是「原生那棵树」** ⇒ ⇒ 逐字
/// `source=android-a11y`（**不是** `flutter-semantics`）。
///
/// ⇒ ⇒ 而当时的描述写的是「`android-a11y` for **another app**」
/// ⇒ ⇒ **把「哪棵树」说成了「谁的屏」**
/// ⇒ ⇒ 模型照着它推理 ⇒ ⇒ 推理错 ⇒ ⇒ 而工具**返回值是对的**
/// ⇒ ⇒ ⇒ 「失败长得像成功」。
///
/// ## 为什么判据对着**性质**判，不对着某次读数判
///
/// ⇒ ⇒ 「自家 app 在前台时走哪棵树」是**平台行为**（odin 上是原生那棵，
/// 别的机型可能不同）⇒ ⇒ 钉死某个值 = 钉死某个环境下的事实。
/// ⇒ ⇒ ⇒ 这组用例钉的是**三格口径必须分得开**：
///
/// | 字段 | 答的是 |
/// |---|---|
/// | `source` | **哪棵树**（android-a11y / flutter-semantics） |
/// | `coordinateSpace` | **坐标怎么读**（screen 整屏 / view 本窗口） |
/// | `foregroundPackage` | **谁的屏**（包名 / null ＝ 读不到） |
///
/// ⇒ ⇒ 三格**各答一件事** ⇒ ⇒ 模型不会拿「哪棵树」去推「谁的屏」。
void main() {
  /// 把注册表里 `mobile_read_screen` 那一条的描述取出来。
  String readScreenDescription() {
    final ClientToolRegistry registry = buildMobileClientTools(
      setAccentColor: (_) async {},
      setDarkMode: (_) async {},
      fetchSurfaceEvents: (_) async => const [],
    );
    final ClientTool tool = registry.lookup('mobile_read_screen')!;
    return tool.description;
  }

  group('mobile_read_screen 的描述口径（2026-11-11 真机取证）', () {
    test('**三格都点到名** —— 模型得知道去读哪一格', () {
      final String desc = readScreenDescription();
      expect(desc, contains('source'), reason: '描述里没有 source 这一格');
      expect(desc, contains('coordinateSpace'), reason: '描述里没有 coordinateSpace 这一格');
      expect(
        desc,
        contains('foregroundPackage'),
        reason: '描述里没有 foregroundPackage 这一格 ⇒ ⇒ 模型不知道「这是谁的屏」读哪一格',
      );
    });

    test('**两个 source 取值都点到名** —— 少一个，模型就认不出那一棵树', () {
      final String desc = readScreenDescription();
      expect(desc, contains(kScreenSourceAndroidA11y));
      expect(desc, contains(kScreenSourceFlutterSemantics));
    });

    test('**不许把 source 说成「谁的屏」** —— 那是 `foregroundPackage` 那一格', () {
      final String desc = readScreenDescription();
      for (final String value in <String>[
        kScreenSourceAndroidA11y,
        kScreenSourceFlutterSemantics,
      ]) {
        final int at = desc.indexOf(value);
        expect(at, greaterThan(-1), reason: '描述里没有提到 $value');
        // ⚠️ 只看**紧挨着**的那一小段 ⇒ ⇒ 不误伤后面「归属的**正确**出处」。
        final String tail = desc.substring(at);
        final int stop = tail.indexOf('.');
        final String clause = stop > 0 ? tail.substring(0, stop) : tail;
        for (final String owner in <String>[
          'another app',
          'other app',
          'a different app',
          'someone else',
        ]) {
          expect(
            clause.toLowerCase(),
            isNot(contains(owner)),
            reason: '描述把 source「$value」说成了「谁的屏」（紧跟着「$owner」）'
                ' ⇒ ⇒ source 答的是「哪棵树」⇒ ⇒ 模型会按错的归属选动作',
          );
        }
      }
    });

    test('**归属的正确出处**必须点名 —— 不然模型没有依据', () {
      final String desc = readScreenDescription();
      expect(
        desc,
        contains('foregroundPackage'),
        reason: '「这是谁的屏」那一格没被点名 ⇒ ⇒ 模型无从判断这是谁家的屏',
      );
    });
  });
}
