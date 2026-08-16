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
const mockSetMasterPassword = vi.fn();
const mockStartInternal = vi.fn();
const mockStopInternal = vi.fn();
const mockEncryptValue = vi.fn();
const mockDecryptValue = vi.fn();

const dbState: {
  dbType: 'internal' | 'distributed';
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  internalPort: number | null;
  masterPassword: string | null;
  error: string | null;
} = {
  dbType: 'internal',
  status: 'disconnected',
  internalPort: null,
  masterPassword: null,
  error: null,
};

vi.mock('../../src/stores/databaseStore', () => ({
  useDatabaseStore: () => ({
    dbType: dbState.dbType,
    status: dbState.status,
    internalPort: dbState.internalPort,
    masterPassword: dbState.masterPassword,
    error: dbState.error,
    setDbType: mockSetDbType,
    setMasterPassword: mockSetMasterPassword,
    startInternal: mockStartInternal,
    stopInternal: mockStopInternal,
    encryptValue: mockEncryptValue,
    decryptValue: mockDecryptValue,
  }),
}));

import { DatabaseSettings } from '../../src/components/DatabaseSettings';

function resetDbState(overrides: Partial<typeof dbState> = {}) {
  dbState.dbType = 'internal';
  dbState.status = 'disconnected';
  dbState.internalPort = null;
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
      render(<DatabaseSettings />);
      expect(screen.getByText('settings.databaseDesc')).toBeInTheDocument();
    });
  });

  describe('database type selector', () => {
    it('renders internal and distributed options', () => {
      render(<DatabaseSettings />);
      expect(screen.getByTestId('db-type-internal')).toBeInTheDocument();
      expect(screen.getByTestId('db-type-distributed')).toBeInTheDocument();
    });

    it('internal option is enabled', () => {
      render(<DatabaseSettings />);
      const internalBtn = screen.getByTestId('db-type-internal');
      expect(internalBtn).not.toBeDisabled();
    });

    it('distributed option is disabled', () => {
      render(<DatabaseSettings />);
      const distributedBtn = screen.getByTestId('db-type-distributed');
      expect(distributedBtn).toBeDisabled();
    });

    it('clicking internal calls setDbType', async () => {
      const user = userEvent.setup();
      render(<DatabaseSettings />);
      await user.click(screen.getByTestId('db-type-internal'));
      expect(mockSetDbType).toHaveBeenCalledWith('internal');
    });
  });

  describe('internal database config', () => {
    it('shows disconnected status by default', () => {
      render(<DatabaseSettings />);
      expect(screen.getByText('settings.dbDisconnected')).toBeInTheDocument();
    });

    it('shows connected status with port when connected', () => {
      resetDbState({ status: 'connected', internalPort: 5432 });
      render(<DatabaseSettings />);
      expect(screen.getByText(/settings.dbConnected/)).toBeInTheDocument();
      expect(screen.getByText(/5432/)).toBeInTheDocument();
    });

    it('shows start button when disconnected', () => {
      render(<DatabaseSettings />);
      expect(screen.getByTestId('db-internal-start')).toBeInTheDocument();
    });

    it('shows stop button when connected', () => {
      resetDbState({ status: 'connected' });
      render(<DatabaseSettings />);
      expect(screen.getByTestId('db-internal-stop')).toBeInTheDocument();
    });

    it('clicking start calls startInternal', async () => {
      const user = userEvent.setup();
      render(<DatabaseSettings />);
      await user.click(screen.getByTestId('db-internal-start'));
      expect(mockStartInternal).toHaveBeenCalled();
    });

    it('clicking stop calls stopInternal', async () => {
      resetDbState({ status: 'connected' });
      const user = userEvent.setup();
      render(<DatabaseSettings />);
      await user.click(screen.getByTestId('db-internal-stop'));
      expect(mockStopInternal).toHaveBeenCalled();
    });
  });

  describe('encryption section', () => {
    it('renders encryption header', () => {
      render(<DatabaseSettings />);
      expect(screen.getByText('settings.dbEncryption')).toBeInTheDocument();
    });

    it('shows master password form when not set', () => {
      render(<DatabaseSettings />);
      expect(screen.getByPlaceholderText('********')).toBeInTheDocument();
    });

    it('shows success icon when master password is set', () => {
      resetDbState({ masterPassword: 'test-password' });
      render(<DatabaseSettings />);
      expect(screen.getByText('settings.dbSetMasterPassword')).toBeInTheDocument();
    });

    it('shows hint text', () => {
      render(<DatabaseSettings />);
      expect(screen.getByText('settings.dbMasterPasswordHint')).toBeInTheDocument();
    });

    it('can toggle password visibility', async () => {
      const user = userEvent.setup();
      render(<DatabaseSettings />);
      const toggleBtn = screen.getByTestId('db-master-password-toggle');
      const input = screen.getByPlaceholderText('********');
      
      expect(input).toHaveAttribute('type', 'password');
      await user.click(toggleBtn);
      expect(input).toHaveAttribute('type', 'text');
    });

    it('set button is disabled for short passwords', async () => {
      const user = userEvent.setup();
      render(<DatabaseSettings />);
      const input = screen.getByPlaceholderText('********');
      const setBtn = screen.getByTestId('db-master-password-set');
      
      await user.type(input, 'short');
      expect(setBtn).toBeDisabled();
    });

    it('set button is enabled for valid passwords', async () => {
      const user = userEvent.setup();
      render(<DatabaseSettings />);
      const input = screen.getByPlaceholderText('********');
      const setBtn = screen.getByTestId('db-master-password-set');
      
      await user.type(input, 'longpassword');
      expect(setBtn).not.toBeDisabled();
    });

    it('clicking set calls setMasterPassword', async () => {
      const user = userEvent.setup();
      render(<DatabaseSettings />);
      const input = screen.getByPlaceholderText('********');
      const setBtn = screen.getByTestId('db-master-password-set');
      
      await user.type(input, 'longpassword');
      await user.click(setBtn);
      expect(mockSetMasterPassword).toHaveBeenCalledWith('longpassword');
    });
  });

  describe('status icon', () => {
    it('shows success icon when connected', () => {
      resetDbState({ status: 'connected' });
      const { container } = render(<DatabaseSettings />);
      expect(container.querySelector('.status-success')).toBeInTheDocument();
    });

    it('shows error icon when error', () => {
      resetDbState({ status: 'error' });
      const { container } = render(<DatabaseSettings />);
      expect(container.querySelector('.status-error')).toBeInTheDocument();
    });

    it('does not show icon when disconnected', () => {
      const { container } = render(<DatabaseSettings />);
      expect(container.querySelector('.status-success')).not.toBeInTheDocument();
      expect(container.querySelector('.status-error')).not.toBeInTheDocument();
    });
  });
});
