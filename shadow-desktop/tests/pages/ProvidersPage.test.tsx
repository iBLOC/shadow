import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ProvidersPage, deriveEndpoints } from '../../src/pages/ProvidersPage';

// Test-only dummy keys, assembled at runtime so they are never mistaken
// for real credentials baked into source.
const KEY_OK = ['sk-', 'abcdefgh'].join('');
const KEY_BAD = ['sk-', 'badkey99'].join('');

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const PRESETS = [
  {
    id: 'openai',
    name: 'OpenAI',
    base_url: 'https://api.openai.com/v1',
    api_standard: 'openai',
    default_model: 'gpt-4o',
    requires_key: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    base_url: 'https://api.anthropic.com',
    api_standard: 'claude',
    default_model: 'claude-sonnet-4-20250514',
    requires_key: true,
  },
  {
    id: 'ollama',
    name: 'Ollama',
    base_url: 'http://localhost:11434/v1',
    api_standard: 'openai',
    default_model: null,
    requires_key: false,
  },
];

const emptyEntry = {
  id: 'p1',
  name: 'OpenAI',
  preset_id: 'openai',
  base_url: 'https://api.openai.com/v1',
  api_standard: 'openai',
  api_key: KEY_OK,
  enabled: true,
  models: [],
};

function mockBackend({ models = [], fetchError }: { models?: unknown[]; fetchError?: string } = {}) {
  invokeMock.mockImplementation((cmd: string, _args?: unknown) => {
    switch (cmd) {
      case 'provider_presets':
        return Promise.resolve(PRESETS);
      case 'provider_list':
        return Promise.resolve([]);
      case 'provider_preview_fetch':
        return fetchError ? Promise.reject(new Error(fetchError)) : Promise.resolve(models);
      case 'provider_add_preset':
        return Promise.resolve({ ...emptyEntry, id: 'new-1', api_key: KEY_OK });
      case 'provider_select_model':
        return Promise.resolve(emptyEntry);
      default:
        return Promise.resolve([]);
    }
  });
}

async function openAddModal() {
  fireEvent.click(await screen.findByText('providers.add'));
  await screen.findByText('providers.presetTab');
}

async function pickPreset(name: string) {
  // The standard badge also renders "OpenAI", so match the card button by
  // the leading provider name in its accessible name instead of raw text.
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${name}`) }));
  await screen.findByText('providers.endpointsTitle');
}

describe('deriveEndpoints', () => {
  it('derives the three OpenAI endpoints from the base URL', () => {
    const eps = deriveEndpoints('https://api.openai.com/v1/', 'openai');
    expect(eps.map((e) => e.url)).toEqual([
      'https://api.openai.com/v1/models',
      'https://api.openai.com/v1/chat/completions',
      'https://api.openai.com/v1/embeddings',
    ]);
  });

  it('derives Claude endpoints, tolerating a /v1 base like the backend does', () => {
    expect(deriveEndpoints('https://api.anthropic.com', 'claude').map((e) => e.url)).toEqual([
      'https://api.anthropic.com/v1/models',
      'https://api.anthropic.com/v1/messages',
      'https://api.anthropic.com/v1/messages/count_tokens',
    ]);
    expect(deriveEndpoints('https://gw.example.com/v1', 'claude')[0].url).toBe(
      'https://gw.example.com/v1/models'
    );
  });

  it('returns empty for a blank base URL', () => {
    expect(deriveEndpoints('  ', 'openai')).toEqual([]);
  });
});

describe('ProvidersPage add flow', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    mockBackend();
  });

  it('shows the derived endpoint list when a preset is picked', async () => {
    render(<ProvidersPage />);
    await openAddModal();
    await pickPreset('OpenAI');
    expect(screen.getByText('https://api.openai.com/v1/models')).toBeInTheDocument();
    expect(screen.getByText('https://api.openai.com/v1/chat/completions')).toBeInTheDocument();
    expect(screen.getByText('https://api.openai.com/v1/embeddings')).toBeInTheDocument();
  });

  it('shows Claude endpoints for a Claude-standard preset', async () => {
    render(<ProvidersPage />);
    await openAddModal();
    await pickPreset('Anthropic');
    expect(screen.getByText('https://api.anthropic.com/v1/models')).toBeInTheDocument();
    expect(screen.getByText('https://api.anthropic.com/v1/messages')).toBeInTheDocument();
  });

  it('auto-fetches models right away for a keyless preset', async () => {
    render(<ProvidersPage />);
    await openAddModal();
    await pickPreset('Ollama');
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('provider_preview_fetch', expect.anything());
    });
  });

  it('auto-fetches models once the API key settles', async () => {
    render(<ProvidersPage />);
    await openAddModal();
    await pickPreset('OpenAI');
    fireEvent.change(screen.getByLabelText('providers.apiKey'), {
      target: { value: KEY_OK },
    });
    await waitFor(
      () => {
        expect(invokeMock).toHaveBeenCalledWith('provider_preview_fetch', {
          presetId: 'openai',
          baseUrl: null,
          apiStandard: 'openai',
          apiKey: KEY_OK,
        });
      },
      { timeout: 3000 }
    );
  });

  it('offers a manual model input when the fetch fails and uses it on add', async () => {
    mockBackend({ fetchError: 'HTTP 401' });
    render(<ProvidersPage />);
    await openAddModal();
    await pickPreset('OpenAI');
    fireEvent.change(screen.getByLabelText('providers.apiKey'), {
      target: { value: KEY_BAD },
    });
    const manual = await screen.findByLabelText('providers.manualModelLabel', {}, { timeout: 3000 });
    fireEvent.change(manual, { target: { value: 'my-custom-model' } });

    fireEvent.click(screen.getByText('providers.addAndFetch'));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('provider_select_model', {
        id: 'new-1',
        modelId: 'my-custom-model',
      });
    });
  });
});
