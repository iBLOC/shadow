# shadcn 黑白灰主题重设计

**日期**: 2026-06-30
**项目**: shadow-desktop
**类型**: 主题重设计 (破坏性变更)

## 目标

删除 `shadow-desktop` 中所有自定义主题色、毛玻璃特效、自定义字体、渐变装饰，统一使用 shadcn/ui 默认 slate 黑白灰配色。

## 设计决策

| 决策 | 结论 |
|---|---|
| 状态色 (success/danger/warning/info) | 保留语义色 |
| 毛玻璃特效 (glass morphism) | 全部删除 |
| 自定义字体 (Orbitron, Exo 2) | 删除，用系统默认 |
| 渐变边框/发光阴影 | 全部删除 |
| 自定义 CSS 变量 | 全部用 shadcn 的 HSL 变量 |

## 变更清单

### 删除

- `src/styles/design-system.css` — 自定义色值、玻璃特效、字体定义
- `src/pages/*.css` (11 files) — 页面样式
- `src/components/Layout.css` — 侧边栏样式
- `src/components/*.css` (PWAInstallPrompt, MoveSessionDialog) — 组件样式
- `src/components/business/**/*.module.css` (8 files) — CSS Module 样式

### 保留并保持不变

- `src/index.css` — 已是 shadcn 默认 slate 主题 `:root` + `.dark` 块
- `tailwind.config.ts` — 已配置 shadcn 颜色映射
- `components.json` — `baseColor: "slate"`

### 重写

- `src/stores/themeStore.ts` — 从 `body.light`/`body.dark` class 切换到 shadcn `.dark`
- `src/App.css` — 精简为基础布局样式，所有颜色改用 Tailwind 原子类
- 所有页面 TSX — 删除自定义 CSS 类名引用，改用 Tailwind 原子类
- 所有 business 组件 TSX — 删除 CSS Module 引用，改用 Tailwind 原子类

### 色彩映射

```
--shadow-primary       → hsl(var(--foreground))
--shadow-primary-muted → hsl(var(--muted))
--accent               → hsl(var(--accent))
--bg-primary           → hsl(var(--background))
--text-primary         → hsl(var(--foreground))
--text-secondary       → hsl(var(--muted-foreground))
--text-muted           → hsl(var(--muted-foreground) / 0.6)
--glass-bg             → hsl(var(--card))
--glass-border         → hsl(var(--border))
--border-color         → hsl(var(--border))
--bg-secondary         → hsl(var(--secondary))
--bg-tertiary          → hsl(var(--muted))
--success              → 保留 (#10B981)
--success-muted        → hsl(160 84% 39% / 0.15)
--danger               → 保留 (hsl(var(--destructive)))
--danger-muted         → hsl(var(--destructive) / 0.15)
--warning              → 保留 (#F59E0B)
--warning-muted        → hsl(38 92% 50% / 0.15)
--info                 → 保留 (#3B82F6)
--info-muted           → hsl(217 91% 60% / 0.15)
```

## 影响范围

- 删除 ~18 个 CSS 文件
- 重写 ~15 个 TSX 文件样式
- 重构 1 个 store (themeStore)
- 无功能变更，纯视觉迁移
