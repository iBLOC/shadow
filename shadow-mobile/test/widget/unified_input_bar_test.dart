import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/widgets/chat/unified_input_bar.dart';

/// **统一输入条**的判据 —— 「一个输入框同时是打字和说话」那一族。
///
/// ⚠️ 这一族钉的是 2026-11-15 那一刀的交互约定：
///   ❶ **轻触** ⇒ 打字（**不许**开录音）；
///   ❷ **长按** ⇒ 录音；**松手** ⇒ 结束（**不放弃**）；
///   ❸ **按住时左右滑动** ⇒ 进入「放弃」⇒ ⇒ 松手 ⇒ **放弃**；
///   ❹ 附件入口在**右边**、形状是「＋」；
///   ❺ 相机钮：**轻触**拍照、**长按**录像（同一个钮分流）。
void main() {
  late TextEditingController controller;
  int started = 0;
  bool? finished;
  bool cancelledFlag = false;
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

  Widget bar() {
    return UnifiedInputBar(
      controller: controller,
      enabled: true,
      isLoading: false,
      hasAttachments: false,
      hintText: '轻触输入 · 长按说话',
      focusedHintText: '输入内容…',
      recordingText: '松手发送',
      cancelText: '松手放弃',
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
    cancelledFlag = false;
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

  testWidgets('❸ 按住后**左右滑动** ⇒ 松手就是**放弃**', (tester) async {
    await tester.pumpWidget(wrap(bar()));

    final gesture = await tester.startGesture(
      tester.getCenter(find.byType(TextField)),
    );
    await tester.pump(const Duration(milliseconds: 500));
    expect(started, 1);

    await gesture.moveBy(const Offset(140, 0));
    await tester.pump();
    expect(find.text('松手放弃'), findsOneWidget, reason: '滑到两侧 ⇒ 提示要换');

    await gesture.up();
    await tester.pump();

    expect(finished, isTrue, reason: '滑到两侧松手 ⇒ **放弃**（不许发送）');
  });

  testWidgets('❹ 附件入口在**右边**、形状是「＋」；菜单里有相册/文件',
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
}
