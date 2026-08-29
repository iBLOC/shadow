# Shadow Desktop UI 组件规范

## 概述

Shadow Desktop 使用 shadcn/ui 作为基础组件库。为确保 UI 一致性和减少基础组件造成的 bug，**必须优先使用 shadcn/ui 组件**，避免自行实现基础 UI 功能。

## 已安装的 shadcn/ui 组件

以下是项目中已安装并应优先使用的组件：

### Form & Input
- `Button` - 按钮组件，支持多种变体
- `Input` - 文本输入框
- `Textarea` - 多行文本输入
- `Label` - 表单标签
- `Select` - 下拉选择框
- `Checkbox` - 复选框
- `Radio Group` - 单选按钮组
- `Switch` - 开关
- `Slider` - 滑块
- `Calendar` - 日历
- `Date Picker` - 日期选择器
- `Combobox` - 可搜索选择框

### Layout & Navigation
- `Tabs` - 标签页
- `Accordion` - 折叠面板
- `Breadcrumb` - 面包屑导航
- `Navigation Menu` - 导航菜单
- `Sidebar` - 侧边栏
- `Separator` - 分隔符
- `Scroll Area` - 自定义滚动区域
- `Resizable` - 可调整大小的面板

### Overlays & Dialogs
- `Dialog` - 模态对话框
- `Alert Dialog` - 警告对话框（用于确认）
- `Sheet` - 侧滑面板
- `Drawer` - 抽屉（移动端友好）
- `Popover` - 弹出框
- `Tooltip` - 工具提示
- `Hover Card` - 悬停卡片
- `Context Menu` - 右键菜单
- `Dropdown Menu` - 下拉菜单
- `Menubar` - 菜单栏
- `Command` - 命令面板

### Feedback & Status
- `Alert` - 警告信息
- `Toast` / `Sonner` - 通知提示
- `Progress` - 进度条
- `Spinner` - 加载指示器
- `Skeleton` - 骨架屏
- `Badge` - 徽章
- `Empty` - 空状态

### Display & Media
- `Avatar` - 头像
- `Card` - 卡片容器
- `Table` - 表格
- `Data Table` - 数据表格（排序、筛选、分页）
- `Chart` - 图表（基于 Recharts）
- `Carousel` - 轮播图
- `Aspect Ratio` - 宽高比容器
- `Typography` - 排版样式
- `Item` - 列表项
- `Kbd` - 键盘快捷键显示

### Misc
- `Collapsible` - 折叠容器
- `Toggle` - 切换按钮
- `Toggle Group` - 切换按钮组
- `Pagination` - 分页

## 使用原则

### 1. 优先使用 shadcn/ui 组件

**必须**优先使用 shadcn/ui 组件，而不是自行实现基础 UI 功能。例如：

```tsx
// ✅ 正确：使用 shadcn/ui Button
import { Button } from '@/components/ui/button'

<Button variant="primary" size="sm">
  点击我
</Button>

// ❌ 错误：自行实现按钮
<button className="px-4 py-2 bg-blue-500 text-white rounded">
  点击我
</button>
```

### 2. 保持组件一致性

使用 shadcn/ui 组件时，**必须**使用其预定义的变体（variant）和尺寸（size），而不是自行添加 className：

```tsx
// ✅ 正确：使用预定义变体
<Button variant="destructive" size="lg">
  删除
</Button>

// ❌ 错误：自行添加样式
<Button className="bg-red-500 text-lg px-6 py-3">
  删除
</Button>
```

### 3. 组合使用组件

shadcn/ui 组件设计为可组合使用。例如，Dialog 内可以包含 Button、Input、Label 等：

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

<Dialog>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>编辑任务</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      <div>
        <Label htmlFor="title">标题</Label>
        <Input id="title" />
      </div>
      <Button>保存</Button>
    </div>
  </DialogContent>
</Dialog>
```

### 4. 避免重复造轮子

以下场景**必须**使用 shadcn/ui 组件，而不是自行实现：

| 场景 | 使用组件 | 避免实现 |
|------|----------|----------|
| 按钮 | `Button` | `<button>` + 自定义样式 |
| 输入框 | `Input` | `<input>` + 自定义样式 |
| 对话框 | `Dialog` | 自定义 modal + overlay |
| 警告确认 | `Alert Dialog` | `window.confirm()` |
| 下拉菜单 | `Dropdown Menu` | 自定义浮层 |
| 标签页 | `Tabs` | 自定义 tab 切换逻辑 |
| 进度条 | `Progress` | 自定义进度条 |
| 加载状态 | `Skeleton` / `Spinner` | 自定义加载动画 |
| 徽章 | `Badge` | 自定义标签 |
| 表格 | `Table` / `Data Table` | 自定义表格 |
| 日期选择 | `Calendar` / `Date Picker` | 自定义日期选择器 |
| 通知 | `Toast` / `Sonner` | 自定义通知 |

### 5. 扩展组件

如需扩展现有组件，**必须**基于 shadcn/ui 组件进行扩展，而不是重新实现：

```tsx
// ✅ 正确：基于 Button 扩展
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface IconButtonProps extends React.ComponentProps<typeof Button> {
  icon: React.ReactNode
}

export function IconButton({ icon, children, className, ...props }: IconButtonProps) {
  return (
    <Button className={cn('gap-2', className)} {...props}>
      {icon}
      {children}
    </Button>
  )
}

// ❌ 错误：重新实现按钮
export function IconButton({ icon, children, ...props }) {
  return (
    <button className="flex items-center gap-2 px-4 py-2 ..." {...props}>
      {icon}
      {children}
    </button>
  )
}
```

## 新增组件流程

如需使用新的 shadcn/ui 组件：

1. **检查是否已存在**：查看 `src/components/ui/` 目录
2. **使用 CLI 安装**：运行 `pnpm dlx shadcn@latest add <component-name>`
3. **更新本文档**：在对应分类中添加新组件

## 禁止事项

1. **禁止**自行实现 shadcn/ui 已提供的基础组件
2. **禁止**在 shadcn/ui 组件上直接添加 className 覆盖样式（应使用变体）
3. **禁止**使用 `window.confirm()`、`window.alert()` 等原生对话框（应使用 `AlertDialog` 或 `Dialog`）
4. **禁止**使用 `document.createElement` 创建浮层（应使用 `Popover`、`Tooltip` 等）

## 参考文档

- shadcn/ui 官方文档：https://ui.shadcn.com
- 组件目录：https://ui.shadcn.com/docs/directory
- 主题定制：https://ui.shadcn.com/docs/theming
- 暗色模式：https://ui.shadcn.com/docs/dark-mode
