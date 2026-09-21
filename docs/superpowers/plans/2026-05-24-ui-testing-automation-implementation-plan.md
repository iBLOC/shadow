# UI Testing Automation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 shadow-desktop 和 shadow-mobile 建立完整的自动化 UI 测试体系，覆盖单元、组件、集成和 E2E 测试层级。

**Architecture:** 采用测试金字塔策略，分三个阶段递进实施：
- Phase 1: 组件/单元测试（隔离环境，Mock API）
- Phase 2: 集成测试（多组件协作，真实 API）
- Phase 3: E2E 测试（完整用户流程）

**Tech Stack:**
- Desktop: Vitest ^3.1.0 + @testing-library/react + jsdom
- Mobile: flutter_test + integration_test

---

## Plan Structure

本计划分为两个并行 Track：
- **Track A**: shadow-desktop 测试基础设施
- **Track B**: shadow-mobile 测试基础设施

每个 Track 分三个 Phase，Phase 1 可立即开始，Phase 2/3 需等待 Phase 1 基础设施就绪。

---

## Chunk 1: shadow-desktop Phase 1 - 测试基础设施搭建

### 1.1 扩展 Vitest 配置

**Files:**
- Modify: `shadow-desktop/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts'],
    },
    // Test timeout
    testTimeout: 10000,
    // E2E mode for page-level tests
    webServer: {
      command: 'pnpm dev',
      port: 1420,
      reuseExistingServer: true,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### 1.2 创建测试工具函数

**Files:**
- Create: `shadow-desktop/tests/utils/test-utils.tsx`
- Create: `shadow-desktop/tests/utils/render-with-store.tsx`
- Create: `shadow-desktop/tests/utils/api-mock.ts`

- [ ] **Step 1: 创建 test-utils.tsx**

```typescript
// tests/utils/test-utils.tsx
import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// Custom render that includes router
function AllTheProviders({ children }: { children: React.ReactNode }) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

export function renderWithRouter(
  ui: ReactElement,
  { route = '/', ...renderOptions } = {} as { route?: string } & RenderOptions
) {
  window.history.pushState({}, 'Test page', route);
  return render(ui, { wrapper: AllTheProviders, ...renderOptions });
}

// Re-export everything from testing-library
export * from '@testing-library/react';
```

- [ ] **Step 2: 创建 render-with-store.tsx**

```typescript
// tests/utils/render-with-store.tsx
import React, { ReactElement } from 'react';
import { RenderOptions, render } from '@testing-library/react';
import { useResonanceStore } from '@/stores/resonanceStore';
import { useServiceStore } from '@/stores/serviceStore';
import { BrowserRouter } from 'react-router-dom';

// Wrapper that provides store state
function StoreProvider({ children }: { children: React.ReactNode }) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

export function renderWithStore(
  ui: ReactElement,
  options?: RenderOptions
) {
  return render(ui, { wrapper: StoreProvider, ...options });
}

// Helper to seed store with data
export function seedStore(storeName: 'resonance' | 'service', data: any) {
  if (storeName === 'resonance') {
    useResonanceStore.setState(data);
  } else if (storeName === 'service') {
    useServiceStore.setState(data);
  }
}

// Helper to reset all stores
export function resetStores() {
  useResonanceStore.setState({
    discoveredServices: [],
    selectedService: null,
    connectionStatus: 'disconnected',
    modelScores: [],
    pendingTasks: [],
    error: null,
    reconnectAttempts: 0,
  });
  useServiceStore.setState({
    services: [],
    selectedService: null,
    isLoading: false,
    error: null,
  });
}
```

- [ ] **Step 3: 创建 api-mock.ts**

```typescript
// tests/utils/api-mock.ts
import { vi } from 'vitest';

// Mock Prefrontal API responses
export const mockPrefrontalResponses = {
  agents: {
    list: [
      { id: '1', name: 'Test Agent', status: 'active', capabilities: [] },
    ],
  },
  providers: {
    list: [
      { id: '1', name: 'OpenAI', type: 'openai', status: 'connected' },
    ],
  },
  tasks: {
    list: [
      { id: '1', title: 'Test Task', status: 'pending', priority: 'normal' },
    ],
  },
  skills: {
    list: [
      { id: '1', name: 'web_search', enabled: true },
    ],
  },
  mcp: {
    list: [
      { id: '1', name: 'Test MCP', status: 'running' },
    ],
  },
  memory: {
    list: [
      { id: '1', content: 'Test memory', timestamp: Date.now() },
    ],
  },
};

// Create mock for fetch
export function createApiMock() {
  return vi.fn().mockImplementation((url: string) => {
    let response: any;
    
    if (url.includes('/agents')) {
      response = mockPrefrontalResponses.agents;
    } else if (url.includes('/providers')) {
      response = mockPrefrontalResponses.providers;
    } else if (url.includes('/tasks')) {
      response = mockPrefrontalResponses.tasks;
    } else if (url.includes('/skills')) {
      response = mockPrefrontalResponses.skills;
    } else if (url.includes('/mcp')) {
      response = mockPrefrontalResponses.mcp;
    } else if (url.includes('/memory')) {
      response = mockPrefrontalResponses.memory;
    }
    
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(response),
    });
  });
}
```

### 1.3 创建目录结构

**Files:**
- Create: `shadow-desktop/tests/components/`
- Create: `shadow-desktop/tests/pages/`
- Create: `shadow-desktop/tests/stores/`
- Create: `shadow-desktop/tests/e2e/`
- Create: `shadow-desktop/tests/utils/`

- [ ] **Step 4: 运行测试验证基础配置**

```bash
cd https://github.com/iBLOC/shadow/shadow-desktop && pnpm test:run
```

Expected: Existing tests pass (Button.test.tsx, resonanceStore.test.ts)

---

## Chunk 2: shadow-desktop Phase 1 - 组件测试

### 2.1 UI 组件测试

**Files:**
- Modify: `shadow-desktop/src/components/ui/Button.tsx` → Review for testability
- Create: `shadow-desktop/tests/components/Button.test.tsx` (已存在，跳过)
- Create: `shadow-desktop/tests/components/Input.test.tsx`
- Create: `shadow-desktop/tests/components/Modal.test.tsx`
- Create: `shadow-desktop/tests/components/Card.test.tsx`
- Create: `shadow-desktop/tests/components/Badge.test.tsx`
- Create: `shadow-desktop/tests/components/EmptyState.test.tsx`
- Create: `shadow-desktop/tests/components/Loading.test.tsx`

**Components to test (from `src/components/ui/`):**
- `Button.tsx` - variant, size, loading, disabled states
- `Input.tsx` - text input, validation states
- `Modal.tsx` - open/close, backdrop click
- `Card.tsx` - rendering with children
- `Badge.tsx` - variant display
- `EmptyState.tsx` - icon, title, description, action
- `Loading.tsx` - spinner display

- [ ] **Step 1: 创建 Input 组件测试**

```typescript
// tests/components/Input.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from '@/components/ui/Input';

describe('Input Component', () => {
  it('renders with default props', () => {
    render(<Input />);
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
  });

  it('renders with label', () => {
    render(<Input label="Username" />);
    expect(screen.getByText('Username')).toBeInTheDocument();
  });

  it('handles text input', () => {
    render(<Input />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'test@example.com' } });
    expect(input).toHaveValue('test@example.com');
  });

  it('shows error state', () => {
    render(<Input error="Invalid email" />);
    expect(screen.getByText('Invalid email')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('is disabled when disabled prop is set', () => {
    render(<Input disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});
```

- [ ] **Step 2: 创建 Modal 组件测试**

```typescript
// tests/components/Modal.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '@/components/ui/Modal';

describe('Modal Component', () => {
  it('renders when isOpen is true', () => {
    render(<Modal isOpen={true}>Modal Content</Modal>);
    expect(screen.getByText('Modal Content')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<Modal isOpen={false}>Modal Content</Modal>);
    expect(screen.queryByText('Modal Content')).not.toBeInTheDocument();
  });

  it('calls onClose when backdrop is clicked', () => {
    const handleClose = vi.fn();
    render(<Modal isOpen={true} onClose={handleClose}>Modal Content</Modal>);
    fireEvent.click(screen.getByTestId('modal-backdrop'));
    expect(handleClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(<Modal isOpen={true} onClose={handleClose}>Modal Content</Modal>);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(handleClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: 创建 Card, Badge, EmptyState, Loading 测试**

(按相同模式创建)

- [ ] **Step 4: 运行组件测试验证**

```bash
cd https://github.com/iBLOC/shadow/shadow-desktop && pnpm test:run tests/components/
```

Expected: All component tests pass

### 2.2 Business 组件测试

**Files:**
- Create: `shadow-desktop/tests/components/EntityCard.test.tsx`
- Create: `shadow-desktop/tests/components/ProviderCard.test.tsx`
- Create: `shadow-desktop/tests/components/AgentCard.test.tsx`
- Create: `shadow-desktop/tests/components/ServiceStatus.test.tsx`
- Create: `shadow-desktop/tests/components/SettingsCard.test.tsx`
- Create: `shadow-desktop/tests/components/ProviderForm.test.tsx`
- Create: `shadow-desktop/tests/components/AddProviderModal.test.tsx`

- [ ] **Step 5: 创建 EntityCard 测试**

```typescript
// tests/components/EntityCard.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EntityCard } from '@/components/business/EntityCard';

describe('EntityCard Component', () => {
  const defaultProps = {
    title: 'Test Entity',
    description: 'Test description',
    status: 'active' as const,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  };

  it('renders entity information', () => {
    render(<EntityCard {...defaultProps} />);
    expect(screen.getByText('Test Entity')).toBeInTheDocument();
    expect(screen.getByText('Test description')).toBeInTheDocument();
  });

  it('displays status badge', () => {
    render(<EntityCard {...defaultProps} status="active" />);
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('calls onEdit when edit button is clicked', () => {
    render(<EntityCard {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(defaultProps.onEdit).toHaveBeenCalledOnce();
  });

  it('calls onDelete when delete button is clicked', () => {
    render(<EntityCard {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(defaultProps.onDelete).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 6: 继续创建其他 Business 组件测试**

(ProviderCard, AgentCard, ServiceStatus, SettingsCard, ProviderForm, AddProviderModal)

- [ ] **Step 7: 运行所有组件测试**

```bash
cd https://github.com/iBLOC/shadow/shadow-desktop && pnpm test:run tests/components/
```

Expected: All component tests pass

---

## Chunk 3: shadow-desktop Phase 1 - Store 测试

### 3.1 Zustand Store 测试

**Files:**
- Modify: `shadow-desktop/tests/stores/resonanceStore.test.ts` (已存在，增强)
- Create: `shadow-desktop/tests/stores/serviceStore.test.ts`
- Create: `shadow-desktop/tests/stores/conversationStore.test.ts`
- Create: `shadow-desktop/tests/stores/taskStore.test.ts`

- [ ] **Step 1: 创建 serviceStore 测试**

```typescript
// tests/stores/serviceStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useServiceStore } from '@/stores/serviceStore';

describe('ServiceStore', () => {
  beforeEach(() => {
    useServiceStore.setState({
      services: [],
      selectedService: null,
      isLoading: false,
      error: null,
    });
  });

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useServiceStore.getState();
      expect(state.services).toEqual([]);
      expect(state.selectedService).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('setServices', () => {
    it('sets services list', () => {
      const mockServices = [
        { id: '1', name: 'Service 1', status: 'connected' },
        { id: '2', name: 'Service 2', status: 'disconnected' },
      ];
      useServiceStore.getState().setServices(mockServices);
      expect(useServiceStore.getState().services).toEqual(mockServices);
    });
  });

  describe('selectService', () => {
    it('selects a service', () => {
      const service = { id: '1', name: 'Test Service', status: 'connected' };
      useServiceStore.getState().selectService(service);
      expect(useServiceStore.getState().selectedService).toEqual(service);
    });
  });

  describe('loading states', () => {
    it('sets loading to true', () => {
      useServiceStore.getState().setLoading(true);
      expect(useServiceStore.getState().isLoading).toBe(true);
    });

    it('sets error', () => {
      useServiceStore.getState().setError('Connection failed');
      expect(useServiceStore.getState().error).toBe('Connection failed');
    });
  });
});
```

- [ ] **Step 2: 创建 conversationStore 测试**

```typescript
// tests/stores/conversationStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useConversationStore } from '@/stores/conversationStore';

describe('ConversationStore', () => {
  beforeEach(() => {
    useConversationStore.setState({
      conversations: [],
      selectedConversation: null,
      messages: [],
      isLoading: false,
      error: null,
    });
  });

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useConversationStore.getState();
      expect(state.conversations).toEqual([]);
      expect(state.selectedConversation).toBeNull();
      expect(state.messages).toEqual([]);
    });
  });

  describe('createConversation', () => {
    it('creates a new conversation', () => {
      const newConversation = {
        id: 'conv-1',
        title: 'New Chat',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      useConversationStore.getState().createConversation(newConversation);
      expect(useConversationStore.getState().conversations).toContainEqual(newConversation);
    });
  });

  describe('addMessage', () => {
    it('adds a message to current conversation', () => {
      const message = {
        id: 'msg-1',
        role: 'user' as const,
        content: 'Hello',
        timestamp: Date.now(),
      };
      useConversationStore.getState().addMessage(message);
      expect(useConversationStore.getState().messages).toContainEqual(message);
    });
  });
});
```

- [ ] **Step 3: 创建 taskStore 测试**

```typescript
// tests/stores/taskStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useTaskStore } from '@/stores/taskStore';

describe('TaskStore', () => {
  beforeEach(() => {
    useTaskStore.setState({
      tasks: [],
      selectedTask: null,
      filter: 'all',
      isLoading: false,
      error: null,
    });
  });

  describe('initial state', () => {
    it('has correct initial values', () => {
      const state = useTaskStore.getState();
      expect(state.tasks).toEqual([]);
      expect(state.selectedTask).toBeNull();
      expect(state.filter).toBe('all');
    });
  });

  describe('addTask', () => {
    it('adds a new task', () => {
      const task = {
        id: 'task-1',
        title: 'Test Task',
        status: 'pending' as const,
        priority: 'normal' as const,
        createdAt: Date.now(),
      };
      useTaskStore.getState().addTask(task);
      expect(useTaskStore.getState().tasks).toContainEqual(task);
    });
  });

  describe('updateTaskStatus', () => {
    it('updates task status', () => {
      const task = { id: 'task-1', title: 'Test', status: 'pending' as const };
      useTaskStore.setState({ tasks: [task] });
      useTaskStore.getState().updateTaskStatus('task-1', 'in_progress');
      expect(useTaskStore.getState().tasks[0].status).toBe('in_progress');
    });
  });

  describe('filter', () => {
    it('sets filter', () => {
      useTaskStore.getState().setFilter('active');
      expect(useTaskStore.getState().filter).toBe('active');
    });
  });
});
```

- [ ] **Step 4: 运行 Store 测试验证**

```bash
cd https://github.com/iBLOC/shadow/shadow-desktop && pnpm test:run tests/stores/
```

Expected: All store tests pass

---

## Chunk 4: shadow-desktop Phase 2 - 页面集成测试

### 4.1 页面集成测试

**Files:**
- Create: `shadow-desktop/tests/pages/SetupPage.test.tsx`
- Create: `shadow-desktop/tests/pages/TaskBoardPage.test.tsx`
- Create: `shadow-desktop/tests/pages/ConversationPage.test.tsx`
- Create: `shadow-desktop/tests/pages/AgentsPage.test.tsx`
- Create: `shadow-desktop/tests/pages/SkillsPage.test.tsx`
- Create: `shadow-desktop/tests/pages/MemoryPage.test.tsx`
- Create: `shadow-desktop/tests/pages/MCPPage.test.tsx`
- Create: `shadow-desktop/tests/pages/ModelsPage.test.tsx`
- Create: `shadow-desktop/tests/pages/SettingsPage.test.tsx`

- [ ] **Step 1: 创建 SetupPage 集成测试**

```typescript
// tests/pages/SetupPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SetupPage } from '@/pages/SetupPage';
import { useResonanceStore } from '@/stores/resonanceStore';

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

describe('SetupPage Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useResonanceStore.setState({
      discoveredServices: [],
      selectedService: null,
      connectionStatus: 'disconnected',
      error: null,
    });
  });

  it('renders setup page', () => {
    render(
      <MemoryRouter>
        <SetupPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/setup/i)).toBeInTheDocument();
  });

  it('discovers services on mount', async () => {
    const mockServices = [
      { name: 'Resonance', host: 'localhost', port: 8080 },
    ];
    useResonanceStore.setState({ discoveredServices: mockServices });

    render(
      <MemoryRouter>
        <SetupPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Resonance')).toBeInTheDocument();
    });
  });

  it('allows service selection', async () => {
    const mockService = { name: 'Resonance', host: 'localhost', port: 8080 };
    useResonanceStore.setState({ discoveredServices: [mockService] });

    render(
      <MemoryRouter>
        <SetupPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Resonance'));
    expect(useResonanceStore.getState().selectedService).toEqual(mockService);
  });
});
```

- [ ] **Step 2: 创建 TaskBoardPage 集成测试**

```typescript
// tests/pages/TaskBoardPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TaskBoardPage } from '@/pages/TaskBoardPage';
import { useTaskStore } from '@/stores/taskStore';

describe('TaskBoardPage Integration', () => {
  beforeEach(() => {
    useTaskStore.setState({
      tasks: [],
      filter: 'all',
      isLoading: false,
    });
  });

  it('renders task board', () => {
    render(
      <MemoryRouter>
        <TaskBoardPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/tasks/i)).toBeInTheDocument();
  });

  it('displays task list', async () => {
    const mockTasks = [
      { id: '1', title: 'Task 1', status: 'pending', priority: 'normal' },
      { id: '2', title: 'Task 2', status: 'in_progress', priority: 'high' },
    ];
    useTaskStore.setState({ tasks: mockTasks });

    render(
      <MemoryRouter>
        <TaskBoardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Task 1')).toBeInTheDocument();
      expect(screen.getByText('Task 2')).toBeInTheDocument();
    });
  });

  it('filters tasks by status', async () => {
    const mockTasks = [
      { id: '1', title: 'Task 1', status: 'pending' },
      { id: '2', title: 'Task 2', status: 'in_progress' },
    ];
    useTaskStore.setState({ tasks: mockTasks });

    render(
      <MemoryRouter>
        <TaskBoardPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /pending/i }));
    expect(useTaskStore.getState().filter).toBe('pending');
  });
});
```

- [ ] **Step 3: 创建其他页面集成测试**

(按相同模式创建 ConversationPage, AgentsPage, SkillsPage, MemoryPage, MCPPage, ModelsPage, SettingsPage)

- [ ] **Step 4: 运行页面集成测试**

```bash
cd https://github.com/iBLOC/shadow/shadow-desktop && pnpm test:run tests/pages/
```

Expected: All page integration tests pass

---

## Chunk 5: shadow-desktop Phase 3 - E2E 测试

### 5.1 E2E 测试场景

**Files:**
- Create: `shadow-desktop/tests/e2e/onboarding-flow.test.ts`
- Create: `shadow-desktop/tests/e2e/task-creation-flow.test.ts`
- Create: `shadow-desktop/tests/e2e/conversation-flow.test.ts`
- Create: `shadow-desktop/tests/e2e/provider-setup-flow.test.ts`

- [ ] **Step 1: 创建 onboarding-flow E2E 测试**

```typescript
// tests/e2e/onboarding-flow.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route } from 'react-router-dom';
import App from '@/App';
import { useResonanceStore } from '@/stores/resonanceStore';

describe('Onboarding E2E Flow', () => {
  beforeEach(() => {
    // Reset all stores
    useResonanceStore.setState({
      discoveredServices: [],
      selectedService: null,
      connectionStatus: 'disconnected',
    });
  });

  it('complete onboarding flow', async () => {
    render(
      <MemoryRouter initialEntries={['/setup']}>
        <App />
      </MemoryRouter>
    );

    // Step 1: Land on setup page
    expect(screen.getByText(/setup/i)).toBeInTheDocument();

    // Step 2: Service discovery
    const mockService = { name: 'Resonance', host: 'localhost', port: 8080 };
    useResonanceStore.setState({ discoveredServices: [mockService] });

    await waitFor(() => {
      expect(screen.getByText('Resonance')).toBeInTheDocument();
    });

    // Step 3: Select service
    fireEvent.click(screen.getByText('Resonance'));
    expect(useResonanceStore.getState().selectedService).toEqual(mockService);

    // Step 4: Connect
    useResonanceStore.setState({ connectionStatus: 'connected' });
    await waitFor(() => {
      expect(screen.getByText(/connected/i)).toBeInTheDocument();
    });

    // Step 5: Navigate to task board
    fireEvent.click(screen.getByRole('link', { name: /tasks/i }));
    expect(window.location.pathname).toBe('/tasks');
  });
});
```

- [ ] **Step 2: 创建 task-creation-flow E2E 测试**

```typescript
// tests/e2e/task-creation-flow.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '@/App';
import { useTaskStore } from '@/stores/taskStore';

describe('Task Creation E2E Flow', () => {
  beforeEach(() => {
    useTaskStore.setState({
      tasks: [],
      selectedTask: null,
    });
  });

  it('creates and manages a task', async () => {
    render(
      <MemoryRouter initialEntries={['/tasks']}>
        <App />
      </MemoryRouter>
    );

    // Step 1: Click add task button
    fireEvent.click(screen.getByRole('button', { name: /add task/i }));

    // Step 2: Fill task form
    await waitFor(() => {
      expect(screen.getByLabelText(/task title/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/task title/i), {
      target: { value: 'New Test Task' },
    });

    // Step 3: Submit
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    // Step 4: Verify task appears
    await waitFor(() => {
      expect(screen.getByText('New Test Task')).toBeInTheDocument();
    });

    // Step 5: Task exists in store
    expect(useTaskStore.getState().tasks).toHaveLength(1);
  });
});
```

- [ ] **Step 3: 创建其他 E2E 测试**

(conversation-flow, provider-setup-flow)

- [ ] **Step 4: 运行 E2E 测试**

```bash
cd https://github.com/iBLOC/shadow/shadow-desktop && pnpm test:run tests/e2e/
```

Expected: All E2E tests pass

---

## Chunk 6: shadow-mobile Phase 1 - Widget 测试基础设施

### 6.1 Flutter Widget 测试设置

**Files:**
- Modify: `shadow-mobile/test/widget_test.dart` (已有基础，更新)
- Create: `shadow-mobile/test/widget/chat_screen_test.dart`
- Create: `shadow-mobile/test/widget/task_board_screen_test.dart`
- Create: `shadow-mobile/test/widget/providers_screen_test.dart`
- Create: `shadow-mobile/test/widget/agents_screen_test.dart`
- Create: `shadow-mobile/test/widget/settings_screen_test.dart`

- [ ] **Step 1: 创建 chat_screen widget 测试**

```dart
// test/widget/chat_screen_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadow_mobile/screens/chat_screen.dart';

void main() {
  group('ChatScreen Widget Tests', () {
    testWidgets('renders chat screen', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(home: ChatScreen()),
        ),
      );

      expect(find.text('Chat'), findsOneWidget);
    });

    testWidgets('displays message input', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(home: ChatScreen()),
        ),
      );

      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets('sends message on submit', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(home: ChatScreen()),
        ),
      );

      await tester.enterText(find.byType(TextField), 'Hello');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pump();

      // Verify message appears in list
      expect(find.text('Hello'), findsOneWidget);
    });
  });
}
```

- [ ] **Step 2: 创建 task_board_screen widget 测试**

```dart
// test/widget/task_board_screen_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadow_mobile/screens/task_board_screen.dart';

void main() {
  group('TaskBoardScreen Widget Tests', () {
    testWidgets('renders task board', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(home: TaskBoardScreen()),
        ),
      );

      expect(find.text('Tasks'), findsOneWidget);
    });

    testWidgets('displays task list', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(home: TaskBoardScreen()),
        ),
      );

      expect(find.byType(ListView), findsOneWidget);
    });

    testWidgets('opens task creation dialog', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(home: TaskBoardScreen()),
        ),
      );

      await tester.tap(find.byIcon(Icons.add));
      await tester.pumpAndSettle();

      expect(find.byType(AlertDialog), findsOneWidget);
    });
  });
}
```

- [ ] **Step 3: 创建其他 screen widget 测试**

(providers_screen, agents_screen, settings_screen, models_screen, skills_screen, mcp_screen, memory_screen, conversation_screen)

- [ ] **Step 4: 运行 Widget 测试**

```bash
cd https://github.com/iBLOC/shadow/shadow-mobile && flutter test test/widget/
```

Expected: All widget tests pass

---

## Chunk 7: shadow-mobile Phase 2 - 集成测试

### 7.1 Flutter 集成测试

**Files:**
- Create: `shadow-mobile/integration_test/app_test.dart`
- Create: `shadow-mobile/integration_test/task_flow_test.dart`
- Create: `shadow-mobile/integration_test/conversation_flow_test.dart`

- [ ] **Step 1: 创建 integration_test 配置**

```yaml
# integration_test.yaml (放在项目根目录)
test: ./integration_test/
reporter: expanded
```

- [ ] **Step 2: 创建 app 集成测试**

```dart
// integration_test/app_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadow_mobile/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('App Integration Tests', () {
    testWidgets('app launches and shows home screen', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      expect(find.byType(MaterialApp), findsOneWidget);
    });

    testWidgets('can navigate to task board', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Tap task board navigation
      await tester.tap(find.byIcon(Icons.task_alt));
      await tester.pumpAndSettle();

      expect(find.text('Tasks'), findsOneWidget);
    });
  });
}
```

- [ ] **Step 3: 创建 task_flow 集成测试**

```dart
// integration_test/task_flow_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadow_mobile/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Task Flow Integration Tests', () {
    testWidgets('complete task creation flow', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Navigate to task board
      await tester.tap(find.byIcon(Icons.task_alt));
      await tester.pumpAndSettle();

      // Tap add button
      await tester.tap(find.byIcon(Icons.add));
      await tester.pumpAndSettle();

      // Fill form
      await tester.enterText(find.byType(TextField).first, 'Test Task');
      await tester.pump();

      // Submit
      await tester.tap(find.byType(ElevatedButton));
      await tester.pumpAndSettle();

      // Verify task appears
      expect(find.text('Test Task'), findsOneWidget);
    });
  });
}
```

- [ ] **Step 4: 运行集成测试**

```bash
cd https://github.com/iBLOC/shadow/shadow-mobile && flutter test integration_test/
```

Expected: All integration tests pass

---

## Chunk 8: CI/CD 集成准备

### 8.1 测试脚本配置

**Files:**
- Modify: `shadow-desktop/package.json` (添加 test:ci 脚本)
- Create: `shadow-mobile/.env.test` (测试环境变量)
- Create: `shadow-desktop/.env.test`

- [ ] **Step 1: 更新 desktop package.json**

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:ci": "vitest run --reporter=json --outputFile=test-results.json",
    "test:coverage": "vitest run --coverage"
  }
}
```

- [ ] **Step 2: 创建测试环境变量文件**

```bash
# shadow-desktop/.env.test
VITE_PREFRONTAL_HOST=http://localhost:8082
VITE_HIPPOCAMPUS_HOST=http://localhost:8081
VITE_RESONANCE_HOST=http://localhost:8080

# shadow-mobile/.env.test
PREFRONTAL_HOST=http://localhost:8082
HIPPOCAMPUS_HOST=http://localhost:8081
RESONANCE_HOST=http://localhost:8080
```

---

## Summary

### Track A: shadow-desktop
| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| Phase 1 | Component + Store tests | 2-3 weeks |
| Phase 2 | Page integration tests | 2-3 weeks |
| Phase 3 | E2E tests | 2-3 weeks |

### Track B: shadow-mobile
| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| Phase 1 | Widget tests | 2-3 weeks |
| Phase 2 | Integration tests | 2-3 weeks |
| Phase 3 | E2E tests | 2-3 weeks |

### Execution Order
1. **Parallel**: Track A Phase 1 + Track B Phase 1 (component/widget tests)
2. **Parallel**: Track A Phase 2 + Track B Phase 2 (integration tests)
3. **Parallel**: Track A Phase 3 + Track B Phase 3 (E2E tests)
