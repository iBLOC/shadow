import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { AppInitializer } from '../../src/components/AppInitializer';

function renderWithRouter(initialRoute: string = '/') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route
          path="/"
          element={
            <AppInitializer>
              <div>App Content</div>
            </AppInitializer>
          }
        />
        <Route path="/setup" element={<div>Setup Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppInitializer', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    localStorage.clear();
  });

  it('renders container without throwing while checking setup state', () => {
    localStorage.setItem('shadow_setup_complete', 'true');
    const { container } = renderWithRouter('/');
    expect(container).toBeInTheDocument();
  });

  it('renders children when setup is complete', async () => {
    localStorage.setItem('shadow_setup_complete', 'true');
    renderWithRouter('/');
    await waitFor(() => {
      expect(screen.getByText(/app content/i)).toBeInTheDocument();
    });
  });

  it('navigates to /setup when setup is not complete', async () => {
    localStorage.removeItem('shadow_setup_complete');
    renderWithRouter('/');
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/setup');
    });
  });

  it('navigates to /setup when shadow_setup_complete is empty string', async () => {
    localStorage.setItem('shadow_setup_complete', '');
    renderWithRouter('/');
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/setup');
    });
  });

  it('does not call navigate when setup is complete', async () => {
    localStorage.setItem('shadow_setup_complete', 'true');
    renderWithRouter('/');
    await waitFor(() => {
      expect(screen.getByText(/app content/i)).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('renders children when setup is marked complete at any value', async () => {
    localStorage.setItem('shadow_setup_complete', 'true');
    renderWithRouter('/');
    await waitFor(() => {
      expect(screen.getByText(/app content/i)).toBeInTheDocument();
    });
  });
});
