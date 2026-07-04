import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';
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

vi.mock('../../src/stores/cortexStore', () => {
 const refreshStatus = vi.fn();
 const refreshLobes = vi.fn();
 (globalThis as any).__cortexMock = { refreshStatus, refreshLobes };
 const state: Record<string, unknown> = {
 status: 'running',
 connection: { baseUrl: 'http://127.0.0.1:8443', apiKey: '' },
 cortexId: 'cortex-test',
 defaultAgent: 'temporal',
 lobes: [
 { name: 'temporal', kind: 'native', url: 'http://temporal:8443', enabled: true, skills: ['routing:prefrontal'], agent_card: { name: 'temporal', description: '', version: '0.1', url: '', metadata: { input_modalities: ['text'], output_modalities: ['text'], capabilities: [] } }, health_status: 'healthy' },
 { name: 'memory', kind: 'native', url: 'http://memory:8443', enabled: true, skills: ['memory:recall'], agent_card: { name: 'memory', description: '', version: '0.1', url: '', metadata: { input_modalities: ['text'], output_modalities: ['text'], capabilities: [] } }, health_status: 'healthy' },
 ],
 lastCheck: null,
 error: null,
 refreshStatus,
 refreshLobes,
 startCortex: vi.fn(),
 stopCortex: vi.fn(),
 setBaseUrl: vi.fn(),
 setApiKey: vi.fn(),
 };
 const hook: any = vi.fn((selector?: any) => (selector ? selector(state) : state));
 hook.getState = vi.fn(() => state);
 return { useCortexStore: hook };
});

vi.mock('../../src/stores/serviceStore', () => {
 const checkAllServicesMock = vi.fn().mockResolvedValue(undefined);
 (globalThis as any).__serviceMock = { checkAllServices: checkAllServicesMock };
 const mockState = {
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
 resonance: {
 name: 'resonance',
 displayName: 'Resonance',
 host: '',
 port: 8080,
 status: 'unknown' as const,
 },
 },
 resonanceInstances: [],
 isChecking: false,
 checkAllServices: checkAllServicesMock,
 hasConfiguredResonance: vi.fn(() => false),
 getPrimaryResonance: vi.fn(() => null),
 addResonanceInstance: vi.fn(),
 updateResonanceInstance: vi.fn(),
 removeResonanceInstance: vi.fn(),
 setPrimaryResonance: vi.fn(),
 };
 const hook: any = vi.fn((selector?: any) => selector ? selector(mockState) : mockState);
 hook.getState = vi.fn(() => mockState);
 return { useServiceStore: hook };
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
 resonanceInstances: [],
 connectionStatus: 'disconnected',
 discoverServices: discoverServicesMock,
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

  it('renders cortex status section with both lobes', async () => {
  renderWithRouter(<SettingsPage />);

  await waitFor(() => {
  expect(screen.getAllByText('temporal').length).toBeGreaterThan(0);
  expect(screen.getAllByText('memory').length).toBeGreaterThan(0);
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
  const comboboxes = screen.getAllByRole('combobox');
  const langSelect = comboboxes.find(
  (el) => el.textContent?.includes('en-US')
  );
  expect(langSelect).toBeInTheDocument();
  });
  });

  it('calls i18n.changeLanguage when language select changed', async () => {
  renderWithRouter(<SettingsPage />);

  const comboboxes = await screen.findAllByRole('combobox');
  const langSelect = comboboxes.find(
  (el) => el.textContent?.includes('en-US')
  ) as HTMLElement;
  fireEvent.click(langSelect);
  const zhOption = await screen.findByRole('option', { name: /zh-CN/i });
  fireEvent.click(zhOption);

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

  it('calls discoverServices when discover button clicked', async () => {
  renderWithRouter(<SettingsPage />);

  const discoverButton = await screen.findByRole('button', {
  name: /settings.discoverServices/i,
  });
  expect(discoverButton).toBeDisabled();
  });

  it('calls cortex refresh on mount', async () => {
  renderWithRouter(<SettingsPage />);

  await waitFor(() => {
  const { refreshStatus, refreshLobes } = (globalThis as any).__cortexMock;
  expect(refreshStatus).toHaveBeenCalled();
  expect(refreshLobes).toHaveBeenCalled();
  });
  });
});
