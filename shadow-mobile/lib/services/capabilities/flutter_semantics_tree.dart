import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';

import 'accessibility_ops.dart';

/// 读屏输出的**预算** —— 与 Kotlin 侧 `ScreenBudget` 的三个常数**逐字对齐**。
///
/// ⚠️ 为什么必须一样紧：这一层产出的是**同一件事的第二份**（自家 app 的
/// 界面模型）⇒ ⇒ 它的体量同样**直接进模型上下文** ⇒ ⇒ 一个 WebView 就能
/// 灌进几万 token ⇒ ⇒ 预算必须一样 ⇒ ⇒ 两边各写一份 ⇒ ⇒ 所以有闸钉着
/// （`scripts/check-mobile-a11y-contract.mjs` 逐项比对这三对常数）。
const int kScreenBudgetMaxDepth = 20;
const int kScreenBudgetMaxNodes = 2000;
const int kScreenBudgetMaxChars = 20000;

/// 一棵 **Flutter 语义树**的快照 —— 「自家 app 自己的界面模型」。
class FlutterSemanticsSnapshot {
  const FlutterSemanticsSnapshot({
    required this.text,
    required this.nodeCount,
    required this.truncated,
    required this.coordinateSpace,
  });

  /// 拍成文本的树（与原生侧**同一形状**，只有**坐标口径**不同）。
  final String text;

  /// 这一趟走了多少个节点。
  final int nodeCount;

  /// 预算用完了吗（⇒ ⇒ 文本末尾带 `[truncated]`）。
  final bool truncated;

  /// 坐标口径 —— `screen`（整屏物理像素）／`view`（本窗口物理像素）。
  ///
  /// ⚠ 为什么必须带：两棵树的坐标**不是同一个口径** ⇒ ⇒ 模型照着点
  /// ⇒ ⇒ 口径错了就点歪 ⇒ ⇒ 所以口径要**跟着结果一起**给。
  final String coordinateSpace;
}

/// 本 app 自己的窗口在**屏幕**上的原点（物理像素）。
///
/// ⚠ 为什么需要它：自家 app 的语义树坐标是「**本窗口**」的物理像素
/// ⇒ ⇒ 而手势派发用的是**整屏**物理像素 ⇒ ⇒ 两者差一个窗口原点
/// ⇒ ⇒ 不知道这个原点 ⇒ ⇒ 自家窗口里的坐标**不能**直接拿去点。
/// ⚠ **拿不到就 null** ⇒ ⇒ 宁可换一个坐标口径，也不给一个错的偏移。
class ViewOrigin {
  const ViewOrigin(this.x, this.y);

  final double x;
  final double y;
}

/// **自家 app 自己的界面模型** —— Flutter 语义树。
///
/// ## 这一层补的是哪一格
///
/// Android 无障碍框架**不把宿主自己的窗口**交给它自己绑定的那个服务
/// ⇒ ⇒ `rootInActiveWindow` 是 null ⇒ ⇒ **读屏在自家窗口上为空**
/// ⇒ ⇒ 模型看不见自己 app 的屏幕 ⇒ ⇒ 而「模型在自己 app 里干活」正是
/// 手机操作这条线的主战场 ⇒ ⇒ 这一层用 **Flutter 自己的语义树**顶上。
///
/// ## ⚠️ 两棵树**不混为一谈**
///
/// - 原生那棵树是**别人的窗口**（系统设置、聊天软件……）
///   ⇒ ⇒ 坐标是**整屏物理像素** ⇒ ⇒ 模型照着点得准；
/// - 这一棵是**自家窗口** ⇒ ⇒ 坐标是**本窗口**的物理像素
///   ⇒ ⇒ 与整屏**差一个「本窗口在屏幕上的位置」**⇒ ⇒ 所以字段名
///   **故意不一样**（原生叫 `bounds`，这里叫 `viewBounds`）⇒ ⇒ 结果里
///   也带 `coordinateSpace` ⇒ ⇒ 模型不会把两套坐标搞混。
///
/// ## ⚠️⚠️ 语义树的坐标**本来就是物理像素**（别再乘一次 dpr）
///
/// 这一条是**源码钉死**的事实（Flutter 3.47）：
/// - `RenderView.semanticBounds` ＝ `transformRect(rootTransform, size)`
///   ⇒ ⇒ 根节点那一层就**已经**乘过 `devicePixelRatio`；
/// - `RenderView.applyPaintTransform` 把同一个 `rootTransform` 累乘进
///   **每个后代**的 paint transform ⇒ ⇒ 整棵树的矩形**全是物理像素**。
///
/// ⇒ ⇒ 所以这里**只做坐标累乘**（节点自己的 → 父 → … → view）
/// ⇒ ⇒ **绝不能再乘一次 dpr** ⇒ ⇒ 乘两次 ⇒ ⇒ 坐标翻倍
/// ⇒ ⇒ 模型照着点 ⇒ ⇒ 点到**别的东西**上 ⇒ ⇒ 看起来像「手势坏了」。
///
/// ## ⚠️ 拿不到就**没有**，不猜
///
/// 语义树只有平台**请求语义**时才存在（无障碍服务开着、或本层主动开）
/// ⇒ ⇒ 拿不到就是拿不到 ⇒ ⇒ 返回 null ⇒ ⇒ 调用方**明确失败**
/// ⇒ ⇒ 绝不返回一棵空树冒充「屏幕上什么都没有」。
class FlutterSemanticsTree {
  const FlutterSemanticsTree._();

  /// 找当前 view 的语义树属主。
  ///
  /// ⚠️ 为什么先按 view 找：多 view（分屏 / 折叠屏）时**每个 view 有自己的
  /// 属主** ⇒ ⇒ 只看全局那一个会拿到**别的 view** 的树 ⇒ ⇒ 读出来的
  /// 是**看不见的那块屏**。
  static SemanticsOwner? owner() {
    for (final RenderView view in RendererBinding.instance.renderViews) {
      final SemanticsOwner? candidate = view.owner?.semanticsOwner;
      if (candidate != null && candidate.rootSemanticsNode != null) {
        return candidate;
      }
    }
    // ⚠️ 兜底：pipeline 树的根 —— 单 view 时它就是上面那一个。
    return RendererBinding.instance.rootPipelineOwner.semanticsOwner;
  }

  /// 语义树的根节点（null ⇒ 没有语义树）。
  static SemanticsNode? rootNode() => owner()?.rootSemanticsNode;

  /// **自家 app 现在在前台吗** —— 回落的前提。
  ///
  /// ⚠️ 为什么非要这一格：原生那棵树读不到，只有**两种**可能 ——
  /// ❶ 前台就是自家 app（系统不把自家窗口交给自己绑定的服务）；
  /// ❷ 前台是**别人**、但那棵树**恰好是空的**（窗口还没挂好）。
  /// ⇒ ⇒ 这两种**长得一样** ⇒ ⇒ 靠「树是空的」就回落 ⇒ ⇒ 会在别人
  /// 的屏幕上**显示自家 app 的界面** ⇒ ⇒ 那是最典型的「失败长得像成功」。
  /// ⇒ ⇒ 所以回落前先问一句「自家 app 在前台吗」。
  static bool isOwnAppInForeground() {
    try {
      return WidgetsBinding.instance.lifecycleState ==
          AppLifecycleState.resumed;
    } catch (_) {
      // ⚠️ 绑定还没起来（纯单测环境）⇒ ⇒ **不许**回落
      // ⇒ ⇒ 「拿不到就当没有」⇒ ⇒ 宁可明确失败，也不显示自家界面。
      return false;
    }
  }

  /// 读出**自家 app 自己的界面**（null ⇒ 拿不到）。
  static FlutterSemanticsSnapshot? read({
    ViewOrigin? viewOrigin,
    int maxDepth = kScreenBudgetMaxDepth,
    int maxNodes = kScreenBudgetMaxNodes,
    int maxChars = kScreenBudgetMaxChars,
  }) {
    final SemanticsNode? root = rootNode();
    if (root == null) return null;
    final _Budget budget = _Budget(maxDepth, maxNodes, maxChars);
    final StringBuffer buffer = StringBuffer();
    // ⚠️ **口径跟着「有没有原点」走** —— 拿得到原点 ⇒ ⇒ 输出整屏口径
    // ⇒ ⇒ 字段名与原生那棵**一样**（`bounds`）⇒ ⇒ 模型照着点得准。
    buffer.writeln(_header(viewOrigin != null));
    _visit(
      node: root,
      depth: 0,
      // ⚠️ 根节点的坐标系统**就是**本 view 的物理像素坐标系统
      // ⇒ ⇒ 从它开始累乘。
      parentTransform: Matrix4.identity(),
      buffer: buffer,
      budget: budget,
      viewOrigin: viewOrigin,
    );
    if (budget.truncated) {
      // ⚠️ 截断必须**显式**：静悄悄截断 ⇒ ⇒ 模型以为它看全了屏幕
      // ⇒ ⇒ 然后对着缺失的信息做判断 ⇒ ⇒ 「失败长得像成功」的一族。
      buffer.writeln(kScreenTruncationMarker);
    }
    // ⚠⚠️ **空树 ⇒ 明确失败** —— 与原生侧同一纪律。
    // ⚠️ 语义树「存在」不等于「有内容」：一个**没有文字**的界面
    // ⇒ ⇒ 树里一个带字的节点都没有 ⇒ ⇒ 拍出来只有一行头
    // ⇒ ⇒ 回给模型 ⇒ ⇒ 模型会以为「这一屏是空的」
    // ⇒ ⇒ 那是「失败长得像成功」的一族 ⇒ ⇒ 所以这里回 **null**。
    //
    // ⚠️⚠️ 但「**装不下**」**不等于**「**空**」：预算先耗尽 ⇒ ⇒
    // ⇒ ⇒ 一个节点都没拍进去 ⇒ ⇒ 那不是「屏幕没东西」，
    // ⇒ ⇒ 而是「这一屏**没看全**」⇒ ⇒ 那种情况要**给截断标记**
    // ⇒ ⇒ （模型据此知道「没看全」）⇒ ⇒ 不许回 null。
    // ⇒ ⇒ 判据 ＝ 「一个都没拍进去」**且**「不是因为预算」⇒ ⇒ 才算空树。
    if (budget.emitted == 0 && !budget.truncated) return null;
    return FlutterSemanticsSnapshot(
      text: buffer.toString(),
      nodeCount: budget.visited,
      truncated: budget.truncated,
      coordinateSpace: viewOrigin == null ? 'view' : 'screen',
    );
  }

  /// 在**自家 app 自己的界面**里按文字点一下。
  ///
  /// ⚠️ 为什么走**语义动作**而不是坐标：这一路的坐标是「自家窗口」的
  /// ⇒ ⇒ 与 `mobile_tap` 的「整屏物理像素」**差一个窗口偏移**
  /// ⇒ ⇒ 拿它去点 ⇒ ⇒ 可能点歪 ⇒ ⇒ 看起来像「手势坏了」。
  /// ⇒ ⇒ 所以自家窗口这条路**不用坐标**：让框架把动作**直接派给控件**
  /// ⇒ ⇒ 那是控件自己的回调 ⇒ ⇒ 准。
  ///
  /// @return true ⇒ 找到了一个能点的东西并派发了动作。
  static bool tapByText(String text) {
    final SemanticsOwner? semanticsOwner = owner();
    final SemanticsNode? root = semanticsOwner?.rootSemanticsNode;
    if (semanticsOwner == null || root == null) return false;
    final SemanticsNode? hit = _findByText(root, text);
    if (hit == null) return false;
    // ⚠️ 那个字几乎总是躺在一个**自己不可点**的子节点里
    // ⇒ ⇒ 真正可点的是它**上面**那一层 ⇒ ⇒ 往上找。
    final SemanticsNode? tappable = _clickableAncestorOf(hit);
    if (tappable == null) return false;
    semanticsOwner.performAction(tappable.id, SemanticsAction.tap);
    return true;
  }

  /// 树的头一行 —— 把「这是哪棵树、坐标是什么口径」**写死在文本里**。
  ///
  /// ⚠️ 为什么写在**文本**里而不是只写在代码注释里：这段文字是**给模型看的**
  /// ⇒ ⇒ 模型要知道自己看到的是哪棵树、那些坐标能不能直接拿去点
  /// ⇒ ⇒ 只写在代码里 ⇒ ⇒ 模型永远不知道 ⇒ ⇒ 那就是「失败长得像成功」。
  static String _header(bool wholeScreen) {
    // ⚠ **口径写进文本** —— 同一个字段名 `bounds` 只在**整屏口径**下出现；
    // 本窗口口径下的字段名是 `viewBounds` ⇒ ⇒ 模型不会拿错口径去点。
    if (wholeScreen) {
      return '# source=flutter-semantics (this app own window; bounds are '
          'whole-screen physical px)\n';
    }
    return '# source=flutter-semantics (this app own window; viewBounds are '
        'physical px of THIS window, not whole-screen px)\n';
  }

  /// 深度优先走一遍树。
  ///
  /// ⚠️ [parentTransform] 是**这个节点的父节点**到 view 坐标系统的变换
  /// ⇒ ⇒ 子节点到 view 的变换 = 父节点的变换 ∘ 子节点自己的变换。
  static void _visit({
    required SemanticsNode node,
    required int depth,
    required Matrix4 parentTransform,
    required StringBuffer buffer,
    required _Budget budget,
    required ViewOrigin? viewOrigin,
  }) {
    if (!budget.visit(depth)) return;
    final SemanticsData data = node.getSemanticsData();
    final String label = data.label.trim();
    final String value = data.value.trim();
    // ⚠️ **只拍有字的节点** —— 与原生侧同一纪律 ⇒ ⇒ 布局容器不进模型上下文。
    if (label.isNotEmpty || value.isNotEmpty) {
      final String chunk = _chunk(
        data: data,
        label: label,
        value: value,
        depth: depth,
        transform: parentTransform,
        viewOrigin: viewOrigin,
      );
      if (!budget.canWrite(buffer.length, chunk.length)) {
        // ⚠️ 塞不下 ⇒ ⇒ **写进能塞下的那部分** ⇒ ⇒ 然后收手
        // ⇒ ⇒ （整段丢掉 ⇒ ⇒ 模型看到的是「屏幕突然没了」）。
        final int room = budget.maxChars - buffer.length;
        if (room > 0) buffer.write(chunk.substring(0, room));
        return;
      }
      buffer.write(chunk);
      budget.emitted++;
    }
    // ⚠️ **合并节点不再往下展开** —— 它的子孙已经被吸进它自己的数据里
    // ⇒ ⇒ 再展开就是**同一段文字出现两次**。
    if (node.mergeAllDescendantsIntoThisNode) return;
    if (budget.truncated) return;
    node.visitChildren((SemanticsNode child) {
      final Matrix4? own = child.transform;
      final Matrix4 global =
          own == null ? parentTransform : parentTransform.multiplied(own);
      _visit(
        node: child,
        depth: depth + 1,
        parentTransform: global,
        buffer: buffer,
        budget: budget,
        viewOrigin: viewOrigin,
      );
      // ⚠️ 预算用完 ⇒ ⇒ 立刻停（visitor 返回 false 就停这一层）。
      return !budget.truncated;
    });
  }

  /// 一个节点拍成文本（与原生侧**同一形状**）。
  static String _chunk({
    required SemanticsData data,
    required String label,
    required String value,
    required int depth,
    required Matrix4 transform,
    required ViewOrigin? viewOrigin,
  }) {
    final StringBuffer chunk = StringBuffer();
    final String indent = '  ' * depth;
    chunk.writeln('$indent[${_roleOf(data)}]');
    if (label.isNotEmpty) chunk.writeln('$indent  text: $label');
    if (value.isNotEmpty) chunk.writeln('$indent  desc: $value');
    final Rect? window = _viewBounds(transform, data);
    if (window != null) {
      if (viewOrigin == null) {
        // ⚠ **本窗口口径** —— 字段名**故意不一样**（原生那棵叫 `bounds`）。
        chunk.writeln(
          '$indent  viewBounds: ${window.left.round()},${window.top.round()},'
          '${window.right.round()},${window.bottom.round()}',
        );
      } else {
        // ⚠ **整屏口径** —— 与原生那棵树**同一个字段名、同一个口径**
        // ⇒ ⇒ 模型照着点得准 ⇒ ⇒ 自家窗口也能按坐标操作。
        final Rect screen = Rect.fromLTRB(
          window.left + viewOrigin.x,
          window.top + viewOrigin.y,
          window.right + viewOrigin.x,
          window.bottom + viewOrigin.y,
        );
        chunk.writeln(
          '$indent  bounds: ${screen.left.round()},${screen.top.round()},'
          '${screen.right.round()},${screen.bottom.round()}',
        );
      }
    }
    return chunk.toString();
  }

  /// 这个节点在**本 view 物理像素**里的矩形。
  ///
  /// ⚠️ 变换怎么来：语义节点的 `rect` 是它**自己**那套坐标系统里的框，
  /// 而 `transform` 是「自己 → 父」的换算 ⇒ ⇒ 一路往上累乘才是
  /// view 坐标 ⇒ ⇒ 框架**没有**现成的「给我 view 坐标」的方法
  /// ⇒ ⇒ 这里自己累乘。
  ///
  /// ⚠️⚠️ **不要再乘 dpr** —— 语义树**本来就是物理像素**（见类注释里
  /// 那条源码钉死的理由）⇒ ⇒ 乘两次 ⇒ ⇒ 坐标翻倍 ⇒ ⇒ 点到别的东西上。
  static Rect? _viewBounds(Matrix4 transform, SemanticsData data) {
    final Rect physical = MatrixUtils.transformRect(transform, data.rect);
    if (!physical.isFinite) return null;
    return physical;
  }

  /// 这个节点的「角色」名 —— 模型靠它分辨按钮 / 输入框 / 标题。
  static String _roleOf(SemanticsData data) {
    final SemanticsRole role = data.role;
    if (role != SemanticsRole.none) return role.name;
    final SemanticsFlags flags = data.flagsCollection;
    if (flags.isButton) return 'button';
    if (flags.isTextField) return 'textField';
    if (flags.isHeader) return 'header';
    if (flags.isImage) return 'image';
    if (flags.isLink) return 'link';
    if (flags.isSlider) return 'slider';
    return 'node';
  }

  /// 深度优先找**第一个**文字命中的节点（与原生侧同一形状）。
  static SemanticsNode? _findByText(SemanticsNode node, String text) {
    final SemanticsData data = node.getSemanticsData();
    final String label = data.label;
    final String value = data.value;
    if (label.contains(text) || value.contains(text)) return node;
    SemanticsNode? hit;
    node.visitChildren((SemanticsNode child) {
      hit = _findByText(child, text);
      return hit == null;
    });
    return hit;
  }

  /// 从 [node] 往上找**第一个自己能点**的祖先。
  ///
  /// ⚠️ 为什么要**有上界**：语义树可能很深 ⇒ ⇒ 一路爬到根节点
  /// ⇒ ⇒ 爬到根等于「点整个窗口」⇒ ⇒ 那是**乱按**，不是「点那个字」。
  static SemanticsNode? _clickableAncestorOf(SemanticsNode node) {
    SemanticsNode? current = node;
    int hops = 0;
    while (current != null && hops <= _maxAncestorHops) {
      if (_canTap(current)) return current;
      current = current.parent;
      hops++;
    }
    return null;
  }

  /// 这个节点能不能被「点」。
  ///
  /// ⚠️ 判据用**语义动作位**（`actions`）而不是「像不像按钮」
  /// ⇒ ⇒ 控件自己说它能点才算能点 ⇒ ⇒ 不靠猜。
  static bool _canTap(SemanticsNode node) {
    final SemanticsData data = node.getSemanticsData();
    return (data.actions & SemanticsAction.tap.index) != 0;
  }

  /// 往上找可点祖先时的**上界**（与原生侧同一个思路）。
  static const int _maxAncestorHops = 5;
}

/// 预算 —— 与 Kotlin 侧 `ScreenBudget` 同一形状（深度 / 节点数 / 字符数）。
class _Budget {
  _Budget(this.maxDepth, this.maxNodes, this.maxChars);

  final int maxDepth;
  final int maxNodes;
  final int maxChars;

  int visited = 0;

  /// **拍进文本的**节点数（与 [visited] 不同：visited 数的是**走过**的节点，
  /// 这里数的是**有字、进了模型上下文**的节点）⇒ ⇒ 「一个都没有」＝ 空树。
  int emitted = 0;

  bool truncated = false;

  /// 这个节点还该不该看。
  bool visit(int depth) {
    if (depth > maxDepth) {
      truncated = true;
      return false;
    }
    if (visited >= maxNodes) {
      truncated = true;
      return false;
    }
    visited++;
    return true;
  }

  /// 还能再写 [extra] 个字符吗（只回答「能不能」，不替你写）。
  bool canWrite(int current, int extra) {
    if (current + extra <= maxChars) return true;
    truncated = true;
    return false;
  }
}