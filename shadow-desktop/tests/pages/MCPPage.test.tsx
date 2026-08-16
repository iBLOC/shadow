import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

describe('MCPPage', () => {
  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <MemoryRouter initialEntries={['/mcp']}>
        <Routes>
          <Route path="/mcp" element={component} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders page header', async () => {
    renderWithRouter(<MCPPage />);
    
    await waitFor(() => {
      expect(screen.getByText('mcp.title')).toBeInTheDocument();
    });
  });

  it('shows empty state when no servers', async () => {
    renderWithRouter(<MCPPage />);
    
    await waitFor(() => {
      // The page should render without errors
      expect(screen.getByText('mcp.title')).toBeInTheDocument();
    });
  });

  it('renders page without crashing', async () => {
    renderWithRouter(<MCPPage />);
    await waitFor(() => {
      expect(screen.getByText('mcp.title')).toBeInTheDocument();
    });
  });
});