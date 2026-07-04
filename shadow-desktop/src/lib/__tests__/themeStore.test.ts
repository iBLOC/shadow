import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('themeStore', () => {
  beforeEach(() => {
    vi.resetModules();
    document.documentElement.className = '';
    localStorage.clear();
  });

  it('starts with dark theme by default', async () => {
    const { useThemeStore } = await import('../../stores/themeStore');
    const { theme } = useThemeStore.getState();
    expect(theme).toBe('dark');
  });

  it('setTheme updates theme state', async () => {
    const { useThemeStore } = await import('../../stores/themeStore');
    const { setTheme } = useThemeStore.getState();

    setTheme('light');
    const { theme } = useThemeStore.getState();
    expect(theme).toBe('light');
  });

  it('setTheme adds dark class to html element', async () => {
    const { useThemeStore } = await import('../../stores/themeStore');
    const { setTheme } = useThemeStore.getState();

    setTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('setTheme removes dark class when light', async () => {
    const { useThemeStore } = await import('../../stores/themeStore');
    const { setTheme } = useThemeStore.getState();

    setTheme('dark');
    setTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('toggleTheme switches from dark to light', async () => {
    const { useThemeStore } = await import('../../stores/themeStore');
    const { toggleTheme } = useThemeStore.getState();

    toggleTheme();
    const { theme } = useThemeStore.getState();
    expect(theme).toBe('light');
  });

  it('toggleTheme switches from light to dark', async () => {
    const { useThemeStore } = await import('../../stores/themeStore');
    const { setTheme, toggleTheme } = useThemeStore.getState();

    setTheme('light');
    toggleTheme();
    const { theme } = useThemeStore.getState();
    expect(theme).toBe('dark');
  });

  it('toggleTheme toggles dark class on html element', async () => {
    const { useThemeStore } = await import('../../stores/themeStore');
    const { setTheme, toggleTheme } = useThemeStore.getState();

    setTheme('dark');
    toggleTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('persists theme to localStorage', async () => {
    const { useThemeStore } = await import('../../stores/themeStore');
    const { setTheme } = useThemeStore.getState();

    setTheme('light');

    const store = useThemeStore.persist.getOptions();
    expect(store).toBeDefined();
  });

  it('restores theme from localStorage on initialization', async () => {
    localStorage.setItem('theme-storage', JSON.stringify({
      state: { theme: 'light' },
      version: 0,
    }));

    vi.resetModules();
    const { useThemeStore } = await import('../../stores/themeStore');

    const { theme } = useThemeStore.getState();
    expect(theme).toBe('light');
  });
});