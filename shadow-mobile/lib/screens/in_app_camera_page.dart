import 'dart:async';

import 'package:flutter/material.dart';

import '../generated/l10n/app_localizations.dart';
import '../services/in_app_camera_service.dart';

/// 内建相机页的模式。
enum InAppCameraMode {
  /// 拍照（📷 **轻触**）。
  photo,

  /// 录像（📷 **长按**）。
  video,
}

/// **App 内建相机页** —— 自己拍，**不走系统相机**。
///
/// ⚠️ 为什么不用系统相机（image_picker 的 ImageSource.camera）：
/// 那条路靠 **intent 回合**把照片带回来 ⇒ ⇒ 回合一断就**静默丢照片**。
/// 真机实测（MIX 4 / MIUI，2026-11-16）：
///   「FATAL EXCEPTION: JpegEncoderThread」（Process: com.android.camera）
///   「java.lang.IllegalArgumentException: getCameraCharacteristics:790:
///    Unable to retrieve camera characteristics for unknown device -1」
///   ⇒ ⇒ 「Force finishing activity com.android.camera/.OneShotCamera」
///   ⇒ ⇒ 我们这边拿到的是**空的回包** ⇒ ⇒ pickImage 返回 null
///   ⇒ ⇒ 候选（附件行）里什么都没有，**也没有任何提示**。
/// ⇒ ⇒ 自己拍 ⇒ ⇒ 拍完直接进附件 ⇒ ⇒ 那个回合根本不存在。
class InAppCameraPage extends StatefulWidget {
  const InAppCameraPage({
    super.key,
    this.mode = InAppCameraMode.photo,
    this.driverFactory,
  });

  final InAppCameraMode mode;

  /// 判据注入用（真机不给 ⇒ ⇒ 用真的插件）。
  ///
  /// ⚠️ camera 插件在判据环境里起不来（要平台通道、要真摄像头）
  /// ⇒ ⇒ 判据只能靠假实现驱动这一页 ⇒ ⇒ 判据才有牙。
  final InAppCameraDriver Function()? driverFactory;

  /// 打开这一页的标准入口（返回拍好的东西，取消返回 null）。
  static Route<InAppCameraCapture> route({
    InAppCameraMode mode = InAppCameraMode.photo,
    InAppCameraDriver Function()? driverFactory,
  }) {
    return MaterialPageRoute<InAppCameraCapture>(
      builder: (_) => InAppCameraPage(
        mode: mode,
        driverFactory: driverFactory,
      ),
    );
  }

  @override
  State<InAppCameraPage> createState() => _InAppCameraPageState();
}

class _InAppCameraPageState extends State<InAppCameraPage> {
  late final InAppCameraDriver _driver =
      (widget.driverFactory ?? PluginInAppCameraDriver.new)();

  /// null ＝ 还在开；否则是开的结果。
  InAppCameraOpenStatus? _openStatus;

  /// 「拍/录失败」的实话（开不起来走另一套文案）。
  String? _errorText;

  bool _busy = false;
  bool _recording = false;
  int _recordSeconds = 0;
  Timer? _recordTimer;

  @override
  void initState() {
    super.initState();
    _open();
  }

  @override
  void dispose() {
    _recordTimer?.cancel();
    // ⚠️ 摄像头**必须**释放 ⇒ ⇒ 否则退出这一页之后摄像头一直被占着
    // ⇒ ⇒ 别的 App（甚至我们自己的视频通话）都开不了。
    unawaited(_driver.close());
    super.dispose();
  }

  Future<void> _open() async {
    final status = await _driver.open(
      needAudio: widget.mode == InAppCameraMode.video,
    );
    if (!mounted) return;
    setState(() => _openStatus = status);
  }

  Future<void> _takePhoto() async {
    if (_busy) return;
    final l10n = AppLocalizations.of(context)!;
    setState(() {
      _busy = true;
      _errorText = null;
    });
    final path = await _driver.takePhoto();
    if (!mounted) return;
    setState(() => _busy = false);
    if (path == null) {
      // ⚠️ 不许静默 —— 拍不出来就要**说**出来。
      setState(() => _errorText = l10n.captureFailed);
      return;
    }
    Navigator.of(context).pop(
      InAppCameraCapture(path: path, isVideo: false),
    );
  }

  Future<void> _toggleRecording() async {
    if (_busy) return;
    final l10n = AppLocalizations.of(context)!;
    if (_recording) {
      setState(() => _busy = true);
      final path = await _driver.stopRecording();
      _recordTimer?.cancel();
      _recordTimer = null;
      if (!mounted) return;
      setState(() {
        _busy = false;
        _recording = false;
      });
      if (path == null) {
        setState(() => _errorText = l10n.captureFailed);
        return;
      }
      Navigator.of(context).pop(
        InAppCameraCapture(path: path, isVideo: true),
      );
      return;
    }

    setState(() {
      _busy = true;
      _errorText = null;
    });
    final ok = await _driver.startRecording();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _recording = ok;
      _recordSeconds = 0;
    });
    if (!ok) {
      setState(() => _errorText = l10n.captureFailed);
      return;
    }
    _recordTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (mounted) setState(() => _recordSeconds++);
    });
  }

  Future<void> _flip() async {
    if (_busy) return;
    setState(() => _busy = true);
    final ok = await _driver.switchCamera();
    if (!mounted) return;
    setState(() => _busy = false);
    if (!ok) {
      final l10n = AppLocalizations.of(context)!;
      setState(() => _errorText = l10n.cameraUnavailable);
    }
  }

  void _close() {
    Navigator.of(context).pop();
  }

  String _formatDuration(int seconds) {
    final m = (seconds ~/ 60).toString().padLeft(2, '0');
    final s = (seconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  String _openErrorText(AppLocalizations l10n, InAppCameraOpenStatus status) {
    switch (status) {
      case InAppCameraOpenStatus.permissionDenied:
        return l10n.cameraPermissionDenied;
      case InAppCameraOpenStatus.noCamera:
        return l10n.cameraUnavailable;
      case InAppCameraOpenStatus.failed:
        return l10n.cameraOpenFailed;
      case InAppCameraOpenStatus.ok:
        return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final status = _openStatus;
    final ready = status == InAppCameraOpenStatus.ok;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // 预览层
          if (ready) _buildPreview(),
          // 顶部：关闭 ＋ 翻转
          if (ready) _buildTopBar(l10n),
          // 底部：快门
          if (ready) _buildBottomBar(l10n),
          // 还在开
          if (status == null) const Center(child: CircularProgressIndicator()),
          // 开不起来 ⇒ ⇒ **说真话**（不许黑屏装死）
          if (status != null && !ready) _buildOpenError(l10n, status),
          // 拍/录失败的实话
          if (ready && _errorText != null)
            Positioned(
              left: 24,
              right: 24,
              bottom: 140,
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.black54,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    _errorText!,
                    style: const TextStyle(color: Colors.white, fontSize: 14),
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildPreview() {
    final preview = _driver.buildPreview();
    // 前置摄像头镜像（与仓里既有的 CameraPreviewWrapper 一致）。
    if (!_driver.isFrontCamera) return preview;
    return Transform(
      alignment: Alignment.center,
      transform: Matrix4.diagonal3Values(-1.0, 1.0, 1.0),
      child: preview,
    );
  }

  Widget _buildTopBar(AppLocalizations l10n) {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _roundButton(
                key: const Key('in_app_camera_close'),
                icon: Icons.close,
                label: l10n.cameraClose,
                onTap: _close,
              ),
              if (_recording)
                Row(
                  children: [
                    const Icon(Icons.circle, color: Colors.red, size: 12),
                    const SizedBox(width: 6),
                    Text(
                      _formatDuration(_recordSeconds),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                      ),
                    ),
                  ],
                ),
              _roundButton(
                key: const Key('in_app_camera_flip'),
                icon: Icons.flip_camera_ios_outlined,
                label: l10n.cameraFlip,
                onTap: _flip,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _roundButton({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    Key? key,
  }) {
    return Semantics(
      key: key,
      button: true,
      label: label,
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.black38,
          ),
          child: Icon(icon, color: Colors.white, size: 22),
        ),
      ),
    );
  }

  Widget _buildBottomBar(AppLocalizations l10n) {
    final isVideo = widget.mode == InAppCameraMode.video;
    final label = _recording
        ? l10n.stopRecording
        : (isVideo ? l10n.recordVideo : l10n.shutter);

    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.only(bottom: 28),
          child: Center(
            child: Semantics(
              key: const Key('in_app_camera_shutter'),
              button: true,
              label: label,
              child: InkWell(
                onTap: isVideo ? _toggleRecording : _takePhoto,
                customBorder: const CircleBorder(),
                child: Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 3),
                  ),
                  child: Center(
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 120),
                      width: _recording ? 28 : 58,
                      height: _recording ? 28 : 58,
                      decoration: BoxDecoration(
                        color: _recording ? Colors.red : Colors.white,
                        borderRadius: BorderRadius.circular(
                          _recording ? 6 : 40,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildOpenError(AppLocalizations l10n, InAppCameraOpenStatus status) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.no_photography_outlined,
              color: Colors.white70,
              size: 44,
            ),
            const SizedBox(height: 14),
            Text(
              _openErrorText(l10n, status),
              style: const TextStyle(color: Colors.white, fontSize: 15),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 18),
            FilledButton(
              onPressed: _close,
              child: Text(l10n.cameraClose),
            ),
          ],
        ),
      ),
    );
  }
}
