import 'dart:io';
import 'package:flutter/material.dart';
import '../../theme/app_colors.dart';
import '../../multimodal/multimodal.dart';

/// Voice message bubble
class VoiceMessageBubble extends StatelessWidget {
  final int? durationMs;
  final VoidCallback onPlay;

  const VoiceMessageBubble({
    super.key,
    required this.durationMs,
    required this.onPlay,
  });

  String get _durationText {
    if (durationMs == null) return 'Voice';
    final seconds = durationMs! ~/ 1000;
    if (seconds < 60) return '${seconds}s';
    return '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            icon: Icon(
              Icons.play_circle_fill,
              color: AppColors.primary,
              size: 40,
            ),
            onPressed: onPlay,
            tooltip: 'Play voice message',
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Voice message',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: isDark ? Colors.white : Colors.black87,
                ),
              ),
              Text(
                _durationText,
                style: TextStyle(
                  fontSize: 12,
                  color: isDark ? Colors.white60 : Colors.black54,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Image message bubble
class ImageMessageBubble extends StatelessWidget {
  final String? imagePath;
  final VoidCallback? onTap;

  const ImageMessageBubble({super.key, required this.imagePath, this.onTap});

  @override
  Widget build(BuildContext context) {
    if (imagePath == null) {
      return GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.grey[300],
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Icon(Icons.broken_image, color: Colors.grey),
        ),
      );
    }

    final file = File(imagePath!);
    final fileExists = file.existsSync();

    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: fileExists
            ? Image.file(
                file,
                width: 200,
                height: 200,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) {
                  return Container(
                    width: 200,
                    height: 200,
                    color: Colors.grey[300],
                    child: const Center(
                      child: Icon(
                        Icons.broken_image,
                        color: Colors.grey,
                        size: 48,
                      ),
                    ),
                  );
                },
              )
            : Container(
                width: 200,
                height: 200,
                color: Colors.grey[300],
                child: const Center(
                  child: Icon(
                    Icons.image_not_supported,
                    color: Colors.grey,
                    size: 48,
                  ),
                ),
              ),
      ),
    );
  }
}

/// Audio message bubble
class AudioMessageBubble extends StatelessWidget {
  final VoidCallback onPlay;

  const AudioMessageBubble({super.key, required this.onPlay});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            icon: Icon(
              Icons.play_circle_fill,
              color: AppColors.primary,
              size: 40,
            ),
            onPressed: onPlay,
            tooltip: 'Play audio',
          ),
          const SizedBox(width: 8),
          Text(
            'Audio message',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: isDark ? Colors.white : Colors.black87,
            ),
          ),
        ],
      ),
    );
  }
}

/// Video message bubble
class VideoMessageBubble extends StatelessWidget {
  final String? videoPath;

  const VideoMessageBubble({super.key, required this.videoPath});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.videocam, color: AppColors.primary, size: 40),
          const SizedBox(width: 8),
          Text(
            videoPath != null ? 'Video' : 'Video (no file)',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: isDark ? Colors.white : Colors.black87,
            ),
          ),
        ],
      ),
    );
  }
}

/// File message bubble
class FileMessageBubble extends StatelessWidget {
  final String? filePath;
  final String? fileName;

  const FileMessageBubble({super.key, required this.filePath, this.fileName});

  String get _displayName {
    if (fileName != null && fileName!.isNotEmpty) return fileName!;
    if (filePath == null) return 'File';
    return filePath!.split('/').last;
  }

  String get _fileExtension {
    final name = _displayName;
    final dotIndex = name.lastIndexOf('.');
    if (dotIndex == -1) return '';
    return name.substring(dotIndex + 1).toLowerCase();
  }

  IconData get _fileIcon {
    switch (_fileExtension) {
      case 'pdf':
        return Icons.picture_as_pdf;
      case 'doc':
      case 'docx':
        return Icons.description;
      case 'xls':
      case 'xlsx':
        return Icons.table_chart;
      case 'ppt':
      case 'pptx':
        return Icons.slideshow;
      case 'zip':
      case 'rar':
      case 'tar':
      case 'gz':
        return Icons.folder_zip;
      case 'mp3':
      case 'wav':
      case 'aac':
      case 'flac':
        return Icons.audio_file;
      case 'mp4':
      case 'avi':
      case 'mov':
      case 'mkv':
        return Icons.video_file;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
      case 'bmp':
        return Icons.image;
      case 'txt':
      case 'md':
      case 'json':
      case 'xml':
      case 'html':
      case 'css':
      case 'js':
        return Icons.code;
      default:
        return Icons.insert_drive_file;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.lightSurface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(_fileIcon, color: AppColors.primary, size: 40),
          const SizedBox(width: 8),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _displayName,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: isDark ? Colors.white : Colors.black87,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (_fileExtension.isNotEmpty)
                  Text(
                    _fileExtension.toUpperCase(),
                    style: TextStyle(
                      fontSize: 12,
                      color: isDark ? Colors.white60 : Colors.black54,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Attachment chip widget for multimodal inputs
class AttachmentChip extends StatelessWidget {
  final MultimodalInputType type;
  final String path;
  final VoidCallback onRemove;

  const AttachmentChip({
    super.key,
    required this.type,
    required this.path,
    required this.onRemove,
  });

  IconData get _icon {
    switch (type) {
      case MultimodalInputType.audio:
        return Icons.mic;
      case MultimodalInputType.image:
        return Icons.image;
      case MultimodalInputType.camera:
        return Icons.camera_alt;
      case MultimodalInputType.file:
        return Icons.insert_drive_file;
      case MultimodalInputType.voice:
        return Icons.voice_chat;
      case MultimodalInputType.video:
        return Icons.videocam;
    }
  }

  String get _label {
    final fileName = path.split('/').last;
    return fileName.length > 15 ? '${fileName.substring(0, 12)}...' : fileName;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(right: 8),
      child: Chip(
        avatar: Icon(_icon, size: 18),
        label: Text(_label, style: const TextStyle(fontSize: 12)),
        deleteIcon: const Icon(Icons.close, size: 16),
        onDeleted: onRemove,
      ),
    );
  }
}
