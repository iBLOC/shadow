/// **权限声明** —— agent（模型）在调用工具时**自己声明**这次需要哪些权限。
///
/// ## 为什么要有这一层
///
/// 端脑那头**不知道**用户给每个能力配的档位 ⇒ ⇒ 模型看不见「这条路要先问用户」
/// ⇒ ⇒ 模型只能**试** ⇒ ⇒ 试的成本是「白费一个回合 ＋ 客户端拦一次」。
///
/// ⇒ ⇒ 所以让模型**在调用里声明**它需要哪些权限：
/// - 客户端**核对**这份声明（对不对得上这个工具**真实**需要的那一档）；
/// - 对不上 ⇒ ⇒ **明确失败并回传** ⇒ ⇒ 模型能学到，下次改对；
/// - 对得上 ⇒ ⇒ 照常走，而用户看到的那张卡片上**写清楚**要哪个权限。
///
/// ⚠️ **声明不能放大权限**：真正要哪一档，永远由**工具**说了算
/// （`ClientTool.capability`）⇒ ⇒ 声明只是**核对**，不是**授权**。
///
/// ## ⚠️ 为什么用**能力级** token，而不是 Android 的 READ_CALENDAR
///
/// 原始权限串**留在原生层**（那里才知道各平台叫什么，见 `DeviceDataBridge`）
/// ⇒ ⇒ 这一层只认**能力名**（`calendar_read` / `contacts` / …）
/// ⇒ ⇒ 两端同一套词汇 ⇒ ⇒ iOS 那条腿一个字都不用改。
library;

import 'capability.dart';

/// 参数里放声明的那个**键名**。
///
/// ⚠️ 为什么要**一个固定的键**（而不是让模型塞进任意参数）：
/// 声明要能被**核对** ⇒ ⇒ 就得有个**固定位置**去读它
/// ⇒ ⇒ 否则模型换个字段名，客户端就看不见这份声明了 ⇒ ⇒ 核对形同虚设。
const String declaredPermissionsKey = 'required_permissions';

/// 能力 → 权限声明用的**稳定 token**。
///
/// ⚠️ **就是能力名**（`capability.wire`）⇒ ⇒ 与落盘的档位、发给端脑的
/// 能力名**逐字同源** ⇒ ⇒ 不另造一套词汇 ⇒ ⇒ 不会两处漂移。
String capabilityPermissionToken(Capability capability) => capability.wire;

/// 这个能力**真实**需要的权限（普通工具 ⇒ 空）。
///
/// ⚠️ 「手机操作」要的是**无障碍服务**那个系统开关，不是运行时权限
/// ⇒ ⇒ 但它**仍然是一档**（模型照样要声明它）⇒ ⇒ 只是**申请方式**不同。
List<String> requiredPermissionsOf(Capability? capability) {
  if (capability == null) return const [];
  return [capabilityPermissionToken(capability)];
}

/// 一次声明的**结论**。
enum PermissionDeclarationVerdict {
  /// 与工具真实需要的**对得上**。
  matched,

  /// agent **没声明** ⇒ ⇒ 宽容：按工具真实需要的那一档走。
  ///
  /// ⚠️ 为什么宽容：模型可能压根不知道有这一栏（老模型 / 老上下文）
  /// ⇒ ⇒ 为此把每次调用都拒掉 ⇒ ⇒ 是**惩罚老实人**。
  missing,

  /// agent 声明了**这个工具并不需要**的权限 ⇒ ⇒ **明确失败**。
  ///
  /// ⚠️ 为什么这一档要红：声明里出现**不该有的**那一档 ⇒ ⇒ 说明 agent
  /// **对自己的工具理解错了** ⇒ ⇒ 让它继续跑 ⇒ ⇒ 它会以为「拿到写日历
  /// 权限了」⇒ ⇒ 后面**基于这个误解**继续调 ⇒ ⇒ 必须当场拦住并说清楚。
  mismatch,
}

/// **已知的权限 token** —— 能力名的那一份。
///
/// ⚠️ 为什么要这张表：判定「模型是在**越权**」还是「**拼错了**」，
/// 靠的就是「这个 token 到底存不存在」——
/// - 存在、但**不属于这个工具** ⇒ ⇒ **真越权** ⇒ ⇒ 明确失败；
/// - **压根不存在** ⇒ ⇒ 那不是越权，是**拼错/幻觉**
///   ⇒ ⇒ 宽容（当作没声明）⇒ ⇒ **不许**因为模型拼错就断掉用户的请求。
Set<String> get knownPermissionTokens =>
    {for (final c in Capability.values) capabilityPermissionToken(c)};

/// 一次声明的**完整结论**。
class PermissionDeclaration {
  /// 结论。
  final PermissionDeclarationVerdict verdict;

  /// agent **声明**了哪些。
  final List<String> declared;

  /// 这个工具**真实**需要哪些。
  final List<String> required;

  /// 声明里**多出来的**那些（只有 [PermissionDeclarationVerdict.mismatch] 时非空）。
  final List<String> extra;

  /// 声明里**压根不存在**的那些（拼错 / 幻觉）。
  ///
  /// ⚠️ 它们**不判越权** ⇒ ⇒ 宽容处理（当作没声明）
  /// ⇒ ⇒ 但**要留着** ⇒ ⇒ 回传里可以告诉模型「你写的这个不是权限名」。
  final List<String> unknown;

  const PermissionDeclaration({
    required this.verdict,
    required this.declared,
    required this.required,
    required this.extra,
    this.unknown = const [],
  });

  /// 能不能照常往下走。
  bool get ok => verdict != PermissionDeclarationVerdict.mismatch;
}

/// 从工具调用参数里读出 agent 的**权限声明**。
///
/// ⚠️ 认不出来（类型不对 / 空串）⇒ ⇒ 当作**没声明**（[PermissionDeclarationVerdict.missing]）
/// ⇒ ⇒ 而不是判它「声明了乱七八糟的东西」⇒ ⇒ 理由同上：别惩罚老实人。
List<String> declaredPermissionsOf(Map<String, dynamic> args) {
  final raw = args[declaredPermissionsKey];
  if (raw == null) return const [];
  if (raw is String) {
    final text = raw.trim();
    return text.isEmpty ? const [] : [text];
  }
  if (raw is List) {
    final out = <String>[];
    for (final item in raw) {
      if (item is! String) continue;
      final text = item.trim();
      if (text.isEmpty) continue;
      out.add(text);
    }
    return out;
  }
  return const [];
}

/// 核对 agent 的声明与工具**真实**需要的那一档。
///
/// ⚠️ 判据只有一条：**声明 ⊆ 真实需要**。
/// - 声明为空 ⇒ ⇒ 没声明（宽容）；
/// - 声明里有**真实需要之外**的 ⇒ ⇒ 对不上（明确失败）；
/// - 其余 ⇒ ⇒ 对得上。
///
/// ⚠️ 为什么**不看**「声明是不是把真实需要的那一档都写全了」：
/// 模型少写一个 token 不代表它想越权 ⇒ ⇒ 而它多写一个 ⇒ ⇒ 那才是越权。
PermissionDeclaration evaluatePermissionDeclaration({
  required Capability? capability,
  required List<String> declared,
}) {
  final required = requiredPermissionsOf(capability);
  if (declared.isEmpty) {
    return PermissionDeclaration(
      verdict: PermissionDeclarationVerdict.missing,
      declared: const [],
      required: required,
      extra: const [],
    );
  }
  // ⚠️ 先分「**存在**的」与「**压根不存在**的」——
  // ⇒ ⇒ 前者才谈得上越权，后者只是**拼错** ⇒ ⇒ 宽容。
  final known = knownPermissionTokens;
  final unknown = declared.where((d) => !known.contains(d)).toList();
  final extra = declared
      .where((d) => known.contains(d) && !required.contains(d))
      .toList();
  if (extra.isNotEmpty) {
    return PermissionDeclaration(
      verdict: PermissionDeclarationVerdict.mismatch,
      declared: declared,
      required: required,
      extra: extra,
      unknown: unknown,
    );
  }
  if (unknown.isNotEmpty && declared.every((d) => unknown.contains(d))) {
    // ⚠️ 全是**认不出来**的 ⇒ ⇒ 那不是越权，是模型**拼错了名字**
    // ⇒ ⇒ 当作**没声明** ⇒ ⇒ 按工具真实需要的那一档走
    // ⇒ ⇒ **不许**因为模型拼错就断掉用户的一次正常请求。
    return PermissionDeclaration(
      verdict: PermissionDeclarationVerdict.missing,
      declared: declared,
      required: required,
      extra: const [],
      unknown: unknown,
    );
  }
  return PermissionDeclaration(
    verdict: PermissionDeclarationVerdict.matched,
    declared: declared,
    required: required,
    extra: const [],
    unknown: unknown,
  );
}
