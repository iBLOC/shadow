import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shadow_mobile/multimodal/image_input_handler.dart';
import 'package:shadow_mobile/multimodal/multimodal_input_manager.dart';
import 'package:shadow_mobile/providers/chat_provider.dart';
import 'package:shadow_mobile/services/telencephalon/telencephalon_client.dart';
import 'package:shadow_mobile/tts_engine.dart';

/// 「拍完 ⇒ ⇒ 进候选」那一层的判据 —— 2026-11-16 那一刀。
///
/// ⚠️ 用户诉求逐字：「拍照不会加入候选」⇒ ⇒ 这一族钉的是：
///   ⓫ 拍到的文件被**收进 App 自己的目录**（captured_images/IMG_*）；
///   ⓬ 文件不在 ⇒ ⇒ 返回 null（**不许假装成功**）；
///   ⓭ provider 把拍到的文件**挂成附件**（候选行真的多一条）；
///   ⓮ provider：文件不在 ⇒ ⇒ **说真话**（有 errorMessage、附件没多）；
///   ⓯ **拍照链不再走系统相机**（结构判据：源码里 ImageSource.camera 零命中）。
///
/// ⚠️ 末那条是**机制**判据 ⇒ ⇒ 钉的是「那条路不许再存在」
/// ⇒ ⇒ 不许换个写法绕过去（不许又拿 image_picker 的 camera 源接回来）。
void main() {
  late Directory tmp;

  setUp(() async {
    tmp = await Directory.systemTemp.createTemp('shadow-capture');
    // ⚠️ 单测里没有 path_provider 的平台实现 ⇒ 落盘目标换成临时目录。
    ImageInputHandler.documentsDirOverride = () async => tmp;
  });

  tearDown(() async {
    ImageInputHandler.documentsDirOverride = null;
    try {
      if (tmp.existsSync()) tmp.deleteSync(recursive: true);
    } catch (_) {
      // 删不掉就算了 —— 不值得让判据红。
    }
  });

  Future<File> makeShot([String name = 'camera_raw.jpg']) async {
    final f = File('${tmp.path}/$name');
    await f.writeAsBytes([1, 2, 3, 4]);
    return f;
  }

  test('⓫ 拍到的文件被收进 App 自己的目录（captured_images/IMG_*）', () async {
    final shot = await makeShot();
    final mgr = MultimodalInputManager();

    final input = await mgr.importCapturedFile(shot, isVideo: false);

    expect(input, isNotNull);
    expect(input!.type, MultimodalInputType.image);
    expect(input.path, contains('captured_images'));
    expect(input.path, contains('IMG_'));
    expect(input.path, endsWith('.jpg'));
    expect(File(input.path!).existsSync(), isTrue);
  });

  test('⓬ 文件不在 ⇒ ⇒ 返回 null（不许假装成功）', () async {
    final mgr = MultimodalInputManager();

    final input = await mgr.importCapturedFile(
      File('${tmp.path}/not_there.jpg'),
      isVideo: false,
    );

    expect(input, isNull);
  });

  test('⓭ provider 把拍到的文件挂成附件（候选行真的多一条）', () async {
    final shot = await makeShot();
    final container = ProviderContainer(
      overrides: [
        chatProvider.overrideWith(
          (ref) => ChatNotifier(TtsEngine(), TelencephalonClient()),
        ),
      ],
    );
    addTearDown(container.dispose);
    final notifier = container.read(chatProvider.notifier);

    final ok = await notifier.attachCapturedFile(shot.path, isVideo: false);

    expect(ok, isTrue);
    final state = container.read(chatProvider);
    expect(state.attachments.length, 1);
    expect(state.attachments.first.type, MultimodalInputType.image);
    expect(state.attachments.first.path, contains('captured_images'));
    expect(state.errorMessage, isNull);
  });

  test('⓮ provider：文件不在 ⇒ ⇒ **说真话**（有 errorMessage、附件没多）', () async {
    final container = ProviderContainer(
      overrides: [
        chatProvider.overrideWith(
          (ref) => ChatNotifier(TtsEngine(), TelencephalonClient()),
        ),
      ],
    );
    addTearDown(container.dispose);
    final notifier = container.read(chatProvider.notifier);

    final ok = await notifier.attachCapturedFile(
      '${tmp.path}/not_there.jpg',
      isVideo: false,
    );

    expect(ok, isFalse);
    final state = container.read(chatProvider);
    expect(state.errorMessage, isNotNull);
    expect(state.attachments, isEmpty);
  });

  test('⓯ 拍照链**不再走系统相机**（机制判据）', () {
    // ⚠️ 判据盯的是**代码**，不是注释 —— 注释里可以写「这条路删掉了」
    // ⇒ ⇒ 不许因为文档里提了一嘴就判红 ⇒ ⇒ 先把注释剥掉再比。
    String code(String rel) {
      final src = File(rel).readAsStringSync();
      return src
          .replaceAll(RegExp(r'/\*[\s\S]*?\*/'), '')
          .split('\n')
          .map((l) => l.contains('//') ? l.substring(0, l.indexOf('//')) : l)
          .join('\n');
    }

    final handler = code('lib/multimodal/image_input_handler.dart');
    expect(handler.contains('ImageSource.camera'), isFalse);

    final mgr = code('lib/multimodal/multimodal_input_manager.dart');
    expect(mgr.contains('captureImage'), isFalse);
    expect(mgr.contains('captureVideo'), isFalse);

    final screen = code('lib/screens/chat_screen.dart');
    expect(screen.contains('_openInAppCamera'), isTrue);
    expect(screen.contains('captureImage()'), isFalse);
    expect(screen.contains('captureVideo()'), isFalse);
  });

  test('⓰ 相机**不再跳页**（机制判据）：零 Navigator.push ＋ 独立相机页已删', () {
    // ⚠️ 这一条钉的是 2026-11-16 那一刀的约定：「拍照要不要叠在聊天页上」
    // ⇒ ⇒ 相机**不许**再是独立页面 ⇒ ⇒ 不许靠 push 一个 route 实现。
    String code(String rel) {
      final src = File(rel).readAsStringSync();
      return src
          .replaceAll(RegExp(r'/\*[\s\S]*?\*/'), '')
          .split('\n')
          .map((l) => l.contains('//') ? l.substring(0, l.indexOf('//')) : l)
          .join('\n');
    }

    // ① 独立的相机页**已经不存在** ⇒ ⇒ 相机只能叠在聊天页上。
    expect(
      File('lib/screens/in_app_camera_page.dart').existsSync(),
      isFalse,
    );

    final screen = code('lib/screens/chat_screen.dart');
    // ② 聊天页**零** Navigator（跳页会让聊天页整页重建 ⇒ ⇒ 不是一体化）。
    expect(screen.contains('Navigator'), isFalse);
    expect(screen.contains('push<InAppCameraCapture>'), isFalse);
    expect(screen.contains('InAppCameraPage'), isFalse);
    // ③ 但**必须**真的把叠加层挂上去（不许只是「不跳页」而根本不拍）。
    expect(screen.contains('InAppCameraOverlay'), isTrue);
    expect(screen.contains('_cameraMode'), isTrue);
  });
}
