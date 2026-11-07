import 'dart:io';

import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';

/// 聊天背景图的落盘。
///
/// image_picker 给的是**临时 / 缓存**路径 —— 重启或清缓存后就没了；
/// 背景图要跨重启生效，所以选完立刻复制一份进应用文档目录，
/// 配置里存的是这份**稳定副本**的路径。
///
/// 压缩不在这里做：`pickImage(maxWidth/maxHeight/imageQuality)`
/// 在选图那一刻就压好了（长边 1920 / 质量 85），这里只管搬。
class ChatBackgroundService {
  ChatBackgroundService._();

  static const String _baseName = 'chat_background';

  /// 把选来的图片复制进应用文档目录，返回稳定路径。
  static Future<String> copyToAppDirectory(XFile image) async {
    final docs = await getApplicationDocumentsDirectory();
    final name = image.name;
    final dot = name.lastIndexOf('.');
    final ext = (dot >= 0 && dot < name.length - 1)
        ? name.substring(dot)
        : '.jpg';
    final target = File('${docs.path}/$_baseName$ext');
    await image.saveTo(target.path);
    return target.path;
  }

  /// 删掉旧背景文件（换图 / 恢复默认时清尾巴）。
  ///
  /// 删不掉不算失败 —— 新背景已经生效，旧文件留着只是占点磁盘。
  static Future<void> deleteIfExist(String? path) async {
    if (path == null || path.isEmpty) return;
    try {
      final file = File(path);
      if (await file.exists()) {
        await file.delete();
      }
    } catch (_) {
      // 旧文件删不掉不阻塞新状态。
    }
  }
}
