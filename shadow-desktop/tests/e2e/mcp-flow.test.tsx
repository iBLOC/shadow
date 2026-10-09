import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '../mocks/telencephalonClient';
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

describe('MCP Flow E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <MemoryRouter initialEntries={['/mcp']}>
        <Routes>
          <Route path="/mcp" element={component} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders page title', async () => {
    renderWithRouter(<MCPPage />);

    await waitFor(() => {
      expect(screen.getByText('mcp.title')).toBeInTheDocument();
    });
  });

  it('renders page without crashing', async () => {
    renderWithRouter(<MCPPage />);
    await waitFor(() => {
      expect(screen.getByText('mcp.title')).toBeInTheDocument();
    });
  });

  it('shows MCP section', async () => {
    renderWithRouter(<MCPPage />);

    await waitFor(() => {
      expect(screen.getByText('mcp.title')).toBeInTheDocument();
    });
  });

  it('renders without errors', async () => {
    renderWithRouter(<MCPPage />);
    await waitFor(() => {
      expect(screen.getByText('mcp.title')).toBeInTheDocument();
    });
  });

  it('displays page content', async () => {
    renderWithRouter(<MCPPage />);
    await waitFor(() => {
      expect(screen.getByText('mcp.title')).toBeInTheDocument();
    });
  });

  it('renders MCP page', async () => {
    renderWithRouter(<MCPPage />);
    await waitFor(() => {
      expect(screen.getByText('mcp.title')).toBeInTheDocument();
    });
  });
});
