import 'dart:async';

import 'package:flutter/material.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../services/in_app_camera_service.dart';

/// **内建相机的本体** —— 预览 ＋ 快门 ＋ 关闭 ＋ 翻转。
///
/// ⚠️ 它**不再是一个页面**（2026-11-16 那一刀）：相机从「独立 route」
/// 改成「叠在聊天页上的一层」⇒ ⇒ 聊天页**不重建**、输入框里已经打的字
/// **不丢**、拍完附件**原地**出现在候选行上。
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
class InAppCameraView extends StatefulWidget {
  const InAppCameraView({
    super.key,
    required this.mode,
    required this.onCaptured,
    required this.onCancel,
    this.driverFactory,
    this.expanded = true,
    this.onToggleExpand,
  });

  /// 拍照片还是录视频。
  final InAppCameraMode mode;

  /// 拍到了 —— 带**路径**出去（照片能进候选）。
  final ValueChanged<InAppCameraCapture> onCaptured;

  /// 用户关掉了（取消）—— **不带任何东西**。
  final VoidCallback onCancel;

  /// 判据注入用（真机不给 ⇒ ⇒ 用真的插件）。
  ///
  /// ⚠️ camera 插件在判据环境里起不来（要平台通道、要真摄像头）
  /// ⇒ ⇒ 判据只能靠假实现驱动 ⇒ ⇒ 判据才有牙。
  final InAppCameraDriver Function()? driverFactory;

  /// 全屏（true）还是半屏叠在聊天页上（false）。
  final bool expanded;

  /// 点预览区 ⇒ ⇒ 在「半屏／全屏」之间翻。
  final VoidCallback? onToggleExpand;

  @override
  State<InAppCameraView> createState() => _InAppCameraViewState();
}

class _InAppCameraViewState extends State<InAppCameraView> {
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
    // ⚠️ 摄像头**必须**释放 ⇒ ⇒ 否则退出这一层之后摄像头一直被占着
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
    widget.onCaptured(InAppCameraCapture(path: path, isVideo: false));
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
      widget.onCaptured(InAppCameraCapture(path: path, isVideo: true));
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

    return Stack(
      fit: StackFit.expand,
      children: [
        // 预览层（**点一下** ⇒ ⇒ 半屏／全屏之间翻）
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
    );
  }

  Widget _buildPreview() {
    final preview = _driver.buildPreview();
    // 点预览区 ⇒ ⇒ 「半屏／全屏」之间翻（一体化：取景不够就放大）。
    final previewBox = KeyedSubtree(
      key: const Key('in_app_camera_preview'),
      child: preview,
    );
    final tappable = widget.onToggleExpand == null
        ? previewBox
        : GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: widget.onToggleExpand,
            child: previewBox,
          );
    // 前置摄像头镜像（与仓里既有的 CameraPreviewWrapper 一致）。
    if (!_driver.isFrontCamera) return tappable;
    return Transform(
      alignment: Alignment.center,
      transform: Matrix4.diagonal3Values(-1.0, 1.0, 1.0),
      child: tappable,
    );
  }

  Widget _buildTopBar(AppLocalizations l10n) {
    final topInset = widget.expanded
        ? MediaQuery.paddingOf(context).top
        : 0.0;
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: Padding(
        padding: EdgeInsets.fromLTRB(12, topInset + 8, 12, 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _roundButton(
              key: const Key('in_app_camera_close'),
              icon: Icons.close,
              label: l10n.cameraClose,
              onTap: widget.onCancel,
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
    // ⚠️ 半屏时这一层的底边**不是**屏幕底边 ⇒ ⇒ 不能用 SafeArea
    // ⇒ ⇒ 只有全屏时才避开系统栏。
    final bottomInset = widget.expanded
        ? MediaQuery.paddingOf(context).bottom
        : 0.0;
    final shutterSize = widget.expanded ? 72.0 : 58.0;

    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: Padding(
        padding: EdgeInsets.only(bottom: bottomInset + 24),
        child: Center(
          child: Semantics(
            key: const Key('in_app_camera_shutter'),
            button: true,
            label: label,
            child: InkWell(
              onTap: isVideo ? _toggleRecording : _takePhoto,
              customBorder: const CircleBorder(),
              child: Container(
                width: shutterSize,
                height: shutterSize,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 3),
                ),
                child: Center(
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 120),
                    width: _recording ? 28 : shutterSize - 14,
                    height: _recording ? 28 : shutterSize - 14,
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
              onPressed: widget.onCancel,
              child: Text(l10n.cameraClose),
            ),
          ],
        ),
      ),
    );
  }
}
