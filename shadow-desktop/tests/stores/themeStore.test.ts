import { describe, it, expect, beforeEach } from 'vitest';
import { useThemeStore } from '../../src/stores/themeStore';

describe('ThemeStore', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    localStorage.clear();
    useThemeStore.setState({ theme: 'dark' });
  });

  describe('initial state', () => {
    it('defaults to dark theme', () => {
      const state = useThemeStore.getState();
      expect(state.theme).toBe('dark');
    });
  });

  describe('setTheme', () => {
    it('updates theme to light', () => {
      const { setTheme } = useThemeStore.getState();
      setTheme('light');

      expect(useThemeStore.getState().theme).toBe('light');
    });

    it('updates theme to dark', () => {
      useThemeStore.setState({ theme: 'light' });
      const { setTheme } = useThemeStore.getState();
      setTheme('dark');

      expect(useThemeStore.getState().theme).toBe('dark');
    });

    it('does not add dark class to html element when light', () => {
      const { setTheme } = useThemeStore.getState();
      setTheme('light');

      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('adds dark class to html element when dark', () => {
      document.documentElement.classList.remove('dark');
      const { setTheme } = useThemeStore.getState();
      setTheme('dark');

      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  describe('toggleTheme', () => {
    it('switches dark to light', () => {
      useThemeStore.setState({ theme: 'dark' });
      const { toggleTheme } = useThemeStore.getState();
      toggleTheme();

      expect(useThemeStore.getState().theme).toBe('light');
    });

    it('switches light to dark', () => {
      useThemeStore.setState({ theme: 'light' });
      const { toggleTheme } = useThemeStore.getState();
      toggleTheme();

      expect(useThemeStore.getState().theme).toBe('dark');
    });

    it('updates document.documentElement dark class on toggle', () => {
      useThemeStore.setState({ theme: 'dark' });
      document.documentElement.classList.add('dark');
      const { toggleTheme } = useThemeStore.getState();
      toggleTheme();

      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('can be toggled multiple times consistently', () => {
      const { toggleTheme } = useThemeStore.getState();

      toggleTheme();
      expect(useThemeStore.getState().theme).toBe('light');

      toggleTheme();
      expect(useThemeStore.getState().theme).toBe('dark');

      toggleTheme();
      expect(useThemeStore.getState().theme).toBe('light');
    });
  });
});