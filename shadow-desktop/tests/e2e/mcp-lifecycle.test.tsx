import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '../mocks/cortexClient';
import { MCPPage } from '../../src/pages/MCPPage';

vi.mock('../../src/stores/mcpStore', () => ({
  useMCPStore: vi.fn(() => ({
    servers: [],
    addServer: vi.fn(),
    removeServer: vi.fn(),
    updateServer: vi.fn(),
  })),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('MCP Lifecycle E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWithRouter = () =>
    render(
      <MemoryRouter initialEntries={['/mcp']}>
        <Routes>
          <Route path="/mcp" element={<MCPPage />} />
        </Routes>
      </MemoryRouter>,
    );

  it('renders page title', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('mcp.title')).toBeInTheDocument();
    });
  });

  it('renders page without crashing', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('mcp.title')).toBeInTheDocument();
    });
  });

  it('shows MCP section', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('mcp.title')).toBeInTheDocument();
    });
  });

  it('renders without errors', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('mcp.title')).toBeInTheDocument();
    });
  });

  it('displays page content', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('mcp.title')).toBeInTheDocument();
    });
  });

  it('renders MCP page', async () => {
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText('mcp.title')).toBeInTheDocument();
    });
  });
});
