import { describe, it, expect, beforeEach } from 'vitest';
import { useThemeStore } from '../../src/stores/themeStore';

describe('ThemeStore Stability', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    localStorage.clear();
    useThemeStore.setState({ theme: 'dark' });
  });

  describe('rapid setTheme calls', () => {
    it('should keep dark class on html element after 5x dark calls', () => {
      const { setTheme } = useThemeStore.getState();
      for (let i = 0; i < 5; i++) {
        setTheme('dark');
      }
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.classList.contains('light')).toBe(false);
    });

    it('should remove dark class on html element after 5x light calls', () => {
      const { setTheme } = useThemeStore.getState();
      for (let i = 0; i < 5; i++) {
        setTheme('light');
      }
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('should end in dark after mixed rapid calls', () => {
      const { setTheme } = useThemeStore.getState();
      setTheme('dark');
      setTheme('light');
      setTheme('dark');
      setTheme('light');
      setTheme('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  describe('duplicate setTheme calls', () => {
    it('should set dark class when setting same theme twice', () => {
      const { setTheme } = useThemeStore.getState();
      setTheme('dark');
      setTheme('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('should not have dark class when setting light thrice', () => {
      const { setTheme } = useThemeStore.getState();
      setTheme('light');
      setTheme('light');
      setTheme('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  describe('classList correctness', () => {
    it('should not add dark class when theme is light', () => {
      const { setTheme } = useThemeStore.getState();
      setTheme('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  describe('toggle stability', () => {
    it('should end in dark after 10 toggles from initial dark', () => {
      const { toggleTheme } = useThemeStore.getState();
      for (let i = 0; i < 10; i++) {
        toggleTheme();
      }
      expect(useThemeStore.getState().theme).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('should end in light after 11 toggles from initial dark', () => {
      const { toggleTheme } = useThemeStore.getState();
      for (let i = 0; i < 11; i++) {
        toggleTheme();
      }
      expect(useThemeStore.getState().theme).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  describe('localStorage persistence', () => {
    it('should persist theme=light to localStorage after setTheme(light)', () => {
      const { setTheme } = useThemeStore.getState();
      setTheme('light');
      const stored = localStorage.getItem('theme-storage');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.state.theme).toBe('light');
    });

    it('should persist theme=dark to localStorage after setTheme(dark)', () => {
      useThemeStore.setState({ theme: 'light' });
      const { setTheme } = useThemeStore.getState();
      setTheme('dark');
      const stored = localStorage.getItem('theme-storage');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.state.theme).toBe('dark');
    });

    it('should persist theme after toggle', () => {
      const { toggleTheme } = useThemeStore.getState();
      toggleTheme();
      const stored = localStorage.getItem('theme-storage');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.state.theme).toBe('light');
    });
  });

  describe('no leftover classes from previous themes', () => {
    it('should have no dark class after switching dark to light', () => {
      const { setTheme } = useThemeStore.getState();
      setTheme('dark');
      setTheme('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('should have dark class after switching light to dark', () => {
      useThemeStore.setState({ theme: 'light' });
      const { setTheme } = useThemeStore.getState();
      setTheme('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('should clean up properly after rapid theme switches', () => {
      const { setTheme } = useThemeStore.getState();
      setTheme('dark');
      setTheme('light');
      setTheme('dark');
      setTheme('light');
      setTheme('dark');
      expect(document.documentElement.classList.contains('light')).toBe(false);
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });
});