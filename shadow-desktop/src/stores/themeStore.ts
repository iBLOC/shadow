import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      setTheme: (theme) => {
        document.body.classList.remove('light', 'dark');
        document.body.classList.add(theme);
        set({ theme });
      },
      toggleTheme: () => {
        const newTheme = get().theme === 'dark' ? 'light' : 'dark';
        document.body.classList.remove('light', 'dark');
        document.body.classList.add(newTheme);
        set({ theme: newTheme });
      },
    }),
    {
      name: 'theme-storage',
    }
  )
);
