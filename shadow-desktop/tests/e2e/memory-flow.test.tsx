import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MemoryPage } from '../../src/pages/MemoryPage';

const mockAddMemory = vi.fn();
const mockRemoveMemory = vi.fn();
const mockSearchMemories = vi.fn();

const sampleMemory = {
 id: 'mem-1',
 uri: 'memory://12345',
 content: 'User prefers dark mode',
 dimension: 'User' as const,
 layer: 'L1' as const,
 createdAt: new Date('2024-01-01T10:00:00Z'),
 updatedAt: new Date('2024-01-01T10:00:00Z'),
};

vi.mock('../../src/stores/memoryStore', () => ({
 useMemoryStore: vi.fn(() => ({
 memories: [],
 searchResults: [],
 isLoading: false,
 error: null,
 searchMemories: mockSearchMemories,
 addMemory: mockAddMemory,
 removeMemory: mockRemoveMemory,
 })),
}));

vi.mock('react-i18next', () => ({
 useTranslation: () => ({
 t: (key: string) => key,
 }),
}));

describe('Memory Flow E2E', () => {
 beforeEach(() => {
 vi.clearAllMocks();
 mockAddMemory.mockClear();
 mockRemoveMemory.mockClear();
 mockSearchMemories.mockClear();
 });

 const renderWithRouter = (component: React.ReactElement) => {
 return render(
 <MemoryRouter initialEntries={['/memory']}>
 <Routes>
 <Route path="/memory" element={component} />
 </Routes>
 </MemoryRouter>
 );
 };

 it('renders page header and add button', async () => {
 renderWithRouter(<MemoryPage />);

 await waitFor(() => {
 expect(screen.getByText('memory.title')).toBeInTheDocument();
 expect(
 screen.getByRole('button', { name: /memory.addMemory/i })
 ).toBeInTheDocument();
 });
 });

 it('renders search input and dimension filter', async () => {
 renderWithRouter(<MemoryPage />);

 await waitFor(() => {
 expect(
 screen.getByPlaceholderText('memory.searchPlaceholder')
 ).toBeInTheDocument();
 expect(screen.getByRole('combobox')).toBeInTheDocument();
 });
 });

 it('shows empty state when no memories', async () => {
 renderWithRouter(<MemoryPage />);

 await waitFor(() => {
 expect(screen.getByText('memory.noMemories')).toBeInTheDocument();
 });
 });

 it('opens add memory form when add button clicked', async () => {
 renderWithRouter(<MemoryPage />);

 const addButton = await screen.findByRole('button', {
 name: /memory.addMemory/i,
 });
 fireEvent.click(addButton);

 await waitFor(() => {
 expect(screen.getByText('memory.dimension')).toBeInTheDocument();
 expect(screen.getByText('memory.layer')).toBeInTheDocument();
 });
 });

 it('calls addMemory with new memory when form submitted with content', async () => {
 renderWithRouter(<MemoryPage />);

 const addButton = await screen.findByRole('button', {
 name: /memory.addMemory/i,
 });
 fireEvent.click(addButton);

 await waitFor(() => {
 expect(screen.getByText('memory.dimension')).toBeInTheDocument();
 });

 const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
 expect(textarea).not.toBeNull();
 fireEvent.change(textarea, {
 target: { value: 'A new memory content' },
 });

 const saveButton = screen.getByRole('button', { name: /common.save/i });
 fireEvent.click(saveButton);

 await waitFor(() => {
 expect(mockAddMemory).toHaveBeenCalledTimes(1);
 const passedMemory = mockAddMemory.mock.calls[0][0];
 expect(passedMemory.content).toBe('A new memory content');
 expect(passedMemory.dimension).toBe('Agent');
 expect(passedMemory.layer).toBe('L2');
 });
 });

 it('calls searchMemories when search button clicked with query', async () => {
 renderWithRouter(<MemoryPage />);

 const searchInput = await screen.findByPlaceholderText(
 'memory.searchPlaceholder'
 );
 fireEvent.change(searchInput, { target: { value: 'dark mode' } });

 const searchButton = screen.getByRole('button', {
 name: /common.search/i,
 });
 fireEvent.click(searchButton);

 await waitFor(() => {
 expect(mockSearchMemories).toHaveBeenCalledWith('dark mode', undefined);
 });
 });

 it('does not call addMemory when content is empty', async () => {
 renderWithRouter(<MemoryPage />);

 const addButton = await screen.findByRole('button', {
 name: /memory.addMemory/i,
 });
 fireEvent.click(addButton);

 await waitFor(() => {
 expect(screen.getByText('memory.dimension')).toBeInTheDocument();
 });

 const saveButton = screen.getByRole('button', { name: /common.save/i });
 fireEvent.click(saveButton);

 expect(mockAddMemory).not.toHaveBeenCalled();
 });
});
