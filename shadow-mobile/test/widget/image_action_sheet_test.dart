import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/services/client_tools/client_tool_registry.dart';
import 'package:shadow_mobile/services/media/media_actions.dart';
import 'package:shadow_mobile/widgets/chat/image_action_sheet.dart';
import 'package:shadow_mobile/widgets/chat/tool_call_card.dart';

import 'test_helper.dart';

/// 「聊天里的图片长按 ⇒ ⇒ **保存到相册 / 分享到微信**」（2026-11-17）。
///
/// ## 这一刀要钉住的是哪几格
///
/// ❶ **长按真的弹得出菜单**（菜单里有那两项）—— 界面那一层。
/// ❷ **点了菜单项 ⇒ ⇒ 真的打到了宿主那一侧**（通道收到了**字节**）—— 这一格
///    才是「按钮不是摆设」；只钉「菜单画出来了」是**假绿**。
/// ❸ **失败不许长得像成功**：宿主说失败（权限不够／写盘失败）⇒ ⇒ 界面说
///    「保存失败：…」⇒ ⇒ **不许**说「已保存」。
/// ❹ **没装微信不许说「已分享到微信」** ⇒ ⇒ 宿主会带回「走的是系统分享
///    面板」⇒ ⇒ 界面必须照实说。
/// ❺ **文件名的扩展名按字节的魔数来**（JPEG 叫 .jpg、PNG 叫 .png）—— 扩展名
///    与内容不符 ⇒ ⇒ 有些图库会**认不出**那张图（用户看到「打不开」）。
/// ❻ **工具卡片里的那张图真的带上了长按**（接线那一格：卡片 ⇒ ⇒ 长按图）。
void main() {
  testSetup();

  /// 一张真的 8x8 PNG（真 PNG 头 ⇒ ⇒ 格式嗅探认得出 png）。
  final pngBytes = base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGNQMGjAihiGlgQAOfQ0AYUPO5gAAAAASUVORK5CYII=',
  );

  /// 记下宿主那一侧收到了什么（方法名 ＋ 参数）。
  final calls = <MethodCall>[];
  Object? reply = <String, dynamic>{'ok': true};

  void mockHost() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel(MediaActions.channelName),
          (call) async {
            calls.add(call);
            return reply;
          },
        );
  }

  setUp(() {
    calls.clear();
    reply = <String, dynamic>{'ok': true};
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel(MediaActions.channelName),
          null,
        );
  });

  /// 只把那张图放进一个**有尺寸**的框里 ⇒ ⇒ 长按有地方按。
  ///
  /// ⚠️ **为什么不能直接用工具卡片**：卡片里的图是 `fit: BoxFit.fitWidth`
  /// ⇒ ⇒ 1x1 的 PNG 在测试窗口里只有**一个像素高** ⇒ ⇒ 长按**打不中**
  /// ⇒ ⇒ 判据会红在一个与实现无关的地方（那一格我另立一条判据钉接线）。
  Future<void> pumpImage(WidgetTester tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: const [Locale('zh'), Locale('en')],
          locale: const Locale('zh'),
          home: Scaffold(
            body: Center(
              child: SizedBox(
                width: 120,
                height: 120,
                child: LongPressImage(bytes: pngBytes),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('长按聊天里的图 ⇒ ⇒ 弹出「保存到相册 / 分享到微信」', (
    WidgetTester tester,
  ) async {
    mockHost();
    await pumpImage(tester);
    final l10n = l10nOf(tester);

    await tester.longPress(find.byType(LongPressImage));
    await tester.pumpAndSettle();

    expect(find.text(l10n.imageActionSaveToGallery), findsOneWidget);
    expect(find.text(l10n.imageActionShareToWeChat), findsOneWidget);
  });

  testWidgets('点「保存到相册」⇒ ⇒ **真的打到了宿主那一侧**（带字节）', (
    WidgetTester tester,
  ) async {
    mockHost();
    await pumpImage(tester);
    final l10n = l10nOf(tester);

    await tester.longPress(find.byType(LongPressImage));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.imageActionSaveToGallery));
    await tester.pumpAndSettle();

    // ⚠️ **这一格才是「按钮不是摆设」**：通道真的被调到了，且带的是**字节**。
    expect(calls.length, 1);
    expect(calls.single.method, 'saveToGallery');
    final args = calls.single.arguments as Map<Object?, Object?>;
    expect(args['bytes'], isNotNull);
    expect((args['bytes'] as List<int>).length, pngBytes.length);
    expect(args['fileName'] as String, endsWith('.png'));
    // ⇒ ⇒ 界面说「已保存到相册」。
    expect(find.text(l10n.imageActionSaved), findsOneWidget);
  });

  testWidgets('宿主说失败 ⇒ ⇒ 界面说「保存失败：…」⇒ ⇒ **不许**说「已保存」', (
    WidgetTester tester,
  ) async {
    reply = <String, dynamic>{
      'ok': false,
      'code': 'permission_denied',
      'message': '需要存储权限',
    };
    mockHost();
    await pumpImage(tester);
    final l10n = l10nOf(tester);

    await tester.longPress(find.byType(LongPressImage));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.imageActionSaveToGallery));
    await tester.pumpAndSettle();

    expect(find.text(l10n.imageActionSaved), findsNothing);
    expect(
      find.text(l10n.imageActionSaveFailed('需要存储权限')),
      findsOneWidget,
    );
  });

  testWidgets('没装微信 ⇒ ⇒ 界面说「没检测到微信…」⇒ ⇒ **不许**说「已分享到微信」', (
    WidgetTester tester,
  ) async {
    // ⇒ ⇒ 宿主：动作**成了**，但走的是**系统分享面板**（微信没装）。
    reply = <String, dynamic>{'ok': true, 'wechat': false};
    mockHost();
    await pumpImage(tester);
    final l10n = l10nOf(tester);

    await tester.longPress(find.byType(LongPressImage));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.imageActionShareToWeChat));
    await tester.pumpAndSettle();

    expect(calls.single.method, 'shareToWeChat');
    expect(find.text(l10n.imageActionSharedToWeChat), findsNothing);
    expect(find.text(l10n.imageActionSharedSystem), findsOneWidget);
  });

  testWidgets('工具卡片里的那张图**带上了长按**（接线那一格）', (
    WidgetTester tester,
  ) async {
    mockHost();
    final call = ToolCallModel(
      id: 'call-image',
      name: 'generate_image',
      description: '生成一张图',
      args: const {'prompt': '一只猫'},
      status: ToolCallStatus.succeeded,
      result: <String, dynamic>{
        'images': [
          {'b64': base64Encode(pngBytes), 'size': '8x8'},
        ],
      },
    );
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: const [Locale('zh'), Locale('en')],
          locale: const Locale('zh'),
          home: Scaffold(body: ToolCallCard(call: call)),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // ⇒ ⇒ 卡片里那张图**能长按**（用户往回翻还能把那张图带走）。
    expect(find.byType(LongPressImage), findsOneWidget);
  });

  test('格式嗅探：JPEG 字节 ⇒ ⇒ .jpg；PNG 字节 ⇒ ⇒ .png；认不出 ⇒ ⇒ .jpg', () {
    final jpeg = base64Decode(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////'
      '////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////'
      '//////////////////////////////////////////////////////////////////////'
      '/////////////////////////////////////////////////////8AAEQgACAAIAwEiAAIRAQMRAf/EABAAAABAAAAAAAAAAAAAAAAAAAB'
      'A==',
    );
    expect(imageExtensionOf(jpeg), 'jpg');
    expect(imageExtensionOf(pngBytes), 'png');
    expect(imageExtensionOf(Uint8List.fromList([1, 2, 3])), 'jpg');
    expect(imageFileName(pngBytes), endsWith('.png'));
    expect(imageFileName(jpeg), endsWith('.jpg'));
  });
}
