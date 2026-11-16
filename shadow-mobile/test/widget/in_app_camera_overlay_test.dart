import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/generated/l10n/app_localizations.dart';
import 'package:shadow_mobile/services/in_app_camera_service.dart';
import 'package:shadow_mobile/widgets/chat/in_app_camera_overlay.dart';

/// **相机叠加层**的判据 —— 「自己拍、不走系统相机」＋「叠在聊天页上」那一族。
///
/// ⚠️ 2026-11-16 那一刀把相机从「独立页面」改成「叠在聊天页上的一层」
/// ⇒ ⇒ 这一族钉的是：
///   ❶ 相机**开不起来** ⇒ ⇒ **说真话**（权限被拒／没摄像头／打开失败，
///      三件事**分开说** ⇒ ⇒ 不许黑屏装死）；
///   ❷ 拍照成功 ⇒ ⇒ **带着路径**回调出去（照片能进候选）；
///   ❸ 拍照失败 ⇒ ⇒ 说真话（不许静默、不许假装拍好了）；
///   ❹ 录像：第一次点快门开始录、第二次点停止 ⇒ ⇒ 带**视频**路径回调；
///   ❺ 取消 ⇒ ⇒ **不带任何东西**（不许挂半截附件）＋ 摄像头**必须**释放；
///   ❻ 快门／关闭／翻转都有**无障碍标签**（读屏能念出来）；
///   ❼ **叠加**：相机叠上来时，**聊天页那一层不许消失**（跳页就会消失）；
///   ❽ **形态**：默认半屏（聊天还在上面）＋ 点预览放大成全屏。
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
  /// 造一个「聊天页 ＋ 相机叠上来」的壳。
  ///
  /// ⚠️ [chat_underlay] 代表**聊天页那一层** —— 相机叠上来时它必须还在
  /// ⇒ ⇒ 跳页的话它会**整块消失**（那就不是一体化了）。
  Widget host(
    _FakeDriver driver,
    InAppCameraMode mode, {
    required void Function(InAppCameraCapture) onCaptured,
    required void Function() onCancel,
  }) {
    // ⚠️ 聊天页真实行为：**拍完／取消 ⇒ ⇒ 这一层从树上摘掉**
    // ⇒ ⇒ 相机被 dispose ⇒ ⇒ 摄像头**必须**释放。
    // ⇒ ⇒ 这里必须真的把它摘掉 ⇒ ⇒ 不许「挂着不走」。
    var showCamera = true;
    return MaterialApp(
      locale: const Locale('zh'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(
        body: StatefulBuilder(
          builder: (context, setState) => Stack(
            children: [
              const SizedBox(key: Key('chat_underlay'), height: 120),
              if (showCamera)
                InAppCameraOverlay(
                  mode: mode,
                  driverFactory: () => driver,
                  onCaptured: (c) {
                    onCaptured(c);
                    setState(() => showCamera = false);
                  },
                  onCancel: () {
                    onCancel();
                    setState(() => showCamera = false);
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }

  double screenHeight(WidgetTester tester) {
    // ⚠️ 视口高度 = Scaffold 的高度（host 里就一个 Scaffold ⇒ 唯一）。
    return tester.getSize(find.byType(Scaffold)).height;
  }

  testWidgets('❶ 相机开不起来（权限被拒）⇒ ⇒ **说真话**', (tester) async {
    final driver = _FakeDriver(
      openStatus: InAppCameraOpenStatus.permissionDenied,
    );
    await tester.pumpWidget(
      host(driver, InAppCameraMode.photo, onCaptured: (_) {}, onCancel: () {}),
    );
    await tester.pumpAndSettle();

    expect(find.text('相机权限被拒绝'), findsOneWidget);
    // 不许停在「转圈」上装死。
    expect(find.byType(CircularProgressIndicator), findsNothing);
    // 也不许拿别的错来糊弄（权限 ≠ 没摄像头）。
    expect(find.text('相机不可用'), findsNothing);
  });

  testWidgets('❶b 没有摄像头 ⇒ ⇒ 说的是「相机不可用」（不跟权限混）', (tester) async {
    final driver = _FakeDriver(openStatus: InAppCameraOpenStatus.noCamera);
    await tester.pumpWidget(
      host(driver, InAppCameraMode.photo, onCaptured: (_) {}, onCancel: () {}),
    );
    await tester.pumpAndSettle();

    expect(find.text('相机不可用'), findsOneWidget);
    expect(find.text('相机权限被拒绝'), findsNothing);
  });

  testWidgets('❶c 打开失败 ⇒ ⇒ 说的是「相机打开失败」', (tester) async {
    final driver = _FakeDriver(openStatus: InAppCameraOpenStatus.failed);
    await tester.pumpWidget(
      host(driver, InAppCameraMode.photo, onCaptured: (_) {}, onCancel: () {}),
    );
    await tester.pumpAndSettle();

    expect(find.text('相机打开失败'), findsOneWidget);
    expect(find.text('相机权限被拒绝'), findsNothing);
  });

  testWidgets('❷ 拍照成功 ⇒ ⇒ **带着路径**回调出去（照片能进候选）', (tester) async {
    InAppCameraCapture? got;
    final driver = _FakeDriver();

    await tester.pumpWidget(
      host(
        driver,
        InAppCameraMode.photo,
        onCaptured: (c) => got = c,
        onCancel: () {},
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('in_app_camera_shutter')));
    await tester.pumpAndSettle();

    expect(got, isNotNull);
    expect(got!.path, '/tmp/fake_photo.jpg');
    expect(got!.isVideo, isFalse);
    expect(driver.photoCalls, 1);
  });

  testWidgets('❸ 拍照失败 ⇒ ⇒ 说真话（不静默、不假装拍好了）', (tester) async {
    InAppCameraCapture? got;
    final driver = _FakeDriver(photoFails: true);

    await tester.pumpWidget(
      host(
        driver,
        InAppCameraMode.photo,
        onCaptured: (c) => got = c,
        onCancel: () {},
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('in_app_camera_shutter')));
    await tester.pumpAndSettle();

    expect(find.text('拍摄失败'), findsOneWidget);
    expect(got, isNull);
  });

  testWidgets('❹ 录像：第一次点快门开始录、第二次点停止 ⇒ ⇒ 带**视频**路径回调', (tester) async {
    InAppCameraCapture? got;
    final driver = _FakeDriver();

    await tester.pumpWidget(
      host(
        driver,
        InAppCameraMode.video,
        onCaptured: (c) => got = c,
        onCancel: () {},
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('in_app_camera_shutter')));
    await tester.pump();
    expect(driver.recording, isTrue);

    await tester.tap(find.byKey(const Key('in_app_camera_shutter')));
    await tester.pumpAndSettle();

    expect(got, isNotNull);
    expect(got!.isVideo, isTrue);
    expect(got!.path, '/tmp/fake_video.mp4');
    expect(driver.recording, isFalse);
  });

  testWidgets('❺ 取消 ⇒ ⇒ 不带任何东西 ＋ 摄像头**必须**释放', (tester) async {
    var cancelled = false;
    final driver = _FakeDriver();

    await tester.pumpWidget(
      host(
        driver,
        InAppCameraMode.photo,
        onCaptured: (_) {},
        onCancel: () => cancelled = true,
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('in_app_camera_close')));
    await tester.pumpAndSettle();

    expect(cancelled, isTrue);
    expect(driver.closed, isTrue);
  });

  testWidgets('❻ 快门／关闭／翻转都有**无障碍标签**（读屏能念出来）', (tester) async {
    final handle = tester.ensureSemantics();
    final driver = _FakeDriver();

    await tester.pumpWidget(
      host(driver, InAppCameraMode.photo, onCaptured: (_) {}, onCancel: () {}),
    );
    await tester.pumpAndSettle();

    expect(find.bySemanticsLabel('拍照'), findsOneWidget);
    expect(find.bySemanticsLabel('关闭'), findsOneWidget);
    expect(find.bySemanticsLabel('翻转'), findsOneWidget);
    handle.dispose();
  });

  testWidgets('❼ 相机是**叠在聊天页上**的 ⇒ ⇒ 聊天页那一层**不许消失**', (tester) async {
    final driver = _FakeDriver();

    await tester.pumpWidget(
      host(driver, InAppCameraMode.photo, onCaptured: (_) {}, onCancel: () {}),
    );
    await tester.pumpAndSettle();

    // 聊天页那一层还在 ⇒ ⇒ 不是「跳页」而是「叠加」。
    expect(find.byKey(const Key('chat_underlay')), findsOneWidget);
    // 而且相机只占**下面**那块 ⇒ ⇒ 上面的聊天**露着**（一体化）。
    final underlay = tester.getRect(find.byKey(const Key('chat_underlay')));
    final panel = tester.getRect(find.byKey(const Key('in_app_camera_panel')));
    expect(panel.top, greaterThanOrEqualTo(underlay.bottom));
  });

  testWidgets('❽ 默认半屏 ＋ 点预览放大成全屏（取景不够就放大）', (tester) async {
    final driver = _FakeDriver();

    await tester.pumpWidget(
      host(driver, InAppCameraMode.photo, onCaptured: (_) {}, onCancel: () {}),
    );
    await tester.pumpAndSettle();

    final h = screenHeight(tester);
    final compact = tester.getSize(find.byKey(const Key('in_app_camera_panel')));
    expect(compact.height, lessThan(h));
    expect(compact.height, closeTo(h * 0.58, 1));

    await tester.tap(find.byKey(const Key('in_app_camera_preview')));
    await tester.pumpAndSettle();

    final full = tester.getSize(find.byKey(const Key('in_app_camera_panel')));
    expect(full.height, closeTo(h, 1));
  });
}
