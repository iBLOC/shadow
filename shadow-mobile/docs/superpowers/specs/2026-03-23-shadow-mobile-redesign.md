# Shadow Mobile UI Redesign Specification

**Date:** 2026-03-23
**Version:** 1.1
**Status:** Ready for Implementation

---

## 1. Overview

Redesign all 10 screens in Shadow Mobile (Flutter) to provide better UX with glassmorphism visual style, grouped navigation, and information-dense layouts.

### Goals
- Modern glassmorphism visual design with blue accent color
- Simplified navigation with 4 Tab groups
- Information-rich but organized layouts
- Smooth animations with accessibility support

---

## 2. Navigation Structure

### Tab Groups (4 Tabs)

| Tab | Icon | Color | Pages |
|-----|------|-------|-------|
| Chat | `Icons.chat_bubble_outline` | Blue | Chat (default) |
| Tasks | `Icons.task_alt` | Blue | Task Board, Conversation |
| Manage | `Icons.dashboard_customize` | Blue | Management Hub → Providers/Models/MCP/Skills/Agents/Memory |
| Settings | `Icons.settings_outlined` | Blue | Settings |

### Route Structure
```
/ (ChatScreen - default)
├── /tasks (TaskBoardScreen)
├── /conversations (ConversationScreen)
├── /manage (ManagementHubScreen)
│   ├── /manage/providers (ProvidersScreen)
│   ├── /manage/models (ModelManagementScreen)
│   ├── /manage/mcp (MCPScreen)
│   ├── /manage/skills (SkillsScreen)
│   ├── /manage/agents (AgentsScreen)
│   └── /manage/memory (MemoryScreen)
└── /settings (SettingsScreen)
```

**Note:** Conversation is a separate top-level route (not nested under Tasks) to allow direct deep linking. Tasks tab shows both Task Board and Conversation in its navigation history.

### Navigation Implementation
- Use GoRouter with ShellRoute for persistent bottom navigation
- Tab state preserved when switching between tabs
- Management section uses nested navigation

---

## 3. Visual Design System

### Color Palette

| Role | Light Mode | Dark Mode |
|------|------------|-----------|
| Primary | `#3B82F6` | `#3B82F6` |
| Primary Variant | `#2563EB` | `#60A5FA` |
| Secondary | `#8B5CF6` | `#A78BFA` |
| Background Start | `#F1F5F9` | `#0F172A` |
| Background End | `#E2E8F0` | `#1E293B` |
| Surface (Glass) | `rgba(255,255,255,0.75)` | `rgba(30,41,59,0.75)` |
| Surface Border | `rgba(59,130,246,0.3)` | `rgba(255,255,255,0.15)` |
| Text Primary | `#0F172A` | `#F8FAFC` |
| Text Secondary | `#64748B` | `#94A3B8` |
| Success | `#22C55E` | `#4ADE80` |
| Warning | `#F59E0B` | `#FBBF24` |
| Error | `#EF4444` | `#F87171` |

### Typography

| Style | Font | Size | Weight |
|-------|------|------|--------|
| Display | System (SF Pro / Roboto) | 32sp | Bold (700) |
| Headline | System | 24sp | SemiBold (600) |
| Title | System | 20sp | Medium (500) |
| Body Large | System | 16sp | Regular (400) |
| Body | System | 14sp | Regular (400) |
| Caption | System | 12sp | Regular (400) |
| Button | System | 14sp | SemiBold (600) |

### Glass Effect Specifications

```dart
// Glass Card
BoxDecoration(
  color: Colors.white.withOpacity(0.1),
  borderRadius: BorderRadius.circular(16),
  border: Border.all(
    color: Colors.white.withOpacity(0.2),
    width: 1,
  ),
)

// Frosted Glass (for overlays)
BackdropFilter(
  filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
  child: Container(
    decoration: BoxDecoration(
      color: Colors.white.withOpacity(0.15),
      borderRadius: BorderRadius.circular(16),
    ),
  ),
)
```

### Spacing System (8pt Grid)

| Token | Value |
|-------|-------|
| xs | 4px |
| sm | 8px |
| md | 16px |
| lg | 24px |
| xl | 32px |
| xxl | 48px |

### Border Radius

| Element | Radius |
|---------|--------|
| Cards | 16px |
| Buttons | 12px |
| Input Fields | 8px |
| Chips/Tags | 20px (pill) |
| Avatars | 50% (circle) |

---

## 4. Screen Specifications

### 4.1 Chat Screen (`/`)

**Layout:**
```
┌─────────────────────────────────┐
│ [Model ▼]         [Settings] [📷]│  ← AppBar with glass icons
├─────────────────────────────────┤
│                                 │
│  ┌─────────────────────────┐    │
│  │ User message             │    │  ← Right-aligned bubble
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │ AI response             │    │  ← Left-aligned bubble
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │ [Thinking...]          │    │  ← Streaming indicator
│  └─────────────────────────┘    │
│                                 │
├─────────────────────────────────┤
│ [📎] [Multi-line input    ] [➤]│  ← Glass input bar
└─────────────────────────────────┘
```

**Components:**
- Model selector: Glass dropdown with blur background
- Message bubbles: Glass cards with sender-based alignment
- Input bar: Glass background with attachment + send buttons
- Streaming indicator: Animated pulse (1500ms, opacity 0.5→1.0 loop)

**States:**
- Loading: Skeleton bubbles with shimmer animation
- Empty: Centered icon + "Start a conversation" message + suggested prompts
- Error: Red-tinted glass card with error message + retry button
- Streaming: Pulsing animation at bottom during AI response generation

---

### 4.2 Task Board Screen (`/tasks`)

**Layout:**
```
┌─────────────────────────────────┐
│ Tasks                    [🔄]   │
├─────────────────────────────────┤
│ ┌────────┬────────┬────────┐    │
│ │Backlog │In Prog │Review  │    │  ← Column headers with count
│ │  (3)   │  (2)   │  (1)   │    │
│ ├────────┼────────┼────────┤    │
│ │┌──────┐│┌──────┐│┌──────┐│    │
│ ││ Card │││ Card │││ Card ││    │  ← Draggable task cards
│ │└──────┘│└──────┘│└──────┘│    │
│ │┌──────┐│┌──────┐│        │    │
│ ││ Card │││ Card ││        │    │
│ │└──────┘│└──────┘│        │    │
│ └────────┴────────┴────────┘    │
└─────────────────────────────────┘
│           ┌────────┐             │
│           │ Done   │             │  ← Done shown below (completed tasks)
│           │  (5)   │             │
│           └────────┘             │
└─────────────────────────────────┘
```

**Components:**
- 3 visible columns: Backlog, In Progress, Review (horizontal scroll if 4th column needed on small screens)
- Done column: Collapsible or shown as collapsed section below main board
- Column headers with task count badges
- Task cards with priority indicator, title, assignee avatar
- Viewport-based horizontal scroll (no hidden content)

**Interactions:**
- Drag and drop between columns (except Done - only via complete action)
- Tap card to view details
- Swipe right to mark complete, swipe left to delete
- Pull to refresh

**States:**
- Loading: Column headers with shimmer effect
- Empty: "No tasks yet" with illustration + "Create your first task" button
- Error: Red banner with retry button at top of affected column

---

### 4.3 Conversation Screen (`/conversations`)

**Layout:**
```
┌─────────────────────────────────┐
│ Conversations                   │
├─────────────────────────────────┤
│ 🔍 Search...         [Filter ▼]│  ← Search + filter
├─────────────────────────────────┤
│ ┌─────────────────────────────┐│
│ │[Chat] Conversation Title     ││
│ │ Last message preview...      ││
│ │ Today 2:30 PM              >││
│ └─────────────────────────────┘│
│ ┌─────────────────────────────┐│
│ │[Chat] Another Conversation  ││
│ │ Last message...              ││
│ │ Yesterday                  >││
│ └─────────────────────────────┘│
│                                 │
│                          [FAB +]│
└─────────────────────────────────┘
```

**Components:**
- Search bar with glass styling
- Conversation list items: icon, title, preview, timestamp, chevron
- Swipe left to delete (with confirmation)
- FAB for new conversation

**States:**
- Loading: Skeleton list items with shimmer
- Empty: Centered icon + "No conversations yet" + "Start chatting" button
- Error: Banner with retry option
- Search empty: "No results for '[query]'"

---

### 4.4 Management Hub (`/manage`)

**Layout:**
```
┌─────────────────────────────────┐
│ Manage                    [👤]  │
├─────────────────────────────────┤
│ ┌───────────┬───────────┐      │
│ │[Provider] │[Model]    │      │
│ │ Providers │ Models     │      │
│ │ ● 3 active│ 3 local   │      │
│ ├───────────┼───────────┤      │
│ │[MCP]      │[Skill]    │      │
│ │ MCP       │ Skills     │      │
│ │ 2 servers │ 5 active  │      │
│ ├───────────┼───────────┤      │
│ │[Agent]    │[Memory]   │      │
│ │ Agents    │ Memory     │      │
│ │ 4 online  │ 128 docs  │      │
│ └───────────┴───────────┘      │
└─────────────────────────────────┘
```

**Components:**
- 2×3 grid of management cards
- Each card: icon (Material), title, status/summary
- Status indicators (colored dot: green=active, yellow=warning, gray=inactive)
- Tap to navigate to respective screen

**States:**
- Loading: Grid with shimmer placeholder cards
- Error: Banner with service connection error

---

### 4.5 Providers Screen (`/manage/providers`)

**Layout:**
```
┌─────────────────────────────────┐
│ ← Providers           [Add +]  │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ ● OpenAI                   │ │
│ │ Model: gpt-4o               │ │
│ │ Connected            [Edit]│ │
│ ├─────────────────────────────┤ │
│ │ ● Anthropic               │ │
│ │ Model: claude-sonnet-4     >│ │
│ │ Connected            [Edit]│ │
│ ├─────────────────────────────┤ │
│ │ ○ Ollama (Local)           │ │
│ │ Model: llama3               │ │
│ │ Disconnected         [Edit]│ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

**Components:**
- Provider cards with status indicator (●=connected, ○=disconnected, ◐=warning)
- Expandable card (tap to expand) showing: base URL, API key status, model list
- Edit button opens modal bottom sheet
- Add button opens full-screen form

**States:**
- Loading: Skeleton cards with shimmer
- Empty: "No providers configured" + "Add your first provider" button
- Error: Red banner with connection error message

---

### 4.6 Models Screen (`/manage/models`)

**Layout:**
```
┌─────────────────────────────────┐
│ ← Models                [Sync] │
├─────────────────────────────────┤
│ [Local (3)]    [Cloud (12)]     │  ← Tab bar
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │[📱] Qwen2.5-7B              │ │
│ │ 4.2 GB │ MNN │ ● Downloaded│ │
│ │                         [X] │ │
│ ├─────────────────────────────┤ │
│ │[📱] Llama3-8B               │ │
│ │ 4.6 GB │ MNN │ Downloading  │ │
│ │ [████████░░] 67%            │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

**Components:**
- Tab bar for Local/Cloud switching
- Model cards with: icon, name, size, format, status badge
- Download progress bar (when downloading)
- Action buttons: download, delete, info

**States:**
- Loading: Skeleton cards with shimmer
- Empty (Local): "No local models" + "Download from cloud" button
- Empty (Cloud): "No models available" + "Check connection" button
- Error: Banner with retry option
- Downloading: Progress bar with percentage and cancel option

---

### 4.7 Settings Screen (`/settings`)

**Layout:**
```
┌─────────────────────────────────┐
│ Settings                        │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │[👤] Account                  │ │
│ │ shadow@user.io               │ │
│ ├─────────────────────────────┤ │
│ │[🎨] Appearance               │ │
│ │ Theme: [Dark][Light][System] │ │
│ ├─────────────────────────────┤ │
│ │[🔗] Services                 │ │
│ │ ● Resonance: Connected      │ │
│ │ ● Prefrontal: Connected    │ │
│ │ ● Hippocampus: Connected  │ │
│ ├─────────────────────────────┤ │
│ │[♿] Accessibility             │ │
│ │ [Toggle switches...]         │ │
│ ├─────────────────────────────┤ │
│ │[ℹ️] About                    │ │
│ │ Version 1.0.0               │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

**Components:**
- Grouped settings sections with icons
- Service status indicators with connection info
- Theme selector (segmented control: Dark/Light/System)
- Toggle switches for accessibility options (reduce motion, high contrast)
- App version info

**States:**
- Loading: Skeleton sections with shimmer
- Service error: Red indicator with "Retry" option next to failed service
- Update available: Badge on About section

---

## 5. Component Library

### GlassCard
```dart
class GlassCard extends StatelessWidget {
  final Widget child;
  final double borderRadius;
  final EdgeInsets padding;
  final VoidCallback? onTap;
}
```

### GlassButton
```dart
class GlassButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback onPressed;
  final bool isPrimary;
}
```

### StatusIndicator
```dart
class StatusIndicator extends StatelessWidget {
  final StatusType status; // connected, warning, error
  final String? label;
}
```

### GlassTextField
```dart
class GlassTextField extends StatelessWidget {
  final TextEditingController controller;
  final String? hintText;
  final int maxLines;
  final ValueChanged<String>? onChanged;
}
```

### GlassAppBar
```dart
class GlassAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final List<Widget>? actions;
  final Widget? leading;
  final bool showBackButton;
}
```

### GlassBottomNav
```dart
class GlassBottomNav extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  final List<GlassBottomNavItem> items;
}

class GlassBottomNavItem {
  final IconData icon;
  final String label;
}
```

### EmptyState
```dart
class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? description;
  final String? buttonLabel;
  final VoidCallback? onButtonPressed;
}
```

### LoadingShimmer
```dart
class LoadingShimmer extends StatelessWidget {
  final double width;
  final double height;
  final double borderRadius;
}
```

---

## 6. Animation Specifications

| Animation | Duration | Curve | Description |
|-----------|----------|-------|-------------|
| Page transition | 200ms | ease-out | Fade + slide up |
| Card appear | 300ms | ease-out | Fade in + slide up 20px |
| Button press | 100ms | ease-in | Scale to 0.95 |
| Loading pulse | 1500ms | ease-in-out | Opacity 0.5 → 1.0 loop |
| Bottom sheet | 250ms | ease-out | Slide up from bottom |

### Accessibility
- All animations respect `MediaQuery.of(context).disableAnimations`
- Minimum touch target: 48x48dp
- Focus indicators visible in keyboard mode

---

## 7. Technical Implementation Notes

### Dependencies
- `flutter_animate` for animation helpers (optional - can use built-in AnimatedContainer/AnimatedOpacity)
- Custom glass effect implementation using `BackdropFilter` + `BoxDecoration`
- GoRouter for navigation with `ShellRoute`

### State Management
- Continue using Riverpod (existing pattern)
- Extract shared StateNotifier patterns to provider files
- Use `ref.watch` for reactive UI updates

### File Structure Changes
```
lib/
├── screens/
│   ├── chat_screen.dart          (redesign)
│   ├── task_board_screen.dart    (redesign)
│   ├── conversation_screen.dart  (redesign)
│   ├── manage/
│   │   ├── management_hub_screen.dart  (NEW)
│   │   ├── providers_screen.dart        (redesign)
│   │   ├── model_management_screen.dart (redesign - existing file)
│   │   ├── mcp_screen.dart              (redesign)
│   │   ├── skills_screen.dart           (redesign)
│   │   ├── agents_screen.dart           (redesign)
│   │   └── memory_screen.dart           (redesign)
│   └── settings_screen.dart     (redesign)
├── widgets/
│   ├── glass_card.dart           (NEW)
│   ├── glass_button.dart         (NEW)
│   ├── glass_text_field.dart     (NEW)
│   ├── glass_app_bar.dart        (NEW)
│   ├── glass_bottom_nav.dart     (NEW)
│   └── status_indicator.dart     (NEW)
├── theme/
│   ├── glass_theme.dart          (NEW - replaces main.dart theme)
│   └── app_colors.dart           (NEW)
└── router/
    └── app_router.dart           (modify - add ShellRoute)
```

**Note:** File names match existing codebase where applicable. `management_hub_screen.dart` is new.

---

## 8. Anti-Patterns to Avoid

- ❌ Don't use emoji as icons
- ❌ Don't use solid white backgrounds for cards in dark mode
- ❌ Don't use pure black (#000000) for text
- ❌ Don't use linear animation curves
- ❌ Don't ignore `prefers-reduced-motion`
- ❌ Don't create horizontal scroll on mobile without indication
- ❌ Don't use more than 3 font weights

---

## 9. Success Criteria

- [ ] 4 Tab navigation works correctly with state preservation
- [ ] Glass effect visible and consistent across all screens
- [ ] All 10 screens redesigned with consistent styling
- [ ] Animations smooth at 60fps
- [ ] Light/Dark mode both functional
- [ ] Accessibility: touch targets ≥48dp, focus visible
- [ ] No horizontal overflow on 375px width screens
