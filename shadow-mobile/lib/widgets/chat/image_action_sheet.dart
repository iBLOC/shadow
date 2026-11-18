import 'dart:io';
import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter/material.dart';

import '../../generated/l10n/app_localizations.dart';
import '../../services/media/media_actions.dart';

/// 长按「聊天里的图片」弹出来的两个动作。
enum ImageAction {
  /// 保存到系统相册。
  saveToGallery,

  /// 分享给微信（没装微信 ⇒ ⇒ 原生改走系统分享面板 ⇒ ⇒ 界面要说清）。
  shareToWeChat,
}

/// 菜单文案 —— 由调用方从 l10n 取（这个文件不 import 生成代码，
/// 桌面/测试环境里没有 ~AppLocalizations~ 也能实例化）。
class ImageActionLabels {
  final String saveToGallery;
  final String shareToWeChat;
  final String cancel;

  const ImageActionLabels({
    required this.saveToGallery,
    required this.shareToWeChat,
    required this.cancel,
  });

  /// 从当前 locale 取一份（调用方拿得到 `AppLocalizations` 时用这个）。
  factory ImageActionLabels.of(AppLocalizations l10n) => ImageActionLabels(
        saveToGallery: l10n.imageActionSaveToGallery,
        shareToWeChat: l10n.imageActionShareToWeChat,
        cancel: l10n.cancel,
      );
}

/// 毛玻璃操作菜单（与消息那一长按菜单**同一套视觉**）。
///
/// ⚠️ 「毛玻璃」= 半透明底板 ＋ [BackdropFilter] 把背后模糊掉 ⇒ ⇒ 菜单浮在
/// 对话上、长按的那张图还隐约看得见 ⇒ ⇒ 上下文不丢。
///
/// 返回用户选的动作；点在菜单外 / 点「取消」⇒ `null`。
Future<ImageAction?> showImageActionSheet(
  BuildContext context, {
  required ImageActionLabels labels,
}) {
  return showModalBottomSheet<ImageAction>(
    context: context,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.25),
    builder: (context) => _GlassImageActionSheet(labels: labels),
  );
}

class _GlassImageActionSheet extends StatelessWidget {
  final ImageActionLabels labels;

  const _GlassImageActionSheet({required this.labels});

  void _pick(BuildContext context, ImageAction action) =>
      Navigator.of(context).pop(action);

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
            child: Container(
              decoration: BoxDecoration(
                color: scheme.surface.withValues(alpha: 0.55),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: scheme.outlineVariant, width: 0.5),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _ActionTile(
                    icon: Icons.download_outlined,
                    label: labels.saveToGallery,
                    onTap: () => _pick(context, ImageAction.saveToGallery),
                  ),
                  _ActionTile(
                    icon: Icons.share_outlined,
                    label: labels.shareToWeChat,
                    onTap: () => _pick(context, ImageAction.shareToWeChat),
                  ),
                  Divider(height: 1, color: scheme.outlineVariant),
                  _ActionTile(
                    icon: Icons.close,
                    label: labels.cancel,
                    onTap: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _ActionTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 52),
        padding: const EdgeInsets.symmetric(horizontal: 20),
        alignment: Alignment.centerLeft,
        child: Row(
          children: [
            Icon(icon, size: 20, color: scheme.onSurfaceVariant),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                label,
                style: TextStyle(fontSize: 15, color: scheme.onSurface),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 跑一个动作并把**结果说真话**。
///
/// ⚠️ **失败不许长得像成功**：
///   * 保存失败 ⇒ ⇒ SnackBar 说清**为什么**（权限不够 / 写盘失败）⇒ ⇒
///     **不说**「已保存」（相册里其实没有）。
///   * 分享时**没装微信** ⇒ ⇒ 原生改走了系统分享面板 ⇒ ⇒ SnackBar 说
///     「已打开系统分享」⇒ ⇒ **不说**「已分享到微信」（微信根本没收到）。
///
/// ⚠️ **可注入 [MediaActions]** ⇒ ⇒ 判据能造一个假通道 ⇒ ⇒ 钉的是
/// 「点了按钮 ⇒ ⇒ 真的打到了宿主那一侧」，不是「按钮画出来了」。
Future<void> runImageAction(
  BuildContext context,
  ImageAction action,
  List<int> bytes, {
  MediaActions? media,
}) async {
  if (bytes.isEmpty) {
    _say(context, AppLocalizations.of(context)!.imageActionNoImage);
    return;
  }
  final l10n = AppLocalizations.of(context)!;
  final actions = media ?? MediaActions();
  final data = _asBytes(bytes);

  final result = action == ImageAction.saveToGallery
      ? await actions.saveToGallery(data, fileName: imageFileName(data))
      : await actions.shareToWeChat(data, fileName: imageFileName(data));

  // ⚠️ **等过原生那一侧** ⇒ ⇒ 页面可能已经被关掉 ⇒ ⇒ 不许再用 context。
  if (!context.mounted) return;

  if (!result.ok) {
    _say(
      context,
      action == ImageAction.saveToGallery
          ? l10n.imageActionSaveFailed(result.message ?? result.code ?? '')
          : l10n.imageActionShareFailed(result.message ?? result.code ?? ''),
    );
    return;
  }
  if (action == ImageAction.shareToWeChat && !result.viaWechat) {
    // ⚠️ **没装微信** ⇒ ⇒ 走的是系统分享面板 ⇒ ⇒ 如实说。
    _say(context, l10n.imageActionSharedSystem);
    return;
  }
  _say(
    context,
    action == ImageAction.saveToGallery
        ? l10n.imageActionSaved
        : l10n.imageActionSharedToWeChat,
  );
}

void _say(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..removeCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

Uint8List _asBytes(List<int> bytes) =>
    bytes is Uint8List ? bytes : Uint8List.fromList(bytes);

/// 长按一张**磁盘上的**图（用户自己发进来的那张）⇒ ⇒ 同样的两个动作。
///
/// ⚠️ **文件可能已经被系统清掉**（App 缓存）⇒ ⇒ 读不到就**响亮说**
/// 「图片读不到了」⇒ ⇒ **不假装有图**（弹出个空菜单更让人困惑）。
Future<void> showImageActionsForFile(
  BuildContext context,
  String path, {
  MediaActions? media,
}) async {
  final l10n = AppLocalizations.of(context);
  if (l10n == null) return;
  final bytes = await _readOrNull(path);
  // ⚠️ **等过读文件** ⇒ ⇒ 页面可能已经被关掉 ⇒ ⇒ 不许再用 context。
  if (!context.mounted) return;
  if (bytes == null) {
    _say(context, l10n.imageActionNoImage);
    return;
  }
  final action = await showImageActionSheet(
    context,
    labels: ImageActionLabels.of(l10n),
  );
  if (action == null) return;
  if (!context.mounted) return;
  await runImageAction(context, action, bytes, media: media);
}

Future<Uint8List?> _readOrNull(String path) async {
  try {
    final file = File(path);
    if (!await file.exists()) return null;
    return await file.readAsBytes();
  } catch (_) {
    return null;
  }
}

/// **聊天里的一张图** —— 长按 ⇒ ⇒ 「保存到相册 / 分享到微信」。
///
/// ⚠️ **手势与动作分开**：这一层只管「长按 ⇒ ⇒ 弹菜单」⇒ ⇒ 真动作在
/// [runImageAction]（**可注入** ⇒ ⇒ 判据能造一个假通道 ⇒ ⇒ 钉的是
/// 「点了菜单项 ⇒ ⇒ 真的打到了宿主那一侧」）。
///
/// ⚠️ **图片来源有两处**：工具产出的图（`generate_image` 的 base64）与用户
/// 自己发进来的图（磁盘上的文件）⇒ ⇒ 两者在这里**汇成同一份字节**⇒ ⇒
/// 动作那一侧只有一条路。
class LongPressImage extends StatelessWidget {
  final Uint8List bytes;
  final BoxFit fit;
  final MediaActions? media;

  const LongPressImage({
    super.key,
    required this.bytes,
    this.fit = BoxFit.fitWidth,
    this.media,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onLongPress: () async {
        final l10n = AppLocalizations.of(context);
        if (l10n == null) return;
        final action = await showImageActionSheet(
          context,
          labels: ImageActionLabels.of(l10n),
        );
        if (action == null) return;
        if (!context.mounted) return;
        await runImageAction(context, action, bytes, media: media);
      },
      child: Image.memory(bytes, fit: fit),
    );
  }
}
