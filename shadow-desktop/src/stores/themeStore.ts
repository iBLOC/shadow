import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  deriveAccentTones,
  glassSurfaceAlpha,
  hexToRgb,
  hslTriplet,
} from '../styles/accent.g';

type Theme = 'dark' | 'light';

/**
 * 用户的外观偏好 —— 「每个人的影子有自己的样子」。
 *
 * 设计数值在 `styles/tokens.css`（由仓根 design-tokens.json 生成），
 * 这里只存「这个用户选了什么」。
 */
export interface Appearance {
  /** 主题色（hex）。默认中性 —— 影子本身没有颜色。 */
  accentSeed: string;
  /** 玻璃（半影层）强度 0..1。0 = 关掉玻璃，1 = 全强度。 */
  glassIntensity: number;
  /** 对话框 / 面板背景覆盖（hex）。null = 跟随主题。 */
  surfaceOverride: string | null;
}

export const DEFAULT_APPEARANCE: Appearance = {
  accentSeed: '#71717A',
  glassIntensity: 1,
  surfaceOverride: null,
};

interface ThemeState {
  theme: Theme;
  appearance: Appearance;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setAppearance: (patch: Partial<Appearance>) => void;
}

function applyAppearance(appearance: Appearance) {
  const root = document.documentElement;
  const dark = root.classList.contains('dark');
  const tones = deriveAccentTones(appearance.accentSeed);

  // 主色是**反色**：暗底上是光，亮底上是影。
  // 与移动端 GlassTheme.build 的取色规则一致。
  root.style.setProperty(
    '--primary',
    hslTriplet(dark ? tones.darkTone : tones.lightTone),
  );
  root.style.setProperty(
    '--primary-foreground',
    hslTriplet(dark ? tones.darkToneFg : tones.lightToneFg),
  );
  root.style.setProperty('--shadow-accent', hslTriplet(appearance.accentSeed));
  root.style.setProperty('--shadow-accent-fg', hslTriplet(tones.fg));

  // 光源跟着主题色走 —— 玻璃要有东西可模糊。
  const { r, g, b } = hexToRgb(appearance.accentSeed);
  root.style.setProperty(
    '--ambient-glow',
    `rgb(${r} ${g} ${b} / ${dark ? 0.16 : 0.12})`,
  );
  root.style.setProperty(
    '--ambient-glow-2',
    `rgb(${r} ${g} ${b} / ${dark ? 0.08 : 0.07})`,
  );

  // 玻璃强度：alpha 往 1 走就是「关掉玻璃」（落回实心表面）。
  const base = dark ? glassSurfaceAlpha.dark : glassSurfaceAlpha.light;
  const k = Math.min(1, Math.max(0, appearance.glassIntensity));
  const alpha = base.alpha * k + (1 - k);
  root.style.setProperty(
    '--glass-surface',
    `rgb(${base.rgb.join(' ')} / ${Math.round(alpha * 1000) / 1000})`,
  );

  // 对话框 / 面板背景覆盖
  if (appearance.surfaceOverride) {
    root.style.setProperty('--card', hslTriplet(appearance.surfaceOverride));
    root.style.setProperty('--popover', hslTriplet(appearance.surfaceOverride));
  } else {
    root.style.removeProperty('--card');
    root.style.removeProperty('--popover');
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      appearance: DEFAULT_APPEARANCE,

      setTheme: (theme) => {
        applyTheme(theme);
        // 明暗变了，主题色的两端色调也要跟着换。
        applyAppearance(get().appearance);
        set({ theme });
      },

      toggleTheme: () => {
        const newTheme = get().theme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
        applyAppearance(get().appearance);
        set({ theme: newTheme });
      },

      setAppearance: (patch) => {
        const appearance = { ...get().appearance, ...patch };
        applyAppearance(appearance);
        set({ appearance });
      },
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme);
          applyAppearance(state.appearance ?? DEFAULT_APPEARANCE);
        }
      },
    },
  ),
);
