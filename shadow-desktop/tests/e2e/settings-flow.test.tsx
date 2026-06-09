import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SettingsPage } from '../../src/pages/SettingsPage';

vi.mock('../../src/stores/themeStore', () => {
 const setThemeMock = vi.fn();
 const state = { theme: 'dark' as 'dark' | 'light', setTheme: setThemeMock };
 (globalThis as any).__themeMock = state;
 const hookMock: any = vi.fn(() => state);
 hookMock.getState = vi.fn(() => state);
 hookMock.setState = vi.fn();
 return { useThemeStore: hookMock };
 });

vi.mock('../../src/stores/serviceStore', () => {
 const checkAllServicesMock = vi.fn().mockResolvedValue(undefined);
 (globalThis as any).__serviceMock = { checkAllServices: checkAllServicesMock };
 return {
 useServiceStore: vi.fn(() => ({
 services: {
 prefrontal: {
 name: 'prefrontal',
 displayName: 'Prefrontal',
 host: 'localhost',
 port:8082,
 status: 'healthy' as const,
 },
 hippocampus: {
 name: 'hippocampus',
 displayName: 'Hippocampus',
 host: 'localhost',
 port:8081,
 status: 'healthy' as const,
 },
 },
 isChecking: false,
 checkAllServices: checkAllServicesMock,
 })),
 };
});

vi.mock('../../src/stores/resonanceStore', () => {
 const discoverServicesMock = vi.fn().mockResolvedValue(undefined);
 const connectMock = vi.fn().mockResolvedValue(undefined);
 (globalThis as any).__resonanceMock = {
 discoverServices: discoverServicesMock,
 connect: connectMock,
 };
 return {
 useResonanceStore: vi.fn(() => ({
 discoveredServices: [],
 selectedService: null,
 connectionStatus: 'disconnected',
 discoverServices: discoverServicesMock,
 selectService: vi.fn(),
 connect: connectMock,
 disconnect: vi.fn().mockResolvedValue(undefined),
 })),
 };
});

vi.mock('@tauri-apps/api/core', () => ({
 invoke: vi.fn(() => Promise.resolve()),
}));

const changeLanguageMock = vi.fn();
const mockI18n = {
 language: 'en-US',
 changeLanguage: changeLanguageMock,
};

vi.mock('react-i18next', () => ({
 useTranslation: () => ({
 t: (key: string) => key,
 i18n: mockI18n,
 }),
}));

describe('Settings Flow E2E', () => {
 beforeEach(() => {
 vi.clearAllMocks();
 const resonance = (globalThis as any).__resonanceMock;
 resonance.discoverServices.mockClear();
 resonance.discoverServices.mockResolvedValue(undefined);
 resonance.connect.mockClear();
 resonance.connect.mockResolvedValue(undefined);
 const service = (globalThis as any).__serviceMock;
 service.checkAllServices.mockClear();
 service.checkAllServices.mockResolvedValue(undefined);
 changeLanguageMock.mockClear();
 });

 const renderWithRouter = (component: React.ReactElement) => {
 return render(
 <MemoryRouter initialEntries={['/settings']}>
 <Routes>
 <Route path="/settings" element={component} />
 </Routes>
 </MemoryRouter>
 );
 };

 it('renders page header and subtitle', async () => {
 renderWithRouter(<SettingsPage />);

 await waitFor(() => {
 expect(screen.getByText('settings.title')).toBeInTheDocument();
 expect(screen.getByText('settings.subtitle')).toBeInTheDocument();
 });
 });

 it('renders service status section with both services', async () => {
 renderWithRouter(<SettingsPage />);

 await waitFor(() => {
 expect(screen.getAllByText('Prefrontal').length).toBeGreaterThan(0);
 expect(screen.getAllByText('Hippocampus').length).toBeGreaterThan(0);
 expect(screen.getAllByText('settings.healthy').length).toBeGreaterThan(0);
 });
 });

 it('renders resonance connection section', async () => {
 renderWithRouter(<SettingsPage />);

 await waitFor(() => {
 expect(screen.getByText('settings.resonanceConnection')).toBeInTheDocument();
 });
 });

 it('renders language selector with current value en-US', async () => {
 renderWithRouter(<SettingsPage />);

 await waitFor(() => {
 const languageSelect = screen.getAllByRole('combobox').find(
 (el) => (el as HTMLSelectElement).value === 'en-US'
 );
 expect(languageSelect).toBeInTheDocument();
 });
 });

 it('calls i18n.changeLanguage when language select changed', async () => {
 renderWithRouter(<SettingsPage />);

 const languageSelect = await screen.findAllByRole('combobox').then(
 (selects) => selects.find(
 (el) => (el as HTMLSelectElement).value === 'en-US'
 ) as HTMLSelectElement
 );

 fireEvent.change(languageSelect, { target: { value: 'zh-CN' } });

 await waitFor(() => {
 expect(changeLanguageMock).toHaveBeenCalledWith('zh-CN');
 });
 });

 it('renders theme buttons (light and dark)', async () => {
 renderWithRouter(<SettingsPage />);

 await waitFor(() => {
 expect(screen.getByText('settings.light')).toBeInTheDocument();
 expect(screen.getByText('settings.dark')).toBeInTheDocument();
 });
 });

 it('calls setTheme when light theme button clicked', async () => {
 renderWithRouter(<SettingsPage />);

 const lightButton = await screen.findByRole('button', {
 name: /settings.light/i,
 });
 fireEvent.click(lightButton);

 await waitFor(() => {
 const { setTheme } = (globalThis as any).__themeMock;
 expect(setTheme).toHaveBeenCalledWith('light');
 });
 });

 it('calls setTheme when dark theme button clicked', async () => {
 renderWithRouter(<SettingsPage />);

 const darkButton = await screen.findByRole('button', {
 name: /settings.dark/i,
 });
 fireEvent.click(darkButton);

 await waitFor(() => {
 const { setTheme } = (globalThis as any).__themeMock;
 expect(setTheme).toHaveBeenCalledWith('dark');
 });
 });

 it('calls discoverServices when scan network button clicked', async () => {
 renderWithRouter(<SettingsPage />);

 const scanButton = await screen.findByRole('button', {
 name: /settings.scanNetwork/i,
 });
 fireEvent.click(scanButton);

 await waitFor(() => {
 const { discoverServices } = (globalThis as any).__resonanceMock;
 expect(discoverServices).toHaveBeenCalledTimes(1);
 });
 });

 it('calls checkAllServices on mount', async () => {
 renderWithRouter(<SettingsPage />);

 await waitFor(() => {
 const { checkAllServices } = (globalThis as any).__serviceMock;
 expect(checkAllServices).toHaveBeenCalled();
 });
 });
});
