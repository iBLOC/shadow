
**Updated:** 2026-11-11 (㌞ **「同一个工具的同一个答案，树与『这是谁的屏』分两次采样 —— 真机上已经张冠李戴过」** —— 承 ㌛ 条（读屏结果的**形状**必须两边一样）＋ ㋘ 条（声称改过的两处从未进过任何提交），本条记**取证（真机逐字读数）**、**第一因（两次独立 `rootInActiveWindow`）**、**第二因（判据写成了「两次独立读数相等」）**、**第三因（两条路的头不同形）**、**这一刀的落点**、**判据与分级读数**，以及**仍然欠着的**.)

> 信封：epoch=2026-11-11 | authority=measured | scope=project | source=真机级实测（odin ee6b4832 · MIUI 14）＋ 注入式反向验证 ＋ 判据自检｜ 改动：android/app/src/main/kotlin/com/ibloc/shadow/PrefrontalAccessibilityService.kt（新增 `readScreenSnapshot()` ＋ 两条路都补头 `package=`）＋ android/app/src/main/kotlin/com/ibloc/shadow/MainActivity.kt（新增通道方法 `readScreenSnapshot`）＋ lib/services/accessibility_controller.dart（新增 `readScreenSnapshot()`）＋ lib/services/capabilities/accessibility_ops.dart（抽象层加 `readScreenSnapshot()` 默认 null ＋ `kOwnAppPackage` 常量下移）＋ lib/services/capabilities/capability_tools.dart（工具层改走单次采样）＋ lib/services/capabilities/flutter_semantics_tree.dart（`_header` 补 `package=`）＋ lib/services/client_tools/client_tool_registry.dart（`mobile_read_screen` 描述：**只动那一行**）＋ **新增** test/unit/mobile_read_screen_description_test.dart（4 条）＋ **新增** test/unit/mobile_read_screen_single_sample_test.dart（3 条）＋ integration_test/a11y_mobile_use_test.dart（真机判据改成「同源」）＋ ../../scripts/lib/mobile-tool-description.mjs（**新增** 纯函数判据）＋ ../../scripts/check-mobile-a11y-contract.mjs（R7 接进闸 ＋ 13/13 自检）｜ 读数：见 ⑤ | status=active | supersedes=none

① **⚠️ 取证：同一时刻，工具层说「设置」，原生说「桌面」** —— 真机逐字读数：
　❶ `--- OTHER APP PKG --- source=android-a11y pkg=com.android.settings rawPkg=com.miui.home coordinateSpace=screen`
　❷ ⇒ ⇒ **`pkg` 与 `rawPkg` 不一致** ⇒ ⇒ 而这两个都出自**同一次调用** ⇒ ⇒ ⇒ 模型拿到的「这是谁的屏」与「这棵树是谁家的」**互相矛盾** ⇒ ⇒ ⇒ **通用形态：一个回答里的多个事实必须来自同一次采样** ⇒ ⇒ 否则它们之间可以互相矛盾 ⇒ ⇒ 而矛盾**长得像正常**。

② **⚠️ 第一因：工具层读「树」与读「这是谁的屏」是两次独立采样**
　❶ `PrefrontalAccessibilityService.readScreenContent()` 与 `foregroundPackage()` **各自**取一次 `rootInActiveWindow` ⇒ ⇒ 前台在两次读取**之间**切换 ⇒ ⇒ 两个答案落在**不同窗口**上 ⇒ ⇒ ⇒ **张冠李戴**（真机上已发生，不是理论风险）。
　❷ ⇒ ⇒ **落点是原生侧**：一次取 `rootInActiveWindow`，**先取包名再遍历** ⇒ ⇒ 树与包名**必然同源**；Dart 抽象层给**默认 null** ⇒ ⇒ 假实现不用改。

③ **⚠️ 第二因：第一版真机判据写成了「两次独立读数相等」** —— 那**正是缺陷本身**：
　❶ ⇒ ⇒ **通用形态：拿「两次独立读数相等」当判据 ⇒ ⇒ 就是在测「环境恰好没变」**。
　❷ ⇒ ⇒ **改法**：判据改成「**树与包名同源**」⇒ ⇒ 而「同源」要**独立地**验 ⇒ ⇒ 办法是**把属主写进树的头**（原生那棵的头写 `# source=android-a11y (package=…)`）⇒ ⇒ 头里的包名与那一格对得上 ⇒ ⇒ ⇒ **同源可自证**。

④ **⚠️ 第三因：同一个工具、同一个答案，却有两条写法**
　❶ 原生那棵的头只写 `source=android-a11y`，回落那棵的头写 `source=flutter-semantics` ＋ 口径 ⇒ ⇒ **形状不同** ⇒ ⇒ 模型得学两套读法 ⇒ ⇒ 它会挑错那套 ⇒ ⇒ ⇒ **通用形态：同一个结果的两种写法 ⇒ ⇒ 模型得自己猜哪套对**。
　❷ ⇒ ⇒ **修法**：两棵树的**头逐字同形**（都写 `source=… (package=…)`）⇒ ⇒ 差异只留在 `source` 的取值与口径说明上。
　❸ ⇒ ⇒ **顺带**：常量 `kOwnAppPackage` **搬到 `accessibility_ops.dart`**（两棵树的**共同下层**）⇒ ⇒ 否则两边互相 import ⇒ ⇒ 就是环。

⑤ **✅ 这一刀的落点（8 个移动端文件 ＋ 2 个尺子文件）**
　❶ **改** `android/.../PrefrontalAccessibilityService.kt`：**新增** `readScreenSnapshot()`（一次取 root ⇒ 先取 `pkg` 再遍历）；`readScreenContent()` 与新方法**都**补头行 `# source=android-a11y (package=…)`。
　❷ **改** `android/.../MainActivity.kt`：新增通道方法 `"readScreenSnapshot"`（走服务层**同一份遍历逻辑**）。
　❸ **改** `lib/services/accessibility_controller.dart`：新增 `static readScreenSnapshot()`（`Map<dynamic,dynamic>` → `Map<String,dynamic>`）。
　❹ **改** `lib/services/capabilities/accessibility_ops.dart`：新增 `readScreenSnapshot()`（**默认 null**）＋ Platform 委派；`kOwnAppPackage` 常量搬到此层。
　❺ **改** `lib/services/capabilities/capability_tools.dart`：工具层改走 `snapshot`（`'foregroundPackage': snapshot != null ? snapshot['package'] as String? : await _a11y.foregroundPackage()`）⇒ ⇒ **不再分两次问**。
　❻ **改** `lib/services/capabilities/flutter_semantics_tree.dart`：`_header` 补 `package=$pkg`（与原生那棵**逐字同形**），并改用字符串插值（消 2 条 lint）。
　❼ **改** `lib/services/client_tools/client_tool_registry.dart`：`mobile_read_screen` 描述**只动那一行**（＋1 −1）⇒ ⇒ 三格逐字段点名 ＋ 明写 `source` **不**说谁的屏 ⇒ ⇒ 别人在飞的 `required_permissions` **一字未动**。
　❽ **新增** `test/unit/mobile_read_screen_description_test.dart`（4 条）＋ **新增** `test/unit/mobile_read_screen_single_sample_test.dart`（3 条）⇒ ⇒ 后者用**调用计数**钉住「走的是一次采样那条路」（`separatePkgCalls == 0`）＋ 假实现**故意**让快照与分开读的包名不一致。
　❾ **改** `integration_test/a11y_mobile_use_test.dart`：真机用例判据**从「两个独立读数相等」改成「树与包名同源」**。
　❿ **新增** `../../scripts/lib/mobile-tool-description.mjs` ＋ **改** `../../scripts/check-mobile-a11y-contract.mjs`（R7 接进闸）⇒ ⇒ 描述口径那一格**也有尺子**。

⑥ **✅ 判据与分级读数（全部实测）**
　❶ **判据自检级**：`check-mobile-a11y-contract.mjs --self-test` ⇒ ⇒ **13/13**（新增 3 条 R7 反例各自都被抓到）⇒ ⇒ EXIT=0。
　❷ **判据真跑级**：改描述**之前** ⇒ ⇒ **当场判红** ⇒ ⇒ 改完 ⇒ ⇒ **EXIT=0**（通道两端一致 ｜ 方法 Dart 15 / Kotlin 15 ｜ 截断标记 [truncated] ｜ 预算 20/2000/20000 ｜ 自家包名两份一致）。
　❸ **反向验证级**：把描述注入回「android-a11y (another app)」⇒ ⇒ 闸 **恰 1 红** ＋ 单测 **恰 1 红** ⇒ ⇒ **两道尺子各自咬得住**（不是恒绿）⇒ ⇒ 还原后闸 EXIT=0 ＋ 单测 **4/4 全绿**。
　❹ **反向验证级（同源级 · 注入式）**：把工具层**改回**分两次问 ⇒ ⇒ 单测 **恰 1 红**（逐字 `Actual: com.miui.home` 而非 `com.android.settings`）⇒ ⇒ ⇒ 还原后 **3/3 全绿**。
　❺ **相关单测级**：四个相关单测文件 ⇒ ⇒ **26/26 全绿**。
　❻ **静态级**：`flutter analyze`（精确文件列表）⇒ ⇒ **零 error / 零 warning**。
　❼ **真机级（odin ee6b4832 · MIUI 14）**：见 ⑦。

⑦ **⚠️ 真机读数（修法后重跑，odin）**
　❶ **修法前**（第一次真机跑）：新增用例当场红 ⇒ ⇒ 逐字 `pkg=com.android.settings rawPkg=com.miui.home` ⇒ ⇒ **张冠李戴**当场复现。
　❷ **修法后重跑**（odin ee6b4832 · MIUI 14）：**13/13 全绿、退出码 0** ⇒ ⇒ 逐字 `--- SAME SOURCE PKG --- source=android-a11y pkg=com.miui.home coordinateSpace=screen len=20012 head=# source=android-a11y (package=com.miui.home)` ⇒ ⇒ ⇒ **树头 `package=` 与 `foregroundPackage` 逐字一致** ⇒ ⇒ ⇒ **同源成立**。
　❸ ⚠️ **这一轮采样时前台是桌面**（`com.miui.home`）⇒ ⇒ 「别家 app 在前台」那场景**这一轮没直接采到** ⇒ ⇒ ⇒ 但判据钉的是**关系**（「树头属主 ＝ 那一格」），不是**取值** ⇒ ⇒ ⇒ **任何前台都该过** ⇒ ⇒ ⇒ 而它**在修法前红过** ⇒ ⇒ ⇒ **判据咬得住**。
　❸ ⇒ ⇒ **通用形态：同一个缺陷要「先复现、后修、再复跑」** ⇒ ⇒ 只跑修后那一遍 ⇒ ⇒ 读到绿**不能**说明修法有用 ⇒ ⇒ 因为**判据可能压根没咬住缺陷**（恒绿）。

⑧ **⚠️ 圈码：本条占 U+331E（㌞）** —— 插前**当场重扫**（父仓/移动端/桌面端 × 工作树/索引/HEAD ＝ **9 面**，官方判据 `extractEntries`，**声明与提及分开**、码位按**十六进制**计）⇒ ⇒ 读数：移动端三面**齐平**（各 58 条 / 57 个声明，最高已声明 **U+331B**）⇒ ⇒ **U+331C 提及 3 次**（我上一条留的缓冲 ⇒ ⇒ **让开位**）＋ **U+331D 提及 3 次**（父仓那条提到的「移动端下一枚」⇒ ⇒ **让开位**）⇒ ⇒ ⇒ **U+331E 声明 0 次、提及 0 次** ✔ ⇒ ⇒ ⇒ ⇒ **通用形态：码位是全局资源 ⇒ ⇒ 取号前必须扫「所有账本的所有面」** ⇒ ⇒ 而且**自己上一轮留的缓冲也会被别人取走** ⇒ ⇒ 本条**不写「下一枚可取 ＝ X」**。
　❶ ⇒ ⇒ 本条**只引用已提交的码位**（U+331B）⇒ ⇒ ⚠️ **插完立刻复跑码位闸**是硬约束。

⑨ **⚠️ 仍然欠着的**
　❶ **模型行为级读数仍缺** ⇒ ⇒ 「模型拿到这三格**会不会真的用对**」⇒ ⇒ 那要**真机 ＋ 真模型**的一次端到端。
　❷ ✅ **`foregroundPackage()` 那条老路已被工具层彻底断掉**（2026-11-11 续刀）—— 原记的「欠一条『快照失败时的行为』判据」**已补上**：
　　❶ 工具层：快照失败 ⇒ ⇒ **那一格回 null**（`: await _a11y.foregroundPackage()` → `: null`）⇒ ⇒ **不再另问一次** ⇒ ⇒ 因为「另问一次」= **第二次独立采样** = 本条修的那个缺陷 ⇒ ⇒ ⇒ 而「快照失败」与「另问能成」几乎**不可能同时发生**（同一段遍历逻辑的两个出口 ⇒ ⇒ 判空条件相同）⇒ ⇒ ⇒ ⇒ ⇒ **「同源」是**无条件**性质，不许有「成功时同源、失败时不同源」的缝**。
　　❷ 单测：原「回落成两次问」那条改成「**不许**再单独问一次包名 ⇒ ⇒ 那一格回 null」⇒ ⇒ 假实现**故意给一个看着很真的值**（`com.miui.home`）⇒ ⇒ **反向验证**：改回另问一次 ⇒ ⇒ **恰 1 红**（逐字 `Actual: 'com.miui.home'`）⇒ ⇒ 还原后全绿。
　　❸ ⇒ ⇒ **通用形态：回退路径也不许偷偷换个来源** ⇒ ⇒ 「主路径失败了 ⇒ ⇒ 换一个**独立**的来源补上」⇒ ⇒ 看着像「更稳」⇒ ⇒ 实际上把**同一个缺陷**从主路径挪到了回退路径。
　　❹ ⚠️ **底层老路仍在**（Kotlin 的 `foregroundPackage()`、通道方法、抽象层方法）⇒ ⇒ 因为**真机探针**直接调它做「前后台对比」⇒ ⇒ 但**工具层**已无调用点 ⇒ ⇒ 「能力在、但没人用」≠「死代码」。
　❸ ⚠️ **机型那条的读数在变**（续刀）—— odin 掉线（USB）⇒ ⇒ **MI MAX 2（Android 7.1.1 · arm64-v8a）在线** ⇒ ⇒ 续刀的真机腿改在**它**上面跑 ⇒ ⇒ ⇒ ⇒ ⇒ **第二台机型**上的读数 ⇒ ⇒ ⇒ ⇒ ⇒ **LX04 装不上**（ABI `armeabi-v7a`，APK 只有 `arm64-v8a + x86_64`）⇒ ⇒ ⇒ ⇒ ⇒ ⇒ ⇒ 需重编含 armeabi-v7a 的 APK（**改构建配置 ⇒ ⇒ 影响面大 ⇒ ⇒ 待拍板**）。
　❹ `integration_test/` 仍不在 CI 里跑 ⇒ ⇒ 本条那条真机守卫也一样 ⇒ ⇒ **静悄悄绿**。
　❺ **iOS 未验** ⇒ ⇒ 本条全部读数都在 **Android**（`readScreenSnapshot` 是 Kotlin 侧）⇒ ⇒ iOS 侧那条回落路径**没有同源保证**。

**Updated:** 2026-11-11 (㌛ **「读屏结果的**形状**必须两边一样 —— 回落分支少一个键，模型就分不清『值是空』与『没实现』」** —— 承 ㋘ 条（U+32D8 那笔声称改过的两处**从未进过任何提交**），本条记**取证**、**第一因**、**第二因**、**这一刀的落点**、**判据与分级读数**，以及**仍然欠着的**.)

> 信封：epoch=2026-11-11 | authority=measured | scope=project | source=真机级实测（odin ee6b4832 · MIUI 14）＋ 判据自检 ＋ 注入式反向验证 ＋ 提交面机械构造取证｜ 改动：lib/services/capabilities/accessibility_ops.dart、lib/services/capabilities/capability_tools.dart、lib/services/client_tools/client_tool_registry.dart、test/unit/mobile_use_screen_truncation_test.dart、test/unit/flutter_semantics_tree_test.dart、../../scripts/check-mobile-a11y-contract.mjs（＋本条账本）｜ 读数：见 ④ ｜ 提交：`6d18b4a` | status=active | supersedes=none

① **⚠️ 取证：㋘ 条（U+32D8）声称改过的两处**从未进过任何提交** ⇒ ⇒ 「账本在说假话」** ——
　❶ `git log --all -S 'ktBudget' -- scripts/check-mobile-a11y-contract.mjs` ⇒ ⇒ **零命中**；`git log --all -S 'android-a11y for another app'` ⇒ ⇒ **零命中** ⇒ ⇒ 那批判据（预算常数比对／截断标记复用／嵌套泛型修复）与那一句工具描述**只在工作树与暂存区**。
　❷ ⇒ ⇒ 本条**一并补进提交树**（提交 `6d18b4a`）⇒ ⇒ 而不是把账本改软。

② **⚠️ 第一因：读屏结果的**形状**没有契约** —— 同一个 `mobile_read_screen`，两条分支给出两种形状：
　❶ 原生那棵树 ⇒ ⇒ 结果 map **有** `'foregroundPackage'`；
　❷ Flutter 语义树那棵（回落分支）⇒ ⇒ **没有这个键** ⇒ ⇒ 模型分不清「值是空」与「这一格没实现」。
　❸ ⇒ ⇒ 修法：回落分支补键（＝自家包名，因为回落的前提**就是**自家 app 在前台 ⇒ ⇒ 答案**已知**）⇒ ⇒ **两条分支形状一样**。

③ **⚠️ 第二因：工具层绕过了可注入抽象 ⇒ ⇒ 这一格只有真机能验** ——
　❶ 原生分支直连静态 `AccessibilityController.foregroundPackage()` ⇒ ⇒ 单测塞假的 `AccessibilityOps` **测不到**。
　❷ ⇒ ⇒ 修法：`AccessibilityOps` 加 `foregroundPackage()`（**默认回 null** ⇒ ⇒ 假实现不用改）＋ `PlatformAccessibilityOps` 委派静态控制器 ⇒ ⇒ 工具层改走 `_a11y`。
　❸ ⇒ ⇒ 工具描述（`client_tool_registry.dart`）补「这是谁的屏」＋「null ＝ 读不到」的口径 ⇒ ⇒ 模型看得见。

④ **✅ 判据与分级读数**
　❶ **判据自检级**：契约闸自检 **10/10** ＋ 主检查 **EXIT=0**（逐字：方法 Dart 14 / Kotlin 14；截断标记对齐；预算 20 / 2000 / 20000；**自家包名两份一致**）。
　❷ **静态级**：`flutter analyze` **零 issue**；读屏族两条单测 **19/19**。
　❸ **反向验证级**：注入「改回静态直连」⇒ ⇒ **恰 1 红**（`Actual: <null>`）；注入「删掉回落分支的键」⇒ ⇒ **恰 1 红**。
　❹ **提交面级**：`6d18b4a`（6 文件 / +319 −5）⇒ ⇒ registry **只动那一行**（＋1 −1）⇒ ⇒ 别人在飞的 `required_permissions` **一字未动**。
　❺ **真机级**：// 真机读数（填进台账的 ⑧❺ 那一行）
**真机级（odin `ee6b4832` · MIUI 14 / Android 13）**：读屏族 **12/12 全绿**，逐字 `--- VERDICT --- PASS failures=[]` ＋ `All tests passed.` ＋ **退出码 0**；长按腿逐字 `--- LONG PRESS TRY --- label=3° at 169.5,741.5 pkgBefore=com.miui.home pkgAfter=com.miui.home`（前台没换人 ⇒ ⇒ 没被当成点按）；截断那条逐字 `--- TOOL LAYER --- truncated=false marker=false len=2770`；MD5 对账一致 `13105b2ad55c5c2e9dea30bcf3ddc21e`；设备态已还原（无障碍 `null`/`0`、旋转 `1`/`0`）。
⚠️ **这一轮 APK 是从**工作树**构建的** ⇒ ⇒ 里面**含**能力授权那条线在飞的未提交改动 ⇒ ⇒ 所以真机读数是**工作树面**的读数，不是纯 `6d18b4a` 那一棵树上的读数。

⑤ **⚠️ 仍然欠着的**
　❶ 「模型会不会**真的用**这一格」还没验 ⇒ ⇒ 那要**模型行为级**的读数。
　❷ 真机腿仍**只在 odin 一台机型**上跑过（MIUI 14）⇒ ⇒ LX04 与 MI_MAX_2 **都得用户动手**。
　❸ `integration_test/` 仍不在 CI 里跑 ⇒ ⇒ 那 26 处守卫在 CI 里永远静悄悄绿。
　❹ 截断的 **20000 字符预算**本身没被重新论证过。

⑥ **⚠️ 圈码：本条占 U+331B（㌛）** —— 插前**当场重扫**（三本账本 × **三个面**，官方判据 `extractEntries`，声明与提及分开）⇒ ⇒ 移动端三面**齐平**（各 57 条 / 56 个声明，最高已声明 **U+32FD**）⇒ ⇒ ⚠️ **但只看移动端这一本会取错号** —— 全量扫（三本 × 三面）显示 **U+32FE…U+331A 都已被父仓那条线占着** ⇒ ⇒ **U+331B 声明 0 次、提及 0 次** ✔ ⇒ ⇒ 按惯例**再留一枚缓冲（U+331C）** ⇒ ⇒ ⚠️ 本条**只引用已提交的码位**（U+32D8）⇒ ⇒ **插完立刻复跑码位闸**是硬约束。

　⚠️ **途中的一次自我打脸（值得记）**：第一版本条取 **U+32FF**，插入后码位闸当场判红 ⇒ ⇒ 逐字：「❌ [dup-codepoint] 码位 U+32FF 被 2 条占用：父仓L5420, 移动端L1」⇒ ⇒ **移动端这一本**的 U+32FE–U+32FF 是空的，**父仓**早占了 ⇒ ⇒ 而我第一版**只扫了移动端那一本** ⇒ ⇒ ⇒ **通用形态：圈码要扫「所有账本的所有面」，不是「我这一本」** ⇒ ⇒ 另一处同款：**手打字形**也写错过一次（把 U+34B0 写成了 U+3370 的字形 ⇒ ⇒ 闸逐字报「注解写 U+34B0，而标题里的「㍰」真实码位是 U+3370」）⇒ ⇒ **字形要按码位算，不要手打**。

**Updated:** 2026-11-09 (㊭ **「CI 那条红不是『上游资产被换』—— 是 GitHub 的 504 页被当成了资产；这一刀让 Linux 干脆不去下载」** —— 承 ㊮ 条（滑动正路径），本条记**取证（坏哈希的真身）**、**这一刀的落点**、**判据与反向验证**、**分级读数**，以及**仍然欠着的**。)

> 信封：epoch=2026-11-09 | authority=measured | scope=project | source=真机实测（本地按字节复算 ＋ 上游 issue 核对 ＋ 本地全量 flutter test ＋ CI 复跑）｜ 改动：`shadow-mobile/pubspec.yaml`（`hooks.user_defines.sqlite3.source` **按 OS 分岔** ＋ sqlite3 提为显式 dev 依赖 ^3.9.1）、`shadow-mobile/pubspec.lock`（sqlite3 3.5.2→3.9.1／hooks 2.0.2→2.2.0／record_use 0.6.0→1.1.1）、**新增** `shadow-mobile/test/unit/sqlite_asset_source_contract_test.dart`（4 条）；**零产品逻辑改动** | status=active | supersedes=none

① **⚠️ 取证：坏哈希的真身是 GitHub 的 504 页（92 字节），不是「资产被掉包」** —— 现象：CI 的 `Mobile Test` job 在 **native asset 构建阶段**就红 ⇒ ⇒ `Bad state: Hash of downloaded file libsqlite3.x64.linux.so is bef140a1…, expected b1772918…` ⇒ ⇒ **连测试都没开始**（与「测试失败」是两件事）。取证五步：❶ 本地重下上游同一个 URL（1,801,592 字节 ⇒ sha256 ＝ `b1772918…`）⇒ ⇒ **上游资产完好**；❷ 枚举上游 **30 个 release × 1372 个资产**的官方 `digest` ⇒ ⇒ **没有一条是 `bef140a1…`** ⇒ ⇒ 坏字节**不是任何上游发布物**；❸ 把 GitHub 的 504 页**按字节复算**（LF ＋ 末尾换行 ＝ **92 字节**）⇒ ⇒ sha256 ＝ **`bef140a1…` 逐字一致**；❹ 上游 issue **simolus3/sqlite3.dart#435／#436** 用的**就是同一个哈希** ⇒ ⇒ 维护者实测：那是 **GitHub release CDN 的 504 页**；❺ 根因＝**上游 hook 不检查 `response.statusCode`** ⇒ ⇒ 错误页被当资产喂进哈希器 ⇒ ⇒ 报错长得像「资产被掉包」⇒ ⇒ **其实是「下载失败」**。

② **✅ 这一刀的落点：Linux 干脆不去下载** —— ❶ `pubspec.yaml` 加 `hooks.user_defines.sqlite3.source: {linux: system, default: sqlite3}` ⇒ ⇒ **Linux 走 dlopen 系统那份 libsqlite3.so**（CI 的 `Install SQLite runtime` 早就在装 `libsqlite3-dev` ⇒ ⇒ 那一步**从「顺手装的」变成「真正的提供者」**）⇒ ⇒ 这条路径**零网络** ⇒ ⇒ 上游 CDN 抖动**再也伤不到移动端 CI**；❷ `default: sqlite3` ⇒ ⇒ **Windows／Android／macOS 仍用包自带的预编译库** ⇒ ⇒ 本地开发与 APK 打包**一个字没变**；❸ **sqlite3 3.5.2 → 3.9.1**（连带 hooks 2.0.2 → 2.2.0、record_use 0.6.0 → 1.1.1）⇒ ⇒ 因为**按 OS 分岔 `source` 是 3.9.1 才有的能力**（3.5.2 的 `source` 是全局的 ⇒ ⇒ 全局设 `system` 会连带打断 Windows／Android）⇒ ⇒ ⇒ **升级与这段配置必须同刀**；❹ **零产品逻辑改动**（只动依赖版本 ＋ 构建期配置 ＋ 判据）。

③ **✅ 判据（新增 4 条，只承重这一族）** —— ❶ `pubspec.yaml` 的 `source` 必须是**按 OS 的映射**且 **`linux: system`**（不许回退成下载）；❷ **锁文件**里的 sqlite3 **≥ 3.9.1**（per-OS 映射能力）—— 降级会让映射**失效**（3.5.2 读到 Map 会直接抛 `Unknown source` ⇒ ⇒ **响亮地坏**，不是静默）；❸ **实际解析到的** sqlite3 版本（`.dart_tool/package_config.json` ＋ 包自己的 pubspec）**≥ 3.9.1**（锁文件说的不算，**这台机器真用的**才算）；❹ CI 的 workflow 里**仍装 `libsqlite3-dev`**（系统库是 Linux 分支的真正提供者 ⇒ ⇒ 少了它 CI 必红）。⇒ ⇒ 这四条**跑在每一次 `flutter test` 里** ⇒ ⇒ **不用改 `ci.yml`**（那个文件此刻有并行会话的在飞改动 ⇒ ⇒ 不碰）。

④ **✅ 反向验证（两档，各恰好 1 红）** —— ❶ 把 `linux: system` 改成 `linux: sqlite3` ⇒ ⇒ **恰好 1 红**（❶），报出的 Actual 逐字写着 `linux: sqlite3` ⇒ ⇒ 其余三条仍绿；❷ 把锁文件里的 sqlite3 改回 `3.5.2` ⇒ ⇒ **恰好 1 红**（❷）⇒ ⇒ 而 ❸ 仍绿（实际装着的还是 3.9.1）⇒ ⇒ **两条判据彼此独立**（锁文件说的 ≠ 实际用的）；❸ 两处复原后 ⇒ ⇒ **4/4 绿**。

⑤ **✅ 分级读数** —— ❶ **判据级**：新判据 **4/4 绿**（本地）；❷ **取证级**：坏哈希＝那张 504 页（**92 字节，sha256 逐字一致**）＋ 上游 **1372 个资产**里没有它 ＋ 上游 issue #435／#436 同一哈希；❸ **本地全量级**：移动端 `flutter test` **737 通过 / 12 跳过 / 0 失败**（**排除**并行会话**未跟踪**的在飞文件 `encephalon_page_credential_probe_test.dart` —— 它会把进程**卡死**（CPU 停在 48.38s 不再增长）⇒ ⇒ 那是**环境债**，本刀的账本里早有记载 ⇒ ⇒ 且它**没进仓** ⇒ ⇒ CI 看不到它）；❹ **CI 级**：run `42654668712`（提交 `e00d60cd`）⇒ ⇒ `Mobile Test` job **success** ⇒ ⇒ `flutter test` **675 通过 / 12 跳过 / 0 失败**（**含新判据那 4 条** ⇒ ⇒ 它们**在 Linux runner 上真跑过** ⇒ ⇒ ❶ ❷ ❸ 在那台机器上成立）⇒ ⇒ `Install SQLite runtime` 认到 `libsqlite3-dev 3.46.1` ⇒ ⇒ 全程**没有** `Building assets for package:sqlite3 failed`／`Hash of downloaded file` 那一族 ⇒ ⇒ 同一 run 其余 10 个 job 全绿（含 `Ledger codepoints`）✔ ⇒ ⇒ ⚠️ 「Linux 那条路**不再下载**」的运行时读数＝**按 3.9.1 的代码路径**（`system` 落在 `ExternalSqliteBinary` 那一支 ⇒ ⇒ **没有下载动作**）＋ CI 绿 ＋ 判据在 CI 内通过 ⇒ ⇒ 而**不是**「日志里没看到下载」（成功下载是**静默**的 ⇒ ⇒ 日志沉默**证不了**什么）。

⑥ **⚠️ 仍然欠着** —— ❶ **真机级**全欠（设备离线）；❷ **Android／macOS 仍走下载** ⇒ ⇒ 那条路**仍然暴露在同一张 504 页之下**（本刀只把 **Linux** 那条摘出来 ⇒ ⇒ APK 打包那条路**未摘**）；❸ 上游 3.9.1 只把报错改成「HTTP 504」**更诚实** ⇒ ⇒ **它不消除下载** ⇒ ⇒ 真正的摘除靠的是本条那两行 per-OS 映射；❹ `Mobile Test` 里 **Gradle 分发包**那一步的 504 是**同一族**的另一个面 ⇒ ⇒ CI 里已用重试挡着；❺ 上游那条 **「下载失败要报状态码」**的修法（3.9.1 才带）只让报错**诚实**，**不是**修复 ⇒ ⇒ 别把「升级」当修复。

⑦ **⚠ 圈码**：本条占 **U+32AD（㊭）** —— 插前**重扫**（三账本 × 三个面：工作树／HEAD／origin/master）⇒ ⇒ Enclosed CJK 段里 **0x32B0 ＝ 父仓**、**0x32AE／0x32AF ＝ 移动端**、再往下 **0x32AD 三面全空闲** ✔ ⇒ ⇒ 取 **U+32AD** ⇒ ⇒ 避开 **U+3300–U+33FF**（CJK 兼容表意文字 ⇒ NFKC 会变形 ⇒ ⇒ 闸明说不能拿 NFKC 判重）⇒ ⇒ 标题里的标记字形用 `String.fromCodePoint(0x32AD)` 逐字核对过 ✔ ⇒ ⇒ 插完立刻复跑码位闸。
**Updated:** 2026-11-09 (㊮ **「滑动正路径 —— 移动端这一侧补上了「滑 ⇒ ⇒ 看得见 ⇒ ⇒ 点得到」这一整条链的离线判据，真机那条端到端也写好了」** —— 承 ㊯ 条（自家窗口的整屏坐标），本条记**移动端这一侧**新增了什么、**离线读数**、**反向验证（含一根**没红**的钉）**，以及**仍然欠着的**。)

> 信封：epoch=2026-11-09 | authority=measured | scope=project | source=真机实测（新增 `test/unit/mobile_use_scroll_reachability_test.dart`、`integration_test/a11y_scroll_to_item_test.dart`、`test_driver/a11y_scroll_to_item_test.dart`；读数：analyze **0 issue**、离线单测 **4/4**、反向验证四根钉）| status=active | supersedes=none

① **✅ 新增三个文件**：离线判据（`test/unit/mobile_use_scroll_reachability_test.dart` **4 条**：视口外的项**看不见**／滑过去**看得见**且 bounds 与量出来的一致／看得见 ⇒ **按文字点得到**（控件自己的回调被触发）／**负控**：看不见的字不许点）＋ 真机端到端（`integration_test/a11y_scroll_to_item_test.dart`）＋ 配套驱动（`test_driver/a11y_scroll_to_item_test.dart`）。

② **✅ 真机那条钉的是**整条链**：读**自家窗口**的树（用原生原点 ⇒ ⇒ **整屏口径**）⇒ ⇒ **照着树给的坐标滑** ⇒ ⇒ 再读树 ⇒ ⇒ 断言出现**初始看不见**的项 ⇒ ⇒ **照着新树里的坐标点那一项** ⇒ ⇒ 断言**那一项自己的回调**被触发 ⇒ ⇒ 不是「派发出去了」。

③ **✅ 读数**：analyze **0 issue**、离线单测 **4/4**、码位闸**零违规**；另：反向验证复原后树模块的 blob ＝ `49d5f226`（与上一轮保险 blob **逐字相同**）⇒ ⇒ 复原是**可证的**。

④ **✅ 反向验证（含一根**没红**）**：摘掉 `performAction` ⇒ ⇒ 恰好 1 条红；不展开子树 ⇒ ⇒ 2 条红；把断言改成查一个不存在的编号 ⇒ ⇒ 那条红；⚠️ **把祖先上界改成 0 ⇒ ⇒ 没红** ⇒ ⇒ **源码事实**：那一项的语义节点**自己**就带 tap 动作 ⇒ ⇒ 「按文字点得到」靠的是它自己 ⇒ ⇒ **祖先上界那条判据在这一族上不承重**（承重的是探针那族：字在不可点的子节点里）。

⑤ **⚠ 仍然欠着**：**真机腿全欠**（新写的端到端一行都没跑过）；移动端**全量** `flutter test` 被并行会话在飞的 widget 测试挡住；**能力档位未拍板** ⇒ ⇒ 本刀**没新增任何模型侧工具**。

⑥ **⚠ 圈码**：本条占 **U+32AE（㊮）** —— 三账本里 **U+32FE–U+331A 全被占**（父仓那一段）⇒ ⇒ **U+3300–U+33FF 是 CJK 兼容表意文字**（NFKC 会变形 ⇒ ⇒ 闸明说不能拿 NFKC 判重 ⇒ ⇒ 避开）⇒ ⇒ 取 **U+32AE**（Enclosed CJK 段内、三账本 **0 命中** ✔；上一条占的 U+32AF 已用 ⇒ ⇒ 往下取一个空位）⇒ ⇒ 插入后复跑码位闸 ＋ 条目计数双钉住。

**Updated:** 2026-11-09 (㊯ **「自家窗口的坐标升级成**整屏口径** —— 原生侧量出 FlutterView 在屏幕上的原点 ⇒ ⇒ 语义树的 `bounds` 与原生那棵**逐字同名** ⇒ ⇒ 顺带修掉「空树当成功」⇒ ⇒ 探针接上新刀当裁判」** —— 承 ㋘ 条（自家 app 的界面模型），本条记**移动端这一侧**改了什么、**两棵树的坐标口径怎么分**、**离线读数**，以及**仍然欠着的**。)

> 信封：epoch=2026-11-09 | authority=measured | scope=project | source=真机实测（改动：`MainActivity.kt`（`getViewGeometry` ＋ 递归找 `FlutterView`）、`accessibility_controller.dart`（`viewGeometry()`）、`accessibility_ops.dart`（**默认 null** ＋ 真机委托）、`flutter_semantics_tree.dart`（`ViewOrigin`／`coordinateSpace`／空树守卫）、`capability_tools.dart`（换算原点 ＋ 口径跟快照）、`test/unit/flutter_semantics_tree_test.dart`（＋4 条）、`integration_test/a11y_own_ui_probe_test.dart`（语义标签 ＋ 原点当裁判）；读数：analyze **0 issue**、单测 **56/56**、Kotlin **BUILD SUCCESSFUL**、契约闸 **EXIT=0**（自检 9 条）、跨端闸**阻断 0**、码位闸**零违规**）| status=active | supersedes=none

① **✅ 原生侧**量**原点**（不是算）：`MainActivity.getViewGeometry` ⇒ ⇒ **递归**找 `FlutterView`（宿主把它放在容器里）⇒ ⇒ `getLocationOnScreen` ⇒ ⇒ **拿不到就 null**（分屏／折叠屏／DeX／edge-to-edge ⇒ ⇒ 算不出来）。

② **✅ Dart 侧三段**：通道方法 `AccessibilityController.viewGeometry()`（缺通道／异常 ⇒ null）⇒ ⇒ 抽象类 `AccessibilityOps.viewGeometry()` **默认实现回 null**（⇒ ⇒ 单测里的假实现**不用改** ⇒ ⇒ 「拿不到就不换算」这条纪律**默认就成立**）⇒ ⇒ 工具层回落时拿它换算。

③ **✅ 口径跟着原点走**：有原点 ⇒ ⇒ `bounds`（＝整屏物理像素，**与原生那棵逐字同名**）；无原点 ⇒ ⇒ `viewBounds`（本窗口口径）⇒ ⇒ **两套口径不许同时出现在一棵树上**；头行那一行也跟着改（口径**写进给模型看的文本**）⇒ ⇒ 模型据此知道自己能不能照着坐标点。

④ **✅ 空树 ⇒ null**（语义树存在 ≠ 有内容）⇒ ⇒ 但「**装不下**」≠「**空**」⇒ ⇒ 预算先耗尽 ⇒ ⇒ 给 `[truncated]` 标记，**不**回 null ⇒ ⇒ 判据 ＝「一个都没拍进去」**且**「不是因为预算」。

⑤ **✅ 离线读数**：analyze **0 issue**、单测 **56/56**（＋4 条）、Kotlin **BUILD SUCCESSFUL**、契约闸 **EXIT=0**（自检 **9 条**）、跨端闸**阻断 0**、码位闸**零违规**；反向验证**四根钉改坏必红**（原点换算错／空树守卫失效／工具层口径写死／闸抽取退化）。

⑥ **⚠ 仍然欠着**：**真机腿全欠**（设备离线 ⇒ ⇒ 原生原点没在真机上量过、探针当裁判那条没跑过、语义树在真机上的存在性没验过）；移动端**全量** `flutter test` 被并行会话在飞的 `encephalon_page_credential_probe_test.dart` 挡住；**能力档位未拍板** ⇒ ⇒ 本刀**没新增任何模型侧工具**。

⑦ **⚠ 圈码**：本条占 **U+32AF（㊯）** —— 三账本里 **U+32FE–U+331A 全被占**（父仓那一段）⇒ ⇒ 而 **U+3300–U+33FF 是 CJK 兼容表意文字**（NFKC 会变形 ⇒ ⇒ 闸明说不能拿 NFKC 判重 ⇒ ⇒ 避开）⇒ ⇒ 取 **U+32AF**（Enclosed CJK 段内、三账本 **0 命中** ✔）⇒ ⇒ 插入后复跑码位闸 ＋ 条目计数双钉住。

**Updated:** 2026-11-08 (㋘ **「自家 app 的界面模型 —— Flutter 语义树那一层落进移动端：既有 `mobile_read_screen` 在自家窗口上**不空着**（原生那棵树在自家窗口上**必然是空的**）⇒ ⇒ 结果**标明来源**（`android-a11y` vs `flutter-semantics`）⇒ ⇒ 两棵树的坐标**不混为一谈**」** —— 本条记**新增模块**、**工具层回落**、**离线自检**、**契约闸扩了一条**，以及**仍然欠着的**。)

> 信封：epoch=2026-11-08 | authority=measured | scope=project | source=真机实测（新增 `lib/services/capabilities/flutter_semantics_tree.dart`、改 `lib/services/capabilities/capability_tools.dart` ＋ `lib/services/client_tools/client_tool_registry.dart`、改 `scripts/check-mobile-a11y-contract.mjs`；新增单测 `test/unit/flutter_semantics_tree_test.dart`；读数：单测 **9/9**、受影响三文件 **52/52**、analyze 本刀文件 **0 issue**、契约闸 **EXIT=0**（自检 8 条）、跨端闸 **阻断 0**、反向验证 **三处全红**）| status=active | supersedes=none

① **✅ 新增模块**：`FlutterSemanticsTree` 从 **Flutter 语义树**读出「自家 app 自己的界面」⇒ ⇒ 拍成与原生侧**同一形状**的文本，但坐标字段**故意换名** `viewBounds` ⇒ ⇒ 与原生那棵的 `bounds`（整屏像素）**不可能被混用**；⚠️ **坐标本来就是物理像素**（`RenderView.semanticBounds` 的 rootTransform 已含 dpr）⇒ ⇒ 不许再乘一次。

② **✅ 工具层回落**：`mobile_read_screen` 原生树读不到 ⇒ ⇒ 回落到 Flutter 语义树 ⇒ ⇒ 结果带 `source` ＋ `coordinateSpace`；`mobile_find_and_click` 同理，但自家窗口那条路**走语义动作**（不用坐标）⇒ ⇒ 避开「本窗口坐标 ≠ 整屏坐标」。⚠️ **纪律**：回落的前提是「原生树读不到 **且** 自家 app 在前台」⇒ ⇒ 在别人的屏幕上找不到那个字 ⇒ ⇒ **明确失败**，不许去点自家 app。

③ **✅ 离线自检 ＋ 闸**：`test/unit/flutter_semantics_tree_test.dart` **9/9**（含「控件自己的回调被触发」＋ 两条负控）⇒ ⇒ 契约闸加了「两端口径的三个预算常数」＋「Flutter 那一棵必须复用同一个截断标记常量」⇒ ⇒ 自检 **8 条**全过 ⇒ ⇒ 反向验证三处**改坏必红**（坐标多乘 dpr / 前台守卫失效 / 两棵树混）。

④ **⚠️ 仍然欠着**：**真机腿没跑**（读数全是离线级）⇒ ⇒ 真机语义树是否存在、真机上的 `viewBounds` 是不是那个窗口的物理像素，**都还没在真机上验过**；**窗口偏移没解**（Flutter 侧拿不到本窗口在屏幕上的位置）⇒ ⇒ 自家窗口只能靠语义动作；**能力档位未拍板** ⇒ ⇒ 本刀**没有新增任何模型侧工具**。详见父仓 U+3410 条。

⑤ **⚠️ 圈码**：本条占 **U+32D8（㋘）** —— 插前 **fetch 远端失败**（代理拒连 ⇒ EXIT=128）⇒ ⇒ 只按**本地三账本**实测取码 ⇒ ⇒ U+32D8 三账本 **0 命中** ✔（U+32xx 段里**唯一**的空位）⇒ ⇒ 插入后复跑码位闸 ＋ 条目计数双钉住。
⑥ **⚠️ 这一刀落地途中被覆盖过一次** —— 两个**已跟踪**文件（`capability_tools.dart` / `client_tool_registry.dart`）的工作树内容**被恢复成 HEAD 版** ⇒ ⇒ 改动**当场蒸发** ⇒ ⇒ 已重放并复验（analyze 0 issue / 单测 52/52 / 三道闸全绿）⇒ ⇒ 四个文件的内容已 `git hash-object -w` 写进对象库当保险（`git cat-file -p <blob>` 可取回）⇒ ⇒ **判据：在飞文件裸放在共享工作树里不叫保存**。详见父仓 U+3410 条。

**Updated:** 2026-11-08 (㋺ **「移动端 widget 测试的一个 CI-only 飘红 —— `!timersPending` 在慢 runner 上随机红：启动链上的**真库**那条路没全断（模型元数据仓储）⇒ ⇒ 这一刀断掉一处，还欠一处」** —— 本条记**症状与证据**、**根因家族**、**这一刀断掉的那一处**、以及**仍然欠着的**。)

> 信封：epoch=2026-11-08 | authority=measured | scope=project | source=真机实测（父仓 CI run 42461305869 的 `Mobile Test` 红：attempt 1 红／attempt 2 绿 ⇒ CI-only 飘红；本地该文件 4/4 绿 ⇒ ⇒ 本地绿证不了 CI 不飘）| status=active | supersedes=none

① **⚠️ 症状（真撞上的一次，不是推演）** —— 父仓 CI run `42461305869` 的 `Mobile Test` job 红：逐字读是 `Failed assertion: line 2543 pos 12: '!timersPending'` ⇒ ⇒ 崩在 `test/widget/models_screen_test.dart` 的「状态条显示的是大脑运行时，不是本地引擎」⇒ ⇒ **同一次 run 复跑即绿**（attempt 1 红／attempt 2 绿）⇒ ⇒ **本地也一直绿**（该文件本地 4/4，5 秒）⇒ ⇒ 三件事合起来＝**典型的 CI-only 飘红**：不是代码缺陷，是**测试自身的环境依赖**在慢 runner 上露了出来。

② **✅ 根因家族（本仓早就写过，只是这一处漏了）** —— `testWidgets` 的 fake-async 区里，**真实 I/O（SQLite 真库／socket）永远不会完成** ⇒ ⇒ 那个 pending 句柄会挂到测试结束 ⇒ ⇒ Flutter 的 `!timersPending` 断言直接红。本仓对这条**已经有成套的既有做法**：凡是启动链碰到大脑／设置的 widget 测试，一律把仓储与 client 换成内存版（`appSettingsRepositoryProvider` → `_FakeAppSettings`、`telencephalonClientProvider` → `_FakeTelencephalonClient`、`brainProviderOptionsProvider` → 空目录），注释里白纸黑字写着「真库的读是真实文件 I/O，fake-async 里永远不会完成」⇒ ⇒ **模型管理页漏了一处**：它的 `initState` 会 `modelMetadataProvider.notifier.load()` ⇒ ⇒ 而 `modelMetadataRepositoryProvider` **没被 override** ⇒ ⇒ 真库那条读还留在启动链上 ⇒ ⇒ 慢 runner 上它没来得及「不算挂住」⇒ ⇒ 断言炸。

③ **✅ 这一刀断掉的** —— 给该测试补上内存版模型元数据仓储（`_FakeModelMetadata`，`implements ModelMetadataRepository`，四个方法 `get`/`getAll`/`put`/`delete`）＋ 在 `pumpModels` 的 overrides 里加一行 ⇒ ⇒ **与同文件既有两个 fake 同一个形状** ⇒ ⇒ 顺手也去掉了「本文件与别的测试文件共用 `shadow.db`」这个本仓账本自己记过的坑（㉓ 条⑦：真库的读会被别的文件的写锁住、永远不返回 ⇒ ⇒ 整个测试文件跟着挂）⇒ ⇒ 本地读数：`flutter analyze` **0 issue**、该文件 **4/4 绿**。

④ **⚠️ 仍然欠着** —— ❶ **还不能说这条飘红已经绝迹**：本地**复现不了**（本地本来就绿 ⇒ ⇒ **本地绿证不了 CI 不飘**）⇒ ⇒ 要证绝迹，需要一个**能在本机造出 pending Timer 的探针**（把真库那条读放进 fake-async 区并断言它没完成）⇒ ⇒ 或者靠多次 CI 跑都绿（弱证据）⇒ ⇒ **判据入库：CI-only 的飘红，本地复现不了时，不要拿「本地绿」当结论**；❷ **启动链上可能还有别的真 I/O 路径**没被逐个断掉（本次只钉住了模型元数据仓储这一处）⇒ ⇒ 要彻底，得把这条页面启动链上**每一个**真库／真 socket 依赖列全并逐个换掉；❸ **查重必须跨账本**：插入前把三个账本一起扫才发现，**移动端账本与桌面端账本共用同一条 U+32xx 标记序列**（桌面端已用到 ㋵）⇒ ⇒ 只查自己那个账本会撞号；本条占 **U+32FA（㋺）**（U+32F0…U+32F9 全被占，U+32FA 三账本 0 命中）。

**Updated:** 2026-11-02 (㋰ **「Cortex 清干净的收尾，移动端几乎没动 —— 但**判据**变了** —— 承㋮ 条（用户拍板「Cortex 是过时概念应该删除」）与父仓㋱ 条，本条记**移动端这一侧**的变化：**零处代码改动**、闸的**判据升级**、以及**为什么移动端那 4 处兼容面一个都不该改**。)
① **✅ 移动端代码零改动**：那 4 处（`telencephalon_client.dart` 与其测试里的 `json['cortex']` 回退、`prefrontal_client.dart` / `task_board_screen.dart` 注释里的 `cortex_router`）**全是兼容面** ⇒ ⇒ 一个都不该改（改了 = 断掉旧端脑的回退 / 编不过）⇒ ⇒ 仍登记在闸的豁免清单里。
② **⚠️ 但判据变了（引擎升级，本仓只吃红利）**：`history` 类的豁免**只在注释 / 文档行**生效 ⇒ ⇒ 移动端那两条 `cortex_router` 出现在 **README / ARCHITECTURE 的正文行**（不是注释）⇒ ⇒ 判为**代码行** ⇒ ⇒ 必须留 `contract`（它是**真模块名**）⇒ ⇒ 这条分类是**逐仓**定的，**不能一刀切**。
③ **✅ 读数**：移动端主流程 **0 条残留 / EXIT=0**（289 文件）；第二组判据（旧嵌入式 Prefrontal 运行时）**0 条**；自检**全绿**（cortex **5 条** ＋ Prefrontal **2 条** —— 本轮新增第 ⑤ 条「`history` 类豁免的上下文限定生效」）。
④ **⚠️ 还欠的**：**真机 UI 未验**（本轮是静态闸 ＋ 读数）；那 4 处兼容面要等「旧端脑退役」那天才能真删。

**Updated:** 2026-11-02 (㋯ **「手机端的供应商管理改打**大脑**那张面」—— 顺带把「端脑没这条路由 ⇒ 404 被画成『还没有供应商』」这个**失败长得像成功**治了，并让手机不再硬编码一份供应商清单** —— 承用户 2026-11-02 那句「云端供应商/本地模型/agent/mcp 等等都由大脑直接提供接口，两端保持一致」，本条记**手机这一侧**改了什么、**证据**与**还没做的**。)
① **⚠️ 病（打错了方言 ⇒ 那一页永远是空的）**：手机端供应商页走的是 `PrefrontalClient` 的**前额叶方言** `/api/providers`（`lib/services/prefrontal_client.dart:133-168`）⇒ ⇒ **端脑不提供那条路由**（实测 `GET /api/providers` ⇒ **404**，而 `GET /models/providers` ⇒ **200**）⇒ ⇒ 而且 `ProvidersState.error` **从没被渲染**（旧 `providers_screen.dart` 只有 loading / 空态 / 列表三支）⇒ ⇒ **404 被画成「还没有供应商」** ⇒ ⇒ 用户去查自己的 key，而真因是「没连上大脑」⇒ ⇒ **失败长得像成功**；另外那份**硬编码的 11 条 `ProviderType` 枚举已经漂了**（`qwen` 的地址与大脑目录不同、少了 8 个供应商）。
② **✅ 改（数据源换成大脑 ＋ 三态）**：新增 `TelencephalonClient` 的端脑方言方法（`listProviders` / `listProviderPresets` / `addProvider` / `updateProvider` / `deleteProvider`）＋ 与**大脑对齐**的模型类 `RegisteredProvider` / `RegisteredModel` / `ProviderPreset`（⚠️ **2026-11-03 改名**：原名 `BrainProvider` / `BrainModel` —— 「Brain」前缀是迁移期标记，2026-11-02 迁移完成后区分力归零 ⇒ ⇒ 去前缀；⚠️ 本仓另有一个 `BrainModelSource`（大脑模型来源/路由）是**另一个概念**，**没动**）（**字段名跟大脑一致**，不是两端各抄一套）⇒ ⇒ `providers_screen.dart` 整个换掉数据层：**预设目录来自大脑**（不再硬编码）、**启停/选模型**走 `PUT /models/providers/{id}`、**删除**走 `DELETE` ⇒ ⇒ 界面改成**三态互斥**：**读得到有** / **读得到空** / **读不到**（「读不到」时**只**显示失败原因 + 重试，**绝不**显示空态文案）⇒ ⇒ 顺带修掉旧 `copyWith` 的一个真 bug（`error: error` ⇒ **每次 copyWith 都把错误清空** ⇒ 就算界面想渲染错误也拿不到）。
③ **✅ 证据**：`flutter test test/unit/brain_provider_client_test.dart test/widget/providers_screen_test.dart` ⇒ **15 passed / 0 failed**（新增 **11 条**：8 条 client 契约 ＋ 3 条三态 widget；widget 侧含**承重断言**「读不到 ⇒ **不得**出现『No providers configured』」＋ **正控**「读到空 ⇒ 必须出现它」）⇒ ⇒ `flutter analyze` 我这两个文件 ⇒ **0 error**（只剩 **3 条既有 info**，且那两条 `prefer_initializing_formals` **不能改** —— 改成 initializing formal 会把公开参数名从 `apiKey` 变成 `_apiKey` ⇒ ⇒ 会打断所有调用点）。
④ **⚠️ 反向验证（断言承重，不是恒绿）**：把「读不到」那一支短路掉（＝复刻旧病）⇒ ⇒ **恰好 1 红**（那条「读不到」用例），而**正控**两条（读到空 / 读到有）**仍绿** ⇒ ⇒ 还原后 **15 passed**。
⑤ **⚠️ 还欠的**：**手机端真机 UI 未验**（本轮是 service 级 + widget 级）；**预设在手机上长什么样**（图标现在是「按 preset id 映射 ＋ 兜底云图标」⇒ 不是逐个品牌图标）；**「自定义供应商」仍要手填 base URL**（大脑那边要求 http(s) 开头）；**端脑实例 id 为空**那笔未动；**桌面端那份本地注册表**还没并到大脑（⇒ ⇒ 「两端一致」**桌面侧还没兑现**，见父仓那条）。

**Updated:** 2026-11-02 (㋮ **「Cortex 是过时概念应该删除」—— 移动端这边**几乎不用改**，但**闸必须重写**：旧闸只看标识符、没进 CI、而且在这台 Windows 机器上**根本跑不了** ⇒ ⇒ 等于「有闸」这件事只靠人记着** —— 承 ㋭ 条（旧嵌入式 Prefrontal 退役那条线）与用户那句「清理 cortex 避免与新方案产生混淆」，本条记**移动端的四处残留**、**旧闸的三处病**与**判据不许丢**。)
① **✅ 移动端活代码只剩 4 处 cortex，且**全部是兼容面**：① `lib/services/telencephalon/telencephalon_client.dart` 与 `test/telencephalon_client_test.dart` 的 `json['cortex']` —— 旧端脑的 AgentsResponse **信封旧键**（客户端优先读 `telencephalon`，读不到才回退）；② `lib/services/prefrontal_client.dart` 与 `lib/screens/task_board_screen.dart` 注释里的 `cortex_router` —— 端脑**兼容 shim 的真模块名**（`telencephalon::boot::cortex_router`）⇒ ⇒ **一个都不该改**（改了 = 断掉旧端脑的回退 / 编不过）。
⚠️ 但**「不该改」不等于「不用管」** ⇒ ⇒ 把它们登记进闸的**豁免清单**（token + 理由）⇒ ⇒ 哪天有人「顺手改成 telencephalon」⇒ ⇒ 闸立刻红 ⇒ ⇒ 旧端脑的回退路径断掉时**不会是无声的**（**失败长得像成功**的老形状）。
② **⚠️⚠️ 旧闸（`scripts/check-cortex-residue.sh`）有三个洞**（本轮实测）：**① 只看标识符**（`CortexStatus` / `cortexClient` …）⇒ ⇒ 用户**看得见**的那句「启动 Cortex」**根本不在判据里** ⇒ ⇒ 界面还在说 Cortex、闸一路绿；**② 没进 CI**（`shadow/.github/workflows/ci.yml` 里**没有**这一步）⇒ ⇒ 脚本只是文档，绿不绿没人知道；**③ 是 `.sh`** ⇒ ⇒ 这台 Windows 机器**根本跑不了**（本机 WSL 无发行版，`bash.exe` 只是个 WSL 启动器）⇒ ⇒ 「有闸」只能靠人记着。⇒ ⇒ 重写成 Node：`scripts/check-cortex-residue.mjs`（薄壳）＋ 共用引擎 `shadow/scripts/lib/cortex-residue.mjs`（**判据只有一处**）⇒ ⇒ **跨平台可跑 ＋ 进 CI**。
③ **✅ 判据不许丢**：旧 `.sh` 还管着**第二组**判据 ——「旧嵌入式 Prefrontal 运行时不许回来」（标识符级 ＋ 旧 `.so` 的存在性检查）⇒ ⇒ 那组判据**必须**搬进新闸 ⇒ ⇒ 新闸是**两组**（cortex 词级 ＋ Prefrontal 代码级）⇒ ⇒ 自检 **6 条**（cortex 4 条 ＋ Prefrontal 2 条）。
④ **✅ 反向验证（闸得有分辨力，不是恒绿）**：`--self-test` 四条 —— ① 造出来的残留**必须**被抓到；② **已登记**的 token **必须不**被误报；③ **真实配置**的分类器面对合成残留行**必须**判红；④ 豁免 token 在仓库里已经不存在时**必须**报「豁免条目已腐烂」⇒ ⇒ 退出码 **2**（= 判不了，不是干净）⇒ ⇒ **豁免清单不许变成垃圾桶**。
⑤ **✅ 读数**：移动端主流程 **0 条残留 / EXIT=0**（词级 10 处兼容面已逐条登记，4 个 token）；第二组判据（Prefrontal）**0 条**；自检 **6 条全绿 / EXIT=0**。
⑥ **⚠️ 还欠的**：**真机 UI 未验**（本轮是静态闸 ＋ 读数）；那 4 处兼容面要等「旧端脑退役」那天才能真删（届时**必须同时**改客户端回退与服务端信封）；⚠️ 桌面端那侧的改名与端脑仓那侧属于**同一笔**（见根 `AGENTS.md` 同日 ㋮ 条）。

**Updated:** 2026-11-02 (㋭ **「旧嵌入式 Prefrontal」整条退役** —— 它是 cortex / Layer-3 时代的产物（**绕开**「端脑→叶区→neuron」那条 canonical 链路 ⇒ 静默失效），而移动端现在嵌的是**大脑**（与桌面端同源）；本轮把代码、通道、Manifest 声明、**27.9 MB 的旧 `.so`**、管理页、路由、**94 个** l10n 键**全部删掉**，并把「旧运行时不许回来」变成一道**带自检的闸**。)
① **⚠️ 病（它为什么该退役 —— 不是「还没接完」，是「上一代架构」）**：旧那套是 `iBLOC/prefrontal` 仓（Layer-3 独立引擎，端口 18083）的 NDK 嵌入 ⇒ ⇒ 它跑的是**只有 lobe、没有大脑**的那代架构 ⇒ ⇒ **绕开了**「端脑 → 叶区 → neuron」这条链路（`docs/superpowers/architecture/2026-10-29-brain-chain.md`）⇒ ⇒ 绕过去是**静默失效**（收不到 `tool_call`、人格/记忆无处落地、对话退化成无状态单轮）⇒ ⇒ 而端脑 AGENTS ㋟ 条量过：**本机 8082 / 8085 / 18083 都没人在听** ⇒ ⇒ 它在手机上**常态是关着的**（唯一入口是设置页那个折叠区里的手动启动）。
② **⚠️ 一条更要紧的：两份大脑的 `.so` 一直在同一个包里**：旧的 `libprefrontal_core_lib.so`（**27.9 MB**）躺在 `jniLibs/arm64-v8a/`（构建产物、gitignore）⇒ ⇒ 每个 APK 都带着它 ⇒ ⇒ 而真正在跑的是 `libencephalon.so`（151.7 MB）⇒ ⇒ **两个都会 load、只有一个会起来** ⇒ ⇒ 「装上了」不等于「跑的是它」。
③ **✅ 删掉的全部清单**：Dart `lib/services/prefrontal/`（service / provider / cluster_page / README）＋ 路由 `/settings/prefrontal` ＋ 设置页「遗留运行时」折叠区；Kotlin `PrefrontalRuntime.kt` / `PrefrontalRuntimeService.kt` ＋ `MainActivity` 的 `prefrontal_runtime` 通道 ＋ `AndroidManifest` 的 `<service>` 声明；`jniLibs/arm64-v8a/libprefrontal_core_lib.so`（27.9 MB）；**94 个** l10n 键条目（含 `@` 配对条目，zh + en）；`agent-surface.json` 的 `prefrontal-embedded` 能力条目 ＋ 两端导航生成物里的 `surface.prefrontalEmbedded` 分支。
④ **⚠️ 一处「不许静默变成没有」**：日志面板那条 **SSE 路**（`GET /api/logs/stream`）**只有旧运行时有**（端脑没有那条路由）⇒ ⇒ 而 `LogSource.prefrontal` 这个来源**不只**装那条流 —— 它还装着**客户端错误**（`global_error_listener.dart` 喂的）⇒ ⇒ 名字与内容早已对不上（「界面写着『后端』、里面是客户端错误」）⇒ ⇒ 拆法：**删那条路、不删那个来源** —— 删掉 `PrefrontalLogStream` / `connectPrefrontal` / `disconnectPrefrontal` / 面板里的端口监听，把来源改名 **`LogSource.prefrontal` → `LogSource.client`**，界面筛选项从「后端」改成「客户端」。
⑤ **✅ 顺带清掉两处「过期读数」**：① **五处新文件里的注释还在引用已删的类名**（`PrefrontalRuntime` / `PrefrontalMobileService` / `PrefrontalMobilePage`）⇒ ⇒ 改成「更早那套内嵌运行时」；② **测试夹具摆着一套假拓扑**（`mockServiceInfos` = Resonance:8080 / **Prefrontal:8082** / Hippocampus:8081）⇒ ⇒ 那三个在手机上**一个都不存在**（真 provider 早就改成只探内嵌大脑，`service_provider_test.dart` 有那条回归）⇒ ⇒ 夹具改成**一行：内嵌大脑** ⇒ ⇒ 免得页面渲染出根本不存在的服务行（「界面上有服务、机器上没有」）。
⑥ **✅ 闸（从恒绿变成有分辨力）**：`scripts/check-cortex-residue.sh` 原来**只**查 `Cortex*` 标识符 ⇒ ⇒ 旧运行时那族（`prefrontal_runtime` / `PrefrontalRuntime*` / `PrefrontalMobile*` / `libprefrontal_core_lib` / `/settings/prefrontal`）**根本不在判据里** ⇒ ⇒ 对本问题**恒绿** ⇒ ⇒ 现在加**第二组判据**（**代码级**：只扫 `lib/ android/ test/`，**不扫** `docs/` 与本台账 —— **台账要记得历史**，历史里出现旧名字是对的，代码里出现才是回归）＋ **旧 `.so` 的存在性检查**（构建产物，文本扫不到）＋ **`--self-test`**（造一次残留确认闸看得见 ＋ 放三个**仍在用**的名字确认闸不误报）⇒ ⇒ 主流程 **0 条**、自检 **3 条全绿**。
⑦ **⚠️ 刻意保留（它们不是旧运行时）**：`lib/services/prefrontal_client.dart`（**客户端面**：记忆/任务/人格走**带海马体**的那台端脑，十几个页面在用）、`PrefrontalMNN.kt`（MNN 本地推理桥）、`PrefrontalAccessibilityService.kt`（无障碍）、以及叶区名 `prefrontal`（四个 native 叶区之一）⇒ ⇒ 闸的判据名单**故意不含**它们 ⇒ ⇒ 改名是**另一个决定**。
⑧ **✅ 验证**：闸 **0 条 / EXIT=0** ＋ 自检 **3 条全绿**；`flutter analyze` **0 error**（77 issues 全是既有 warning/info）；相关三条测试 **27 passed / 0 failed**；父仓 `scripts/check-jni-surface.mjs` **通过（0 条提示）**、**11 个 JNI 入口两边逐字对齐**、`libencephalon.so` 11 个符号全部在位 ⇒ ⇒ **删掉旧的没碰坏新的那条**。
⑨ **⚠️ 还欠的**：**真机未验**（本轮是单测 + 闸；删的是 Dart/Kotlin/Manifest/产物 ⇒ 要验得**重打 APK + 装机**）；**Kotlin 侧 `MobileActionAgent.kt` 里那个 `prefrontalUrl = "http://localhost:8082"`** 是**旧拓扑的硬编码**（那个类**没有接线点** ⇒ 现在是死代码 ⇒ 但它是另一笔「端口写死」的债）；**`prefrontal_client.dart` 这个类名与 `prefrontalUrl()` 这个函数名都在说谎**（承 端脑 ㋟ 条 ⑩，那笔债记在客户端侧）。

**Updated:** 2026-11-02 (㋬ **「Agent2UI 与对话同页共存」—— 用户拍板：不是「换一页」，是「上面多一块面板」** —— 承 ㋥ 条（A2UI 形态不记会话那条不变量），本条记**移动端这一侧的布局改动**、**那条不变量为什么与布局无关**，以及**顺带根治的一处溢出**。)
① **⚠️ 病（旧形状）：二选一 ⇒ 对话整块消失**：移动端以前是「形态互斥」—— `chat_screen.dart` 里 `Expanded(child: isAgent2UI ? const Agent2UIView() : LocalChatView(...))` ⇒ ⇒ 开 Agent2UI ⇒ **对话区被整块顶掉** ⇒ ⇒ 「问一句」和「看一眼界面」必须来回切 ⇒ ⇒ AppBar 上的对话入口（会话管理 / 继续在桌面 / 模式切换 / 设置）**也跟着让位**（都挂在 `if (!isAgent2UI)` 上）⇒ ⇒ 交互割裂。⚠️ 桌面端**早就是**同页共存（`ConversationPage.tsx:742` 的 `A2uiPanel` 长在消息列表**上方**）⇒ ⇒ **两端形状本就不一致**。
② **✅ 用户拍板（2026-11-02）：同页共存** ⇒ ⇒ 移动端改成**面板在上、对话在下**：`chat_screen.dart` 的 body 变成 `Column[对话形态切换器, if(isAgent2UI) Agent2UIPanel(高度封顶 42%, 夹在 180–420dp), Expanded(LocalChatView)]` ⇒ ⇒ **对话永远在** ⇒ ⇒ AppBar 那些入口**不再让位**；Agent2UI 那个按钮从「一键进入」改成**开关**（实心＝面板在，再点＝收起来）⇒ ⇒ 页面标题/图标**永远是对话页的**（A2UI 有自己的面板头，不借整页标题说事）。⚠️ **机器可读的真相源同步订正**：`agent-surface.json` 的 a2ui 条目两端本来就写着 `"route": null, "nav": false` ＋「**不是独立路由**」⇒ ⇒ 跨端闸 `check-agent-surface.mjs` / `check-cross-client.mjs` **EXIT=0**（阻断 0 / 提示 0）⇒ ⇒ 本轮只把移动端那行 `_embeddedIn` 的描述改成「同页共存」⇒ ⇒ **清单与代码不再有旧读数**。
③ **✅ 一处实现，不抄一份**：新 `lib/widgets/chat/agent2ui_panel.dart`（`Agent2UIPanel`）⇒ ⇒ **复用** `Agent2UIView`（连接状态栏 / surface / 输入条都在里面）⇒ ⇒ **不另抄一份实现** ⇒ ⇒ 连接状态、surface 渲染、失败文案**仍只有一处**。
④ **⚠️ 不变量没被破坏（㋥ 条那条）**：端脑 `/a2a` **不记会话**（每次请求现造 `context_id`）⇒ ⇒ A2UI 那条通道**不是**对话那条会话 ⇒ ⇒ **面板里不许出现会话身份** ⇒ ⇒ 新面板**没有**「当前会话」那一行 ⇒ ⇒ 「同页共存」只是**布局**，**没有**把两条通道混成一条。
⑤ **✅ 顺带根治的一处溢出（真机那族病）**：`_AnswerBlock`（`agent2ui_answer_state.dart`）那根 Column 在**矮容器**里会溢出（实测 73px 容器溢出 79px ⇒ 内容被画到输入栏上面）⇒ ⇒ 与 `chat_screen_small_screen_test.dart` 钉的「空状态图标被画到输入栏上面」是**同一族** ⇒ ⇒ 改成 `SingleChildScrollView` ⇒ ⇒ **不靠「面板够高」这种运气**。
⑥ **✅ 顺带把两个输入框分开了**：同页 ⇒ 两个输入框同屏 ⇒ 占位文案**不能一模一样** ⇒ ⇒ A2UI 那个输入框改说「让端脑画界面…」（新 l10n 词条 `askAgent2UI`）⇒ ⇒ 否则用户分不清在跟谁说话。
⑦ **✅ 证据 + 反向验证**：新增 `test/widget/agent2ui_coexist_test.dart`（**4 条**：面板在且对话也在 / 两个占位文案不重样 / AppBar 入口不让位 / 按钮是开关）＋ 改 `chat_screen_home_test.dart` 里那条钉**旧互斥形状**的断言 ⇒ ⇒ `flutter analyze` **零 issue**；受影响的 5 个测试文件 **28 条全绿**；**全量 `flutter test` 488 条全绿**；⚠️ **反向验证（逐条削弱）**：**回到互斥**（面板开着时把对话顶掉）⇒ ⇒ **恰好 4 条红**；**AppBar 入口又让位** ⇒ ⇒ **恰好 2 条红**；**两个占位文案又一样** ⇒ ⇒ **4 条红**（含「占位文案不重样」那条）⇒ ⇒ 还原后全绿 ⇒ ⇒ **有分辨力、不是恒绿**。
⑧ **⚠️ 还欠的**：**真机未验**（本轮是 widget 测试 + 源码；设备在别的会话手上）；**A2UI 那条通道仍不记会话**（端脑那一侧的活 ⇒ 跨仓 ⇒ 不越界）；⚠️ **`agent2ui_view.dart` 正被并行会话改着** ⇒ 本轮只动了它**一行**（占位文案）⇒ ⇒ 那笔 WIP 若整块覆盖 ⇒ 这条会**被悄悄回退**（编译不受影响 —— 没改 API）。
**Updated:** 2026-11-01 (㋫ **跨客户端核查：同一条「切会话失败 ⇒ 消息落错会话」的病在桌面端**结构上不存在**（切会话是纯本地的）；顺带查出一处**同族但更轻**的形状——「会话错误」用五个松散子串判 ⇒ ⇒ 任何含这些词的错误都会让客户端**静默重建服务端会话** —— 承 ㋠ 条（移动端那条病）与 ㋪ 条（真机验成），本条记**桌面端那一侧的核查结论**与**交给同伴那一笔**。)
① **⚠️ 为什么桌面端不会有同一条病（结构上的，不是「恰好没触发」）**：桌面端的会话列表在**本地 store**（`stores/conversationStore.ts` ⇒ zustand ＋ persist 到 `prefrontal-conversation-storage`）⇒ ⇒ 切换是**纯本地**的 `setActiveConversation(conv.id)`（`ConversationPage.tsx:697`）⇒ ⇒ **切换这一步根本没有网络往返** ⇒ ⇒ **没有「切会话失败」这回事** ⇒ ⇒ ⇒ 移动端那条病（切失败 ⇒ 用户以为在 B、消息落进 A）在桌面端**无处可生** ⇒ ⇒ ⇒ **证据**：桌面端的 `getConversation` / `listConversations`（`lib/telencephalonClient.ts:732/736`）**生产代码里零调用**（只有定义 ＋ 一条单测）⇒ ⇒ ⇒ 这同时**证实**了㋠ 条⑥ 那句「桌面端没有会话列表 UI（`listConversations` 仍无人调用）」——**不是漏看，是真的没人调**。
② **⚠️⚠️ 顺带查出一处**同族但更轻**的形状（桌面端，**本会话只读不改** ⇒ ⇒ 归同伴那条线）**：`ConversationPage.tsx` 的发送重试把错误按**五个松散子串**分类：`errorStr.includes('session') || includes('not found') || includes('invalid') || includes('expired') || includes('conversation')` ⇒ ⇒ 只要错误文本里含其中**任意一个词**，且是**第一次**尝试 ⇒ ⇒ 客户端就 `setSessionId(activeConversationId, '')` ⇒ ⇒ **清掉服务端会话 id** ⇒ ⇒ 重试时 `createConversation` **新建一条服务端会话** ⇒ ⇒ ⇒ ⇒ **后果**：① **模型的上下文没了**（新会话没有先前那些轮次）⇒ ⇒ ② **界面一点异常都没有**（本地消息列表照旧连着）⇒ ⇒ ③ 用户看到的现象是「**它忽然忘了我前面说过的话**」⇒ ⇒ ⇒ ⇒ ⇒ 这正是本项目反复治的那个形状——**失败长得像成功**（只是这次失败的是「上下文」而不是「消息」）。
③ **⚠️ 它什么时候会被触发（别夸大，也别当成理论风险）**：桌面端的本地会话**持久化** `sessionId` ⇒ ⇒ 而那个 id 属于**某一个具体的端脑实例** ⇒ ⇒ **换实例**（配置里改端脑地址、或 sidecar 重建）之后 ⇒ ⇒ 那个 id 在**新实例上不存在** ⇒ ⇒ 第一次尝试必然 404（"conversation not found" ⇒ ⇒ **正好命中那五个子串之一**）⇒ ⇒ ⇒ ⇒ ⇒ ⇒ **⇒ 这条路径不是理论风险**（换台端脑就走一次）⇒ ⇒ ⇒ ⇒ ⇒ 而「上下文没了」这件事**只有用户能察觉、界面不会说**（第一次的失败被 `continue` **吞掉** ⇒ ⇒ 界面只剩第二次成功的回复）⇒ ⇒ ⇒ ⇒ ⇒ ⚠️ **修法归产品/同伴拍板**（重建会话后要不要**明确告诉用户**「上下文重置了」？本会话**不替用户拍**、**不改同伴在飞的文件**）。
④ **⚠️ 还欠的**：**Tauri 真机 UI** 仍未验（桌面端这一侧的读数都还是**读源码**得出的，不是跑出来的）；**「会话上下文被静默重置」要不要对用户说** ⇒ ⇒ 产品决定；**「web 放钥匙的入口」** ⇒ ⇒ 另一个决定（同伴那条线）。
**Updated:** 2026-11-01 (㋪ **「切会话失败 ⇒ 消息不许落进另一条会话」在真机上验成（17 条 / 0 红）** —— 但**注入失败这件事真机上没有现成办法** ⇒ ⇒ 三条路都堵死 ⇒ ⇒ 绕到第四条（宿主端「替身端脑」）才跑通；顺带量到「**禁用态的输入框在无障碍树里不再是 EditText**」** —— 承 ㋤ 条（「切失败闸门」那一格当时未复核）与 ㋩ 条（「草稿不造垃圾」已验），本条记**切失败闸门的真机读数**、**注入失败的那套办法**，与**一条可观测性上的发现**。)
① **⚠️ 那一格到底有没有效，只有真机能说**：㋠ 条（2026-11-01）治的病是「切会话失败 ⇒ 消息**静默**落进另一条会话」⇒ ⇒ 修法是两层：**UI 层**（`canChat` 变假 ⇒ ⇒ 输入框与发送键禁用）＋ **provider 兜底**（`_sendToTelencephalon` 顶部守卫）⇒ ⇒ 兜底那层**只有 Dart 单测**；**UI 那层（用户能感知的那层）真机上没验过** ⇒ ⇒ 同伴说他验过、但没给复现步骤 ⇒ ⇒ 本轮**独立复跑** ⇒ ⇒ **真机验成**。
② **⚠️⚠️ 注入失败这件事，真机上没有现成办法（三条路都堵死）**：**(a)「把端脑停掉」** ⇒ ⇒ **列表刷新失败 ⇒ 列表被错误页顶掉**（`conversation_screen.dart` 的 build：`error != null` ⇒ ⇒ 渲染 `_ConversationLoadError` ⇒ ⇒ **旧列表不渲染**）⇒ ⇒ 用户**点不到**那条会话 ⇒ ⇒ 注入不进去；**(b)「让服务端取不到那条会话」** ⇒ ⇒ 端脑**没有删会话的端点**，且 `ConversationStore` 是**内存里的**（`load_from_db` 只在开机时跑一次 ⇒ ⇒ 改 `files/shadow/conversations.json` 不影响在跑的那份）⇒ ⇒ 造不出「列表里有、而服务端取不到」；**(c)「用 iptables 打断请求」** ⇒ ⇒ 手机**没有 root**（`su` 不存在、`shell` 只是 uid 2000）⇒ ⇒ 不行。⇒ ⇒ **第四条路（跑通了）**：把 App 切到「**外部端脑**」形态（`app_flutter/app_config.json` 里写 `telencephalonBaseUrl` ＋ `brainStoppedByUser:true` ⇒ ⇒ 内嵌大脑**不启动** ⇒ ⇒ 客户端指着 `127.0.0.1:<port>`）⇒ ⇒ `adb reverse` 把那个口接到**宿主那台「替身端脑」**（新 `scripts/switch-failure-stub.mjs`）⇒ ⇒ 替身给列表、给 A、**给 B 回 404** ⇒ ⇒ 那个 404 的**响应体是从真端脑抓的原样**（真端脑对不存在会话的响应：`{"error":{"code":4040,"message":"conversation not found: …"}}`）⇒ ⇒ 客户端看到的与「服务端真的找不到这条会话」**一模一样** ⇒ ⇒ ⇒ **配方就在脚本里**，下一台不用重新想一遍。
③ **⚠️⚠️ 第一版注入器写错了（**不是产品的错，是注入器的错**）**：第一版写成「**代理转发真端脑**」⇒ ⇒ 实测列表一条都读不到 ⇒ ⇒ 真因：**真端脑在手机上跑在 App 进程里** ⇒ ⇒ App 一旦切到外部形态，内嵌大脑就**不启动** ⇒ ⇒ 真端脑根本不在跑 ⇒ ⇒ 代理转发给一个**死端口** ⇒ ⇒ ⇒ **判据红了先问「产品的错还是判据的错」**（㋦ 条④ 同族）。
④ **✅ 真机读数（17 条 / 0 红 / EXIT=0）**（设备 `ee6b4832`，新 `scripts/prove-switch-failure-blocks-send.ps1`，**BOM+CRLF** ⇒ ⇒ 过 `check-ps1-portability.mjs`）：列表读得到 / **正控** 切到 A 成功 ⇒ ⇒ 当前会话行 = A、输入框 `enabled=true`、发送键 `enabled=true` / 切到 B **失败** ⇒ ⇒ 界面出现「**错误：…404…**」（**说真话**，不是装作切成功）/ 切失败 ⇒ ⇒ 「当前会话」**仍是 A**（用户看得见自己还在哪儿）/ 切失败 ⇒ ⇒ 输入框那一处 `enabled=false` / 切失败 ⇒ ⇒ **发送键 `enabled=false` 且 `clickable=false`**（用户按不动）/ **终局**：服务端**一条写请求都没有**（一条消息都没落）/ **正控**：放开注入 ⇒ ⇒ 切到 B 成功 ⇒ ⇒ 字打得进去 ⇒ ⇒ 点发送 ⇒ ⇒ 替身**记到了 POST** ⇒ ⇒ 「没落」那条读数**不是探测器瞎了** / 收尾：配置原样还原、大脑又起来了。
⑤ **⚠️⚠️ 顺带量到的一条真机事实（可观测性）**：**禁用态的输入框在 Android 无障碍树里不再是 `android.widget.EditText`** —— 真机实测：切失败后输入行那里只剩一个 `android.view.View enabled=false`（启用态是 `android.widget.EditText enabled=true`）⇒ ⇒ ⇒ 「输入框被禁用」**仍然可观测**（`enabled=false`）⇒ ⇒ 但判据若只认 `EditText` ⇒ ⇒ 就会把「禁用」读成「输入框不见了」⇒ ⇒ **判不了** ⇒ ⇒ ⇒ 修法：**按位置找那个节点**（同一个位置，启用态 `enabled=true`、禁用态 `enabled=false`）⇒ ⇒ **有分辨力**；⇒ ⇒ 附带一条**产品侧的小退化**：那个输入框**不再被播报为「输入框」**（对读屏用户是「没了」而不是「禁用」）⇒ ⇒ **归「产品要不要管」，本轮不改**。
⑥ **⚠️ 边界（如实标出）**：端脑那一侧是**替身** ⇒ ⇒ 本条验的是**客户端这一侧**（路由 → ⇒ 真实 HTTP client → ⇒ 真 404 → ⇒ 闸门 → ⇒ 真实控件树 → ⇒ 真机屏幕）⇒ ⇒ 端脑自己的行为由它的用例表覆盖 ⇒ ⇒ 「切失败闸门」这一格**在客户端侧已验**。
⑦ **⚠️ 还欠的**：**「web 放钥匙的入口」**（另一个决定）；**Tauri 真机 UI**；**禁用态输入框的无障碍可见性**（⑤，产品要不要管）；**「删一条会话」「给会话起名」仍无处可存**（端脑侧，跨仓）。
**Updated:** 2026-11-01 (㋩ **「点「新对话」⇒ 端脑不多一条会话」在真机上验成** —— 多会话脚本加到 **14 条 / 0 红**；顺带**驳掉一条跨会话结论**：「设备上那版 APK 不含草稿会话那笔」是**拿另一棵树的 HEAD 推出来的** ⇒ ⇒ 真相要看**产物出处**) —— 承 ㋤ 条（草稿会话）与 ㋦ 条（真机多会话 13 条），本条记**草稿那格的真机读数**与**「APK 里有没有某笔」这条判据**。)
① **✅ 真机验成（多会话脚本加到 14 条 / 0 红 / EXIT=0）**：`scripts/prove-mobile-multi-session-on-device.ps1` 新增第 (7) 段 ⇒ ⇒ **点「新对话」⇒ 端脑那边不许多一条会话** ⇒ ⇒ 判据钉在**端脑那边**（不是界面）：前后各 GET 一次 `/shadow/v1/conversations` ⇒ ⇒ 比 **id 集合**是否**逐字相同** ⇒ ⇒ 实测「点之前 5 条 ⇒ 点之后还是 5 条 ⇒ 新增：无」⇒ ⇒ 且这份列表响应里**看得见**我们播的 A/B/C ⇒ ⇒ 探测器**不是瞎的**（正控自带）⇒ ⇒ ⚠️ 收尾也补了一手：万一**旧行为**多建了一条 ⇒ ⇒ 它**不在** `$mine` 里 ⇒ ⇒ 得一起删掉（否则**留在共享设备上**，而端脑**又没有删会话的端点** ⇒ ⇒ 删不掉）。
② **⚠️⚠️ 一条判据（「APK 里有没有某笔」⇒ ⇒ **比产物出处**，别拿**另一棵树的 HEAD**推**）**：兄弟会话的结论是「设备上 18:35 那版 APK **不含**草稿会话那笔（`b9e34db`）⇒ ⇒ 验这一格**必须重打 APK**」⇒ ⇒ **那条结论不成立** ⇒ ⇒ 实测：`b9e34db` 提交于 **18:41:43**，而设备上那份 APK 的构建时间是 **18:58:06** ⇒ ⇒ **晚于**那笔 ⇒ ⇒ 含；⇒ ⇒ 且**设备上安装的那份 APK 的 MD5 与本地构建产物逐字一致**（`acd1bc3d91e672be276924ba3ba5a761`）⇒ ⇒ 设备跑的就是**我那棵树**编出来的那份 ⇒ ⇒ ⇒ 对方的结论是从 **`clean-apk` 那棵树的 git HEAD**（`d50f7c5`）推出来的 ⇒ ⇒ **那棵树不是设备上那份 APK 的来源** ⇒ ⇒ ⇒ **「产物里有没有那笔」的判据 = ① 构建时间 vs 提交时间 ＋ ② 设备上的指纹 == 本地产物的指纹** ⇒ ⇒ **别用另一棵树的 HEAD 代替产物**。
③ **⚠️ 就地订正**：㋤ 条⑤ 那句「**真机验收**（切会话 / 新对话 / 标题 / 切失败闸门）仍欠」⇒ ⇒ **前三个已验成**（本条 ①）⇒ ⇒ ⚠️ **就地订正（2026-11-01 晚）**：「切失败闸门」那一格**后来独立验成了**（㋪ 条：真机 **17 条读数 / 0 红**，脚本 `scripts/prove-switch-failure-blocks-send.ps1`）⇒ ⇒ **不再欠**。
④ **⚠️ 还欠的**：**「删一条会话」「给会话起名」仍无处可存**（端脑无 DELETE、无标题字段 ⇒ ⇒ 跨仓 ⇒ ⇒ 不越界）；**Tauri 真机 UI** 仍未验；**桌面端没有会话列表 UI**（`listConversations` 仍**无人调用**）；（「切失败闸门」的真机读数**已补** ⇒ ⇒ 见 **㋪ 条**）；**A2UI 形态不记会话/不进模型** ⇒ ⇒ 「A2UI 能不能真对话」是**端脑那一侧**的活。
**Updated:** 2026-11-01 (㋨ **「用户喊停」在真机上赢了** —— 点「停止大脑」⇒ 大脑停得下来、**35 秒内不自己回来**（当时实测的 ~21 秒复活窗口已被守卫堵住）；顺带记一条纪律：「没发生」类断言**必须带正控** —— 承 ㋞ 条（「用户喊停」必须赢）与 ㋦ 条（「红不等于产品坏」），本条记**真机验收**与**正控纪律**。)
① **⚠️ 背景（那一格当时为什么欠）**：早先真机实测量到：用户点「停止大脑」，**约 20 秒后大脑自己又起来**（12:48:53 stopped ⇒ 12:49:13 started = 20.5s；13:08:13 ⇒ 13:08:34 = 21.5s）⇒ ⇒ 当时明写「**机制没有完全锁定**，别把它当成已证根因」⇒ ⇒ 客户端这一侧后来加了两道守卫（`encephalon_mobile_provider.dart` 的 `_startWithRetry` **顶部**一道 ＋ native start **返回之后**一道）⇒ ⇒ 本条记那道守卫**在真机上赢没赢**。
② **✅ 真机验收（新脚本，3 条读数 / 0 红 / EXIT=0）**：新 `scripts/prove-brain-stop-holds-on-device.ps1`（**BOM + CRLF** ⇒ 过 `check-ps1-portability.mjs`）⇒ ⇒ 三段：**① 停得下来** —— 点「停止大脑」⇒ ⇒ logcat 出现 `Encephalon stopped`；**② 别自己回来** —— 等 **35 秒**（> 当时 ~21 秒的复活窗口）⇒ ⇒ logcat **没有**新的 `Encephalon started`；**③ 正控** —— 点「启动大脑」⇒ ⇒ logcat **出现新的** start ⇒ ⇒ 探测器**看得见** start ⇒ ⇒ 第 ② 条的「没有新 start」是**真读数**，不是探测器瞎了 ⇒ ⇒ 同时把设备**复原**成原样（「大脑在跑、没喊停过」）。
③ **✅ 守卫判据用 Kotlin 侧那行**：端脑自己的 `_log.info`（package:logging）**不进 logcat** ⇒ ⇒ 只能用 Kotlin 侧那行（`EncephalonRuntime.kt:326-329` 的 `✅ Encephalon started on port …` ＋ `:352` 的 `Encephalon stopped, result: …`）⇒ ⇒ **不靠猜**。
④ **⚠️⚠️ 一条纪律：「没发生」类断言**必须带正控** ⇒ ⇒ 否则「没看到 X」可能只是**探测器瞎了** ⇒ ⇒ 而你会把它当成「X 真的没发生」⇒ ⇒ 这次的正控（手动点「启动大脑」⇒ 确实看见了新的 start）**当场把探测器证伪了一次** ⇒ ⇒ 于是第 ② 条才算数。
⑤ **⚠️ 语义树形状的第三种**：底部导航的标签在语义树里是**合并节点** —— 「我 第 4 个标签，共 4 个」⇒ ⇒ **按精确匹配找「我」永远落空** ⇒ ⇒ 改走顶栏那个独立节点「**设置**」⇒ ⇒ 这一条与 ㋦ 条④ 的「合并卡片」同族 ⇒ ⇒ **语义树的合并节点有三种**：合并卡片（消息数＋标题＋副标签）、合并导航标签（标签＋位置提示）、带 a11y 位置提示的按钮 ⇒ ⇒ **先 dump 出来看一眼**再写定位器。
⑥ **✅ 用户已拍板（2026-11-01 19:2x，问卷）**：**「停过一次 ⇒ 之后每次启动 App 都不再自动起脑」这条产品语义 ⇒ ⇒ 保持现状**（用户在被问到「停过一次之后每次启动 App 该怎么办」时，选了「保持现状：停过一次就永久不再自动起脑」）⇒ ⇒ **不用改实现**、**不用改测试** ⇒ ⇒ 依据是「用户明确表达过『别自动起』⇒ ⇒ 当成**持久偏好**」⇒ ⇒ 恢复入口仍是脑页的「启动大脑」按钮（有单测钉着）⇒ ⇒ ⚠️ 兄弟会话 ③ 提的那句「值得有人拍板」**已有着落** ⇒ ⇒ 本条即那笔拍板记录。**仍欠的**：**Tauri 真机 UI** 仍未验；**桌面端没有会话列表 UI**；**「删一条会话」「给会话起名」仍无处可存**（端脑侧，跨仓）。
**Updated:** 2026-11-01 (㋧ **「手机上现在真的显示中文界面」—— 前提补齐后，那一格从「判不了」变成「真机 11 条读数 / 0 红」；顺带逮到「我的探针自己坏 ⇒ 报出**假的 401** ⇒ 差点把好门当成坏门」** —— 承 ㋁ 条⑥（「真机那一截还欠」）与 ㋦ 条（「红不等于产品坏」），本条记**中文界面在真机上验成**、**门没坏**（三组钥匙实测）与**判据自己坏**这三件事。)
① **✅ 真机验成（新脚本，11 条读数 / 0 红 / EXIT=0）**：新 `scripts/prove-a2ui-i18n-on-device.ps1`（**BOM + CRLF** ⇒ 过 `check-ps1-portability.mjs`）⇒ ⇒ 三段证据：**① 端脑认 `Accept-Language`** —— 同一个 `/a2a`、同一把钥匙、同一份 body ⇒ ⇒ **只换这一个头** ⇒ ⇒ 英文给 `Tasks (`、中文给 `任务（` ⇒ ⇒ **两组读数互为反证**（不是「碰巧是中文」）；**② 手机端送对了那个头** —— App 按**系统语言**送（设备 `zh-CN` ⇒ `zh`）⇒ ⇒ 屏幕上出现的是**中文**；**③ 界面不是「看着像」** —— 判据读 `uiautomator dump` 的**语义树**（按文字找，**不猜像素**）⇒ ⇒ 「任务（1）」在树里、「Tasks (」不在 ⇒ ⇒ 截图在 `artifacts/a2ui-i18n-device/`（`artifacts/` 被 `.gitignore` 忽略 ⇒ 不进仓）⇒ ⇒ 收尾用 `DELETE /api/telencephalon/tasks/{id}` 删掉自己建的那条任务 ⇒ **不在共享设备留垃圾**。
② **⚠️ 前提（这一格为什么当时判不了）**：㋁ 条⑥ 那句「设备上那份 `.so` 与 APK 都是旧的 ⇒ **手机上还看不到中文界面** ⇒ **真机未验**」**当时是对的** ⇒ ⇒ 现在前提补齐了：`.so` 重编（sha256 `63D3E61C…`，**中文字面量在二进制里** —— `任务（` / `还没有任务。` / `叶区（` 都查得到 ⇒ ⇒ **不靠源码推断**）+ APK 重打并装上（本地 APK 与设备上安装的 **MD5 逐字一致** ⇒ ⇒ 真机跑的就是那份产物）⇒ ⇒ 这一格**才**能验 ⇒ ⇒ **「判不了」与「绿了」之间隔着一个前提** ⇒ ⇒ 前提不齐就别急着说它好或坏。
③ **⚠️⚠️ 一条自罚的教训（**判据自己坏 ⇒ 报出与事实相反的读数**）**：我的 `/a2a` 探针连着报 **401** ⇒ ⇒ 第一反应是「**门坏了**」⇒ ⇒ **差点去改一个没坏的门**。⇒ ⇒ 真因是**我的请求头拼错了**：`@('X-Shadow-Key: ' + $k, 'X-A2A-Extensions: ' + $e)` ⇒ ⇒ **逗号比 `+` 结合更紧** ⇒ ⇒ 两个头被**拼成一条**畸形头 ⇒ ⇒ 服务端看到的是「一把错钥匙」⇒ ⇒ 401 ⇒ ⇒ **报出来的 401 是我自己的错**。⇒ ⇒ 修法两条：每个元素各自加括号 ＋ **在脚本里加一道守卫**（一个头必须形如 `Name: value`，值里**不许有空格** ⇒ ⇒ 拼错就**当场炸** ⇒ ⇒ 而不是让服务端回一个**假的 401** ⇒ ⇒ 把我引到「门坏了」上去）。
④ **✅ 门其实好得很（三组钥匙实测，设备 `ee6b4832`）**：**无钥匙 ⇒ 401**；**仅影子锁 ⇒ 200**；**仅 admin ⇒ 200** ⇒ ⇒ `/a2a` 是**读门 = 影子锁 ∪ admin**（`verify_read_credential` 先试 admin 再试 shadow ⇒ `telencephalon/src/security/api_key.rs`）⇒ ⇒ 与 `door_policy.txt` 里 `/a2a * read` **一致** ⇒ ⇒ **门没坏、策略表也没错**。
⑤ **⚠️ 还欠的**：**A2UI 形态不记会话、不进模型**（端脑 `/a2a` 每次新造 `task_id`/`context_id`）⇒ ⇒ 「A2UI 形态能不能真对话」是**端脑那一侧**的活；**「给会话起名」「删一条会话」仍无处可存**（端脑无 DELETE、无标题字段 ⇒ 跨仓，且门型那条线已就「软删」在走**产品问卷** ⇒ ⇒ **不抢**）；**Tauri 真机 UI** 仍未验；**桌面端没有会话列表 UI**（`listConversations` 仍**无人调用** ⇒ ㋠ 条⑥ 那句仍为真）。
**Updated:** 2026-11-01 (㋦ **「列表页只在新建时刷新」—— 真机逮到「退回即陈旧」⇒ ⇒ 加 `RouteObserver` / `RouteAware.didPopNext`；顺带把真机判据的两次假红钉死（「红」不等于「产品坏」）** —— 承 ㋤ 条（草稿会话）与 ㋥ 条（A2UI 不记会话），本条记**列表在退回时也要重拉**这条修复、**真机多会话证明脚本**这条证据，与**判据自己会假红**这条纪律。)
① **⚠️ 病（列表页只在「新建」时刷新 ⇒ ⇒ 退回即陈旧）**：会话列表页是**从对话页 push 上去**的 ⇒ ⇒ 退回时那一页**仍然挂载** ⇒ ⇒ `initState` **不会重跑** ⇒ ⇒ 只在 `initState` 拉 ⇒ ⇒ 「进入即刷新」只对**新建**列表页成立 ⇒ ⇒ 真机上退回列表后**新会话不出现**（列表停在旧值）⇒ ⇒ **Dart 单测全绿、产品是错的**（旧测试只验了「卸载/重进」那条路）。
② **✅ 修（一处实现，不新增 provider）**：`app_router.dart` 加 `appRouteObserver`（`RouteObserver<ModalRoute<void>>` ⇒ 挂进 `GoRouter(observers: [...])`）⇒ ⇒ `conversation_screen.dart` 的 `_ConversationScreenState` 混 `RouteAware` ⇒ ⇒ `didChangeDependencies` 订阅 / `dispose` 退订 ⇒ ⇒ **`didPopNext()` 里重拉**（post-frame ⇒ **不在构建期改 provider**）。
③ **✅ 真机验收（新脚本，13 条读数 / 0 红 / EXIT=0）**：新 `scripts/prove-mobile-multi-session-on-device.ps1`（**BOM + CRLF** ⇒ 过 `check-ps1-portability.mjs`）⇒ ⇒ 手法：开 App 自带无障碍服务 ⇒ `uiautomator dump` 按**文字**定位（**不猜像素**）⇒ ⇒ 从 logcat 取端脑端口 ⇒ `adb forward` ⇒ `run-as … cat files/shadow.key` 取钥匙 ⇒ ⇒ 用 **`POST /shadow/v1/conversations/{id}/import`** 播种（直接写历史 ⇒ **不调模型** ⇒ 快且不依赖云端）⇒ ⇒ 收尾**把自己播的会话从设备清掉**（端脑**无 DELETE** ⇒ 停 App 后改写 `files/shadow/conversations.json`）⇒ ⇒ **13 条全绿**：端脑会话面可读 / 播种 A、B / 两条**同叶区**会话标题**不一样** / 消息数**不含人设那条** / 切会话后对话页顶部显示的就是 B / **退回列表后新会话立刻出现（列表不陈旧）** / 服务端按 `updated_at` 倒序 / **UI 顺序 == 服务端顺序** / 我们这三条里最新的一条在最前 / 设备上不剩脚本播的会话。
④ **⚠️⚠️ 一条纪律（「红」不等于「产品坏」—— 真机脚本的判据自己会假红，**两次**）**：**(a)** 会话卡片在语义树里是**一个合并节点**（文本 = 「<消息数> <标题> <副标签>」）⇒ ⇒ 判据若把「标题」锚在**文本开头** ⇒ ⇒ **永远不成立** ⇒ ⇒ 报「新会话不在最前」；**(b)** 抽取器若**没先确认「这张卡片真含这个标题」** ⇒ ⇒ 每个卡片节点都把自己的 Y 写给所有标题 ⇒ ⇒ 三条全拿到**同一个 Y** ⇒ ⇒ 排序退化成原顺序 ⇒ ⇒ 报「UI 顺序 = A>B>C」（与真机**正好相反**的假读数）⇒ ⇒ 两次红**都是判据自己的错** ⇒ ⇒ 是**离线复核上一轮留下的 `ui-probe.xml`** 才逮到的（语义树里明明是 C(420) > B(657) > A(894)）⇒ ⇒ ⇒ **判据红时先问「这是产品的错，还是判据的错」** ⇒ ⇒ 修法：**拿服务端给的顺序当基准**（不猜「谁该最前」）⇒ ⇒ 顺带把「服务端自己是不是真按 `updated_at` 倒序」也量了 ⇒ ⇒ ⚠️ 还有一处 PowerShell 坑：`@($a, $b, $c | Where-Object {...})` 里的管道**只作用最后一个元素**。
⑤ **⚠️ 还欠的**：**「删一条会话」无处可存**（端脑无 DELETE 端点）⇒ ⇒ **「自己起个名」也无处可存**（端脑无标题字段）⇒ ⇒ 移动端这两个入口**没有**；**Tauri 真机 UI** 仍未验；**A2UI 形态**那条「当前会话」行按 ㋥ 条**不补**（那一形态不记会话）。
**Updated:** 2026-11-01 (㋥ **「A2UI 形态要不要补『当前会话』那一行」—— 兄弟会话给的前提与代码不符 ⇒ ⇒ 那一行**不该补**（补了就是界面说谎）⇒ ⇒ 补一把闸把这个决定钉成机器可判** —— 承 ㋤ 条（草稿会话）与 ㋠ 条（「界面显示的会话 == 消息落到的会话」），本条记**A2UI 形态不记会话**这条事实、**那一行不该补**这条决定，与那把闸。)
① **⚠️ 病（一个前提错了，而照它做会破掉自己刚立的不变量）**：兄弟会话问「A2UI 形态要不要也补一行『当前会话』？」，并给了前提「语义一样：那一形态下会话也是端脑那条」⇒ ⇒ **那条前提与代码不符** ⇒ ⇒ 而若照它补，会**破掉** ㋠ 条刚治好的那条不变量（「界面显示的这条会话 == 消息会落进去的那条」）⇒ ⇒ **界面开始说谎**（显示一条消息根本不落进去的会话）⇒ ⇒ 正是 ㋠ 条治的那个病的翻版。
② **✅ 实测钉死（三条链，都不是推测）**：**端脑 `POST /a2a` 不落会话** —— 每次请求新造 `task_id` + `context_id`（`telencephalon/src/api/a2ui_gateway.rs:68-69` 两个 `Uuid::new_v4()`），只读 `state.task_store`（:85）与 `state.lobe_cache`（:89），**从不碰 `ConversationStore`** ⇒ ⇒ **客户端 A2UI 发送不经 `chatProvider`** —— `Agent2UIInputBar` 直接 `service.sendMessage(text)`（`shadow-mobile/lib/widgets/chat/agent2ui_view.dart`）⇒ ⇒ **两端 A2UI 界面都不显示会话身份**（桌面 `A2uiPanel.tsx` 里 `conversation|session|title` 命中 **0** 次）⇒ ⇒ **A2UI 形态是一条「不记会话」的形态**（对端脑每次都是新的 `context_id`，没有「上一条会话」这回事）。
③ **✅ 决定：那一行**不该补**（不是「先不补」，是「补了就是界面说谎」）**：A2UI 的消息**不进** `chatProvider` 的会话 ⇒ ⇒ 那一行显示的会话**不是**消息会落进去的那条 ⇒ ⇒ 与 ㋠ 条的不变量直接冲突 ⇒ ⇒ **不许补**。⚠️ 顺带纠正一处**兄弟会话也用过的前提**：「A2UI 形态下会话也是端脑那条」不成立 ⇒ ⇒ 端脑那一侧也**没有**会话可显示 ⇒ ⇒ 两端都**不该**显示。
④ **✅ 修（把决定变成机器可判）**：新 `scripts/check-a2ui-session-identity.mjs` ⇒ 三条腿：**服务端**（`/a2a` 处理函数里**没有**会话存储的使用 ⇒ 「不落会话」）⇔ **客户端**（两端 A2UI 视图**不**说会话身份 ⇒ 「不说」）⇒ ⇒ 一致才通过；⚠️ **反了也红**（端脑哪天给 `/a2a` 加了会话落盘 ⇒ 客户端**必须**开始说 ⇒ 否则用户不知道消息落在哪条）⇒ ⇒ 这一刀**双向**承重。⚠️ **服务端读不出来 ⇒ 判不了 ⇒ 退出码 2**（不许当绿）。
⑤ **✅ 证据 + 反向验证**：自检 **9 条全绿**（含「处理函数**之外**提到会话存储 ⇒ 仍判『不落会话』」—— 只扫整个文件会误判）；主流程 **EXIT=0**（服务端「落会话？否」/ 移动端「说不说？否」/ 桌面端「说不说？否」）；⚠️ **反向验证打在真实文件的副本上**（不碰别人在飞的真文件）⇒ ⇒ 移动端注入「说会话身份」⇒ **恰好 1 条红**；桌面端注入 ⇒ **恰好 1 条红**；两端都注入 ⇒ **恰好 2 条红**；且红的原因指向「界面说谎」⇒ ⇒ **闸有分辨力、不是恒绿**。
⑥ **✅ 服务端侧运行时读数（`cargo test --lib a2ui`，端脑仓，**25 条全过 / 0 failed / EXIT=0**）**：25 条里**没有一条涉及会话存储** ⇒ ⇒ 与 ② 的源码读数一致（`resolve_view_by_keyword_zh_and_en` / `resolve_view_no_match_is_none` / `resolve_view_unknown_explicit_view_is_not_guessed` / `render_tasks_empty_still_produces_a_surface` / `a2ui_i18n` 那 10 条 locale 质量判定 …）⇒ ⇒ 端脑自己的用例表也**只**认「选视图 / 说不说 / 怎么翻」这三件事 ⇒ ⇒ 「`/a2a` 不记会话」这条不是我的推断，是**端脑自己的用例范围**。
⑦ **✅ 订正一条**过期**读数（「master 现在带着 9 条红」）**：兄弟会话 2026-11-01 19:0x 报「master 的测试是红的（从 `ba462ed` 起，可复现，9 条）」⇒ ⇒ **那 9 条红在 `ba462ed` 这一个**中间提交**上，不在 master HEAD** ⇒ ⇒ 读数**过期** ⇒ ⇒ 用 `git worktree add --detach` 在两棵树上各跑全量（**2026-11-01 实测**）：**HEAD（`3c74c36`）= `+475 All tests passed!` / EXIT=0（0 红）**，而 **`ba462ed` = `+460 -9 Some tests failed.`（恰好 9 条红）** ⇒ ⇒ 与他的读数**逐字吻合**（8 条是「条件在 Ns 内没成立」的形状）。⇒ ⇒ **治那 9 条红的三笔**都在 `ba462ed` **之后**（`158f68f` 逐例复位 / `98dd0ac` 落盘不挡路 + `test_helper.dart` 的 `configFileOverride`（**一处** ⇒ 31 个 widget 文件受益）/ `07086c9` 抗半截写入）⇒ ⇒ **下一轮别去改那些代码 —— 它们已经改对了**。
⑧ **⚠️ 那 9 条红的真正机制（实测，不是「读文件覆盖内存」）**：**`_stoppedByUser` 住在 `AppConfigService` 这个**单例**上** ⇒ ⇒ 第一条用例调 `stop()` 就把它置上 ⇒ ⇒ 后面 8 条「自动启动 / 门能等它就绪」全被污染 ⇒ ⇒ **失败长得像实现坏了**（条件在 Ns 内没成立）。⚠️ 另有一处**形状不同**的：`ba462ed` 上 `stop()` 是**在 `_service.stop()` 之前** `await` 落盘 ⇒ ⇒ 页面测试没有 override ⇒ 落盘抛异常 ⇒ ⇒ `_service.stop()` **根本没轮到** ⇒ ⇒ 失败形状是 `Expected: true / Actual: false`（**不是**异常名，被断言盖住了）⇒ ⇒ 而 HEAD 上 `stop()` 已改成**不 await**（落盘只排队）⇒ 且页面测试**已经**调 `testSetup()`（`test/widget/encephalon_mobile_page_test.dart:31`）⇒ ⇒ **那 3 行不用补**（补了是重复）⚠️ **且别在测试文件里直接写 `configFileOverride`** ⇒ ⇒ 那会**绕过** `testSetup()` 的逐例复位 ⇒ ⇒ 单例污染会**再回来** ⇒ ⇒ 要改就改 `test_helper.dart` **一处**。
⑨ **⚠️ 还欠的**：⚠️ **端脑 `/a2a` 仍然是「不记会话、不进模型」** —— 它按关键词/元数据选**视图**（任务看板 / 叶区列表），回不了纯文本答案 ⇒ ⇒ 「A2UI 形态能不能真对话」是**端脑那一侧**的活（⇒ ⇒ 跨仓 ⇒ ⇒ 本会话不越界）；⚠️ **A2UI 形态没有会话 ⇒ 也没有「新会话」入口**（那一格在 LocalChatView 形态才有）⇒ ⇒ 这条形态的**会话缺口**要在端脑落会话之后才谈得上；⚠️ **真机未验**（本轮是源码 + 判据层，设备已**交还兄弟会话** ⇒ ⇒ 本会话不再碰设备）。
**Updated:** 2026-11-01 (㋤ **「新对话」原来每点一次就在端脑留一条**删不掉**的空会话 —— 端脑**没有删会话的端点** ⇒ ⇒ 客户端必须**不制造**垃圾 ⇒ ⇒ 改成「草稿会话」：第一条消息才建** —— 承 ㋠ 条（会话身份）与 ㋡ 条（列表刷新），本条记**空会话堆积**这条病、**延迟建会话**这条修法，与**两处既有测试的契约变更**。)
① **⚠️ 病（自己制造自己的垃圾）**：移动端「新对话」是**立刻**在端脑建会话的（`chat_provider.dart` 的 `startNewConversation()` ⇒ `POST /shadow/v1/conversations`）⇒ ⇒ 用户点一下「新对话」又返回 ⇒ ⇒ 端脑那边就多一条**空**会话 ⇒ ⇒ 而端脑**没有删会话的端点**（实测 `telencephalon/src/api/shadow.rs` 的路由表：list / create / get / messages / messages:stream / tool-results / import ⇒ **没有 DELETE**）⇒ ⇒ 空会话还**落盘**（`FilePersistence::save_conversation` 每次 create 都写 `conversations.json` ⇒ 活过 App 重启）⇒ ⇒ ⇒ **永久留在列表里、且删不掉** ⇒ ⇒ 列表被自己的垃圾填满 ⇒ ⇒ 「管理多个会话」被「新对话」这个按钮堵住。（⚠️ 会话上限 `CONVERSATION_CAP = 1024` ⇒ ⇒ 暂时挤不掉真会话 ⇒ ⇒ 但垃圾只会单调增长。）⚠️ **旁证**：桌面端**本来就没有**这个病（`shadow-desktop/src/pages/ConversationPage.tsx:362` 的 `if (!conversationId || attempt > 0)` ⇒ ⇒ 桌面是「第一条消息才建」）⇒ ⇒ **移动端原来才是那个异类**。
② **✅ 修（延迟建会话 = 草稿）**：`startNewConversation()` **不再**打端脑 ⇒ ⇒ 只把客户端切到「草稿」态（`_currentSessionId = null` / `state.sessionId = null` / `activeConversationAgent = null` / messages 清空 / 闸门解封）⇒ ⇒ 第一条消息发出时才在端脑建（走 `_sendToTelencephalon` 里**已有**的「没有当前会话 ⇒ 先建一条」那条路 ⇒ **人设照旧随创建送过去**）⇒ ⇒ 点「新对话」又返回 ⇒ ⇒ 端脑**什么都没多**。⇒ ⇒ 顺带：列表页**不再**为「新对话」重拉一次列表（端脑没变 ⇒ 那是一次纯浪费的**全量**拉取，每条会话带着**完整 history**）⇒ ⇒ 「新对话」变快。⚠️ 草稿**没有**服务端会话 ⇒ ⇒ 对话页那行「当前会话」**不画**（`sessionId == null` ⇒ 没有会话可指）⇒ ⇒ 等第一条消息把它建出来，那行自己会出现。
⑥ **⚠️ 一个全局事件（记下来，免得下个会话以为自己的提交丢了）**：`origin/master` 在 2026-11-01 18:5x 被 **force-update** 回 `6dbacc3` ⇒ ⇒ **16 笔提交（含兄弟会话的闸与账本）从 origin 上消失**（`d50f7c5` / `13d743d` / `ae5561f` / `6fea938` / `e35c479` / `d0018d7` / `46a1785` / `eadb827` / `b809925` / `2897569` / `9ab3561` / `bfec9ce` / `ff6eaf4` / …）⇒ ⇒ **本地 master 仍是真相** ⇒ ⇒ 一次**快进**推送（`6dbacc3..b9e34db`）就把 22 笔全补回（`PUSH_EXIT=0`）⇒ ⇒ ⇒ **共享分支上「本地 master 是真相」；推之前先 `git merge-base --is-ancestor origin/master HEAD`** ⇒ 非祖先 ⇒ ⇒ **别硬推** ⇒ ⇒ 先查是谁 force 的。
③ **⚠️ 两处既有测试的**契约**变了（是「契约改了所以测试跟着改」，不是「改测试让它绿」）**：① `mobile_session_switch_test.dart` 的「startNewConversation：开一条新会话并切过去」⇒ 改成「开一条**草稿** ⇒ 端脑那边**什么都没多**」＋「第一条消息才建、且消息落进它」；② `mobile_conversation_contract_test.dart` 的「新开会话：真的 POST 建一条（人设随会话带过去）」⇒ 改成「**第一条消息**才 POST 建一条（人设随会话带过去）」⇒ ⇒ ⚠️ **原意一条没丢**：人设那条断言**保留**了，只是钉在「第一条消息」那一刻 ⇒ ⇒ 另外**新增**了「新对话 ⇒ **零**请求」这条 ⇒ ⇒ 契约既已改，测试就跟着改，但**必须说清为什么**。
④ **✅ 证据 + 反向验证**：新增 `test/widget/conversation_draft_test.dart`（**4 条**：真 client + 真传输层 ⇒ 断言钉在**端脑实际收到的请求**上，不是钉在「我们以为服务端长什么样」）⇒ ⇒ 全量 `flutter test` **483 条全绿 / EXIT=0**（基线 479 + 新增 4）；`flutter analyze` **76 issues = 基线持平**（我这两条新增的 `prefer_interpolation_to_compose_strings` 已修掉 ⇒ 零新增）。⚠️ **反向验证（把修复退回缺陷形状）**：`startNewConversation()` 退回「立刻建会话」⇒ ⇒ **恰好 5 条红**（草稿层 3：零请求 / 草稿没有 sessionId / 点「新对话」；契约层 1；切换层 1）⇒ ⇒ 而「草稿的第一条消息 ⇒ **恰好**建一条、消息落进它」那条**仍绿** ⇒ ⇒ 因为它钉的是**终态不变量**（消息落进新建那条会话）、**不是时机** ⇒ ⇒ 复原已 grep 核对（**半拆态的读数不作数**）。
⑤ **⚠️ 还欠的**：⚠️ **端脑仍然没有删会话端点、也没有标题字段** ⇒ ⇒ 「删掉一条会话」「给会话起个名」**仍然无处可存**（这两笔要动端脑 ⇒ ⇒ 跨仓 ⇒ ⇒ 本会话不越界）⇒ ⇒ 客户端这一侧只能做到「不制造垃圾」；⚠️ **真机验收**：**切会话 / 新对话 / 标题**三格**已在本会话的真机脚本里验成**（`scripts/prove-mobile-multi-session-on-device.ps1`，**14 条读数 / 0 红**，证据见㋩ 条）⇒ ⇒ ⚠️ **就地订正（2026-11-01 晚）**：**「切失败闸门」那一格后来独立验成了**（㋪ 条：真机 **17 条读数 / 0 红**）⇒ ⇒ 不再欠；⚠️ A2UI 形态（`agent2ui_view.dart`）**没有**「当前会话」行 ⇒ ⇒ 那个文件在兄弟会话手上 ⇒ ⇒ 本会话不碰。
**Updated:** 2026-11-01 (㋣ **「会话活不过 App 重启」那条红量的是「产物过期」，不是端脑代码 —— 而 App 自己的守卫日志**永远进不了 logcat** ⇒ ⇒ 拿它当判据会误判** —— 承 ㋽ 条（「用户喊停」跨 isolate）与㋞ 条（多会话与端脑落盘），本条记**产物出处**这条判据与**日志可见性**这条读数纪律。)
① **⚠️ 病（读数是过期的）**：2026-11-01 18:2x 在 odin（`ee6b4832`）上跑兄弟会话的 `scripts/prove-mobile-conversations-persist-on-device.ps1` ⇒ ⇒ **5 条读数 / 2 红**：建会话 PASS（id `776c801f-31f0-445f-947a-62576fe7d437`）／存储文件 PASS／重启后端脑起来 PASS／**「重启后那个会话还在」红**（HTTP 200，但 body 里**找不到那个 id**）／**「按 id 读回」红**（404）。
② **✅ 逐层查到真凶（产物过期，不是代码）**：① 设备上 `files/shadow/conversations.json` 的 **mtime 仍是 16:46**、里面只有旧会话 `d96b1987…` ⇒ ⇒ **本轮新建的会话根本没被写进去**；② 端脑那笔「会话落在一个 JSON」= **`c525c6a`（16:47:47）**；③ 而设备上的 `.so` 与两份本机 `.so`（主仓那份 14:07:56 / clean-apk 那份 01:50:48）**全都早于它** ⇒ ⇒ **那份 .so 压根不会写 `files/shadow/conversations.json`**（落盘实现在 `telencephalon/src/api/shadow/conversations.rs:462` 的 `ConversationStore::with_file_persistence` ⇒ `FilePersistence::save_conversation` **每次 create/append 都写**）⇒ ⇒ **那 2 条红量的是「产物过期」，不是功能没实现**。
③ **✅ 教训一（可复用的判据）**：「跨仓的东西没生效」⇒ ⇒ **先比产物的出处，别先怀疑代码** ⇒ ⇒ 本仓有 `scripts/prove-so-provenance-on-device.ps1` 专查这个 ⇒ ⇒ 它自己那条「设备那份 == 本机 jniLibs 那份」的**红**，正是**在提醒我这件事**（我自己装的那个 APK 带的就是旧 `.so`）。⚠️ 顺带：端脑 umbrella 仓 `C:\Projects\iBLOC\encephalon` 的 master **ahead 12**（`c525c6a` 只在本地、没推 origin）⇒ ⇒ 从 origin 拉的 clone **看不到那笔** ⇒ ⇒ 跨仓结论必须在**活仓**复核。
④ **⚠️ 教训二（读数纪律，会让人误判）**：Dart 的 **`package:logging` 的 info 行不进 logcat** ⇒ ⇒ 只有 `print()` 进 ⇒ ⇒ App 自己那行守卫日志（「用户主动停过大脑 —— 放弃启动」/「用户之前喊停过大脑 —— 不自动启动」）**在 logcat 里永远看不到** ⇒ ⇒ 拿它当判据 ⇒ ⇒ 会**误判成「守卫没挡住」** ⇒ ⇒ 判据要用 **Kotlin 侧**那行（`Encephalon started` / `Encephalon stopped`）。⇒ ⇒ 实测：守卫**确定跑过**的一轮里（大脑没起来），那三行守卫日志在 logcat 里出现 **0 次**；而 native 侧那几行与 `print()`（`[wake_word]` / `[ShadowApp] 租户迁移`）**都进**。
⑤ **✅ 已闭环（2026-11-01 18:35）**：从端脑 master（`c525c6a`）重编 `.so`（**159,058,056 B** / sha256 `63D3E61C…f7721` ⇒ 里面能搜到 `shadow/conversations.json` ⇒ ⇒ 落盘那一笔真在里面）⇒ ⇒ 重编 APK（**286,523,757 B** / `87018B3E…C3A50`）⇒ ⇒ 装到 odin ⇒ ⇒ 兄弟会话那条 `prove-mobile-conversations-persist-on-device.ps1` ⇒ **5 条读数 / 0 红 / EXIT=0**（**「重启后那个会话还在」** + 「按 id 读回会话」都 PASS）⇒ ⇒ **「会话活不过 App 重启」这笔债结清** ⇒ ⇒ 同批产物上：`prove-so-provenance-on-device.ps1` **16/16 绿**（出处一致 + 门矩阵）＋ 我那条 A2UI 失败态 **9/9 绿 / EXIT=0**。⚠️ 顺带：APK 比上一版大 23.7 MB **不是 `.so` 涨的** ⇒ ⇒ 是 `a072d08` 那笔 `build.gradle.kts` 改了 ABI 配置 ⇒ 现在**同时打进 x86_64**（35 个 lib 条目 / 未压缩 385 MB）⇒ ⇒ 设备是 arm64 不受影响，但**字节比对要用新指纹**。
⑥ **⚠️⚠️ 一个「成功的构建却什么也没换」的静默陷阱**：端脑 `scripts/build-android.ps1` 的 **`-JniLibsDir` 是 jniLibs 的「根目录」，脚本自己会拼 `arm64-v8a`** ⇒ ⇒ 传 `…/jniLibs/arm64-v8a` ⇒ ⇒ 产物落到 **`…/jniLibs/arm64-v8a/arm64-v8a/`**（嵌套一层）⇒ ⇒ **App 加载的仍是旧 `.so`** ⇒ ⇒ 而脚本**退出码 0、JNI 符号核验也过**（它核的是自己刚写的那份）⇒ ⇒ ⇒ **静默无操作** ⇒ ⇒ 教训：**构建完必须断言「App 真正加载的那个路径上的文件就是刚编出来的」**（比 sha/大小），否则嵌套会一直静默。
⑦ **⚠️ 还欠的**：⚠️ `c525c6a` 只在端脑本地（master **ahead 12**）⇒ ⇒ CI / 从 origin 拉的 clone **看不到那笔** ⇒ ⇒ 「会话活不过重启」在那边会复现成真缺陷 ⇒ ⇒ **推不推 origin 是另一条会话的事 ⇒ ⇒ 不越界**；⚠️ ⑥ 那个 `-JniLibsDir` 嵌套陷阱**该在端脑仓修**（不越界去改别人的仓）。
**Updated:** 2026-11-01 (㋽ **「大脑自己回来」的根因不是守卫漏了，而是它活在一个**会被丢掉的 isolate** 里 —— 而「进程没换、isolate 换了」这件事在 logcat 里有三行判据** —— 承 ㋞ 条（「用户喊停」的边界与其就地订正）与 ㋡ 条（列表刷新），本条记**根因四层链**、**判据**、**落盘不许挡路**与**测试隔离**这三族坑。)
① **⚠️ 病（㋞ 条 ③ 列的三个候选，实测落在第 (c) 个，但形态更细）**：真机 odin（`ee6b4832`）实测，**pid 全程不变** ⇒ ⇒ **不是**进程重启 ⇒ ⇒ 是 **Activity 被销毁 ⇒ 同一个进程里换了 Dart isolate** ⇒ ⇒ 那个**内存态**标记（`_stoppedByUser`）**归零** ⇒ ⇒ 三道守卫（就绪门 / `_init()` / `_startWithRetry` 顶部）**全拦不住** ⇒ ⇒ 大脑自己回来。
② **✅ 四层链（odin 真机 logcat，逐层可查）**：① Activity 被弹掉：`17:18:37.287 [FBP-Android] onDetachedFromEngine` → `17:18:37.443 Activity com.ibloc.shadow/.MainActivity onDestroy took 182ms`；② 新引擎 ⇒ 新 isolate：`17:18:42.153 Using the Impeller rendering backend (Vulkan)`（启动段同一条在 `17:16:58.575`）→ `17:18:42.516 onAttachedToEngine`；③ `main()` 重跑：`17:18:44.541 [ShadowApp] 租户迁移 → persona-1301bc0a58972419`（与启动段 `17:17:01.058` **逐字同构**、同一 persona id）；④ 守卫归零：`17:18:44.414 ✅ Encephalon started on port 39047` ⇒ 走的是 `_startWithRetry` ⇒ 而 `_stoppedByUser` 是**实例字段** ⇒ 新 isolate ⇒ false。
③ **✅ 判据（一眼认出「`main()` 又跑了一遍」）**：**「停脑之后 `[ShadowApp] 租户迁移 → persona-…` 又出现一次」** ⇒ ⇒ `main()` 重跑过（机器可判，不用看界面）。⚠️ 配套第二条：**`onAttachedToEngine` 出现次数 > 1** ⇒ Activity 被重建过 ⇒ ⇒ 证明脚本把「引擎 attach 次数 == 1」列成**前提**（前提不成立 ⇒ 那一轮作废 ⇒ 不许拿它说「修好了」）。
④ **⚠️ 落盘不许挡用户的路（产品缺陷，不是测试问题）**：把「用户喊停」落盘那一笔（`ba462ed`）把 `await …setBrainStoppedByUser(...)` 放在 `stop()` / `start()` 的**前面** ⇒ ⇒ 落盘要走平台通道（`path_provider`）⇒ ⇒ 通道一卡，用户的「停止大脑」「启动大脑」就被拖住 ⇒ ⇒ **大脑还在跑、界面却在转圈** ⇒ ⇒ 「失败长得像成功」。⇒ ⇒ 修法：内存标记**立刻**改（守卫马上生效）⇒ 落盘改成 `_persistBrainStoppedByUser()`：**有序（`_persistQueue`）／不阻塞／失败只记日志**。⚠️ **踩坑**：单测里给 `AppConfigService` 配了 `configFileOverride` ⇒ 落盘**秒回** ⇒ ⇒ 把这个缺陷**遮住了** ⇒ ⇒ **测试环境可以把产品缺陷藏起来** ⇒ ⇒ 改产品时要在「没有 override」的真实路径上再看一眼。
⑤ **⚠️ 测试隔离这一族（同一个单例，三种症状）**：「用户喊停」住在 **AppConfigService 单例**上 ⇒ ⇒ 一条用例调了 `stop()` ⇒ ⇒ 它就把标记置上了 ⇒ ⇒ **后面的用例全被污染**（它们默认期望「没喊停过」⇒ 大脑起不来 ⇒ 在「条件在 Ns 内没成立」上红 ⇒ ⇒ **失败长得像实现坏了**）⇒ ⇒ 三处都要治：① 单元测试文件逐例复位；② 共享 `test/widget/test_helper.dart` **一处** ⇒ 31 个 widget 测试文件都受益（落盘目标也指向临时文件 —— 单测里没有 `path_provider` 平台实现 ⇒ 真去调会抛 MissingPluginException ⇒ **落盘静默失败**）；③ 断言要**抗「半截写入」**（落盘不阻塞 ⇒ 读时可能撞上写了一半的 JSON ⇒ `jsonDecode` 抛 FormatException ⇒ 「等条件成立」自己就红了）⇒ ⇒ 收尾删临时目录也可能被**正在飞的写入**占着（`PathAccessException`）⇒ ⇒ **清理不许变成测试失败**。
⑥ **✅ 证据 + 反向验证**：单元测试文件 **21/21 全绿**（改之前 16 过 5 红）；页面测试文件 **8/8 全绿**（改之前 8 条里 4 红）；⚠️ **反向验证**：把产品修复退回修复前（`git checkout a7d2575 -- …provider.dart`）⇒ ⇒ **恰好 3 红**（正是那 3 条「跨 isolate」新测试）⇒ ⇒ 其余 18 条纹丝不动 ⇒ ⇒ 断言钉在真东西上、不是恒绿。
⑦ **⚠️ 证明脚本的三条纪律**（`scripts/prove-a2ui-failure-on-device.ps1`）：① **离开「嵌入式大脑」页只能按一次 BACK** —— 那个页是**压在对话页之上的路由** ⇒ 底栏 tab 点了 7 次**弹不掉** ⇒ ⇒ 而 BACK 按两层 ⇒ **task 被弹空 ⇒ Activity 销毁 ⇒ 新 isolate** ⇒ ⇒ 那一轮整轮作废 ⇒ ⇒ 且**先确认键盘已收**（否则第一下被搜狗 IME 吃掉：`17:35:08.111 SogouIME onKeyDown: code：4`）；② **全程开着 logcat 抓取写文件**（不是跑完再 `logcat -d`）—— 脚本自己每次 `uiautomator dump` 都会刷一屏 ⇒ ⇒ 缓冲几秒就被冲掉 ⇒ ⇒ 「logcat 里没看到守卫日志」**不能**当证据（⚠️ Dart 的 `print()` **会**进 logcat 的 `flutter` 标签 —— 旧注释说「Dart 日志不进 logcat」是**错的**）；③ **找元素前先确认 App 在前台**（MIUI 的通知面板/推广弹窗一盖 ⇒ 语义树 package 变成 `com.android.systemui` ⇒ ⇒ 找什么都是空 ⇒ ⇒ **误报成「App 没有那个按钮」**）。
⑧ **✅ 真机那一轮跑绿了（odin `ee6b4832`，2026-11-01 18:05）**：带落盘标记的新 APK（**262,794,948 B** / sha256 `CD90CBA0920121F6D81B50C3309B8315C0FC1EFA6DA82D2EB449A835EA2131D4`）⇒ ⇒ 证明脚本 **9/9 全过、EXIT=0** ⇒ ⇒ 「**错误：HTTP 401 Unauthorized**」**真的出现在界面上**（截图 `artifacts/a2ui-failure-on-device/04-a2ui-failure.png`）⇒ ⇒ 桩收到 **不带影子锁**的 `/a2a` 且回 **401** ⇒ ⇒ 红像素 **0 → 1736** ⇒ ⇒ ⚠️ 而这一轮**引擎被重建了**（attach=2 ⇒ 新 isolate 跑起 Dart）⇒ ⇒ **大脑仍然没有自己回来** ⇒ ⇒ 这就是「跨 isolate 也要赢」的**真证明**（判据因此从「引擎不许重建」改成「**重建过 ⇒ 必须拿出『新 isolate 跑起来了』+『大脑仍没回来』**」⇒ ⇒ 比「没重建」更强 ⇒ ⇒ 两个分支都承重）。⚠️ 设备上的 `app_config.json` 当时是 `{"brainStoppedByUser":true,…}` ⇒ ⇒ **落盘这件事本身在真机被证到了**。⚠️ **再补一条 A/B 对照（把因果钉死）**：光看「没起来」不够 ⇒ ⇒ 同一个 APK、
同一台设备、只换**一个变量**（配置里有没有那个标记）：**处理组**（brainStoppedByUser:true）
⇒ force-stop + 重启 ⇒ 等 **50 秒** ⇒ 「Encephalon started」**0 次**；**对照组**（无标记）
⇒ force-stop + 重启 ⇒ **0.3 秒**就「✅ Encephalon started on port 41385」⇒ ⇒ ⇒ **唯一变量就是那个标记**
⇒ ⇒ 「用户喊停」的效力**跨进程重启**也成立（上一条只证到 isolate 重建）。
⚠️ 顺带记两条读数习惯：① 「logcat 里没看到 App 的守卫那行」**不能**当「守卫没跑」的证据
（App 的 package:logging 的 info 级**没被放出来** ⇒ ⇒ 判据要用 Kotlin 侧那行「Encephalon started」）；
② MIUI 的 uiautomator dump 会**偶发**报 theme_compatibility.xml 缺失（第一次失败、第二次成功）
⇒ ⇒ dump 失败时那一轮的**界面判定不作数**（别把「没查到」当「没有」）。
⑨ **✅ 语义变更已由用户拍板（2026-11-01 19:2x）⇒ ⇒ 保持现状**（「停过一次 ⇒ 之后不再自动起脑」）⇒ ⇒ 「恢复自动启动」**已有入口**（脑页「启动大脑」按钮 ⇒ 它把标记抹掉）⇒ ⇒ **不新增入口**（免得同一个动作有两个地方做）；**Tauri 真机 UI 仍未验**；**桌面端那 6 处条件 401** 本轮未动。
**Updated:** 2026-11-01 (㋡ **「最近会话」名不副实 —— 回到列表时**不重新拉**，排序与条数都停在旧值；顺带把**消息数**里混进去的「人设那条」剔掉** —— 承 ㋠ 条（界面显示的会话 == 消息落到的会话）与 ㋟ 条（标题与端脑轮次前缀），本条记**列表的刷新时机**与**计数口径**。)

① **⚠️ 病一（列表是陈旧的）**：拉取在 `ConversationsNotifier` 的**构造函数**里 ⇒ ⇒ 它只在**第一次**进列表时发生 ⇒ ⇒ 而 `conversationsNotifierProvider` **不是** autoDispose ⇒ ⇒ notifier 一直活着 ⇒ ⇒ 聊完天再回到列表，**消息数**与**排序**（按 `updated_at` 倒序）**停在旧值** ⇒ ⇒ **刚聊过的那条会话不在最上面** ⇒ ⇒ 「最近会话」名不副实。
② **✅ 修一（进入即刷新）**：拉取挪到**列表页每次进入时**（`ConversationScreen.initState`）⇒ ⇒ 一次进入 = 一次拉取 ⇒ ⇒ 「最近会话」名副其实。⚠️ **不能直接在 `initState` 里拉**：Riverpod **不许在 widget 构建期改 provider**（`_debugCanModifyProviders` 直接抛错）⇒ ⇒ 只能等下一帧（`addPostFrameCallback`）。⚠️ 而「等下一帧」会闪一帧「**暂无会话**」⇒ ⇒ 那正是「**真的没有**」的样子 ⇒ ⇒ 所以 notifier 的**初始态改成 loading**（不是空列表）⇒ ⇒ 第一帧画的是**转圈**。
③ **⚠️ 病二（消息数把「人设」算进去了）**：端脑把**人设**存成会话的**第一条**轮次 ⇒ ⇒ `c.history.length` **含**它 ⇒ ⇒ 对话页**不画**它（㋟ 条的规则）⇒ ⇒ 列表里的条数却**算了**它 ⇒ ⇒ 用户数出来的条数与看到的对话**对不上** ⇒ ⇒ 现在两处**同一口径**（都不含人设那条）。
④ **✅ 证据 + ⚠️ 一条必须分清的账**：新增 **2 条**（进入即刷新 / 消息数口径）⇒ ⇒ 我这批全过；⚠️ 但**整包**在那时是 **479 条里 9 条红** ⇒ ⇒ 红的**全部**落在 `encephalon_mobile_provider_test.dart` / `encephalon_mobile_page_test.dart` ⇒ ⇒ **不是我的**：在 **HEAD 的 worktree**（`a072d08`，含我已提交的两片）上单跑那两个文件 ⇒ **26 条全过**；再把我在飞的这一片打进去 ⇒ **39 条全过**（26 + 我这批 13）⇒ ⇒ 红的来源是**工作树里别人的在飞改动**（`encephalon_mobile_provider.dart` 于 17:31:30 被改）⇒ ⇒ 已通报那条会话。⚠️ 那 9 条的形状是**超时**（「条件在 10s 内没成立」⇒ 大脑没在 10 秒内起来），不是断言不匹配。
⑤ **⚠️ 反向验证 + 一条踩坑**：退回「构造时拉一次」⇒ **恰好 1 红**（进入即刷新那条）；消息数退回「全算」⇒ **恰好 1 红**（消息数那条）⇒ ⇒ 其余纹丝不动。⚠️ **踩坑**：反向验证第一次**复原失败**（编辑的 old_text 与实际文本差一个空行）⇒ ⇒ 文件停在**半拆状态** ⇒ ⇒ 那一轮的「13 条全红」是**半拆态**的读数，**不作数**（⇒ 重做时每一步都**先 grep 核对文件真的被改到了**，再跑测试）。⚠️ 还顺手清掉了一个**孤儿 `flutter_tester`**：它的父进程已经退出，它却还攥着 `build/native_assets/windows/sqlite3.dll` ⇒ ⇒ 整个仓的 `flutter test` 都被它卡住（连试 6 次都是同一个锁）⇒ ⇒ 定位办法：`Get-CimInstance Win32_Process` 查父进程 + 逐进程扫 `Modules` 找持有者。
⑥ **⚠️ 还欠的**：**真机上仍未验**（设备在别的会话手上）；**Agent2UI 那面没有「当前会话」行**（`agent2ui_view.dart` 正在被别人改 ⇒ 本轮**不碰**）；端脑**仍然没有删会话端点**、**仍然没有标题字段**。
**Updated:** 2026-11-01 (㋠ **「界面显示的会话」与「消息落到的会话」必须同一条 —— 而「切会话失败」原来会静默把消息写进**另一条**会话** —— 承 ㋟ 条（标题与端脑轮次前缀）与 ㋝ 条（多会话真的能用了），本条记**会话身份**与**闸门**。)

① **⚠️ 病一（比「标题不好看」严重得多）**：`switchTo` 失败时只把错误塞进 state ⇒ ⇒ **`_currentSessionId` 仍是上一条** ⇒ ⇒ 用户接着打字 ⇒ ⇒ `_sendToTelencephalon` 用的**就是那条旧的** ⇒ ⇒ **消息落进了另一条会话** ⇒ ⇒ 而界面只有一句泛泛的错误 ⇒ ⇒ ⇒ 这是「失败长得像成功」的最坏形态：**消息看起来发出去了，却落在别处**。
② **⚠️ 病二（界面根本不显示会话身份）**：对话页从头到尾**没有一行**告诉用户「你现在在哪条会话」⇒ ⇒ 而端脑的会话**没有标题字段**⇒ ⇒ 多会话里唯一能识别的线索（**用户的第一句话**）**根本没露出来**⇒ ⇒ 「消息落到哪条会话」成了**用户猜**的事。
③ **✅ 修一（标题从「屏幕上真正显示的消息」派生）**：对话页顶部加一行「当前会话」（key = `active-conversation`）⇒ ⇒ 标题 = **第一条用户发言**⇒ ⇒ 判据源是 `state.messages`（**屏幕上真正显示的那些消息**）⇒ ⇒ **不是**另存一份 ⇒ ⇒ ⇒ 不变量「界面显示的这条 == 消息会落进去的那条」是**结构上**成立的。⚠️ 派生的**规则只有一份**（`lib/utils/conversation_title.dart` 的 `deriveConversationTitle`）⇒ 列表页（`Conversation.derivedTitle`）与对话页**共用** ⇒ ⇒ 不会分叉（分叉出来就是「有的按叶区名、有的按第一句话」⇒ 列表与对话页对不上）。⚠️ **不新增 i18n key**：空会话用既有的 `conversationNewSession`，叶区名是数据不是文案。
④ **✅ 修二（闸门：切失败就不许写）**：`ChatState.failedSwitchSessionId` 非空 ⇒ ⇒ `canChat` 为假 ⇒ ⇒ 输入框**禁用**（界面）+ `_sendToTelencephalon` **顶部**直接 return（漏斗）⇒ ⇒ **消息不可能落进别的会话**。⚠️ **守卫放在漏斗上**：UI 的禁用是**表现**，漏斗的守卫是**执行**⇒ ⇒ 所有入口都归它管。⚠️ **解闸的语义**：关掉错误横幅（`clearError()`）= 用户明确接受「我就留在当前这条」⇒ ⇒ 那时闸门打开 ⇒ 而界面**显示的仍是当前那条**（标题从 `state.messages` 派生）⇒ ⇒ 不变量依然成立。
⑤ **⚠️ 一条被改掉的口径**：`canChat` 以前是**恒真**（㉔ 条 ⑥ 特意说明过）⇒ 现在它**有了**唯一的前置条件：「**当前会话的身份是确定的**」。⚠️ 但**不是**回到「拿本地引擎状态当判据」那条老路（`425e666` 的教训：那个判据让没装模型的设备**一条消息都发不出去**）⇒ ⇒ 现在这个只在**切会话失败**时关门 ⇒ ⇒ 正常路径**恒真**（既有那条 `expect(state.canChat, isTrue)` 仍绿）。
⑥ **✅ 证据 + 反向验证**：新增 **6 条**（provider 层 3 + widget 层 3）⇒ ⇒ 全量 `flutter test` **474 passed / 0 failed**；`flutter analyze` **76 issues（基线持平）**、我这批文件**零 issue**；⚠️ **反向验证**：闸门退回「恒真」⇒ **恰好 3 红**（2 provider + 1 widget）；拆掉漏斗守卫 ⇒ **恰好 1 红**；顶部那行退回「没有」⇒ **恰好 3 红** ⇒ ⇒ 断言钉在真东西上、不是恒绿。
⑦ **⚠️ 还欠的**：**真机上仍未验**（设备在别的会话手上）；**Agent2UI 那面没有这行**（`agent2ui_view.dart` 正在被别人改 ⇒ 本轮**不碰**）⇒ ⇒ A2UI 形态下用户还是不知道自己在那条会话里；端脑**仍然没有删会话端点**、**仍然没有标题字段** ⇒ ⇒ 「让用户自己给会话起个名」依旧无处可存。
**Updated:** 2026-11-01 (㋟ **「多会话」在视觉上还不成立 —— 同一个叶区的会话**长得一模一样**；而切开会话会把**你的人设原文**当成大脑发言顶在最上面** —— 承 ㋝ 条（多会话真的能用了）与 ㋞ 条（「用户喊停」的边界），本条记**会话标题**与**端脑轮次前缀**这两条规则。)

① **⚠️ 病一（标题）：列表里的标题取的是 `agent`（叶区名）** ⇒ ⇒ **同一个叶区的所有会话在列表里长得一模一样** ⇒ ⇒ 用户根本分不出哪条是哪条 ⇒ ⇒ 「管理多个会话」这件事在**视觉上**就不成立 ⇒ ⇒ 而它无解的根子是：端脑的 `Conversation` **没有标题字段**（只有 `id` / `agent` / `created_at` / `updated_at` / `history`）⇒ ⇒ 「让用户自己起个名」**无处可存**（早先那个标题输入框因此被撤掉了 —— 那个框按了「创建」什么也没创建）。
② **✅ 修一（客户端、纯本地、**零额外请求**）**：标题 = **用户自己说过的第一句话** ⇒ ⇒ 判据源：端脑的 `ConversationView` **带着完整 `history`**（`telencephalon/src/api/shadow.rs`）⇒ ⇒ 客户端手里**本来就有** ⇒ ⇒ 不用多发一个请求。⚠️ **叶区名不丢** —— 它**降为副标签**（`agent · 时间`）⇒ ⇒ 标题让位了，信息还得在。⚠️ 空会话（用户还没说话）⇒ 退回「新会话」（既有 i18n key `conversationNewSession`，**不新增 arb key**）；⚠️ 超长 ⇒ 按**码点**截断（用 `runes` 而不是 `length` ⇒ 否则 emoji 这类星平面字符会被切出**半个代理对** ⇒ 渲染成豆腐块）。
③ **⚠️ 病二（更隐蔽）：切会话时 `conversation.history.map(_messageFromTurn)`** ⇒ ⇒ 端脑把会话的**人设**存成**第一条**轮次（`role=agent` + `[system] ` 前缀）⇒ ⇒ 原样画成气泡 ⇒ ⇒ **用户看到自己的配置原文被当成大脑发言顶在最上面**。⚠️ **这条病是多会话功能自己暴露的**：以前切不了会话 ⇒ 那条轮次**从来没被打开过** ⇒ ⇒ 一旦能切了，它就露出来了。
④ **✅ 修二（认端脑那两个机器前缀）**：判据源 = `telencephalon/src/api/shadow/conversations.rs` 的 `SYSTEM_TURN_PREFIX = "[system] "` 与 `telencephalon/src/api/shadow.rs` 的 `TOOL_RESULT_TURN_PREFIX = "[tool_result] "` ⇒ ⇒ **人设那条整条不画**（它是**配置**，不是对话）；**工具结果那条剥掉前缀再画**（用户该看见「工具跑过了」，不该看见协议内部标记）。⚠️ **口径与服务端一致**：端脑喂模型时 `history_of()` 也**只跳人设**，工具结果**留在**历史里（模型要读）⇒ ⇒ 客户端别自作主张多跳。
⑤ **✅ 证据 + 反向验证**：新增 **7 条**（列表**真渲染** 4 条 + 契约/provider 3 条）⇒ ⇒ 全量 `flutter test` **468 passed / 0 failed**（我这一片新增 7 条）；`flutter analyze` **76 issues（基线持平）**，我这批文件**零 issue**；⚠️ **反向验证**（退回缺陷形状 ⇒ 恰好该红的红）：标题退回叶区名 ⇒ **恰好 5 红**；不跳人设 ⇒ **恰好 1 红**；不剥前缀 ⇒ **恰好 1 红** ⇒ ⇒ 断言钉在真东西上、不是恒绿。⚠️ 顺带**订正**一条既有测试：契约里那条「标题取叶区名」**编码的正是那个缺陷** ⇒ 改成「标题取用户第一句话」（同族的「修好之后既有测试变红 ⇒ 先查它绿的原因」）。
⑥ **⚠️ 还欠的**：**真机上的多会话那一段仍未验**（设备在别的会话手上 ⇒ 本轮只有 Dart 侧证据：真 client + 真 HTTP 传输层 + 逐字照抄服务端 serde 形状的 JSON）；「**让用户自己给会话起名**」仍然无处可存（要动端脑模型 ⇒ 那是另一个决定）；**桌面端没有会话列表 UI**（`shadow-desktop/src/lib/telencephalonClient.ts` 有 `listConversations` / `getConversation`，**没有人调**）⇒ ⇒ 这条规则目前**只有移动端落地**。
**Updated:** 2026-11-01 (㋞ **「用户喊停」的效力到**进程结束**为止 —— 而「它又自己起来了」这个现象有**三个**候选，判据要用**守卫自己的日志行**，别用界面** —— 承 ㋟ 条（「用户喊停必须赢」）与 ㋝ 条（多会话），本条记**边界**与**读数判据**。)
① **✅ 先把边界钉死（读数，不是推测）**：`_stoppedByUser` 在整仓**只有 6 处**（声明 + 3 处守卫 + `stop()` 置 true + `start()` 置 false）⇒ ⇒ **没有任何持久化** ⇒ ⇒ **「用户喊停」的效力到进程结束为止** ⇒ ⇒ App 一重启，标记归零 ⇒ ⇒ 大脑按 `main.dart:57` 的 `ensureStarted()` 自动起来 ⇒ ⇒ **那是 App 的启动契约，不是「偷偷拉回来」** ⇒ ⇒ 把它当缺陷去修之前，先分清是「进程内」还是「跨进程」。
② **✅ 守卫现在在**漏斗**上（这是它能一次盖住所有入口的原因）**：`_startWithRetry` **顶部**（循环里每次尝试都查）⇒ ⇒ 所有入口都汇进它：`main.dart:57`（启动时）、`initialize()`、就绪门 `waitUntilReady()`、用户的 `start()` ⇒ ⇒ **一处实现 ⇒ 一套语义** ⇒ ⇒ 以前它只挂在就绪门上 ⇒ ⇒ 自动启动那条路不守 ⇒ ⇒ 两个入口两套语义 ⇒ ⇒ 那就是㋟ 条修的那笔（`cccd646`）。
③ **⚠️⚠️ 「大脑停不掉、约 20 秒后自己回来」⇒ 三个候选，一次测量可分**（2026-11-01 另一条会话在 odin 上实测：16:42:47 stopped ⇒ 16:43:07 started，**19.5 秒**，pid 全程未换）：
   - **(a) 缺守卫** —— 那次测的 APK 是 `8465c91`，而补守卫的 `cccd646` **不在它里面**（`git merge-base --is-ancestor` 核过）⇒ ⇒ 那个形态确实存在（已修）；
   - **(b) 误触「启动大脑」** ⇒ ⚠️ `encephalon_mobile_page.dart:502` 的按钮调的是 `notifier.start()` ⇒ 而 `start()` 的第一件事就是 **`_stoppedByUser = false`**（**清掉**标记）⇒ ⇒ **那个按钮一被点，大脑回来就是合法的** ⇒ ⇒ 而真机驱动的坑正好是「坐标被底栏遮住时照样 tap ⇒ 打到别的控件上」⇒ ⇒ 一次走偏的点击就够解释那 19.5 秒；
   - **(c) 进程重启** ⇒ ⇒ 标记是**内存态** ⇒ ⇒ 新进程 ⇒ 标记归零 ⇒ ⇒ 大脑自动起来是**设计如此**。
   ⇒ ⇒ **判据用守卫自己的日志行**（机器可判，不用看界面）：**「用户主动停过大脑 —— 放弃启动」** ⇒ 守卫在起作用 ⇒ ⇒ 是 (b)/(c)；**「Encephalon started on port …」** ⇒ ⇒ 守卫没挡住 ⇒ ⇒ 才需要继续查。
   ⇒ ⇒ 另记两条读数习惯：**App pid** 与**脑的 pid** 分开记（进程换了 ⇒ (c) 直接成立）；**原生侧不可能是拉它回来的** —— `libencephalon.so` 只能由 Dart 经 MethodChannel 的 `start` 启动，Kotlin 侧**没有**自动重启（`PrefrontalRuntimeService` 的 `START_STICKY` 是**前额叶**那套，不是大脑）⇒ ⇒ 拉它回来的**只能**在 Dart 侧。
④ **⚠️ 还欠的**：② 的守卫有**单测**（`encephalon_mobile_provider_test.dart`），但**真机上「停 ⇒ 停住」这一段还没有端到端证据**（设备在别的会话手上）⇒ ⇒ 真机那次量的到底是 (a)/(b)/(c) 哪一个，要等那次测量回来才写得进账 —— **没量之前不许写「已修好」**。
⑤ **⚠️⚠️ 就地订正（2026-11-01 17:40，同日另一条会话的提交 `ba462ed` 把本条 ① 的边界**改了**）**：那条提交（`fix(mobile): 「用户喊停」是持久偏好 ⇒ 跨 isolate 也要赢`）把标记**落盘**（`AppConfigService.brainStoppedByUser`）⇒ ⇒ ⇒ **本条 ① 说的「效力到进程结束为止」已过期** ⇒ ⇒ 现在它**跨进程 / 跨 isolate**都成立 ⇒ ⇒ ⚠️ 而这**不是**把旧读数当新事实，是**语义变更**：用户停过一次 ⇒ ⇒ **之后每次启动 App 都不再自动起脑** ⇒ ⇒ 产品语义要明确（这是好事还是坏事，是**另一个决定**）。⇒ ⇒ ⚠️ **代价（已实测）**：落盘位置是**共享**的 ⇒ ⇒ 一个测试里 `stop()` 写的标记**被后面的测试读到** ⇒ ⇒ 「自动启动」类测试的大脑**起不来** ⇒ ⇒ 10 秒超时 ⇒ ⇒ ⇒ **master 在那笔提交上是红的**（`encephalon_mobile_provider_test.dart` 5 条 + `encephalon_mobile_page_test.dart` 4 条 ⇒ 形状是「条件在 10s 内没成立」，**不是**断言不匹配）⇒ ⇒ ⇒ 便宜修法：测试里给 `AppConfigService` 一个**隔离的临时路径**，或每个用例前后**清掉**那份落盘（尤其那条「stop() 会把『用户喊停』落盘」—— 它自己就把标记写进了共享位置）⇒ ⇒ ⇒ **账本里的话也会过期 ⇒ 过期的要就地订正，别让下一轮读到假读数**。
**Updated:** 2026-11-01 (㋅ **「客户端读面的凭据集合必须与门形一致」—— 移动端这一侧读面**一把都不递** ⇒ ⇒ 外部端脑形态下读面必然 401；顺带把「影子锁**无处可配**」这个入口补上** —— 父仓 `shadow/AGENTS.md` ㋡ 条记**整片**，本条记**移动端这一侧**的形状与坑。)
① **⚠️ 病（读面递不全）**：`TelencephalonClient._headers()`（`lib/services/telencephalon/telencephalon_client.dart`）**只在 `admin: true` 时才带 `X-Admin-Token`** ⇒ ⇒ 读面（`_get` / `_getJson` / `_post`）**只递影子锁** ⇒ ⇒ 而门形是**读门 = 影子锁 ∪ admin token**（判据源 `telencephalon/src/api/door_policy.txt` ⇒ 实现 `security/api_key.rs::verify_read_credential`）⇒ ⇒ **少递一把** ⇒ ⇒ 那台端脑只认另一把时 ⇒ **401** ⇒ ⇒ 而界面把它画成「没有 / 连不上」⇒ ⇒ **失败长得像成功**。⚠️ 而在**外部端脑**形态下影子锁**又是空的**（`releaseAgentSurface()` 主动 `_client.setApiKey(null)`）⇒ ⇒ 读面**一把都不递** ⇒ ⇒ **必然 401**。
② **⚠️ 病（同一条规则的**第二个**落点）**：`POST /a2a` 也是**读门**（`telencephalon/src/api/shadow_auth.rs` ⇒ `require_shadow_key` ⇒ 同一个 `verify_read_credential`）⇒ ⇒ 而 A2UI 那条 SSE 路（`lib/services/genui/shadow_key_sse_transport.dart`）**只带 `X-Shadow-Key`** ⇒ ⇒ 它**不走** `_headers()` ⇒ ⇒ 改 client **修不到它** ⇒ ⇒ 「列表读得到、A2UI 连不上」的同族矛盾。
③ **⚠️ 病（入口缺口）**：影子锁**无处可配** —— `AppConfigService` 只有 `telencephalonBaseUrl` + `telencephalonAdminToken`（**没有影子锁字段**）⇒ `TelencephalonNotifier` 构造时**不应用**它 ⇒ `setConfiguredEndpoint` **没有这一项** ⇒ 设置页**没有输入框** ⇒ ⇒ 「配了不能生效」的同一族（setter 有、持久化位有 ⇒ 只差一个输入框 ⇒ ⇒ 补入口比补 setter 更靠近用户可感知的失败）。
④ **✅ 修（一条规则、四处落地）**：**客户端递的凭据集合必须与门形一致** ⇒ 门认哪几把，客户端就递哪几把 ⇒ ⇒ ① `_headers()` 递**手里有的全部钥匙**（拿不到就**不带那个头**，绝不塞空串：空串与空串 `ct_eq` 相等 ⇒ 等于把门骗开）；② `AppConfigService` 加 `telencephalonShadowKey`（落盘同名字段）+ `setTelencephalonShadowKey`；③ `TelencephalonNotifier` **三处**都应用它（构造时 / 内嵌大脑放手时放回**外部那把** / 改配置时）；④ 设置页「高级」区加**第三个输入框**（`settingsBackendShadowKeyHint`）+ A2UI transport 也递 `X-Admin-Token`（新增 `adminTokenProvider`）。
⑤ **⚠️ 顺手拆掉的一颗暗雷**：`setBaseUrl` 以前转发 `setConfiguredEndpoint(url, null)` ⇒ 那个 `null` **顺手把 admin token 清了** ⇒ ⇒ 「改个地址，钥匙没了」⇒ ⇒ 读面 401 ⇒ ⇒ **失败长得像成功** ⇒ ⇒ 现在 `setBaseUrl` **只改地址**。
⑥ **⚠️ 一条必须先复核的边界（不然不敢递 admin token）**：端脑的 `current_actor`（`telencephalon/src/api/shadow.rs`）**只看 `Authorization: Bearer`** ⇒ ⇒ **不看** `X-Shadow-Key` / `X-Admin-Token` ⇒ ⇒ 读面多递 admin token **不会**改变「当前是谁」的判定 ⇒ ⇒ 账号级身份**不受影响**。
⑦ **✅ 证据 + 反向验证**：新增 **16 条**（`test/unit/telencephalon_read_credential_test.dart` 11 / `test/unit/shadow_key_sse_transport_test.dart` 2 / `test/widget/backend_shadow_key_entry_test.dart` 3）⇒ 全量 `flutter test` **445 ⇒ 461 passed / 0 failed**；`flutter analyze` 我这几个文件**零新增 issue**（client 文件里那 3 条 info 是**既有**的，不在本次 diff 里）⇒ ⇒ ⚠️ 反向验证**七处**，每一处都「**恰好该红的红**」：`_headers` 退回「admin 只在写面」⇒ **恰好 2 红**；A2UI 的 admin 头摘掉 ⇒ **恰好 1 红**；构造时不应用存储里的影子锁 ⇒ **恰好 1 红**；放手时不放回外部那把 ⇒ **恰好 1 红**；`setConfiguredEndpoint` 不应用 ⇒ **恰好 2 红**（unit + widget）；`setBaseUrl` 退回转发 ⇒ **恰好 1 红**；设置页入口整个撤掉 ⇒ **恰好 3 红**（2 条新 + 既有那条「卡片有几个输入框」）。
⑧ **⚠️ 还欠的**：**真机未验**（本轮全在单测/静态层 —— 「外部端脑 + 只认一把钥匙」这条形态**还没在真机上跑过**）；**桌面端那 4 处读面裸 fetch**（`TelencephalonStatusPage.tsx:49,68` / `telencephalonClient.ts` 的 `health()` / `ModelsPage.ts:252`）仍只递 admin ⇒ ⇒ 与列表/探针矛盾 ⇒ ⇒ **本轮未动**（那些文件被别的会话在飞）。
**Updated:** 2026-11-01 (㋄ **「用户喊停」必须赢 —— 移动端那条规则只挂了一半 ⇒ 用户点了「停止大脑」，大脑会自己回来** —— 父仓 `shadow/AGENTS.md` ㋟ 条记**整片**（含真机 401 失败态的证明），本条记**移动端这一侧**的形状与坑。)
① **⚠️ 病（这条规则只挂了一半）**：「用户主动停过大脑」这个标记（`_stoppedByUser`）**只有就绪门（`waitUntilReady`）在守** ⇒ ⇒ 而自动启动那条路（`ensureStarted` → `_startWithRetry`）**自己不守** ⇒ ⇒ **两个入口、两套语义** ⇒ ⇒ 用户刚停掉的大脑会被偷偷拉回来 ⇒ ⇒ 界面只写「已停止」，**没人会发现** ⇒ ⇒ 「用户明确说的话」被系统悄悄推翻。
② **⚠️⚠️ 同族的一条：启动**途中**用户喊停** —— native 那次 boot 可能**已经在跑**了（冷启动要十几秒：抽 Flutter 资源 + 加载 150MB 的 `.so` + boot 端脑面）⇒ ⇒ 这时「停」必须赢 ⇒ ⇒ **刚起来的脑必须被关掉** ⇒ ⇒ 否则界面说「已停止」而大脑其实在跑 ⇒ ⇒ **「失败长得像成功」**。
③ **✅ 修（两处守卫，一条规则）**：`encephalon_mobile_provider.dart` —— ① `_startWithRetry` **顶部**（「用户停过 ⇒ 这一轮别开始」⇒ **自动入口与重试链都归它管**）；② native `start` **返回之后**（「启动途中喊停 ⇒ 关掉刚起来的脑」+ 复原端脑面 + 状态回 stopped）。
④ **⚠️ 一条刻意的取舍（反向验证逼出来的）**：第一版还在 `ensureStarted` 入口与退避前各加了一道守卫 ⇒ ⇒ **反向验证时发现那两道观测不到**（重试链顶部已经拦住了 ⇒ 拆掉它们，测试照样全绿）⇒ ⇒ 留着就是两条**恒绿的分支** ⇒ ⇒ **删掉** ⇒ ⇒ 「一条规则、一处实现」。⚠️ **教训**：守卫放在哪里，得靠「拆掉它 ⇒ 哪几条红」来定，**不是**靠「多写几道更保险」。
⑤ **⚠️ 一条被改掉的既有测试**：原来那条「stop 之后可以再拉起来」走的是 `ensureStarted`（**自动入口**）⇒ ⇒ 它**编码的正是那个不一致**（同一个文件里，另一条测试却断言「用户停掉之后门不会偷偷拉回来」）⇒ ⇒ 改成走 `start()`（= 用户点「启动大脑」）⇒ ⇒ **恢复入口仍然是用户的**。
⑥ **✅ 证据 + 反向验证**：provider 单测 **14 ⇒ 18 passed**（新增 4 条）；全量 **441 ⇒ 445 passed / 0 failed**；`flutter analyze`（两个文件）**零 issue**；⚠️ 反向验证：拆掉「重试链顶部」⇒ **恰好 2 红**（自动入口 + 重试链那两条）、拆掉「启动途中喊停」⇒ **恰好 1 红**，其余纹丝不动 ⇒ ⇒ 断言钉在真东西上、不是恒绿。
⑦ **⚠️ 真机那一截仍欠**：设备上那份 `.so` 是**陈旧**的（`nativeStart` 一直回 **-1**；那个 `-1` 的真凶**已由端脑仓定位并修好、但还没入库** ⇒ 设备要重编 `.so` + 重打 APK）⇒ ⇒ ⇒ **「停脑即停」的真机复验还欠着**；⚠️ 本轮真机已验成的是**失败态**：端脑回 401 时 App 如实显示「❌ 错误：HTTP 401 Unauthorized」（红像素 **0 → 3857**），脚本 `shadow/scripts/prove-a2ui-failure-on-device.ps1` **6 条机器可判全过**。
⑧ **⚠️ 外科式暂存**：provider 那个文件混着别的会话在飞改动（TTS 端口钩子 + 格式化）⇒ ⇒ **只把自己的两处守卫写进索引** ⇒ ⇒ 工作树里对方的改动原封不动（`git diff --stat` 仍是 19 增 13 删）。
**Updated:** 2026-11-01 (㋝ **移动端「多会话」真的能用了 —— 而本片先修掉的，是**它自己造的病**：会话列表「读不到」被画成「暂无会话」⇒ 失败长得像成功；顺带把「整个 client 都 mock 掉」这个测法，换成「真 client + 真传输层 + 逐字照抄服务端 serde 形状的 JSON」** —— 本条记**移动端这一侧**；父仓 `shadow/AGENTS.md` 此刻**被别人改着** ⇒ 按纪律**不碰** ⇒ 等它干净再补那一半。
① **⚠️ 病（先修它，因为它让整条功能在真机上不可信）**：会话列表页 `ConversationsState.error` **存了却从不显示** ⇒ `body` 只分「加载中 / 空 / 列表」⇒ ⇒ **读失败落进「空」那一支** ⇒ ⇒ 界面写「暂无会话」⇒ ⇒ **失败长得像成功**。⚠️ 而端脑面是 **shadow ∪ admin 的读门** ⇒ 「没带钥匙」「端脑没起来」全都走这条路 ⇒ ⇒ 不是假想。⇒ 同族的坑：A2UI 那面「空 surface / 纯文本 / 失败」曾经也被并成两种（`a2ui_answer_state.dart`）—— **同一个病，两处**。
② **✅ 修**：`conversation_screen.dart` 的 `body` 改成**四档**（加载 / **失败** / 真·空 / 列表）；失败档说**真因**（端脑回的状态码 + 正文）并给一个「刷新」重试按钮 ⇒ ⇒ **不新增任何 i18n key**（复用 `errorGeneric(detail)` + `commonRefresh`）⇒ ⇒ 也不去碰那两个 arb 文件（此刻别的会话可能正在改它们）。
③ **⚠️⚠️ 顺带逮到一件更有意思的事：既有测试为什么是绿的**：`test/widget/conversation_screen_test.dart` 里那两条（「has refresh button」「shows empty state when no conversations」）**没有覆盖 client** ⇒ 真 client 去打 `127.0.0.1:60080` ⇒ 本机没人监听 ⇒ **连接被拒** ⇒ 旧 UI 把失败画成空 ⇒ ⇒ **它以为在测「空列表」，其实测的是「失败」** ⇒ ⇒ 修好之后这两条当场变红 ⇒ ⇒ **红的不是我的修复，是它们钉着的缺陷** ⇒ ⇒ 已改成显式给一份响应（`MockClient` 回 `[]` / 回 401），并补一条「读不到 ⇒ 不是空态」。
④ **✅ 测法升级（本片最要紧的一条纪律）**：上一轮那份多会话测试**整个 mock 掉了 `TelencephalonClient`** ⇒ ⇒ 测的是「**我们以为服务端长什么样**」⇒ ⇒ **端点不存在 / JSON 形状对不上 / 钥匙没带 ⇒ 全都测不出来** ⇒ ⇒ 失败长得像成功。新 `test/widget/mobile_conversation_contract_test.dart`（**10 条**）改成：**真 client** + 只替换**传输层**（`package:http` 的 `MockClient`）+ **逐字照抄 Rust 那边的 serde 形状**（`ConversationView` / `ConversationTurn`）：`role` 是**小写** `user`/`agent`（不是 `assistant`）、时间是 chrono 的 RFC3339 ⇒ **可能带 9 位纳秒** ⇒ ⇒ 请求路径、请求头（`X-Shadow-Key`）、JSON 解析、错误映射**全是生产代码在跑**。⇒ ⇒ 这份文件把多会话的**三条路**都走了一遍：列表 / **切会话**（GET 那条会话 ⇒ 历史装进来 ⇒ 下一条消息**续在它上面**、不新建）/ **新开会话**（POST 建会话 + 人设随会话带过去）/ **路由级**（带 `sessionId` 导航 ⇒ 真 client 真的去拉那条会话）。
⑤ **⚠️ 一条差点踩空的（先验了才对）**：Dart 的 `DateTime.parse` 吃得下 **9 位**小数吗？—— 实测**吃得下**（截到微秒，不抛）⇒ ⇒ **不是病**（没验就改 = 改了个不存在的问题）。⚠️ 桌面端是 JS 的 `new Date()` ⇒ 本来就几位都行 ⇒ ⇒ 两端在「时间精度」上**本来就不对称**（JS 截毫秒 / Dart 截微秒）⇒ 记下来。
⑥ **✅ 证据 + 反向验证**：新文件 **10 条** + 改写后 `conversation_screen_test.dart` **7 条**；全量 **441 passed / 0 failed**（基线 430 + 新 11）；analyze **76 issues（基线持平）**；⚠️ **两组反向验证**：① 把失败档那一支退回缺陷形状 ⇒ ⇒ **恰好 2 条红**（失败态那两条：401 看不见 / 重试按钮不存在），其余 **5 条仍绿**；② 把路由退回「**不读 `state.extra`**」⇒ ⇒ **恰好 1 条红**（路由级那条：`sessionId` 是 null ⇒ 真 client 从没去拉那条会话），其余 **9 条仍绿** ⇒ ⇒ 断言钉在「真的说真话 / 真的切过去了」上、不是恒绿。
⑦ **⚠️ 还欠的**：**真机未验**（小米在 A2UI 那条线手上、三星在编 APK ⇒ 本片**没碰任何设备**）；**端脑没有删会话端点** ⇒ 移动端列表**无删除动作**（桌面端那个垃圾桶也只删本地条目）；**端脑 `Conversation` 没有标题字段** ⇒ 列表标题取叶区名（`agent`）⇒ 「给会话起名」得先动端脑模型；**海马体租户那半**仍属杏仁核那条线；⚠️ 移动端会话**持久化**正被另一条线改（`mobile = […, "hippocampus"]`）⇒ ⇒ 「手机上的会话活不过重启」在**已入库**状态里仍成立，但那条线正在改它 —— **别把那条线的读数当现状**。
**Updated:** 2026-11-01 (㋜ **「App 死在第一次 build」—— 一条**同步**日志桥在 build 期改了 provider ⇒ 整个 App 打断；而 Riverpod 那句错误消息是「假面」** —— 父仓 `shadow/AGENTS.md` 记**整片**，本条记**移动端这一侧**的形状与坑。
① **⚠️ 病（真机读数，不是推测）**：同伴报「设备上那份 App 启动会崩」⇒ 真机复现：**App 死在第一次 build**。栈（logcat 原文）：`#24 ShadowApp.build` → `#22 appRouter`（顶层 `final`，**在 build 里被惰性构造**）→ `#18 RouteConfiguration._onRoutingTableChanged` → `#17 go_router log()` → `#15 Logger._publish` → `#7 wireDartLoggingIntoLogPanel` → `#5 LogService.addLog` → `#0` Riverpod 抛 **"Tried to modify a provider while the widget tree was building."**
② **⚠️ 根因**：`package:logging` 的 `Logger.root.onRecord` 是 **`broadcast(sync: true)`** ⇒ 记录一产生就**当场**回调；而 go_router 在 `new GoRouter` 时打日志 ⇒ ⇒ 回调落在 **build 期** ⇒ 此时改 `logServiceProvider` 的 state ⇒ ⇒ **打断整个 App**。⚠️ 关键机制（`riverpod-2.6.1`）：`StateNotifierProviderElement.create()` 在**创建时**就 `addListener(setState, fireImmediately: true)` ⇒ **只要 provider 被 read 过**，之后任何写入都会走 `_notifyListeners` ⇒ ⇒ **不需要任何 watcher** 就会触发 build 期检查。
③ **⚠️⚠️ 一条「假面」（本条最该记）**：Riverpod 那句 **"Tried to modify a provider while the widget tree was building."** 是把 `markNeedsBuild()` 抛出的**任何**异常都改写出来的**同一句**（连「元素已 dispose」「widget tree was locked」也是这句）⇒ ⇒ **只看消息会判错方向，必须读栈**（同族于「HTTP 状态码 ≠ 路由不存在」）。
④ **✅ 修（两笔：`a975f47` + `759d752`）**：新 `lib/utils/build_phase_guard.dart` 的 `runOutsideBuild()` ⇒ **一律用微任务（`scheduleMicrotask`）推迟**，**不猜**当前是不是 build 期。⚠️ **第一版判据是错的**：用 `schedulerPhase == persistentCallbacks` 判 build 期 ⇒ **真机复验仍炸**（栈里 `#8 runOutsideBuild (build_phase_guard.dart:34)` = **同步那一行** ⇒ 判据放行了那次写入）⇒ **因为 App 死在 warm-up 那次构建上，那一刻的 phase 并不是 `persistentCallbacks`** ⇒ ⇒ Flutter 真正禁止的是「在 `BuildOwner.buildScope` 期间改 provider」（`owner._debugStateLocked`）⇒ 而 `buildScope` 是**同步**的 ⇒ ⇒ **微任务**是唯一不靠猜的推迟方式。
⑤ **✅ 证据 + 双向反向验证**：新 `test/widget/build_phase_guard_test.dart` **3 条**；⚠️ **撤掉防护 ⇒ 恰好 3 条全红**（第一版只有 2 条红 —— 那时第 3 条是**恒绿**）；改成「总是推迟」⇒ 恰好第 3 条红 ⇒ ⇒ 两条断言合起来挡住两个**相反方向**的回归；全量 **426 passed / 0 failed**、analyze **76 issues（基线持平）**、我这批文件**零 issue**；**真机**：干净树 @ `759d752` 编的 APK（sha256 `3963E3F6…`，内含 `libencephalon.so` = `4BE92B94…`，装机后 `adb shell sha256sum` **逐字节对得上**）⇒ 装到小米 2106118C ⇒ 同一条路径 ⇒ **走过 splash**（`[ShadowApp] 租户迁移` 那行 = `runApp` 已建树 ⇒ `routerConfig: appRouter` 已构造）⇒ **零崩溃**；⚠️ 对照：旧构建（`a975f47`，APK `1B42DEB9…`）在**同一个触发点**炸 ⇒ ⇒ **病自己指出病灶**。
⑥ **⚠️ 顺带落地的还有**：移动端日志面板那条线（此前**永远空白**：logcat 路被 MIUI 封锁 ⇒ **删 `LogcatReader.kt`**；Prefrontal SSE 路首帧只读一次端口 ⇒ 改 `listenManual` 跟随；端脑 `/api/telencephalon/logs` 路读写两端都死 ⇒ 换成**进程内桥** `AppLog` + EventChannel 回放）⇒ 面板条目显示**真实 tag**、`connectMnn`/`connectPrefrontal` **幂等**（设置页折叠区每次展开都重建面板 initState ⇒ 不幂等则回放被重复塞入）。
⑦ **⚠️ 一条可复用的排除法**：`StateNotifierProvider` 的 element **创建时**就订阅 notifier ⇒ ⇒ 「这个 provider 有没有 watcher」**不是**触发条件 ⇒ ⇒ 排查 build 期写入时**不要**用「没人用它」来排除嫌疑。
**Updated:** 2026-11-01 (㋃ **「这一轮消费完了」这个信号，被**我自己上一片**拆成了两义 ⇒ 移动端那条偶发红的根因终于钉住 —— 顺带逮到「dispose 之后的迟到失败会炸」的服务缺陷** —— 父仓 `shadow/AGENTS.md` ㋕ 条 ⑬ 记**整片**，本条记**移动端这一侧**的形状与坑。
① **⚠️ 病（一直没人认领的那条红）**：移动端全量测试**偶发一条红**，而且**轮换着**落在 `a2ui_locale_test` / `a2ui_shadow_key_test` 头上（单跑绿、全量不稳定复现）⇒ ⇒ 此前只被记成「与本轮改动零交集、归属 A2UI 那条线」⇒ ⇒ **根因从未被钉住**。
② **⚠️ 真根因（是我自己上一片埋的）**：`e8b6a0f` 让 `sendMessage` 在**发请求之前**把上一轮的 surface 清掉（`_surfaceIds.clear()` + 广播一个**空列表**）⇒ ⇒ `surfaceIdsStream` 多了一种事件：**空列表** ⇒ 而那两条测试拿「**列表变了**」当「响应已被消费完」的信号 ⇒ ⇒ **代理信号变了两义**（空列表 =「这一轮开始了，上一轮清干净了」／非空 =「端脑这次真的画了界面」）⇒ ⇒ 第二轮**提前 dispose** ⇒ transport 的 `http.Client` 当场关掉 ⇒ ⇒ **在飞的响应流报错** ⇒ 变成测试区里的**未处理异常** ⇒ ⇒ 偶发红。⚠️ 与㊻ 条那个老坑**同族**（「在客户端读完 SSE 之前就 dispose ⇒ 多文件并行时偶发失败」）⇒ 当时靠「**等 surface 出现**」绕过去 ⇒ 而「清空上一轮」这个新事件把那条绕法**又拆了**。
③ **⚠️⚠️ 顺带逮到服务的真缺陷（真机上像崩溃）**：`dispose()` 会关掉 `http.Client` ⇒ **在飞的请求当场断** ⇒ 那次失败**在 dispose 之后**才回来 ⇒ ⇒ 它要往**已经关掉**的流里写 ⇒ ⇒ 「**Bad state: Cannot add new events after calling close**」⇒ ⇒ **未处理异常** ⇒ ⇒ 真机上就是「App 崩了」—— 而它崩在一条**已经在收尾**的链路上（用户发完消息后**立刻离开** A2UI 面板）。⚠️ 而四个广播流里**只有 `_reportFailure` 一处**带了 `isClosed` 判断 ⇒ ⇒ **其余三个（surface 列表 / 原话 / 连接状态）同样会炸**。
④ **✅ 修（`ba564e0`）**：① `GenUIAgentService._emit` —— 把「**已关了就当作没这回事**」收成**一条规则、一处实现**，四个广播流统一走它；② 两条同族测试的「消费完了」信号改成「**非空**更新」（空列表只是「这一轮开始了」）。
⑤ **✅ 证据 + 反向验证**：新 `test/widget/a2ui_surface_reset_test.dart` **2 条**（服务端把 SSE **分两半发、中间停 400ms** ⇒ 「提前 dispose」从**竞态**变成**确定** ⇒ 断言钉得住）；⚠️ **反向验证**：退回旧信号 ⇒ **恰好**第 1 条红（「第二轮响应还没发完就 dispose 了」）；去掉关闭守卫 ⇒ **恰好**第 2 条红（报错正是「Cannot add new events after calling close」）⇒ 恢复 ⇒ 全绿；A2UI 组 **15 passed**；全量 **423 passed**（⚠️ 那 3 条红在 `build_phase_guard_test.dart` —— **并行会话在飞的新测试**，不属本线）；analyze **76 issues（基线持平）**。
⑥ **⚠️ 一条可复用的纪律**：**代理信号在「事件集合变大」时会静默变两义** ⇒ ⇒ 「surface 列表变了」原本唯一地表示「端脑画了界面」；加进「空列表」之后它**同时**表示「这一轮开始了」⇒ ⇒ 与「判据要覆盖会增长的集合 ⇒ 别写白名单，反过来写」**同族**：别拿「列表变了」代理「消费完了」，要拿「**非空**更新」。
⑦ **⚠️ 还欠的**：**真机上的「失败」那一档仍未验**（401 / 连不上**难以在真机上触发**）⇒ ⇒ 但**触发它的办法已经找到了**：**停掉内嵌大脑** ⇒ `agentPort` 变 null ⇒ A2UI 地址**退回外部端脑**（设备上没配 ⇒ 默认 `http://127.0.0.1:60080`）⇒ 外部端脑用宿主侧的「有门的端脑」桩（`scripts/a2ui-door-stub.mjs`，**已实测**：无钥匙/错钥匙 ⇒ **401 空体**、对钥匙 ⇒ **200 + SSE**，与 `telencephalon/src/api/shadow_auth.rs` 的 `require_shadow_key` 逐字一致）⇒ ⇒ 真机脚本 `scripts/prove-a2ui-failure-on-device.ps1` **已写好但还没在真机上跑过**（设备被并行会话占用 ⇒ 坐标是**推算**的 ⇒ 第一次跑要先校准）⇒ ⇒ **这一格还欠着，但债已经能还了**；**移动端没有「外部端脑 shadow key」设置入口**（既有缺口 —— 正是它让「外部端脑配了钥匙 ⇒ App 401」成为可能）。
**Updated:** 2026-11-01 (㋂ **「端脑的原话在手机上彻底消失」—— 手机这一侧把三态拆开、并让失败说真实原因** —— 父仓 `shadow/AGENTS.md` ㋕ 条记**整片**，桌面端那一侧见 `shadow-desktop/AGENTS.md` 文末 STATE STATUS 段，本条记**移动端这一侧**的形状与坑。
① **⚠️ 病**：`gen_ui_agent_service.dart` 的 `textResponseStream` 只 `_logger.info` ⇒ ⇒ **端脑的原话只进了日志** ⇒ 用户在手机上**一个字都看不到**；而 `errorStream` 把原因存进 `_lastError` ⇒ **存了但从不显示** ⇒ ⇒ 401 / 网络错在界面上显示成**「未连接到端脑」**（`agent2ui_view.dart` 的 `status == error` 分支走的是 `agent2uiNoConnection`）⇒ ⇒ **失败长得像「没连上」**。
② **✅ 修（两条广播流）**：service 新增 `textReplyStream`（端脑的原话）/ `errorReasonStream`（失败的原因），`sendMessage` 开头把上一轮的结果**清掉**（否则上一轮的话留在界面上 ⇒ 以为这一轮又说了那句）⇒ provider 暴露 `a2uiTextReplyProvider` / `a2uiErrorReasonProvider` ⇒ **新文件** `widgets/chat/agent2ui_answer_state.dart` 住判定 ⇒ 视图空态整块委托给它。
③ **⚠️ 广播流不重放** ⇒ 视图兜底读 `service.lastTextReply` / `service.lastError`（回复先到、provider 后订阅时会漏掉那一句）⇒ ⇒ **service 持有权威值 + 流负责通知**。
④ **⚠️ 判定顺序**：**失败优先于原话**（一次请求可能先吐半句话再失败 ⇒ 那时显示「失败 + 原因」比显示半句话诚实）⇒ 且 `status == error` 却**没拿到原因**时也不许说「还没给出界面」（那把失败说成「没内容」）。
⑤ **⚠️ 没动 arb**：桌面 i18n 与移动 arb 都有并行会话在飞改动 ⇒ **一行都不动** ⇒ 失败态复用**已有**的 `l10n.errorGeneric(detail)`，「没给出界面」沿用**已有**的 `agent2uiNoSurface`；⚠️ 顺带把视图里**硬编码的英文** `'Connection Error'` 换成**已有**的 `l10n.connectionError`。
⑥ **✅ 证据**：新增 `test/widget/a2ui_answer_states_test.dart`（**6 条**：四档 widget 判定 + **起真的本地 HTTP 服务**回放端脑**逐字形状**的纯文本 / 失败事件 ⇒ 断言原话与原因**真的**进了界面能拿到的流）⇒ 全量 **401 ⇒ 407 passed / 0 failed**；`flutter analyze --no-pub` **76 issues（基线持平）**，我改的文件**零 issue**。⚠️ **反向验证**：掐断「原话进流」⇒ **恰好 1 条红**（等待超时 10 秒）；掐断「显示失败原因」⇒ **恰好 1 条红**；其余 5 条纹丝不动。
⑦ **⚠️ 外科式暂存**：`agent2ui_view.dart` 与本文件此刻**混着别的会话的在飞改动**（响应式布局）⇒ 只把自己的那部分写进索引 ⇒ **没替别人提交**。
⑧ **⚠️ 真机那一截还欠**：设备那条会话从 `clean\` 树构建 ⇒ 本片的 Dart 改动**不会**进那个 APK ⇒ **要看到「端脑的原话」上屏必须重打正牌 APK + 安装**。
⑨ **⚠️ 还欠的**：**移动端没有「外部端脑 shadow key」设置入口**；**「空 surface」在手机上没有结构判定**（手机靠 `genui` 目录自己画 ⇒ 客户端**看不到**组件树 ⇒ 只能靠端脑自己的文字分辨）；**协议值仍是英文**。
⑩ **⚠️⚠️ 补记（同日）：「失败说真话」只兑现了一半** —— `errorStream` **只**报 A2A 的**任务状态**失败（`a2ui_agent_connector.dart:164-173`）⇒ ⇒ **HTTP 层**的失败（401 / 404 / 连接被拒）**不会**进那条流 ⇒ ⇒ 唯一的出口是 `sendMessage` 的 `.catchError` ⇒ ⇒ 而它**只打一行 warning** ⇒ ⇒ 界面停在 `connecting` ⇒ ⇒ **失败长得像「还在连」**（**红灯先行**：两条 service 级测试在修复前**都超时** —— 不是推测，是读数）⇒ ✅ **修**：`GenUIAgentService._reportFailure()`（**任何来源**的失败 ⇒ 真实原因 + 状态置 `error`）+ `_describeFailure()`（`A2AHttpException` ⇒ **`HTTP 401`**；⚠️ **状态码是协议值 ⇒ 不翻译**，承 §6.7.6；`A2ANetworkException` ⇒ 网络错误原文）⇒ ⚠️ 异常类型**上游不导出**（`lib/genui_a2ui.dart` 只导出 connector 与 content generator）⇒ 按类型读状态码要走**实现级导入**（同 `shadow_key_sse_transport.dart` 的做法）⇒ 该测试文件 **6 ⇒ 8 passed**；⚠️ **反向验证**：退回「只打日志」⇒ **恰好那 2 条红**、其余 6 条不动。
⑪ **⚠️⚠️ 真机逮到的：端脑回**纯文本**时面板永远转圈 —— 它的原话上不了屏** —— 父仓 `shadow/AGENTS.md` ㋕ 条 ⑫ 记**整片**，本条记**移动端这一侧**的形状与坑。① **⚠️ 病（真机读数，不是推测）**：状态栏已是绿色的「已连接到 Shadow A2A 服务器」（⇒ 端脑**确实回话了**），可内容区**只有一个永远转圈的圈** ⇒ ⇒ 端脑那句纯文本**一个字都没显示**；② **⚠️ 根因**：`surfaceIdsProvider` 订阅的 `surfaceIdsStream` 是**广播流** ⇒ 只在**有 surface 增删**时才发事件 ⇒ 而端脑**回纯文本**（它不画界面，只是说话）时**一个 surface 都不会有** ⇒ ⇒ provider **永远停在 `loading`** ⇒ ⇒ 视图那条 `loading:` 分支只剩一个圈 ⇒ ⇒ 答案块**永远轮不到渲染**；③ **⚠️ 为什么会漏**：㋂ 条的 widget 测试只测了 `Agent2UIAnswerState` **那个零件** ⇒ **从没走过「provider → 视图」那条真路** ⇒ ⇒ **「零件对了」≠「这条路通了」**；④ ✅ **修（两处）**：`surfaceIdsProvider` **先给一次「现在的列表」**（还没画界面时就是空）⇒ 立刻进 `data` ⇒ 答案块渲染 ⇒ 原话上屏 ＋ `sendMessage` **把上一轮的 surface 一起清掉**（**一次请求 = 一次回答** ⇒ 否则原话又被上一轮的界面盖住 ⇒ 同一个病）；⑤ **✅ 证据**：新增两条**视图级**测试（**只覆盖 service、绝不覆盖 `surfaceIdsProvider`** ⇒ 覆盖掉它就等于把 bug 盖起来）⇒ 该文件 **8 ⇒ 10 passed**；⚠️ **反向验证**（两处修复退回修复前的形状）⇒ **恰好那 2 条红**、其余 8 条不动；**真机**：新脚本 `scripts/prove-a2ui-text-reply-on-device.ps1` ⇒ **8 条机器可判全过**（含**修复前 / 修复后**两张截图）；⑥ **⚠️ 三条只有真机才知道的坑**：**(a)** Flutter 语义树**默认不暴露给 `uiautomator`** ⇒ dump 是**全空**的树 ⇒ 判「屏幕上有没有那句话」**一定判不出** ⇒ 改判**像素**；**(b)** 输入框 **y=2050** 才能聚焦（2076 / 2136 点了输入法**不弹**）且**发送键位置是「键盘弹起之后」的**；**(c)** **设备是共享的** ⇒ 别的会话同时驱动 ⇒ 截图会拍到**别的页面** ⇒ 每步都要**重新起 App + 截图核对**；⑦ **⚠️ 还欠的**：**真机上的「失败」那一档仍未验**（401 / 连不上**难以在真机上触发** ⇒ 只有 widget / service 级证据）。
**Updated:** 2026-11-01 (㋁ **界面文案随用户的语言走 —— 手机这一侧把「用户现在用什么语言」报给端脑** —— 父仓 `shadow/AGENTS.md` ㋐ 条记**整片**与两端那一侧，端脑那一侧见 `telencephalon/AGENTS.md` ㉟ 条，桌面端那一侧见 `shadow-desktop/AGENTS.md` 文末 STATE STATUS 段，本条记**移动端这一侧**的形状与坑。① **⚠️ 问题**：端脑画的界面**说的却是英文**（`Tasks (1)` / `not probed`）⇒ 手机 UI 是中文、界面是英文 ⇒ **中英混排**。② **✅ 机制**：`ShadowKeySseTransport.sendStream` 里加 `Accept-Language` 头 ⇒ 端脑据此产出中文界面（真相源在服务端：`telencephalon/src/a2a/a2ui_i18n.rs`）⇒ **客户端只负责报出「我要哪种语言」**。③ **⚠️ 和那把钥匙同一个套路：请求时现读** —— 传的是**回调** `String? Function()? localeProvider`（不是值）⇒ 构造时取值 ⇒ 用户换语言后界面停在旧语言；⚠️ 端脑那一侧按 `q` 解析（`zh-CN` → 中文、`en` → 英文、**不认识的一律英文**）。④ **⚠️ 语言从哪来**：App 的语言 = **系统语言** —— `main.dart` 用 `AppLocalizations.supportedLocales`（en / zh）+ `basicLocaleListResolution` ⇒ **没有 App 内语言开关** ⇒ `PlatformDispatcher.instance.locale.languageCode` 就是真相；⚠️ 选它而不是 `WidgetsBinding.instance` 是为了**不依赖 binding 初始化**（provider 里随时可读、测试里也不会炸）。⑤ **✅ 证据**：新增 `test/widget/a2ui_locale_test.dart`（**起真的本地 HTTP 服务**、回放端脑**真实** SSE 字节 ⇒ 断言请求头里的 `accept-language`，且**两次请求分别是 en / zh** ⇒ 证明「请求时现读」；⚠️ **回放真实字节 + 用「surface 出现」当消费完成信号**才不踩「dispose 时还在飞的流」那个老坑）⇒ 全量 **390 passed / 0 failed**；`flutter analyze --no-pub` **76 issues（基线持平）**，我改的 4 个文件**零 issue**。⑥ **✅ 真机那一截已验（2026-11-01 晚，证据见 ㋧ 条）**：当时的读数是「设备 `ee6b4832` 上那份 APK 与内嵌端脑**都是旧的** ⇒ **手机上还看不到中文界面** ⇒ **真机未验**」⇒ ⇒ **那条已被推翻** —— `.so` 重编（中文字面量在二进制里）＋ APK 重打并装上之后 ⇒ ⇒ 屏幕上**就是中文**（`任务（1）`）⇒ ⇒ 前提补齐后这一格才可验。⑦ **⚠️ 还欠的**：**移动端没有「外部端脑 shadow key」的设置入口**（既有缺口）；**协议值仍是英文**（`HIGH` / `in_progress` ⇒ 那是 A2UI 目录里的枚举，翻了客户端就解析不出来）。

**Updated:** 2026-11-01 (㋀ **A2UI 在真机上第一次真的画出了界面 —— 顺带修掉一个「失败长得像成功」：手机上「从没被探活过」的叶区本来是一片绿灯** —— 父仓 `shadow/AGENTS.md` ㋊ 条记**整条真机链路**与两端那一侧，端脑那一侧见 `telencephalon/AGENTS.md` ㉝ 条，本条记**移动端这一侧**的形状与坑。① **✅ 真机第一次**（设备 `ee6b4832` / 小米 2106118C / Android 13，装的是 `com.ibloc.shadow`，`lastUpdateTime = 2026-11-01 00:06:35` ⇒ **晚于** A2UI 那笔 Dart 提交 `6462ede`（23:49:36）⇒ 装上去的那份**含** A2UI 客户端）：点开对话页 AppBar 上的**「组件」按钮**（`Icons.widgets_outlined`）⇒ 状态栏变成**「已连接到 Shadow A2A 服务器」** ⇒ 输入 `a2ui:tasks` ⇒ 屏幕上真的出现 **`Tasks (1)`** + 任务卡（`A2UI-device-proof-…` + 描述 + **`HIGH`** 徽标）⇒ ⇒ ⚠️ **这才是「手机真的把界面画出来」的证据** —— 之前移动端的 A2UI 测试**全是喂录下来的字节**（`test/widget/a2ui_*_test.dart`）⇒ 录下来的字节**证明不了**真机上多出的三件事：**地址**（端脑面端口每次启动随机分配）、**钥匙**（`X-Shadow-Key`）、**真机渲染**。② **✅ 复跑脚本 `shadow/scripts/prove-a2ui-on-device.ps1`** —— **7 条机器可判**（无钥匙 ⇒ 401 / 对钥匙 ⇒ 200 + SSE / 载荷里有 `surfaceUpdate` / `beginRendering` / `shadow.tasks` / **本次运行独有那条任务的标题**）⇒ ⇒ ⚠️ **它凭什么能拿到钥匙**：`com.ibloc.shadow` 是 **debuggable** 的 ⇒ `adb shell run-as com.ibloc.shadow cat files/shadow.key` 可读（43 字符）⇒ ⇒ **钥匙只进 HTTP 头，绝不打印**。③ **⚠️⚠️ 顺带逮到「失败长得像成功」的第二处复发（本条最该记）**：真机截图上 `Agents (4)` 那四行是**绿点** —— 而那四条是端脑**自己种下**的**占位**叶区 ⇒ **从来没被联系过** ⇒ 端脑在**另一张面**说的是 `"health_status":"unknown"` ⇒ ⇒ **两张面互相矛盾** ⇒ ⇒ **根因在客户端这一侧**：目录里的 `switch` **没有 `unknown` 这一档** ⇒ 端脑发的 `unknown` 落进 `default` ⇒ 而 `default` 是**绿色** ⇒ ⇒ **「失败长得像成功」**；⚠️ **而且手机上这一格尤其糟** —— `AgentStatusIndicator` 在手机上**只显示颜色、不显示 status 文本** ⇒ **颜色就是全部的话** ⇒ 落绿 = 撒谎。④ **✅ 修（三处）**（`lib/services/genui/shadow_catalog.dart`）：**(a)** 加 `unknown` 档（灰 + `Icons.help_outline`）⇒ **「我们不知道」不是「没事」**；**(b)** ⚠️ **`default` 也落灰** —— 端脑哪天**多说一个词**（客户端还不认识）⇒ 旧代码照样画成绿灯 ⇒ ⇒ **兜底不许落回 `idle`**；**(c)** ⚠️ **缺 `status` 声明 ⇒ 缺省落 `unknown`**（不落 `idle`）—— 「没说」和「没事」是两件事。⑤ **✅ 测试 + 反向验证**：`test/widget/a2ui_agent_status_honesty_test.dart`（**断言颜色**，因为手机只显示颜色）⇒ ⚠️ **反向验证**：把 `default` 改回绿色 ⇒ **红**；把缺省改回 `idle` ⇒ **红**（line 130）⇒ ⇒ **有分辨力，不是恒绿**；⇒ 全量 `flutter test --concurrency=1` ⇒ **389 passed / 0 failed**。⑥ **⚠️ 真机才暴露的两个坑**（**「跑通了」不等于「脚本能复跑」**）：**(a)** App 已经在跑时 `am start` **不会重启它** ⇒ 没有新的「Encephalon started」那行 ⇒ 而 logcat 又被 `-c` 清过 ⇒ **端口永远读不到** ⇒ 脚本第一版卡死 ⇒ **必须先 `am force-stop`**；**(b)** `adb shell input tap` 要 **x y 两个坐标** ⇒ 写成单值 ⇒ 设备回 `IllegalArgumentException: Argument expected after "480"`。⑦ **⚠️ 还欠的**：服务端产的**界面文案仍是英文**（`Tasks (1)` / `HIGH`）⇒ 手机上是中英混排；「空 / 失败」三态仍并成两种；**移动端没有「外部端脑 shadow key」的设置入口**（既有缺口）。

**Updated:** 2026-10-31 (㊿ **「记忆面」与「端脑面」本来就该指**不同的端脑** —— 而今天它们连「谁说了算」都没定：配的地址重启后没人应用、设置页显示的是**被内嵌大脑接管的那个**、内嵌大脑一放手又被拽回「没配过的默认地址」；本轮把「记忆面指向**带海马体的那台端脑**」做成了产品事实（真机已验）** —— 承 ㊾ 条（admin 面）与 ㊸ 条（管理中枢那个会撒谎的 0），本轮记**两张面的分工**、**三个同族坑**、**所有权模型**与**真机取证**。① **⚠️ 先把「两张面」说清楚（这是这一轮最重要的判定）**：端脑面（聊天 / 身份 / agent 管理）走 `TelencephalonClient` ⇒ 内嵌大脑启动时把它指向**本机** `127.0.0.1:<agentPort>`（`EncephalonMobileNotifier._pointClientsAtAgentSurface`）⇒ 手机上的端脑面 = **本机内嵌那台**；记忆面（记忆 / 人格）走 `PrefrontalClient` ⇒ 打的路径是 `/hippocampus/api/*` ⇒ ⇒ **内嵌端脑不带海马体**（mobile profile 压根不编它 ⇒ 设备上实测 `/hippocampus/api/tasks` = **404**）⇒ ⇒ 记忆面**必须**打**另一台** —— 带海马体的那台（= 桌面 Tauri sidecar：`telencephalon::api::build_full_app` ⇒ `outer.nest("/hippocampus", h)` ⇒ 监听 `127.0.0.1:60080`，见 `shadow-desktop/src-tauri/src/cortex_http.rs`）⇒ ⇒ **两张面本来就该指不同的端脑**，而「记忆面跟着端脑 client 的实际地址走」是**错的**（会打到一台没有海马体的端脑 ⇒ 记忆页永远是空的）。⚠️ 而「海马体那张面**不在 shadow key 门后面**」—— 判据（2026-10-31 复核 `telencephalon/src/api/mod.rs`）：`/hippocampus` 是 `build_full_app` 里**外层** `nest` 的（与端脑 router **并列** merge），而影子锁那道门在 `shadow::router_with_store` **内部**（按路由挂）⇒ ⇒ 记忆面**不需要钥匙**就能通 ⇒ ⇒ 配了远端地址就**真的**能读到远端的记忆。⚠️ 别和 `hippocampus_public::router`（`/api/telencephalon/hippocampus/*`）混 —— 那是**另一组**路由，形状不同。② **⚠️ 坑一：「配置」在重启后没人应用**：`TelencephalonNotifier` 的初始 state 地址写死 `http://127.0.0.1:60080`，而设置页只在**用户改动那一刻**调 `setBaseUrl` ⇒ 而配置是**持久化**的 ⇒ ⇒ 「配了、存了、界面里还显示着，**重启后却不生效**」⇒ 现在**构造时**就从 `AppConfigService` 取，并**真正应用**给 client（地址 + admin token）。③ **⚠️ 坑二：设置页显示/保存的是「被接管的 client」** ⇒ 用户配的远端在界面上「消失」⇒ 而他**一点 Save** 就把**内嵌那台的地址 + 内嵌那把 admin token** 写进持久化配置 ⇒ ⇒ 用户配的远端**被覆盖**（失败长得像成功）⇒ 现在显示/保存一律用**配置值**（`AppConfigService`），**不读 client**。④ **⚠️ 坑三：内嵌大脑一放手，client 被拽回「没配过的默认地址」**（`TelencephalonClient.defaultBaseUrl`）⇒ ⇒ 配了远端也白配 ⇒ 现在复原到**配置里那个**。⑤ **✅ 新的不变量：「同一时刻只有一个主人」**（都在 `TelencephalonNotifier`）：`takeOverByAgentSurface()` / `releaseAgentSurface()` / `setConfiguredEndpoint()` 三个入口 ⇒ 内嵌大脑在跑 ⇒ 端脑面归**它**（此时改配置**不动** client ⇒ 聊天面不会被一条远端地址拽走）；没跑 ⇒ 端脑面归**配置**；而**记忆面永远**归配置（跟 state 走）⇒ ⇒ 「两张面各归各位」在代码里有了一个**可断言**的形状。⑥ **⚠️ 共享实例**：`prefrontalClientProvider` 返回**共享那个** `PrefrontalClient`（`sharedPrefrontalClient`）⇒ 换地址走 `setBaseUrl` **不换实例** ⇒ ⇒ 换实例会把**租户**重置回 `default` ⇒ 记忆页读到**另一个桶**（失败长得像成功）。⑦ **✅ 真机取证（设备 `ee6b4832`，小米 2106118C / Android 13）**：主机起一台**假海马体面**（只监听回环，形状与海马体一致：`GET /hippocampus/api/memory` 回**数组**、`POST /hippocampus/api/search` 回 `[{memory,score}]`）+ `adb reverse tcp:60099 tcp:60099`（**走隧道 ⇒ 不碰 Windows 防火墙**）+ 把 `app_flutter/app_config.json` 的 `telencephalonBaseUrl` 设成 `http://127.0.0.1:60099` ⇒ ⇒ **记忆页屏幕上出现了 `来自配置那台端脑的记忆-PROBE`**（`Agent / Score: 1.00`），探针日志里 **8 发**请求：`GET /hippocampus/api/memory?tenantId=default`、**`tenantId=persona-1301bc0a58972419`**（= 身份算出的租户 ⇒ 两端同身份 ⇒ 同一份记忆）、`GET /hippocampus/api/tasks`、管理中枢那四张卡（`/api/providers`、`/api/skills`、`/api/agents`、`/api/mcp/servers`）、`POST /hippocampus/api/search` ×2。⚠️ **反向验证（探针必须有分辨力，不能是恒绿）**：把配置里的地址去掉后**重跑同一套操作** ⇒ 探针日志**零请求**（不是「请求了但没数据」）⇒ 记忆页显示 **「暂无记忆」** ⇒ ⇒ 两次读数互为反证。⚠️ 顺带记一条取证纪律：**每轮都要先把探针日志清空再开始** —— 第一轮正控结束后，日志里还挂着一条**上一轮遗留**的 `POST /hippocampus/api/search`（端口号不同）⇒ 若不清空，那一轮的读数就会把上一轮的尾巴当成自己的 ⇒ 「干净读数」不是洁癖，是**判据**。⑧ **⚠️ 两个把测试拖死的形状（值得单独记）**：**(a)** `testWidgets` 的测试体跑在**假时钟**区里 ⇒ `await` 一个**真实文件 I/O**（`File.writeAsString` / `readAsString`）时，续体排在假时钟上 ⇒ 不 pump 就**永远不醒** ⇒ 测试**死等**（**不是报错**，而是挂住）⇒ 而真实 I/O 的**每一步 await 都要一轮**「`tester.runAsync` 让 I/O 落地」＋「`pump` 让续体跑」⇒ ⇒ 一次 `runAsync` 不够，得循环几轮（本次用 8 轮 `settleIo`）。**(b)** `ShadInput` 渲染的是 **`EditableText`**（不是 `TextField`）⇒ 找 `TextField` 会得到「0 个」⇒ 看着像「卡片没渲染出来」。⑨ **验证**：新增 3 个测试文件 **14 条** —— `test/unit/prefrontal_client_endpoint_test.dart` **5 条**（记忆面跟配置走 / 端脑面被接管时记忆面不动 / **换地址租户不丢** / 存储里的 admin token 真的递给 client）、`test/unit/telencephalon_endpoint_ownership_test.dart` **6 条**（所有权模型的每条边界）、`test/widget/backend_settings_card_test.dart` **3 条**（卡片显示**配置值** / Save 落盘且端脑面跟着走 / **Save 不会把内嵌那把 token 写进配置**）⇒ 全量 `flutter test` **388 passed / 0 failed**（上轮 374 ⇒ +14）；`flutter analyze` **0 error**、我这几个文件 **0 issue**；两道产物闸（`scripts/check-jni-surface.mjs` / `scripts/check-apk-surface.mjs`）**通过（0 条提示）**，APK 里那份 `.so` 与 `jniLibs` 那份 **sha256 逐字节一致**（本轮**没动 Rust**，`.so` 未变）。⚠️ **但那份 `.so` 自己并不「等于某个提交」**（2026-11-01 00:4x 追查，跨仓事实）：它是 **00:04:08 从工作树编的** ⇒ 那一版树里**含一份当时未入库的 `src/mcp/transport.rs`**（mtime 23:59:37 早于构建；该文件现已随 `517dded` 入库、内容未变）⇒ ⇒ **除 `src/a2a/a2ui.rs`（构建后又漂）之外，它现在可以在某个提交上复现** ⇒ ⇒ ⇒ **「装上去的 = 提交编出来的」今天仍不成立**（差一个文件）⇒ ⇒ 收口办法是**在干净提交上重编 + 比 sha256**（一致 ⇒ 不用重装；不一致 ⇒ 重装 + 重验）⇒ ⇒ **不要盲重编**：重编会覆盖 `jniLibs` 那份 ⇒ APK 守卫立刻报红 ⇒ 得重打 APK + 重装才能恢复。⚠️ 顺带：**本轮的证据链不依赖 `.so`**（改动全在 Dart）⇒ ⇒ 上面这条**不影响**本轮结论，但**要拿这台设备证明 Rust 侧行为**时必须先把它钉死。⑩ **⚠️ 还欠的**：**远端端脑的 shadow key 没有配置入口**（`AppConfigService` 只有 baseUrl + admin token）⇒ ⇒ 端脑面若要整体指向远端会 401（**记忆面不受影响** —— 它本来就在影子锁门外面）；**桌面 sidecar 只绑 `127.0.0.1`** ⇒ 跨机必须 `adb reverse` 或改绑定；**独立端脑服务器默认绑 `0.0.0.0:60080`**（局域网可达）；**设置页的 URL 字段现在只管「配置」** ⇒ 端脑面的地址仍归内嵌大脑管 ⇒ 要让**聊天面**也走远端是**另一个设计决定**（需要先给远端配 shadow key）。

**Updated:** 2026-10-31 (㊼ **手机上的 admin 面关上了 —— 而 App 自己的 admin 功能**顺带修好**（攻守两端同时对齐）** —— 父仓 `shadow/AGENTS.md` ㊻ 条记**整体结论与那三个更早的洞**，端脑那一侧见 `telencephalon/AGENTS.md` 同日条目，本条记**移动端这一侧**的形状与坑。① **⚠️ 先说清楚「为什么 App 侧必须动」**：端脑这一档把「**没配 admin token ⇒ admin 面关着**」变成了**统一语义**（fail-closed）⇒ ⇒ **App 必须把 token 带上**，否则 **App 自己的** MCP/agent 管理**全部 401**（这正是 ㊶ 条记的那个「攻守两端同时错位」：那时是**攻击者能进、正牌 App 进不去**；现在是**只有正牌 App 能进** ⇒ 攻守两端终于对齐）。② **两把钥匙，两个域**：`shadow.key`（客户端 ↔ 自己端脑的**门闩**）与 `admin.key`（**谁能改这台大脑的配置**的**凭据**）⇒ **一把不能开两扇门**（拿到门闩的人不该顺带就能装 agent）。⚠️ 实现上刻意**共用同一份逻辑**：`HostSecret`（`android/app/src/main/kotlin/com/ibloc/shadow/HostSecret.kt`）负责「读或生成 + 只给本人读写 + base64url 32 字节」，`ShadowKey` 与 `AdminKey` 都**委托**它 ⇒ ⇒ **两把钥匙不可能在实现上分叉**（各写一遍 ⇒ 迟早有一把的权限/格式不一样 ⇒ 而那把弱的就成洞）。③ **⚠️ 顺序铁律（同 shadow key）**：**先设 token，再改地址** —— 端脑是在 `start` 的时候读这个槽位的（Rust 侧）⇒ Kotlin **必须先 `setAdminToken` 再 `start`**；Dart 侧 **必须先 `setAdminToken` 再 `setBaseUrl`** ⇒ 反了就有一个「**指着新地址、却还没带钥匙**」的窗口 ⇒ 那个窗口里的请求会 **401**，而 **401 比 connection refused 难查得多**（前者是「到了但被拒」，后者是「根本没人听」）。④ **⚠️ 钥匙绝不能进日志**：Kotlin 只说「已设」不说是什么；Dart 侧日志也只说「已设/无」（`encephalon_mobile_service.dart`）⇒ 取证脚本同理（只打印长度与前 6 位）。⑤ **⚠️ 一个「为什么会坏」的形状**：`EncephalonRuntime.setAdminToken()` 把 `UnsatisfiedLinkError` **catch 掉并只打一行日志**（与 `setShadowApiKey` 同款）⇒ 旧 `.so`（少这个方法）下**token 送不到端脑** ⇒ 端脑起来、**但没设上 token** ⇒ ⇒ **admin 面仍然是敞开的**（= 今天的行为）⇒ **App 不会把自己锁在外面**（这一点是好的）⇒ 但**上锁会静默失效** ⇒ 装机前必须查那份二进制（父仓 `scripts/check-jni-surface.mjs` 已经在查）。⑥ **验证**：新增设备端 `integration_test/admin_token_test.dart`（**9 条**：读路由 不带 token ⇒ 401 / **空值 token ⇒ 401**（= 手机上前那个绕过）/ 错 token ⇒ 401 / 对 token ⇒ 200 / **shadow key 不能当 admin token 用**（两把钥匙互不相通）/ **写路由（建 agent）** 不带 token ⇒ 401 / 空值 token ⇒ 401 / 错 token ⇒ 401 / 对 token ⇒ 过鉴权（400「name is required」，**故意用空名字 ⇒ 什么都不会被创建**））⇒ ⚠️ 全部走**原始 socket**（`package:http` 可能**丢掉空值头** ⇒ 那样测的就不是「空值头」这条路了 ⇒ 而那正是绕过的形状）。⚠️ 那条「对 token ⇒ 400」的断言是**故意**的：写路由在鉴权**之后**才校验 body ⇒ 用**空名字**能让请求停在校验上 ⇒ **既证明它过了鉴权，又不产生任何副作用**（不往叶区存储/数据库里塞东西）。⇒ **⚠️ 真机复验（设备 `08IHNSXOW9`）⇒ 9/9 全过**（重编 `.so` ⇒ 出厂核验 11 个符号齐 ⇒ 重打 APK ⇒ 装机）；**回归三份旧测试全过**（`shadow_key_test` 5/5、`account_export_test` 1/1、`identity_resolution_test` 2/2）⇒ **无回归**。⇒ 另加一条落盘核对：token 与 shadow key 一样**必须落盘**（`<filesDir>/admin.key`）⇒ 否则重启后端脑与客户端各拿一把 ⇒ admin 面**突然** 401（⇒ 测试里直接读回落盘那份比对）。⑦ **⚠️ `flutter test integration_test` 会卸载 App** ⇒ `files/`（`identity/account.key`、`shadow.key`、**`admin.key`**）一起没 ⇒ **设备人格会变**；要取设备上的东西用 `flutter run --target=integration_test/…`（装完不卸载）。⑧ **⚠️ 还欠的**：**手机上的端脑面其余约 30 张 router 仍然开着**（父仓 ㊻ 条 ⑧ 的清单）；**neuron 面绑 `0.0.0.0`** ⇒ 手机上那台「大脑」的推理入口**同网段可达**（本轮未动）；**手机仍然够不着海马体** ⇒ 「两端读写同一份记忆」在手机上仍只能验到「**租户选对了**」。)

**Updated:** 2026-10-31 (㊻ **A2UI 的请求头是「焊死」的 ⇒ 端脑给 `/a2a` 加上那道门之后，App 必须**自己造**一个 transport 才带得上钥匙；而钥匙又**必须请求时现读**（地址先到、钥匙后到 ⇒ 401 比 connection refused 难查）** —— 父仓 `shadow/AGENTS.md` ㊺ 条 ⑥ 记的是**协作事实**（端脑加门 + 客户端自造 transport），本条记**移动端这一侧**的形状、验证与坑。① **⚠️ 根因**：A2UI 客户端的默认 connector 把请求头**焊死在构造函数里**（`genui_a2ui-0.7.0/lib/src/a2ui_agent_connector.dart:36-40`）⇒ 外面**塞不进去** `X-Shadow-Key` ⇒ 端脑一上锁，App 就 401 ⇒ ⇒ 只能**自造**：`A2uiAgentConnector({required this.url, A2AClient? client})` 与 `A2uiContentGenerator({required Uri serverUrl, A2uiAgentConnector? connector})` 都**接受注入** ⇒ 新文件 `lib/services/genui/shadow_key_sse_transport.dart`（`ShadowKeySseTransport extends SseTransport`）。⚠️ **实现级导入**：`A2AClient`/`SseTransport` **不在** `genui_a2ui` 的公开 API 里（`lib/genui_a2ui.dart` 只导出 connector 与 content generator）⇒ 只能 `package:genui_a2ui/src/a2a/client/…` ⇒ 已 `// ignore_for_file: implementation_imports` 并写明理由。② **⚠️ 自己造 transport 最容易漏的两件事**（都有断言钉着）：**(a)** **`X-A2A-Extensions` 忘了带** ⇒ 服务端认不出这是 A2UI 请求 —— ⚠️ 它**不能**靠 per-call 头补：`A2AClient.messageStream` 只在 `message.extensions != null` 时才加这个头（`a2a_client.dart:191-193`），而 A2UI 的发送路径**不带** extensions ⇒ 只能靠 `authHeaders`；**(b)** **`X-Shadow-Key` 忘了带** ⇒ 真机上是 401，而且**界面上什么都不显示**（`A2uiContentGenerator` 的错误只进 `errorStream`）。③ **⚠️ 钥匙必须「请求时现读」**（不是构造时取值）：真实时序是「**地址先到、钥匙后到**」——嵌入式大脑起来 ⇒ 状态里有了 `agentPort` ⇒ A2UI 地址确定；**之后**宿主才把钥匙交给端脑 client（`EncephalonMobileNotifier._pointClientsAtAgentSurface`）⇒ 构造时取值会造出「**指着新地址、却还没带钥匙**」的窗口 ⇒ 请求 401 ⇒ 而 **401 比 connection refused 难查得多**（前者是「到了但被拒」，后者是「根本没人听」）⇒ ⇒ 传下去的是**回调** `String? Function()? shadowKeyProvider`，发请求那一刻才问「现在的钥匙是几号」。④ **钥匙的真相来源**：`TelencephalonClient.apiKey`（`lib/services/telencephalon/telencephalon_client.dart:674`）—— 端脑 client 自己发 `/shadow/v1/*` 时用的就是同一个值 ⇒ 两边**天然一致**，不会各持一份而漂移。⚠️ 这把钥匙**绝不能进日志**（它不是用户凭证、不出设备；与账号密钥 `identity/account.key` = 身份本身是两回事）。⑤ **验证**：新增 `test/widget/a2ui_shadow_key_test.dart` **1 条**（起**真的本地 HTTP 服务**、回放端脑的**真实 SSE 字节**；断言①第一次请求**没有**这个头 ②第二次**有** ⇒ 证明是**请求时现读** ③`X-A2A-Extensions` 也在）⇒ **全绿**；**反向验证**（把 `X-Shadow-Key` 的注入注释掉）⇒ **恰好 1 条红**（`Expected: 'the-real-key' / Actual: <null>`）⇒ 其余断言仍绿 ⇒ 有分辨力。⚠️ **踩过的坑**：最初用 `data: {}` 当响应、且**在客户端读完 SSE 之前就 `dispose()`** ⇒ 多文件并行时**偶发**失败（症状是 `A2uiContentGenerator.sendRequest` 抛网络异常 —— transport 的 http.Client 一关，还在飞的流就报错 ⇒ 变成测试区里的未处理异常）⇒ 改成**回放端脑的真实 SSE 字节**，并用「**surface 出现**」当「这份响应已被消费完」的信号 ⇒ 消费完才 dispose ⇒ 连跑 3 次稳定。⑦ **⚠️ 顺带记一条协作坑（当场踩到）**：**提交前必须先 `git diff --cached --stat` 核一遍** —— ⇒ **别人已经 `git add` 过、还留在索引里的文件，会跟着你的 `git commit` 一起上车**（本轮就这样：并行会话已暂存的那 5 个 i18n 文件 —— `app_zh.arb` / `app_en.arb` + 三个生成的 `app_localizations*.dart`，内容是 `settingsBackendAdminTokenHint` 的文案修正「留空则使用开发模式」→「留空则用内嵌端脑那把」—— **被我捎带进了 `9d3f0c8` 那个 CI 提交**）⇒ ⇒ **内容自洽、没坏**（arb 与生成物同步），但**挂错了提交信息** ⇒ ⚠️ **已推送 ⇒ 不改历史**（force-push 到 master 会打断并行会话）⇒ 只能**记下来**。⚠️ **教训**：`git commit -F <msg>` 只提交**索引**里的东西 ⇒ ⇒ **在并行会话的仓库里，`git add` 之前先看 `git status`；`git commit` 之前先看 `git diff --cached --stat`** ⇒ 否则你会替别人提交、也会把别人的东西写进自己的提交信息里。⑥ **⚠️ 还欠的**：**真机上没跑过一次 A2UI 会话**（端脑面在手机上是随机端口）—— ⚠️ 但**端脑那一侧已经验到位了**（端脑仓新增的 `a2ui_is_served_on_the_agent_surface_router_with_the_shadow_key` 用的是 **`telencephalon::boot::cortex_router`** ⇒ **就是**嵌入式端脑起的那张 router ⇒ 「那台大脑真的提供 `/a2a`、而且门也在」已在端脑侧被证明）⇒ **还差的是 App 这一侧**（App 真的把界面画出来）；**移动端没有为「外部端脑」配 shadow key 的入口**（切回外部端脑时钥匙被清成 `null` ⇒ 外部端脑自己配了 key 时 A2UI 会 401 —— **属既有缺口**，与本片无关）；**JNI 宿主直测里那段 A2UI 黑盒断言暂时跑不了**（`encephalon` 仓当时处于**并行会话的在飞 WIP** ⇒ 那个 crate 编译不过 ⇒ 与本片无关；断言已写好、`javac` 单独编译已过 ⇒ 等那个仓编得过就能跑）。
**Updated:** 2026-10-31 (㊸ **管理中枢那格「流程数」之前是个**会撒谎的 UI** —— 恒为 0、而且静默；现在它用共享那个端脑 client（带钥匙、指着嵌入式端脑），读不到就显示「未知」** —— 父仓 `shadow/AGENTS.md` ㊸ 条记**判定表步 2** 的整体形状，本条记**移动端这一侧**。① **⚠️ 根因**：`lib/services/prefrontal_client.dart` 的 `HubNotifier` **自己 new 了一个 `TelencephalonClient()`** ⇒ ① **没带 `X-Shadow-Key`**；② **地址指着外部端脑** `http://127.0.0.1:60080` ⇒ **手机上没人监听那个端口**（嵌入式端脑在 App 进程内、端口每次启动都变）⇒ ⇒ 流程数**恒为 0**。⚠️ **它打的是 `GET /api/flows`**（`telencephalon_client.dart:1007`）—— 父仓 ㊷ 条记的 `/api/telencephalon/flows` **是错的**，实为 **flow router** 那 10 条里的一条（`/api/flows/{id}/run` 也在其中）⇒ ⇒ 父仓判定表点名的「最容易被忽略的开门路」，移动端**每天都在用**。② **⚠️ 静默是第二层问题**：那个 0 被 `catch (_) { flowCount = 0; }` 吞掉 ⇒ UI 写着「0 flows」⇒ **失败长得像成功**。⚠️ **开发机与手机两种表现**：开发机 `:60080` 恰好有端脑在跑（实测 `200 []`）⇒ 旧代码**偷偷读开发机的端脑**；手机上则没人听 ⇒ **两种都被说成「0 条流程」**。③ **修法两处**：**(a)** `hubNotifierProvider` **注入共享那个 client**（`ref.watch(telencephalonClientProvider)`）—— 它由 `EncephalonMobileNotifier._pointClientsAtAgentSurface()` 负责**先递钥匙、再改地址** ⇒ 带钥匙 + 地址对 ⇒ **端脑面整体上锁之后这条请求依然通**（App 不会先把自己锁在外面）；**(b)** `HubState` 加 `flowError` ⇒ **读不到**与**是 0** 分开 ⇒ UI 在读不到时显示 `l10n.unknown`（「未知」）而不是数字。⚠️ **没动 l10n 的 arb / 生成文件**（那两个文件别的会话正在改）⇒ 复用**已经存在**的 `unknown` 键。④ **⚠️ 一条值得记住的形状**：`HubNotifier` 的构造参数**本来就有** `telencephalonClient`，但**唯一的生产调用点没传** ⇒ 「参数在、接线没有」的洞，光看签名发现不了 ⇒ 接线要按**调用点**核。⑤ **验证**：新增 `test/unit/hub_flow_count_test.dart` **3 条**（① 走共享那个 client；② 请求**带着 `X-Shadow-Key`**、路径是 `/api/flows`；③ 读不到时**留下原因**）⇒ **全绿**；`flutter analyze --no-pub` ⇒ **我的三个文件零 issue**；**反向验证**（去掉注入 ⇒ 退回旧行为）⇒ **恰好 3 条全红**（`fake.calls == 0` / 路径没打出去 / `flowError` 为 null）⇒ 有分辨力、不是整片红。⚠️ 全套 `flutter test --concurrency=1` **369 passed / 1 failed**，那 1 条是**并发会话在飞的 A2UI SSE 回放测试**（`IOSink encoding is not mutable`）⇒ **与本次改动无关**，且是别人的**未跟踪 WIP 文件** ⇒ 我没动它。⑥ **⚠️ 还欠的**：**端脑面整体上锁（父仓判定表步 3）** 还没做 ⇒ 这一格现在通了，是因为它走的是**带钥匙的共享 client** ⇒ 步 3 落地时它**必须依然通** —— 那正是这条测试存在的意义（防止端脑面一锁，App 先把自己锁在外面）。)
**Updated:** 2026-10-31 (㊹ **新设备接进来了 —— 小米 2106118C / Android 13：装上、起来了、**影子锁与 admin 面都验过**；顺带在这台设备上逮到一个**真产品缺陷**（没有语音识别服务的设备上，唤醒词服务把启动流程炸成「未捕获的异步错误」），并补上一个让**全量单测编译不过**的 i18n 断层** —— 承 ㊸ 条那个「APK 产物级闸门」，本轮拿它守的那份 APK 上了**第二台真机**。① **设备与适配**：新设备 `ee6b4832`（product **odin** / model **2106118C** / 小米 / Android **13** / SDK 33 / 1080×2400 @440dpi / **`arm64-v8a`**，`abilist = arm64-v8a, armeabi-v7a, armeabi`）⇒ 与我们编的那份 `.so` **正好对口** ⇒ Android 13 ≥ minSdk 30 ✔ ⇒ ⇒ **不需要为它重编任何东西**（⚠️ 与上一台 `08IHNSXOW9`（RK3566 / yx15 / Android 11）是**两台不同的机器**）。② **装机**：装的是 ㊸ 条那道闸验过的 `app-debug.apk`（19:05:29：**正牌入口**、11 个 JNI 符号齐、与 `jniLibs` 那份**同一个 sha256** `98a6845d…`）⇒ `adb install -r -t` ⇒ **Success** ⇒ 启动 ⇒ logcat：`✅ Encephalon .so loaded successfully` → `✅ model routing set (147 bytes)` → `✅ shadow key set` → **`✅ admin token set (admin 面将要求 X-Admin-Token)`** → `✅ Encephalon started on port 39283 (agent surface: 38639)` → `[ShadowApp] 租户迁移 → persona-1301bc0a58972419：记忆 0 条、任务 0 条（2 条出错，下次还会再试）` ⇒ ⇒ **端脑起来了、两把钥匙都递进去了** ⇒ ㊸ 条⑥ 那笔「用正牌入口重打 APK」的账**已经还了**（⚠️ 上一台设备上**没有** `admin token set` 这一行 —— 因为那份 `.so` 是旧的、缺 `nativeSetAdminToken` ⇒ ⇒ **这正是「装进去的是不是对的那份二进制」的差别**）。③ **真机实测**：`/shadow/v1/identity` 不带 `X-Shadow-Key` ⇒ **401**／带对 key ⇒ **200**（`principal:952553f0…` / `persona-1301bc0a…` / `device-a202a367…` ⇒ **新设备自己生成了新账号人格**）；**admin 面**：空 `X-Admin-Token` 头 ⇒ **401**／完全不带 ⇒ **401**／错 token ⇒ **401**／**对的 admin token ⇒ 200** ⇒ ⇒ **「空值头就能过」那个洞在这台设备上确实关上了**（父仓 ㊻ 条⑨ 的结论在新设备上复现）；⚠️ **拿 shadow key 当 admin token ⇒ 401** ⇒ **两把钥匙互不相通**（`files/admin.key` 与 `files/shadow.key` 是两个文件、内容不同）；`/hippocampus/api/tasks` 与 `/memory` ⇒ **404** ⇒ **手机上依旧没有海马体**（任务看板/记忆页在手机上必然是空的）；`/proc/net/tcp` ⇒ 端脑面 `0100007F:96EF` = **127.0.0.1:38639**（同网段不可达 ✔）／neuron 面 `00000000:9973` = **0.0.0.0:39283** ⇒ ⚠️ **推理入口同网段可达**（父仓 ㊱ 条那条老账）⇒ ⚠️ **这一条后来在端脑仓修掉了**（`telencephalon` 提交 `4dc2ff8` + 记录 `f22d9c8`：嵌入式 neuron 顺手继承了 neuron **独立服务器**那个 `0.0.0.0` 默认 host ⇒ 改钉回环）⇒ ⇒ **端到端复验**：重编 `.so`（4m36s，出厂核验 11 个符号全在位）→ 重打 APK（正牌入口）→ 装机 → 设备上 `/proc/net/tcp` **三条监听全是 `0100007F`**、`00000000` **消失** ⇒ 且 neuron 面本地 `/v1/models` 与 `/v1/chat/completions` **仍 200** ⇒ ⇒ **洞真关上了、没伤到本机推理通道**（端脑面影子锁 401/200、admin 面 401/200 照旧）。④ **⚠️ 这台设备逮到的真缺陷（已修）**：logcat 里一条 **`E flutter: Unhandled Exception: PlatformException(recognizerNotAvailable, Speech recognition not available on this device)`** ⇒ 栈指向 `WakeWordService.start()` ⇒ ⇒ **根因**：这台设备**没有语音识别服务**（没装 Google 服务的国产 ROM），而 `speech_to_text` 插件的 `SpeechToText.initialize()` **自己不吞**这个异常 ⇒ 一路冒到 `start()` ⇒ 而调用方 `wake_word_provider.dart` 是 **fire-and-forget**（`unawaited(service.start())`）⇒ ⇒ 变成启动流程里的**未捕获异步错误**。⚠️ **讽刺**：作者本来写了优雅降级（`if (!_available) { addError; return false; }`）⇒ 但那条路**只在 initialize 返回 false 时才走得到** ⇒ **恰好在最需要降级的设备上走不到**。⇒ **修法两处**：`wake_word_service.dart` 把 `initialize` 与 `listen` **包进 try/catch**（抛了就当不可用）＋ `wake_word_provider.dart` 的订阅**补 `onError`**（否则服务层 `addError` 出来的错误会原样冒到 zone）。⚠️ 唤醒词只是锦上添花 ⇒ **它不可用时不能炸启动流程**。⑤ **⚠️ 补了单测**（`test/unit/wake_word_service_test.dart`，3 条）：mock `plugin.csdcorp.com/speech_to_text` 通道抛 `PlatformException(code: 'recognizerNotAvailable')` ⇒ 断言 **`start()` 不抛、返回 false、不标记运行中** ＋ **原因要报给订阅者**（⚠️ broadcast controller 是**异步**派发的 ⇒ 断言前要 `await pumpEventQueue()`，否则会误判成「没报错」）＋ **语音服务可用时正常成功**。⚠️ **反向验证**：把修复撤掉 ⇒ **恰好那 2 条**红（都指同一个缺陷：异常逃逸）、**第 3 条仍绿** ⇒ 断言**有分辨力**、不是整片红。⑥ **⚠️ 顺带修了一个让全量单测编译不过的断层**：并行会话给 `agent-surface.json` 加了新 surface（`a2ui` / `identity`）⇒ `gen_nav.mjs` 重生成 `nav.g.dart` ⇒ 它引用 `l10n.surfaceA2ui` / `l10n.surfaceIdentity`；而 `agent2ui_view.dart` 引用 `l10n.agent2uiNoConnection` / `agent2uiWaiting` / `agent2uiNoSurface` / `agent2uiSurfaceHint` ⇒ ⇒ **这 6 个 key 两个 arb 里都没有** ⇒ ⇒ **生成的 `app_localizations*.dart` 里也就没有那 6 个 getter** ⇒ ⇒ **6 个测试文件直接编译不过**（`flutter test` ⇒ `+337 -6`，6 条全是 loading 失败）。⇒ 已把 6 个 key **同时**加进 `app_zh.arb` 与 `app_en.arb` ⇒ `flutter gen-l10n` ⇒ **缺失归零**。⚠️ **教训（比这次修复更值钱）**：**改了 `agent-surface.json` / 新增界面 ⇒ 必须同时补 arb key 并重跑生成器** ⇒ 否则「生成物」会引用**不存在**的 getter ⇒ 而这个断层**只在编译期炸**（`flutter analyze` 报 undefined_getter），**不报在改的那一刻**。⑦ **⚠️ 截图没拿到（诚实记下）**：这台设备上 `screencap` 返回 **0 字节**（当前焦点是 `NotificationShade`／锁屏层 ⇒ 截屏失败）⇒ ⇒ **本轮只有功能证据、没有界面截图**（`dumpsys window` 的 `mFocusedApp` 确实是 `com.ibloc.shadow/.MainActivity`、进程 16513 还在）。
**Updated:** 2026-10-31 (㊸ **「产物级」这个名字之前**名不副实** —— 它查的是 `jniLibs/`，不是**真正装进手机的那份**；补上 APK 这一层之后，当场抓出「APK 是集成测试壳」和「APK 里那份 `.so` 落后于源码」两件真的** —— 承 ㊷ 条那个「白屏 = 装错 APK」的结论，本轮把它**变成一道自动闸门**（而不是靠人记住）。① **⚠️ 名不副实这件事**：上一版 `check-jni-surface.mjs` 的注释写着「**打包进 APK 的那份 `.so`**」，但实现查的是 `jniLibs/` 目录里那份 ⇒ **APK 完全可能是几小时前的旧构建** ⇒ **「装的到底是哪一份」根本没人查** ⇒ ⇒ 「装进去的是不是对的那份二进制」这条铁律**只守了一半**。② **⚠️ 新守卫 `scripts/check-apk-surface.mjs`**（查**真正装进手机**的那份）：**(a)** **入口是不是正牌 App** —— `assets/flutter_assets/kernel_blob.bin` 里若含 `IntegrationTestWidgetsFlutterBinding` / `package:integration_test` ⇒ **集成测试壳** ⇒ 装上去**纯白屏**；**(b)** APK 里**每一份** `libencephalon.so`（逐 ABI）是否含全部 JNI 符号（清单仍取自 Rust 源码，**不是手抄常量**）；**(c)** 该 `.so` 的 **ELF `DT_NEEDED`** 非系统库是否在**同一个 ABI 目录**里（缺 ⇒ `System.loadLibrary` 失败 = 那个 ABI 启动即崩）；**(d)** **APK 里那份 ↔ `jniLibs` 那份逐字节比对**（sha256）⇒ 不一致 ⇒ **你装的是旧 APK**。⚠️ ELF 解析抽成了共享模块 `scripts/lib/jni.mjs`（两个守卫共用同一份实现 ⇒ 不会出现「两个守卫各判各的」）。③ **⚠️ 这道闸当场把三件事分开看清楚了**：**(a)** **当前那份 `app-debug.apk` 是集成测试壳**（`IntegrationTestWidgetsFlutterBinding` PRESENT、`package:shadow_mobile/main.dart` ABSENT）⇒ ⚠️ **但「是测试壳」本身不是缺陷** —— 测试入口**不走 `main.dart`**、直接走 MethodChannel 起端脑 ⇒ ⇒ **在测试驱动下它照样能起端脑、照样能把钥匙递进去** ⇒ ⇒ 父仓 ㊻ 条⑨ 那次真机复验（`admin_token_test.dart` **9/9 全过** ⇒「手机上 admin 面真的关上了」）**成立**，与本条**不矛盾**。真正的缺陷只有一条：**把测试壳当 App 装** ⇒ 手动 `am start` ⇒ 入口在等驱动 ⇒ `main()` 没跑到起端脑 ⇒ **纯白屏**。⇒ ⇒ 所以守卫加了 **`--expect test-shell`** 显式声明用途：默认（当作 App 装）**判它错**；声明成测试壳 ⇒ **放行** ⇒ ⇒ **同一份 APK：默认红、声明后 EXIT=0** ⇒ 判据**可被审**、不假红。**(b)** ⚠️ **二进制那层已经修好了**：`jniLibs/arm64-v8a/libencephalon.so` 在 **18:40:57** 重编过 ⇒ **11 个 JNI 符号全部在位**（含 `nativeSetAdminToken`）⇒ `check-jni-surface.mjs` **转绿**；APK 里那份与 `jniLibs` 那份**同一个 sha256（`98a6845d…`）** ⇒ ⇒ **「重编 `.so`」与「重打 APK」是两件事**：前者修好了符号与 admin token，**后者仍带着测试壳入口** ⇒ ⇒ **闸门只红在入口这一项**，这恰好把「**白屏**」与「**二进制过期**」两个原因**彻底分开了** ⇒ 以前它们会互相顶包（看到白屏就以为 `.so` 也没更新）。**(c)** ⚠️ **顺带发现设备上的 App 已被卸载**（`pm list packages` 里没有 `com.ibloc.shadow`、`pidof` 为空）⇒ 是**集成测试跑完**把它卸掉的 ⇒ ⇒ **App 装了 → 集成测试跑一次 → App 没了（连 `files/identity/`、`files/shadow.key` 一起）** ⇒ ⇒ **凡是要在真机上复验「跨设备同一个人」这类东西，绝不能和集成测试交替跑** ⇒ 一律用 `flutter run --target=integration_test/…`（装完不卸载）。④ **⚠️ 反向验证（证明它有分辨力、不是恒红）**：`scripts/make-fake-apk.mjs` 造两份**只差入口标记**的对照包（里面的 `.so` 是**同一份真二进制**）⇒ 第 1 项**一绿一红**（✓ 正牌 / ✗ 测试壳）⇒ **有分辨力**；而第 2 项在**两份上都红** ⇒ 那是与入口无关的**真缺口**，**不是假绿**。⑤ **⚠️ 顺带记一条设备端事实**：本轮再查时，**设备上的 App 已经被卸载了**（`pm list packages` 里没有 `com.ibloc.shadow`、`pidof` 为空）⇒ **是并行会话跑 `flutter test integration_test` 干的**（父仓 ㊴ 条⑧ 记的那条坑**真实发生了**）⇒ ⇒ **设备的人格/身份文件又换了一批**（`files/identity/`、`files/shadow.key` 一起没）⇒ ⇒ **在真机上做「跨设备同一个人」这类复验时，绝不能和集成测试交替跑** ⇒ 要取设备上的东西一律用 `flutter run --target=integration_test/…`（装完不卸载）。⑥ **⚠️ 还欠的**：**只有当要把这份 APK「当 App 装给用户/手动启动」时**，才需要用正牌入口重打一遍 ⇒ `flutter build apk --debug --target=lib/main.dart`（或 `flutter run`）⇒ ⇒ **若只是跑集成测试 ⇒ `--expect test-shell` 即可，不必重打**（父仓 ㊻ 条⑨ 那次就是这么跑的）。⚠️ **二进制已经不用再动了**（18:40:57 那份就是对的）。⚠️ 顺带记一条给下一个人：**重编 `.so` 会临时改 `Cargo.toml`** ⇒ **别在别人有在飞改动时跑 `build-android.ps1`**（脚本备份后再还原 ⇒ 会把别人的改动覆盖掉）——本轮就因为这个**没去抢那次重编**。
**Updated:** 2026-10-31 (㊷ **「白屏」的根因查实了 —— 不是 App 的 bug，是**装错了 APK**（装的是**集成测试壳**）；顺手把 JNI 守卫的 **ABI 覆盖缺口**补上，当场抓到一份**装着就崩**的 x86_64 半成品 ABI，和一份**落后于源码**的 arm64 `.so`** —— 承 ㊶ 条那个「正常启动 App 是白屏」的记录，本轮把它查到底，并补上一道**之前没人守**的缺口。① **⚠️ 白屏根因（查实，不是推断）**：装上那份 APK ⇒ `am start` 后进程在、Flutter 引擎在、Dart VM service 在 44851，但**只有那一个监听端口**（不是端脑）⇒ 端脑压根没起来；截图**纯白**（只有系统栏）；logcat 里 `FlutterRenderer: Width is zero. 0,0`，且**一条 `EncephalonRuntime` / `[ShadowApp]` 日志都没有** ⇒ ⇒ **不是「进程没起来」，是「`main()` 没跑到起端脑那一步」**。⇒ 用 Dart VM service 反查：main isolate 在 `main.dart`、栈为空，`getIsolate` 的扩展列表里**没有 `ext.flutter.inspector`、却有 `ext.flutter.integrationTest`** ⇒ ⇒ **那份 APK 是测试壳**。⇒ **字节核验**（APK 内 `assets/flutter_assets/kernel_blob.bin`）：`integration_test` **PRESENT**、`IntegrationTestWidgetsFlutterBinding` **PRESENT**、**`package:shadow_mobile/main.dart` ABSENT** ⇒ ⇒ **坐实：APK 是用 `--target=integration_test/…` 编的**。② **⚠️ 修法（一行）**：构建/装机必须指定**正牌入口** ⇒ `flutter build apk --debug --target=lib/main.dart`（或直接 `flutter run`，默认就是 `lib/main.dart`）⇒ 重装后**全部正常**：`✅ Encephalon .so loaded successfully` → `✅ model routing set (54 bytes)` → `✅ shadow key set (端脑面将要求 X-Shadow-Key)` → `✅ Encephalon started on port 37241 (agent surface: 36211)` → `[ShadowApp] 租户迁移 → persona-881a2f20cbc9a3b9` ⇒ 截图确认 UI 正常渲染（对话 / 语音对话 / 直播 / 智能客服 + 底部 对话·任务·能力·我）。⇒ ⇒ **「白屏是个既有问题」这个说法不成立**；真正还没解决的是下面 ③ 那两条（**手机没有海马体** / **neuron 面绑 0.0.0.0**）。③ **⚠️ 顺带查实的另一组设备端事实**（设备 `08IHNSXOW9` / RK3566 / Android 11 / arm64-v8a）：`GET /shadow/v1/identity` **不带 `X-Shadow-Key` ⇒ 401**、**带对 key ⇒ 200** ⇒ **影子锁生效**；身份自报 `principal:aaff9a60…` / `persona-881a2f20cbc9a3b9` / `device-4798adb2…` ⇒ **新设备自己生成了新账号/新人格**（不是冒用别人）；`GET /hippocampus/api/tasks` ⇒ **404**、`/hippocampus/api/memory` ⇒ **404** ⇒ **手机上的端脑压根没挂 `/hippocampus`**（mobile profile 不编海马体）⇒ **任务看板/记忆页在手机上必然是空的**；`/proc/net/tcp` 里 `00000000:9179` = **0.0.0.0:37241** ⇒ **neuron 面仍绑 0.0.0.0**（推理入口同网段可达；父仓 ㊱ 条记的洞在这台设备上依然成立）。④ **⚠️ 守卫的缺口补上了**（`scripts/check-jni-surface.mjs`）：之前 `SO_RELPATH` **硬编码 arm64-v8a** ⇒ **别的 ABI 目录里那份 `.so` 无人守** ⇒ 现在改成**逐个 ABI** 查三件事：**(a)** 该 ABI 的 `.so` 是否含全部 JNI 符号（符号清单仍取自 `encephalon/src/mobile/jni.rs`，**不是手抄常量** ⇒ 端脑新增入口时自动跟着变）；**(b)** 该 `.so` 的 **ELF `DT_NEEDED`** 指向的随包库**必须同目录存在**（⇒ 否则 `System.loadLibrary` 直接失败 = 那个 ABI 装上就崩）；**(c)** **各 ABI 的随包库集合必须一致**（少一个就是**半成品 ABI**）。⚠️ 符号扫描改成**只读 `.dynstr`**（不再整份扫 151 MB）⇒ 又快又准。⑤ **⚠️ 一上来就抓到两件真的**：**(a)** `x86_64/libencephalon.so` 是 **10/29 的旧产物**（缺 5 个符号：`nativeExportAccount` / `nativeSetAdminToken` / `nativeSetLlmProvider` / `nativeSetModelRouting` / `nativeSetShadowApiKey`）⇒ 装上去**影子锁会静默失效**；**(b)** 那个目录**只有一片 `.so`**（缺 `libc++_shared.so` ⇒ **`dlopen` 失败 = 装上去直接崩**；也缺 `libMNN*` / `libdiffusion` / `libllm` / `libprefrontal_core_lib`）⇒ ⇒ **x86_64 模拟器从来就不是受支持配置**（仓库只入库存了 arm64 的随包库）⇒ **已把整个 `x86_64/` 目录删掉**（APK 不带它 ⇒ 那个 ABI **装不上**，而不是装了才崩）。⑥ **⚠️ 守卫当场又抓到一条活的**：arm64 那份 `.so` **缺 `nativeSetAdminToken`** ⇒ **Rust 侧（`encephalon/src/mobile/jni.rs`）已经有这个入口、Kotlin 侧已经在调它，而 jniLibs 里那份二进制还没跟上** ⇒ ⇒ **父仓 ㊶ 条那个 admin 面的修法，在这台设备上会静默失效**（Kotlin 侧照旧把 `UnsatisfiedLinkError` catch 掉、只打一行日志）⇒ ⇒ **装之前必须重编**：`encephalon/scripts/build-android.ps1` → 重打 APK ⇒ 再跑 `node scripts/check-jni-surface.mjs` 应当转绿。⚠️ 这正是「逐 ABI 查」的第二个好处：**以前只看 arm64 也一样会红**（同一个符号），但**x86_64 那两条只有逐 ABI 才看得见**。）
**Updated:** 2026-10-31 (㊶ **手机上的 admin 面（装 agent / 改 LLM 上游 / MCP 管理）是**开着的** —— 真机证实：一个**空的** `X-Admin-Token` 头就能过；而**正牌的 App 自己却是 401**（它的 admin 功能在手机上今天就是坏的）** —— 父仓 `shadow/AGENTS.md` ㊵ 条记**决定与结论**，端脑那一侧见 `telencephalon/AGENTS.md` 同日条目。① **⚠️ 真机取证**（设备 `08IHNSXOW9`，端脑面 40579，**原始 socket** 发请求 ⇒ `package:http` 可能丢掉空值头、那样测的就不是这条路了）：**不带任何头 ⇒ 401**／**空 `X-Admin-Token:` 头 ⇒ 200**（`GET /api/telencephalon/admin/agents/installed` **把已装的 agent 列出来了**）／**错的 token ⇒ 401** ⇒ ⇒ **同一台设备上任何别的 App 都能改这台手机的大脑怎么跑**：装 agent、增删启停 MCP、**把 LLM 上游指到别处**。⚠️ **比 shadow key 那个洞更大**：shadow key 护的是「这台机器是谁」，admin 面护的是「**大脑的整个控制面**」。② **⚠️ 讽刺的副作用**：**App 自己也进不去** —— `telencephalon_client.dart` 只有在用户**手动配了** `telencephalonAdminToken` 时才发 `X-Admin-Token`（`app_config_service.dart` 默认 null）⇒ ⇒ **手机上的 MCP/agent 管理功能 today 就是 401**，而攻击者用一个空头就进去了。③ **⚠️ 修法（与 shadow key 同形，三仓原子）**：**宿主生成一把独立的随机 admin token**（**不与 shadow key 共用** —— 两把钥匙两个域）⇒ 新的**纯增量 JNI 入口** ⇒ 端脑用它 ⇒ **同时交给 App 的客户端** ⇒ ⇒ **攻击面关闭，且 App 的 admin 功能顺带被修好**；**桌面端不受影响**（它本来就主动发 `X-Admin-Token`）。④ **⚠️ 顺带记一条设备端事实 —— 这条后来被查实并订正（见上面 ㊷ 条）**：**「正常启动 App 是白屏」** ⇒ ⚠️ **根因不是 App 的 bug，是装错了 APK**：那份 APK 是用 `--target=integration_test/…` 编出来的**集成测试壳**（`kernel_blob.bin` 里 `IntegrationTestWidgetsFlutterBinding` PRESENT、`package:shadow_mobile/main.dart` **ABSENT**）⇒ 入口在等测试驱动 ⇒ 屏就是白的 ⇒ **不是「既有问题」**；**用正牌入口 `lib/main.dart` 重装 ⇒ 一切正常**（UI 渲染 + 端脑起来 + 影子锁生效）。）

**Updated:** 2026-10-31 (㊵ **「端脑面上锁」在真机上差点被一份旧 `.so` 抹掉 —— Kotlin 侧那一环把 `UnsatisfiedLinkError` catch 掉了，于是**静默失效**；现在装机前就能查出「装的是不是对的那份二进制」** —— 父仓 `shadow/AGENTS.md` ㊴ 条记**决定与结论**，这一条记**移动端那一侧**。① **⚠️ 撞出来的事**：跑设备端账号导出测试 `account_export_test.dart` ⇒ **失败**（`Expected: (<401> or <403>)` / `Actual: <200>`）⇒ 端脑面**又是敞开的**（父仓 ㊳ 条刚验过是锁上的）。⇒ 根因是 `android/app/src/main/jniLibs/arm64-v8a/libencephalon.so` 被换成了一份**旧构建**（字节核验：**没有** `nativeSetShadowApiKey`、**没有** `X-Shadow-Key`）。⚠️ **归属**：那份旧 `.so` 是**并行会话故意换进去做反向验证的**（把旧 `.so` 装回去 ⇒ 断言必须变红 ⇒ 证明断言有分辨力）⇒ 11:27 已恢复 ⇒ **撞见失败的那个窗口正好落在那段时间里**；⇒ **但那个坑本身是真的** ⇒ 父仓那几道闸是对的。② **⚠️ 移动端这一侧最要紧的一环**：`EncephalonRuntime.setShadowApiKey()` 把 `UnsatisfiedLinkError` **catch 掉并只打一行日志** ⇒ 旧 `.so`（少这个方法）下**钥匙送不到端脑** ⇒ `MainActivity` 照常 `runtime.start(...)` ⇒ **端脑起来了、但没设上钥匙** ⇒ 端脑面敞开 ⇒ **App 一切正常、零报错**。⚠️ 这就是「**纯增量** JNI 入口（不动 `nativeStart` 的 ABI）」的**代价**：兼容性买到了（不会崩），**上锁却会静默失效**。⇒ 结论：**「端脑面上没上锁」不能靠「我调了 `setShadowApiKey`」来认定**，必须**查那份二进制**。③ **⚠️ `ShadowKey.kt` 的 `RELATIVE_PATH` 必须是 `"shadow.key"`**（与 `files/` 同级、与 `identity/account.key` 同级）—— 我改过一次（原来写的是 `"shadow/shadow.key"`）⇒ 它必须与集成测试 `readShadowKey()` 读的那个路径**逐字一致**，否则上锁在测试里**看不见**（会误判成「端脑面还开着」）。④ **两条设备端测试的分工（两条都得留着）**：`shadow_key_test.dart`（**门本身**，5 条：不带 key ⇒ 401 / 错 key ⇒ 401 / 对 key ⇒ 200 / 不带 key `POST /shadow/v1/identity` ⇒ 401 **且身份一字未变** / App 自己的客户端带 key 能读身份）+ `account_export_test.dart`（**导出 + 顺带验门**）⇒ ⚠️ **后者今天真的抓到了一次回归**（它先撞上「不带 key 应当被拒」那条）⇒ 它的价值不是「验导出」，是**兜底**。⑤ **⚠️ 装机前必查**：**APK 内 `lib/arm64-v8a/libencephalon.so` 的 sha 必须与 jniLibs 那份逐字节相同**（本轮实测 `abbfd1ed…`）—— 否则装上去的是另一份二进制，而 Kotlin **不会报错**。⇒ 产物级守卫已加在父仓 `scripts/check-jni-surface.mjs`（Kotlin ↔ 宿主直测的 Java 替身 ↔ 打包那份 `.so` 的符号核验），接在 `scripts/check-cross-client.mjs` 统一入口下。⑥ **⚠️ `flutter test integration_test` 会卸载 App** ⇒ `files/`（含 `identity/account.key`、`shadow.key`、`device.id`）**全没** ⇒ **设备人格会变**；要取设备上的东西用 `flutter run --target=integration_test/…`（装完不卸载）。⑦ **⚠️ 端口每次启动都变** ⇒ 从 logcat 读 `✅ Encephalon started on port <neuron> (agent surface: <端脑面>)`；`adb forward` 要跟着改，且**遗留项里混着别的服务**（`0xA61D`=42525 那个**不是**端脑面）。⑧ **剩余缺口（下一档）**：**admin 面在手机上也敞开**（`/api/telencephalon/admin/*` 无鉴权）；**neuron 面绑 `0.0.0.0`** ⇒ 同网段可达；**移动端仍然够不着海马体** ⇒ 「两端读写同一份记忆」在手机上目前只能验到「**租户选对了**」。)

**Updated:** 2026-10-31 (㊴ **手机上的端脑面：`/shadow/v1/` 那一扇门终于关上了 —— 宿主生成钥匙，端脑守门、客户端敲门（⚠️ 同一张面上其余 router 仍然开着）** —— 承 ㊲/㊱ 条那个「**手机上的端脑面要加 shadow key**」的欠账，**这一条把它做完了**（**三仓原子**：端脑 `telencephalon` / 大脑 `encephalon` / 移动端本仓）。① **⚠️ 先把「洞」说清楚**：**Android 进程设不了环境变量**（进程环境由 zygote 决定、宿主注入不了）⇒ 手机上的端脑**没有配置文件** ⇒ `telencephalon.shadow.api_key` 取默认 `""` ⇒ `require_shadow_key` **全部放行** ⇒ **同一台设备上任何别的 App 都能打整张 `/shadow/v1/` 面**，包括 **`POST /shadow/v1/identity`**（导入账号 ⇒ **换掉「这台机器是谁」** ⇒ 记忆改写进另一个人格、旧人格的记忆「看起来消失了」、**且不报错**）。⚠️ **这与桌面不一样**：桌面端有配置文件、有 key ⇒ 那张面受保护。⚠️ **这不是本轮引入的**（㊱ 条那会儿手机端脑就长这样），但它**顶着**「知道当前是谁」这件事 ⇒ 该修。② **钥匙归宿主**：新增 `ShadowKey.kt`（32 字节 `SecureRandom` → base64url → 存 `<filesDir>/shadow.key`，**仅本人读写**）—— **同一份**同时给端脑（**守门**）与 App 自己的客户端（**敲门**）。⚠️ **端脑自己拿一半 = 自锁**（App 连不上自己的大脑 ⇒ 身份解析**静默**退回 `default` 桶 ⇒ **不报错**，比敞开更糟）⇒ 这条必须**三仓原子**落地，不能只改一半。③ **⚠️ 顺序铁律**：Kotlin 侧 **先 `setShadowApiKey` 再 `start`**（Rust 侧是在 start 的时候读这个槽位的）；Dart 侧 **先 `setApiKey` 再 `setBaseUrl`** —— 反了就有一个「指着新地址、却还没带钥匙」的窗口 ⇒ 那个窗口里的请求会 **401**，而 **401 比 connection refused 难查得多**。④ **⚠️ 钥匙的边界**：它是**宿主与自己客户端之间的门闩**，**不是用户凭证**、**不出设备**、**绝不进日志**（Kotlin 只说「已设」不说是什么；Dart 只记「已设/无」）⇒ 它与**账号密钥**（`identity/account.key` = **身份本身**）是两回事，轮换节奏也不同。⑤ **⚠️ 降级路径是「敞开」而不是「报错」**：旧 `.so` 里没有 `nativeSetShadowApiKey` ⇒ Kotlin 抛 `UnsatisfiedLinkError` ⇒ 被接住 ⇒ **钥匙送不到端脑** ⇒ 端脑面保持敞开（= 今天的行为）⇒ **不会把 App 自己锁在外面**。⚠️ 这处「失败长得像成功」是**故意的**（宁可敞开，不要自锁）—— 但它也意味着「**装上了 ≠ 锁上了**」⇒ 所以才有下面那条设备端测试。⑥ **✅ 真机复验完成（设备 `08IHNSXOW9` / RK3566 / Android 11 / arm64-v8a）**：`.so` 重编 **5m18s**（213.1 → strip 后 **151.5 MB**）⇒ **字节核验**：`Java_com_ibloc_shadow_EncephalonRuntime_nativeSetShadowApiKey` / `shadow API key set by the host` / `x-shadow-key` **全在** ⇒ APK 打包 51s + 装机 27s ⇒ logcat **`✅ shadow key set (端脑面将要求 X-Shadow-Key)` 出现在 `✅ Encephalon started on port …` 之前**（顺序对了）⇒ **从开发机这一侧（= 别的 App 那一路）**：**不带 key ⇒ 401** / **错 key ⇒ 401** / **带对 key ⇒ 200**（拿到身份 JSON）⇒ **不带 key `POST /shadow/v1/identity` ⇒ 401**，事后复查身份 **principal / persona / device 一字未变**（换不掉「这台机器是谁」）。⑦ **新增设备端集成测试 `integration_test/shadow_key_test.dart` ⇒ 5 passed**：不带 key ⇒ 401 / 错 key ⇒ 401 / 带 key ⇒ 200 / **不带 key POST identity ⇒ 401 且身份未变** / **App 自己的客户端带 key 能读到身份**（= 没把自己锁在外面）。⑧ **⚠️⚠️ 别把这条读成「端脑面全关了」—— 只关了一扇门**：锁加在端脑仓 `shadow::router_with_store` **那一个 router** 上 ⇒ **只覆盖 `/shadow/v1/*`**。而端脑面（`telencephalon::api::router`）是**约 30 张 router 合并**出来的 ⇒ **其余全部仍然对同机任意进程敞开** —— 包括 **`/api/telencephalon/lobes/{name}`（叶区注册 ⇒ 别的 App 能往你的大脑里塞一个它自己的叶区）**、**`wasm_install` / `wasm_route`**、**`agent_management` / `agents_registry`**、**`mcp_admin`**、**`test_reset`**、**`subsystem_token_admin`**、**`llm_configure`**、**`a2a_gateway`**、以及 **neuron / thalamus 公共面**。⚠️ **其中几项比「换掉身份」更危险**（叶区注册 / WASM 安装 = 往模型面前塞一条自己写的路）⇒ **这一扇门只堵死了「我是谁」这条最要命的路，不是把整台机器围起来了**。⚠️ **为什么本轮不接着做**：把 `require_shadow_key` 从「shadow 那一个 router」提到「整张面」会**同时改变桌面端的行为**（桌面那张面走同一个 `api::router`）⇒ 那是**跨端行为变更**、边界要单独定 ⇒ 不该在这一档顺手做掉。⚠️ **下一档真要动这张面的话，先看这两个地雷**：① **`PrefrontalClient` 内部自己 new 了一个不带钥匙的 `TelencephalonClient`**（`prefrontal_client.dart:1621`，只在没显式传 client 时）⇒ 它 `listFlows()` 打的是 `/api/telencephalon/flows`（**今天不受锁管**）⇒ **一旦把锁提到整张面，它会第一个 401**；② **`defaultTelencephalonClient` 是全局单例**（`telencephalon_client.dart:1383`）⇒ 好处是 App 里所有走 `telencephalonClientProvider` 的调用**共用同一把钥匙**（`_pointClientsAtAgentSurface` 设一次就够），坏处是**谁都能改它** —— 例如 `_restoreExternalEndpoint()` 会把它清成 `null`（那是有意的：外部端脑用它自己的钥匙）。⑨ **⚠️ 还欠的**：**neuron 面仍绑 `0.0.0.0`**（推理入口**同网段可达**）—— 那是另一张面、另一件事，本轮**没动**；**上面 ⑧ 那张清单**；**签发侧接线**（`src/acl/` + `credential_signer.rs`）仍**未动**；**移动端仍然够不着海马体**（等「网络上海马体地址」定下来）。

**Updated:** 2026-10-31 (㊳ **移动端在真机上「不知道自己是谁」—— 解析只跑一次、失败就没有下一次 ⇒ 租户永远停在 `default`** —— 父仓 `shadow/AGENTS.md` ㊲ 条记根因与修法，本条只记**移动端这一侧**。① **症状**：端脑那边 `GET /shadow/v1/identity` **答得好好的**（`persona-…` / `principal:…`），而 App 的身份页显示「**背后没有人**」、记忆桶 `default`。⚠️ **不是端脑的问题，是客户端只问了一次**：`resolve()` 全 App **只被调过一次**（`main.dart` 启动那一次）⇒ 冷启动时大脑要**十几秒**才起得来（抽资源 + 加载 150MB 的 `.so` + boot 端脑面），而单次解析有 **15 秒上界** ⇒ **第一次大概率超时** ⇒ 而 `IdentityNotifier` 失败时**故意不**标记 resolved（注释：「下次还会再试」）—— **根本没有下次**。② **后果不是页面难看**：客户端按 `default` 桶读写，端脑按**账号人格桶**写 ⇒ **两边的数据不在同一个桶里** ⇒ 「两端读写同一份记忆」在手机上**其实没成立**，**且哪儿都不报错**。③ **修法**：`IdentityNotifier.resolveWithRetry()`（失败就再来一次，**有上界**：3 次 × 15s + 间隔）⇒ 把「下次还会再试」兑现；`main.dart` 改用它；**身份页 `initState` 再问一次**（这一页是「我是谁」的唯一真相出口 ⇒ 进去就重问 ⇒ 用户有自救手段）。⚠️ **迁移跟着走才对**：目标桶取 `state.tenantId`，解析失败时是 `default` ⇒ `migrateLegacyTenant` 返回 `target-is-default` 且**不写标记** ⇒ 以后解析成功了还能搬 ⇒ 所以**解析成功之后**再迁移，桶就是对的。④ **验证**：新增**设备端集成测试** `integration_test/identity_resolution_test.dart`（按冷启动真实顺序：大脑没起来 ⇒ `default`；大脑起来 ⇒ 走 App 自己那条路 ⇒ 租户落在**账号人格桶**）；Dart 单测 +2（「大脑后来才起来 ⇒ 解析自己会重试并切过去」/「一直连不上 ⇒ 有上界」）。⑤ **顺带修掉一条会带偏人的日志**：`EncephalonRuntime.kt` 里 8 处 `UnsatisfiedLinkError` 都写着「Encephalon .so not loaded」—— 但 `.so` **常常是加载了的**，缺的是**方法**（旧版 `.so`）⇒ 改成「native method missing — .so not loaded, or an old .so without this method」。⚠️ 并行会话就是被这句带偏的。⑥ **手机上的端脑面已经上锁了**（并行会话里做杏仁核那条拿的；父仓 `shadow/AGENTS.md` ㊲ 条 ⑥ 记实现与验证）：宿主生成钥匙 → 写 `<filesDir>/shadow.key` → 经 `nativeSetShadowApiKey` 递进端脑（**没动 `nativeStart` 的签名** ⇒ 旧 `.so` 与新 Kotlin 能共存 ⇒ App 不会把自己锁在外面）⇒ 客户端侧在 `setBaseUrl` **之前** `setApiKey` ⇒ 没有「指着新地址却还没带钥匙」的窗口。⚠️ **代价**：这是 **fail-open** —— 钥匙送不到端脑（旧 `.so`）时端脑面保持敞开 ⇒ 「锁上了」依赖 `.so` 是新版 ⇒ 装机必须 `.so` 与 APK 同一批。**验证（上锁后，真机）**：不带 key ⇒ 401 / 错 key ⇒ 401 / 对 key ⇒ 200 / **不带 key `POST /shadow/v1/identity` ⇒ 401 且身份一字未变**；**App 自己那条路** ⇒ 租户仍落在**账号人格桶**（不是 `default`）。⚠️ 移动端**仍然够不着海马体** ⇒ 「租户选对了」已可验，**读写互通**要等海马体地址。) ⑦ **⚠️ 一个会让人找错方向的报错形状**：`flutter test integration_test/…` 里如果 **Dart 编译不过**，冒出来的是「**Gradle task assembleDebug failed with exit code 1**」—— **不是 Dart 报错**（因为 App 的 Dart 是在 Gradle 里编的）⇒ 看到这句要去翻 **Gradle 的完整输出**；直接 `flutter build apk --debug --target=integration_test/<file>.dart` 能立刻看到 Dart 那几行（本轮就是这么定位到一个变量重名的）。⑧ **⚠️ 机器级的坑：C: 盘会被 Rust 的 target 目录吃光** —— 本轮实测：`telencephalon/target/debug` **302 GB** + `encephalon/target/debug` **125 GB**（Rust 的 debug 产物带 candle，链接一次就是几十 GB）⇒ 盘只剩 **~6 GB** 时，**Gradle 会以「磁盘满」的形式失败**（`BUILD FAILED`，报错指向 Kotlin 编译器，跟磁盘毫无关系 ⇒ 极难定位）。⚠️ **别在别人的在飞构建上 `cargo clean`**（target 目录里就是人家的活）⇒ 手头这轮 Rust 做完就清。
**Updated:** 2026-10-31 (㊂ **移动端的导出通道在真机上跑通了 —— 三方对账：端脑自报 / 密钥文件 / 导出返回值** —— 父仓 `shadow/AGENTS.md` ㊁ 条记整体结论与那条**安全发现**，本条只记**移动端这一侧**。① **新增设备端集成测试** `integration_test/account_export_test.dart`（用 `flutter test integration_test/… -d <设备>` 在**真机**上跑）：走**真实的 MethodChannel → JNI → Rust**，然后对三件事 —— **端脑自报的身份**（`GET /shadow/v1/identity`，问的是 App 进程内那张端脑面）、**端脑写记忆时读的那份密钥文件**（`<filesDir>/identity/account.key`）、**导出通道的返回值**。⚠️ 三者必须**全等**：导出与密钥文件不同 ⇒ 导出了另一个账号（导入后是另一个人、记忆分叉、**且不报错**）；导出派生的人格与端脑自报的不同 ⇒ 那串码根本不是「这个人」。② **⚠️ Dart 侧那套派生是「独立实现」**（`SHA256(domain || 0x00 || key)`，域分隔符 `shadow/persona/v1` / `shadow/principal/v1` 与端脑**逐字节**一致）—— 故意不抄 Rust：两边算出同一个人格，才说明「导出的码」真的是「端脑说的那个人」；同一份代码算两遍只能证明代码没坏。③ **⚠️ `getApplicationSupportDirectory()` 在 Android 上就是 `context.getFilesDir()`**（`path_provider_android` 的 `getApplicationSupportPath`）—— 端脑的身份目录正挂在它下面；`getTemporaryDirectory()` 则是 `getCacheDir()`（测试把导出的码落在这儿，供开发机 `run-as` 取走）。④ **⚠️ `flutter test integration_test` 会把 App 卸载掉** ⇒ App 私有目录（含 `files/identity/`）**一起没了** ⇒ 想取回设备上的东西要用 `flutter run --target=integration_test/…`（**装完不卸载**），再 `adb shell run-as com.ibloc.shadow cat cache/exported_account.txt`。⑤ **⚠️ 端脑的端口每次启动都变**（neuron / 端脑面各一个随机端口）⇒ 真机复验**先从 logcat 读** `✅ Encephalon started on port <neuron> (agent surface: <端脑面>)`，别猜也别扫 —— ⚠️ `/proc/net/tcp` 里还有**别的**监听（`0xA61D`=42525 是 App 里另一个服务，**不是端脑面**），打错端口会得到一个**误导性**的 403。⑥ **⚠️ 手机上的端脑面是**开着**的（不需要 shadow key）** —— Android 进程**没法设环境变量** ⇒ 端脑在手机上**没有配置文件** ⇒ `shadow.api_key` 取默认 `""` ⇒ **开发模式，所有 shadow 请求放行** ⇒ 本机任意进程（包括**手机上别的 App**）都能打这张面，**包括 `POST /shadow/v1/identity`（导入账号 ⇒ 换掉「这台机器是谁」）**。⚠️ 这是**既有形状**、不是本轮引入的，但顶着「知道当前是谁」⇒ **下一轮第一件事**（父仓 ㊁ 条「还差的」有方案）。⚠️ **⚠️ 本轮已把它「演示」了一遍**：从开发机 `adb forward` 到手机端脑面，**不带任何 key** 发 `POST /shadow/v1/identity` ⇒ **200**、端脑**当场换了人**（`persona-9d924d50229348fc` → `persona-367648c3bbe30cf4`），再把原来的码发回去 ⇒ **原样恢复**（`files/identity/account.key` 逐字节回到原值）。⇒ **手机上任何别的 App 都能换掉「这台机器是谁」**（记忆改写进另一个人格、**不报错**）；**读不到密钥**（导出刻意不在 HTTP 面上）。⚠️ 顺带：**neuron 面绑的是 `0.0.0.0`** ⇒ 手机上那台「大脑」的推理入口**同网段可达**。⑦ **验证**：真机 `flutter test integration_test/account_export_test.dart -d 08IHNSXOW9` ⇒ **通过**（`flutter run --target=integration_test/…` 形态再跑一次也通过）；`flutter analyze --no-pub integration_test/account_export_test.dart` ⇒ **0 issue**；整仓 `flutter analyze --no-pub` ⇒ **0 error / 75 issues**（与基线持平、**零新增**）；`flutter test --concurrency=1` ⇒ **359 全绿**（本轮 **+0** —— 新文件在 `integration_test/` 下，单测套件不收它）。)
**Updated:** 2026-10-31 (㉝ **移动端正式支持 Android 11 + 小屏横屏不再溢出 —— 这一条全是「真机上才发现的」** —— 父仓 `shadow/AGENTS.md` ㊱ 条记决定与结论，本条只记**移动端这一侧**。① **`minSdk` 31 → 30**（`android/app/build.gradle.kts`）：复验机 `08IHNSXOW9` 是 **RK3566 / Android 11（SDK 30）**，`minSdk = 31` 时安装直接 **`INSTALL_FAILED_OLDER_SDK`** —— 上一轮只能临时降、打完包又改回去（等于没支持）。现在**正式**降到 30 ⇒ 装机 **`Success`**。⚠️ **代价**：API 30 与 31 两档都要覆盖，**以后每次装机复验都必须用 30 的包**；`build.gradle.kts` 里写了「**为什么不是 31**」的注释（Android 11 实测证据 + 用户拍板 + 两档覆盖的代价），免得下一个人又把它改回去。② **⚠️ 修掉一个既有布局缺陷**：真机 1280x720 横屏、**空会话 + 键盘弹起**时，Flutter 在屏幕上画出一行红字「**BOTTOM OVERFLOWED BY 102 PIXELS**」，空状态图标被压在输入栏上面。根因：键盘弹起后消息区（`Expanded`）被压到 **0 高**，而空状态那个 `Column` 是 `mainAxisSize: max` ⇒ 在 `Center` 的**松约束**下它取 `maxHeight`(=0) ⇒ 64(图标) + 16(间距) + 22(文字) = **102px** 正好溢出。修法 = Flutter 官方「**可滚动区里居中**」配方（`LayoutBuilder` + `SingleChildScrollView` + `ConstrainedBox(minHeight: constraints.maxHeight)`）⇒ 有空间就居中、没空间就滚动。⚠️ **不改整页可滚动** —— 那会和消息列表自己的 `ListView` 抢滚动（Flutter 经典的嵌套滚动坑），代价大于收益。③ **⚠️ 已知边界（没修，如实记着）**：键盘 **≥540px**（视口的 83%）时**输入栏本身**（自然高度 ~85px）放不下 ⇒ 仍会溢出（错误链 `Column ← LocalChatView ← Expanded ← Column`，**不是**空状态那个）⇒ 本轮不修，理由写进了测试文件注释。④ **新增回归测试** `test/widget/chat_screen_small_screen_test.dart`：真机几何 **1280x648**（720 里 72px 是系统导航栏），扫键盘 200/260/300/340/380/420/460px，断言 `takeException()` 为空。⚠️ **扫描范围到 460 为止**的依据：真机「键盘 + App 底部导航栏」合计吃掉 298 + 80 = **378px**，换算到这条测试（没泵底部导航栏）就是 380px ⇒ 扫到 460 是留了两成余量。**反向验证**：撤掉修复 ⇒ 420px/460px 两条**当场变红**（报 5px / 45px 溢出）⇒ 确认这条测试真在断言、不是摆设。⑤ **⚠️ 真机级反向验证（不只靠单测）**：旧版布局**重打 APK 装机** ⇒ 同一台机同样操作 ⇒ **红字溢出条回来、图标压到输入框上**；修复版 ⇒ 屏幕干净 ⇒ 证明「真机上没报错」是**真阴性**不是**假阴性**。⚠️ **已排除的假设：布局溢出不进 logcat** —— 它只被**画在屏幕上**，`adb logcat` 里一条错误都没有 ⇒ **真机复验布局必须截图**。⑥ **验证**：`flutter test --concurrency=1` **359 全绿**（本轮 **+7**）；`flutter analyze --no-pub` **0 error / 75 issues**（与基线持平、零新增）；真机：装机 `Success`、端脑起得来、**同回合续说 PASS**（`tool_call → 回传 → delta "MOCK-OK" → done`，3 事件 96ms）。⑦ **⚠️ 真机脚手架事实（别再踩）**：**端脑端口是 App 每次启动随机分配的** —— 从 logcat 读 `✅ Encephalon started on port <neuron> (agent surface: <telencephalon>)` 再 `adb forward`；同一台机上 41379/44917 这次变成了 **43085/36265**、下一次又变 ⇒ 照抄旧端口必定 404。⚠️ **装完包别急着截图**：首启要抽 Flutter 资源 + 加载 150MB 的 `.so`，本机实测 **App 起来要 ~30 秒**，太早截图只会拍到一张白屏。）
**Updated:** 2026-10-31 (㉜ **移动端能导出账号了 —— 「同一个人」终于能跨设备搬过去（JNI 通道 + 身份页）** —— 承 ㉘ 条 ③ 记的「导出还没做 ⇒ 需要一条 JNI 通道 ⇒ 下一轮」，本轮把它补上；父仓 `shadow/AGENTS.md` ㉟ 条记整体形状，本条只记**移动端这一侧**。① **新增 JNI 通道**（`encephalon` 仓）：`nativeExportAccount(dataDir, output, outputLen): Int` —— Rust 侧 `encephalon_mobile_export_account(data_dir)` 读**端脑进程里那个账号**（`process_account()`）⇒ 导出的就是「这台机器现在是谁」。⚠️ **返回字符串走 buffer 协议**（与 `nativeInfer` 同一套：写入字节数 / 需求字节数 / 负数错误码），因为账号密钥是秘密、不能直接 `new_string` 返回；**失败路径绝不把密钥打进日志**。⚠️ **不能自己 `load_or_create`**：目录里没有密钥文件时它会**随机造一个** ⇒ 导出的码导入之后是**另一个人**，而端脑还在按原来那个人写记忆 ⇒ **两边人格分叉、记忆对不上，且不报错**。② **⚠️ 导出不走端脑的 HTTP 面** —— 那张面在 loopback 上，能连上它就意味着「本机任意进程」⇒ 把账号密钥放到那儿等于把身份发出去 ⇒ 导出是**宿主**的活（桌面走 Tauri 命令，移动走这条 JNI 通道）。③ **新增身份页** `lib/screens/identity_screen.dart`（路由 `/settings/identity`，挂在设置页「连接」组）：显示**人 / 人格 / 设备 / 记忆桶** + 导出 + 导入。⚠️ **导出的码默认不显示**，点了才亮出来（它不该出现在截屏、录屏或别人肩膀后面）；⚠️ **提示放在第一屏**而不是页面最底 —— ListView 是懒加载的，放最底时它可能压根没被构建（实测：消息找不到）。④ **导入之后必须强制重问端脑** —— 导入换了人 ⇒ 人格变了 ⇒ **租户也得跟着变**（`IdentityNotifier.importAccount` 内部走 `_resolveOnce` 重算并把租户落到海马体 client 上）；不重问的话这一轮还写在旧桶里。**导入失败要说话**，不能静默也不能假装成功。⑤ **service 依赖做成可选**：`IdentityNotifier` 的第三个构造参数（`EncephalonMobileService?`）可以是 null ⇒ 纯 Dart 测试里没有 MethodChannel，导出自然返回 null，而**身份解析与迁移不依赖它** ⇒ 两条路互不拖累。⑥ **验证**：`flutter test --concurrency=1` **352 全绿**（本轮 **+7**：导出/导入 3 条 + 身份页 widget 4 条）、`flutter analyze --no-pub` **0 error / 75 issues**（与基线持平、**零新增**）；**反向验证**：把「导入后强制重问」去掉 ⇒ 那条测试立刻变红（它断言 `asked == 2`）。⑦ **⚠️ 跨仓依赖提醒**：`encephalon` 仓改了 ⇒ **手机里的 `libencephalon.so` 变了** ⇒ 要重跑 `encephalon/scripts/build-android.ps1` + 重打 APK 装机，这一条 JNI 通道才真的在手机上（**真机复验仍待设备接上**）。)
**Updated:** 2026-10-30 (㉛ **移动端客户端工具的 JSON Schema —— 模型知道 `set_theme` 要吃 `color` 还是 `dark`** —— 承 ㉗ 条那条「客户端工具结果回传」的通道，本轮补上它的**前半截**：端脑发 `tool_call` 与客户端执行之间，缺了**「模型看得见工具的签名」**这一环。① **为什么必须有 schema**：没有它，模型只知道有 `set_theme` 这个工具，**不知道它要一个 `color` 还是 `dark`** ⇒ 只能瞎猜，或者干脆不调。② **⚠️ `parameters` 与界面表单的字段声明不是一回事** —— 后者描述的是**输入框**（UI 变体），前者描述的是**参数**（**JSON Schema**）⇒ 移动端用 `Map<String, dynamic>` 存这份 schema（**这份东西就是 JSON**，再包一层 Dart 类型只会多一次转换）。③ **⚠️ 两端同名工具必须导出同样的内容** —— 否则同一个模型在手机上和桌面上行为不一样 ⇒ **两端测试各自断言同一份字面量**（移动 `test/unit/client_tool_registry_test.dart` / 桌面 `shadow-desktop/src/lib/__tests__/clientTools.test.ts`）⇒ **任一端漂移则该端测试立刻变红** —— 跨仓没有共享运行时，这是唯一可行的保证方式。④ **`color` 与 `dark` 都不是必填** —— 给哪个都算一次合法调用；两个都不给时工具**明确失败**（`FormatException`）而不是默默什么也不做。⑤ **线上契约**：客户端发给端脑的字段叫 **`tools`**（OpenAI function-calling 数组），**端脑今天还不认识它** ⇒ serde 默认忽略未知字段 ⇒ **带上无害** ⇒ 等端脑那侧接上，模型才知道 `set_theme` 要吃一个 `color`。⑥ **能做什么由设备决定** —— 手机没有窗口可最小化 ⇒ 两端清单本来就该不一样。⑦ **验证**：`flutter test --concurrency=1` **334 全绿**（本轮 **+5**：导出形状 / schema 字面量 / 两个都非必填 / 无 schema 时空参数表 / 空注册表）、`flutter analyze --no-pub` **0 error**（78 issues 与基线逐条一致、**零新增**）；**反向验证**：把 `dark` 的 description 改一个字 ⇒ 该端 schema 断言**立刻变红**（`+8 -1`）⇒ 确认这条测试真在断言字面量、不是摆设。⑧ **⚠️ 还差的**：端脑侧 `SendMessageRequest.tools` → 叶区 LLM 请求带 `tools` → 解析 `tool_calls` → `tool_call` 事件 这条链**还没接** ⇒ **客户端现在发出去的 `tools` 是惰性的**。)
**Updated:** 2026-10-30 (㉘ **移动端也能「知道当前是谁」了 —— 账号级身份：手机与桌面是同一个人、写进同一份记忆** —— 端脑侧的实现见 `telencephalon/AGENTS.md` 同日条目与父仓 `shadow/AGENTS.md` ㉘ 条；本条只记**移动端这一侧**。① **端脑在 App 进程里现在有账号了**：`telencephalon::boot::BuildOptions` 加 `identity_dir`，移动端传 `<filesDir>/identity`（Android **没有 `$HOME`**、进程工作目录是 `/` 不可写 ⇒ 与 `flow_dir` 同理必须显式给目录）。账号密钥派生 **principal + 默认人格** ⇒ **手机与桌面导入同一个账号后是同一个人、写进同一个人格** ⇒ 记忆互通而不是各写各的。② **新增 `TelencephalonIdentity` / `IdentityPersona`**（`lib/services/telencephalon/telencephalon_client.dart`）+ `getIdentity()` —— 读端脑的 `GET /shadow/v1/identity`（报出人 / 人格 / 设备 / 可用空间与角色）；`importAccount(code)` → `POST /shadow/v1/identity`（导入另一台设备导出的账号，**立即生效**，不用重启大脑）。端点跟着 `X-Shadow-Key` 一起受保护（`_headers()` 已经带上）。③ **⚠️ 导出还没做（只做了导入）** —— 导出要读**端脑进程里的账号文件**，而移动端端脑是**嵌在 App 进程内**的（`encephalon_mobile_start` 拿不到端脑的 `AppState` 句柄）⇒ 需要一条 JNI 通道（`encephalon_mobile_export_account()`）⇒ **下一轮**。④ **⚠️ 客户端的 `tenantId` 仍写死 `'default'`**（`lib/services/prefrontal_client.dart:9` 的 `defaultTaskTenantId`）⇒ 端脑**自己**写记忆已经按账号人格分区了，但客户端**显式声明**的租户还是 `default` ⇒ **任务看板/记忆面看到的还不是同一份**；要切得在客户端初始化时先问端脑「我是谁」再定租户（客户端侧改造，桌面端 `taskBoardDataStore` 同理）。⑤ **⚠️ 前额叶 client 还指着外部端脑**（`http://localhost:60080`，前额叶方言 `/hippocampus/api/*`）—— 嵌入式大脑挂的是**端脑方言**，两者**没有交集** ⇒ 身份这条线目前只能走 `TelencephalonClient`（端脑方言）。⑥ **⚠️ 跨仓依赖提醒**：`telencephalon`（+ `encephalon`）改了 ⇒ **手机里的 `libencephalon.so` 变了** ⇒ 要重跑 `encephalon/scripts/build-android.ps1` + 重打 APK 装机，账号级身份才真的在真机上生效（**真机复验仍待设备接上**）。⑦ **验证**：`flutter analyze` **0 error**（3 条 info 全是既有 lint，与本轮改动无关）；`flutter test --concurrency=1` **329/329 全绿**（新增 2 条：`getIdentity()` 报出人/人格/设备/可用空间与角色、`importAccount()` 导入后答回新身份；既有 327 条无回归）。
**Updated:** 2026-10-30 (㉗ **移动端两个真 bug + 端脑的接收端开了（㉖ 条那个「闭环未通」现在通了接收这一半）** —— 承 ㉖ 条的「端脑这条路由还不存在 ⇒ 回传会 404 ⇒ 闭环未通」，本轮把**端脑那一半**补上（`telencephalon` 仓新增 `POST /shadow/v1/conversations/{id}/tool-results`），顺带修掉移动端两个真 bug。① **端脑侧**：结果回传现在 **200**，并**记进会话历史**（agent 角色 + `[tool_result] ` 前缀）⇒ **下一轮**模型看得见「我调过这个工具、结果是什么」；`tool_call` 事件**现在带 `tool_call_id`**（端脑生成的 uuid）⇒ 两端客户端本来就会解析并回传，**零改动**。**⚠️ 这一档没有做到「同一条 SSE 里端脑等结果后继续输出」** —— 上游 A2A 对端自己执行工具、从不等客户端，它的回合发完 `tool_call` 就结束了 ⇒ 要「续跑」得再发一次上游调用（= 一次新的 agent 回合）或在 synapse 里补反向通道 ⇒ 单独立项。② **⚠️ 移动端 bug（a）：8 位 ARGB 色两端不一致** —— 桌面端 `parseHexColor` 把 `#AARRGGBB` 归一成 `#RRGGBB`（丢 alpha），移动端 `_parseColor` 却保留 alpha ⇒ **同一个颜色两端显示不一样**；现在移动端也丢 alpha（主题色带透明度没有意义 —— 会跟背景混色）。③ **⚠️ 移动端 bug（b）：只有工具调用、没有正文的那一轮被当成错误** —— `_sendToTelencephalon` 原来「空回复 ⇒ 抛异常」，而端脑让客户端干完活之后**可能不再说话**（那一轮就只有一次工具调用）⇒ 用户看到的是一条红横幅 + 一个红色 system 气泡，而工具卡片其实就在上面；现在「这一轮有工具调用 ⇒ 空回复不是错误」，且**不插空气泡**。④ **⚠️ 一个被测试抓出来的真洞**：工具是在**后台**跑的（执行 + 回传不阻塞 SSE 读循环），用户在它跑完之前离开页面 ⇒ notifier 已 dispose ⇒ `_upsertToolCall` / `_toolCallById` 碰 `state` ⇒ 抛「Bad state: Tried to use ChatNotifier after `dispose` was called」⇒ **整个 App 崩**；现在两处都先看 `mounted`（**读 `state` 在 dispose 之后也会抛，不只是写**）。⑤ **新增测试** `test/unit/chat_provider_tool_test.dart`（14 条）：执行成功 / args 两种形态 / 未知工具 / 回传失败 / 工具抛异常 / 只有工具调用无正文 / 等点头 / 点头 / 拒绝 / `tool_call_id` 解析 / 客户端自己合成 id —— **反向验证**：把三处修复退回去 ⇒ **4 条变红**。⑥ **⚠️ 跨仓依赖提醒**：`telencephalon` 改了 ⇒ **手机里的 `libencephalon.so` 变了** ⇒ 要重跑 `encephalon/scripts/build-android.ps1` + 重打 APK 装机，回传才真的通（**真机复验仍待设备接上**）。
**Updated:** 2026-10-30 (㉖ **移动端的「客户端工具」这一半做完了：注册表 + tool_call 卡片 + 本地执行 + 结果回传（但端脑的接收端还没上 ⇒ 闭环未通）** —— 承 ㉑ 条留的「还差三件事」里的第 3 件事（两端客户端的渲染与执行），**移动端那一半**现在落地了。① **新增 `lib/services/client_tools/client_tool_registry.dart`**：`ClientTool`（名字 / 说明 / 要不要用户点头 / 真正干活的 `execute`，**抛异常 = 执行失败**）/ `ClientToolRegistry`（工具名 → 工具）/ `ToolCallModel`（含 `ToolCallStatus`：pending / running / awaitingApproval / succeeded / failed）+ `ClientToolOutcome`。**两端各有一份注册表** —— **能做什么由设备决定**：手机没有窗口可最小化，桌面端没有麦克风权限可申请。② **内置工具**：目前只有 `set_theme`（`color` → 换主题色，`dark` → 切明暗）。主题色的两端色调由 `app_colors.dart` 的 `deriveAccentTones` 派生（与桌面端 `accent.g.ts` **同一套算法**）—— 两端算出来的明暗两端色调必须一致，否则「模型让手机换主题」换出来的颜色和桌面端对不上。③ **执行回路**（`chat_provider.dart`）：端脑只负责**点名**（工具名 + 参数），真正干活的是**这台设备**，干完再把结果回传端脑（`TelencephalonClient.reportToolResult`）—— 端脑把它喂回模型，模型才知道「主题已经换好了」，否则模型会一直等一个不来的结果。端脑点了一个这台设备不会的活 ⇒ **明确失败并回传**，不闷着不吭声。④ **⚠️ 端脑今天不携带调用 id ⇒ 客户端自己合成**（`client-tool-<序号>-<工具名>`）—— 用**单调递增的序号**而不是随机串：同一次会话里序号唯一就够，而且卡片按 id 排序时稳定（随机串会让卡片顺序看起来乱跳）。⑤ **⚠️ `args` 线上有两种形态**（端脑的 `ToolCall.args` 是 `String` ⇒ 序列化出来是 JSON 文本；有些路径传的是已经拆好的 map）⇒ `parseToolArgs` 两种都认。**认错的后果很具体**：拿到字符串还当对象用 ⇒ 参数全是空的，「把主题换成靛蓝」会退化成「换成默认色」，而且**看不出哪里错了**。⑥ **⚠️ 两端要分开显示**：工具在本地跑成了 **≠** 端脑知道了 ⇒ `ToolCallModel.reported` / `reportErrorText` 单独记，否则「本地换了主题、端脑那头模型还在等」会被看成成功。**认不出的颜色名不猜** —— 猜错一次，用户看到的主题色就和模型说的完全不是一回事，而模型以为自己成功了。⑦ **⚠️ 闭环还没通**：客户端把结果回传到 `POST /shadow/v1/conversations/{id}/tool-results`，而**端脑这条路由还不存在**（客户端代码里也写了这条提醒）⇒ 现在回传会 404 ⇒「模型自己让客户端换主题」这件事**还没真跑通**。**桌面端那一半仍是骨架**（`ToolPartRouter` / `ClientToolForm`）零消费方。**验证**：`flutter analyze` **0 error**、`flutter test` **300/300 全绿**。
# PROJECT KNOWLEDGE BASE — shadow-mobile

**Updated:** 2026-10-30 (㉕ **模型使用的最小单位改成「叶区」：全局默认 + 每叶区单独覆盖（移动端 UI 落在「设置 → 嵌入式大脑」的两张卡片）** —— 承 ㉓ 条的「大脑模型来源」只有全局一档，现在按用户的要求改成**模型的使用最小单位是叶区**：默认设本地就各叶区都走本地，默认设云端就各叶区都走云端，**单个叶区可以覆盖**（前额叶本地 / 实际执行任务的区域云端 / 颞叶本地）。**用户随后追加三条架构纠正，已按它们把边界改准**：**外部 A2A 不需要配置模型信息**（端脑只转发，对端自己管）、**WASM agent 本质上是自定义叶区 ⇒ 独立配置**、**neuron 已由大脑内嵌、端脑不重复嵌**。① **两层结构**：`BrainModelRouting` = **全局默认**（`BrainModelSource`：`local` / `cloud:<modelId>` / 没选过=自动，自动档保持旧行为）+ **per-lobe 覆盖**（`Map<叶区名, BrainModelSource>`；「不在表里」= 跟随全局，`local` = 强制本地，`cloud:<id>` = 固定那条云端）。**「跟随全局」不落表**（不进表 = 没覆盖）⇒ 表里只存显式覆盖。② **持久化**：新的 `app_settings` 键 `brain_model_routing`（JSON `{default, lobes}`），**老键 `brain_model_source` 迁移**（读出来当全局默认 + 顺手写进新键，迁移幂等）；老键**继续写**（老版本 App 读得到全局默认）。③ **UI 两张卡片**：「大脑模型来源」（= 全局默认，`RadioGroup`，本地 neuron + 各云端供应商）+「**叶区模型路由**」（每叶区一个 `DropdownButton`：跟随全局 / 本地 / 各云端，下方一行小字显示「当前：…」）。**叶区列表从端脑读**（`GET /api/telencephalon/lobes/list` → `NativeLobeInfo`），**不硬编码**叶区名 ⇒ 端脑注册了哪些原生叶区就显示哪些；读不到时给一句「读不到端脑的叶区列表」+ 刷新按钮（**带 10s 超时**，否则端脑没起来时那个卡片会永远转圈）。**列表里只有 native 叶区** —— 外部 A2A（不需要配模型信息）与 WASM（自定义叶区、独立配置）都不在这一张表里。④ **⚠️「换来源」不再重启大脑**（推翻 ㉓ 条）：端脑的 `AppState.neuron_state` 就是**活着的**那份 neuron 状态 ⇒ 远端引擎可以**运行时**注册、叶区的 `default_model` 可以随时改 ⇒ 路由是**运行时的**，改完立刻生效（`POST /api/telencephalon/lobes/models`）。**重启只在「改了供应商配置本身」时才有意义** —— 而停大脑会让正在用的会话断掉。⑤ **⚠️ 客户端下发的必须是「覆盖集合」而不是「全量有效值」**（本轮修的第二个坑）：`buildModelRoutingPayload` 的 `lobe_models` **只装显式覆盖的叶区**，`default_model` 单独带 —— 要是把每个叶区的**有效值**都发下去，「跟随全局」就被**钉死**了，改全局默认时那些叶区不会跟着变。**两个面说的是同一份 JSON**：端脑 HTTP 面（`POST /api/telencephalon/lobes/models`）与大脑 Rust 槽位（`encephalon_mobile_set_model_routing`）的字段名统一成 `providers` / `default_model` / `lobe_models`。⑥ **⚠️「覆盖指向的供应商被删了」⇒ 那个覆盖作废 ⇒ 回到跟随全局**：新增 `effectiveLobeSource`（界面显示与负载构造用**同一套**算法，否则界面显示的跟实际跑的不是一回事）。⑦ **⚠️ 两套 id**：App `models` 表的 `id` 是本地记录 id（`cloud_1735…`），**`model` 才是上游模型 id**（neuron 的注册名、叶区请求用的名字）⇒ 路由负载里写的必须是后者。⑧ **⚠️ 三个坑**：**(a)** `DropdownButton` 的 value 必须**精确匹配**某一项 —— 覆盖指向的供应商被删了时，那个 value 不在下拉项里 ⇒ 断言失败、**整个设置页崩** ⇒ 下拉值要过一遍「可选项集合」，不在就退回「跟随全局」；**(b)** `group('x', { … })` 少写 `()` ⇒ Dart 把 `{…}` 当**集合字面量** ⇒ 一串看着像大段语法错误的假报错（`Set<void> can't be assigned to void Function()` / `Function expressions can't be named` / `Expected to find ','`）；**(c)** 页面多一张卡片 ⇒ 底部的推理卡片被推出屏幕，而 `ListView` 是**懒构建**的 ⇒ 测「推理输入框」的用例得先 `dragUntilVisible` 滚过去。⑨ **验证**：`flutter analyze` **0 error**、`flutter test` **300/300 全绿**（本轮新增 3 条：负载**只装显式覆盖**的叶区、供应商被删⇒覆盖作废、`effectiveLobeSource` 两态）。端脑 `cargo test -p telencephalon --lib --no-default-features --features "flow candle"` **475 passed / 0 failed**；大脑 `cargo check --no-default-features --features mobile --lib` **通过**。⚠️ **端脑的默认 feature 现在编译不过** —— `hippocampus` 仓有**未提交改动**把 `hippocampus-server` 改挂了（**不是本轮做的**）⇒ 端脑侧测试只能跑**移动端那套 feature**（hippocampus 关掉）。⑩ **⚠️ 跨仓依赖**：端脑（`telencephalon`）与大脑（`encephalon`）都改了 ⇒ **手机里的 `libencephalon.so` 变了** ⇒ 要重跑 `encephalon/scripts/build-android.ps1` + 重打 APK 装机，per-lobe 路由才会真的在真机上生效 —— **本轮没做真机复验（手上没设备）**。⑪ **⚠️「本地」在移动端仍是个抽象选项**：neuron 里没有本地权重、App 侧也没有本地模型目录（LiteRT 已下线）⇒ 「这个叶区用本地」目前等价于「不指定模型 id，去 neuron 的 `/v1/models` 里翻一个 `llm/` 前缀的可用模型」，翻不到就 `NO_MODEL_CONFIGURED`。

**Updated:** 2026-10-30 (㉔ **第三层：移动端下线本地 LiteRT + 首页 UI 重构 —— 「所有通信都走 大脑 → 端脑 → 叶区」在移动端也真的成立了**：承 ㉓ 条，移动端的对话链路从「端脑优先 + 本地 LiteRT 兜底」改成「**只有端脑一条路**」，首页跟着重做。① **本地 LiteRT 在对话这条线上整个下线**：`ChatNotifier` 的 `_initLiteRT` / `initLitert` / `downloadModel` / `_litertEngine` / `_convertAttachmentsToLitertFormat` / `processAudioSegment` / `processAudioSegmentAndContinue` / `selectAgent` / `runLiteRTDiagnostic` 全删，`ChatState` 的 `isInitialized` / `mode` / `isLitertReady` / `downloadProgress` / `currentAgent` / `isDownloading` / `modelNotFound` 与 `ChatMode` 枚举一起没了，`ChatNotifier` 构造函数从 `(Tts, Litert, Telencephalon, {skipInit, litertReady})` 收成 `(Tts, Telencephalon, {systemPromptProvider})`，死 provider `modelManagerProvider` / `litertEngineProvider` / `modelListProvider` / `availableAgentsProvider` 一并删（**全仓零外部引用**）。② **⚠️ 端脑不通现在直接报错，不再静默回退本地**：以前 catch 住端脑异常只打一条 `_log.warning('端脑对话失败, 回退到本地模型')` 就转去本地引擎 —— 而本地引擎**从来没起来过**（`_getModelPath()` 给的是**文件**路径，Kotlin `LitertEngine.kt:160` 的 `diagnoseModelDirectory` 要的是**目录**）⇒ 静默回退只是把失败藏起来，用户看到的是一条「已就绪」的红横幅和一句永远等不来的回复；现在端脑不通就是不通，错误直接进对话流（system 消息）+ 错误横幅。③ **附件一律明确报错**：端脑那条链路（`/shadow/v1/conversations`）**只处理纯文本**，附件没有第二条路 ⇒ 任何附件（图片/相机/音频/文件）都直接报错，而且**消息不进对话流**（否则用户会以为图发出去了，其实根本没发）；新增 l10n `chatAttachmentNotAvailable`（替换掉已经不成立的 `chatImageNotAvailable`「LiteRT 图片功能暂时不可用，请等待版本更新」）+ 新增 `ChatStateL10nKey.errorAttachmentNotAvailable` 并在 `displayErrorMessage` 里接上（以前 `errorLitertInitFailed` 不在 switch 里 ⇒ 裸文件路径直出）。④ **首页三个真 bug（都有代码证据）**：(a) **AppBar 右侧恒为空** —— 三个 action 都挂在 `chatState.isInitialized || chatState.isLitertReady` 上，而 `ChatState.isInitialized` **全仓无一处设成 true**、`isLitertReady` 在移动端永不可能为真 ⇒ 「设置」页从此进不去；判据改成 `canChat`。(b) **错误横幅关不掉** —— `local_chat_view.dart` 里横幅 × 的 `onPressed` 是**空闭包**（注释写着 "This will be handled by the parent"，而父级从来没处理），`ChatNotifier.clearError()` 是**零调用方**的死方法；现在接上了。(c) **红色 system 气泡** —— 启动旁白（`_initLiteRT` 塞的那条）走 `ChatRole.system`，而 `chat_bubble.dart` 把 system 映射成 `colorScheme.errorContainer` ⇒ 首页必然挂三条红气泡；旁白随 `_initLiteRT` 一起没了，现在对话流里剩下的 system 消息**只可能是真错误**，红色是对的 ⇒ `chat_bubble.dart` **不动**。⑤ **首页删掉「本地模型下载框」**：`_showDownloadDialog` / `_waitForWifiThenDownload` / `_downloadDialogShown` / `_wifiWaitSub` 整块删（本地模型不再由客户端下载，也没有「模型不存在」这个状态可言）；连带 `test/widget/chat_screen_wifi_test.dart` 整个删（它测的就是那条已不存在的流程）。⑥ **`canChat` 保留但改成恒 true**：`425e666` 的教训正是「别拿本地引擎状态当可用性判据」—— 以前 `isInitialized || isLitertReady || mode == ChatMode.off` 在没装本地模型的设备上让输入框**整个禁用**、一条消息都发不出去；本地引擎没了这个判据没必要了，但**留着这个口**（UI 仍可直接用）。⑦ **模型管理页**：`_EngineStatusBar`（显示本地 LiteRT 引擎 ⇒ `isLitertReady` 恒假 ⇒ **永远**显示「引擎未运行」）换成 `_BrainStatusBar`（显示**嵌入式大脑**的真实状态，复用现成的 `encephalonStatus*` / `settingsEncephalonEmbedded` / `encephalonPort` 文案，**不新增 l10n**）；「本地模型」tab 整个删（本地引擎模型没有引擎会注册、`ModelSource.internalService` **全仓没有任何一处**创建过 ⇒ 两个分段永远空；而它剩下的「云端供应商」分段又和「模型商店」tab **完全重复**）⇒ 两个 tab 合成一个列表，FAB 直接开「添加云端模型」。⑧ **Agent2UI 补了常驻入口**：它以前唯一的入口是「本地模型没装好 → 下载框 → Use Agent2UI」那个逃生口，下载框下线后就**只能进不能出**了 ⇒ AppBar 加 `Icons.widgets_outlined` 按钮。⑨ **顺带修掉一个真 bug**：`GenUIAgentService.dispose()` **双重释放** —— genui 包的 `GenUiConversation.dispose()` 已经会 dispose 它持有的 `contentGenerator` 和 `a2uiMessageProcessor`，服务自己再 dispose 一遍 ⇒ `A2uiContentGenerator.dispose()` 里的 `_isProcessing.dispose()` 抛「A ValueNotifier<bool> was used after being disposed」。这个坑一直藏着是因为 Agent2UI 压根**进不去**；补了入口之后它第一次真的被 dispose 到。⑩ **删掉的死文件**（依据是**零调用方**）：`lib/litert_engine.dart`、`lib/services/model_download_service.dart`、`lib/providers/model_download_provider.dart`、`lib/widgets/chat/prefrontal_chat_view.dart`、`lib/providers/ai/prefrontal_provider.dart`。**故意留下**：`lib/providers/ai/litert_provider.dart`（`LiteRTProvider`，语音对话/智能客服还在用）、`lib/widgets/chat/mode_switcher.dart`（**它其实是语音模式入口**，不是 LiteRT 开关）、Kotlin 的 `LitertEngine.kt` 与 `com.ibloc.shadow/litert` channel（上面两个页面还要）、`lib/services/prefrontal_client.dart`（十几个页面在用）、`lib/providers/network_provider.dart` + `network_service.dart`（通用连通性工具，不是 LiteRT 专属）。⑪ **⚠️ 本轮撞上的环境坑（值得单独记一笔）**：同仓**另一个会话**（任务看板那条线，session `mvs_8bbfff99…`）在同一棵树上写文件 ⇒ 两边抢 `flutter test` 的 `build/` 与 `.dart_tool/` ⇒ 测试进程被**直接杀掉**（`exit=-1`，**没有任何错误输出**），看着像代码崩了。**排查办法**：把改动 `git diff -- <只有我的文件> | git apply` 到一个 `git worktree add --detach <dir> HEAD` 里单独跑 ⇒ **逐个文件单跑全部 exit=0**、整包 `--concurrency=1` 也全绿 ⇒ **代码没问题**。剩下的解释是**环境**：本机 16 GB 内存，当时空闲只剩 1.4~2.8 GB（Chrome / Feishu / 另一个会话的 flutter test 一起吃），`flutter_tester` 被 OOM 杀掉；等内存松一点重跑就全绿。**教训**：撞到「进程毫无输出地退出（exit=-1）」先查内存和同仓并行会话，别急着改代码。⑫ **⚠️ 还没做的**：设备上那个 **2.41 GB** 的 `gemma-4-E4B-it.litertlm` 还没清、真机首页复验还没做（等设备接上）；移动端对端脑 `tool_call` 仍然**零渲染/执行**（㉑ 条记的缺口，不在本轮范围）。
**Updated:** 2026-10-30 (㉓ **移动端任务看板改走端脑方言（原来打的是前额叶方言 + 桌面端口，手机上必然取不到）** —— 用户报「手机端任务看板任务获取失败」。① **根因两层叠加**：看板走 `PrefrontalClient.getTasks()` → 前额叶方言的 `/hippocampus/api/tasks`，而 `PrefrontalClient` 的 baseUrl 恒为 `http://localhost:60080`（**桌面 sidecar** 的端口，手机上没人监听）；**且**移动端不编本地海马体、嵌入式大脑那条面是纯端脑方言 ⇒ `/hippocampus/api/*` 一条路由都没有。② **改走端脑**：`TelencephalonClient` 新增 `listTasks` / `createTask` / `updateTaskStatus` / `confirmTask` / `deleteTask`（`/api/telencephalon/tasks*`），看板的 `TasksNotifier` 整个换源；数据在 temporal lobe 的 `TaskStore`（**进程内存，重启即丢**）。③ **⚠️ 线上形状三个坑**：`status`/`priority` 是 serde **变体名**（PascalCase：`Pending`/`InProgress`/`Completed`/`Cancelled`/`Overdue` 与 `Low`/`Medium`/`High`/`Urgent`）；时间字段 **snake_case**（`due_time`/`created_at`/`updated_at`）；**没有子步骤**（`steps` 是海马体的概念）⇒ 详情弹窗「子任务」页签改成「确认点」（`confirmation_points`），编辑弹窗只开放**状态**（端脑只给状态提供更新端点；标题/优先级仅「待确认」的任务能靠确认端点顺带改；描述与标签只在创建时写入）。「待确认」的任务在详情页有「确认任务」按钮（端脑只调度**确认过**的任务）。④ **⚠️ 写操作本来会 503**：端脑 `tasks_admin::verify_admin` 在「没配 admin key」时回 503，而**嵌入式大脑配不出 admin key**（Android 环境变量由 zygote 决定）⇒ 已改成与 `agent_management`/`test_reset` 同一套约定（空 key = 开发模式放行）。**端脑改了 ⇒ 手机的 `libencephalon.so` 变了 ⇒ 要重编 + 重打 APK**。⑤ **大脑的模型来源可显式选择**（承 ㉒ 条）：以前是「第一个云端供应商 wins」，**没法切回本地 neuron 权重**。新增 `BrainModelSource`（`local` / `cloud:<modelId>` / 没选过 = 自动，自动档保持旧行为），存新的 `app_settings` 表（SQLite v3→v4），UI 在「设置 → 嵌入式大脑」页的「大脑模型来源」卡片。**⚠️ 切换会重启大脑**（LLM 上游是 Rust 侧全局槽位，`boot` 时读一次）⇒ `applyModelSource()` = 记选择 → stop → start。⑥ **验证**：`flutter analyze` **0 error**（80 issues 全是既有风格 info）；`flutter test` **285/285 全绿**（新增 24 条）。⑦ **两个测出来才发现的坑**：**(a)** `package:http` 的 `http.Response(body, 200)` 不带 content-type 时按 **latin1** 编码响应体 ⇒ 中文被 `AsciiCodec` 拒掉（`Invalid argument (string): Contains invalid characters.`）—— mock 响应必须带 `content-type: application/json; charset=utf-8`；**(b)** `flutter test` **并行**跑多个文件、共用同一个 `shadow.db` ⇒ 真库的读会被别的文件的写锁住、永远不返回 ⇒ 大脑自动启动卡住、整个测试文件跟着挂（症状是随机文件 `did not complete`）⇒ 凡是启动大脑的测试都要把 `appSettingsRepositoryProvider` 覆盖成内存版。⑧ **⚠️ 还没做的**：端脑任务存储是**进程内存**（重启即丢），要做持久化得让端脑落盘或回到海马体（海马体在移动端不编）；任务看板目前也只支持端脑这一种来源，桌面端那条「海马体任务」分区（`CortexTaskSection`）在移动端没有对应物。)
**Updated:** 2026-10-30 (㉒ **嵌入式大脑默认启动（不再需要开关）+ 端脑「等大脑就绪」的门 —— 真机验通**：承 ㉑ 条，把「嵌入式大脑」从「设置页里一个要手动点的开关」改成「App 一起来就在跑」。① **实现落在 notifier 的 `_init()`**：它是大脑状态的唯一所有者，也掌握云端供应商的交接顺序 ⇒ `_init()` 改成「查状态 → 已在跑就接管（并把 client 指向端脑面）→ 没在跑就自动 `ensureStarted()`」；`ensureStarted()` 是**幂等**入口（已在跑直接 true；用 `_startInFlight ??= _startWithRetry()` 防并发 boot）；失败自动重试 **3 次**（2s / 4s 退避）—— App 刚起来时端口/SQLite/native 库都可能在就绪途中，一次失败不该让用户手动再点一次。`main.dart` 改用 **app 生命周期的 `ProviderContainer` + `UncontrolledProviderScope`**（不用根 widget 的 `ref.watch` —— 那会让每次大脑状态变化都重建整个 `MaterialApp.router`），`runApp` **之后**调 `ensureStarted()`（放 runApp 之后，别挡首屏）。② **⚠️ 启动顺序不能反**：必须先 `_applyCloudProvider()`（等 `modelsProvider.notifier.ready`）再 `_service.start()` —— Rust 侧 boot 时读 `llm_provider` slot 并用它 `set_default_model_for_all_lobes(model)`，顺序反了叶区就 `NO_MODEL_CONFIGURED`；真机 logcat 里 `✅ LLM provider set` **永远在** `✅ Encephalon started` **之前**。③ **管理页按钮改成上下文式**：跑着时**只显示「停止大脑」**（OutlinedButton），没在跑时才出现「启动大脑」（FilledButton）—— 它不再是常驻开关，而是**失败/手动停掉之后的恢复入口**。真机实测：运行中页面只有「停止大脑」（**没有**那个常驻的禁用开关）→ 点停 → 状态变「已停止」、端口释放、「启动大脑」出现 → 点它 → 又回到「运行中」。④ **⚠️ 真机测出来的竞态（已修）**：端脑 client 是**单例**，`setBaseUrl` 直接改它 ⇒ 大脑起来之前它指着 `TelencephalonClient.defaultBaseUrl`（`http://127.0.0.1:60080`，**移动端没人监听**）⇒ 启动期间发出的第一条消息会 connection refused。**实测时间轴**（小米 MIX 4，冷启动，`START u0` 为 t0）：Flutter 首帧 t=2.165s → Activity `Displayed` t=2.434s → **端脑面就绪 t=2.458s** ⇒ **UI 可交互到大脑就绪只有 ~25ms**，人类基本碰不到；**但大脑启动重试时窗口会拉长到 2s / 4s**（`_startWithRetry` 的退避），那时就能撞上。**修法 = 给端脑 client 加「就绪门」**：`TelencephalonClient.readinessGate`（宿主挂上来的 `Future<void> Function()`），**门挂在 `_u()` 这个「读 `_baseUrl`」的唯一收口上**，不是发请求那一步 —— 地址是发请求前拼好的，等晚了拼出来的还是那个死端口；`EncephalonMobileNotifier` 在构造时把 `waitUntilReady` 挂上去：大脑没在跑 ⇒ **拉起来再等**（这就是「默认启动，不需要开关」），用户**主动停过**（`_stoppedByUser` 标记）⇒ 立即返回（**不偷偷把用户刚停掉的大脑拉回来**，恢复得他自己点「启动大脑」），上限 15s（起不来就让请求照常失败，别把用户永远吊在「发送中」）。⑤ **⚠️ 两条既有红测试的真相（都不是 bug，是断言过时）**：(a) `test/widget/chat_screen_test.dart`「can enter text and tap send button」—— 旧断言 `expect(find.text('Hello, Shadow!'), findsNothing)` 本意是「输入框被清空」，但 `find.text` **同时匹配 `Text` 和 `EditableText`**，消息真的发出去之后这句话会作为**用户消息气泡**留在会话里 ⇒ 命中的是气泡不是输入框。那条旧断言是在「消息根本发不出去」的年代写的（`425e666` 之前 `generateResponse` 带 `mode == litert && isLitertReady` 守卫，在没有本地模型的测试环境里**直接 return**，什么都不会发生，测试也就「绿」了）⇒ 改成断言 **TextField 的 controller 为空** + **气泡存在**（后者比「找不到文本」更能证明发送成功）。(b) `test/unit/chat_provider_test.dart` 那 2 条图片/相机用例 —— 根因**不是** `setMode(litert)` 自动 `initLitert()`（构造时 `litertReady: true` ⇒ `setMode` 根本不会调 `initLitert`），而是 `425e666` 把 `generateResponseWithAttachments` 的条件**反转**了：旧规则是「本地引擎**就绪** + 有图 ⇒ 报图片不可用」，可 `_convertAttachmentsToLitertFormat` 恰恰会把图片转成 `{'image': base64}` 喂给本地引擎 —— **旧规则和那段代码自相矛盾**，`425e666` 修的是真 bug ⇒ 改成按**正确契约**断言：本地引擎**没就绪** ⇒ 报「图片不可用」；本地引擎**就绪** ⇒ 交给本地引擎、不报错。⑥ **⚠️ widget 测试的陷阱（别再踩）**：`testWidgets` 的 fake-async 区里 **sqflite ffi 开库是真实文件 I/O、永不完成** ⇒ 自动启动卡在「等模型列表就绪」、状态永远 `starting` ⇒ 解法：在 `setUpAll`（真异步区）先 `await DatabaseHelper.instance.database;` 打开一次，之后 getter 直接返回缓存实例。`pumpAndSettle()` 也不足以等 MethodChannel + SQLite 的自动启动 ⇒ 自己写 pump 循环等状态条件。⑦ **⚠️ 真机坐标的坑**：`adb shell input` 要用 **uiautomator dump 出来的真实 bounds**（输入框 `[297,2014][893,2146]` → 中心 (595,2080)；**软键盘弹起后布局上移**，发送按钮变成 `[915,1306][1047,1438]` → 中心 (981,1372)）。按截图比例换算的坐标（y=2147）**刚好落在 bounds 外** ⇒ tap 静默落空、看起来像「App 没反应」，白排查半天。⑧ **真机验通**：`am force-stop` → `am start`（**不点任何按钮**）⇒ logcat `✅ LLM provider set: http://192.168.31.147:8899/v1 model=mock-model` → `✅ Encephalon started on port 40635 (agent surface: 38713)`；端脑面 `/.well-known/agent.json` 200 + `/shadow/v1/agents` 200（**四个 native 叶区** parietal/prefrontal/temporal/occipital 全 `health_status: healthy`）、neuron 面 `/health` → `{"status":"healthy","service":"neuron"}` + `/v1/models` 24 个；从 App UI 发一条 `GATE-CHECK` → **MOCK-OK** 回显，PC 上 mock 上游收到的原始请求里 `system` = 叶区默认人设 + 会话人设拼接（1150 字符）、`user` = `GATE-CHECK` ⇒ **人设与多轮真的穿过了每一跳**。⑨ **测试基线**：本轮结束时 `flutter test` **261 passed / 0 failed**（此前 249 passed / **3 failed**），`flutter analyze --no-pub` **84 issues / 0 error**（基线 87）。**反向验证**（每条都做过）：注释掉 `_init()` 里的 `ensureStarted()` ⇒ 3 条变红；把 `generateResponseWithAttachments` 的条件退回旧的 ⇒ 3 条变红；恢复 `generateResponse` 的旧守卫 ⇒ `chat_screen_test` 变红（`Found 0 widgets`）；短路 `_u()` 里的 `_awaitReady()` ⇒ 2 条门测试变红；去掉 `_stoppedByUser` ⇒ 1 条变红。)
**Updated:** 2026-10-30 (㉑ **端脑的 `tool_call` 分支以前是死的 —— 已在真机上验通（但「模型自己调客户端工具」还没做）**：承 ⑳ 条，端脑 SSE 的 `tool_call` 是「影子给客户端换主题」那条产品线的地基，这轮查到底并修好。① **定性**：端脑的 `tool_call` 只有**外部 A2A 对端**能触发（native 叶区路径全程只产 `Delta`/`Error`）⇒ 之前它**永远不可能出现**。② **根因在 synapse**（不是端脑、也不是设备）：A2A 官方 `StreamResponse` **没有任何一类能承载工具调用**；synapse 服务端把 `ToolStart` 拍平成纯文本 `Calling tool: name(args)`、客户端又把不是失败的 `StatusUpdate` **全部丢弃** ⇒ 工具调用在线上被消灭。③ **修法**：`StatusUpdate.metadata` 开一条结构化旁路（键 `synapse_tool_event`），服务端写、客户端还原；**纯文本保留** ⇒ 老对端行为不变。反向验证：短路客户端还原 ⇒ 圆跳测试 **FAILED**（`left: 0, right: 1`）。④ **真机验通**：新增 `tool/mock_a2a_agent.mjs`（确定性 A2A 对端）→ 用 `POST /api/telencephalon/admin/agents/register` 注册进**手机**的端脑 → 手机的端脑真的发出 `event: tool_call`（`name=set_theme`、`args={"color":"#71717A"}`）。⑤ **⚠️ 移动端这边的真实缺口**：端脑会发 `tool_call` 了，但**移动端没有任何渲染/执行它的代码**（桌面端有骨架 `ToolPartRouter`/`ClientToolForm` 但也**零消费方**）⇒ 「模型让客户端换主题」这条闭环在两端都还没接上；且跑通的那个 `tool_call` 来自**外部对端**，不是模型自己决定的（叶区 `call_llm` 还没带 `tools` 字段）。⑥ **⚠️ `.so` 的跨仓依赖**：`telencephalon` 是 `synapse` 的 path 依赖 ⇒ **synapse 改了手机里的 `libencephalon.so` 就变了**，改 synapse 后必须重跑 `scripts/build-android.ps1`（4-5 min）+ 重打 APK 装机，端脑能力才会真的变。
**Updated:** 2026-10-30 (⑳ **移动端对话页根本进不了端脑链路 —— 真机上撞出来的三个洞（都修了）**：⑲ 条把链路的断点定位到「叶区 → LLM」那一跳；这轮把那一跳补上并**在真机上验到底**，顺带挖出三个洞，其中一个是**「所有通信都要走大脑 → 端脑 → 叶区」这条规则在移动端 UI 面上一直是断的**。① **LLM 供给通道（不依赖环境变量）**：neuron's remote 引擎**只认** `NEURON_REMOTE_BASE_URL` / `NEURON_REMOTE_MODELS` / `NEURON_REMOTE_API_KEY`，而 Android App 进程的环境变量由 zygote 决定、宿主注入不了（Android 10+ 连 `/proc/<pid>/environ` 都读不到）⇒ 环境变量路线在移动端是**死的**。于是走程序化注册：宿主把本地 SQLite `models` 表里 `source='cloudProvider'` 的那条推给大脑（`EncephalonRuntime.setLlmProvider` → JNI `nativeSetLlmProvider` → `encephalon_mobile_set_llm_provider` → `Embedded::boot` 里注册进 neuron 的**派发表** `state.engines.llm`）。⚠️ **注册引擎 ≠ 叶区会用它**：叶区按**模型 id** 请求，宿主还必须 `set_default_model_for_all_lobes(model)`，两件都做才会通。**端点要含 `/v1`**（neuron 拼的是 `{base_url}/chat/completions`）。**供应商配置读的是本地 `models` 表，不是 `providers_screen.dart` 那条路** —— 后者走 Prefrontal 后端（移动端已内嵌/离线），且 `ProviderInfo.fromResponse` 把 `apiKey` 丢了。② **⚠️ 产品缺口：移动端**配不出**云端供应商** —— 空状态提示写着「点击右下角添加模型」（`modelEmptyHint`），但那个按钮**根本不存在**：`_addLocalModel` / `_addCloudModel` 定义了却**零调用方** ⇒ 那句提示是骗人的，用户点了右下角什么也不会发生。补上 FAB + `_showAddModelSheet`（本地 / 云端二选一）。顺带：`ModelsNotifier` 增加 `late final ready` —— 首次加载是异步的（开库 → 扫本地模型 → 查表），宿主等它才能读模型列表，不等会误判成「用户没配供应商」。③ **⚠️ 移动端对话页永远进不了端脑链路**（真机上卡在「初始化中…」、标题是 **LiteRT**）：`ChatNotifier` 构造函数无条件调 `_initLiteRT()`，而它**一上来就把 `mode` 设成 `ChatMode.litert`** ⇒ `chat_screen.dart` 的 `isLitertMode` 恒为 true ⇒ 恒渲染 **`PrefrontalChatView`** —— 而那条视图走的是**前额叶方言**（`/api/sessions`），「改嵌大脑」之后端脑面上**根本没有这条路由** ⇒ 永远转圈。更要命的是 `generateResponse` 的守卫 `mode == litert && isLitertReady` —— 两个条件说的都是**本地** LiteRT 引擎 ⇒ **没装本地模型的设备上一条消息都发不出去**（函数直接返回），`local_chat_view.dart` 里输入框的 `enabled` 也是同一个条件 ⇒ **输入框整个是禁用的**。修法（Dart 侧）：`mode` 只在**本地引擎真的就绪**时才设成 litert（从 `_initLiteRT()` 挪到 `initLitert()` 的成功分支）；`generateResponse` / `generateResponseWithAttachments` **总是**走 `_generateLitertResponse`（它自己的语义本来就是「**先端脑、后本地**」）；新增 `ChatState.canChat` 取代「本地引擎就绪」作为输入框可用的条件。**这条的意义不止是「聊天能用」** —— 它正是「两个客户端都要维持 大脑 → 端脑 → 叶区 这条链路」在移动端 **UI 面**的兑现。④ **装机验证（真机，逐段实测）**：模型管理页加云端供应商（`mock` / `http://192.168.31.147:8899/v1` / `testkey` / `mock-model`）→ 设置 → 嵌入式大脑 → 启动大脑 ⇒ 端脑面 `127.0.0.1:38535`、neuron 面 `127.0.0.1:40315`（端口每次随机，用 `adb forward` + `ss -tln` 找）；`POST /shadow/v1/conversations/{id}/messages` → **200 `"reply":"MOCK-OK"`**；**PC 上的 mock 上游收到的原始请求**里 `system` = 叶区默认人设 + 会话人设拼接、`messages` = 4 条（上一轮 user + 上一轮 assistant + 当前轮 user）⇒ **人设与多轮都真的穿过了每一跳**。**错误信息的形状是判据**：断链 = `Failed to get models: ... (http://localhost:60080/v1/models)`（端点错）→ 命中 neuron 但无模型 = `NO_MODEL_CONFIGURED` → 引擎注册错 = `no_engine_for_model` —— 三种形状指三个不同的洞。⑤ **⚠️ UI 操作的两个坑（别再试）**：`input keyevent 111`(ESC) 与 `input keyevent 4`(BACK) 都会**直接关掉**「添加云端模型」对话框（`input text` **不会**唤起软键盘）⇒ 只能填完**直接点「添加」**；而且**软键盘弹起后对话框会上移**，字段坐标会变 —— 要按键盘弹起后的坐标填，否则 URL 会落进「模型名称」那一栏。

**Updated:** 2026-10-30 (⑲ **真机复验：设置页白屏结案 + 链路最后一跳的根因**：设备重新接上（小米 MIX 4 / `2106118C` / Android 13 / arm64-v8a / Odin+SD835），把上一条挂着的「真机未验」与「设置页正文全白」一起做完了。① **「设置页正文全白」的根因不是渲染器，是旧 APK 的代码**：设备上那个包是 **10-29 08:34** 装的，而修它的提交 `8f293a8`（引入 ShadcnUI + 升 Flutter 3.47.8，给 `GlassCard` 的 child 套 `Material(type: transparency)`）是 **12:28** —— 旧包在它之前。旧版设置页正文用 `GlassCard` 包 **`ListTile`**，而 Flutter 3.47.8 在 `ListTile` 被有背景色的祖先包裹时 debug 模式会 `FlutterError.reportError`（`list_tile.dart:1147` `_debugCheckBackgroundIsHidden`）⇒ **body 子树构建中断 ⇒ 整片正文不画**，而 AppBar / 底栏（不在那个子树里）照常显示 —— 症状与「白屏」完全吻合。**AGENTS.md 里那条「widget 测试渲染出 52 段文本」不能用来排除代码 bug**：测试跑的是 `895e668` 重构**之后**的代码，不是旧包里的代码。**已排除的三条嫌疑（都实测过，别再走一遍）**：`--ez enable-impeller false` 的 A/B **无效** —— Flutter 3.47.8 里 opt-out 已 deprecated（`shell.cc:527` 打的是「Impeller opt-out deprecated」警告），但 `flutter_main.cc:124-139` 的 `SelectedRenderingAPI` 仍会返回 `kSkiaOpenGLES` ⇒ **确实切到了 Skia**（logcat 里 `AdrenoGLES-0` = GLES 路径），而设置页**照样全白**；`pm clear` 清空应用数据后**照样全白**（不是持久化状态）；logcat 里**没有任何 Flutter 异常**（`E/flutter` 一条都没有 —— 不是构建期抛错）。**像素级测量给出的真相**：设置页正文区域 maxChannel 只有 **19/255**（卡片其实**画出来了**，只是暗色玻璃 `surfaceDarkGlass = 0x14FFFFFF`（alpha 8%）+ 边框 `borderDarkDefault = 0x1FFFFFFF`（alpha 12%）在纯黑底上肉眼不可见）—— 而任务看板页同样的卡片 maxChannel 是 250（**可见**），因为它用的是另一套更亮的 `AppColors.darkSurfaceGlass` / `darkBorder`（**两条路径用了不同的玻璃色**）。切浅色模式（`cmd uimode night no`）验证：浅色玻璃 `0xB3FFFFFF`（alpha 70%）本该很显眼，**正文依然空白** ⇒ 推翻「alpha 太低」这个假设 ⇒ 回到「子树没构建」。**重装新包后设置页完全正常**（外观组 / 主题色含新 logo「绛」色 / 玻璃强度 / 语音与辅助 / 连接组 / 高级折叠全部渲染）。② **链路真机复验的结论（三段都活着，断点精确定位在最后一跳）**：重编 `libencephalon.so`（`encephalon/scripts/build-android.ps1`，33 分钟，150.5 MB）+ 重打 APK（含 `e0ae904` 链路改造的 Dart 代码）后装到真机 ⇒ **端脑面起来了**（`files/flows` 目录的 mtime 正好是点「启动大脑」那一刻；`ss -tln` 找到随机端口，`/.well-known/agent.json` 与 `/shadow/v1/agents` 都 200，三个 native 叶区 temporal/prefrontal/parietal/occipital 都在），**neuron 的 OpenAI 面也活着**（`/health` → `{"status":"healthy"}`，`/v1/models` → 25 个模型），**端脑会话创建也成功**（`POST /shadow/v1/conversations` → 200 + RFC3339 `created_at`，正是本文件上面记的那个 wire 形状）。**但发消息断在最后一跳**，错误把根因说得很清楚：`POST /shadow/v1/conversations/{id}/messages` 与 `:stream` 都返回 **`502` / `{"error":{"code":5022,"message":"Failed to get models: error sending request for url (http://localhost:60080/v1/models)"}}`** —— 叶区仍在打 **`localhost:60080`**（那是**桌面 sidecar 的端口**，移动端上没人监听），而 neuron 的真实地址是 `127.0.0.1:<随机端口>`。③ **根因是「改了一套存储、调用读的是另一套」**（已在上游 `telencephalon` 修）：`NativeLobeRegistry` 同时持有 `inner`（`Arc<dyn NativeLobe>`，**shadow API 走这条**）与 `runtimes`（`LobeRuntime`，带 `openai_base_url`）；`reconfigure` / `point_lobes_at_neuron` 改的是**后者**，而 `build_lobe_client_with` 拿的是**前者**，且 `LobeClient::NativeWithConfig` 自己读环境变量 `TELENCEPHALON_NEURON_URL`、读不到就退回硬编码的 `http://localhost:60080` ⇒ **`point_lobes_at_neuron` 对实际调用路径完全无效**（桌面端 `cortex_http.rs:126` 用的是同一个 `reconfigure`，**所以桌面端有完全相同的 bug**）。修法：让 `LobeClient` **携带宿主配好的端点**（新增 `NativeAt(lobe, config, url)` 变体，端点取自 registry 的 runtime），环境变量只作兜底；配 2 条回归测试（端点必须真的到 client 上 / 永远不许退回那个死端口）。④ **⚠️ 移动端还差最后一环**：neuron 里 `available_count = 0`（无本地模型），而 **neuron 的所有 LLM 后端（candle / litert / mistralrs / llamacpp / remote）都靠环境变量选**（`NEURON_LLM_RUNTIME` / `NEURON_REMOTE_BASE_URL` 等），**App 进程注入不了环境变量**（Android 的 zygote 决定）⇒ **「移动端怎么给 neuron 配 LLM」是个真问题**，现有 `model_download_service.dart` 走的是 **LiteRT `.litertlm`**（Kotlin 侧），与 neuron 的 candle/gguf 是**两套引擎**、**接不上**。这是真机验完链路后暴露的下一层，不是本条能顺手解掉的。
**Updated:** 2026-10-28 (移动端「改嵌大脑」落地：嵌入式运行时换成与桌面端**同一个**大脑 `encephalon`（`libencephalon.so` 经 MethodChannel `com.ibloc.shadow/encephalon_runtime` 加载），不再是前额叶 lobe —— **两端嵌入的运行时现在一致了**。嵌入运行时内**再挂一层端脑面**（telencephalon `cortex_router`，`127.0.0.1` 随机端口），Dart 侧把端脑 client 指过去，**对话**与**会话列表**从前额叶方言迁到端脑方言；soul / tasks / memory / providers / skills / mcp / agents 列表页与语音会话模式**仍在前额叶方言**（端脑面上一条前额叶路径都没有，见根 `AGENTS.md` §「移动端 agent 面：两套「方言」与嵌入式大脑」）。移动端**不编本地海马体**（记忆走零信任网络内其它设备）⇒ Lance 退出移动端依赖图。旧的嵌入式前额叶支线（`/settings/prefrontal` + `libprefrontal_core_lib.so`）仍在，但已是**遗留**路径)
**Updated:** 2026-10-28 (收口残留的 `:8082`：移动端主链是端脑 `:60080`，但 6 处代码仍按前额叶 `:8082` 走。其中 4 处是纯端口残留（服务健康检查清单 / continue-on-desktop 手工填端点 / localPeer / 注释），改成 `:60080`；1 处（log 面板的 `/api/logs/stream`）只有前额叶有该路由，改连**本机嵌入式前额叶的真实端口**；3 处属于 **WebRTC companion 死代码**（自引用闭环、零外部引用，且 WS 路径 `/api/sessions/{id}/ws` 是前额叶专属、端脑的是 `/api/webrtc/{modality}/...`），按孤儿代码惯例整段删除并摘掉 `flutter_webrtc` 依赖)
**Updated:** 2026-10-28 (补上 **嵌入式 Prefrontal 运行时**（NDK `.so`）这条支线：MethodChannel/JNI 链路、`.so` 来源与缺失降级、以及它在整体架构里的位置 —— 移动端主链是端脑 telencephalon，嵌入支线跑的是前额叶；桌面端已升级为嵌大脑 `encephalon`，**两端嵌入的运行时目前不一致**。另：补上 `com.ibloc.shadow/prefrontal_runtime` channel（此前漏登记）)
**Updated:** 2026-09-25 (post-audit-cycle: telencephalon-centric view confirmed; port `:60080` unified; references [`2026-09-25-e2e-coverage-assessment.md`](../../docs/superpowers/architecture/2026-09-25-e2e-coverage-assessment.md))
**Project:** shadow-mobile (Layer 4 Interaction + thin on-device Engine via Kotlin Native)

> **Note (2026-07-19)**: This doc was previously framed as a "Layer 4 + Layer 2 hybrid" with 3 user-configurable modes. That framing predates **Telencephalon** (Layer 3.5). Current architecture: mobile is **primarily Layer 4** (Flutter UI); the on-device inference capability lives in the **Kotlin Native** layer (OpenAIServer.kt + LiteRT/MNN), exposed as a sidecar HTTP server on `:8085` when the user opts in. The default mobile flow routes everything through **telencephalon** (`:60080`).

## ARCHITECTURAL ROLE

Shadow-Mobile is the **Interaction Layer (Layer 4)** mobile client of the Shadow Platform. It is a **thin UI client** that talks to:

- **Agent Orchestrator (Telencephalon, Layer 3.5)** via `/api/telencephalon/*` — **primary** path; the mobile app routes most agent / flow / MCP / conversation / discovery operations through telencephalon
- **Agent Layer (Prefrontal)** via OpenAI `/v1/*` and A2A — **fallback** when telencephalon unreachable (note: `dacbe83` removed automatic fallback for `continue-on-desktop`)
- **Embedded Encephalon runtime** as an in-process NDK `.so` (`libencephalon.so`) — the **same brain** shadow-desktop embeds (`encephalon::Embedded::boot()`): thalamus + ACP 总线 + 端脑 + 单一 neuron (see §EMBEDDED ENCEPHALON RUNTIME). Its embedded **agent surface** is the telencephalon `cortex_router` on `127.0.0.1:<random>` — the **telencephalon dialect** only
- **Embedded Prefrontal runtime** as an in-process NDK `.so` — a **legacy** path (see §EMBEDDED PREFRONTAL RUNTIME). It embeds a *lobe* (prefrontal), not the brain; superseded by the embedding above
- **Local inference** via Kotlin `OpenAIServer.kt` (MNN / LiteRT bindings) on `:8085` when in **Phone-as-Engine** opt-in mode

**Reference**: `/home/ibloc/Projects/docs/superpowers/specs/2026-06-04-shadow-architecture-redesign.md`

## KEY PRINCIPLE: THIN CLIENT

The mobile app should NOT directly know about LLM/TTS/ASR internals. It only:
1. Sends user input to Agent (OpenAI `/v1/chat/completions` or A2A)
2. Receives streamed responses (SSE / WebSocket)
3. Plays TTS (via `/v1/audio/speech` response)
4. Captures mic audio (VAD-driven `audio_ws_service`)
5. Renders UI (Flutter 3.11+ with Riverpod 2.5 + GoRouter 14.8)
6. Surfaces native-platform capabilities (Android Accessibility for automation, MNN/LiteRT for on-device inference)

## OPERATING MODES (v2.8+ — post 2026-08-18)

| Mode | Path | Route | What happens |
|---|---|---|---|
| **Voice Assistant** (default) | `/voice` | mic → ASR → LLM (telencephalon or LiteRT) → TTS → shadow-esp32 USB / phone / BT | Interactive speech dialog. phone runs everything; shadow-esp32 is USB Audio sink + mic source. |
| **Live Stream** | `/livestream` | phone TTS text input → TTS → shadow-esp32 USB / phone / BT | TTS playback / read-aloud mode. shadow-esp32 is USB Audio sink only. |
| **Customer Service** | `/customer-service` | phone cellular call → shadow-esp32 USB / wired earphone | AI auto-answer phone calls. shadow-esp32 plays caller voice + AI TTS. Earphone takeover when plugged in. |

Both modes route audio via `UsbAudioRouter` (v2.5) to whichever output the user selects in the screen header:

| Output | Code | Description |
|---|---|---|
| **phone speaker** | `ShadowOutputRoute.phoneSpeaker` | Built-in speaker / wired headset |
| **BT headset** | `ShadowOutputRoute.bluetoothHeadset` | Standard Android Bluetooth; phone handles pairing |
| **shadow-esp32** | `ShadowOutputRoute.shadowEsp32` | `UsbAudioRouter.routeTo()` → `AudioManager.preferredDevice` |

The `ShadowOperationModeProvider` / `ShadowOutputRouteProvider` Riverpod state holds the current selection. A "Live" bottom-nav tab (added to `MainShell`) drives to `/livestream`; tapping the mic icon from there jumps back to `/voice`.

## PLATFORM CHANNELS (registered in `MainActivity.configureFlutterEngine`)

| Channel | Direction | Purpose |
|---|---|---|
| `com.ibloc.shadow/litert` | ⇅ | Load / infer / diagnose LiteRT model |
| `com.ibloc.shadow/engine` | ⇅ | Start/stop OpenAIServer, mDNS, auth, port config |
| `com.ibloc.shadow/tts` | ⇅ | Android TTS engine |
| `com.ibloc.shadow/accessibility` | ⇅ | Android Accessibility automation |
| `com.ibloc.shadow/mdns` | ⇅ | Discover + resolve `_shadow._tcp` services |
| `com.ibloc.shadow/mnn_logs` | ← | EventChannel: logcat streaming |
| `com.ibloc.shadow/pcm_audio` | ⇅ | Start/stop 16kHz PCM recording |
| `com.ibloc.shadow/pcm_audio_stream` | ← | EventChannel: PCM chunks to Dart |
| `com.ibloc.shadow/http_server` | ⇅ | MobileActionServer start/stop |
| `com.ibloc.shadow/engine` | ⇅ | Phone-as-Engine OpenAI server |
| `com.ibloc.shadow/ble_provision` | **v2.5** ⇅ | `provision(ssid, psk)` writes shadow-esp32 Wi-Fi creds via GATT |
| `com.ibloc.shadow/usb_audio` | **v2.5** ⇅ | `listRoutes` / `routeTo(id)` route Android audio to shadow-esp32 USB sink |
| `com.ibloc.shadow/call_state` | **v2.8** ⇅ | InCallService call events: `onCallState(idle/ringing/active/ended)`, `onEarphoneTakeover(taken)`, `setAiAutoAnswer(enabled)`, `setPreferredDevice(device)` |

> **Design note (v2.6+):** `com.ibloc.shadow/ble_provision` and `com.ibloc.shadow/usb_audio` were added in v2.5 to support the BLE provisioning flow. The `voice_conversation_screen.dart` and `livestream_screen.dart` screens automatically call `UsbAudioRouter.routeTo()` on initialization when they detect a connected shadow-esp32 — no explicit user-tap needed after initial provisioning.

```
shadow-mobile/
├── pubspec.yaml                         # Flutter package (Dart SDK ^3.13.0)
├── lib/
│   ├── main.dart                        # Entry — initializes AppConfig + ModelManager + Riverpod
│   ├── litert_engine.dart               # LiteRT LM engine wrapper
│   ├── litert_model.dart                # LiteRT model metadata + load
│   ├── mnn_engine.dart                  # MNN inference engine wrapper (uses Android Kotlin/C++ bridge)
│   ├── tts_engine.dart                  # TTS pipeline
│   ├── model_manager.dart               # Model registry + lifecycle
│   ├── model_config.dart                # Model configuration types
│   ├── router/
│   │   └── app_router.dart              # GoRouter declarative routes
│   ├── agents/                          # In-process agent runtimes
│   │   ├── a2a/                         # A2A client + message + server stubs (3 files)
│   │   ├── main_agent/                  # Main chat orchestrator (prompt + tools, 3 files)
│   │   ├── mobile_action_agent/         # Android-action sub-agent (Accessibility-based, 4 files)
│   │   └── providers/                   # agent_provider (Riverpod)
│   ├── screens/                         # 19 UI pages
│   │   ├── agents_screen.dart / chat_screen.dart / conversation_screen.dart
│   │   ├── flows_screen.dart            # Browse / run telencephalon flows (Sprint 1, commit 55ffc95)
│   │   ├── group_screen.dart / mcp_screen.dart / memory_screen.dart
│   │   ├── model_management_screen.dart / model_settings_screen.dart
│   │   ├── prompt_settings_screen.dart / providers_screen.dart / settings_screen.dart
│   │   ├── setup_wizard_screen.dart     # First-run wizard (telencephalon discovery + model check)
│   │   ├── skills_screen.dart / soul_screen.dart / task_board_screen.dart
│   │   ├── voice_conversation_screen.dart  # Hands-free voice mode
│   │   └── manage/                      # Sub-management screens
│   ├── services/                        # Wire-level + service layer (23 files)
│   │   ├── cortex/                      # cortex_client.dart — HTTP to telencephalon :60080 (dir name kept for git history)
│   │   ├── prefrontal/                  # Embedded prefrontal (.so) JNI bridge + settings page (4 files)
│   │   ├── database/                    # SQLite repositories (11 files)
│   │   ├── genui/                       # GenUI server helpers (Agent2UI)
│   │   ├── audio_ws_service.dart        # WebSocket audio streaming (VAD-driven)
│   │   ├── wake_word_service.dart       # Wake-word detection
│   │   ├── accessibility_controller.dart  # Android Accessibility API bridge
│   │   ├── session_transfer_service.dart  # Cross-device session transfer
│   │   ├── soul_service.dart            # "Soul" agent persistence
│   │   ├── model_download_service.dart  # Model puller (delegates to neuron `/v1/models/pull`)
│   │   ├── mdns_discovery.dart          # `_shadow._tcp` browsing
│   │   ├── network_service.dart         # connectivity_plus wrapper
│   │   ├── group_service.dart           # mTLS group manager
│   │   ├── engine_service.dart          # Inference engine coordination
│   │   ├── log_service.dart             # Rolling file logger (mobile-side)
│   │   ├── pcm_audio_recorder.dart      # PCM mic capture
│   │   ├── video_frame_collector.dart   # Camera frame capture for multimodal
│   │   ├── agent_review_service.dart    # Agent-review flow (approve / reject draft flows)
│   │   ├── app_config_service.dart      # App-level config init
│   │   └── prefrontal_client.dart       # HTTP client to telencephalon :60080 (/v1/* shim; chat/TTS/ASR)
│   ├── providers/                       # Riverpod state (14 providers)
│   │   ├── ai/                          # AI-specific providers (model registry, embeddings)
│   │   ├── cortex_provider.dart
│   │   ├── chat_provider.dart / conversation_mode_provider.dart
│   │   ├── flow_provider.dart / genui_provider.dart
│   │   ├── mnn_agent_integration.dart
│   │   ├── model_download_provider.dart / engine_models_provider.dart
│   │   ├── wake_word_provider.dart / theme_provider.dart / log_provider.dart
│   │   ├── service_provider.dart / error_dialog_provider.dart
│   ├── multimodal/                      # Audio / image / file input handlers (5 files)
│   ├── models/                          # Data classes (conversations, agents, flows, etc.)
│   ├── skills/                          # Skill definitions
│   ├── flutter_genui/                   # GenUI runtime (Agent2UI)
│   ├── theme/                           # Material 3 + glassmorphism themes
│   ├── widgets/                         # Reusable widgets
│   ├── utils/                           # Helpers (logging, formatting, etc.)
│   ├── config/                          # Build-time config
│   ├── l10n/                            # i18n strings (zh / en arb files — see i18n section)
│   └── generated/l10n/                  # Generated AppLocalizations (from arb files)
├── android/                             # Android platform code (Kotlin + C++)
│   └── app/src/main/
│       ├── kotlin/com/ibloc/shadow/
│       │   ├── MainActivity.kt          # Platform Channels registration
│       │   ├── PrefrontalAccessibilityService.kt
│       │   ├── litert/LitertEngine.kt   # Google AI Edge LiteRT
│       │   ├── mnn/                     # MNN wrapper
│       │   ├── pcm/PcmAudioRecorder.kt  # 16kHz PCM recording
│       │   ├── tts/TtsManager.kt
│       │   ├── http/MobileActionServer.kt  # HTTP server for mobile-action sub-agent
│       │   ├── OpenAIServer.kt          # Phone-as-Engine OpenAI-compat server (port 8085)
│       │   └── ...
│       └── cpp/                         # C++ JNI bridge
│           └── mnn_bridge.cpp
├── ios/                                 # iOS platform code (Swift / Objective-C)
│   └── Runner.xcodeproj/
└── assets/
    ├── models/                          # Default model catalog (small JSONs)
    └── config/                          # Default config files
```

## INBOUND PROTOCOLS (calls Telencephalon, then Prefrontal as fallback)

All HTTP calls go to standard endpoints. **No direct engine calls** — the mobile app never speaks `/v1/chat/completions` directly when telencephalon is reachable.

```dart
// LLM Chat (streaming)
POST {host}/v1/chat/completions       // via telencephalon or prefrontal
  body: { model, messages, stream: true }
  returns: SSE

// TTS
POST {host}/v1/audio/speech
  body: { model: "tts-1", input: "Hello", voice: "alloy", response_format: "mp3" }
  returns: audio/mpeg

// ASR (when needed)
POST {host}/v1/audio/transcriptions
  body: multipart { file, model: "whisper-1" }
  returns: { text }

// Conversations (telencephalon preferred — `/shadow/v1/conversations`)
POST {host}/shadow/v1/conversations                // create
GET  {host}/shadow/v1/conversations                // list
POST {host}/shadow/v1/conversations/{id}/messages  // send (may return SSE)

// WebSocket streaming (chat)
WS {host}/api/sessions/{id}/ws

// Agent discovery
GET  {host}/.well-known/agent.json  → A2A AgentCard
```

## TELENCEPHALON-SPECIFIC ENDPOINTS (Sprint 1+2)

`lib/services/telencephalon/telencephalon_client.dart` (~814 lines after 2026-09-27 telencephalon migration) is the canonical caller for everything except chat/TTS/ASR (which still go through `prefrontal_client.dart` against the telencephalon `/v1/*` shim).

```dart
// === Health / discovery ===
Future<Map<String, dynamic>> health()                  // GET /.well-known/agent.json
Future<AgentsResponse>    listAgents()                 // GET /shadow/v1/agents
Future<Map<String, dynamic>> getAgent(String name)     // GET /shadow/v1/agents/{name}

// === Conversations (Sprint 1 — telencephalon persistence) ===
Future<Conversation> createConversation({agent, systemPrompt})  // POST /shadow/v1/conversations
Future<Conversation> getConversation(String id)                 // GET  /shadow/v1/conversations/{id}
Future<List<Conversation>> listConversations()                  // GET  /shadow/v1/conversations
Future<Conversation> importSessionAsConversation(...)           // POST session-export → conversation
Future<SendMessageResponse> sendMessage(id, req)                // POST /shadow/v1/conversations/{id}/messages

// === Flows (Sprint 1 — flows via telencephalon) ===
Future<List<FlowMeta>>      listFlows({name, tag, isDraft})      // GET    /api/flows
Future<FlowDefinition>      createFlow(FlowDefinition flow)      // POST   /api/flows
Future<FlowDefinition>      getFlow(String id)                   // GET    /api/flows/{id}
Future<FlowRunResult>       runFlow(flowIdOrName, inputs, ...)   // POST   /api/flows/{id}/run
Future<List<FlowDefinition>> listDrafts()                       // GET    /api/flows/draft
Future<FlowDefinition>      promoteDraft(draftId)                // POST   /api/flows/draft/{id}/promote
void                       rejectDraft(draftId)                 // POST   /api/flows/draft/{id}/reject

// === Admin (via shared surface with desktop) ===
// MCP / WASM / agent install / LLM description — same routes as desktop's telencephalon client
```

Mobile-specific helpers (NOT in desktop's telencephalon client):
- `importSessionAsConversation(...)` — converts a `SessionExport` JSON into a telencephalon conversation so the phone can pick up where another device left off
- **continue-on-desktop flow** (per `dacbe83`) — uses telencephalon only (no prefrontal fallback); the mobile app discovers the desktop's telencephalon endpoint and routes the chat session there

### 端脑会话的 wire 形状（别照着前额叶方言抄）

端脑的 `ConversationTurn` 在 Rust 侧是 `{ role, text, at }`，`at: DateTime<Utc>`
序列化成 **RFC3339 字符串**：

```json
{ "role": "user", "text": "hi", "at": "2026-10-29T01:23:46.123456789Z" }
```

**字段名是 `at`，不是 `timestamp`。** 前额叶方言用的才是 `timestamp`（毫秒整数）。
只认 `timestamp` 的客户端读到一条历史就会 `(json['timestamp'] as num).toInt()`
撞上 `null` → `_TypeError`，于是**会话列表页和 session transfer 的导入响应
一起崩**。`ConversationTurn.fromJson` 现在两种形状都认（见
`lib/services/telencephalon/telencephalon_client.dart`），回归测试在
`test/telencephalon_client_test.dart` 的 *conversation wire shape* 组里。

其它容易抄错的地方：

| 字段 | 端脑实际发的 | 说明 |
|---|---|---|
| `created_at` / `updated_at` | RFC3339 字符串 | `DateTime.parse` 直接能解 |
| `history[].role` | `"user"` / `"agent"` | 不是 `"assistant"` |
| `history[].at` | RFC3339 字符串 | **不是 `timestamp`** |
| `SendMessageResponse.timestamp` | 毫秒整数 | 这个**是**整数 |
| `agents[].agent_card.metadata.*` | `input_modalities` / `output_modalities` / `capabilities` | 空数组会被 `skip_serializing_if` 省略 |

端脑注册了三个 native lobe：**`temporal` / `prefrontal` / `parietal`**
（`NativeLobeRegistry::with_temporal()`）。`createConversation()` 不带 agent 时
服务端用 `CORTEX_DEFAULT_AGENT` 或 `"temporal"`。

## OUTBOUND PROTOCOLS (when Mobile is in Phone-as-Engine mode)

When the user enables **Phone-as-Engine** in Settings, the Kotlin `OpenAIServer.kt` exposes an OpenAI-compatible HTTP server on `:8085`:

```
POST /v1/chat/completions    # Delegates to LiteRT.generateContent()
GET  /v1/models              # Lists installed .litertlm files
```

This allows a desktop/Prefrontal agent to call `http://mobile.local:8085/v1/chat/completions` and use the phone's local LLM. mDNS `_shadow._tcp` advertises the service with capabilities TXT records.

## mDNS SERVICE DISCOVERY

On startup, the app browses `_shadow._tcp` services via `mdns_discovery.dart`:

```dart
// mDNS query for _shadow._tcp services
// then for each found service:
//   - GET http://host:port/.well-known/agent.json  → A2A AgentCard
//   - POST http://host:60080/api/telencephalon/agents  → register self (if user opts in)
//   - open WS ws://host:60080/api/webrtc/... for companion mode（端脑确实有这条路由，
//     但移动端 2026-10-28 把旧的 WebRTC companion 链当死代码删了，尚未接回来）
```

Persist discovered hosts in `preferences` (or SQLite via `group_service.dart`); the user can pin favourites on the Group page (`group_screen.dart`).

## COMPANION MODE (WebRTC) —— 2026-10-28 整段删除

原实现三个文件（`lib/services/webrtc_companion.dart`、`lib/services/webrtc_signaling.dart`、
`lib/providers/companion_mode_provider.dart`）**自引用闭环、零外部引用**：`companionModeProvider`
从未被任何 screen/widget 读取，`CompanionModeNotifier.start()` 从未被调用，
`telencephalon_client.webrtcSignalingUrl()` 也从未被引用 —— 整条链不可达。

而且它指向的服务已经变了：`WebRtcSignaling` 拼的是 **`/api/sessions/{id}/ws`**，那是
**Prefrontal 专属**路由（`prefrontal/src/server/routes.rs:76`）；Telencephalon 的 WS 路由是
`/api/webrtc/{modality}/sessions/{id}/ws`（`telencephalon/src/api/webrtc_route.rs:36`）。
原代码的 primary 是端脑 `:60080`、fallback 是前额叶 `:8082` —— 两边的路径都对不上。

故按「孤儿代码」惯例删除（git 历史保留），并从 `pubspec.yaml` 摘掉 `flutter_webrtc`
（它唯一的使用者就是 `webrtc_companion.dart`；摘掉后 APK 不再带 `libjingle_peerconnection_so.so`）。

要重做 Companion Mode 时：`TelencephalonClient.webrtcSignalingUrl(sessionId, modality)`
已经是正确的 URL 构造器，直接接上 `flutter_webrtc` 即可。

> 消息式 **Conversation Mode**（WebSocket 一次性语音消息，非实时）不受影响 ——
> 那条路走 `conversation_mode_provider` + `audio_ws_service.dart`，仍在。

## AGENTS (in-process)

`lib/agents/` hosts three runtimes + their providers:

| Subdir | Files | Role |
|---|---|---|
| `a2a/` | `a2a_client.dart` / `a2a_message.dart` / `a2a_server.dart` | A2A message types + client (outbound HTTP to other telencephalon / prefrontal / external) + server stub |
| `main_agent/` | `main_agent.dart` / `main_agent_prompt.dart` / `main_agent_tools.dart` | Primary chat orchestrator; system prompt + tool registry; runs on-device in Standalone mode |
| `mobile_action_agent/` | `actions.dart` / `mobile_action_agent.dart` / `mobile_actions_tools.dart` / `mobile_actions_viewmodel.dart` | Sub-agent that calls `AccessibilityController` to tap / swipe / type on Android UI elements |
| `providers/` | `agent_provider.dart` | Riverpod glue |

The `main_agent` is intentionally thin — for any non-trivial task (file ops, code edits, browser automation), it delegates to a **telencephalon flow** via `TelencephalonClient.runFlow(...)`. The `mobile_action_agent` is one of the few exceptions (it must run on-device because it touches the Android Accessibility API).

## PLATFORM CHANNELS (Flutter ↔ Kotlin)

| Channel | Purpose |
|---|---|---|
| `com.ibloc.shadow/litert` | LiteRT model load + inference |
| `com.ibloc.shadow/mnn` | MNN model load + inference |
| `com.ibloc.shadow/tts` | Android TTS engine |
| `com.ibloc.shadow/accessibility` | Android Accessibility automation |
| `com.ibloc.shadow/mdns` | Network discovery |
| `com.ibloc.shadow/mnn_logs` | Logcat streaming |
| `com.ibloc.shadow/pcm_audio` | Audio recording control |
| `com.ibloc.shadow/pcm_audio_stream` | Audio data stream (EventChannel) |
| `com.ibloc.shadow/http_server` | Mobile action server |
| `com.ibloc.shadow/prefrontal_runtime` | 嵌入式 Prefrontal 运行时（NDK `.so`）：`start` / `stop` / `isHealthy` / `getStatus` / `registerAgent` / `invokeAgent` / `startAndroidService` / `stopAndroidService` |
| `com.ibloc.shadow/encephalon_runtime` | 嵌入式 **大脑** 运行时（NDK `libencephalon.so`）：`start`（入参 `port` + `dataDir`，返回 `success` / `port` / `agentPort`）/ `stop` / `getPort` / `isHealthy` / `getStatus`（返回 `running` / `port` / `agentPort` / `healthy`）/ `infer`。**端脑面端口**看 `agentPort`：正数 = 端脑面在监听；**0 = 大脑在跑但端脑面没起来**（此时客户端不指过去）；**-2 = 大脑整个没在跑** |
| `com.ibloc.shadow/engine` | Phone-as-Engine OpenAI server: `startServer` / `stopServer` / `isServerRunning` / `getServerUrl` / `getApiKey` / `setApiKey` / `setAuthEnabled` / `getServiceName` |
| `com.ibloc.shadow/ble_provision` | **v2.5** — `provision(ssid, psk)` writes shadow-esp32 Wi-Fi creds via GATT |
| `com.ibloc.shadow/usb_audio` | **v2.5** — `listRoutes` / `routeTo(id)` route Android audio to shadow-esp32 USB sink |

## EMBEDDED PREFRONTAL RUNTIME (NDK `.so`, 2026-10-28)

手机进程内嵌一份 Prefrontal（前额叶）运行时，让 agent 能力在**没有远端服务器**时也能用。

```
Flutter → MethodChannel(com.ibloc.shadow/prefrontal_runtime)
        → PrefrontalRuntimeService (Kotlin)
        → JNI (Java_com_ibloc_shadow_PrefrontalRuntime_*)
        → libprefrontal_core_lib.so (Rust, 40MB/ABI)
        → axum mini HTTP server (127.0.0.1:<port>)
```

- **Dart 侧**：`lib/services/prefrontal/prefrontal_mobile_service.dart`（MethodChannel + HTTP 客户端）、`prefrontal_mobile_provider.dart`（Riverpod 状态）、`prefrontal_mobile_cluster_page.dart`（管理页）
- **入口**：路由 `/settings/prefrontal`，从「设置 → 嵌入式 Prefrontal」进
- **Kotlin 侧**：`android/app/src/main/kotlin/com/ibloc/shadow/PrefrontalRuntime.kt`（6 个 `external fun`）+ `PrefrontalRuntimeService.kt`
- **`.so` 不入库**：兄弟仓 [prefrontal](https://github.com/iBLOC/prefrontal) 的构建产物，按需用它的 `scripts/build-android.sh` 编，拷到 `android/app/src/main/jniLibs/<abi>/`。名字必须是 `prefrontal_core_lib`（Kotlin 侧 `System.loadLibrary("prefrontal_core_lib")`）
- **`.so` 缺失不崩**：`PrefrontalRuntime` 的 `init{}` 不重抛 `loadLibrary` 失败，各 native 调用点自己 catch `UnsatisfiedLinkError`，错误落进 `MainActivity` 已有的 `SO_NOT_LOADED` 分支

**这条支线在整体架构里的位置（重要）**：移动端**主链**是端脑 telencephalon（`:60080`，见 `engine_models_provider.dart`「Telencephalon is the single platform entry point」），prefrontal 在 HTTP 侧只是 fallback（`:8082`）。嵌入支线跑的却是**前额叶**——即 telencephalon 管的 lobe 之一，不是「大脑」本身。桌面端已经升级为嵌**大脑**（`encephalon::Embedded::boot()`）。**2026-10-28 起，移动端也改成嵌大脑了**（见下一节），这条前额叶支线降级为**遗留**路径。

## EMBEDDED ENCEPHALON RUNTIME (NDK `.so`, 2026-10-28)

手机进程内嵌的**大脑**（与桌面端同一个 `encephalon`），让 agent 能力在**没有远端服务器**时也能用。

```
Flutter → MethodChannel(com.ibloc.shadow/encephalon_runtime)
        → MainActivity (Kotlin)
        → JNI (Java_com_ibloc_shadow_EncephalonRuntime_*)
        → libencephalon.so (Rust cdylib)
        ├─ neuron 面 (127.0.0.1:<port>)     推理 / OpenAI 兼容
        └─ 端脑面 (127.0.0.1:<agentPort>)  telencephalon cortex_router
```

- **Rust 侧**：`encephalon` 仓的 `mobile` feature（`src/mobile/{mod.rs,jni.rs}`）。`MobileStack` 里同时跑 **neuron**（推理）与**端脑面**（`telencephalon::boot::build_app_state_with(..)` + `cortex_router`，`axum::serve` 绑 `127.0.0.1:0` 取随机端口）。端脑面起不来**不影响**大脑本体，只是 agent 面暂时要退回外部端脑
- **Kotlin 侧**：`android/app/src/main/kotlin/com/ibloc/shadow/EncephalonRuntime.kt`（6 个 `external fun`）+ `MainActivity.setupEncephalonRuntimeChannel()`
- **Dart 侧**：`lib/services/encephalon/encephalon_mobile_service.dart`（MethodChannel 封装）+ `encephalon_mobile_provider.dart`（Riverpod 状态）+ `encephalon_mobile_page.dart`（管理页）
- **入口**：路由 `/settings/encephalon`，从「设置 → 嵌入式大脑」进
- **`.so` 不入库**：兄弟仓 [encephalon](https://github.com/iBLOC/encephalon) 的构建产物，用它的 `scripts/build-android.ps1` 编（`-Target` 切 ABI），拷到 `android/app/src/main/jniLibs/<abi>/`。名字必须是 `encephalon`
- **`.so` 缺失不崩**：`EncephalonRuntime` 的 `init{}` 不重抛 `loadLibrary` 失败，各 native 调用点自己 catch `UnsatisfiedLinkError`，错误落进 `MainActivity` 已有的 `SO_NOT_LOADED` 分支
- **`dataDir` 必须显式给**：Android 没有 `$HOME`、进程 CWD 是 `/`（不可写），端脑的 flow（工作流）存储要写在 App 私有目录里。`start` 的 `dataDir` 参数优先，缺省回落 `filesDir?.absolutePath`
- **默认启动，不需要开关**（2026-10-30 改）：App 一起来 `EncephalonMobileNotifier._init()` 就把大脑拉起来（已在跑就接管），用户**不必**去 `/settings/encephalon` 点「启动大脑」。管理页上那个按钮**只在没在跑时出现**（失败/手动停掉之后的恢复入口），跑着时只有「停止大脑」。详见本文顶部 ㉒ 条
- **端脑 client 有「等大脑就绪」的门**：`TelencephalonClient.readinessGate` 由 `EncephalonMobileNotifier` 挂上，**门挂在 `_u()`（读 `_baseUrl` 的唯一收口）上** ⇒ 大脑起来之前发出的请求会**等**，而不是打到一个没人监听的端口上

**移动端不编本地海马体**：记忆走零信任网络内其它设备上的 hippocampus 服务 ⇒ `telencephalon` 把 `hippocampus-server` 改 optional，**Lance 退出移动端依赖图**（实测 mobile profile 构建日志里没有 `lance` crate）。代价：移动端**没有本地长期记忆**，会话只留在内存里。

**端脑面只说端脑方言**：嵌入式端脑面 = telencephalon 的 `cortex_router`，它**一条前额叶路径都没有**。所以 `PrefrontalClient`（`/api/sessions`、`/api/agents`、`/api/soul/*` …）**不能**指过去 —— 指了只会把「连接被拒」换成「404」。只有 `TelencephalonClient` 指过去，且目前只用得上 `/shadow/v1/*` 与 `/.well-known/agent.json` 两条线（对话 + 会话列表）。完整的方言对照见根 `AGENTS.md` §「移动端 agent 面：两套「方言」与嵌入式大脑」。

**验证手段**（2026-10-30 更新）：宿主 JVM 直测 `encephalon` 仓 `scripts/jni-host-test/`（**21/21 全绿**，含端脑面端口、`/.well-known/agent.json` 200、`/shadow/v1/conversations` 有响应、flow 目录落在给定 `dataDir` 下）+ Flutter 单测 **261/261 全绿**（2026-10-30 复查）+ 交叉编译 `.so` + APK 打包验收。**真机**（小米 MIX 4 / 2106118C / Android 13 / arm64-v8a）：端脑面**已经跑起来并验通**（`/.well-known/agent.json` 200、`/shadow/v1/agents` 200 且四个 native 叶区全 `healthy`、neuron 面 `/health` healthy + `/v1/models` 24 个、从 App UI 发一条消息拿到上游的 `MOCK-OK`）—— 见本文顶部 ⑲ / ⑳ / ㉒ 条与下节「真机调试清单」。

### 真机调试清单（2026-10-29）

```powershell
$adb='C:\Users\87462\AppData\Local\Android\Sdk\platform-tools\adb.exe'
& $adb devices -l                       # USB 断了就是空；Windows 侧看不到 MTP/ADB 接口就是真没插
& $adb mdns services                    # 局域网里的无线调试设备（Android 11+ 走 mDNS）
& $adb install -r -g -d '<apk>'         # MIUI 可能拦：INSTALL_FAILED_USER_RESTRICTED
& $adb shell am start -n com.ibloc.shadow/.MainActivity
& $adb exec-out screencap -p > "$env:TEMP\shot.png"
& $adb logcat -d -v brief | Select-String 'flutter|Dart'
```

- **MIUI 安装拦截**：安全中心关掉「安装监控」之后 `adb install` 才能过。`settings`/`appops`/`pm install`/`file://` 唤起安装器/`adb root`（生产版不允许）全都无效。
- **无线调试**：`adb mdns services` 里会列出 `adb-<model>/<serial> _adb._tcp <ip>:<port>`。⚠️ **同网段可能混着别人的设备** —— 2026-10-29 扫到 `192.168.31.235:5555` 是一台 `mi_lx04`（armeabi-v7a / SDK 27 / 800×480），**不是**目标机，连上后确认 `ro.product.model` / `ro.build.version.sdk` / `wm size` 再操作，别往陌生设备上装 APK。
- **✅ 移动端可以走 WiFi 调试（2026-11-01 实测）** —— 走 **`adb tcpip`** 这条路（不是 Android 11+ 的「无线调试」开关，那台机的 `settings get global adb_wifi_enabled` = **0**，没开）：

  ```powershell
  & $adb -s ee6b4832 tcpip 5555      # 需先插着 USB；设备端改跑 TCP 模式
  & $adb connect 192.168.31.85:5555   # 连上后 mDNS 里会出现 adb-ee6b4832
  & $adb devices -l                   # USB 与 WiFi 两条通道同时在线
  ```

  ⚠️ **三条纪律**：**(a)** `tcpip` **要 USB 起步**（先插一次线切模式，再拔线）；**(b)** **脚本要显式传 `-Serial 192.168.31.85:5555`** —— 三支真机脚本不传 `-Serial` 时会数设备数，**两台在线 ⇒ 直接 exit 2**；**(c)** ⚠️ **`tcpip 5555` 是明文、无 TLS、无配对** ⇒ 同网段任何人可连 ⇒ 调试完 **`adb disconnect` + `adb -s <serial> usb`** 收回。

  ✅ **实测证据**：WiFi 序列号下 `shell` / `logcat` / `forward` / `run-as` 全通；`prove-provider-doors-on-device.ps1` **13 发探针红 0 条**（三道门 + 回归全绿）；`prove-a2ui-on-device.ps1 -SkipUi` **7 条全过**（真机 A2UI 链路成立）；`flutter devices` 同时列出 `ee6b4832` 与 `192.168.31.85:5555`。
- **关掉 Impeller 做 A/B（不用重打 APK）**：`FlutterShellArgs.fromIntent` 会读 intent extra `enable-impeller`（`engine/.../FlutterShellArgs.java:57,145-151`），Flutter 3.41.4 上实测 `--enable-impeller=false` 仍能落到 Skia 分支（`flutter_main.cc:127` 的 `warn_on_impeller_opt_out` + `SelectedRenderingAPI` 的 `kSkiaOpenGLES`）：
  - ✅ **2026-10-30 在 Flutter 3.47.8 上重新实测过，这条路径仍然有效**：`flutter_main.cc:268-303` 的 `SelectedRenderingAPI` 在 `enable_impeller == false` 时跳过 Impeller 分支、落到 `kSkiaOpenGLES` ⇒ `settings.enable_impeller = false`；日志里出现 `shell.cc:527` 的 `[Action Required]: Impeller opt-out deprecated` 警告 + `AdrenoGLES-0`（GLES 路径）就是「切到 Skia 了」的证据（opt-out 虽已 deprecated，但**仍被接受**）。

  ```powershell
  & $adb shell am force-stop com.ibloc.shadow
  & $adb shell am start -n com.ibloc.shadow/.MainActivity --ez enable-impeller false
  ```

**设置页在真机上正文全白（2026-10-30 已结案 —— 根因是旧 APK，不是渲染器）**：症状是 AppBar 与底部导航正常，正文整片不绘制。**当时的推理链是错的**，实测结论如下：
- ❌ **不是 Impeller / BackdropFilter**：上面那个 `--ez enable-impeller false` 的 A/B **实测无效** —— 确实切到了 Skia（`AdrenoGLES-0`），而设置页**照样全白**。
- ❌ **不是持久化状态**：`pm clear com.ibloc.shadow` 清空应用数据后**照样全白**。
- ❌ **不是 build 异常 / ErrorWidget 吞掉**：logcat 里 `E/flutter` **一条异常都没有**（只有 MIUI 系统噪音）。
- ❌ **不是「玻璃 alpha 太低」**：像素级测量显示正文区域 maxChannel 只有 **19/255** —— 卡片其实**画出来了**，只是暗色玻璃 `surfaceDarkGlass = 0x14FFFFFF`（alpha 8%）在纯黑底上不可见；任务看板页同样卡片可见是因为它用的是**另一套更亮的** `AppColors.darkSurfaceGlass` / `darkBorder`（**两条路径用了不同的玻璃色**）。但切浅色模式（浅色玻璃 alpha 70%，本该很显眼）后**正文依然空白** ⇒ 推翻这个假设。
- ✅ **真根因：设备上的 APK 太旧**。那个包是 **10-29 08:34** 装的，而修复它的提交 `8f293a8`（引入 ShadcnUI + 升 Flutter 3.47.8，给 `GlassCard` 的 child 套一层 `Material(type: transparency)`）是 **12:28** —— 旧包在它之前。旧版设置页正文用 `GlassCard` 包 **`ListTile`**，而 Flutter 3.47.8 在 `ListTile` 被有背景色的祖先包裹时，debug 模式会 `FlutterError.reportError`（`list_tile.dart:1147` `_debugCheckBackgroundIsHidden`）⇒ **body 子树构建中断 ⇒ 整片正文不画**；AppBar / 底栏不在那个子树里，所以照常显示。**重装新包后设置页完全正常。**
- ⚠️ **教训**：当时用「widget 测试里渲染出 52 段文本」来排除代码 bug 是**无效的** —— 测试跑的是 `895e668` 重构**之后**的代码，不是旧包里的代码。**真机症状与源码不一致时，先确认真机上跑的是哪份代码。**


**Android 交叉编译探针**：`scripts/android-cross-probe/`（2026-10-28 加）。验任意 Rust crate 能否编到 `aarch64-linux-android` —— 判断「改嵌大脑」可行性的唯一硬判据。实测结论：**wasmtime 不是 blocker，synapse 能编过；第一个真 blocker 是 `rquickjs-sys` 没有 Android 绑定**（`zen-engine` → `rquickjs` → `rquickjs-sys`，只支持 14 个桌面/musl/wasm32 平台）。用法与三条修法见该目录的 `README.md`。

## MULTIMODAL INPUT

`lib/multimodal/` wraps three input channels:
- `audio_input_handler.dart` — mic capture via `record` package; PCM chunks → `pcm_audio_recorder.dart`
- `image_input_handler.dart` — `image_picker` + `camera`; feeds `video_frame_collector.dart` for streaming
- `file_input_handler.dart` — `file_picker`; uploads to telencephalon via `TelencephalonClient`

`multimodal_input_manager.dart` multiplexes these into a single inbound stream consumed by `main_agent`.

## ANDROID NATIVE (MNN + LiteRT)

`android/app/src/main/cpp/mnn_bridge.cpp` is the JNI bridge between Dart (`lib/mnn_engine.dart`) and the MNN C++ runtime. MNN is the on-device inference engine for older / lower-end devices. LiteRT (via `lib/litert_engine.dart` + `lib/litert_model.dart`) is the newer path for devices that ship Google's LiteRT-LM. The Kotlin side wraps both into a single `OpenAIServer.kt` that exposes an OpenAI-compatible `/v1/*` surface on `:8085`.

**LiteRT init timeout + model-dir diagnosis** (recent fix): previously hanging forever; now 10s timeout, calls `diagnoseModelDirectory` first, shows download dialog immediately if model missing.

## i18n

Two ARB files (auto-generated Dart bindings live in `lib/generated/l10n/`):
- `lib/l10n/app_en.arb`
- `lib/l10n/app_zh.arb`

CI runs `flutter_localization_linter` — adding a UI string to only one locale fails the build.

## CONVENTIONS

- Flutter 3.47+ with Dart SDK `^3.13.0`（CI 固定 3.47.8 / Dart 3.13.7）
- Riverpod 2.5 for state management (`flutter_riverpod`)
- GoRouter 14.8 for declarative routing (`lib/router/app_router.dart`)
- speech_to_text 7.0 for ASR fallback
- sqflite 2.3 (mobile) + sqflite_common_ffi 2.3 (desktop tests) for local persistence
- genui 0.7 + genui_a2ui 0.7 for Agent2UI
- flutter_ai_toolkit 1.0 for chat UI primitives
- freezed_annotation + json_annotation for DTOs
- **Never** call `/v1/chat/completions` directly from a screen — always go through a provider or service
- i18n strings MUST appear in both `app_en.arb` and `app_zh.arb`
- Kotlin 1.9, NDK 27.2, Gradle 8.14, Java 17
- mTLS for secure communication (via `group_service.dart`)
- Network security config permits cleartext to `localhost` / `127.0.0.1` / `10.0.2.2` / `*.local` (dev only)

## BUILD COMMANDS

```bash
flutter pub get
flutter run                                # debug on attached device
flutter test                               # unit tests
flutter test integration_test              # integration tests
dart analyze                               # linter; 100 info-level issues as of 2026-07-19 (0 errors)
flutter build apk --release                # Android APK
flutter build appbundle --release          # Android App Bundle
flutter build ios --release --no-codesign  # iOS (unsigned; signing handled by Xcode)
flutter build web --release                # Web SPA (experimental — not the primary target)

# Trigger phone-as-Engine mode (after UI button or automatic on Engine-Only config)
adb shell am start -n com.ibloc.shadow/.MainActivity

# Discover the phone from a Linux machine
avahi-browse -rt _shadow._tcp

# Tail mobile logs
adb logcat | grep shadow
```

## BUILD TARGETS

| Target | Output | Notes |
|---|---|---|
| Android (APK / App Bundle) | `build/app/outputs/{apk,flutter-apk,bundle}/*` | Primary target; on-device MNN / LiteRT for offline inference |
| iOS | `build/ios/iphoneos/Runner.app` | Secondary target; requires Apple Developer account |
| Web (experimental) | `build/web/` | No native inference; routes everything through telencephalon or prefrontal HTTP |

## CODE HEALTH

```
$ dart analyze
100 issues found.   # 0 errors, 100 info-level (deprecation warnings + avoid_print + use_null_aware_elements)
```

No errors, no warnings — only style-level info issues (deprecated `value` / `activeColor` form-field props, stray `print()` calls in services, null-check patterns that could use `?.` shorthand).

## STATE STATUS (2026-07-19)

**Completed** ✅ (recent additions marked 🆕):
- 🆕 **Telencephalon client** (`lib/services/cortex/cortex_client.dart`, ~814 lines after 2026-09-27 migration) — wired for agents / conversations / flows / drafts / agent mirror / import-session-as-conversation; all of Sprint 1+2 surface
- 🆕 **FlowsScreen** (`lib/screens/flows_screen.dart` + commit `55ffc95`) — browse / run telencephalon flows from the phone
- 🆕 **continue-on-desktop via telencephalon only** (`dacbe83`) — chat sessions hand off to a desktop telencephalon without falling back to prefrontal
- 🆕 **telencephalon-embedded neuron+hippocampus paths** (`05aa697`) — all hardcoded URLs updated to the telencephalon-embedded model (`:60080/hippocampus/api/...`)
- **VAD-driven barge-in** via `audio_ws_service.dart` + `wake_word_service.dart`（Companion Mode 的 WebRTC 那部分已于 2026-10-28 作为死代码删除，见 §COMPANION MODE）
- **Mobile sub-agent** (`lib/agents/mobile_action_agent/`) — AccessibilityController-driven UI automation as a telencephalon-flow tool
- **A2A message types + client** (`lib/agents/a2a/`) — outbound A2A delegation to other telencephalon / prefrontal instances
- **Main agent** (`lib/agents/main_agent/`) — system prompt + tool registry; runs locally in Standalone mode
- **Multimodal input** — audio / image / file via `lib/multimodal/`, including `video_frame_collector.dart` for camera-streaming
- **Wake-word detection** — `wake_word_service.dart` for "Hey Shadow"-style invocation
- **Session transfer** — `session_transfer_service.dart` + `SessionExport` for cross-device handoff
- **Soul agent persistence** — `soul_service.dart` for user-persona state
- **Model downloader** — delegates to neuron's `/v1/models/pull` via `model_download_service.dart` + `model_download_provider.dart`
- **mDNS discovery** — `mdns_discovery.dart` for `_shadow._tcp` browsing + `group_service.dart` for mTLS trust
- **i18n** — `app_en.arb` + `app_zh.arb` with `flutter_localization_linter` enforcement
- **Database layer** — `lib/services/database/` with repositories for agents / MCP servers / skills / models
- **Agent review** — `agent_review_service.dart` for approve / reject draft flows
- **Voice conversation screen** — `lib/screens/voice_conversation_screen.dart` for hands-free mode
- **Phone-as-Engine mode** (`OpenAIServer.kt` on port 8085, SSE streaming, bridged to `LitertEngine` via `EngineProvider`, mDNS `_shadow._tcp` advertisement with capabilities TXT records)
- **Engine Platform Channel** `com.ibloc.shadow/engine` (startServer/stopServer/isServerRunning/getServerUrl/getApiKey/setApiKey/setAuthEnabled/getServiceName)
- **Network security config** permitting cleartext to `localhost` / `127.0.0.1` / `10.0.2.2` / `*.local` (dev only)
- **LiteRT init timeout + model-dir diagnosis** — was hanging forever; now 10s timeout, calls `diagnoseModelDirectory` first, shows download dialog immediately if model missing

**In Progress** 🔄:
- Offline-first chat — main_agent can run locally for trivial replies but anything non-trivial still requires telencephalon or neuron HTTP
- **v2.5 — shadow-esp32 BLE provisioning flow** is wired (Kotlin + Dart) but the live-streaming screen doesn't yet auto-discover a shadow-esp32 over BLE; v2.6 adds an `onAttach` hook that opens the provisioning screen when the user plugs the device in
- **v2.5 — USB Audio routing** is wired at the platform-channel level (UsbAudioRouter.kt + usb_audio_routing_service.dart); the actual `setMode(MODE_NORMAL) / isSpeakerphoneOn = false / preferredDevice` calls land in v2.6 once the live-streaming screen flips them on user-tap
- **Provisioning — security** — SSID/PSK travel over BLE cleartext in v2.5; v2.6 enables BLE bonding + MITM protection to encrypt the GATT writes

**Planned** 📋:
- Companion Mode (WebRTC) 重做 —— 原实现已作为死代码删除（见 §COMPANION MODE）；重做时直接用 `TelencephalonClient.webrtcSignalingUrl()`
- Hot reload of telencephalon flows into the FlowsScreen without app restart (currently requires re-fetch via `flow_provider`)
- Voice wake word integration hardening
- ESP32 / hardware device pairing (per `2026-06-04-shadow-architecture-redesign.md` Phase 6)
- Voice cloning on mobile (per platform-wide v0.9+ backlog)
- A2UI streaming on mobile (genui_a2ui 0.7 already declared; widgets not yet wired)
- Battery-aware inference scheduling (throttle MNN / LiteRT when device is unplugged or below 20% battery)
- ~~Prefrontal mobile (as library, not server) via Tauri embedding or FFI~~ — **DONE as A2A** (`c5812a3`); FFI scaffolding removed

## RELATED PROJECTS

| Project | Path | Role |
|---|---|---|
| Shadow umbrella | `https://github.com/iBLOC/shadow` | Container for mobile + desktop |
| Shadow-Desktop | `https://github.com/iBLOC/shadow/shadow-desktop` | Sibling Layer 4 client (Tauri + React) |
| Prefrontal | `https://github.com/iBLOC/prefrontal` | Layer 3 (Agent) — used as fallback when telencephalon unavailable |
| **Telencephalon** | `https://github.com/iBLOC/telencephalon` | **Layer 3.5 (Orchestrator) — primary HTTP target** |
| Hippocampus | `https://github.com/iBLOC/hippocampus` | Layer 0 (Memory) — reached via telencephalon on `:60080/hippocampus` |
| neuron | [github.com/ibloc/neuron](https://github.com/ibloc/neuron) | Layer 2 (Engine) — on-device MNN / LiteRT, plus remote `:8085` HTTP |
| Resonance | `https://github.com/iBLOC/resonance` | Layer 5 (Cross-user orchestration) — discovered via mDNS but mobile does not currently push tasks |

## ENVIRONMENT VARIABLES (mobile build-time)

```bash
# Optional — only needed when targeting a specific telencephalon / prefrontal in dev
# ⚠️ 2026-11-05：这里**曾经**是一个拼错的端脑地址变量（TELE_ULR —— TELE_URL 的字母换位）
#    ⇒ ⇒ 而且**全仓没有任何读者**：移动端的端脑地址走应用配置文件里的 telencephalonBaseUrl
#    （lib/services/app_config_service.dart ⇒ 默认 http://127.0.0.1:60080）
#    ⇒ ⇒ 它**不是**环境变量 ⇒ ⇒ 已删（生产默认走 mDNS 发现；端口 2026-09 统一为 :60080，此前是 :8443）
export PREFRONTAL_HOST="http://localhost:8082"     # fallback only — `dacbe83` removed automatic fallback

# Model download defaults
export NEURON_DEFAULT_SOURCE="modelscope"           # mobile's `model_download_provider.dart` defaults to ModelScope
export HF_TOKEN="..."                                # for gated HuggingFace repos
export MODELSCOPE_TOKEN="..."                       # for gated ModelScope repos
```

## E2E COVERAGE (audit 2026-09-25)

Per [`2026-09-25-e2e-coverage-assessment.md`](../../docs/superpowers/architecture/2026-09-25-e2e-coverage-assessment.md), mobile's e2e coverage is held back by:

- **Silent skip pattern** in `integration_test/*.dart`: `api_flow_test.dart`, `memory_flow_test.dart`, `group_flow_test.dart`, `model_share_test.dart` all start with `isPrefrontalRunning()` and `return;` on false. **No CI matrix boots prefrontal** before these.
- **Stub app context** in `app_test.dart`, `conversation_flow_test.dart`, `task_flow_test.dart`: `app.main()` runs against a stub context with **no live Telencephalon client**.
- **No real-telencephalon e2e**: `cortex_client_test.dart` uses `http_testing.MockClient` only — no real `:60080` exercise.
- **Zero BLE / USB / InCallService e2e**: `com.ibloc.shadow/{ble_provision,usb_audio,call_state}` channels all uncovered.
- **Zero Live Stream / Customer Service e2e**: `/livestream` and `/customer-service` modes uncovered.

Sibling desktop has the same shape — see E2E assessment §3.6-3.9 for the desktop-side gaps.

## Commits (mobile-only, last 10)

| Hash | Description |
|------|-------------|
| (v2.5) | feat(mobile): BLE provisioning of shadow-esp32 + USB Audio routing for digital-human livestream PoC; complements shadow-esp32 v2.4/v2.5; `BleProvisioningService.kt` + `UsbAudioRouter.kt`; Dart `ble_provisioning_service.dart` + `usb_audio_routing_service.dart` + `provisioning_screen.dart`; new channels `com.ibloc.shadow/ble_provision` and `com.ibloc.shadow/usb_audio` |
| 05aa697 | feat(shadow-mobile): update all paths to cortex-embedded neuron+hippocampus |
| dacbe83 | feat(mobile): continue-on-desktop uses cortex only (no prefrontal fallback) |
| 55ffc95 | feat(mobile): add FlowsScreen for browsing/running cortex flows |
| (older — see git log) | Cortex client wiring (Sprint 1+2); main_agent + mobile_action_agent split; WebRTC companion mode; wake-word service; multimodal input; session transfer |

> The mobile project shares its git repository with shadow-desktop (`https://github.com/iBLOC/shadow/.git`), so commits are interleaved. Filter with `git log --author ...` or by `feat(mobile)` / `feat(shadow-mobile)` prefix.
