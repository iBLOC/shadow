import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SkillsPage } from '../../src/pages/SkillsPage';

const mockAddSkill = vi.fn();
const mockRemoveSkill = vi.fn();
const mockToggleSkill = vi.fn();

const sampleSkill = {
 id: 'skill-1',
 name: 'Web Search',
 description: 'Search the web for current information',
 category: 'custom' as const,
 enabled: true,
};

vi.mock('../../src/stores/skillStore', () => ({
 useSkillStore: vi.fn(() => ({
 skills: [],
 addSkill: mockAddSkill,
 removeSkill: mockRemoveSkill,
 toggleSkill: mockToggleSkill,
 })),
}));

vi.mock('react-i18next', () => ({
 useTranslation: () => ({
 t: (key: string) => key,
 }),
}));

describe('Skills Flow E2E', () => {
 beforeEach(() => {
 vi.clearAllMocks();
 mockAddSkill.mockClear();
 mockRemoveSkill.mockClear();
 mockToggleSkill.mockClear();
 });

 const renderWithRouter = (component: React.ReactElement) => {
 return render(
 <MemoryRouter initialEntries={['/skills']}>
 <Routes>
 <Route path="/skills" element={component} />
 </Routes>
 </MemoryRouter>
 );
 };

 it('renders page header and add button', async () => {
 renderWithRouter(<SkillsPage />);

 await waitFor(() => {
 expect(screen.getByText('skills.title')).toBeInTheDocument();
 expect(
 screen.getByRole('button', { name: /skills.addSkill/i })
 ).toBeInTheDocument();
 });
 });

 it('opens add skill form when add button clicked', async () => {
 renderWithRouter(<SkillsPage />);

 const addButtons = await screen.findAllByRole('button', {
 name: /skills.addSkill/i,
 });
 fireEvent.click(addButtons[0]);

 await waitFor(() => {
 expect(screen.getByText('common.name')).toBeInTheDocument();
 expect(screen.getByText('common.description')).toBeInTheDocument();
 });
 });

 it('calls addSkill when form submitted with name and description', async () => {
 renderWithRouter(<SkillsPage />);

 const addButtons = await screen.findAllByRole('button', {
 name: /skills.addSkill/i,
 });
 fireEvent.click(addButtons[0]);

 await waitFor(() => {
 expect(screen.getByText('common.name')).toBeInTheDocument();
 });

 const nameInput = screen.getByPlaceholderText(
 'skills.myCustomSkill'
 ) as HTMLInputElement;
 fireEvent.change(nameInput, { target: { value: 'Code Review' } });

 const descriptionTextarea = screen.getByPlaceholderText(
 'skills.whatDoesSkillDo'
 ) as HTMLTextAreaElement;
 fireEvent.change(descriptionTextarea, {
 target: { value: 'Reviews pull requests' },
 });

 const submitButtons = screen.getAllByRole('button', {
 name: /skills.addSkill/i,
 });
 const submitButton = submitButtons[submitButtons.length -1];
 fireEvent.click(submitButton);

 await waitFor(() => {
 expect(mockAddSkill).toHaveBeenCalledTimes(1);
 const passed = mockAddSkill.mock.calls[0][0];
 expect(passed.name).toBe('Code Review');
 expect(passed.description).toBe('Reviews pull requests');
 expect(passed.category).toBe('custom');
 expect(passed.enabled).toBe(true);
 });
 });

 it('does not call addSkill when name is missing', async () => {
 renderWithRouter(<SkillsPage />);

 const addButtons = await screen.findAllByRole('button', {
 name: /skills.addSkill/i,
 });
 fireEvent.click(addButtons[0]);

 await waitFor(() => {
 expect(screen.getByText('common.name')).toBeInTheDocument();
 });

 const descriptionTextarea = screen.getByPlaceholderText(
 'skills.whatDoesSkillDo'
 ) as HTMLTextAreaElement;
 fireEvent.change(descriptionTextarea, {
 target: { value: 'Reviews pull requests' },
 });

 const submitButtons = screen.getAllByRole('button', {
 name: /skills.addSkill/i,
 });
 const submitButton = submitButtons[submitButtons.length -1];
 fireEvent.click(submitButton);

 expect(mockAddSkill).not.toHaveBeenCalled();
 });

 it('does not call addSkill when description is missing', async () => {
 renderWithRouter(<SkillsPage />);

 const addButtons = await screen.findAllByRole('button', {
 name: /skills.addSkill/i,
 });
 fireEvent.click(addButtons[0]);

 await waitFor(() => {
 expect(screen.getByText('common.name')).toBeInTheDocument();
 });

 const nameInput = screen.getByPlaceholderText(
 'skills.myCustomSkill'
 ) as HTMLInputElement;
 fireEvent.change(nameInput, { target: { value: 'Code Review' } });

 const submitButtons = screen.getAllByRole('button', {
 name: /skills.addSkill/i,
 });
 const submitButton = submitButtons[submitButtons.length -1];
 fireEvent.click(submitButton);

 expect(mockAddSkill).not.toHaveBeenCalled();
 });

 it('renders page without crashing when no skills', async () => {
 const { container } = renderWithRouter(<SkillsPage />);
 await waitFor(() => {
 expect(container.querySelector('.page')).toBeInTheDocument();
 });
 });
});
