# Shadow 新 logo —— 蚀（日月相蚀）

> 日期：2026-10-29
> 范围：仓根 `brand/`（几何与产物）→ 桌面端（Tauri 图标 / PWA / favicon / 应用内标记）→ 移动端（Android 启动图标与自适应图标）

---

## 1. 为什么重做

旧图标是**青蓝渐变 + 太极式两圆 +「影」字（Orbitron）**。它和现在的视觉语言直接冲突：

- 视觉语言已经改成 **Umbra 本影（实心）/ Penumbra 半影（玻璃）/ Caustic 焦散（实时信号）**，基底是中性 zinc 阶 + 主题色槽位；
- 旧图标把品牌色**写死成青蓝**，而新的原则是「影子本身没有颜色，主题色是用户可覆盖的槽位」；
- 移动端的 Android 启动图标**从来没定制过** —— 至今还是 Flutter 默认的蓝色 F 图标。

所以旧图标既不是当前设计语言的一部分，也没有真正覆盖两端。

## 2. 设计的硬约束

| 约束 | 来源 | 落法 |
| --- | --- | --- |
| 影子本身没有颜色 | 品牌原则 | 影一律中性色（`--logo-ink`），只有「光」吃主题色槽位（`--logo-accent`，默认 `#71717A`，用户可覆盖） |
| 光永远比影亮 | 三层语言 | 亮底：影 = 近黑 `#09090B`，光 = 主题色原色；暗底：影 = zinc-600 `#52525B`，光 = 主题色的提亮版 |
| 16px 要站得住 | 托盘 / 任务栏 | 粗实体，不靠细线；对照页每套都给 120 / 48 / 32 / 16 四档 |
| 单色版要能认出结构 | 托盘 / favicon | 影与光之间切一道缝（否则两个咬合的圆会糊成一块） |
| 几何不手画 | 仓库惯例 | 真相源在 `brand/geom.mjs`，产物全部脚本生成 |
| SVG 与位图不许走样 | 仓库惯例 | 光栅化走解析式判定（`brand/raster.mjs`），SVG 与 PNG 共用同一份几何 |

## 3. 方案推导

### 3.1 第一轮（全部淘汰）

| 方案 | 形态 | 淘汰原因 |
| --- | --- | --- |
| 蚀（初版） | 渐细月牙笔触 | 像笔刷扫痕，16px 存不住 |
| 隙（初版） | 两圆交叠的横杠 | 几何算错，渲染成一根横杠 |
| 穿（初版） | 光束穿影盘 | 斜杠读起来像「禁止」符号 |

### 3.2 第二轮 → 四套候选

| 方案 | 形态 | 机制 |
| --- | --- | --- |
| **蚀** | 日月相蚀 | 左「月」在前（圆满），右「日」在后（被遮盖） |
| 隙 | 双圆 + 透镜光缝 | 交集是共享的那部分 |
| 环核 | 环 + 偏心核 | 记忆是环，灵魂是核 |
| 弧 | 月牙 + 焦散亮带 | 最接近传统月亮图标 |

> 用户选定：**蚀**。并补了一条要求：**单色版在影与光之间留一道缝**。

### 3.3 定稿的几何调整（用户反馈后）

初稿两个圆**离得太远**（圆心距 = 半径），日轮与月盘平分秋色 → 主体散了，读起来像「两个叠起来的圆」而不是日食。

改成圆心距 **46 / 半径 150**：日轮退成挂在月盘右缘的一道细月牙 —— 这才是日食的样子，也正是上一版「主体压暗、光只占一条边」的观感。

```
front（月，圆满）:  center (233, 256)  r 150
back （日，被遮）:  center (279, 256)  r 150
圆心距 46  →  日轮露出 46 宽的月牙（16px 上 1.4px）
```

单色版的缝 = 20（512 单位，16px 上约 0.6px）：月牙用「后盘减（放大 20 的前盘圆）」算出来，与月盘之间留出一道可见的空隙。

## 4. 昼夜模式响应（这套 logo 的核心）

**同一份几何，只换两笔的颜色角色**：

| | 前面的月（影 / 光？） | 后面的日轮 | 读作 |
| --- | --- | --- | --- |
| **白天** | 影（中性近黑） | 光（主题色） | 日亮月暗 —— 日食，月挡住日 |
| **黑夜** | 光（主题色） | 影（中性暗影） | 月亮日暗 —— 月亮升起来了 |

影子的**形态**在两种模式下完全不变，是观者自己读出昼夜。实现上就是 CSS 里交换两笔的 `fill`：

```css
.shadow-mark [data-part='front'] { fill: var(--logo-ink); }
.shadow-mark [data-part='back']  { fill: var(--shadow-accent); }
.dark .shadow-mark [data-part='front'] { fill: var(--shadow-accent); }
.dark .shadow-mark [data-part='back']  { fill: var(--logo-ink); }
```

## 5. 资产清单

### 品牌源（仓根 `brand/`）

| 文件 | 作用 |
| --- | --- |
| `geom.mjs` | **唯一真相源**：调色板、几何工具、四套方案、蚀方案的两条路径 |
| `raster.mjs` | 解析式光栅化 + 手写 PNG 编码（无第三方依赖） |
| `gen-logo.mjs` | 产出 `logo/*.svg` + `preview.html` + `preview/*.png` 对照图 |
| `gen-icons.mjs` | 产出两端平台图标 + 桌面端应用内标记组件 |
| `logo/` | 白天 / 黑夜 / 单色 SVG + `app-icon.svg` |
| `preview/` | 对照图（白天 / 黑夜 / 换主题色 / 单色 + 四档尺寸） |
| `icon/app-icon.png` | Tauri `tauri icon` 的 1024 源图 |

### 桌面端（`shadow-desktop/`）

| 文件 | 说明 |
| --- | --- |
| `src-tauri/icons/*` | Tauri 全套图标（`pnpm tauri icon` 从 1024 源图生成，含 ICO/ICNS/Windows Store） |
| `public/pwa-icon.svg` | favicon（底板版 —— 浅底在浅色/深色标签栏上都看得见） |
| `public/pwa-192.png`、`pwa-512.png` | PWA 图标，标记落在 maskable 安全区内 |
| `public/pwa-512-monochrome.png` | 单色版（浏览器主题化图标用） |
| `src/components/brand/ShadowMark.tsx` | **生成物**：应用内标记组件（路径由几何算出，不手抄） |
| `src/index.css` | `.shadow-mark` 的两笔颜色与昼夜角色互换 |
| `src/components/Layout.tsx` | 侧栏原来挂的是 lucide `Brain` 占位图标 → 换成 `ShadowMark` |
| `src/pages/SetupPage.tsx` | 首次引导页的 lucide `Server` 占位图标 → 换成 `ShadowMark` |
| `index.html` | favicon 从 `/vite.svg`（Vite 模板！）改成 `/pwa-icon.svg`；theme-color 从旧青蓝 `#06b6d4` 改成 `#0A0A0B` |
| `public/manifest.web.json` | theme_color 同样改成 `#0A0A0B` |

> **顺手修掉的两个既有缺陷**：`manifest.web.json` 引用的 `pwa-192.png` / `pwa-512.png` / `pwa-512-monochrome.png` **在仓库里根本不存在**（PWA 图标一直是坏的）；`index.html` 的 favicon 一直指着 **Vite 默认图标**。

### 移动端（`shadow-mobile/android/`）

| 文件 | 说明 |
| --- | --- |
| `res/mipmap-<dpi>/ic_launcher.png` | 传统启动图标（原来还是 Flutter 默认图标） |
| `res/mipmap-<dpi>/ic_launcher_foreground.png` | 自适应图标前景（透明底，缩在中央 72dp 安全区内） |
| `res/drawable/ic_launcher_background.xml` | 自适应图标底色（旧的是深蓝渐变 `#0F0F23/#1A1A3E` → 中性 `#F4F4F5`） |
| `res/mipmap-anydpi-v26/ic_launcher.xml` | 前景从 `@drawable/` 改成 `@mipmap/`（位图前景，渲染完全可控） |

> 旧的 `res/drawable/ic_launcher_foreground.xml`（手写矢量月牙）已删除。

### 设计令牌

`design-tokens.json` 新增 `color.brand.logo`（`inkLight` / `inkDark` / `tile` / `tileRadius`），投影到：

- 桌面端 `tokens.css`：`--logo-ink`（亮底近黑 / 暗底 zinc-600）
- 移动端 `app_tokens.g.dart`：`logoInkLight` / `logoInkDark` / `logoTile`

## 6. 生成链路

```
brand/geom.mjs （唯一真相源）
      │
      ├── brand/gen-logo.mjs   → brand/logo/*.svg + brand/preview/*
      └── brand/gen-icons.mjs  → brand/icon/app-icon.png
                                 shadow-desktop/public/pwa-*.png
                                 shadow-desktop/src/components/brand/ShadowMark.tsx
                                 shadow-mobile/android/.../mipmap-*
```

两端的图标与应用内标记**都从同一份几何渲染**，不存在「预览好看、出图走样」。

**CI 漂移校验**：新增 `Brand asset drift check`（`node brand/gen-icons.mjs --check`），改了 `geom.mjs` 忘了重跑生成器就红。

> 反向验证过：手动改坏生成物 → `--check` 报「不同步」且 exit 1；重跑生成器 → exit 0。

## 7. 验证记录

| 项 | 结果 |
| --- | --- |
| 桌面端 `tsc --noEmit` | exit 0 |
| 桌面端 `vitest run` | **112 文件 / 1140 passed / 2 skipped** |
| 桌面端 `pnpm build:web` | exit 0 |
| 移动端 `flutter analyze` | 0 error（89 issues 全是存量 info/warning） |
| 移动端 `flutter test` | **247 / 247 全绿** |
| `gen_tokens.mjs --check` | 0 过期 |
| `gen_nav.mjs --check` | 0 过期 |
| `check-agent-surface.mjs` | **0 阻断 / 0 提示** |
| `brand/gen-icons.mjs --check` | 0 漂移 |
| SVG ↔ 光栅一致性 | 浏览器实拍比对一致（弧的 sweep 标志没写反） |
| 应用内渲染 | `vite preview` 实拍：暗色模式下 `.dark` 角色互换生效 |

## 8. 遗留

- **托盘图标仍是彩色底板版**（`src-tauri/icons/32x32.png`，Rust 侧 `setup_tray` 直接读它）。Windows 的模板图标（随任务栏反色）需要 `.ico` 级别的结构支持，本次没做 —— 托盘里看到的是浅底方块。
- **移动端应用内没有 logo 位**，只换了启动图标。若要在「我」页放标记，`AppTokens.logoInkLight/Dark` 已就位。
- **真机验证仍未做**（设备失联）：Android 自适应图标在各家 launcher 下的裁切效果未实测，只保证了标记落在中央 72dp 安全区内。
