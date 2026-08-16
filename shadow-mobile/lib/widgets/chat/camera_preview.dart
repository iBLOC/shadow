import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:camera/camera.dart';
import '../../providers/conversation_mode_provider.dart';

/// Camera preview wrapper widget
class CameraPreviewWrapper extends ConsumerWidget {
  const CameraPreviewWrapper({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final convState = ref.watch(conversationModeProvider);
    final videoCollector = ref.watch(videoCollectorProvider);

    if (convState.videoState == VideoState.off ||
        !videoCollector.isInitialized) {
      return const SizedBox.shrink();
    }

    return Container(
      width: 100,
      height: 130,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.3),
          width: 1,
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(7),
        child: Stack(
          fit: StackFit.expand,
          children: [
            // Mirrored preview for front camera
            Transform(
              alignment: Alignment.center,
              transform: Matrix4.identity()
                ..scale(convState.isMirrored ? -1.0 : 1.0, 1.0),
              child:
                  videoCollector.controller != null &&
                      videoCollector.controller!.value.isInitialized
                  ? CameraPreview(videoCollector.controller!)
                  : Container(color: Colors.black),
            ),
            // Streaming indicator
            if (convState.videoState == VideoState.streaming)
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

/// Get video status text
String getVideoStatusText(VideoState videoState) {
  switch (videoState) {
    case VideoState.off:
      return '摄像头关闭';
    case VideoState.on:
      return '摄像头就绪';
    case VideoState.streaming:
      return '采集中...';
  }
}

/// Video control button
class VideoControlButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onPressed;

  const VideoControlButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(4),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: Colors.grey.withValues(alpha: 0.2),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16),
            const SizedBox(width: 4),
            Text(label, style: const TextStyle(fontSize: 12)),
          ],
        ),
      ),
    );
  }
}
