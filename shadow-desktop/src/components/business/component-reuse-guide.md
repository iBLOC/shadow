# Shadow Desktop 组件复用指南

**日期:** 2026-04-08
**状态:** 已批准实施

## 1. 概述

本文档描述 shadow-desktop 项目的组件复用体系设计，旨在统一 UI 组件和业务组件的使用，减少重复代码，提高开发效率。

### 1.1 设计原则

- **粗粒度业务组件**: 拿来即用，不暴露内部实现细节
- **按使用场景分类**: 通用 UI、业务组件、布局组件
- **统一文档化**: 每个组件有使用示例、API、适用场景

### 1.2 组件分类

| 类别 | 说明 | 组件 |
|------|------|------|
| **通用 UI** | 最基础的 UI 元素 | Button, Input, Select, Textarea, Modal, Card, Badge, Loading, EmptyState |
| **业务组件** | 业务相关的可复用组件 | AddProviderModal, ProviderForm, AgentCard, SettingsCard, ServiceStatus, ProviderCard, FormCard, EntityCard |
| **布局组件** | 应用整体布局 | Layout, AppInitializer |

### 1.3 目录结构

```
src/components/
├── ui/                         # 通用 UI 组件
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
├── business/                   # 业务组件
│   ├── AddProviderModal/
│   ├── ProviderForm/
│   ├── AgentCard/
│   ├── SettingsCard/
│   ├── ServiceStatus/
│   ├── ProviderCard/
│   ├── FormCard/
│   ├── EntityCard/
│   └── index.ts
│
└── layout/                     # 布局组件
    ├── Layout.tsx
    └── AppInitializer.tsx
```

## 2. 通用 UI 组件

所有通用 UI 组件位于 `src/components/ui/` 目录，通过 `index.ts` 统一导出。

### 2.1 Button

**文件:** `src/components/ui/Button.tsx`

**API:**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| variant | `'primary' \| 'secondary' \| 'ghost' \| 'danger' \| 'success'` | `'primary'` | 按钮变体 |
| size | `'sm' \| 'md' \| 'lg'` | `'md'` | 按钮尺寸 |
| loading | `boolean` | `false` | 加载状态 |
| icon | `ReactNode` | - | 图标 |
| iconPosition | `'left' \| 'right'` | `'left'` | 图标位置 |
| fullWidth | `boolean` | `false` | 占满宽度 |
| disabled | `boolean` | `false` | 禁用状态 |

**使用示例:**

```tsx
import { Button } from '../components/ui';

<Button variant="primary" size="md" onClick={handleClick}>
  提交
</Button>

<Button variant="secondary" icon={<Settings />} onClick={handleSettings}>
  设置
</Button>

<Button variant="danger" size="sm" loading={isDeleting} onClick={handleDelete}>
  删除
</Button>
```

### 2.2 Input

**文件:** `src/components/ui/Input.tsx`

**API:**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| label | `string` | - | 输入框标签 |
| error | `string` | - | 错误信息 |
| hint | `string` | - | 提示文字 |
| icon | `ReactNode` | - | 左侧图标 |
| iconPosition | `'left' \| 'right'` | `'left'` | 图标位置 |
| fullWidth | `boolean` | `true` | 占满宽度 |

**使用示例:**

```tsx
import { Input } from '../components/ui';

<Input
  label="API Key"
  type="password"
  value={apiKey}
  onChange={(e) => setApiKey(e.target.value)}
  placeholder="sk-..."
  error={errors.apiKey}
/>
```

### 2.3 Modal

**文件:** `src/components/ui/Modal.tsx`

**API:**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| isOpen | `boolean` | - | 是否打开 |
| onClose | `() => void` | - | 关闭回调 |
| title | `string` | - | 标题 |
| description | `string` | - | 描述 |
| size | `'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | 尺寸 |
| showClose | `boolean` | `true` | 显示关闭按钮 |
| footer | `ReactNode` | - | 底部内容 |

**使用示例:**

```tsx
import { Modal, Button } from '../components/ui';

<Modal
  isOpen={isOpen}
  onClose={onClose}
  title="确认删除"
  description="此操作无法撤销"
  size="sm"
  footer={
    <>
      <Button variant="secondary" onClick={onClose}>取消</Button>
      <Button variant="danger" onClick={handleConfirm}>确认</Button>
    </>
  }
>
  <p>确定要删除这个项目吗？</p>
</Modal>
```

### 2.4 Card

**文件:** `src/components/ui/Card.tsx`

**API:**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| variant | `'default' \| 'elevated' \| 'outlined' \| 'interactive'` | `'default'` | 卡片变体 |
| padding | `'none' \| 'sm' \| 'md' \| 'lg'` | `'md'` | 内边距 |
| hover | `boolean` | `false` | 悬停效果 |

**子组件:**

- `CardHeader` - 卡片头部
- `CardTitle` - 卡片标题
- `CardDescription` - 卡片描述
- `CardContent` - 卡片内容
- `CardFooter` - 卡片底部

**使用示例:**

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui';

<Card variant="elevated" padding="md">
  <CardHeader>
    <CardTitle>卡片标题</CardTitle>
    <CardDescription>这是卡片描述</CardDescription>
  </CardHeader>
  <CardContent>
    卡片内容...
  </CardContent>
  <CardFooter>
    <Button size="sm">操作</Button>
  </CardFooter>
</Card>
```

### 2.5 Badge

**文件:** `src/components/ui/Badge.tsx`

**API:**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| variant | `'default' \| 'success' \| 'warning' \| 'danger' \| 'info' \| 'accent'` | `'default'` | 变体 |
| size | `'sm' \| 'md'` | `'md'` | 尺寸 |
| dot | `boolean` | `false` | 显示圆点 |
| pulse | `boolean` | `false` | 脉冲动画 |

**子组件:**

- `StatusBadge` - 状态徽章，接受 `status: 'online' | 'offline' | 'connecting' | 'error' | 'running' | 'stopped' | 'busy'`
- `PriorityBadge` - 优先级徽章，接受 `priority: 'urgent' | 'high' | 'medium' | 'low'`

**使用示例:**

```tsx
import { Badge, StatusBadge } from '../components/ui';

<Badge variant="success">已启用</Badge>
<StatusBadge status="online" />
<StatusBadge status="error" size="sm" />
```

### 2.6 Loading

**文件:** `src/components/ui/Loading.tsx`

**API:**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| size | `'sm' \| 'md' \| 'lg'` | `'md'` | 尺寸 |
| text | `string` | - | 加载文字 |
| fullScreen | `boolean` | `false` | 全屏模式 |

**使用示例:**

```tsx
import { Loading } from '../components/ui';

<Loading size="md" text="加载中..." />
<Loading fullScreen text="页面加载中..." />
```

### 2.7 EmptyState

**文件:** `src/components/ui/EmptyState.tsx`

**API:**

| 属性 | 类型 | 说明 |
|------|------|------|
| icon | `ReactNode` | 图标 |
| title | `string` | 标题 |
| description | `string` | 描述 |
| action | `{ label: string; onClick: () => void }` | 操作按钮 |

**使用示例:**

```tsx
import { EmptyState } from '../components/ui';
import { Inbox } from 'lucide-react';

<EmptyState
  icon={<Inbox size={48} />}
  title="暂无数据"
  description="点击按钮添加第一条数据"
  action={{ label: '添加', onClick: () => setIsOpen(true) }}
/>
```

## 3. 业务组件

所有业务组件位于 `src/components/business/` 目录，通过 `index.ts` 统一导出。

### 3.1 AddProviderModal

**文件:** `src/components/business/AddProviderModal/`

**用途:** 新增模型供应商弹窗

**API:**

| 属性 | 类型 | 说明 |
|------|------|------|
| isOpen | `boolean` | 是否打开 |
| onClose | `() => void` | 关闭回调 |
| onSuccess | `(provider: ModelProvider) => void` | 成功回调 |
| onSave | `(data: ProviderFormData) => Promise<void>` | 自定义保存逻辑（可选） |
| providerTypes | `ProviderTypeOption[]` | 提供商类型列表（可选） |
| defaultApiBase | `Record<string, string>` | 提供商默认 API Base（可选） |

**类型定义:**

```tsx
interface ModelProvider {
  id: string;
  name: string;
  provider_type: string;
  api_base: string | null;
  api_key: string | null;
  enabled: boolean;
  models: LLMModel[];
  created_at: string;
  updated_at: string;
}

interface ProviderTypeOption {
  id: string;
  name: string;
  color: string;
}

interface ProviderFormData {
  name: string;
  provider_type: string;
  api_base: string;
  api_key: string;
  enabled: boolean;
}
```

**使用示例:**

```tsx
import { AddProviderModal } from '../components/business';

const [showModal, setShowModal] = useState(false);

<AddProviderModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onSuccess={(provider) => {
    console.log('新增供应商:', provider);
    refreshProviders();
  }}
/>

// 使用自定义 provider 类型
const customProviderTypes = [
  { id: 'openai', name: 'OpenAI', color: '#10a37f' },
  { id: 'anthropic', name: 'Anthropic', color: '#d4a574' },
];

<AddProviderModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  onSave={handleSave}
  providerTypes={customProviderTypes}
  defaultApiBase={{
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com',
  }}
/>
```

### 3.2 AgentCard

**文件:** `src/components/business/AgentCard/`

**用途:** 展示 Agent 卡片

**API:**

| 属性 | 类型 | 说明 |
|------|------|------|
| agent | `Agent` | Agent 对象 |
| status | `'idle' \| 'running' \| 'error' \| 'offline'` | 状态（可选） |
| onEdit | `(agent: Agent) => void` | 编辑回调（可选） |
| onDelete | `(id: string) => void` | 删除回调（可选） |
| onInvoke | `(agent: Agent) => void` | 启动/停止回调（可选） |

**使用示例:**

```tsx
import { AgentCard } from '../components/business';

<AgentCard
  agent={agent}
  onEdit={(agent) => openEditModal(agent)}
  onDelete={(id) => deleteAgent(id)}
  onInvoke={(agent) => toggleAgent(agent)}
/>
```

### 3.3 SettingsCard

**文件:** `src/components/business/SettingsCard/`

**用途:** 统一设置页面的卡片区块

**API:**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| title | `string` | - | 标题 |
| description | `string` | - | 描述（可选） |
| icon | `ReactNode` | - | 图标（可选） |
| children | `ReactNode` | - | 内容 |
| actions | `ReactNode` | - | 底部操作按钮（可选） |
| variant | `'default' \| 'glass'` | `'default'` | 样式变体 |

**变体说明:**
- `default`: 使用实色背景和边框
- `glass`: 使用毛玻璃效果背景，适合设置页面

**使用示例:**

```tsx
import { SettingsCard } from '../components/business';
import { Database } from 'lucide-react';

// 默认样式
<SettingsCard
  title="数据库设置"
  description="配置数据库连接"
  icon={<Database />}
  actions={<Button size="sm">保存</Button>}
>
  {/* Database settings now handled automatically with Lance */}
</SettingsCard>

// 毛玻璃样式（用于设置页面）
<SettingsCard
  variant="glass"
  title="主题设置"
  description="选择应用主题"
  icon={<Sun />}
>
  <ThemeSelector />
</SettingsCard>
```

### 3.4 ServiceStatus

**文件:** `src/components/business/ServiceStatus/`

**用途:** 展示服务连接状态

**API:**

| 属性 | 类型 | 说明 |
|------|------|------|
| name | `string` | 服务名称 |
| status | `'connected' \| 'disconnected' \| 'connecting' \| 'error'` | 连接状态 |
| message | `string` | 状态消息（可选） |
| onConnect | `() => void` | 连接回调（可选） |
| onDisconnect | `() => void` | 断开连接回调（可选） |

**使用示例:**

```tsx
import { ServiceStatus } from '../components/business';

<ServiceStatus
  name="Resonance"
  status="connected"
  message="已连接到 localhost:8080"
  onDisconnect={() => disconnect()}
/>
```

### 3.5 ProviderCard

**文件:** `src/components/business/ProviderCard/`

**用途:** 展示供应商卡片

**API:**

| 属性 | 类型 | 说明 |
|------|------|------|
| provider | `ModelProvider` | 供应商对象 |
| onEdit | `(provider: ModelProvider) => void` | 编辑回调（可选） |
| onDelete | `(id: string) => void` | 删除回调（可选） |
| onTest | `(id: string) => void` | 测试连接回调（可选） |

**使用示例:**

```tsx
import { ProviderCard } from '../components/business';

<ProviderCard
  provider={provider}
  onEdit={(provider) => openEditModal(provider)}
  onDelete={(id) => deleteProvider(id)}
  onTest={(id) => testConnection(id)}
/>
```

### 3.6 FormCard

**文件:** `src/components/business/FormCard/`

**用途:** 统一的表单卡片组件，包含标题、内容、操作按钮区域

**API:**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| title | `string` | - | 卡片标题 |
| children | `ReactNode` | - | 表单内容 |
| onCancel | `() => void` | - | 取消回调（可选） |
| onSubmit | `() => void` | - | 提交回调（可选） |
| submitLabel | `string` | `'Save'` | 提交按钮文字 |
| cancelLabel | `string` | `'Cancel'` | 取消按钮文字 |
| isSubmitting | `boolean` | `false` | 提交中状态 |
| disabled | `boolean` | `false` | 禁用状态 |

**子组件:**

- `FormGroup` - 表单分组，接受 `label?: string` 和 `children`
- `FormRow` - 表单行，用于并排放置多个 FormGroup

**使用示例:**

```tsx
import { FormCard, FormGroup, FormRow } from '../components/business';

<FormCard
  title="添加内存"
  onCancel={() => setShowForm(false)}
  onSubmit={handleSubmit}
  submitLabel="保存"
  cancelLabel="取消"
>
  <FormGroup label="内容">
    <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
  </FormGroup>
  <FormRow>
    <FormGroup label="维度">
      <select value={dimension} onChange={(e) => setDimension(e.target.value)}>
        <option value="User">User</option>
        <option value="Agent">Agent</option>
      </select>
    </FormGroup>
    <FormGroup label="层级">
      <select value={layer} onChange={(e) => setLayer(e.target.value)}>
        <option value="L0">L0</option>
        <option value="L1">L1</option>
        <option value="L2">L2</option>
      </select>
    </FormGroup>
  </FormRow>
</FormCard>
```

**适用场景:**
- 添加/编辑表单（如 MemoryPage、SkillsPage 的添加表单）
- 需要统一标题和操作按钮的表单卡片

### 3.7 EntityCard

**文件:** `src/components/business/EntityCard/`

**用途:** 通用的实体卡片组件，包含头部信息和内容区域

**API:**

| 属性 | 类型 | 说明 |
|------|------|------|
| title | `string` | 标题 |
| icon | `ReactNode` | 图标（可选） |
| subtitle | `string` | 副标题（可选） |
| children | `ReactNode` | 卡片内容 |
| actions | `ReactNode` | 操作按钮区域（可选） |
| tags | `ReactNode` | 标签区域（可选） |

**使用示例:**

```tsx
import { EntityCard } from '../components/business';

<EntityCard
  title={agent.name}
  icon={<Bot size={20} />}
  subtitle={agent.description}
  tags={<Badge variant="success">运行中</Badge>}
  actions={
    <>
      <Button size="sm" variant="secondary">编辑</Button>
      <Button size="sm" variant="danger">删除</Button>
    </>
  }
>
  <p>Agent 详细信息...</p>
</EntityCard>
```

**适用场景:**
- Agent 卡片
- 知识库条目卡片
- 任何需要统一头部 + 内容结构的实体展示

### 3.8 ProviderForm

**文件:** `src/components/business/ProviderForm/`

**用途:** 模型供应商表单组件，支持新增和编辑模式

**API:**

| 属性 | 类型 | 说明 |
|------|------|------|
| initialData | `Partial<ProviderFormData>` | 初始数据（可选） |
| onSubmit | `(data: ProviderFormData) => Promise<void>` | 提交回调 |
| onCancel | `() => void` | 取消回调（可选） |
| providerTypes | `ProviderTypeOption[]` | 提供商类型列表（可选） |
| defaultApiBase | `Record<string, string>` | 默认 API Base（可选） |
| isSubmitting | `boolean` | 提交中状态（可选） |

**使用示例:**

```tsx
import { ProviderForm } from '../components/business';

<ProviderForm
  initialData={{ name: '', provider_type: 'openai', api_base: '', api_key: '', enabled: true }}
  onSubmit={async (data) => {
    await saveProvider(data);
  }}
  onCancel={() => setIsEditing(false)}
  providerTypes={providerTypes}
  defaultApiBase={defaultApiBase}
/>
```

## 4. 迁移指南

### 4.1 从 settings-card 迁移到 SettingsCard

**现状:** 页面中使用自定义 CSS 类 `.settings-card`

**目标:** 使用 `SettingsCard` 组件统一样式

**迁移步骤:**

1. 导入 `SettingsCard` 组件
2. 将 `.settings-card` 的内容包裹在 `SettingsCard` 中
3. 将自定义图标、标题、描述移到对应 props
4. 将操作按钮移到 `actions` prop

**迁移前:**

```tsx
<div className="settings-card">
  <div className="settings-card-header">
    <Database />
    <h3>数据库设置</h3>
    <p>配置数据库连接</p>
  </div>
  <div className="settings-card-content">
    {/* Database settings now handled automatically with Lance */}
  </div>
  <div className="settings-card-footer">
    <Button size="sm">保存</Button>
  </div>
</div>
```

**迁移后:**

```tsx
<SettingsCard
  title="数据库设置"
  description="配置数据库连接"
  icon={<Database />}
  actions={<Button size="sm">保存</Button>}
>
  {/* Database settings now handled automatically with Lance */}
</SettingsCard>
```

### 4.2 从内联表单迁移到 Input/Select/Textarea

**现状:** 页面中直接使用 `<input>`、`<select>`、`<textarea>` HTML 元素

**目标:** 使用 `Input`/`Select`/`Textarea` 组件统一样式和行为

**迁移步骤:**

1. 导入 `Input`、`Select`、`Textarea` 组件
2. 将原生 HTML 元素替换为对应组件
3. 添加 `label`、`error`、`hint` 等增强功能

**迁移前:**

```tsx
<div className="form-group">
  <label>API Key</label>
  <input
    type="password"
    value={apiKey}
    onChange={(e) => setApiKey(e.target.value)}
    placeholder="sk-..."
  />
</div>
```

**迁移后:**

```tsx
<Input
  label="API Key"
  type="password"
  value={apiKey}
  onChange={(e) => setApiKey(e.target.value)}
  placeholder="sk-..."
/>
```

### 4.3 从重复弹窗迁移到业务组件

**现状:** 多个页面各自实现相似的新增供应商弹窗

**目标:** 使用 `AddProviderModal` 组件统一实现

**迁移步骤:**

1. 导入 `AddProviderModal` 组件
2. 删除页面中内联的弹窗实现
3. 使用 `AddProviderModal` 替代
4. 通过 `onSuccess` 回调处理新增成功后的逻辑

**迁移前 (ModelsPage.tsx):**

```tsx
const [showAddProvider, setShowAddProvider] = useState(false);
const [newProvider, setNewProvider] = useState({...});

// 内联弹窗实现...

<Modal isOpen={showAddProvider} onClose={() => setShowAddProvider(false)} ...>
  <div className="add-form">
    <Input label="名称" value={newProvider.name} onChange={...} />
    {/* 更多字段... */}
  </div>
</Modal>
```

**迁移后:**

```tsx
import { AddProviderModal } from '../components/business';

const [showAddProvider, setShowAddProvider] = useState(false);

<AddProviderModal
  isOpen={showAddProvider}
  onClose={() => setShowAddProvider(false)}
  onSuccess={loadProviders}
/>
```

## 5. 贡献指南

### 5.1 新增组件规范

1. **位置**: 组件放在 `src/components/` 对应目录下
2. **文件结构**:
   ```
   ComponentName/
   ├── index.ts              # 导出
   ├── ComponentName.tsx     # 组件实现
   ├── ComponentName.module.css  # 样式（可选）
   └── types.ts              # 类型定义（可选）
   ```
3. **命名**: 使用 PascalCase，如 `AddProviderModal`
4. **导出**: 通过 `index.ts` 统一导出

### 5.2 组件设计原则

1. **单一职责**: 每个组件只做一件事
2. ** Props 最小化**: 只暴露必要的 props
3. **组合优于继承**: 使用组合模式构建复杂组件
4. **可访问性**: 考虑键盘导航、屏幕阅读器支持

### 5.3 文档更新规范

新增组件后，必须更新本文档：
1. 在对应章节添加组件说明
2. 包含 API表格
3. 提供使用示例
4. 标注适用场景和注意事项

## 6. 常见问题

### Q: 什么时候应该创建新的业务组件？

A: 当多个页面有相同的 UI 和业务逻辑时，应该抽取为业务组件。例如：多个页面都有"新增供应商"的需求，就应该创建 `AddProviderModal`。

### Q: 通用 UI 组件和业务组件的区别是什么？

A: 通用 UI 组件是最基础的元素，如 Button、Input、Modal，不包含业务逻辑。业务组件是多个通用 UI 组件的组合，包含业务逻辑，如 AddProviderModal 包含表单、API 调用等。

### Q: 如何处理组件的样式？

A: 使用 CSS Module（`.module.css` 文件）来隔离样式。避免使用全局 CSS 类名。

### Q: SetupPage 的新增供应商弹窗为什么没有复用 AddProviderModal？

A: SetupPage 使用 Tauri IPC (`invoke`) 与后端通信，而 AddProviderModal 使用直接 API 调用。这是架构差异导致的。未来可以通过传递 `onSave` 回调来支持自定义保存逻辑。
