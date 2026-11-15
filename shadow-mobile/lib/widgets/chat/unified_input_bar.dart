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
/// - **按住时左滑** ⇒ 进入「放弃」态 ⇒ ⇒ 松手**不发送**；
/// - **按住时右滑** ⇒ 进入「相机」态 ⇒ ⇒ 松手**丢掉这段录音 ＋ 打开摄像头**；
/// - **按住时上滑到屏幕顶部的「取消」区** ⇒ ⇒ 同样进入「放弃」态（微信那一族）。
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
/// ## 为什么**没有**发送按钮
///
/// ⚠️ 2026-11-15 那一刀把右侧那个圆形发送钮**删了** ⇒ ⇒ 文字**靠键盘上的
/// 发送键**发出去（`textInputAction: TextInputAction.send` ＋
/// `onSubmitted` ⇒ ⇒ 输入框自带那个「发送」键）⇒ ⇒ 右侧只留「＋」「📷」。
///
/// ⚠️ 顺带把**空发**这条防线也带走了（以前那个钮在没有字、也没有附件时
/// 是**禁用**的）⇒ ⇒ 现在**唯一**的防线是 `chat_screen._sendMessage()` 里
/// 「没文字也没附件 ⇒ 直接返回」那一格 ⇒ ⇒ 那一格**不许**被删。
///
/// ## 输入区是**一个整体容器**
///
/// ⚠️ 2026-11-16：「＋」（相册/文件）挪到**输入框左侧**，「📷」在**右侧**
/// ⇒ ⇒ 三样东西在**同一个圆角框**里 ⇒ ⇒ 「输入框」看着是一个东西。
///
/// ⚠️ **只有文字区**接管长按录音 ⇒ ⇒ 长按「📷」不许顺带开录音
/// （「📷」长按是**拍视频** ⇒ ⇒ 录音与录像打架 ⇒ ⇒ 一条手势两个意思）。
///
/// ## 录音态：**整屏遮罩**（微信那一族）
///
/// ⚠️ 以前录音态只在**输入框那一小块**里变红 ⇒ ⇒ 用户根本**看不见**「往哪
/// 移才算放弃」⇒ ⇒ 「滑动取消」是一个**没人知道**的手势。
///
/// ⇒ ⇒ 现在录音时弹一层**单独的整屏遮罩**（挂在 `Overlay` 上，不是输入框
/// 里的 Stack）：
/// - 顶部一条**「取消发送」目标区**（微信那样）⇒ ⇒ **上滑到那里**松手＝放弃；
/// - 正中一个大圆 + 大字：「松手发送」／进了取消区就换成「松手放弃」；
/// - 遮罩把整个界面压暗 ⇒ ⇒ 录音时界面只剩这一件事。
///
/// ⚠️ 遮罩是 `IgnorePointer` ⇒ ⇒ 它**不**接管手势 ⇒ ⇒ 指针事件仍旧由
/// 输入框那个 `Listener` 收（它是 DOWN 时就在命中路径上的）。
///
/// ## 录音态的三条手势：**左＝放弃、右＝相机、上＝放弃**
///
/// ⚠️ 2026-11-16：原来「按住时左右滑动」**两个方向都是放弃** ⇒ ⇒ 右滑那一下
/// 什么也换不来 ⇒ ⇒ 用户要的是「右滑顺势打开摄像头」。
///
/// ⇒ ⇒ 现在按**松手位置**判三件事：
/// - **左滑** ⇒ 放弃（丢掉这段录音，不发送）；
/// - **右滑** ⇒ 打开摄像头（**这段录音照样丢掉** —— 已经切模式了）；
/// - **上滑到顶部「取消」区** ⇒ 放弃。
///
/// ⚠️ 优先级：**顶部取消区 > 右滑 > 左滑** ⇒ ⇒ 那个区是**看得见**的目标
/// （药丸变红）⇒ ⇒ 「看到的」和「做的」必须一致 ⇒ ⇒ 进了它就一定是放弃。
///
/// ## 「＋」**只支持单击**
///
/// ⚠️ 2026-11-16 取证（实测）：`PopupMenuButton` 的结构是
/// `Tooltip(→ InkWell(onTap))` ⇒ ⇒ `Tooltip` 的长按识别器**比** `onTap`
/// **先赢下手势竞技场**（长按 500ms 时它先接受 ⇒ `onTap` 被拒）⇒ ⇒
/// **长按「＋」不弹菜单，但会弹一句 Tooltip 提示**（树里能看到
/// `_TooltipBox` ＋ `RichText`）。
///
/// ⇒ ⇒ 「只支持单击」＝ 长按**不许有任何反应** ⇒ ⇒ 那句提示也不许有
/// ⇒ ⇒ **自己开菜单**（`showMenu`，与 `PopupMenuButton` 内部同一条路），
/// 标签改用 `Semantics`（设备上仍是 `Button cd=[文件]`）。
///
/// ## 键盘开着的时候，长按**不算**录音
///
/// ⚠️ 键盘开着 ⇒ 用户长按多半是想**选字／复制**⇒ ⇒ 那时抢走手势是抢
/// ⇒ ⇒ 只有**输入框没聚焦**时，长按才是「说话」。
/// 录音时「**松手**会发生什么」。
///
/// ⚠️ 三个态**共用**一条判据（`_actionFor`）⇒ ⇒ 「看到的」（遮罩上的提示）
/// 与「做的」（松手的后果）**永远一致** ⇒ ⇒ 不会出现「界面说一套、手指做另一套」。
enum _ReleaseAction {
  /// 正常录音 ⇒ 松手＝转写并发送。
  send,

  /// 放弃 ⇒ 松手＝丢掉这段录音。
  cancel,

  /// 切相机 ⇒ 松手＝丢掉这段录音 ＋ 打开摄像头。
  camera,
}

class UnifiedInputBar extends StatefulWidget {
  final TextEditingController controller;

  /// 输入框能不能用（会话身份不确定／正在加载时为假）。
  final bool enabled;

  /// 正在等回话（输入框**外面**有一枚小转圈）。
  ///
  /// ⚠️ 这个参数以前是喂给**发送按钮**的（按钮转圈）⇒ ⇒ 删掉发送按钮之后
  /// 它**不能跟着一起死** —— 「等回话」那一段**必须有忙碌指示** ⇒ ⇒ 否则
  /// 「按了发送、界面没动静」和「正在回话」长得**一模一样**
  /// ⇒ ⇒ 「失败长得像成功」那一族。
  final bool isLoading;

  /// 没聚焦时的提示（应当写清「轻触输入 · 长按说话」）。
  final String hintText;

  /// 聚焦时的提示。
  final String focusedHintText;

  /// 录音中（没滑动）的提示。
  final String recordingText;

  /// 录音中（**滑到两侧**）的提示 —— 此刻松手就是**放弃**。
  final String cancelText;

  /// 顶部「取消发送」**目标区**的标签（上滑到那里就放弃）。
  final String cancelZoneText;

  /// 录音中（**右滑**＝切相机）的提示 —— 此刻松手就是**打开摄像头**。
  final String cameraText;

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

  /// 整屏遮罩的 Key（判据要按它找 —— 遮罩在 `Overlay` 上，**不在**输入框里）。
  static const Key recordingOverlayKey = Key('shadow-voice-recording-overlay');

  /// 输入区**整体容器**的 Key（「＋」在左、文字在中、「📷」在右，三样都在它里面）。
  static const Key inputAreaKey = Key('shadow-unified-input-area');

  const UnifiedInputBar({
    super.key,
    required this.controller,
    required this.enabled,
    required this.isLoading,
    required this.hintText,
    required this.focusedHintText,
    required this.recordingText,
    required this.cancelText,
    required this.cancelZoneText,
    required this.cameraText,
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

  /// 左右滑动多少像素算「切模式」（**左＝放弃、右＝开相机**）。
  static const double _slideThreshold = 72;

  /// 顶部「取消发送」目标区的高度（逻辑像素，从**屏幕顶**算起）。
  static const double _cancelZoneHeight = 88;

  final FocusNode _focusNode = FocusNode();
  Timer? _holdTimer;
  bool _recording = false;

  /// 录音中「松手会发生什么」（由**松手位置**判 ⇒ ⇒ 遮罩上写什么就是做什么）。
  _ReleaseAction _action = _ReleaseAction.send;
  double _pressDx = 0;
  double _slideDx = 0;

  /// 指针当前的位置（**全局**坐标）—— 判「在不在取消区」用。
  double _pointerDy = 0;

  /// 整屏遮罩（挂在 `Overlay` 上）。
  OverlayEntry? _overlayEntry;

  @override
  void initState() {
    super.initState();
    // ⚠️ 聚焦状态变了要重建 ⇒ ⇒ 提示词要跟着换（没聚焦＝「长按说话」）。
    _focusNode.addListener(_onFocusChanged);
  }

  @override
  void dispose() {
    _hideRecordingOverlay();
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
    _pointerDy = event.position.dy;
    _slideDx = 0;
    _action = _ReleaseAction.send;
    _holdTimer?.cancel();
    _holdTimer = Timer(_holdDelay, _beginRecording);
  }

  void _onPointerMove(PointerMoveEvent event) {
    _pointerDy = event.position.dy;
    // ⚠️ **按「距按下的绝对偏移」判**，不用引擎给的 delta 累加 ——
    // delta 是「距上一次事件」，跨批次时不一定接得上 ⇒ ⇒ 累加会漏掉
    // 那一大段 ⇒ ⇒ 真机实测：滑动取消**没触发**（请求照发了）。
    final offset = event.position.dx - _pressDx;
    if (_recording) {
      _slideDx = offset;
      // ⚠️ **三条路径**（左滑放弃 ／ 右滑切相机 ／ 上滑进顶部取消区）**共用**
      // 一个判据 ⇒ ⇒ 「遮罩上写的」与「松手做的」永远一致。
      final action = _actionFor(offset, event.position.dy);
      if (action != _action && mounted) {
        debugPrint(
          'UnifiedInputBar: armed=${action.name} 右滑=${offset >= _slideThreshold} '
          '左滑=${offset <= -_slideThreshold} 取消区=${_inCancelZone(event.position.dy)} '
          'offset=${offset.toStringAsFixed(1)}',
        );
        setState(() => _action = action);
        // ⚠️ 遮罩住在 `Overlay` 上 ⇒ ⇒ 它的重建**不归**我们的 setState
        // 管 ⇒ ⇒ 要**单独**叫它重建。
        _overlayEntry?.markNeedsBuild();
      }
      return;
    }
    // ⚠️ 还没到按住时长就滑开了 ⇒ ⇒ 那不是「说话」，是**划走** ⇒ ⇒
    // 取消计时器（别等它到点才开录）。
    if (_holdTimer?.isActive ?? false) {
      if ((event.position.dx - _pressDx).abs() > _slideThreshold) {
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
    _pointerDy = event.position.dy;
    _slideDx = event.position.dx - _pressDx;
    // ⚠️ **松手位置才算数**（同一条纪律）—— 中途路过顶部／滑到右边都不算数。
    _action = _actionFor(_slideDx, _pointerDy);
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
      _slideDx = 0;
      // ⚠️ 可能在**按住之前**就把手指滑到顶部了 ⇒ ⇒ 开录那一刻就要算。
      _action = _actionFor(0, _pointerDy);
    });
    // ⚠️ 弹**整屏遮罩**（微信那一族）—— 以前录音态只在输入框那一小块变红
    // ⇒ ⇒ 用户根本看不见「往哪移才算放弃」。
    _showRecordingOverlay();
    widget.onStartRecording?.call();
  }

  void _endPointer({bool cancel = false}) {
    _holdTimer?.cancel();
    _holdTimer = null;
    if (!_recording) return;
    // ⚠️ 判定用**松手位置**算出来的那个态（`_action`）⇒ ⇒ 「遮罩上写的」
    // 就是「松手做的」⇒ ⇒ 不会有「界面说一套、手指做另一套」。
    final action = cancel ? _ReleaseAction.cancel : _action;
    final abandon = action != _ReleaseAction.send;
    debugPrint(
      'UnifiedInputBar: 松手 offset=${_slideDx.toStringAsFixed(1)} '
      'armed=${action.name} abandon=$abandon',
    );
    setState(() {
      _recording = false;
      _action = _ReleaseAction.send;
      _slideDx = 0;
    });
    _hideRecordingOverlay();
    widget.onFinishRecording(abandon);
    // ⚠️ 右滑切相机 ⇒ ⇒ 这段录音**丢掉**（`abandon` 已经是真）⇒ ⇒ 然后开摄像头。
    // ⚠️ 顺序不许反 —— 先把录音收干净（别让端脑收到一段没人要的音频），
    // 再切到相机。
    if (action == _ReleaseAction.camera) {
      widget.onCapturePhoto?.call();
    }
  }

  // ---- 整屏遮罩（微信那一族）----------------------------------------------

  /// 按**当前**位置算「松手会发生什么」。
  ///
  /// ⚠️ 优先级：**顶部取消区** > **右滑** > **左滑**。
  /// - 顶部取消区是**看得见**的目标（药丸变红）⇒ ⇒ 「看到的」和「做的」必须
  ///   一致 ⇒ ⇒ 进了那个区 ⇒ ⇒ 一定是放弃，不许翻成相机。
  /// - **右滑** ⇒ 打开摄像头；**左滑** ⇒ 放弃。
  _ReleaseAction _actionFor(double offset, double dy) {
    if (_inCancelZone(dy)) return _ReleaseAction.cancel;
    if (offset >= _slideThreshold) return _ReleaseAction.camera;
    if (offset <= -_slideThreshold) return _ReleaseAction.cancel;
    return _ReleaseAction.send;
  }

  /// 顶部「取消」目标区在**全局坐标**里的上沿。
  ///
  /// ⚠️ 用 `viewPadding`（不是 `padding`）—— 输入区住在 `SafeArea` 里面
  /// ⇒ ⇒ `padding.top` 已经被 SafeArea **吃掉了**（= 0）⇒ ⇒ 拿它当屏幕顶
  /// ⇒ ⇒ 取消区会画到状态栏**上面** ⇒ ⇒ 而判定用的是真坐标 ⇒ ⇒
  /// 「看到的」和「判的」对不上。
  double _cancelZoneTop() => MediaQuery.maybeViewPaddingOf(context)?.top ?? 0;

  /// 取消区下沿（全局坐标）。
  double _cancelZoneBottom() => _cancelZoneTop() + _cancelZoneHeight;

  /// 手指（全局坐标 y）是不是在取消区里。
  bool _inCancelZone(double dy) => dy <= _cancelZoneBottom();

  void _showRecordingOverlay() {
    if (_overlayEntry != null) return;
    final overlay = Overlay.maybeOf(context);
    if (overlay == null) {
      // ⚠️ 没有 `Overlay` 祖先 ⇒ ⇒ 遮罩起不来 ⇒ ⇒ **说真话**（别静悄悄
      // 变成「没有提示」）。
      debugPrint('UnifiedInputBar: 找不到 Overlay ⇒ ⇒ 整屏遮罩起不来');
      return;
    }
    _overlayEntry = OverlayEntry(builder: _buildRecordingOverlay);
    overlay.insert(_overlayEntry!);
  }

  void _hideRecordingOverlay() {
    final entry = _overlayEntry;
    _overlayEntry = null;
    entry?.remove();
  }

  Widget _buildRecordingOverlay(BuildContext overlayContext) {
    final action = _action;
    final top = MediaQuery.maybeViewPaddingOf(overlayContext)?.top ?? 0;
    return Positioned.fill(
      // ⚠️ `AbsorbPointer`（**不是** IgnorePointer）⇒ ⇒ 遮罩**吃掉**落在
      // 它上面的点击（不许点到下面的对话）⇒ ⇒ 但**不**抢正在录音的那根手指
      // （那根手指的命中路径在 DOWN 时就定了，压根不经过遮罩）。
      //
      // ⚠️ ⚠️ `AbsorbPointer` 放在 `Positioned.fill` **里面** ——
      // `Positioned` 的父数据只能贴在「直接创建渲染对象的那一层」上 ⇒ ⇒
      // 中间夹一个渲染对象（AbsorbPointer 自己就是）⇒ ⇒ 父数据贴错地方
      // ⇒ ⇒ Flutter 当场报「Incorrect use of ParentDataWidget」。
      child: ColoredBox(
        key: UnifiedInputBar.recordingOverlayKey,
        color: const Color(0x99000000),
        child: AbsorbPointer(
          child: Stack(
            children: [
              _buildCancelZone(top, action == _ReleaseAction.cancel),
              _buildCenterBubble(action),
            ],
          ),
        ),
      ),
    );
  }

  /// 顶部那条**放弃目标区**（微信那样）—— 滑到这里松手＝放弃。
  Widget _buildCancelZone(double top, bool armed) {
    return Positioned(
      top: top,
      left: 0,
      right: 0,
      height: _cancelZoneHeight,
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 10),
          decoration: BoxDecoration(
            color: armed ? const Color(0xFFE5484D) : const Color(0x26FFFFFF),
            borderRadius: BorderRadius.circular(24),
          ),
          child: Text(
            widget.cancelZoneText,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }

  /// 正中的大圆 ＋ 大字（三个态：发送 ／ 放弃 ／ 切相机）。
  Widget _buildCenterBubble(_ReleaseAction action) {
    final isCancel = action == _ReleaseAction.cancel;
    final isCamera = action == _ReleaseAction.camera;
    final icon = isCancel
        ? Icons.delete_outline
        : isCamera
            ? Icons.camera_alt
            : // ⚠️ 用**波形**（微信那族）而不是 `Icons.mic` —— `Icons.mic`
              // 是「没有独立麦克风钮」那条判据的**反例符号** ⇒ ⇒ 遮罩里
              // 用它 ⇒ ⇒ 一边说没有麦克风钮、一边画一个麦克风 ⇒ ⇒ 自相矛盾。
              Icons.graphic_eq;
    final label = isCancel
        ? widget.cancelText
        : isCamera
            ? widget.cameraText
            : widget.recordingText;
    // ⚠️ 相机态用**主色**（不是红）⇒ ⇒ 红＝放弃是**专属**的颜色 ⇒ ⇒
    // 「红＝别发」不会被误读成「红＝切相机」。
    final color = isCancel
        ? const Color(0xFFE5484D)
        : isCamera
            ? Theme.of(context).colorScheme.primary
            : const Color(0x1FFFFFFF);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 120,
            height: 120,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color,
              border: Border.all(color: const Color(0x59FFFFFF), width: 2),
            ),
            child: Icon(icon, color: Colors.white, size: 48),
          ),
          const SizedBox(height: 18),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  // ---- 画面 --------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final focused = _focusNode.hasFocus;

    // ⚠️ **描边与填充取主题里那一份** —— 输入区现在是**一个整体容器**
    // （「＋」在左、文字在中、「📷」在右）⇒ ⇒ 描边不许自己另画一份颜色
    // ⇒ ⇒ 否则聚焦时那一圈高亮会**丢**（焦点描边原本长在 TextField 上）。
    final deco = theme.inputDecorationTheme;
    final border = focused ? deco.focusedBorder : deco.enabledBorder;
    final borderColor = _borderColorOf(border, theme);

    return Container(
      key: UnifiedInputBar.inputAreaKey,
      decoration: BoxDecoration(
        color: deco.fillColor ?? theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: borderColor,
          width: focused ? 2 : 1,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          // ⚠️ 文件／图片入口 ⇒ ⇒ 「＋」在**输入框左侧**（同一个圆角框里）。
          _buildPlusButton(theme),
          // ⚠️ **只有文字区**接管长按录音 —— 若把两个钮也裹进这层
          // `Listener` ⇒ ⇒ 长按「📷」会**同时**开录音 ⇒ ⇒ 录视频与录音
          // 打架 ⇒ ⇒ 一条手势两个意思。
          Expanded(
            child: Listener(
              behavior: HitTestBehavior.opaque,
              onPointerDown: _onPointerDown,
              onPointerMove: _onPointerMove,
              onPointerUp: _onPointerUp,
              onPointerCancel: _onPointerCancel,
              child: _buildTextField(),
            ),
          ),
          // ⚠️ **忙碌指示槽**（等回话时的转圈）—— 现在住在**输入区容器
          // 里面**、「📷」的**左边**。
          //
          // ⚠️ 为什么不是「输入框里的 suffixIcon」：suffix 槽给的约束会把转圈
          // **撑成一大坨**（真机实测约 125px）⇒ ⇒ 改用 OverflowBox 后真机又
          // **整个看不见** ⇒ ⇒ 这条路走不通 ⇒ ⇒ 自己给一个**固定尺寸**的槽。
          //
          // ⚠️ **固定占位**（不 loading 时槽也留着）⇒ ⇒ 「＋」「📷」两个钮
          // 的位置**不会**因为回话开始/结束而**左右跳**。
          _buildBusySlot(theme),
          // ⚠️ 相机钮 —— 轻触拍照片、**长按拍视频**（在**输入框右侧**）。
          _buildCameraButton(theme),
        ],
      ),
    );
  }

  /// 从主题的 `InputBorder` 里取描边颜色（取不到就退回主题的 outline）。
  Color _borderColorOf(InputBorder? border, ThemeData theme) {
    if (border is OutlineInputBorder) return border.borderSide.color;
    if (border is UnderlineInputBorder) return border.borderSide.color;
    final fallback = theme.inputDecorationTheme.border;
    if (fallback is OutlineInputBorder) return fallback.borderSide.color;
    return theme.colorScheme.outline;
  }

  Widget _buildTextField() {
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
        // ⚠️ **这里故意不放转圈** —— 第一版把它塞进 suffixIcon ⇒ ⇒ suffix
        // 槽给的约束把它**撑成一大坨**（真机实测约 125px，糊住半个输入框）⇒ ⇒
        // 改用 OverflowBox 后真机又**整个看不见**⇒ ⇒ 转圈改成**固定尺寸**
        // 的槽（见 build 里的 _buildBusySlot）。
        //
        // ⚠️ **描边不许长在输入框自己身上** —— 输入区现在是**一个整体容器**
        // （「＋」/文字/「📷」都在里面）⇒ ⇒ 输入框再画一圈描边 ⇒ ⇒ 变成
        // 「框里还套个框」⇒ ⇒ 描边统一由容器画（聚焦时那一圈高亮也在
        // 容器上）。
        filled: false,
        border: InputBorder.none,
        enabledBorder: InputBorder.none,
        focusedBorder: InputBorder.none,
        errorBorder: InputBorder.none,
        focusedErrorBorder: InputBorder.none,
        disabledBorder: InputBorder.none,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 12,
        ),
      ),
    );
  }

  /// 忙碌指示槽（**固定 18×18**）—— 正在等回话时里面转一枚小圈。
  Widget _buildBusySlot(ThemeData theme) {
    return SizedBox(
      width: 18,
      height: 18,
      child: widget.isLoading
          ? CircularProgressIndicator(
              strokeWidth: 2,
              color: theme.colorScheme.primary,
            )
          : null,
    );
  }

  /// 「＋」菜单（**自己开**，不用 `PopupMenuButton` —— 见类注释里那条取证）。
  Future<void> _openPlusMenu(BuildContext buttonContext) async {
    final buttonBox = buttonContext.findRenderObject() as RenderBox?;
    final overlayBox =
        Overlay.of(buttonContext).context.findRenderObject() as RenderBox?;
    if (buttonBox == null || overlayBox == null) {
      // ⚠️ **说真话**（别静悄悄变成「点了没反应」）。
      debugPrint('UnifiedInputBar: 「＋」菜单开不了（拿不到位置）');
      return;
    }
    final buttonRect = buttonBox.localToGlobal(Offset.zero) & buttonBox.size;
    final overlayRect = overlayBox.localToGlobal(Offset.zero) & overlayBox.size;
    final value = await showMenu<String>(
      context: buttonContext,
      // ⚠️ 位置跟 `PopupMenuButton` 内部那条路**一样**（按钮矩形相对 overlay）
      // ⇒ ⇒ 菜单照旧弹在钮的下方 ⇒ ⇒ 观感不变。
      position: RelativeRect.fromRect(buttonRect, overlayRect),
      items: <PopupMenuEntry<String>>[
        PopupMenuItem<String>(
          value: 'gallery',
          child: Row(
            children: [
              const Icon(Icons.photo_library),
              const SizedBox(width: 8),
              Text(widget.galleryLabel),
            ],
          ),
        ),
        PopupMenuItem<String>(
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
    if (!mounted) return;
    if (value == 'gallery') {
      widget.onPickImage?.call();
    } else if (value == 'file') {
      widget.onPickFile?.call();
    }
  }

  Widget _buildPlusButton(ThemeData theme) {
    // ⚠️ **只支持单击** ⇒ ⇒ 这个钮上**不许**挂 `Tooltip`（它的长按会弹提示）
    // ⇒ ⇒ 标签改用 `Semantics`（设备上仍是 `Button cd=[文件]`）。
    //
    // ⚠️ 为什么不用 `PopupMenuButton`：它的结构是 `Tooltip(→ InkWell(onTap))`
    // ⇒ ⇒ `Tooltip` 的长按识别器**先赢下手势竞技场** ⇒ ⇒ `onTap` 被拒 ⇒ ⇒
    // **长按不弹菜单，但会弹一句提示**（2026-11-16 实测取到的）。
    return Builder(
      builder: (buttonContext) => Semantics(
        button: true,
        label: widget.fileLabel,
        // ⚠️ 读屏用户双击 ⇒ ⇒ 也得有这个动作 ⇒ ⇒ 不许只靠触摸。
        onTap: widget.enabled ? () => _openPlusMenu(buttonContext) : null,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: widget.enabled ? () => _openPlusMenu(buttonContext) : null,
          // ⚠️ 长按**只被吞掉**：什么都不发生（不许弹菜单、也不许弹提示）。
          onLongPress: widget.enabled
              ? () {
                  debugPrint(
                    'UnifiedInputBar: 长按「＋」⇒ 什么都不做（只支持单击）',
                  );
                }
              : null,
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Icon(
              Icons.add,
              // ⚠️ 「＋」与「📷」在**同一个圆角框**里 ⇒ ⇒ 颜色得一致
              // （一个灰一个蓝看着像两件东西）。
              color: widget.enabled
                  ? theme.colorScheme.primary
                  : theme.disabledColor,
            ),
          ),
        ),
      ),
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

}
