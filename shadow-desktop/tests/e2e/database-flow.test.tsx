import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SettingsPage } from '../../src/pages/SettingsPage';

const mockSetDbType = vi.fn();
const mockSetExternalConfig = vi.fn();
const mockSetMasterPassword = vi.fn();
const mockStartEmbedded = vi.fn();
const mockStopEmbedded = vi.fn();
const mockTestExternalConnection = vi.fn();

const dbState: any = {
  dbType: 'embedded',
  status: 'disconnected',
  embeddedPort: null,
  externalConfig: {
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: '',
    database: 'shadow',
  },
  masterPassword: null,
  error: null,
};

vi.mock('../../src/stores/databaseStore', () => ({
  useDatabaseStore: () => ({
    dbType: dbState.dbType,
    status: dbState.status,
    embeddedPort: dbState.embeddedPort,
    externalConfig: dbState.externalConfig,
    masterPassword: dbState.masterPassword,
    error: dbState.error,
    setDbType: mockSetDbType,
    setExternalConfig: mockSetExternalConfig,
    setMasterPassword: mockSetMasterPassword,
    startEmbedded: mockStartEmbedded,
    stopEmbedded: mockStopEmbedded,
    testExternalConnection: mockTestExternalConnection,
    encryptValue: vi.fn(),
    decryptValue: vi.fn(),
  }),
}));

vi.mock('../../src/stores/themeStore', () => {
  const setThemeMock = vi.fn();
  const state = { theme: 'dark', setTheme: setThemeMock };
  (globalThis as any).__themeMock = state;
  return { useThemeStore: vi.fn(() => state) };
});

vi.mock('../../src/stores/serviceStore', () => {
  const mockState = {
    services: {
      prefrontal: { name: 'prefrontal', displayName: 'Prefrontal', host: 'localhost', port: 8082, status: 'healthy' },
      hippocampus: { name: 'hippocampus', displayName: 'Hippocampus', host: 'localhost', port: 8081, status: 'healthy' },
      resonance: { name: 'resonance', displayName: 'Resonance', host: '', port: 8080, status: 'unknown' },
    },
    resonanceInstances: [],
    isChecking: false,
    checkAllServices: vi.fn(),
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

vi.mock('../../src/stores/resonanceStore', () => ({
  useResonanceStore: vi.fn(() => ({
    discoveredServices: [],
    resonanceInstances: [],
    connectionStatus: 'disconnected',
    discoverServices: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => {
      if (key === 'common.migrate.messageCount' && opts?.count !== undefined) {
        return `${key}(${opts.count})`;
      }
      return key;
    },
    i18n: { language: 'en-US', changeLanguage: vi.fn() },
  }),
}));

function resetDbState() {
  dbState.dbType = 'embedded';
  dbState.status = 'disconnected';
  dbState.embeddedPort = null;
  dbState.externalConfig = {
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: '',
    database: 'shadow',
  };
  dbState.masterPassword = null;
  dbState.error = null;
}

describe('Database Flow E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbState();
  });

  const renderWithRouter = () =>
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>,
    );

  describe('Database type selection', () => {
    it('shows database settings section in settings page', async () => {
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText('settings.database')).toBeInTheDocument();
      });
    });

    it('starts with embedded mode as default', async () => {
      renderWithRouter();
      await waitFor(() => {
        const embeddedBtn = screen.getByTestId('db-type-embedded');
        expect(embeddedBtn.className).toContain('bg-primary');
      });
    });

    it('switches to external mode when external button clicked', async () => {
      renderWithRouter();
      await screen.findByText('settings.database');
      const externalBtn = screen.getByTestId('db-type-external');
      fireEvent.click(externalBtn);
      expect(mockSetDbType).toHaveBeenCalledWith('external');
    });

    it('does not switch to neon mode (disabled button)', async () => {
      renderWithRouter();
      await screen.findByText('settings.database');
      const neonBtn = screen.getByTestId('db-type-neon');
      expect(neonBtn).toBeDisabled();
      fireEvent.click(neonBtn);
      expect(mockSetDbType).not.toHaveBeenCalled();
    });
  });

  describe('Embedded database lifecycle', () => {
    it('shows disconnected state initially', async () => {
      dbState.dbType = 'embedded';
      dbState.status = 'disconnected';
      renderWithRouter();
      await screen.findByText('settings.database');
      expect(screen.getByText('settings.dbStart')).toBeInTheDocument();
    });

    it('clicking start calls startEmbedded action', async () => {
      dbState.dbType = 'embedded';
      dbState.status = 'disconnected';
      renderWithRouter();
      await screen.findByText('settings.database');
      const startBtn = screen.getByText('settings.dbStart');
      fireEvent.click(startBtn);
      expect(mockStartEmbedded).toHaveBeenCalledTimes(1);
    });

    it('shows connecting state with disabled button', async () => {
      dbState.dbType = 'embedded';
      dbState.status = 'connecting';
      renderWithRouter();
      await screen.findByText('settings.database');
      const startBtn = screen.getByTestId('db-embedded-start');
      expect(startBtn).toBeDisabled();
    });

    it('shows connected state with port number and stop button', async () => {
      dbState.dbType = 'embedded';
      dbState.status = 'connected';
      dbState.embeddedPort = 51234;
      renderWithRouter();
      await screen.findByText('settings.database');
      const badge = document.querySelector('.status-badge');
      expect(badge?.textContent).toContain('51234');
      expect(screen.getByText('settings.dbStop')).toBeInTheDocument();
    });

    it('clicking stop calls stopEmbedded action', async () => {
      dbState.dbType = 'embedded';
      dbState.status = 'connected';
      dbState.embeddedPort = 51234;
      renderWithRouter();
      await screen.findByText('settings.database');
      const stopBtn = screen.getByText('settings.dbStop');
      fireEvent.click(stopBtn);
      expect(mockStopEmbedded).toHaveBeenCalledTimes(1);
    });

    it('shows error state', async () => {
      dbState.dbType = 'embedded';
      dbState.status = 'error';
      renderWithRouter();
      await screen.findByText('settings.database');
      const dbCard = document.querySelector('.settings-card:has(.db-type-selector)');
      expect(dbCard?.querySelector('.status-error')).toBeInTheDocument();
    });
  });

  describe('External database configuration', () => {
    beforeEach(() => {
      dbState.dbType = 'external';
    });

    it('shows all 5 input fields', async () => {
      renderWithRouter();
      await screen.findByText('settings.database');
      const cfg = document.querySelector('.db-external-config');
      expect(cfg).toBeInTheDocument();
      const inputs = cfg!.querySelectorAll('input');
      expect(inputs).toHaveLength(5);
    });

    it('populates host input with current value', async () => {
      dbState.externalConfig.host = 'db.example.com';
      renderWithRouter();
      await screen.findByText('settings.database');
      const hostInput = document.querySelector('.db-external-config input') as HTMLInputElement;
      expect(hostInput.value).toBe('db.example.com');
    });

    it('changing host updates external config', async () => {
      renderWithRouter();
      await screen.findByText('settings.database');
      const hostInput = document.querySelector('.db-external-config input') as HTMLInputElement;
      fireEvent.change(hostInput, { target: { value: 'newhost.local' } });
      expect(mockSetExternalConfig).toHaveBeenLastCalledWith({ host: 'newhost.local' });
    });

    it('changing port calls with parsed number', async () => {
      renderWithRouter();
      await screen.findByText('settings.database');
      const inputs = document.querySelectorAll('.db-external-config input');
      const portInput = inputs[1] as HTMLInputElement;
      fireEvent.change(portInput, { target: { value: '3306' } });
      expect(mockSetExternalConfig).toHaveBeenLastCalledWith({ port: 3306 });
    });

    it('invalid port defaults to 5432', async () => {
      renderWithRouter();
      await screen.findByText('settings.database');
      const inputs = document.querySelectorAll('.db-external-config input');
      const portInput = inputs[1] as HTMLInputElement;
      fireEvent.change(portInput, { target: { value: 'invalid' } });
      expect(mockSetExternalConfig).toHaveBeenLastCalledWith({ port: 5432 });
    });

    it('changing username updates config', async () => {
      renderWithRouter();
      await screen.findByText('settings.database');
      const inputs = document.querySelectorAll('.db-external-config input');
      const usernameInput = inputs[2] as HTMLInputElement;
      fireEvent.change(usernameInput, { target: { value: 'admin' } });
      expect(mockSetExternalConfig).toHaveBeenLastCalledWith({ username: 'admin' });
    });

    it('password input is masked by default', async () => {
      renderWithRouter();
      await screen.findByText('settings.database');
      const inputs = document.querySelectorAll('.db-external-config input');
      const passwordInput = inputs[3] as HTMLInputElement;
      expect(passwordInput.type).toBe('password');
    });

    it('clicking eye icon reveals password', async () => {
      renderWithRouter();
      await screen.findByText('settings.database');
      const eyeBtn = screen.getByTestId('db-external-password-toggle');
      const passwordInput = document.querySelectorAll('.db-external-config input')[3] as HTMLInputElement;
      fireEvent.click(eyeBtn);
      expect(passwordInput.type).toBe('text');
    });

    it('clicking test connection calls testExternalConnection', async () => {
      renderWithRouter();
      await screen.findByText('settings.database');
      const testBtn = screen.getByText('settings.dbTestConnection');
      fireEvent.click(testBtn);
      expect(mockTestExternalConnection).toHaveBeenCalledTimes(1);
    });

    it('test connection button is disabled when connecting', async () => {
      dbState.status = 'connecting';
      renderWithRouter();
      await screen.findByText('settings.database');
      const testBtn = screen.getByText('settings.dbConnecting').closest('button') as HTMLButtonElement;
      expect(testBtn).toBeDisabled();
    });
  });

  describe('Master password encryption', () => {
    it('shows set form when no master password', async () => {
      renderWithRouter();
      await screen.findByText('settings.database');
      expect(screen.getByText('settings.dbMasterPasswordHint')).toBeInTheDocument();
    });

    it('shows confirmation when master password is set', async () => {
      dbState.masterPassword = 'mysecret123';
      renderWithRouter();
      await screen.findByText('settings.database');
      expect(document.querySelector('.master-password-set')).toBeInTheDocument();
      expect(document.querySelector('.master-password-form')).toBeNull();
    });

    it('set button is disabled for password < 8 chars', async () => {
      renderWithRouter();
      await screen.findByText('settings.database');
      const mpInput = document.querySelector('.master-password-form input') as HTMLInputElement;
      fireEvent.change(mpInput, { target: { value: 'short' } });
      const setBtn = screen.getByTestId('db-master-password-set');
      expect(setBtn).toBeDisabled();
    });

    it('set button is enabled for password >= 8 chars', async () => {
      renderWithRouter();
      await screen.findByText('settings.database');
      const mpInput = document.querySelector('.master-password-form input') as HTMLInputElement;
      fireEvent.change(mpInput, { target: { value: 'longpassword' } });
      const setBtn = screen.getByTestId('db-master-password-set');
      expect(setBtn).not.toBeDisabled();
    });

    it('clicking set calls setMasterPassword', async () => {
      renderWithRouter();
      await screen.findByText('settings.database');
      const mpInput = document.querySelector('.master-password-form input') as HTMLInputElement;
      const setBtn = screen.getByTestId('db-master-password-set');
      fireEvent.change(mpInput, { target: { value: 'mysecret123' } });
      fireEvent.click(setBtn);
      expect(mockSetMasterPassword).toHaveBeenCalledWith('mysecret123');
    });
  });
});
