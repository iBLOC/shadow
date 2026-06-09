import { describe, it, expect, beforeEach } from 'vitest';
import { useThemeStore } from '../../src/stores/themeStore';

describe('ThemeStore', () => {
 beforeEach(() => {
 document.body.className = '';
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

 it('adds theme class to document.body', () => {
 const { setTheme } = useThemeStore.getState();
 setTheme('light');

 expect(document.body.classList.contains('light')).toBe(true);
 expect(document.body.classList.contains('dark')).toBe(false);
 });

 it('removes opposite theme class from document.body', () => {
 document.body.classList.add('light');
 const { setTheme } = useThemeStore.getState();
 setTheme('dark');

 expect(document.body.classList.contains('dark')).toBe(true);
 expect(document.body.classList.contains('light')).toBe(false);
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

 it('updates document.body class on toggle', () => {
 useThemeStore.setState({ theme: 'dark' });
 const { toggleTheme } = useThemeStore.getState();
 toggleTheme();

 expect(document.body.classList.contains('light')).toBe(true);
 expect(document.body.classList.contains('dark')).toBe(false);
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
