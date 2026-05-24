# UI Testing Automation - Design Specification

**Date**: 2026-05-24
**Status**: Draft
**Author**: Sisyphus

## 1. Overview

### 1.1 Purpose

Establish comprehensive automated UI testing capabilities for Shadow project (shadow-desktop and shadow-mobile), enabling regression prevention, TDD support, manual test replacement, and CI/CD quality gates.

### 1.2 Scope

| Application | Framework | Pages/Screens |
|-------------|-----------|---------------|
| shadow-desktop | Vitest + React Testing Library | 6 pages (Agents, Conversation, MCPPage, Memory, Models, Settings, Setup, Skills, TaskBoard) |
| shadow-mobile | flutter_test + integration_test | 10 screens (agents, chat, conversation, memory, mcp, model_management, providers, settings, skills, task_board) |

### 1.3 Success Criteria

- All pages/screens have automated tests at unit, component, integration, and E2E levels
- Tests run against real API services (Prefrontal, Hippocampus)
- Tests are integrated into development workflow
- Test infrastructure is CI/CD-ready (environment variables, configuration)

---

## 2. Testing Strategy

### 2.1 Test Pyramid

```
        ┌─────────┐
        │   E2E   │  ← 真实用户流程，跨页面
       ┌┴─────────┴┐
       │ Integration│  ← 多组件/页面集成
      ┌┴───────────┴┐
      │  Component   │  ← 单组件渲染+交互
     ┌┴─────────────┴┐
     │     Unit      │  ← 函数/工具类
    ┌┴───────────────┴┐
    │    Mock/Stub     │  ← API Mock (可选)
    └─────────────────┘
```

### 2.2 Testing Levels

| Level | Purpose | Tools | API Strategy |
|-------|---------|-------|--------------|
| Unit | Test utility functions, pure logic | Vitest / flutter_test | N/A |
| Component | Test UI components in isolation | Vitest + RTL / flutter_test | Mocked |
| Integration | Test multi-component flows | Vitest / integration_test | Real API |
| E2E | Test complete user journeys | Vitest / integration_test | Real API |

### 2.3 Phase Plan

```
Phase 1: Component/Unit Tests (2-3 weeks)
├── Desktop: Vitest + RTL for all React components
└── Mobile: flutter_test for all widgets

Phase 2: Integration Tests (2-3 weeks)
├── Desktop: Vitest page-level integration tests
└── Mobile: integration_test screen flows

Phase 3: E2E Tests (2-3 weeks)
├── Desktop: Multi-page user journeys
└── Mobile: Complete screen flows with navigation
```

---

## 3. shadow-desktop Testing

### 3.1 Technology Stack

| Category | Tool | Version | Purpose |
|----------|------|---------|---------|
| Test Runner | Vitest | ^3.1.0 | Unit/Component/Integration tests |
| React Testing | @testing-library/react | latest | Component rendering, user interaction |
| DOM Environment | jsdom | ^25.0.0 | Browser environment simulation |
| API Mocking | MSW (optional) | ^2.x | Service worker mocking |
| E2E | Vitest (extended) | - | Multi-page tests |

### 3.2 Existing Infrastructure

```
shadow-desktop/
├── tests/
│   ├── setup.ts           # Vitest setup with RTL
│   ├── Button.test.tsx    # Example component test
│   └── resonanceStore.test.ts
├── vitest.config.ts       # Already configured
├── src/
│   ├── components/        # React components (51 files)
│   ├── pages/             # Route pages (18 files)
│   └── stores/            # Zustand stores
```

### 3.3 Test File Naming Convention

```
tests/
├── components/
│   └── {ComponentName}.test.tsx
├── pages/
│   └── {PageName}.test.tsx
├── stores/
│   └── {StoreName}.test.ts
└── e2e/
    └── {flow-name}.test.ts
```

### 3.4 Component Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComponentName } from '../src/components/path/ComponentName';

describe('ComponentName', () => {
  it('renders correctly', () => {
    render(<ComponentName />);
    expect(screen.getByRole('...')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    const handleClick = vi.fn();
    render(<ComponentName onClick={handleClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledOnce();
  });
});
```

### 3.5 Page Integration Test Template

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PageName } from '../src/pages/PageName';
import { StoreProvider } from '../src/stores/StoreName';

describe('PageName Integration', () => {
  it('loads and displays data', async () => {
    render(
      <StoreProvider>
        <PageName />
      </StoreProvider>
    );
    // Assert data renders
  });
});
```

### 3.6 E2E Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route } from 'react-router-dom';
import App from '../src/App';

describe('User Flow E2E', () => {
  it('completes task creation flow', async () => {
    render(
      <MemoryRouter initialEntries={['/tasks']}>
        <App />
      </MemoryRouter>
    );

    // Navigate and interact through multiple pages
  });
});
```

---

## 4. shadow-mobile Testing

### 4.1 Technology Stack

| Category | Tool | Version | Purpose |
|----------|------|---------|---------|
| Test Runner | flutter_test | SDK | Unit/Widget tests |
| Integration | integration_test | SDK | Screen flow tests |
| Mocking | mocktail | ^1.0.0 | Mock dependencies |
| HTTP | dio_mocker | - | API mocking |

### 4.2 Existing Infrastructure

```
shadow-mobile/
├── test/
│   ├── widget_test.dart      # Basic widget test
│   └── service_provider_test.dart
├── lib/
│   ├── screens/              # 10 screens
│   ├── providers/            # Riverpod providers
│   └── services/            # API clients
└── pubspec.yaml              # flutter_test available
```

### 4.3 Test File Naming Convention

```
test/
├── widget/
│   └── {ScreenName}_widget_test.dart
├── integration/
│   └── {FlowName}_integration_test.dart
└── unit/
    └── {ServiceName}_test.dart
```

### 4.4 Widget Test Template

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadow_mobile/screens/screen_name.dart';

void main() {
  group('ScreenName Widget Tests', () {
    testWidgets('renders correctly', (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(home: ScreenName()),
        ),
      );

      expect(find.text('Expected Text'), findsOneWidget);
    });

    testWidgets('handles user interaction', (WidgetTester tester) async {
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(home: ScreenName()),
        ),
      );

      await tester.tap(find.byType(ElevatedButton));
      await tester.pump();

      // Assert state change
    });
  });
}
```

### 4.5 Integration Test Template

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shadow_mobile/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  group('Screen Flow Integration Tests', () {
    it('completes full task flow', (WidgetTester tester) async {
      app.main();
      await tester.pumpAndSettle();

      // Navigate through screens
      await tester.tap(find.byIcon(Icons.add));
      await tester.pumpAndSettle();

      // Fill forms and submit
      await tester.enterText(find.byType(TextField), 'Task Name');
      await tester.tap(find.byType(ElevatedButton));
      await tester.pumpAndSettle();

      // Assert result
    });
  });
}
```

---

## 5. Test Coverage Requirements

### 5.1 Desktop Pages

| Page | Unit | Component | Integration | E2E |
|------|------|-----------|------------|-----|
| AgentsPage | ✅ | ✅ | ✅ | ✅ |
| ConversationPage | ✅ | ✅ | ✅ | ✅ |
| MCPPage | ✅ | ✅ | ✅ | ✅ |
| MemoryPage | ✅ | ✅ | ✅ | ✅ |
| ModelsPage | ✅ | ✅ | ✅ | ✅ |
| SettingsPage | ✅ | ✅ | ✅ | ✅ |
| SetupPage | ✅ | ✅ | ✅ | ✅ |
| SkillsPage | ✅ | ✅ | ✅ | ✅ |
| TaskBoardPage | ✅ | ✅ | ✅ | ✅ |

### 5.2 Mobile Screens

| Screen | Widget | Integration | E2E |
|--------|--------|-------------|-----|
| agents_screen | ✅ | ✅ | ✅ |
| chat_screen | ✅ | ✅ | ✅ |
| conversation_screen | ✅ | ✅ | ✅ |
| memory_screen | ✅ | ✅ | ✅ |
| mcp_screen | ✅ | ✅ | ✅ |
| model_management_screen | ✅ | ✅ | ✅ |
| providers_screen | ✅ | ✅ | ✅ |
| settings_screen | ✅ | ✅ | ✅ |
| skills_screen | ✅ | ✅ | ✅ |
| task_board_screen | ✅ | ✅ | ✅ |

---

## 6. API Testing Strategy

### 6.1 Service Dependencies

| Service | URL | Purpose |
|---------|-----|---------|
| Resonance | http://localhost:8080 | Task dispatch, model scoring |
| Prefrontal | http://localhost:8082 | Task execution, Agent management |
| Hippocampus | http://localhost:8081 | Memory storage and search |

### 6.2 Environment Configuration

Tests will use environment variables to determine API endpoints:

```bash
# .env.test (desktop)
VITE_PREFRONTAL_HOST=http://localhost:8082
VITE_HIPPOCAMPUS_HOST=http://localhost:8081

# .env.test (mobile)
PREFRONTAL_HOST=http://localhost:8082
HIPPOCAMPUS_HOST=http://localhost:8081
```

### 6.3 API Error Handling

Tests must handle:
- Service unavailable (graceful skip with warning)
- Network timeouts (retry with exponential backoff)
- Invalid responses (clear assertion messages)

---

## 7. CI/CD Integration

### 7.1 Test Scripts

```json
// shadow-desktop/package.json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:ci": "vitest run --reporter=json",
    "test:e2e": "vitest run --config vitest.e2e.config.ts"
  }
}
```

```yaml
# shadow-mobile/integration_test.yaml (Flutter)
test: ./integration_test/
reporter: json
```

### 7.2 Git Hooks (Optional)

```bash
# .husky/pre-commit
pnpm test:run

# .husky/pre-push
pnpm test:ci
```

### 7.3 Future CI/CD Pipeline

```yaml
# .github/workflows/test.yml (future)
on: [push, pull_request]
jobs:
  desktop-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm test:ci
  mobile-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
      - run: flutter test integration_test/
```

---

## 8. Directory Structure

### 8.1 shadow-desktop

```
shadow-desktop/
├── tests/
│   ├── setup.ts                    # Shared setup
│   ├── components/                 # Component tests
│   │   ├── Button.test.tsx
│   │   └── ...
│   ├── pages/                      # Page integration tests
│   │   └── TaskBoardPage.test.tsx
│   ├── stores/                    # Store tests
│   │   └── resonanceStore.test.ts
│   └── e2e/                        # E2E tests
│       └── task-flow.test.ts
├── vitest.config.ts                # Unit/Component config
├── vitest.e2e.config.ts           # E2E config (new)
└── package.json
```

### 8.2 shadow-mobile

```
shadow-mobile/
├── test/
│   ├── widget/                     # Widget tests
│   │   ├── widget_test.dart
│   │   └── chat_screen_test.dart
│   └── unit/                       # Unit tests
│       └── service_provider_test.dart
├── integration_test/                # Integration tests
│   ├── app_test.dart
│   └── task_flow_test.dart
└── pubspec.yaml
```

---

## 9. Implementation Checklist

### Phase 1: Component/Unit Tests
- [ ] Configure Vitest for desktop E2E mode
- [ ] Create component test utilities/helpers
- [ ] Write component tests for all desktop components
- [ ] Configure Flutter widget tests properly
- [ ] Write widget tests for all mobile screens
- [ ] Add store/provider tests for Zustand and Riverpod

### Phase 2: Integration Tests
- [ ] Create page-level integration test setup
- [ ] Write integration tests for desktop pages
- [ ] Configure integration_test for mobile
- [ ] Write integration tests for mobile screens
- [ ] Add navigation testing

### Phase 3: E2E Tests
- [ ] Design E2E test scenarios
- [ ] Implement desktop E2E tests
- [ ] Implement mobile E2E tests
- [ ] Add test data factories
- [ ] Document E2E testing patterns

### Infrastructure
- [ ] Configure test environment variables
- [ ] Add test scripts to package.json
- [ ] Set up Git hooks (optional)
- [ ] Document test running procedures
- [ ] Create test data seeding utilities

---

## 10. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| API dependency instability | Flaky tests | Add timeout/retry logic, graceful degradation |
| UI component churn | Constant test updates | Use semantic queries, minimize implementation detail coupling |
| Mobile device fragmentation | Inconsistent results | Use standard Flutter testing, prefer widget tests over golden tests |
| Test maintenance burden | Tests become debt | Enforce test review in code review process |
| Flaky E2E tests | Loss of confidence | Isolate E2E from unit tests, clear failure triage process |

---

## 11. Future Considerations

- **Visual Regression Testing**: Consider adding `jest-preview` or `chromatic` for visual regression
- **Performance Testing**: Lighthouse CI integration for performance budgets
- **Accessibility Testing**: Add `jest-axe` (desktop) and `flutter_accessibility` (mobile)
- **Contract Testing**: Consider Pact for API contract verification between services
