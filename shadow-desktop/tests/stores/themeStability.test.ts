import { describe, it, expect, beforeEach } from 'vitest';
import { useThemeStore } from '../../src/stores/themeStore';

describe('ThemeStore Stability', () => {
  beforeEach(() => {
    document.body.className = '';
    localStorage.clear();
    useThemeStore.setState({ theme: 'dark' });
  });

  describe('rapid setTheme calls', () => {
    it('should not accumulate class names after 5x dark calls', () => {
      const { setTheme } = useThemeStore.getState();
      for (let i = 0; i < 5; i++) {
        setTheme('dark');
      }
      const themeClasses = Array.from(document.body.classList).filter(
        (c) => c === 'dark' || c === 'light'
      );
      expect(themeClasses).toHaveLength(1);
      expect(themeClasses[0]).toBe('dark');
    });

    it('should not accumulate class names after 5x light calls', () => {
      const { setTheme } = useThemeStore.getState();
      for (let i = 0; i < 5; i++) {
        setTheme('light');
      }
      const themeClasses = Array.from(document.body.classList).filter(
        (c) => c === 'dark' || c === 'light'
      );
      expect(themeClasses).toHaveLength(1);
      expect(themeClasses[0]).toBe('light');
    });

    it('should not accumulate class names after mixed rapid calls', () => {
      const { setTheme } = useThemeStore.getState();
      setTheme('dark');
      setTheme('light');
      setTheme('dark');
      setTheme('light');
      setTheme('dark');
      const themeClasses = Array.from(document.body.classList).filter(
        (c) => c === 'dark' || c === 'light'
      );
      expect(themeClasses).toHaveLength(1);
      expect(themeClasses[0]).toBe('dark');
    });
  });

  describe('duplicate setTheme calls', () => {
    it('should not duplicate class when setting same theme twice', () => {
      const { setTheme } = useThemeStore.getState();
      setTheme('dark');
      setTheme('dark');
      expect(document.body.classList.contains('dark')).toBe(true);
      expect(document.body.classList.contains('light')).toBe(false);
      expect(document.body.classList.length).toBe(1);
    });

    it('should not duplicate class when setting same theme thrice', () => {
      const { setTheme } = useThemeStore.getState();
      setTheme('light');
      setTheme('light');
      setTheme('light');
      expect(document.body.classList.contains('light')).toBe(true);
      expect(document.body.classList.contains('dark')).toBe(false);
      expect(document.body.classList.length).toBe(1);
    });
  });

  describe('classList.length correctness', () => {
    it('should have exactly one theme class after setTheme', () => {
      const { setTheme } = useThemeStore.getState();
      setTheme('light');
      expect(document.body.classList.length).toBe(1);
    });

    it('should have exactly one theme class with unrelated classes present', () => {
      document.body.classList.add('some-unrelated-class');
      document.body.classList.add('another-class');
      const { setTheme } = useThemeStore.getState();
      setTheme('dark');
      expect(document.body.classList.length).toBe(3);
      const themeClasses = Array.from(document.body.classList).filter(
        (c) => c === 'dark' || c === 'light'
      );
      expect(themeClasses).toHaveLength(1);
    });
  });

  describe('toggle stability', () => {
    it('should end in dark after 10 toggles from initial dark', () => {
      const { toggleTheme } = useThemeStore.getState();
      for (let i = 0; i < 10; i++) {
        toggleTheme();
      }
      expect(useThemeStore.getState().theme).toBe('dark');
      expect(document.body.classList.contains('dark')).toBe(true);
      expect(document.body.classList.contains('light')).toBe(false);
    });

    it('should end in light after 11 toggles from initial dark', () => {
      const { toggleTheme } = useThemeStore.getState();
      for (let i = 0; i < 11; i++) {
        toggleTheme();
      }
      expect(useThemeStore.getState().theme).toBe('light');
      expect(document.body.classList.contains('light')).toBe(true);
      expect(document.body.classList.contains('dark')).toBe(false);
    });

    it('should toggle correctly without class accumulation', () => {
      const { toggleTheme } = useThemeStore.getState();
      for (let i = 0; i < 20; i++) {
        toggleTheme();
      }
      const themeClasses = Array.from(document.body.classList).filter(
        (c) => c === 'dark' || c === 'light'
      );
      expect(themeClasses).toHaveLength(1);
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
    it('should have no leftover classes after switching dark to light', () => {
      const { setTheme } = useThemeStore.getState();
      setTheme('dark');
      setTheme('light');
      expect(document.body.classList.contains('dark')).toBe(false);
      expect(document.body.classList.contains('light')).toBe(true);
    });

    it('should have no leftover classes after switching light to dark', () => {
      useThemeStore.setState({ theme: 'light' });
      document.body.classList.add('light');
      const { setTheme } = useThemeStore.getState();
      setTheme('dark');
      expect(document.body.classList.contains('light')).toBe(false);
      expect(document.body.classList.contains('dark')).toBe(true);
    });

    it('should clean up properly after rapid theme switches', () => {
      const { setTheme } = useThemeStore.getState();
      setTheme('dark');
      setTheme('light');
      setTheme('dark');
      setTheme('light');
      setTheme('dark');
      expect(document.body.classList.contains('light')).toBe(false);
      expect(document.body.classList.contains('dark')).toBe(true);
      const allClasses = Array.from(document.body.classList);
      const themeClasses = allClasses.filter(
        (c) => c === 'dark' || c === 'light'
      );
      expect(themeClasses).toHaveLength(1);
    });
  });
});