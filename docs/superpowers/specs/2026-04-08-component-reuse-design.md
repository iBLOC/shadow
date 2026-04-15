# Shadow Desktop 组件复用体系设计

**日期:** 2026-04-08
**状态:** 已批准实施

## 1. 概述

### 1.1 设计原则

- **粗粒度业务组件**: 拿来即用，不暴露内部实现细节
- **按使用场景分类**: 通用 UI、业务组件、布局组件
- **统一文档化**: 每个组件有使用示例、API、适用场景

### 1.2 组件分类

| 类别 | 说明 |
|------|------|
| **通用 UI** | Button, Input, Select, Textarea, Modal, Card, Badge, Loading, EmptyState |
| **业务组件** | AddProviderModal, SettingsCard, ServiceStatus, ProviderCard, AgentCard |
| **布局组件** | Layout, AppInitializer |

## 2. 目录结构

```
src/components/
├── ui/                         # 通用 UI 组件（现有）
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Select.tsx
│   ├── Textarea.tsx
│   ├── Modal.tsx
│   ├── ConfirmModal.tsx
│   ├── Card.tsx
│   ├── Badge.tsx
│   ├── Loading.tsx
│   ├── Skeleton.tsx
│   ├── EmptyState.tsx
│   └── index.ts
│
├── business/                   # 业务组件（新增）
│   ├── AddProviderModal/
│   ├── SettingsCard/
│   ├── ServiceStatus/
│   ├── ProviderCard/
│   └── AgentCard/
│
└── layout/                     # 布局组件（现有）
    ├── Layout.tsx
    └── AppInitializer.tsx
```

## 3. 通用 UI 组件

### 3.1 Button

| 属性 | 类型 | 说明 |
|------|------|------|
| variant | 'primary' \| 'secondary' \| 'ghost' \| 'danger' | 变体 |
| size | 'sm' \| 'md' \| 'lg' | 尺寸 |
| loading | boolean | 加载状态 |
| icon | ReactNode | 图标 |
| iconPosition | 'left' \| 'right' | 图标位置 |
| fullWidth | boolean | 占满宽度 |

**使用示例:**
```tsx
<Button variant="primary" size="md" loading={isSubmitting} icon={<Plus />} onClick={handleAdd}>
  添加
</Button>
```

### 3.2 Input

| 属性 | 类型 | 说明 |
|------|------|------|
| label | string | 标签 |
| error | string | 错误信息 |
| hint | string | 提示文字 |
| leftIcon | ReactNode | 左侧图标 |
| rightIcon | ReactNode | 右侧图标 |

**使用示例:**
```tsx
<Input
  label="API Key"
  type="password"
  value={apiKey}
  error={errors.apiKey}
  placeholder="sk-..."
  rightIcon={<EyeOff />}
/>
```

### 3.3 Modal

| 属性 | 类型 | 说明 |
|------|------|------|
| isOpen | boolean | 是否打开 |
| onClose | () => void | 关闭回调 |
| title | string | 标题 |
| description | string | 描述 |
| size | 'sm' \| 'md' \| 'lg' \| 'xl' | 尺寸 |
| showClose | boolean | 显示关闭按钮 |
| footer | ReactNode | 底部内容 |

### 3.4 Card

| 属性 | 类型 | 说明 |
|------|------|------|
| variant | 'default' \| 'elevated' \| 'outlined' | 变体 |
| padding | 'none' \| 'sm' \| 'md' \| 'lg' | 内边距 |
| hover | boolean | 悬停效果 |

**子组件:** CardHeader, CardTitle, CardDescription, CardContent, CardFooter

### 3.5 Badge

| 属性 | 类型 | 说明 |
|------|------|------|
| variant | 'default' \| 'success' \| 'warning' \| 'error' | 变体 |
| size | 'sm' \| 'md' | 尺寸 |
| dot | boolean | 显示圆点 |
| pulse | boolean | 脉冲动画 |

### 3.6 Loading

| 属性 | 类型 | 说明 |
|------|------|------|
| size | 'sm' \| 'md' \| 'lg' | 尺寸 |
| text | string | 加载文字 |
| fullScreen | boolean | 全屏模式 |

### 3.7 EmptyState

| 属性 | 类型 | 说明 |
|------|------|------|
| icon | ReactNode | 图标 |
| title | string | 标题 |
| description | string | 描述 |
| action | { label: string; onClick: () => void } | 操作按钮 |

## 4. 业务组件

### 4.1 AddProviderModal

**用途:** 新增模型供应商弹窗

**API:**
```tsx
interface AddProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (provider: ModelProvider) => void;
}
```

**使用示例:**
```tsx
<AddProviderModal isOpen={isOpen} onClose={onClose} onSuccess={refreshProviders} />
```

### 4.2 SettingsCard

**用途:** 统一设置页面的卡片区块

**API:**
```tsx
interface SettingsCardProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}
```

### 4.3 ServiceStatus

**用途:** 展示服务连接状态

**API:**
```tsx
interface ServiceStatusProps {
  name: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  message?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
}
```

### 4.4 ProviderCard

**用途:** 展示供应商卡片

**API:**
```tsx
interface ProviderCardProps {
  provider: ModelProvider;
  onEdit?: (provider: ModelProvider) => void;
  onDelete?: (id: string) => void;
  onTest?: (id: string) => void;
}
```

### 4.5 AgentCard

**用途:** 展示 Agent 卡片

**API:**
```tsx
interface AgentCardProps {
  agent: Agent;
  status?: 'idle' | 'running' | 'error';
  onEdit?: (agent: Agent) => void;
  onDelete?: (id: string) => void;
  onInvoke?: (agent: Agent) => void;
}
```

## 5. 迁移计划

### Phase 1: 抽取业务组件
1. 新增 `business/AddProviderModal/`
2. 替换 ModelsPage 中的弹窗
3. 替换 SetupPage 中的弹窗

### Phase 2: 统一 Card 使用
1. 新增 `business/SettingsCard/`
2. 迁移 SettingsPage 的 settings-card 到 SettingsCard

### Phase 3: 完善组件生态
1. 新增 ServiceStatus
2. 新增 ProviderCard
3. 新增 AgentCard
4. 编写文档

## 6. 文档结构

```
docs/
└── component-reuse-guide.md
    ├── 1. 概述
    ├── 2. 通用 UI 组件
    ├── 3. 业务组件
    ├── 4. 迁移指南
    ├── 5. 贡献指南
    └── 6. 常见问题
```
