import 'dart:async';

import 'package:flutter/material.dart';

/// **单一输入条** —— 一个输入框**同时**是「打字」和「说话」。
///
/// ## 为什么不是「一个输入框 ＋ 一个麦克风钮」
///
/// ⚠️ 以前那一套要用户**自己切换**：左边附件钮、右边一个「键盘／麦克风」
/// 切换钮，切换之后输入区整个换成另一个控件（VoiceInputView）⇒ ⇒
/// 「我想说话」这件事要先点一下、再长按 ⇒ ⇒ 两步。
///
/// ⇒ ⇒ 现在**只有一个输入框**：
/// - **轻触** ⇒ 键盘（正常打字）；
/// - **长按** ⇒ 录音（按住说话）；
/// - **松手** ⇒ 转写成文字 ⇒ ⇒ 直接进对话；
/// - **按住时左右滑动** ⇒ 进入「放弃」态 ⇒ ⇒ 松手**不发送**。
///
/// ## 为什么用 Listener 而不是 GestureDetector
///
/// ⚠️ GestureDetector(onLongPress) 外面套一个 TextField **抢不到**长按
/// —— EditableText **自己**带一个长按识别器（用来弹选择工具栏）⇒ ⇒ 内层
/// 先赢 ⇒ ⇒ 外层的长按**永远不触发**。
///
/// ⇒ ⇒ 改用 Listener（**原始指针事件**，**不进手势竞技场**）⇒ ⇒
/// 它只是「看着」指针，不与 TextField 争 ⇒ ⇒ 两边能各干各的：
/// - TextField 照常处理点击／选字；
/// - 我们用**计时器**判断「按住了多久」⇒ ⇒ 到点才开始录音。
///
/// ## 键盘开着的时候，长按**不算**录音
///
/// ⚠️ 键盘开着 ⇒ 用户长按多半是想**选字／复制**⇒ ⇒ 那时抢走手势是抢
/// ⇒ ⇒ 只有**输入框没聚焦**时，长按才是「说话」。
class UnifiedInputBar extends StatefulWidget {
  final TextEditingController controller;

  /// 输入框能不能用（会话身份不确定／正在加载时为假）。
  final bool enabled;

  /// 正在等回话（发送按钮转圈）。
  final bool isLoading;

  /// 已经挂了附件（发送按钮不许空发）。
  final bool hasAttachments;

  /// 没聚焦时的提示（应当写清「轻触输入 · 长按说话」）。
  final String hintText;

  /// 聚焦时的提示。
  final String focusedHintText;

  /// 录音中（没滑动）的提示。
  final String recordingText;

  /// 录音中（**滑到两侧**）的提示 —— 此刻松手就是**放弃**。
  final String cancelText;

  /// 「＋」菜单里的两项。
  final String galleryLabel;
  final String fileLabel;

  /// 相机钮的提示（轻触拍照 / 长按录像 ⇒ ⇒ 提示里要写清**两种**手势）。
  final String cameraLabel;

  /// 发送。
  final VoidCallback? onSend;

  /// 长按到点 ⇒ 开始录音。
  final VoidCallback? onStartRecording;

  /// 松手 ⇒ 结束录音。[cancel] 为真表示**放弃**（滑到两侧松手）。
  final Future<void> Function(bool cancel) onFinishRecording;

  /// 「＋」菜单：相册。
  final VoidCallback? onPickImage;

  /// 「＋」菜单：文件。
  final VoidCallback? onPickFile;

  /// 相机钮轻触：拍照片。
  final VoidCallback? onCapturePhoto;

  /// 相机钮长按：拍视频。
  final VoidCallback? onCaptureVideo;

  const UnifiedInputBar({
    super.key,
    required this.controller,
    required this.enabled,
    required this.isLoading,
    required this.hasAttachments,
    required this.hintText,
    required this.focusedHintText,
    required this.recordingText,
    required this.cancelText,
    required this.galleryLabel,
    required this.fileLabel,
    required this.cameraLabel,
    this.onSend,
    this.onStartRecording,
    required this.onFinishRecording,
    this.onPickImage,
    this.onPickFile,
    this.onCapturePhoto,
    this.onCaptureVideo,
  });

  @override
  State<UnifiedInputBar> createState() => _UnifiedInputBarState();
}

class _UnifiedInputBarState extends State<UnifiedInputBar> {
  /// 按住多久算「说话」（短于它 ⇒ 就是点一下 ⇒ 打字）。
  static const Duration _holdDelay = Duration(milliseconds: 380);

  /// 左右滑动多少像素算「放弃」。
  static const double _slideCancelThreshold = 72;

  final FocusNode _focusNode = FocusNode();
  Timer? _holdTimer;
  bool _recording = false;
  bool _cancelArmed = false;
  double _pressDx = 0;
  double _slideDx = 0;

  @override
  void initState() {
    super.initState();
    // ⚠️ 聚焦状态变了要重建 ⇒ ⇒ 提示词要跟着换（没聚焦＝「长按说话」）。
    _focusNode.addListener(_onFocusChanged);
  }

  @override
  void dispose() {
    _holdTimer?.cancel();
    _focusNode.removeListener(_onFocusChanged);
    _focusNode.dispose();
    super.dispose();
  }

  void _onFocusChanged() {
    if (mounted) setState(() {});
  }

  // ---- 长按 ⇒ 录音 ------------------------------------------------------

  void _onPointerDown(PointerDownEvent event) {
    if (!widget.enabled || _recording) return;
    // ⚠️ 键盘开着 ⇒ 长按多半是想**选字**⇒ ⇒ 那时不抢手势。
    if (_focusNode.hasFocus) return;
    _pressDx = event.position.dx;
    _slideDx = 0;
    _holdTimer?.cancel();
    _holdTimer = Timer(_holdDelay, _beginRecording);
  }

  void _onPointerMove(PointerMoveEvent event) {
    // ⚠️ **按「距按下的绝对偏移」判**，不用引擎给的 delta 累加 ——
    // delta 是「距上一次事件」，跨批次时不一定接得上 ⇒ ⇒ 累加会漏掉
    // 那一大段 ⇒ ⇒ 真机实测：滑动取消**没触发**（请求照发了）。
    final offset = event.position.dx - _pressDx;
    if (_recording) {
      _slideDx = offset;
      final armed = offset.abs() > _slideCancelThreshold;
      if (armed != _cancelArmed && mounted) {
        debugPrint(
          'UnifiedInputBar: 滑到两侧 armed=$armed offset=${offset.toStringAsFixed(1)}',
        );
        setState(() => _cancelArmed = armed);
      }
      return;
    }
    // ⚠️ 还没到按住时长就滑开了 ⇒ ⇒ 那不是「说话」，是**划走** ⇒ ⇒
    // 取消计时器（别等它到点才开录）。
    if (_holdTimer?.isActive ?? false) {
      if ((event.position.dx - _pressDx).abs() > _slideCancelThreshold) {
        _holdTimer?.cancel();
        _holdTimer = null;
      }
    }
  }

  void _onPointerUp(PointerUpEvent event) {
    // ⚠️ **松手位置才算数** —— 「滑到两侧就放弃」问的是「**松手时**在哪」，
    // 不是「中途到过哪」⇒ ⇒ 用 UP 事件里的位置覆盖累计量。
    //
    // ⚠️ 真机读数（2026-11-15 23:52）：合成手势的 MOVE 只到 61.8px（最后
    // 那个位置在 **UP** 事件里）⇒ ⇒ 只看 MOVE 的话**松手位置丢了** ⇒ ⇒
    // 放弃判不出来 ⇒ ⇒ 请求照发。
    _slideDx = event.position.dx - _pressDx;
    _endPointer();
  }

  void _onPointerCancel(PointerCancelEvent event) => _endPointer(cancel: true);

  void _beginRecording() {
    _holdTimer = null;
    if (!mounted || _recording || !widget.enabled) return;
    // ⚠️ 录音时**不许**有光标/选区 ⇒ ⇒ 焦点收掉（键盘也不弹）。
    if (_focusNode.hasFocus) _focusNode.unfocus();
    setState(() {
      _recording = true;
      _cancelArmed = false;
      _slideDx = 0;
    });
    widget.onStartRecording?.call();
  }

  void _endPointer({bool cancel = false}) {
    _holdTimer?.cancel();
    _holdTimer = null;
    if (!_recording) return;
    // ⚠️ 判定用**松手时的偏移**（_slideDx），不是中途的「armed」态。
    final abandon = cancel || _slideDx.abs() > _slideCancelThreshold;
    debugPrint(
      'UnifiedInputBar: 松手 offset=${_slideDx.toStringAsFixed(1)} abandon=$abandon',
    );
    setState(() {
      _recording = false;
      _cancelArmed = false;
      _slideDx = 0;
    });
    widget.onFinishRecording(abandon);
  }

  // ---- 画面 --------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final canSend = widget.enabled &&
        (widget.hasAttachments || widget.controller.text.trim().isNotEmpty);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        // ⚠️ **一个**输入框 —— 轻触打字、长按说话。
        Expanded(
          child: Listener(
            behavior: HitTestBehavior.opaque,
            onPointerDown: _onPointerDown,
            onPointerMove: _onPointerMove,
            onPointerUp: _onPointerUp,
            onPointerCancel: _onPointerCancel,
            child: Stack(
              children: [
                _buildTextField(theme),
                // ⚠️ 录音时盖一层 —— **不换掉** TextField（换掉会让它手里的
                // 手势识别器在半途被 dispose ⇒ ⇒ Flutter 会抱怨）。
                if (_recording)
                  Positioned.fill(
                    child: IgnorePointer(
                      child: Container(
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: _cancelArmed
                              ? const Color(0xFF8E1111)
                              : theme.colorScheme.error,
                          borderRadius: BorderRadius.circular(24),
                        ),
                        child: Text(
                          _cancelArmed
                              ? widget.cancelText
                              : widget.recordingText,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 4),
        // ⚠️ 文件／图片入口 ⇒ ⇒ **挪到右边**，并变成「＋」。
        _buildPlusButton(theme),
        const SizedBox(width: 4),
        // ⚠️ 相机钮 —— 轻触拍照片、**长按拍视频**。
        _buildCameraButton(theme),
        const SizedBox(width: 4),
        _buildSendButton(theme, canSend),
      ],
    );
  }

  Widget _buildTextField(ThemeData theme) {
    final focused = _focusNode.hasFocus;
    return TextField(
      controller: widget.controller,
      focusNode: _focusNode,
      enabled: widget.enabled,
      maxLines: 4,
      minLines: 1,
      textInputAction: TextInputAction.send,
      onSubmitted: (_) => widget.onSend?.call(),
      // ⚠️ 没聚焦时**关掉**交互选择 ⇒ ⇒ TextField 那个长按识别器不会弹
      // 选择工具栏 ⇒ ⇒ 我们的长按计时器才拿得到这个手势。
      enableInteractiveSelection: focused,
      decoration: InputDecoration(
        hintText: focused ? widget.focusedHintText : widget.hintText,
        isDense: true,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(24),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 12,
        ),
      ),
    );
  }

  Widget _buildPlusButton(ThemeData theme) {
    return PopupMenuButton<String>(
      icon: const Icon(Icons.add),
      tooltip: widget.fileLabel,
      onSelected: (value) {
        if (value == 'gallery') {
          widget.onPickImage?.call();
        } else if (value == 'file') {
          widget.onPickFile?.call();
        }
      },
      itemBuilder: (context) => [
        PopupMenuItem(
          value: 'gallery',
          child: Row(
            children: [
              const Icon(Icons.photo_library),
              const SizedBox(width: 8),
              Text(widget.galleryLabel),
            ],
          ),
        ),
        PopupMenuItem(
          value: 'file',
          child: Row(
            children: [
              const Icon(Icons.insert_drive_file),
              const SizedBox(width: 8),
              Text(widget.fileLabel),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildCameraButton(ThemeData theme) {
    return Tooltip(
      message: widget.cameraLabel,
      child: GestureDetector(
        // ⚠️ 轻触＝拍照片；**长按＝拍视频**（同一个钮，不多占地方）。
        onTap: widget.onCapturePhoto,
        onLongPress: widget.onCaptureVideo,
        behavior: HitTestBehavior.opaque,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Icon(
            Icons.camera_alt,
            color: widget.enabled
                ? theme.colorScheme.primary
                : theme.disabledColor,
          ),
        ),
      ),
    );
  }

  Widget _buildSendButton(ThemeData theme, bool canSend) {
    return IconButton.filled(
      onPressed: canSend ? widget.onSend : null,
      icon: widget.isLoading && widget.controller.text.trim().isEmpty
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white,
              ),
            )
          : const Icon(Icons.send),
    );
  }
}
