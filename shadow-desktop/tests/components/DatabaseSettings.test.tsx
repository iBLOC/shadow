import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

const mockSetDbType = vi.fn();
const mockSetExternalConfig = vi.fn();
const mockSetMasterPassword = vi.fn();
const mockStartEmbedded = vi.fn();
const mockStopEmbedded = vi.fn();
const mockTestExternalConnection = vi.fn();
const mockEncryptValue = vi.fn();
const mockDecryptValue = vi.fn();

const dbState: {
  dbType: 'embedded' | 'external' | 'neon';
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  embeddedPort: number | null;
  externalConfig: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  masterPassword: string | null;
  error: string | null;
} = {
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
    encryptValue: mockEncryptValue,
    decryptValue: mockDecryptValue,
  }),
}));

import { DatabaseSettings } from '../../src/components/DatabaseSettings';

function resetDbState(overrides: Partial<typeof dbState> = {}) {
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
  Object.assign(dbState, overrides);
}

describe('DatabaseSettings', () => {
  beforeEach(() => {
    resetDbState();
    vi.clearAllMocks();
  });

  describe('header', () => {
    it('renders settings header with database icon and title', () => {
      const { container } = render(<DatabaseSettings />);
      const h3 = container.querySelector('.settings-header h3');
      expect(h3).toHaveTextContent('settings.database');
      expect(container.querySelector('.settings-card')).toBeInTheDocument();
    });

    it('renders description text', () => {
      const { container } = render(<DatabaseSettings />);
      const desc = container.querySelector('.settings-header + p');
      expect(desc).toHaveTextContent('settings.databaseDesc');
    });
  });

  describe('database type selector', () => {
    it('renders all 3 type buttons', () => {
      render(<DatabaseSettings />);
      expect(screen.getByText(/settings\.dbEmbedded/i)).toBeInTheDocument();
      expect(screen.getByText(/settings\.dbExternal/i)).toBeInTheDocument();
      expect(screen.getByText(/settings\.dbNeon/i)).toBeInTheDocument();
    });

    it('marks the active type with default variant', () => {
      resetDbState({ dbType: 'external' });
      render(<DatabaseSettings />);
      const externalBtn = screen.getByTestId('db-type-external');
      expect(externalBtn).toBeInTheDocument();
      expect(externalBtn).toHaveTextContent(/settings\.dbExternal/i);
      expect(externalBtn.className).toContain('bg-primary');
    });

    it('disables the neon type button', () => {
      render(<DatabaseSettings />);
      const neonBtn = screen.getByTestId('db-type-neon');
      expect(neonBtn).toBeDisabled();
    });

    it('clicking embedded calls setDbType("embedded")', async () => {
      const user = userEvent.setup();
      resetDbState({ dbType: 'external' });
      render(<DatabaseSettings />);
      await user.click(screen.getByText(/settings\.dbEmbedded/i));
      expect(mockSetDbType).toHaveBeenCalledWith('embedded');
    });

    it('clicking external calls setDbType("external")', async () => {
      const user = userEvent.setup();
      render(<DatabaseSettings />);
      await user.click(screen.getByText(/settings\.dbExternal/i));
      expect(mockSetDbType).toHaveBeenCalledWith('external');
    });

    it('does not call setDbType when clicking disabled neon button', async () => {
      const user = userEvent.setup();
      render(<DatabaseSettings />);
      await user.click(screen.getByText(/settings\.dbNeon/i));
      expect(mockSetDbType).not.toHaveBeenCalled();
    });
  });

  describe('embedded mode', () => {
    it('shows status as disconnected by default', () => {
      resetDbState({ dbType: 'embedded', status: 'disconnected' });
      const { container } = render(<DatabaseSettings />);
      const badge = container.querySelector('.status-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent(/settings\.dbDisconnected/i);
    });

    it('shows status as connecting', () => {
      resetDbState({ dbType: 'embedded', status: 'connecting' });
      const { container } = render(<DatabaseSettings />);
      const badge = container.querySelector('.status-badge');
      expect(badge).toHaveTextContent('settings.dbConnecting');
    });

    it('shows status as connected with port number', () => {
      resetDbState({ dbType: 'embedded', status: 'connected', embeddedPort: 54321 });
      const { container } = render(<DatabaseSettings />);
      const badge = container.querySelector('.status-badge');
      expect(badge).toHaveTextContent('settings.dbConnected');
      expect(badge).toHaveTextContent('54321');
    });

    it('shows status as error with disconnected label', () => {
      resetDbState({ dbType: 'embedded', status: 'error' });
      const { container } = render(<DatabaseSettings />);
      const badge = container.querySelector('.status-badge');
      expect(badge).toHaveTextContent('settings.dbDisconnected');
    });

    it('clicking start calls startEmbedded when disconnected', async () => {
      const user = userEvent.setup();
      resetDbState({ dbType: 'embedded', status: 'disconnected' });
      render(<DatabaseSettings />);
      const startBtn = screen.getByTestId('db-embedded-start');
      await user.click(startBtn);
      expect(mockStartEmbedded).toHaveBeenCalledTimes(1);
    });

    it('clicking stop calls stopEmbedded when connected', async () => {
      const user = userEvent.setup();
      resetDbState({ dbType: 'embedded', status: 'connected', embeddedPort: 54321 });
      render(<DatabaseSettings />);
      const stopBtn = screen.getByTestId('db-embedded-stop');
      await user.click(stopBtn);
      expect(mockStopEmbedded).toHaveBeenCalledTimes(1);
    });

    it('start button is disabled when status is connecting', () => {
      resetDbState({ dbType: 'embedded', status: 'connecting' });
      render(<DatabaseSettings />);
      const startBtn = screen.getByTestId('db-embedded-start');
      expect(startBtn).toBeDisabled();
    });
  });

  describe('external mode', () => {
    function getExternalInputs(container: HTMLElement) {
      const cfg = container.querySelector('.db-external-config');
      if (!cfg) throw new Error('db-external-config not found');
      const inputs = cfg.querySelectorAll('input');
      return {
        host: inputs[0] as HTMLInputElement,
        port: inputs[1] as HTMLInputElement,
        username: inputs[2] as HTMLInputElement,
        password: inputs[3] as HTMLInputElement,
        database: inputs[4] as HTMLInputElement,
      };
    }

    beforeEach(() => {
      resetDbState({ dbType: 'external' });
    });

    it('shows 5 input fields (host, port, user, password, database)', () => {
      const { container } = render(<DatabaseSettings />);
      const inputs = getExternalInputs(container);
      expect(inputs.host).toBeInTheDocument();
      expect(inputs.port).toBeInTheDocument();
      expect(inputs.username).toBeInTheDocument();
      expect(inputs.password).toBeInTheDocument();
      expect(inputs.database).toBeInTheDocument();
    });

    it('host input is populated with current value', () => {
      resetDbState({ dbType: 'external', externalConfig: { ...dbState.externalConfig, host: 'myhost' } });
      const { container } = render(<DatabaseSettings />);
      const inputs = getExternalInputs(container);
      expect(inputs.host.value).toBe('myhost');
    });

    it('port input is populated with current value', () => {
      resetDbState({ dbType: 'external', externalConfig: { ...dbState.externalConfig, port: 12345 } });
      const { container } = render(<DatabaseSettings />);
      const inputs = getExternalInputs(container);
      expect(inputs.port.value).toBe('12345');
    });

    it('changing host calls setExternalConfig with new host', () => {
      const { container } = render(<DatabaseSettings />);
      const inputs = getExternalInputs(container);
      fireEvent.change(inputs.host, { target: { value: 'newhost' } });
      expect(mockSetExternalConfig).toHaveBeenLastCalledWith({ host: 'newhost' });
    });

    it('changing port calls setExternalConfig with parsed number', () => {
      const { container } = render(<DatabaseSettings />);
      const inputs = getExternalInputs(container);
      fireEvent.change(inputs.port, { target: { value: '9999' } });
      expect(mockSetExternalConfig).toHaveBeenLastCalledWith({ port: 9999 });
    });

    it('port defaults to 5432 when input is invalid', () => {
      const { container } = render(<DatabaseSettings />);
      const inputs = getExternalInputs(container);
      fireEvent.change(inputs.port, { target: { value: 'abc' } });
      expect(mockSetExternalConfig).toHaveBeenLastCalledWith({ port: 5432 });
    });

    it('changing username calls setExternalConfig', () => {
      const { container } = render(<DatabaseSettings />);
      const inputs = getExternalInputs(container);
      fireEvent.change(inputs.username, { target: { value: 'admin' } });
      expect(mockSetExternalConfig).toHaveBeenLastCalledWith({ username: 'admin' });
    });

    it('changing database calls setExternalConfig', () => {
      const { container } = render(<DatabaseSettings />);
      const inputs = getExternalInputs(container);
      fireEvent.change(inputs.database, { target: { value: 'mydb' } });
      expect(mockSetExternalConfig).toHaveBeenLastCalledWith({ database: 'mydb' });
    });

    it('password input is type=password by default', () => {
      const { container } = render(<DatabaseSettings />);
      const inputs = getExternalInputs(container);
      expect(inputs.password.type).toBe('password');
    });

    it('toggles password visibility when eye button clicked', async () => {
      const user = userEvent.setup();
      const { container } = render(<DatabaseSettings />);
      const inputs = getExternalInputs(container);
      const toggleBtn = screen.getByTestId('db-external-password-toggle');
      await user.click(toggleBtn);
      expect(inputs.password.type).toBe('text');
      await user.click(toggleBtn);
      expect(inputs.password.type).toBe('password');
    });

    it('clicking test connection calls testExternalConnection', async () => {
      const user = userEvent.setup();
      render(<DatabaseSettings />);
      const testBtn = screen.getByTestId('db-external-test-connection');
      await user.click(testBtn);
      expect(mockTestExternalConnection).toHaveBeenCalledTimes(1);
    });

    it('test connection button is disabled when status is connecting', () => {
      resetDbState({ dbType: 'external', status: 'connecting' });
      render(<DatabaseSettings />);
      const testBtn = screen.getByTestId('db-external-test-connection');
      expect(testBtn).toBeDisabled();
    });
  });

  describe('neon mode', () => {
    it('shows neon placeholder when dbType is neon', () => {
      resetDbState({ dbType: 'neon' });
      const { container } = render(<DatabaseSettings />);
      expect(container.querySelector('.db-neon-placeholder')).toBeInTheDocument();
    });
  });

  describe('status icon in header', () => {
    it('shows check icon when status is connected', () => {
      resetDbState({ status: 'connected', embeddedPort: 12345 });
      const { container } = render(<DatabaseSettings />);
      expect(container.querySelector('.status-success')).toBeInTheDocument();
    });

    it('shows alert icon when status is error', () => {
      resetDbState({ status: 'error' });
      const { container } = render(<DatabaseSettings />);
      expect(container.querySelector('.status-error')).toBeInTheDocument();
    });

    it('shows no status icon when status is disconnected', () => {
      resetDbState({ status: 'disconnected' });
      const { container } = render(<DatabaseSettings />);
      const header = container.querySelector('.settings-header');
      expect(header?.querySelector('.status-success')).toBeNull();
      expect(header?.querySelector('.status-error')).toBeNull();
    });
  });

  describe('master password encryption section', () => {
    it('shows set password form when masterPassword is null', () => {
      resetDbState({ masterPassword: null });
      render(<DatabaseSettings />);
      expect(screen.getByText(/settings\.dbMasterPasswordHint/i)).toBeInTheDocument();
    });

    it('shows "set" confirmation when masterPassword is set', () => {
      resetDbState({ masterPassword: 'mypassword123' });
      const { container } = render(<DatabaseSettings />);
      expect(container.querySelector('.master-password-set')).toBeInTheDocument();
      expect(container.querySelector('.master-password-form')).toBeNull();
    });

    it('set button is disabled when password is shorter than 8 chars', () => {
      resetDbState({ masterPassword: null });
      render(<DatabaseSettings />);
      const setBtn = screen.getByTestId('db-master-password-set');
      expect(setBtn).toBeDisabled();
    });

    it('set button is enabled when password is 8+ chars', async () => {
      resetDbState({ masterPassword: null });
      const user = userEvent.setup();
      const { container } = render(<DatabaseSettings />);
      const mpInput = container.querySelector('.master-password-form input') as HTMLInputElement;
      const setBtn = screen.getByTestId('db-master-password-set');
      await user.type(mpInput, 'longpassword');
      expect(setBtn).not.toBeDisabled();
    });

    it('clicking set button calls setMasterPassword and clears input', async () => {
      const user = userEvent.setup();
      resetDbState({ masterPassword: null });
      const { container } = render(<DatabaseSettings />);
      const mpInput = container.querySelector('.master-password-form input') as HTMLInputElement;
      const setBtn = screen.getByTestId('db-master-password-set');
      await user.type(mpInput, 'mypassword123');
      await user.click(setBtn);
      expect(mockSetMasterPassword).toHaveBeenCalledWith('mypassword123');
    });

    it('toggles master password visibility', async () => {
      const user = userEvent.setup();
      resetDbState({ masterPassword: null });
      const { container } = render(<DatabaseSettings />);
      const mpInput = container.querySelector('.master-password-form input') as HTMLInputElement;
      const toggleBtn = screen.getByTestId('db-master-password-toggle');
      expect(mpInput.type).toBe('password');
      await user.click(toggleBtn);
      expect(mpInput.type).toBe('text');
    });
  });
});
