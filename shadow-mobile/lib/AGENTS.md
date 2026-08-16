# lib/ - Flutter UI

## OVERVIEW

Flutter应用层代码。Dart实现。

## WHERE TO LOOK

| Task | Location |
|------|----------|
| 应用入口 | main.dart |
| MNN引擎封装 | mnn_engine.dart |
| 模型管理 | model_manager.dart |
| 无障碍控制 | services/accessibility_controller.dart |
| 云模型UI | features/cloud_models/widgets/cloud_model_widgets.dart |
| 本地模型UI | features/models/widgets/model_widgets.dart |

## ANTI-PATTERNS

- **main.dart** - 580行单文件，应拆分
- **无状态管理** - 全部setState
- **无路由** - Navigator.push硬编码

## CONVENTIONS

- Material 3设计
- 暗色主题支持
- Platform Channel: `com.ibloc.shadow/mnn`
