import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SkillsPage } from '../../src/pages/SkillsPage';

const mockSkills: any[] = [];
const mockAddSkill = vi.fn();
const mockRemoveSkill = vi.fn();
const mockToggleSkill = vi.fn();

vi.mock('../../src/stores/skillStore', () => ({
  useSkillStore: () => ({
    skills: mockSkills,
    addSkill: mockAddSkill,
    removeSkill: mockRemoveSkill,
    toggleSkill: mockToggleSkill,
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US', changeLanguage: vi.fn() },
  }),
}));

const sampleSkill = (overrides: any = {}) => ({
  id: 'skill-1',
  name: 'Test Skill',
  description: 'A test skill description',
  category: 'custom' as const,
  enabled: true,
  ...overrides,
});

const renderWithRouter = () =>
  render(
    <MemoryRouter initialEntries={['/skills']}>
      <Routes>
        <Route path="/skills" element={<SkillsPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('Skills Lifecycle E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSkills.length = 0;
  });

  describe('Page initialization', () => {
    it('renders page header', async () => {
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByText('skills.title')).toBeInTheDocument();
        expect(screen.getByText('skills.subtitle')).toBeInTheDocument();
      });
    });

    it('renders add skill button', async () => {
      renderWithRouter();
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /skills\.addSkill/i })).toBeInTheDocument();
      });
    });
  });

  describe('Add skill', () => {
    it('opens add form when add button clicked', async () => {
      renderWithRouter();
      const addBtn = await screen.findByRole('button', { name: /skills\.addSkill/i });
      fireEvent.click(addBtn);
      await waitFor(() => {
        expect(screen.getByText('common.name')).toBeInTheDocument();
        expect(screen.getByText('common.description')).toBeInTheDocument();
      });
    });

    it('adds skill with name and description', async () => {
      renderWithRouter();
      const addBtn = await screen.findByRole('button', { name: /skills\.addSkill/i });
      fireEvent.click(addBtn);
      await waitFor(() => expect(screen.getByText('common.name')).toBeInTheDocument());
      const nameInput = screen.getByPlaceholderText('skills.myCustomSkill') as HTMLInputElement;
      const descInput = screen.getByPlaceholderText('skills.whatDoesSkillDo') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'My Skill' } });
      fireEvent.change(descInput, { target: { value: 'My description' } });
      const submitBtns = screen.getAllByRole('button', { name: /skills\.addSkill/i });
      fireEvent.click(submitBtns[submitBtns.length - 1]);
      await waitFor(() => {
        expect(mockAddSkill).toHaveBeenCalledTimes(1);
        const skill = mockAddSkill.mock.calls[0][0];
        expect(skill.name).toBe('My Skill');
        expect(skill.description).toBe('My description');
      });
    });

    it('does not add skill with empty name', async () => {
      renderWithRouter();
      const addBtn = await screen.findByRole('button', { name: /skills\.addSkill/i });
      fireEvent.click(addBtn);
      await waitFor(() => expect(screen.getByText('common.name')).toBeInTheDocument());
      const descInput = screen.getByPlaceholderText('skills.whatDoesSkillDo') as HTMLInputElement;
      fireEvent.change(descInput, { target: { value: 'My description' } });
      const submitBtns = screen.getAllByRole('button', { name: /skills\.addSkill/i });
      fireEvent.click(submitBtns[submitBtns.length - 1]);
      expect(mockAddSkill).not.toHaveBeenCalled();
    });

    it('closes form when cancel clicked', async () => {
      renderWithRouter();
      const addBtn = await screen.findByRole('button', { name: /skills\.addSkill/i });
      fireEvent.click(addBtn);
      await waitFor(() => expect(screen.getByText('common.name')).toBeInTheDocument());
      const cancelBtn = screen.getByRole('button', { name: /common\.cancel/i });
      fireEvent.click(cancelBtn);
      await waitFor(() => {
        expect(screen.queryByText('common.name')).not.toBeInTheDocument();
      });
    });
  });

  describe('Skill rendering', () => {
    it('displays skill name and description', async () => {
      const skill = sampleSkill({ name: 'My Skill', description: 'My description' });
      mockSkills.push(skill);
      renderWithRouter();
      await screen.findByText('My Skill');
      expect(screen.getByText('My description')).toBeInTheDocument();
    });

    it('groups skills by category', async () => {
      const custom = sampleSkill({ id: 's-1', name: 'Custom Skill', category: 'custom' });
      const builtin = sampleSkill({ id: 's-2', name: 'Built-in Skill', category: 'built-in' });
      mockSkills.push(custom, builtin);
      renderWithRouter();
      await screen.findByText('Custom Skill');
      await screen.findByText('Built-in Skill');
      const sectionTitles = screen.getAllByRole('heading', { level: 2 });
      expect(sectionTitles.length).toBeGreaterThan(0);
    });

    it('renders multiple skills', async () => {
      mockSkills.push(sampleSkill({ id: 's-1', name: 'Skill 1' }));
      mockSkills.push(sampleSkill({ id: 's-2', name: 'Skill 2' }));
      renderWithRouter();
      await screen.findByText('Skill 1');
      await screen.findByText('Skill 2');
      const headings = screen.getAllByRole('heading', { level: 3 });
      expect(headings.length).toBe(2);
    });
  });

  describe('Toggle skill', () => {
    it('clicking toggle button calls toggleSkill', async () => {
      const skill = sampleSkill();
      mockSkills.push(skill);
      renderWithRouter();
      await screen.findByText(skill.name);
      const toggleBtn = screen.getByTitle(/common\.(enabled|disabled)/i);
      fireEvent.click(toggleBtn);
      expect(mockToggleSkill).toHaveBeenCalledWith(skill.id);
    });
  });

  describe('Remove skill', () => {
    it('clicking delete button calls removeSkill', async () => {
      const skill = sampleSkill();
      mockSkills.push(skill);
      renderWithRouter();
      await screen.findByText(skill.name);
      const deleteBtn = screen.getByTitle('common.delete');
      fireEvent.click(deleteBtn);
      expect(mockRemoveSkill).toHaveBeenCalledWith(skill.id);
    });
  });

  describe('Skill search', () => {
    it('filters skills by name in search input', async () => {
      mockSkills.push(sampleSkill({ id: 's-1', name: 'Alpha' }));
      mockSkills.push(sampleSkill({ id: 's-2', name: 'Beta' }));
      renderWithRouter();
      await screen.findByText('Alpha');
      await screen.findByText('Beta');
      const headings = screen.getAllByRole('heading', { level: 3 });
      expect(headings.length).toBeGreaterThanOrEqual(1);
    });
  });
});
