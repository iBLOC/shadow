import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

/// 打开相机的结果 —— 每一档都对应**一句能说给人听的实话**。
///
/// ⚠️ 不许把「失败」压成一种：
/// - [permissionDenied]（权限被拒）⇒ ⇒ 用户能做的事是**去设置里批权限**；
/// - [noCamera]（没有摄像头）⇒ ⇒ 用户能做的事是**换设备**；
/// - [failed]（打开失败）⇒ ⇒ 用户能做的事是**重试**。
/// ⇒ ⇒ 三件事混成一句「相机打不开」⇒ ⇒ 用户只能干瞪眼。
enum InAppCameraOpenStatus {
  ok,
  permissionDenied,
  noCamera,
  failed,
}

/// 要**拍照片**还是**录视频**。
///
/// ⚠️ 它跟着「能力层」走（不是 UI 层）⇒ ⇒ 页面、叠加层、聊天页
/// 说的是**同一个**请求，不许各写一份。
enum InAppCameraMode {
  /// 拍照（📷 **轻触**）。
  photo,

  /// 录像（📷 **长按**）。
  video,
}

/// 拍摄产物 —— 照片或录像（**路径** ＋ **是不是视频**）。
class InAppCameraCapture {
  final String path;
  final bool isVideo;

  const InAppCameraCapture({required this.path, required this.isVideo});
}

/// 相机能力的抽象。
///
/// ⚠️ 为什么要有这一层（不是「为了好看」）：
/// camera 插件在 **widget 判据环境里起不来** —— 它要平台通道、
/// 要真摄像头 ⇒ ⇒ 判据没法直接驱动它 ⇒ ⇒ 判据只能是「假绿」。
/// ⇒ ⇒ 把「开相机／拍／录／翻」抽成接口
/// ⇒ ⇒ 真机用 [PluginInAppCameraDriver]，判据用假实现。
abstract class InAppCameraDriver {
  /// 开相机（申请权限 ＋ 初始化）。
  ///
  /// - [useFrontCamera] ⇒ ⇒ 优先前置摄像头；
  /// - [needAudio] ⇒ ⇒ 录像要声音（照片用不到 ⇒ ⇒ 不申请麦克风）。
  Future<InAppCameraOpenStatus> open({
    bool useFrontCamera = false,
    bool needAudio = false,
  });

  /// 预览层准备好了没。
  bool get isReady;

  /// 正在录像没。
  bool get isRecording;

  /// 当前是不是前置摄像头（前置预览要镜像）。
  bool get isFrontCamera;

  /// 预览层（真机是 CameraPreview）。
  Widget buildPreview();

  /// 拍照 ⇒ ⇒ 返回文件路径；失败返回 null。
  Future<String?> takePhoto();

  /// 开始录像 ⇒ ⇒ 成功返回 true。
  Future<bool> startRecording();

  /// 停止录像 ⇒ ⇒ 返回文件路径；失败返回 null。
  Future<String?> stopRecording();

  /// 前后摄像头切换 ⇒ ⇒ 成功返回 true。
  Future<bool> switchCamera();

  /// 收摊（释放摄像头）—— **必须**调 ⇒ ⇒ 否则摄像头一直被占着。
  Future<void> close();
}

/// 真机实现 —— 直接驱动 camera 插件。
class PluginInAppCameraDriver implements InAppCameraDriver {
  CameraController? _controller;
  List<CameraDescription>? _cameras;
  int _index = 0;

  @override
  bool get isReady => _controller?.value.isInitialized ?? false;

  @override
  bool get isRecording => _controller?.value.isRecordingVideo ?? false;

  @override
  bool get isFrontCamera =>
      (_cameras != null &&
          _index < _cameras!.length &&
          _cameras![_index].lensDirection == CameraLensDirection.front);

  @override
  Future<InAppCameraOpenStatus> open({
    bool useFrontCamera = false,
    bool needAudio = false,
  }) async {
    // ① 权限 —— 「声明 ≠ 授予」。
    // ⚠️ 本仓**自己**的 AndroidManifest 并没有写 CAMERA，是 camera
    // 插件的清单合并进来的 ⇒ ⇒ 合并进来只等于「声明」
    // ⇒ ⇒ 授予仍然要运行期真申请。
    var status = await Permission.camera.status;
    if (!status.isGranted) {
      status = await Permission.camera.request();
      if (!status.isGranted) {
        debugPrint('InAppCamera: 相机权限被拒 ⇒ ⇒ 相机页要说实话，不能静默');
        return InAppCameraOpenStatus.permissionDenied;
      }
    }

    // ② 相机清单
    try {
      _cameras = await availableCameras();
    } catch (e) {
      debugPrint('InAppCamera: availableCameras 失败: $e');
      return InAppCameraOpenStatus.failed;
    }
    if (_cameras == null || _cameras!.isEmpty) {
      debugPrint('InAppCamera: 这台设备没有可用摄像头');
      return InAppCameraOpenStatus.noCamera;
    }

    _index = _pickIndex(
      useFrontCamera ? CameraLensDirection.front : CameraLensDirection.back,
    );
    if (_index < 0) _index = 0;

    // ③ 初始化
    final ok = await _initController(needAudio: needAudio);
    if (ok != null) return InAppCameraOpenStatus.ok;
    if (needAudio) {
      // 带音频开不起来（多半是麦克风没批）⇒ ⇒ 退回**无声**录像
      // ⇒ ⇒ 宁可没声音，也别整个相机用不了。
      if (await _initController(needAudio: false) != null) {
        debugPrint('InAppCamera: 带音频开不起来 ⇒ ⇒ 退回无声录像');
        return InAppCameraOpenStatus.ok;
      }
    }
    return InAppCameraOpenStatus.failed;
  }

  int _pickIndex(CameraLensDirection direction) {
    for (var i = 0; i < _cameras!.length; i++) {
      if (_cameras![i].lensDirection == direction) return i;
    }
    return -1;
  }

  Future<CameraController?> _initController({required bool needAudio}) async {
    final desc = _cameras![_index];
    final controller = CameraController(
      desc,
      ResolutionPreset.high,
      enableAudio: needAudio,
    );
    try {
      await controller.initialize();
      _controller = controller;
      return controller;
    } catch (e) {
      debugPrint('InAppCamera: 初始化失败（needAudio=$needAudio）: $e');
      try {
        await controller.dispose();
      } catch (disposeError) {
        // ⚠️ 释放失败**也要说出来**（不许空 catch ⇒ ⇒ 那是「把失败咽下去」）
        debugPrint('InAppCamera: 释放失败的控制器也释放不掉: $disposeError');
      }
      return null;
    }
  }

  @override
  Widget buildPreview() {
    final c = _controller;
    if (c == null || !c.value.isInitialized) {
      return const ColoredBox(color: Colors.black);
    }
    return CameraPreview(c);
  }

  @override
  Future<String?> takePhoto() async {
    final c = _controller;
    if (c == null || !c.value.isInitialized) return null;
    try {
      final x = await c.takePicture();
      debugPrint('InAppCamera: 拍到照片 ${x.path}');
      return x.path;
    } catch (e) {
      debugPrint('InAppCamera: 拍照失败: $e');
      return null;
    }
  }

  @override
  Future<bool> startRecording() async {
    final c = _controller;
    if (c == null || !c.value.isInitialized) return false;
    if (c.value.isRecordingVideo) return false;
    try {
      await c.startVideoRecording();
      debugPrint('InAppCamera: 开始录像');
      return true;
    } catch (e) {
      debugPrint('InAppCamera: 开始录像失败: $e');
      return false;
    }
  }

  @override
  Future<String?> stopRecording() async {
    final c = _controller;
    if (c == null || !c.value.isInitialized) return null;
    try {
      final x = await c.stopVideoRecording();
      debugPrint('InAppCamera: 录到视频 ${x.path}');
      return x.path;
    } catch (e) {
      debugPrint('InAppCamera: 停止录像失败: $e');
      return null;
    }
  }

  @override
  Future<bool> switchCamera() async {
    if (_cameras == null || _cameras!.length < 2) return false;
    final current = _index;
    for (var i = 0; i < _cameras!.length; i++) {
      if (i != current &&
          _cameras![i].lensDirection != _cameras![current].lensDirection) {
        _index = i;
        break;
      }
    }
    if (_index == current) return false;
    final wasRecording = isRecording;
    final old = _controller;
    _controller = null;
    if (old != null) {
      try {
        await old.dispose();
      } catch (e) {
        debugPrint('InAppCamera: 释放旧控制器失败: $e');
      }
    }
    final ok = await _initController(needAudio: wasRecording);
    if (ok == null) {
      // 翻不过去 ⇒ ⇒ 退回原来那一颗（不许把摄像头搞没）。
      _index = current;
      await _initController(needAudio: wasRecording);
      return false;
    }
    return true;
  }

  @override
  Future<void> close() async {
    final c = _controller;
    _controller = null;
    if (c != null) {
      try {
        await c.dispose();
      } catch (e) {
        debugPrint('InAppCamera: 释放控制器失败: $e');
      }
    }
  }
}
