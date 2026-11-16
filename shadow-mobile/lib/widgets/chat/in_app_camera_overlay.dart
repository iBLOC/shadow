import 'package:flutter/material.dart';

import '../../services/in_app_camera_service.dart';
import 'in_app_camera_view.dart';

/// **相机叠加层** —— 叠在**聊天页自己身上**的一层。
///
/// ⚠️ 为什么要「叠加」而不是「跳页」（2026-11-16 那一刀）：
/// 跳页（Navigator.push）⇒ ⇒ 聊天页**整页重建** ⇒ ⇒ 输入框里已经打的字
/// **可能丢**、滚动位置**跳回**、附件行**闪一下** ⇒ ⇒ 用户感觉「换了个页」。
/// ⇒ ⇒ 叠在同一棵 widget 树上 ⇒ ⇒ 聊天页**一秒都没动过** ⇒ ⇒ 拍完附件
/// **原地**出现在候选行上 ⇒ ⇒ 那才叫一体化。
///
/// ⚠️ 形态：**默认半屏**（底部那块，上面的聊天**仍然可见、可点**）
/// ⇒ ⇒ 拍照时还能看见对方刚发的消息（拍屏幕、拍文档都用得上）。
/// ⇒ ⇒ 取景不够就**点一下预览区放大成全屏**，再点一下收回来。
class InAppCameraOverlay extends StatefulWidget {
  const InAppCameraOverlay({
    super.key,
    required this.mode,
    required this.onCaptured,
    required this.onCancel,
    this.driverFactory,
  });

  /// 拍照片还是录视频。
  final InAppCameraMode mode;

  /// 拍到了 —— 带**路径**出去（照片能进候选）。
  final ValueChanged<InAppCameraCapture> onCaptured;

  /// 用户关掉了（取消）—— **不带任何东西**。
  final VoidCallback onCancel;

  /// 判据注入用（真机不给 ⇒ ⇒ 用真的插件）。
  final InAppCameraDriver Function()? driverFactory;

  @override
  State<InAppCameraOverlay> createState() => _InAppCameraOverlayState();
}

class _InAppCameraOverlayState extends State<InAppCameraOverlay> {
  /// 现在是全屏还是半屏。
  bool _expanded = false;

  /// 半屏占屏高多少 —— 上面的聊天要**留着**。
  static const double _compactFraction = 0.58;

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.sizeOf(context).height;
    final compactHeight = (screenHeight * _compactFraction)
        .clamp(240.0, screenHeight);

    return Stack(
      fit: StackFit.expand,
      children: [
        // ⚠️ 只有**相机那一块**吃触摸 ⇒ ⇒ 上面的聊天**照常能点**。
        Align(
          alignment: Alignment.bottomCenter,
          child: AnimatedContainer(
            // ⚠️ 这块是「相机本体」⇒ ⇒ 判据靠它量形态（半屏／全屏）。
            key: const Key('in_app_camera_panel'),
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOut,
            height: _expanded ? screenHeight : compactHeight,
            width: double.infinity,
            color: Colors.black,
            child: InAppCameraView(
              mode: widget.mode,
              expanded: _expanded,
              driverFactory: widget.driverFactory,
              onCaptured: widget.onCaptured,
              onCancel: widget.onCancel,
              onToggleExpand: () => setState(() => _expanded = !_expanded),
            ),
          ),
        ),
      ],
    );
  }
}
