import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SkillsPage } from '../../src/pages/SkillsPage';

vi.mock('../../src/stores/skillStore', () => ({
  useSkillStore: vi.fn(() => ({
    skills: [],
    addSkill: vi.fn(),
    removeSkill: vi.fn(),
    toggleSkill: vi.fn(),
  })),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('SkillsPage', () => {
  const renderWithRouter = (component: React.ReactElement) => {
    return render(
      <MemoryRouter initialEntries={['/skills']}>
        <Routes>
          <Route path="/skills" element={component} />
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders page header', async () => {
    renderWithRouter(<SkillsPage />);
    
    await waitFor(() => {
      expect(screen.getByText('skills.title')).toBeInTheDocument();
    });
  });

  it('renders add skill button', async () => {
    renderWithRouter(<SkillsPage />);
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /skills.addSkill/i })).toBeInTheDocument();
    });
  });

  it('shows empty state when no skills', async () => {
    renderWithRouter(<SkillsPage />);
    
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /skills.title/i })).toBeInTheDocument();
    });
  });

  it('shows add form when button clicked', async () => {
    const { container } = renderWithRouter(<SkillsPage />);

    await waitFor(async () => {
      const addBtn = screen.getByRole('button', { name: /skills\.addSkill/i });
      fireEvent.click(addBtn);
    });

    await waitFor(() => {
      const formElements = container.querySelectorAll('input[placeholder="skills.myCustomSkill"]');
      expect(formElements.length).toBeGreaterThan(0);
    });
  });
});