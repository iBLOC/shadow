import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/screens/in_app_camera_page.dart';
import 'package:shadow_mobile/services/in_app_camera_service.dart';

/// **内建相机页**的判据 —— 「自己拍、不走系统相机」那一族。
///
/// ⚠️ 这一族钉的是 2026-11-16 那一刀的约定：
///   ❶ 相机**开不起来** ⇒ ⇒ **说真话**（权限被拒／没摄像头／打开失败，
///      三件事**分开说** ⇒ ⇒ 不许黑屏装死）；
///   ❷ 拍照成功 ⇒ ⇒ **带着路径**退出（照片能进候选）；
///   ❸ 拍照失败 ⇒ ⇒ 说真话（不许静默、不许假装退出）；
///   ❹ 录像：第一次点快门开始录、第二次点停止 ⇒ ⇒ 带**视频**路径退出；
///   ❺ 关闭 ⇒ ⇒ **不带任何东西**退出（不许挂半截附件）＋ 摄像头**必须**释放；
///   ❻ 快门／关闭／翻转都有**无障碍标签**（读屏能念出来）。
///
/// ⚠️ 判据**不能**依赖 camera 插件（它在测试环境里起不来）⇒ ⇒ 用假驱动。
class _FakeDriver implements InAppCameraDriver {
  _FakeDriver({
    this.openStatus = InAppCameraOpenStatus.ok,
    this.photoFails = false,
  });

  final InAppCameraOpenStatus openStatus;
  final bool photoFails;

  final String photoPath = '/tmp/fake_photo.jpg';
  final String recordPath = '/tmp/fake_video.mp4';

  bool opened = false;
  bool closed = false;
  bool recording = false;
  int photoCalls = 0;

  @override
  bool get isReady => opened && openStatus == InAppCameraOpenStatus.ok;

  @override
  bool get isRecording => recording;

  @override
  bool get isFrontCamera => false;

  @override
  Future<InAppCameraOpenStatus> open({
    bool useFrontCamera = false,
    bool needAudio = false,
  }) async {
    opened = true;
    return openStatus;
  }

  @override
  Widget buildPreview() => const ColoredBox(color: Colors.black);

  @override
  Future<String?> takePhoto() async {
    photoCalls++;
    return photoFails ? null : photoPath;
  }

  @override
  Future<bool> startRecording() async {
    recording = true;
    return true;
  }

  @override
  Future<String?> stopRecording() async {
    recording = false;
    return recordPath;
  }

  @override
  Future<bool> switchCamera() async => true;

  @override
  Future<void> close() async {
    closed = true;
  }
}

void main() {
  Widget wrap(Widget child) {
    return MaterialApp(
      locale: const Locale('zh'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(body: child),
    );
  }

  /// 造一个「按一下开相机页」的壳 ⇒ ⇒ 页面退出时能拿到它带回的东西。
  Widget host(
    _FakeDriver driver,
    InAppCameraMode mode,
    void Function(InAppCameraCapture?) onPopped,
  ) {
    return MaterialApp(
      locale: const Locale('zh'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(
        body: Builder(
          builder: (context) => Center(
            child: ElevatedButton(
              onPressed: () async {
                final r = await Navigator.of(context)
                    .push<InAppCameraCapture>(
                  InAppCameraPage.route(
                    mode: mode,
                    driverFactory: () => driver,
                  ),
                );
                onPopped(r);
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    );
  }

  testWidgets('❶ 相机开不起来（权限被拒）⇒ ⇒ **说真话**', (tester) async {
    final driver = _FakeDriver(
      openStatus: InAppCameraOpenStatus.permissionDenied,
    );
    await tester.pumpWidget(wrap(InAppCameraPage(driverFactory: () => driver)));
    await tester.pumpAndSettle();

    expect(find.text('相机权限被拒绝'), findsOneWidget);
    // 不许停在「转圈」上装死。
    expect(find.byType(CircularProgressIndicator), findsNothing);
    // 也不许拿别的错来糊弄（权限 ≠ 没摄像头）。
    expect(find.text('相机不可用'), findsNothing);
  });

  testWidgets('❶b 没有摄像头 ⇒ ⇒ 说的是「相机不可用」（不跟权限混）', (tester) async {
    final driver = _FakeDriver(openStatus: InAppCameraOpenStatus.noCamera);
    await tester.pumpWidget(wrap(InAppCameraPage(driverFactory: () => driver)));
    await tester.pumpAndSettle();

    expect(find.text('相机不可用'), findsOneWidget);
    expect(find.text('相机权限被拒绝'), findsNothing);
  });

  testWidgets('❶c 打开失败 ⇒ ⇒ 说的是「相机打开失败」', (tester) async {
    final driver = _FakeDriver(openStatus: InAppCameraOpenStatus.failed);
    await tester.pumpWidget(wrap(InAppCameraPage(driverFactory: () => driver)));
    await tester.pumpAndSettle();

    expect(find.text('相机打开失败'), findsOneWidget);
    expect(find.text('相机权限被拒绝'), findsNothing);
  });

  testWidgets('❷ 拍照成功 ⇒ ⇒ **带着路径**退出（照片能进候选）', (tester) async {
    InAppCameraCapture? popped;
    final driver = _FakeDriver();

    await tester.pumpWidget(
      host(driver, InAppCameraMode.photo, (r) => popped = r),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('in_app_camera_shutter')));
    await tester.pumpAndSettle();

    expect(popped, isNotNull);
    expect(popped!.path, '/tmp/fake_photo.jpg');
    expect(popped!.isVideo, isFalse);
    expect(driver.photoCalls, 1);
  });

  testWidgets('❸ 拍照失败 ⇒ ⇒ 说真话（不静默、不假装退出）', (tester) async {
    InAppCameraCapture? popped;
    final driver = _FakeDriver(photoFails: true);

    await tester.pumpWidget(
      host(driver, InAppCameraMode.photo, (r) => popped = r),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('in_app_camera_shutter')));
    await tester.pumpAndSettle();

    expect(find.text('拍摄失败'), findsOneWidget);
    expect(popped, isNull);
  });

  testWidgets('❹ 录像：第一次点快门开始录、第二次点停止 ⇒ ⇒ 带**视频**路径退出', (tester) async {
    InAppCameraCapture? popped;
    final driver = _FakeDriver();

    await tester.pumpWidget(
      host(driver, InAppCameraMode.video, (r) => popped = r),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('in_app_camera_shutter')));
    await tester.pump();
    expect(driver.recording, isTrue);

    await tester.tap(find.byKey(const Key('in_app_camera_shutter')));
    await tester.pumpAndSettle();

    expect(popped, isNotNull);
    expect(popped!.isVideo, isTrue);
    expect(popped!.path, '/tmp/fake_video.mp4');
    expect(driver.recording, isFalse);
  });

  testWidgets('❺ 关闭 ⇒ ⇒ 不带任何东西退出 ＋ 摄像头**必须**释放', (tester) async {
    InAppCameraCapture? popped;
    final driver = _FakeDriver();

    await tester.pumpWidget(
      host(driver, InAppCameraMode.photo, (r) => popped = r),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('in_app_camera_close')));
    await tester.pumpAndSettle();

    expect(popped, isNull);
    expect(driver.closed, isTrue);
  });

  testWidgets('❻ 快门／关闭／翻转都有**无障碍标签**（读屏能念出来）', (tester) async {
    final handle = tester.ensureSemantics();
    final driver = _FakeDriver();

    await tester.pumpWidget(wrap(InAppCameraPage(driverFactory: () => driver)));
    await tester.pumpAndSettle();

    expect(find.bySemanticsLabel('拍照'), findsOneWidget);
    expect(find.bySemanticsLabel('关闭'), findsOneWidget);
    expect(find.bySemanticsLabel('翻转'), findsOneWidget);
    handle.dispose();
  });
}
