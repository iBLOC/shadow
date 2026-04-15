# Android 无障碍控制 API

项目已接入 Android 无障碍服务，具备通过代码控制设备的能力（点击、滑动、全局操作、按文本点击等）。

## 前置条件

- 仅 **Android** 平台有效，iOS/其他平台调用将 no-op 或返回 `false`。
- 用户需在 **系统设置 → 无障碍** 中手动开启「prefrontal」或「Prefrontal」服务；应用内可通过 **设置 → 无障碍控制** 跳转到系统无障碍设置页。

## 能力概览

| 能力 | 说明 |
|------|------|
| **点击** | 在指定屏幕坐标 (x, y) 执行短按 |
| **长按** | 在指定坐标执行长按 |
| **滑动** | 从 (x1,y1) 滑动到 (x2,y2)，可指定时长 |
| **全局操作** | 返回、Home、最近任务、通知栏、快捷设置、电源菜单 |
| **按文本点击** | 在当前前台界面中查找包含指定文字的控件并点击 |

## Flutter 使用方式

```dart
import 'package:shadow_mobile/services/accessibility_controller.dart';  // 或按项目包名调整

// 检查是否支持（Android）
if (!AccessibilityController.isSupported) return;

// 检查服务是否已开启
final enabled = await AccessibilityController.isEnabled;
if (!enabled) {
  await AccessibilityController.openSettings(); // 打开系统设置
  return;
}

// 点击坐标 (500, 1000)
await AccessibilityController.tap(500, 1000);

// 长按
await AccessibilityController.longPress(500, 1000);

// 从左上滑到右下，历时 300ms
await AccessibilityController.swipe(
  x1: 100, y1: 500, x2: 400, y2: 1500,
  durationMs: 300,
);

// 全局操作：返回、Home、最近任务等
await AccessibilityController.globalAction(GlobalAction.back);
await AccessibilityController.globalAction(GlobalAction.home);

// 在当前界面查找包含「确定」的控件并点击
await AccessibilityController.findAndClickByText('确定');
```

## Android 实现要点

- **PrefrontalAccessibilityService**：继承 `AccessibilityService`，在 `res/xml/accessibility_config.xml` 中声明 `canPerformGestures`、`canRetrieveWindowContent`，通过 `dispatchGesture` 派发点击/滑动手势。
- **MethodChannel**：`com.ibloc.shadow/accessibility`，由 `MainActivity` 处理 `isEnabled`、`openSettings`、`tap`、`longPress`、`swipe`、`globalAction`、`findAndClickByText`。
- 坐标单位为**像素**，以屏幕左上角为原点；滑动时长单位为毫秒。

## 理想设计（未实现部分）

- **节点树查询**：通过 `getRootInActiveWindow()` 获取完整可访问节点树并暴露给 Flutter（序列化结构、按 id/text/className 查询），便于更精细的 UI 自动化。
- **无障碍事件流**：将 `AccessibilityEvent` 流式推送到 Flutter（EventChannel），便于根据窗口/内容变化触发逻辑。
- **iOS**：若需在 iOS 上实现类似能力，需使用不同的系统 API（如辅助功能或私有 API），且受平台审核限制。
