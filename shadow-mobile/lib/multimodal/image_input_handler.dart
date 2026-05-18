import 'dart:io';
import 'package:image_picker/image_picker.dart';

enum ImagePickSource { gallery, camera }

class ImageInputHandler {
  final ImagePicker _picker = ImagePicker();

  Future<File?> pickImage({ImagePickSource source = ImagePickSource.gallery}) async {
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
        return File(image.path);
      }
      return null;
    } catch (e) {
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
      return [];
    }
  }
}
