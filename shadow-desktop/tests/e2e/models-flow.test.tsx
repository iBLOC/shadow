import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ModelsPage } from '../../src/pages/ModelsPage';

const providersResponse = [
 {
 id: 'provider-1',
 name: 'OpenAI',
 provider_type: 'openai',
 api_base: 'https://api.openai.com/v1',
 models: [
 {
 id: 'm1',
 name: 'GPT-4o',
 model_id: 'gpt-4o',
 model_type: 'chat',
 supports_vision: true,
 supports_function_calling: true,
 is_default: true,
 },
 ],
 },
];

global.fetch = vi.fn() as any;

vi.mock('react-i18next', () => ({
 useTranslation: () => ({
 t: (key: string, options?: Record<string, unknown>) => {
 if (options && typeof options.count === 'number') {
 return `${key}:${options.count}`;
 }
 return key;
 },
 }),
}));

describe('Models Flow E2E', () => {
 beforeEach(() => {
 vi.clearAllMocks();
 });

 const renderWithRouter = (component: React.ReactElement) => {
 return render(
 <MemoryRouter initialEntries={['/models']}>
 <Routes>
 <Route path="/models" element={component} />
 </Routes>
 </MemoryRouter>
 );
 };

 const mockFetchSuccess = (body: unknown) => {
 (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
 ok: true,
 json: () => Promise.resolve(body),
 } as Response);
 };

 it('fetches providers on mount from /models/providers', async () => {
 mockFetchSuccess([]);
 renderWithRouter(<ModelsPage />);

 await waitFor(() => {
 expect(global.fetch).toHaveBeenCalledWith(
 'http://localhost:8082/models/providers'
 );
 });
 });

 it('renders add provider button', async () => {
 mockFetchSuccess([]);
 renderWithRouter(<ModelsPage />);

 await waitFor(() => {
 expect(
 screen.getByRole('button', { name: /models.addProvider/i })
 ).toBeInTheDocument();
 });
 });

 it('shows empty state when no providers returned', async () => {
 mockFetchSuccess([]);
 renderWithRouter(<ModelsPage />);

 await waitFor(() => {
 expect(screen.getByText('models.noProviders')).toBeInTheDocument();
 });
 });

 it('renders provider card with name and type when providers loaded', async () => {
 mockFetchSuccess(providersResponse);
 renderWithRouter(<ModelsPage />);

 await waitFor(() => {
 expect(screen.getByText('OpenAI')).toBeInTheDocument();
 expect(screen.getByText('openai')).toBeInTheDocument();
 });
 });

 it('expands provider card to show model details on click', async () => {
 mockFetchSuccess(providersResponse);
 renderWithRouter(<ModelsPage />);

 await waitFor(() => {
 expect(screen.getByText('OpenAI')).toBeInTheDocument();
 });

 const providerHeader = screen.getByText('OpenAI').closest('.provider-header');
 expect(providerHeader).not.toBeNull();
 fireEvent.click(providerHeader!);

 await waitFor(() => {
 expect(screen.getByText('GPT-4o')).toBeInTheDocument();
 expect(screen.getByText('gpt-4o')).toBeInTheDocument();
 });
 });

 it('calls test connection endpoint when test button clicked', async () => {
 mockFetchSuccess(providersResponse);
 renderWithRouter(<ModelsPage />);

 await waitFor(() => {
 expect(screen.getByText('OpenAI')).toBeInTheDocument();
 });

 const providerHeader = screen.getByText('OpenAI').closest('.provider-header');
 fireEvent.click(providerHeader!);

 await waitFor(() => {
 expect(screen.getByText('GPT-4o')).toBeInTheDocument();
 });

 const testButton = screen.getByRole('button', {
 name: /models.testConnection/i,
 });
 fireEvent.click(testButton);

 await waitFor(() => {
 expect(global.fetch).toHaveBeenCalledWith(
 'http://localhost:8082/models/providers/provider-1/test',
 expect.objectContaining({ method: 'POST' })
 );
 });
 });
});
