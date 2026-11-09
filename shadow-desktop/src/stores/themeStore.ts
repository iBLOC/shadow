import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  deriveAccentTones,
  glassSurfaceAlpha,
  hexToRgb,
  hslTriplet,
} from '../styles/accent.g';
import { recallAccent, rememberAccent } from '../lib/appearanceMemory';

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
  /**
   * 聊天区背景图（压缩后的 data URL）。null = 不用背景图。
   * 只住本地（localStorage）—— 不进海马体：图片跟着机器走，
   * 换设备后的「同一张图」没有意义（路径/体积都不跨设备）。
   */
  chatBackground: string | null;
}

export const DEFAULT_APPEARANCE: Appearance = {
  accentSeed: '#71717A',
  glassIntensity: 1,
  surfaceOverride: null,
  chatBackground: null,
};

interface ThemeState {
  theme: Theme;
  appearance: Appearance;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  /** 改外观。主题色变了会**顺带让影子记住**（写一条海马体记忆）。 */
  setAppearance: (patch: Partial<Appearance>) => void;
  /**
   * 从海马体读回影子记住的主题色并应用。
   *
   * 「主题色也是记忆的一部分」—— 启动时把影子记住的偏好恢复回来。
   * 读不到（端脑没起 / 离线）就用本地那一份，不报错。
   */
  hydrateFromMemory: () => Promise<void>;
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
    (set, get) => {
      /** 落地一次外观变更（DOM + store）。 */
      const commit = (appearance: Appearance) => {
        applyAppearance(appearance);
        set({ appearance });
      };

      return {
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
          const previous = get().appearance;
          const next = { ...previous, ...patch };
          commit(next);

          // 主题色变了 → 让影子记住它（海马体 `dimension=Agent`）。
          // 写失败不是致命错误：本地值已经是权威的那一份，下次连上再同步。
          if (next.accentSeed !== previous.accentSeed) {
            void rememberAccent(next.accentSeed).catch(() => {
              /* 海马体够不到 —— 下次连上时再补写 */
            });
          }
        },

        hydrateFromMemory: async () => {
          const seed = await recallAccent().catch(() => null);
          if (seed && seed !== get().appearance.accentSeed) {
            commit({ ...get().appearance, accentSeed: seed });
          }
        },
      };
    },
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
