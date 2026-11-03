import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useDiscoveryStore } from '../../src/stores/discoveryStore';

vi.mock('../../src/stores/discoveryStore', () => ({
  useDiscoveryStore: vi.fn(),
}));

// Mock child components that rely on discoveryClient
vi.mock('../../src/components/ui/Modal', () => ({
  Modal: ({ isOpen, title, children }: { isOpen: boolean; title: string; children: React.ReactNode }) =>
    isOpen ? (
      <div data-testid="modal">
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));

vi.mock('../../src/components/ui/Button', () => ({
  Button: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled} className="btn">
      {children}
    </button>
  ),
}));

vi.mock('../../src/components/ui/EmptyState', () => ({
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </div>
  ),
}));

vi.mock('../../src/components/business/DeviceCard', () => ({
  DeviceCard: ({ device, isActive, onRemove }: { device: { id: string; name: string; host: string; port: number }; isActive: boolean; onRemove: (id: string) => void }) => (
    <div data-testid={`device-card-${device.id}`} className={isActive ? 'active-device' : ''}>
      <span>{device.name}</span>
      <span>{device.host}:{device.port}</span>
      <button data-testid="remove-btn" onClick={() => onRemove(device.id)}>Remove</button>
    </div>
  ),
}));

const mockStartScan = vi.fn();
const mockRefreshDevices = vi.fn();
const mockSetActiveNode = vi.fn();
const mockAddManualDevice = vi.fn();
const mockRemoveDevice = vi.fn();
const mockClearError = vi.fn();

function createMockDiscoveryStore(overrides: Record<string, unknown> = {}) {
  return {
    devices: [],
    activeNode: null,
    isScanning: false,
    lastScan: null,
    error: null,
    startScan: mockStartScan,
    stopScan: vi.fn(),
    refreshDevices: mockRefreshDevices,
    setActiveNode: mockSetActiveNode,
    addManualDevice: mockAddManualDevice,
    removeDevice: mockRemoveDevice,
    clearError: mockClearError,
    ...overrides,
  };
}

// Dynamically import after mocks are set up
async function renderPage() {
  const { DiscoveryPage } = await import('../../src/pages/DiscoveryPage');
  return render(
    <MemoryRouter>
      <DiscoveryPage />
    </MemoryRouter>
  );
}

describe('Discovery Lifecycle E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDiscoveryStore as unknown as Mock).mockReturnValue(
      createMockDiscoveryStore()
    );
  });

  describe('Empty state', () => {
    it('shows empty state when no devices exist', async () => {
      await renderPage();
      const elements = screen.getAllByText(/discovery\.noNodes/i);
      expect(elements.length).toBeGreaterThan(0);
    });

    it('shows start scan button in empty state', async () => {
      await renderPage();
      const scanBtns = screen.getAllByText(/discovery\.startScan/i);
      expect(scanBtns.length).toBeGreaterThan(0);
    });

    it('shows header with title and subtitle', async () => {
      await renderPage();
      expect(screen.getByText(/discovery\.title/i)).toBeInTheDocument();
      expect(screen.getByText(/discovery\.subtitle/i)).toBeInTheDocument();
    });

    it('shows manual add button', async () => {
      await renderPage();
      expect(screen.getByText(/discovery\.manualAdd/i)).toBeInTheDocument();
    });
  });

  describe('Scan', () => {
    it('calls startScan when scan button is clicked', async () => {
      await renderPage();
      const scanBtns = screen.getAllByText(/discovery\.startScan/i);
      fireEvent.click(scanBtns[0]);
      expect(mockStartScan).toHaveBeenCalled();
    });

    it('shows scanning state when isScanning is true', async () => {
      (useDiscoveryStore as unknown as Mock).mockReturnValue(
        createMockDiscoveryStore({ isScanning: true })
      );
      await renderPage();
      expect(screen.getByText(/discovery\.scanning/i)).toBeInTheDocument();
    });
  });

  describe('Device display', () => {
    it('shows device cards when devices exist', async () => {
      const devices = [
        {
          id: 'dev-1',
          name: 'Main Node',
          type: 'agent' as const,
          capabilities: ['llm' as const],
          host: '192.168.1.10',
          port: 8082,
          lastSeen: new Date().toISOString(),
        },
      ];
      (useDiscoveryStore as unknown as Mock).mockReturnValue(
        createMockDiscoveryStore({ devices })
      );
      await renderPage();
      expect(screen.getByText('Main Node')).toBeInTheDocument();
      expect(screen.getByText('192.168.1.10:8082')).toBeInTheDocument();
    });

    it('does not show empty state when devices exist', async () => {
      const devices = [
        {
          id: 'dev-2',
          name: 'Node 2',
          type: 'engine' as const,
          capabilities: ['llm' as const, 'tts' as const],
          host: '10.0.0.5',
          port: 8083,
          lastSeen: new Date().toISOString(),
        },
      ];
      (useDiscoveryStore as unknown as Mock).mockReturnValue(
        createMockDiscoveryStore({ devices })
      );
      await renderPage();
      expect(screen.queryByText(/discovery\.noNodes/i)).not.toBeInTheDocument();
    });

    it('shows device count in footer', async () => {
      const devices = [
        {
          id: 'dev-3',
          name: 'Node 3',
          type: 'agent' as const,
          capabilities: ['llm' as const],
          host: '10.0.0.6',
          port: 8082,
          lastSeen: new Date().toISOString(),
        },
      ];
      (useDiscoveryStore as unknown as Mock).mockReturnValue(
        createMockDiscoveryStore({ devices, lastScan: new Date() })
      );
      await renderPage();
      expect(screen.getByText(/discovery\.deviceCount/i)).toBeInTheDocument();
    });

    it('shows last scan time in footer', async () => {
      const devices = [
        {
          id: 'dev-ts',
          name: 'Timestamp Node',
          type: 'agent' as const,
          capabilities: ['llm' as const],
          host: '10.0.0.7',
          port: 8082,
          lastSeen: new Date().toISOString(),
        },
      ];
      (useDiscoveryStore as unknown as Mock).mockReturnValue(
        createMockDiscoveryStore({ devices, lastScan: new Date() })
      );
      await renderPage();
      expect(screen.getByText(/discovery\.lastScan/i)).toBeInTheDocument();
    });
  });

  describe('Remove device', () => {
    it('calls removeDevice when remove button is clicked', async () => {
      const devices = [
        {
          id: 'dev-4',
          name: 'Removable',
          type: 'agent' as const,
          capabilities: ['llm' as const],
          host: '10.0.0.8',
          port: 8082,
          lastSeen: new Date().toISOString(),
        },
      ];
      (useDiscoveryStore as unknown as Mock).mockReturnValue(
        createMockDiscoveryStore({ devices })
      );
      await renderPage();
      const removeBtns = screen.getAllByTestId('remove-btn');
      expect(removeBtns.length).toBe(1);
      fireEvent.click(removeBtns[0]);
      expect(mockRemoveDevice).toHaveBeenCalledWith('dev-4');
    });
  });

  describe('Set active node', () => {
    it('shows active device with styled indicator', async () => {
      const devices = [
        {
          id: 'dev-active',
          name: 'Active Node',
          type: 'agent' as const,
          capabilities: ['llm' as const],
          host: '10.0.0.9',
          port: 8082,
          lastSeen: new Date().toISOString(),
        },
      ];
      (useDiscoveryStore as unknown as Mock).mockReturnValue(
        createMockDiscoveryStore({ devices, activeNode: devices[0] })
      );
      await renderPage();
      const card = screen.getByTestId('device-card-dev-active');
      expect(card.className).toContain('active-device');
    });
  });

  describe('Error handling', () => {
    it('shows error banner when error is set', async () => {
      (useDiscoveryStore as unknown as Mock).mockReturnValue(
        createMockDiscoveryStore({ error: 'Connection refused' })
      );
      await renderPage();
      expect(screen.getByText('Connection refused')).toBeInTheDocument();
    });

    it('clears error on dismiss button click', async () => {
      (useDiscoveryStore as unknown as Mock).mockReturnValue(
        createMockDiscoveryStore({ error: 'Scan failed' })
      );
      await renderPage();
      const errorBanner = screen.getByText('Scan failed').closest('div');
      const dismissBtn = errorBanner?.querySelector('button');
      expect(dismissBtn).toBeTruthy();
      if (dismissBtn) {
        fireEvent.click(dismissBtn);
        expect(mockClearError).toHaveBeenCalled();
      }
    });
  });
});
