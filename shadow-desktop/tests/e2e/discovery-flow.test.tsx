import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DiscoveryPage } from '../../src/pages/DiscoveryPage';

const mockStartScan = vi.fn().mockResolvedValue(undefined);
const mockRefreshDevices = vi.fn().mockResolvedValue(undefined);
const mockSetActiveNode = vi.fn();
const mockAddManualDevice = vi.fn();
const mockRemoveDevice = vi.fn();
const mockClearError = vi.fn();

vi.mock('../../src/stores/discoveryStore', () => ({
 useDiscoveryStore: vi.fn(() => ({
 devices: [],
 activeNode: null,
 isScanning: false,
 lastScan: null,
 error: null,
 startScan: mockStartScan,
 refreshDevices: mockRefreshDevices,
 setActiveNode: mockSetActiveNode,
 addManualDevice: mockAddManualDevice,
 removeDevice: mockRemoveDevice,
 clearError: mockClearError,
 })),
}));

vi.mock('../../src/components/DelegateToPeerDialog', () => ({
 DelegateToPeerDialog: ({ open }: { open: boolean }) =>
 open ? <div data-testid="delegate-dialog">delegate-dialog</div> : null,
}));

vi.mock('../../src/components/business/DeviceCard', () => ({
 DeviceCard: ({ device }: { device: { name: string } }) => (
 <div data-testid="device-card">{device.name}</div>
 ),
}));

vi.mock('react-i18next', () => ({
 useTranslation: () => ({
 t: (key: string) => key,
 }),
}));

describe('Discovery Flow E2E', () => {
 beforeEach(() => {
 vi.clearAllMocks();
 mockStartScan.mockClear();
 mockStartScan.mockResolvedValue(undefined);
 mockRefreshDevices.mockClear();
 mockRefreshDevices.mockResolvedValue(undefined);
 mockSetActiveNode.mockClear();
 mockAddManualDevice.mockClear();
 });

 const renderWithRouter = (component: React.ReactElement) => {
 return render(
 <MemoryRouter initialEntries={['/discovery']}>
 <Routes>
 <Route path="/discovery" element={component} />
 </Routes>
 </MemoryRouter>
 );
 };

 it('renders page header and start scan button', async () => {
 renderWithRouter(<DiscoveryPage />);

 await waitFor(() => {
 expect(screen.getByText('discovery.title')).toBeInTheDocument();
 expect(
 screen.getAllByRole('button', { name: /discovery.startScan/i }).length
 ).toBeGreaterThan(0);
 });
 });

 it('shows empty state when no devices discovered', async () => {
 renderWithRouter(<DiscoveryPage />);

 await waitFor(() => {
 expect(screen.getByText('discovery.noNodes')).toBeInTheDocument();
 });
 });

 it('calls refreshDevices on mount', async () => {
 renderWithRouter(<DiscoveryPage />);

 await waitFor(() => {
 expect(mockRefreshDevices).toHaveBeenCalled();
 });
 });

 it('calls startScan and refreshDevices when start scan clicked', async () => {
 renderWithRouter(<DiscoveryPage />);

 const scanButtons = await screen.findAllByRole('button', {
 name: /discovery.startScan/i,
 });
 fireEvent.click(scanButtons[0]);

 await waitFor(() => {
 expect(mockStartScan).toHaveBeenCalledTimes(1);
 expect(mockRefreshDevices).toHaveBeenCalled();
 });
 });

 it('opens manual add dialog when manual add button clicked', async () => {
 renderWithRouter(<DiscoveryPage />);

 const addButton = await screen.findByRole('button', {
 name: /discovery.manualAdd/i,
 });
 fireEvent.click(addButton);

 await waitFor(() => {
 expect(screen.getByText('discovery.host')).toBeInTheDocument();
 expect(screen.getByText('discovery.port')).toBeInTheDocument();
 expect(screen.getByText('discovery.name')).toBeInTheDocument();
 });
 });

 it('calls addManualDevice when manual add form submitted with host', async () => {
 renderWithRouter(<DiscoveryPage />);

 const addButton = await screen.findByRole('button', {
 name: /discovery.manualAdd/i,
 });
 fireEvent.click(addButton);

 await waitFor(() => {
 expect(screen.getByText('discovery.host')).toBeInTheDocument();
 });

 const hostInput = screen.getByPlaceholderText(
 '192.168.1.100'
 ) as HTMLInputElement;
 fireEvent.change(hostInput, {
 target: { value: '192.168.1.100' },
 });

 const saveButton = screen.getByRole('button', { name: /common.save/i });
 fireEvent.click(saveButton);

 await waitFor(() => {
 expect(mockAddManualDevice).toHaveBeenCalledTimes(1);
 const passed = mockAddManualDevice.mock.calls[0][0];
 expect(passed.host).toBe('192.168.1.100');
 expect(passed.port).toBe(8082);
 expect(passed.type).toBe('agent');
 });
 });

 it('does not call addManualDevice when host is empty', async () => {
 renderWithRouter(<DiscoveryPage />);

 const addButton = await screen.findByRole('button', {
 name: /discovery.manualAdd/i,
 });
 fireEvent.click(addButton);

 await waitFor(() => {
 expect(screen.getByText('discovery.host')).toBeInTheDocument();
 });

 const saveButton = screen.getByRole('button', { name: /common.save/i });
 fireEvent.click(saveButton);

 expect(mockAddManualDevice).not.toHaveBeenCalled();
 });
});
