import 'package:flutter/material.dart';
import 'package:camera/camera.dart';

/// Widget for displaying camera preview with controls
class CameraPreviewWidget extends StatefulWidget {
  final CameraController? controller;
  final bool isMirrored;
  final bool isEnabled;
  final VoidCallback? onFlipCamera;
  final VoidCallback? onToggleCamera;

  const CameraPreviewWidget({
    super.key,
    this.controller,
    this.isMirrored = false,
    this.isEnabled = true,
    this.onFlipCamera,
    this.onToggleCamera,
  });

  @override
  State<CameraPreviewWidget> createState() => _CameraPreviewWidgetState();
}

class _CameraPreviewWidgetState extends State<CameraPreviewWidget> {
  bool _showPreview = false;

  @override
  void didUpdateWidget(CameraPreviewWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Show preview when camera is enabled and initialized
    if (widget.isEnabled &&
        widget.controller != null &&
        widget.controller!.value.isInitialized) {
      if (!_showPreview) {
        setState(() => _showPreview = true);
      }
    } else {
      if (_showPreview) {
        setState(() => _showPreview = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.isEnabled ||
        widget.controller == null ||
        !widget.controller!.value.isInitialized) {
      return const SizedBox.shrink();
    }

    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      width: 120,
      height: 160,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.3),
          width: 2,
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Camera preview
            Transform(
              alignment: Alignment.center,
              transform: Matrix4.identity()
                ..scaleByDouble(
                  widget.isMirrored ? -1.0 : 1.0,
                  1.0,
                  widget.isMirrored ? -1.0 : 1.0,
                  1.0,
                ),
              child: CameraPreview(widget.controller!),
            ),
            // Control buttons overlay
            Positioned(
              bottom: 4,
              left: 0,
              right: 0,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  // Flip camera button
                  _ControlButton(
                    icon: Icons.flip_camera_ios,
                    onPressed: widget.onFlipCamera,
                    size: 28,
                  ),
                  // Toggle camera button
                  _ControlButton(
                    icon: Icons.videocam,
                    onPressed: widget.onToggleCamera,
                    size: 28,
                  ),
                ],
              ),
            ),
            // Recording indicator
            if (widget.controller != null &&
                widget.controller!.value.isStreamingImages)
              Positioned(
                top: 4,
                right: 4,
                child: Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    color: Colors.red,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ControlButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onPressed;
  final double size;

  const _ControlButton({required this.icon, this.onPressed, this.size = 24});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onPressed,
      child: Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Icon(icon, color: Colors.white, size: size),
      ),
    );
  }
}

/// Camera state for the conversation mode
enum CameraState { off, on, streaming }

/// Provider for camera state in conversation mode
class CameraStateNotifier extends ChangeNotifier {
  CameraState _state = CameraState.off;
  bool _isMirrored = true; // Front camera is mirrored by default
  int _currentCameraIndex = 0;
  List<CameraDescription> _cameras = [];

  CameraState get state => _state;
  bool get isMirrored => _isMirrored;
  int get currentCameraIndex => _currentCameraIndex;
  List<CameraDescription> get cameras => _cameras;

  void setCameras(List<CameraDescription> cameras) {
    _cameras = cameras;
  }

  void toggleCamera() {
    if (_state == CameraState.off) {
      _state = CameraState.on;
    } else {
      _state = CameraState.off;
    }
    notifyListeners();
  }

  void flipCamera() {
    if (_cameras.length < 2) return;

    _currentCameraIndex = (_currentCameraIndex + 1) % _cameras.length;
    // Toggle mirror state based on camera position
    _isMirrored = _currentCameraIndex == 0; // Front camera is mirrored
    notifyListeners();
  }

  void setStreaming(bool streaming) {
    if (streaming && _state == CameraState.on) {
      _state = CameraState.streaming;
    } else if (!streaming && _state == CameraState.streaming) {
      _state = CameraState.on;
    }
    notifyListeners();
  }

  void turnOff() {
    _state = CameraState.off;
    notifyListeners();
  }
}
