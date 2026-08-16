import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as path;

enum ImagePickSource { gallery, camera }

class ImageInputHandler {
  final ImagePicker _picker = ImagePicker();

  Future<File?> pickImage({
    ImagePickSource source = ImagePickSource.gallery,
  }) async {
    try {
      final XFile? image = await _picker.pickImage(
        source: source == ImagePickSource.gallery
            ? ImageSource.gallery
            : ImageSource.camera,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );

      if (image != null) {
        File cameraFile = File(image.path);
        if (await cameraFile.exists()) {
          if (source == ImagePickSource.camera) {
            final savedPath = await _saveToAppDirectory(cameraFile, image.name);
            if (savedPath != null) {
              debugPrint('ImageInputHandler: Camera image saved to $savedPath');
              return File(savedPath);
            } else {
              debugPrint(
                'ImageInputHandler: Failed to save camera image, using original',
              );
            }
          }
          return cameraFile;
        } else {
          debugPrint(
            'ImageInputHandler: Camera file does not exist at path: ${image.path}',
          );
          return null;
        }
      }
      debugPrint('ImageInputHandler: No image selected');
      return null;
    } catch (e) {
      debugPrint('ImageInputHandler: Error picking image: $e');
      return null;
    }
  }

  Future<String?> _saveToAppDirectory(File sourceFile, String fileName) async {
    try {
      final appDir = await getApplicationDocumentsDirectory();
      final imagesDir = Directory('${appDir.path}/captured_images');
      if (!await imagesDir.exists()) {
        await imagesDir.create(recursive: true);
      }
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final extension = path.extension(fileName);
      final newFileName = 'IMG_$timestamp$extension';
      final newPath = '${imagesDir.path}/$newFileName';
      await sourceFile.copy(newPath);
      debugPrint('ImageInputHandler: Saved camera image to: $newPath');
      return newPath;
    } catch (e) {
      debugPrint('ImageInputHandler: Error saving camera image: $e');
      if (e is FileSystemException) {
        debugPrint(
          'ImageInputHandler: File system error - code: ${e.osError?.errorCode}',
        );
      }
      return null;
    }
  }

  Future<List<File>> pickMultipleImages() async {
    try {
      final List<XFile> images = await _picker.pickMultiImage(
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );
      return images.map((x) => File(x.path)).toList();
    } catch (e) {
      debugPrint('ImageInputHandler: Error picking multiple images: $e');
      return [];
    }
  }
}
