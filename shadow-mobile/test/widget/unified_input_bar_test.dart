import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/widgets/chat/unified_input_bar.dart';

/// **统一输入条**的判据 —— 「一个输入框同时是打字和说话」那一族。
///
/// ⚠️ 这一族钉的是 2026-11-15 那一刀的交互约定：
///   ❶ **轻触** ⇒ 打字（**不许**开录音）；
///   ❷ **长按** ⇒ 录音；**松手** ⇒ 结束（**不放弃**）；
///   ❸ **按住时左滑** ⇒ 进入「放弃」⇒ ⇒ 松手 ⇒ **放弃**；
///   ⓫ **按住时右滑** ⇒ 进入「相机」⇒ ⇒ 松手 ⇒ **丢掉这段录音 ＋ 打开摄像头**；
///   ⓬ 「＋」**只支持单击**（长按零反应）；
///   ❹ 附件入口形状是「＋」、在**输入框左侧**；
///   ❺ 相机钮：**轻触**拍照、**长按**录像（同一个钮分流）。
///   ❻ **没有**发送按钮（文字靠键盘上的发送键）；
///   ❼ 等回话 ⇒ 输入区容器里有一枚**固定 18px** 的小转圈；
///   ❽ 录音态弹的是**整屏遮罩**（**不在**文字框里）；
///   ❾ 上滑到顶部「取消」区 ⇒ 提示翻成「松手放弃」⇒ 松手**放弃**；
///   ❿ 「＋」在左、「📷」在右，三样在**同一个圆角框**里。
void main() {
  late TextEditingController controller;
  int started = 0;
  bool? finished;
  int photos = 0;
  int videos = 0;
  int images = 0;
  int files = 0;

  Widget wrap(Widget child) {
    return MaterialApp(
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: 360,
            child: child,
          ),
        ),
      ),
    );
  }

  Widget bar({bool isLoading = false}) {
    return UnifiedInputBar(
      controller: controller,
      enabled: true,
      isLoading: isLoading,
      hintText: '轻触输入 · 长按说话',
      focusedHintText: '输入内容…',
      recordingText: '松手发送',
      cancelText: '松手放弃',
      cancelZoneText: '取消',
      cameraText: '松手打开相机',
      galleryLabel: '相册',
      fileLabel: '文件',
      cameraLabel: '轻触拍照 · 长按录像',
      onStartRecording: () => started++,
      onFinishRecording: (cancel) async {
        finished = cancel;
      },
      onPickImage: () => images++,
      onPickFile: () => files++,
      onCapturePhoto: () => photos++,
      onCaptureVideo: () => videos++,
    );
  }

  setUp(() {
    controller = TextEditingController();
    started = 0;
    finished = null;
    photos = 0;
    videos = 0;
    images = 0;
    files = 0;
  });

  tearDown(() => controller.dispose());

  testWidgets('❶ 轻触 ⇒ 打字，**不许**开录音', (tester) async {
    await tester.pumpWidget(wrap(bar()));

    final gesture = await tester.startGesture(
      tester.getCenter(find.byType(TextField)),
    );
    await tester.pump(const Duration(milliseconds: 120));
    await gesture.up();
    await tester.pump();

    expect(started, 0, reason: '没到按住时长 ⇒ 那是点一下，不是说话');
    expect(finished, isNull, reason: '没开始录音 ⇒ 就没有「松手」这一格');
  });

  testWidgets('❷ 长按 ⇒ 开始录音；松手 ⇒ 结束（**不放弃**）', (tester) async {
    await tester.pumpWidget(wrap(bar()));

    final gesture = await tester.startGesture(
      tester.getCenter(find.byType(TextField)),
    );
    await tester.pump(const Duration(milliseconds: 500));

    expect(started, 1, reason: '按住到点 ⇒ 必须开录');
    expect(find.text('松手发送'), findsOneWidget, reason: '录音态要看得见');

    await gesture.up();
    await tester.pump();

    expect(finished, isFalse, reason: '没滑动 ⇒ 松手就是**发送**');
    expect(find.text('松手发送'), findsNothing);
  });

  testWidgets('❸ 按住后**左滑** ⇒ 松手就是**放弃**（且**不许**开摄像头）',
      (tester) async {
    await tester.pumpWidget(wrap(bar()));

    final gesture = await tester.startGesture(
      tester.getCenter(find.byType(TextField)),
    );
    await tester.pump(const Duration(milliseconds: 500));
    expect(started, 1);

    await gesture.moveBy(const Offset(-140, 0));
    await tester.pump();
    expect(find.text('松手放弃'), findsOneWidget, reason: '左滑 ⇒ 提示要换成「放弃」');

    await gesture.up();
    await tester.pump();

    expect(finished, isTrue, reason: '左滑松手 ⇒ **放弃**（不许发送）');
    expect(photos, 0, reason: '左滑是「放弃」不是「切相机」 ⇒ ⇒ 不许开摄像头');
  });

  testWidgets('❹ 附件入口形状是「＋」、在**输入框左侧**；菜单里有相册/文件',
      (tester) async {
    await tester.pumpWidget(wrap(bar()));

    expect(find.byIcon(Icons.add), findsOneWidget);
    expect(find.byIcon(Icons.attach_file), findsNothing,
        reason: '旧的回形针入口不许再出现');

    await tester.tap(find.byIcon(Icons.add));
    await tester.pumpAndSettle();

    expect(find.text('相册'), findsOneWidget);
    expect(find.text('文件'), findsOneWidget);

    await tester.tap(find.text('文件'));
    await tester.pumpAndSettle();
    expect(files, 1);
    expect(images, 0);
  });

  testWidgets('❺ 相机钮：轻触＝拍照片，**长按＝拍视频**', (tester) async {
    await tester.pumpWidget(wrap(bar()));

    final camera = find.byIcon(Icons.camera_alt);

    await tester.tap(camera);
    await tester.pumpAndSettle();
    expect(photos, 1);
    expect(videos, 0, reason: '轻触**不许**去拍视频');

    final gesture = await tester.startGesture(tester.getCenter(camera));
    await tester.pump(const Duration(milliseconds: 600));
    await gesture.up();
    await tester.pumpAndSettle();

    expect(videos, 1, reason: '长按 ⇒ 拍视频');
    expect(photos, 1, reason: '长按**不许**顺带拍一张照片');
  });

  testWidgets('❻ **没有**发送按钮（文字靠键盘上的发送键）', (tester) async {
    await tester.pumpWidget(wrap(bar()));

    // ⚠️ 2026-11-15：右侧那个圆形发送钮**退休了** ⇒ ⇒ 文字走输入框自带
    // 的「发送」键（textInputAction: TextInputAction.send ＋ onSubmitted）。
    expect(find.byIcon(Icons.send), findsNothing,
        reason: '发送按钮不许再出现');
    // 剩下的两个钮还在。
    expect(find.byIcon(Icons.add), findsOneWidget);
    expect(find.byIcon(Icons.camera_alt), findsOneWidget);
  });

  testWidgets('❼ 正在等回话 ⇒ 输入区容器里有一枚小转圈（**不是**按钮）',
      (tester) async {
    await tester.pumpWidget(wrap(bar(isLoading: true)));
    await tester.pump();

    // ⚠️ 转圈以前住在**发送按钮**里 ⇒ ⇒ 删掉按钮之后它**不许跟着一起没**
    // ⇒ ⇒ 否则「等回话」那一段界面一点动静都没有 ⇒ ⇒ 按了发送没反应
    // 和正在回话，长得一模一样。
    expect(find.byType(CircularProgressIndicator), findsOneWidget,
        reason: '等回话要有忙碌指示');
    expect(find.byIcon(Icons.send), findsNothing);

    // ⚠️ 转圈必须**小** —— 第一版把它塞进输入框的 suffixIcon ⇒ ⇒ suffix 槽
    // 给的约束把它**撑成一大坨**（真机实测约 125px，糊住半个输入框）⇒ ⇒
    // 现在它是**固定尺寸**的槽 ⇒ ⇒ 钉死 18px。
    final size = tester.getSize(find.byType(CircularProgressIndicator));
    expect(size.width, inInclusiveRange(14, 22),
        reason: '转圈不许被撑大（实测宽 ${size.width.toStringAsFixed(1)}px）');
    expect(size.height, inInclusiveRange(14, 22),
        reason: '转圈不许被撑大（实测高 ${size.height.toStringAsFixed(1)}px）');

    // ⚠️ 转圈不许**盖住字** —— 它住在输入区容器里、文字框**右边**、
    // 「📷」**左边**（固定占位 ⇒ 「＋」「📷」不跳）。
    final spinnerX = tester.getCenter(find.byType(CircularProgressIndicator)).dx;
    final cameraX = tester.getCenter(find.byIcon(Icons.camera_alt)).dx;
    final fieldX = tester.getCenter(find.byType(TextField)).dx;
    expect(spinnerX, lessThan(cameraX), reason: '转圈在「📷」的左边');
    expect(spinnerX, greaterThan(fieldX), reason: '转圈在文字框的右边（不许盖住字）');

    // 不等回话了 ⇒ 转圈消失。
    await tester.pumpWidget(wrap(bar()));
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsNothing);
  });

  testWidgets('❽ 录音态弹的是**整屏遮罩**（**不在**文字框里）', (tester) async {
    await tester.pumpWidget(wrap(bar()));

    final gesture = await tester.startGesture(
      tester.getCenter(find.byType(TextField)),
    );
    await tester.pump(const Duration(milliseconds: 500));
    expect(started, 1, reason: '按住到点 ⇒ 必须开录');

    final overlay = find.byKey(UnifiedInputBar.recordingOverlayKey);
    expect(overlay, findsOneWidget, reason: '录音态必须弹一层遮罩（要有提示）');

    // ⚠️ 遮罩是**整屏** —— 尺寸必须等于屏幕，不许只是输入框那一小块。
    final overlaySize = tester.getSize(overlay);
    final screenSize = tester.getSize(find.byType(Scaffold));
    expect(overlaySize.width, screenSize.width,
        reason: '遮罩必须盖满整屏宽（实测 ${overlaySize.width} vs ${screenSize.width}）');
    expect(overlaySize.height, screenSize.height,
        reason: '遮罩必须盖满整屏高（实测 ${overlaySize.height} vs ${screenSize.height}）');

    // ⚠️ 遮罩**不在**文字框里面 —— 它是 `Overlay` 上单独的一层。
    expect(
      find.descendant(of: find.byType(TextField), matching: overlay),
      findsNothing,
      reason: '遮罩不是输入框里的那一小块',
    );

    await gesture.up();
    await tester.pump();
    expect(find.byKey(UnifiedInputBar.recordingOverlayKey), findsNothing,
        reason: '松手 ⇒ 遮罩必须撤掉');
  });

  testWidgets('❾ 上滑到顶部「取消」区 ⇒ 提示翻成「松手放弃」⇒ 松手**放弃**',
      (tester) async {
    await tester.pumpWidget(wrap(bar()));

    final start = tester.getCenter(find.byType(TextField));
    final gesture = await tester.startGesture(start);
    await tester.pump(const Duration(milliseconds: 500));
    expect(started, 1);

    // ⚠️ 顶部那条**放弃目标区**必须看得见 —— 用户得知道往哪移。
    expect(find.text('取消'), findsOneWidget, reason: '顶部要有放弃目标区');
    expect(find.text('松手发送'), findsOneWidget, reason: '没进区 ⇒ 提示是「松手发送」');

    // ⚠️ 上滑到顶部（y ≤ 88 逻辑像素）⇒ ⇒ 进区 ⇒ ⇒ 提示翻。
    await gesture.moveTo(Offset(start.dx, 20));
    await tester.pump();
    expect(find.text('松手放弃'), findsOneWidget, reason: '进区了 ⇒ 提示要翻');
    expect(find.text('松手发送'), findsNothing, reason: '进区了 ⇒ 不许还说「松手发送」');

    await gesture.up();
    await tester.pump();
    expect(finished, isTrue, reason: '在取消区松手 ⇒ **放弃**（不许发送）');
    expect(find.byKey(UnifiedInputBar.recordingOverlayKey), findsNothing);
  });

  testWidgets('❿ 「＋」在左、「📷」在右，三样在**同一个圆角框**里',
      (tester) async {
    await tester.pumpWidget(wrap(bar()));

    final area = find.byKey(UnifiedInputBar.inputAreaKey);
    expect(area, findsOneWidget, reason: '输入区是一个整体容器');

    // ⚠️ 两个钮都在**那个容器**里面（不是一个在框内、一个在框外）。
    expect(
      find.descendant(of: area, matching: find.byIcon(Icons.add)),
      findsOneWidget,
      reason: '「＋」必须在输入区容器里',
    );
    expect(
      find.descendant(of: area, matching: find.byIcon(Icons.camera_alt)),
      findsOneWidget,
      reason: '「📷」必须在输入区容器里',
    );

    // ⚠️ 「＋」在文字框**左边**，「📷」在**右边**。
    final addX = tester.getCenter(find.byIcon(Icons.add)).dx;
    final fieldX = tester.getCenter(find.byType(TextField)).dx;
    final cameraX = tester.getCenter(find.byIcon(Icons.camera_alt)).dx;
    expect(addX, lessThan(fieldX), reason: '「＋」在左边');
    expect(cameraX, greaterThan(fieldX), reason: '「📷」在右边');
  });

  testWidgets('⓫ 右滑 ⇒ 提示翻成「松手打开相机」⇒ 松手＝放弃 ＋ 打开摄像头',
      (tester) async {
    await tester.pumpWidget(wrap(bar()));

    final gesture = await tester.startGesture(
      tester.getCenter(find.byType(TextField)),
    );
    await tester.pump(const Duration(milliseconds: 500));
    expect(started, 1, reason: '按住到点 ⇒ 必须开录');

    // ⚠️ **右滑** ⇒ ⇒ 提示翻成「松手打开相机」（不是「松手放弃」）。
    await gesture.moveBy(const Offset(140, 0));
    await tester.pump();
    expect(find.text('松手打开相机'), findsOneWidget, reason: '右滑 ⇒ 提示要翻成相机');
    expect(find.text('松手放弃'), findsNothing, reason: '右滑不是放弃');
    expect(find.text('松手发送'), findsNothing, reason: '右滑不是发送');

    await gesture.up();
    await tester.pump();

    expect(finished, isTrue, reason: '切到相机 ⇒ 这段录音**丢掉**（不许发出去）');
    expect(photos, 1, reason: '右滑松手 ⇒ 打开摄像头');
    expect(find.byKey(UnifiedInputBar.recordingOverlayKey), findsNothing,
        reason: '松手 ⇒ 遮罩必须撤掉');
  });

  testWidgets('⓬ 「＋」**只支持单击**（长按零反应，单击才弹菜单）',
      (tester) async {
    await tester.pumpWidget(wrap(bar()));

    final add = find.byIcon(Icons.add);

    // ⚠️ **不许**在那个钮上挂 Tooltip —— 它的长按会弹一句提示 ⇒ ⇒
    // 那就不是「只支持单击」了（2026-11-16 实测取到过：_TooltipBox ＋
    // RichText）。判据按**祖先**方向查（旧结构里 Tooltip 是祖先）。
    expect(
      find.ancestor(of: add, matching: find.byType(Tooltip)),
      findsNothing,
      reason: '「＋」上不许挂 Tooltip（它的长按会弹提示）',
    );

    // ⚠️ 长按 ⇒ ⇒ 菜单不弹、也不开录音。
    final gesture = await tester.startGesture(tester.getCenter(add));
    await tester.pump(const Duration(milliseconds: 700));
    await gesture.up();
    await tester.pumpAndSettle();

    expect(find.text('相册'), findsNothing, reason: '长按「＋」不许弹菜单');
    expect(find.text('文件'), findsNothing, reason: '长按「＋」不许弹菜单');
    expect(started, 0, reason: '长按「＋」不许顺带开录音');
    expect(images, 0);
    expect(files, 0);

    // ⚠️ 单击 ⇒ ⇒ 菜单照常弹（不许把功能改没了）。
    await tester.tap(add);
    await tester.pumpAndSettle();
    expect(find.text('相册'), findsOneWidget, reason: '单击「＋」⇒ 菜单照常弹');

    await tester.tap(find.text('文件'));
    await tester.pumpAndSettle();
    expect(files, 1);
  });
}
