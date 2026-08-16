# Shadow 影 - 品牌 UI 改造规格

**Date:** 2026-03-25
**Version:** 2.0
**Status:** Ready for Implementation
**Replaces:** 2026-03-23-shadow-mobile-redesign.md (color section only)

---

## 1. 品牌概念

### "影" 的设计隐喻

```
Shadow = 像影子一样无处不在、安静、精准地帮助你

• 影子 = 不抢风头，但始终存在
• 评估 = 数据驱动、洞察力  
• 伴随 = 私密、个性化
• 智能 = 前沿 AI 技术
```

### 设计关键词

- **神秘感** — 深邃的暗色调，不张扬
- **精准感** — 清晰的信息层次，精确的动效
- **伴随感** — 柔和的边缘，温暖的反馈
- **AI 感** — 科技紫色调，智能青色点缀

---

## 2. 品牌配色方案 "Deep Shadow"

### 核心调色板

| 角色 | 色值 | 用途 |
|------|------|------|
| **Primary** | `#A78BFA` (淡紫) | 主要操作、选中状态 |
| **Primary Glow** | `#C4B5FD` (亮紫) | hover 状态、光晕效果 |
| **Secondary** | `#22D3EE` (青色) | 状态指示、AI 相关元素 |
| **Secondary Glow** | `#67E8F9` (亮青) | 活跃状态、次要强调 |
| **Background** | `#09090B` (近黑) | 主背景、OLED 友好 |
| **Background Alt** | `#18181B` (深灰) | 卡片背景、分组 |
| **Surface** | `#27272A` (中灰) | 输入框、次级表面 |
| **Surface Glass** | `rgba(39,39,42,0.75)` | 玻璃态背景 |
| **Border** | `rgba(255,255,255,0.1)` | 边框、分隔线 |
| **Border Glow** | `rgba(167,139,250,0.3)` | 发光边框 |

### 文本色

| 角色 | 色值 | 用途 |
|------|------|------|
| **Text Primary** | `#FAFAFA` | 主要文本 |
| **Text Secondary** | `#A1A1AA` | 次要文本 |
| **Text Muted** | `#71717A` | 禁用文本、占位符 |

### 状态色

| 状态 | 色值 | 用途 |
|------|------|------|
| **Success** | `#34D399` | 成功状态 |
| **Warning** | `#FBBF24` | 警告状态 |
| **Error** | `#F87171` | 错误状态 |
| **Info** | `#22D3EE` | 信息状态 |

---

## 3. Neon Glass 设计语言

### 玻璃效果规范

```dart
// 标准玻璃卡片
Container(
  decoration: BoxDecoration(
    color: Color(0x4D27272A), // 30% opacity
    borderRadius: BorderRadius.circular(16),
    border: Border.all(
      color: Color(0x1AFFFFFF), // 10% white border
      width: 1,
    ),
  ),
)

// Neon Glow 玻璃卡片 (用于选中/活跃状态)
Container(
  decoration: BoxDecoration(
    color: Color(0x4D27272A),
    borderRadius: BorderRadius.circular(16),
    border: Border.all(
      color: Color(0x4DA78BFA), // 30% primary glow
      width: 1,
    ),
    boxShadow: [
      BoxShadow(
        color: Color(0x4DA78BFA), // 30% primary glow
        blurRadius: 20,
        spreadRadius: -5,
      ),
    ],
  ),
)

// 发光边框效果 (用于重点元素)
BoxDecoration(
  borderRadius: BorderRadius.circular(12),
  border: Border.all(
    color: Color(0x4DA78BFA),
    width: 1.5,
  ),
  boxShadow: [
    BoxShadow(
      color: Color(0x33A78BFA), // 20% glow
      blurRadius: 12,
      spreadRadius: 0,
    ),
  ],
)
```

### 动效哲学

```
影子动效 = 缓慢出现、优雅消失

| 动效类型 | 时长 | 曲线 | 说明 |
|---------|------|------|------|
| 页面过渡 | 300ms | ease-out | 淡入淡出 |
| 卡片出现 | 400ms | ease-out | 从下向上浮现 |
| 按钮反馈 | 150ms | ease-in | 轻微缩放 |
| 发光脉冲 | 2000ms | ease-in-out | 呼吸式脉动 |
| Hover 光晕 | 200ms | ease-out | 边框发光渐强 |
```

---

## 4. 组件改造规格

### 4.1 GlassCard 改造

```dart
// 新增 glow 属性
class GlassCard extends StatelessWidget {
  final Widget child;
  final double borderRadius;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;
  final bool glow; // 新增：是否启用发光效果
}

// 发光状态下边框变为紫色
if (glow) {
  border: Border.all(color: AppColors.primaryGlow, width: 1.5)
  boxShadow: [BoxShadow(color: AppColors.primaryGlow, blurRadius: 20)]
}
```

### 4.2 输入框改造

```dart
// 输入框发光边框
InputDecoration(
  filled: true,
  fillColor: AppColors.surfaceGlass,
  border: OutlineInputBorder(
    borderRadius: BorderRadius.circular(12),
    borderSide: BorderSide(color: AppColors.border),
  ),
  focusedBorder: OutlineInputBorder(
    borderRadius: BorderRadius.circular(12),
    borderSide: BorderSide(color: AppColors.primary, width: 2),
  ),
)
```

### 4.3 底部导航改造

```dart
// 选中态使用 Neon Glow 效果
BottomNavigationBarItem(
  icon: Icon(icon),
  selectedIcon: Container(
    padding: EdgeInsets.all(8),
    decoration: BoxDecoration(
      color: AppColors.primary.withOpacity(0.2),
      borderRadius: BorderRadius.circular(12),
      border: Border.all(color: AppColors.primaryGlow),
      boxShadow: [BoxShadow(color: AppColors.primaryGlow, blurRadius: 12)],
    ),
    child: Icon(icon, color: AppColors.primary),
  ),
)
```

---

## 5. 实施优先级

| 优先级 | 文件 | 改造内容 |
|--------|------|---------|
| P0 | `app_colors.dart` | 重定义所有颜色变量 |
| P0 | `glass_theme.dart` | 应用新配色、更新 CardTheme |
| P1 | `glass_card.dart` | 增加 glow 属性和 Neon Glow 效果 |
| P1 | `chat_screen.dart` | 更新输入框、消息气泡配色 |
| P2 | `glass_bottom_nav.dart` | 选中态发光效果 |
| P2 | `main_shell.dart` | 底部导航发光效果 |
| P3 | `empty_state.dart` | 影子概念图标 |

---

## 6. 成功标准

- [ ] 所有颜色使用新的 Deep Shadow 调色板
- [ ] 玻璃卡片在选中/活跃状态有 Neon Glow 效果
- [ ] 动效符合"影子"哲学（缓慢出现、优雅消失）
- [ ] 暗色模式文本对比度 ≥ 4.5:1
- [ ] OLED 友好的纯黑背景

---

## 7. 需要更新的现有文件

```
lib/theme/app_colors.dart         ← P0
lib/theme/glass_theme.dart        ← P0  
lib/widgets/glass_card.dart      ← P1
lib/screens/chat_screen.dart     ← P1
lib/widgets/glass_bottom_nav.dart ← P2
lib/widgets/main_shell.dart      ← P2
lib/widgets/empty_state.dart     ← P3
```
