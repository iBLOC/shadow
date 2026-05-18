import 'dart:io';
import 'audio_input_handler.dart';
import 'image_input_handler.dart';
import 'file_input_handler.dart';

enum MultimodalInputType { audio, image, camera, file }

class MultimodalInput {
  final MultimodalInputType type;
  final dynamic data;
  final String? path;

  MultimodalInput({required this.type, required this.data, this.path});
}

class MultimodalInputManager {
  final AudioInputHandler _audioHandler = AudioInputHandler();
  final ImageInputHandler _imageHandler = ImageInputHandler();
  final FileInputHandler _fileHandler = FileInputHandler();

  AudioInputState get audioState => _audioHandler.state;

  // Audio
  Future<bool> hasAudioPermission() => _audioHandler.hasPermission();
  
  Future<String?> startAudioRecording() => _audioHandler.startRecording();
  
  Future<MultimodalInput?> stopAudioRecording() async {
    final path = await _audioHandler.stopRecording();
    if (path != null) {
      return MultimodalInput(
        type: MultimodalInputType.audio,
        data: path,
        path: path,
      );
    }
    return null;
  }

  Future<void> cancelAudioRecording() => _audioHandler.cancelRecording();

  // Image
  Future<MultimodalInput?> pickImageFromGallery() async {
    final file = await _imageHandler.pickImage(source: ImagePickSource.gallery);
    if (file != null) {
      return MultimodalInput(
        type: MultimodalInputType.image,
        data: file,
        path: file.path,
      );
    }
    return null;
  }

  Future<MultimodalInput?> captureImage() async {
    final file = await _imageHandler.pickImage(source: ImagePickSource.camera);
    if (file != null) {
      return MultimodalInput(
        type: MultimodalInputType.image,
        data: file,
        path: file.path,
      );
    }
    return null;
  }

  // File
  Future<MultimodalInput?> pickFile({List<String>? allowedExtensions}) async {
    final file = await _fileHandler.pickFile(allowedExtensions: allowedExtensions);
    if (file != null) {
      return MultimodalInput(
        type: MultimodalInputType.file,
        data: file,
        path: file.path,
      );
    }
    return null;
  }

  Future<List<MultimodalInput>> pickMultipleFiles({List<String>? allowedExtensions}) async {
    final files = await _fileHandler.pickMultipleFiles(allowedExtensions: allowedExtensions);
    return files.map((f) => MultimodalInput(
      type: MultimodalInputType.file,
      data: f,
      path: f.path,
    )).toList();
  }

  // Utility
  String getFileName(MultimodalInput input) {
    if (input.path == null) return 'unknown';
    return input.path!.split('/').last;
  }

  Future<int> getFileSize(MultimodalInput input) async {
    if (input.data is File) {
      return await (input.data as File).length();
    }
    return 0;
  }

  Future<void> dispose() async {
    await _audioHandler.dispose();
  }
}
